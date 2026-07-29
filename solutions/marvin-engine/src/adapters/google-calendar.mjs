import { MARVIN_MIRROR_MARKER } from "../core/policy.mjs";
import { getTokenRecord, isTokenRecordUsable } from "../util/token-state.mjs";
import { refreshProviderToken } from "../util/oauth-refresh.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(email) {
  return encodeURIComponent(normalizeString(email));
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
    const tokenState = this.config.tokenState || { records: [] };
    const usable = (tokenState.records || []).filter((record) => record.provider === "google" && isTokenRecordUsable(record)).length;
    return {
      provider: "google",
      status: usable > 0 ? "token-ready" : "token-missing",
      notes: usable > 0
        ? "Google Calendar token records exist. Marvin can attempt live read/write calls for connected calendars."
        : "No usable Google Calendar tokens found yet. Complete Marvin auth and token exchange first."
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

  async listSourceEvents(calendar, options = {}) {
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      return [];
    }
    const params = new URLSearchParams({
      timeMin: new Date(options.windowStart).toISOString(),
      timeMax: new Date(options.windowEnd).toISOString(),
      singleEvents: "true",
      showDeleted: "false",
      orderBy: "startTime",
      privateExtendedProperty: "projectMarvinManaged=true"
    });
    params.delete("privateExtendedProperty");
    const url = `https://www.googleapis.com/calendar/v3/calendars/${normalizeEmail(calendar.email)}/events?${params.toString()}`;
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Google Calendar events.list failed with HTTP ${response.status}.`);
    }
    const events = Array.isArray(payload?.items) ? payload.items : [];
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
      sourceProvider: "google"
    })).filter((event) => event.id && event.start && event.end);
  }

  buildGooglePayload(operation) {
    const payload = operation.payload;
    return {
      summary: payload.subject,
      visibility: payload.visibility === "private" ? "private" : "default",
      description: buildMarvinDescription(payload),
      location: payload.location || undefined,
      extendedProperties: {
        private: buildMarvinPrivateProperties(payload)
      },
      start: {
        dateTime: payload.start,
        timeZone: payload.sourceEventTimezone || "UTC"
      },
      end: {
        dateTime: payload.end,
        timeZone: payload.sourceEventTimezone || "UTC"
      }
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
