import { MARVIN_MIRROR_MARKER } from "../core/policy.mjs";
import { getTokenRecord, hasTokenRecordMaterial, isTokenRecordUsable } from "../util/token-state.mjs";
import { refreshProviderToken } from "../util/oauth-refresh.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

const WINDOWS_TIMEZONE_TO_IANA = {
  UTC: "UTC",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland"
};

function hasExplicitOffset(value) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalizeString(value));
}

function getFormatterParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function isSupportedTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeTimeZoneName(timeZone) {
  const normalized = normalizeString(timeZone);
  if (!normalized) {
    return "UTC";
  }
  const mapped = WINDOWS_TIMEZONE_TO_IANA[normalized] || normalized;
  return isSupportedTimeZone(mapped) ? mapped : "UTC";
}

function getTimeZoneOffsetMs(instantMs, timeZone) {
  const parts = getFormatterParts(new Date(instantMs), timeZone);
  const utcEquivalent = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return utcEquivalent - Math.floor(instantMs / 1000) * 1000;
}

function convertWallTimeToUtcIso(dateTime, timeZone) {
  const match = normalizeString(dateTime).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) {
    const parsed = new Date(dateTime);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");
  const millisecond = Number((match[7] || "0").padEnd(3, "0"));
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let instant = wallClockAsUtc - getTimeZoneOffsetMs(wallClockAsUtc, timeZone);
  instant = wallClockAsUtc - getTimeZoneOffsetMs(instant, timeZone);
  return new Date(instant).toISOString();
}

function normalizeGraphEventDateTime(dateTime, timeZone) {
  const normalizedDateTime = normalizeString(dateTime);
  if (!normalizedDateTime) {
    return "";
  }
  if (hasExplicitOffset(normalizedDateTime)) {
    const parsed = new Date(normalizedDateTime);
    return Number.isNaN(parsed.getTime()) ? normalizedDateTime : parsed.toISOString();
  }
  const normalizedTimeZone = normalizeTimeZoneName(timeZone);
  if (normalizedTimeZone === "UTC") {
    const parsed = new Date(normalizedDateTime + "Z");
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  return convertWallTimeToUtcIso(normalizedDateTime, normalizedTimeZone);
}

function toIsoUtc(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatDateTimeInZone(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: normalizeString(timeZone || "UTC") || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizeEmail(email) {
  return encodeURIComponent(normalizeString(email));
}

function readBodyContent(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  return normalizeString(body.content || body.Content || "");
}

function hasMarvinMarker(event = {}) {
  const categories = Array.isArray(event.categories) ? event.categories.map((item) => normalizeString(item)) : [];
  if (categories.includes(MARVIN_MIRROR_MARKER)) {
    return true;
  }
  return readBodyContent(event.body).includes(MARVIN_MIRROR_MARKER) || normalizeString(event.bodyPreview).includes(MARVIN_MIRROR_MARKER);
}

function buildMarvinBody(payload = {}) {
  const detail = normalizeString(payload.description || payload.subject || "Busy");
  const mirror = payload.marvinMirror || {};
  return [
    detail,
    "",
    MARVIN_MIRROR_MARKER,
    `Source Calendar: ${normalizeString(mirror.sourceCalendarLabel || payload.sourceCalendarId)}`,
    `Source Event: ${normalizeString(mirror.sourceEventId)}`
  ].join("\n").trim();
}

export class MicrosoftGraphAdapter {
  constructor(config = {}) {
    this.config = config;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  describe() {
    const calendars = Array.isArray(this.config.profile?.calendars)
      ? this.config.profile.calendars.filter((calendar) => calendar.provider === "m365" || calendar.provider === "outlook")
      : [];
    const ready = calendars.filter((calendar) => this.hasCalendarAuthMaterial(calendar)).length;
    return {
      provider: "m365",
      status: ready > 0 ? "token-ready" : "token-missing",
      notes: ready > 0
        ? "Microsoft Graph auth material exists. Marvin can attempt live read/write calls for connected calendars with valid Marvin auth state."
        : "No usable Microsoft Graph auth material found yet. Complete Marvin auth and token exchange first."
    };
  }

  planWrite(operation) {
    const tokenRecord = getTokenRecord(this.config.tokenState, operation.target.id);
    return {
      adapter: "microsoft-graph",
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
    const runtime = this.config.profile?.runtime?.providerConnections?.microsoft || {};
    const clientId = normalizeString(runtime.clientId);
    const clientSecret = normalizeString(this.config.providerSecrets?.microsoftClientSecret || process.env.MICROSOFT_CLIENT_SECRET || process.env.MARVIN_MICROSOFT_CLIENT_SECRET);
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
      provider: "microsoft",
      calendar,
      profile: this.config.profile,
      providerSecrets: this.config.providerSecrets,
      currentRecord,
      fetchImpl: this.fetchImpl
    });
    if (!refreshed.ok) {
      await this.updateTokenRecord(calendar, {
        status: "error",
        lastError: refreshed.message || "Microsoft token refresh failed."
      });
      return null;
    }
    return this.updateTokenRecord(calendar, refreshed.tokenRecord);
  }

  async ensureCalendarWebhookSubscription(calendar, existingRecord = null, options = {}) {
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      return {
        ok: false,
        reason: "token-not-usable",
        message: `Microsoft token is not usable for ${calendar.label}.`
      };
    }

    const resource = normalizeString(existingRecord?.resource || `/users/${calendar.email}/events`);
    const method = normalizeString(existingRecord?.subscriptionId) ? "PATCH" : "POST";
    const url = method === "PATCH"
      ? `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(existingRecord.subscriptionId)}`
      : "https://graph.microsoft.com/v1.0/subscriptions";
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        changeType: "created,updated,deleted",
        notificationUrl: options.notificationUrl,
        resource,
        expirationDateTime: options.expiresAt,
        clientState: options.clientState
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        reason: "graph-subscription-failed",
        message: payload?.error?.message || `Microsoft Graph subscription request failed with HTTP ${response.status}.`
      };
    }

    const checkedAt = new Date(options.nowMs || Date.now()).toISOString();
    return {
      ok: true,
      subscription: {
        calendarId: calendar.id,
        provider: "microsoft",
        subscriptionId: normalizeString(payload.id || existingRecord?.subscriptionId),
        resource: normalizeString(payload.resource || resource),
        notificationUrl: normalizeString(payload.notificationUrl || options.notificationUrl),
        clientState: normalizeString(payload.clientState || options.clientState),
        changeType: normalizeString(payload.changeType || "created,updated,deleted"),
        expiresAt: normalizeString(payload.expirationDateTime || options.expiresAt),
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
    if (!isTokenRecordUsable(tokenRecord)) {
      return [];
    }
    const startDateTime = encodeURIComponent(toIsoUtc(options.windowStart));
    const endDateTime = encodeURIComponent(toIsoUtc(options.windowEnd));
    const url = `https://graph.microsoft.com/v1.0/users/${normalizeEmail(calendar.email)}/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}`;
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        Prefer: `outlook.timezone="UTC"`
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Microsoft Graph calendarView failed with HTTP ${response.status}.`);
    }
    const events = Array.isArray(payload?.value) ? payload.value : [];
    return events.map((event) => ({
      id: normalizeString(event.id),
      calendarId: calendar.id,
      subject: normalizeString(event.subject || "Busy"),
      start: normalizeGraphEventDateTime(event?.start?.dateTime, event?.start?.timeZone || event?.originalStartTimeZone || options.timezone || "UTC"),
      end: normalizeGraphEventDateTime(event?.end?.dateTime, event?.end?.timeZone || event?.originalEndTimeZone || event?.originalStartTimeZone || options.timezone || "UTC"),
      timezone: normalizeString(event?.originalStartTimeZone || event?.start?.timeZone || options.timezone || "UTC"),
      location: normalizeString(event?.location?.displayName || ""),
      description: normalizeString(event?.bodyPreview || readBodyContent(event?.body)),
      status: normalizeString(event?.showAs || "busy"),
      mirroredByMarvin: hasMarvinMarker(event),
      sourceProvider: "m365"
    })).filter((event) => event.id && event.start && event.end);
  }

  buildGraphPayload(operation) {
    const payload = operation.payload;
    const graphTimeZone = payload.preserveOriginalTimezone ? (payload.sourceEventTimezone || "UTC") : "UTC";
    return {
      subject: payload.subject,
      sensitivity: payload.visibility === "private" ? "private" : "normal",
      showAs: "busy",
      categories: [MARVIN_MIRROR_MARKER],
      body: {
        contentType: "text",
        content: buildMarvinBody(payload)
      },
      location: payload.location ? { displayName: payload.location } : undefined,
      start: {
        dateTime: formatDateTimeInZone(payload.start, graphTimeZone),
        timeZone: graphTimeZone
      },
      end: {
        dateTime: formatDateTimeInZone(payload.end, graphTimeZone),
        timeZone: graphTimeZone
      }
    };
  }

  async upsertEvent(operation, context = {}) {
    const tokenRecord = await this.ensureUsableToken(operation.target);
    if (!isTokenRecordUsable(tokenRecord)) {
      throw new Error(`Microsoft token is not usable for ${operation.target.label}.`);
    }
    const existingMapping = context.existingMapping || null;
    const method = existingMapping?.targetEventId ? "PATCH" : "POST";
    const url = existingMapping?.targetEventId
      ? `https://graph.microsoft.com/v1.0/users/${normalizeEmail(operation.target.email)}/events/${encodeURIComponent(existingMapping.targetEventId)}`
      : `https://graph.microsoft.com/v1.0/users/${normalizeEmail(operation.target.email)}/events`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(this.buildGraphPayload(operation))
    });
    const payload = method === "PATCH"
      ? (response.ok ? {} : await response.json().catch(() => ({})))
      : await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Microsoft Graph write failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId: existingMapping?.targetEventId || normalizeString(payload?.id),
      status: method === "PATCH" ? "updated" : "created"
    };
  }

  async deleteEvent(targetCalendar, targetEventId) {
    const tokenRecord = await this.ensureUsableToken(targetCalendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      throw new Error(`Microsoft token is not usable for ${targetCalendar.label}.`);
    }
    const url = `https://graph.microsoft.com/v1.0/users/${normalizeEmail(targetCalendar.email)}/events/${encodeURIComponent(targetEventId)}`;
    const response = await this.fetchImpl(url, {
      method: "DELETE",
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`
      }
    });
    if (!response.ok && response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error?.message || `Microsoft Graph delete failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId,
      status: response.status === 404 ? "already-missing" : "deleted"
    };
  }
}
