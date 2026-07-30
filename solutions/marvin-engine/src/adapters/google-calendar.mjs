import { MARVIN_MIRROR_MARKER } from "../core/policy.mjs";
import { getTokenRecord, hasTokenRecordMaterial, isTokenRecordUsable } from "../util/token-state.mjs";
import { refreshProviderToken } from "../util/oauth-refresh.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(email) {
  return encodeURIComponent(normalizeString(email));
}

function toIsoFromEpochMs(value, fallback = "") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return normalizeString(fallback);
  }
  return new Date(parsed).toISOString();
}

function buildMarvinPrivateProperties(payload = {}) {
  const mirror = payload.marvinMirror || {};
  return {
    projectMarvinManaged: "true",
    projectMarvinMarker: mirror.marker || MARVIN_MIRROR_MARKER,
    projectMarvinSourceCalendarId: normalizeString(mirror.sourceCalendarId),
    projectMarvinSourceEventId: normalizeString(mirror.sourceEventId),
    projectMarvinTargetCalendarId: normalizeString(mirror.targetCalendarId)
  };
}

function hasMarvinMarker(event = {}) {
  const props = event?.extendedProperties?.private || {};
  if (normalizeString(props.projectMarvinManaged).toLowerCase() === "true") {
    return true;
  }
  return normalizeString(event.description).includes(MARVIN_MIRROR_MARKER);
}

function buildMarvinDescription(payload = {}) {
  const detail = normalizeString(payload.description || payload.subject || "Busy");
  const mirror = payload.marvinMirror || {};
  const lines = [
    detail,
    "",
    MARVIN_MIRROR_MARKER,
    `Source Calendar: ${normalizeString(mirror.sourceCalendarLabel || payload.sourceCalendarId)}`,
    `Source Event: ${normalizeString(mirror.sourceEventId)}`
  ].filter((line, index, list) => line || index === 1 || index === list.length - 1);
  return lines.join("\n").trim();
}

export class GoogleCalendarAdapter {
  constructor(config = {}) {
    this.config = config;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  describe() {
    const calendars = Array.isArray(this.config.profile?.calendars)
      ? this.config.profile.calendars.filter((calendar) => calendar.provider === "google")
      : [];
    const ready = calendars.filter((calendar) => this.hasCalendarAuthMaterial(calendar)).length;
    return {
      provider: "google",
      status: ready > 0 ? "token-ready" : "token-missing",
      notes: ready > 0
        ? "Google Calendar auth material exists. Marvin can attempt live read/write calls for connected calendars with valid Marvin auth state."
        : "No usable Google Calendar auth material found yet. Complete Marvin auth and token exchange first."
    };
  }

  planWrite(operation) {
    const tokenRecord = getTokenRecord(this.config.tokenState, operation.target.id);
    return {
      adapter: "google-calendar",
      action: "upsert-private-blocker",
      targetCalendar: operation.target.label,
      ready: isTokenRecordUsable(tokenRecord),
      payload: operation.payload
    };
  }

  getTokenRecord(calendarId) {
    return getTokenRecord(this.config.tokenState, calendarId);
  }

  hasCalendarAuthMaterial(calendar) {
    const currentRecord = this.getTokenRecord(calendar.id);
    if (isTokenRecordUsable(currentRecord)) {
      return true;
    }
    if (!hasTokenRecordMaterial(currentRecord)) {
      return false;
    }
    const runtime = this.config.profile?.runtime?.providerConnections?.google || {};
    const clientId = normalizeString(runtime.clientId);
    const clientSecret = normalizeString(this.config.providerSecrets?.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || process.env.MARVIN_GOOGLE_CLIENT_SECRET);
    return Boolean(clientId && clientSecret && normalizeString(currentRecord?.refreshToken));
  }

  async updateTokenRecord(calendar, nextRecord) {
    const records = Array.isArray(this.config.tokenState?.records) ? this.config.tokenState.records.slice() : [];
    const index = records.findIndex((item) => item.calendarId === calendar.id);
    const merged = { ...records[index] || { calendarId: calendar.id, provider: calendar.provider, email: calendar.email }, ...nextRecord, calendarId: calendar.id, provider: calendar.provider, email: calendar.email };
    if (!this.config.tokenState) {
      this.config.tokenState = { records: [] };
    }
    if (index >= 0) {
      records[index] = merged;
    } else {
      records.push(merged);
    }
    this.config.tokenState.records = records;
    if (typeof this.config.onTokenStateChange === "function") {
      await this.config.onTokenStateChange({ records });
    }
    return merged;
  }

  async ensureUsableToken(calendar) {
    const currentRecord = this.getTokenRecord(calendar.id);
    if (isTokenRecordUsable(currentRecord)) {
      return currentRecord;
    }
    const refreshed = await refreshProviderToken({
      provider: "google",
      calendar,
      profile: this.config.profile,
      providerSecrets: this.config.providerSecrets,
      currentRecord,
      fetchImpl: this.fetchImpl
    });
    if (!refreshed.ok) {
      await this.updateTokenRecord(calendar, {
        status: "error",
        lastError: refreshed.message || "Google token refresh failed."
      });
      return null;
    }
    return this.updateTokenRecord(calendar, refreshed.tokenRecord);
  }

  async stopCalendarWebhookSubscription(calendar, existingRecord = null) {
    if (!normalizeString(existingRecord?.channelId) || !normalizeString(existingRecord?.resourceId)) {
      return { ok: true, stopped: false };
    }
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      return { ok: false, reason: "token-not-usable", message: `Google token is not usable for ${calendar.label}.` };
    }
    const response = await this.fetchImpl("https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: existingRecord.channelId,
        resourceId: existingRecord.resourceId
      })
    });
    if (!response.ok && response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      return {
        ok: false,
        reason: "google-channel-stop-failed",
        message: payload?.error?.message || `Google channel stop failed with HTTP ${response.status}.`
      };
    }
    return { ok: true, stopped: true };
  }

  async ensureCalendarWebhookSubscription(calendar, existingRecord = null, options = {}) {
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      return {
        ok: false,
        reason: "token-not-usable",
        message: `Google token is not usable for ${calendar.label}.`
      };
    }

    if (normalizeString(existingRecord?.channelId) && normalizeString(existingRecord?.resourceId)) {
      const stopResult = await this.stopCalendarWebhookSubscription(calendar, existingRecord);
      if (!stopResult.ok) {
        return stopResult;
      }
    }

    const response = await this.fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${normalizeEmail(calendar.email)}/events/watch`, {
      method: "POST",
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: options.channelId,
        type: "web_hook",
        address: options.notificationUrl,
        token: options.clientState,
        params: {
          ttl: String(Number(options.ttlSeconds || 60 * 60 * 24))
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        reason: "google-watch-failed",
        message: payload?.error?.message || `Google Calendar watch request failed with HTTP ${response.status}.`
      };
    }

    const checkedAt = new Date(options.nowMs || Date.now()).toISOString();
    return {
      ok: true,
      subscription: {
        calendarId: calendar.id,
        provider: "google",
        subscriptionId: normalizeString(payload.id || options.channelId),
        channelId: normalizeString(payload.id || options.channelId),
        resourceId: normalizeString(payload.resourceId),
        resourceUri: normalizeString(payload.resourceUri),
        resource: normalizeString(existingRecord?.resource || `/calendars/${calendar.email}/events`),
        notificationUrl: normalizeString(payload.address || options.notificationUrl),
        clientState: normalizeString(payload.token || options.clientState),
        changeType: "created,updated,deleted",
        expiresAt: toIsoFromEpochMs(payload.expiration, options.expiresAt),
        status: "active",
        createdAt: normalizeString(existingRecord?.createdAt || checkedAt),
        lastRenewedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastError: "",
        updatedAt: checkedAt
      }
    };
  }

  async listSourceEvents(calendar, options = {}) {
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) return [];

    const params = new URLSearchParams({
      timeMin: new Date(options.windowStart).toISOString(),
      timeMax: new Date(options.windowEnd).toISOString(),
      singleEvents: "true",
      showDeleted: "false",
      orderBy: "startTime"
    });
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${normalizeEmail(calendar.email)}/events`;
    const events = [];
    let pageToken = "";
    const seenPageTokens = new Set();

    do {
      const requestParams = new URLSearchParams(params);
      if (pageToken) requestParams.set("pageToken", pageToken);
      const response = await this.fetchImpl(`${baseUrl}?${requestParams.toString()}`, {
        headers: { Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Google Calendar events.list failed with HTTP ${response.status}.`);
      events.push(...(Array.isArray(payload?.items) ? payload.items : []));
      pageToken = normalizeString(payload?.nextPageToken);
    } while (pageToken && !seenPageTokens.has(pageToken) && (seenPageTokens.add(pageToken) || true));

    return events.map((event) => ({
      id: normalizeString(event.id),
      calendarId: calendar.id,
      subject: normalizeString(event.summary || "Busy"),
      start: normalizeString(event?.start?.dateTime || event?.start?.date || ""),
      end: normalizeString(event?.end?.dateTime || event?.end?.date || ""),
      timezone: normalizeString(event?.start?.timeZone || options.timezone || "UTC"),
      location: normalizeString(event.location || ""),
      description: normalizeString(event.description || ""),
      status: normalizeString(event.status || "confirmed"),
      mirroredByMarvin: hasMarvinMarker(event),
      allDay: Boolean(event?.start?.date && !event?.start?.dateTime),
      sourceProvider: "google"
    })).filter((event) => event.id && event.start && event.end);
  }
  buildGooglePayload(operation) {
    const payload = operation.payload;
    const allDay = Boolean(payload.allDay);
    const dateOnly = (value) => normalizeString(value).slice(0, 10);
    return {
      summary: payload.subject,
      visibility: payload.visibility === "private" ? "private" : "default",
      description: buildMarvinDescription(payload),
      location: payload.location || undefined,
      extendedProperties: {
        private: buildMarvinPrivateProperties(payload)
      },
      start: allDay
        ? { date: dateOnly(payload.start) }
        : { dateTime: payload.start, timeZone: payload.sourceEventTimezone || "UTC" },
      end: allDay
        ? { date: dateOnly(payload.end) }
        : { dateTime: payload.end, timeZone: payload.sourceEventTimezone || "UTC" }
    };
  }

  async upsertEvent(operation, context = {}) {
    const tokenRecord = await this.ensureUsableToken(operation.target);
    if (!isTokenRecordUsable(tokenRecord)) {
      throw new Error(`Google token is not usable for ${operation.target.label}.`);
    }
    const existingMapping = context.existingMapping || null;
    const method = existingMapping?.targetEventId ? "PUT" : "POST";
    const url = existingMapping?.targetEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${normalizeEmail(operation.target.email)}/events/${encodeURIComponent(existingMapping.targetEventId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${normalizeEmail(operation.target.email)}/events`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(this.buildGooglePayload(operation))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Google Calendar write failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId: normalizeString(payload?.id || existingMapping?.targetEventId),
      status: existingMapping?.targetEventId ? "updated" : "created"
    };
  }

  async deleteEvent(targetCalendar, targetEventId) {
    const tokenRecord = await this.ensureUsableToken(targetCalendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      throw new Error(`Google token is not usable for ${targetCalendar.label}.`);
    }
    const url = `https://www.googleapis.com/calendar/v3/calendars/${normalizeEmail(targetCalendar.email)}/events/${encodeURIComponent(targetEventId)}`;
    const response = await this.fetchImpl(url, {
      method: "DELETE",
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`
      }
    });
    if (!response.ok && response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error?.message || `Google Calendar delete failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId,
      status: response.status === 404 ? "already-missing" : "deleted"
    };
  }
}
