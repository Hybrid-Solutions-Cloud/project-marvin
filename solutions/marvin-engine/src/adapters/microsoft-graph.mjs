import { MARVIN_MIRROR_MARKER } from "../core/policy.mjs";
import { getTokenRecord, hasTokenRecordMaterial, isTokenRecordUsable } from "../util/token-state.mjs";
import { refreshProviderToken } from "../util/oauth-refresh.mjs";
import crypto from "node:crypto";

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

function normalizeGraphBaseUrl(value) {
  return normalizeString(value || "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
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

const GRAPH_EVENT_SELECT = "id,iCalUId,seriesMasterId,type,originalStart,lastModifiedDateTime,changeKey,subject,start,end,originalStartTimeZone,originalEndTimeZone,location,body,bodyPreview,showAs,categories,isAllDay,isCancelled";

function deterministicTransactionId(operation) {
  const hex = crypto.createHash("sha256")
    .update(`${operation.source.id}\n${operation.event.id}\n${operation.target.id}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizeGraphEvents(events, calendar, options = {}) {
  return events.map((event) => {
    const id = normalizeString(event.id);
    const iCalUId = normalizeString(event.iCalUId);
    const recurrenceType = normalizeString(event.type || "singleInstance");
    const originalStart = normalizeString(event.originalStart);
    const occurrenceIdentity = recurrenceType === "occurrence" || recurrenceType === "exception"
      ? normalizeString(originalStart || event?.start?.dateTime)
      : (recurrenceType === "seriesMaster" ? "series" : "");
    return {
      id,
      calendarId: calendar.id,
      providerCalendarId: normalizeString(calendar.providerCalendarId),
      iCalUId,
      providerEventIdentity: iCalUId ? `ical:${iCalUId}${occurrenceIdentity ? `::${occurrenceIdentity}` : ""}` : "",
      seriesMasterId: normalizeString(event.seriesMasterId),
      recurrenceType,
      originalStart,
      lastModifiedDateTime: normalizeString(event.lastModifiedDateTime),
      changeKey: normalizeString(event.changeKey),
      subject: normalizeString(event.subject || "Busy"),
      start: normalizeGraphEventDateTime(event?.start?.dateTime, event?.start?.timeZone || event?.originalStartTimeZone || options.timezone || "UTC"),
      end: normalizeGraphEventDateTime(event?.end?.dateTime, event?.end?.timeZone || event?.originalEndTimeZone || event?.originalStartTimeZone || options.timezone || "UTC"),
      timezone: normalizeString(event?.originalStartTimeZone || event?.start?.timeZone || options.timezone || "UTC"),
      location: normalizeString(event?.location?.displayName || ""),
      description: normalizeString(readBodyContent(event?.body) || event?.bodyPreview),
      status: normalizeString(event?.showAs || "busy"),
      availability: normalizeString(event?.showAs || "busy"),
      mirroredByMarvin: hasMarvinMarker(event),
      allDay: Boolean(event.isAllDay),
      cancelled: Boolean(event.isCancelled),
      sourceProvider: "m365"
    };
  }).filter((event) => event.id && event.start && event.end && !event.cancelled);
}

export class MicrosoftGraphAdapter {
  constructor(config = {}) {
    this.config = config;
    this.fetchImpl = config.fetchImpl || fetch;
    this.graphBaseUrl = normalizeGraphBaseUrl(config.graphBaseUrl || process.env.MARVIN_MICROSOFT_GRAPH_BASE_URL);
    this.maxRetries = Math.max(0, Number(config.maxRetries ?? process.env.MARVIN_MICROSOFT_MAX_RETRIES ?? 3));
  }

  async request(url, options = {}) {
    let response;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      response = await this.fetchImpl(url, options);
      const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
      if (!retryable || attempt >= this.maxRetries) return response;
      const retryAfterSeconds = Number(response.headers?.get?.("retry-after") || 0);
      const delayMs = retryAfterSeconds > 0
        ? Math.min(30_000, retryAfterSeconds * 1000)
        : Math.min(5_000, 250 * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return response;
  }

  calendarCollectionPath(calendar) {
    const providerCalendarId = normalizeString(calendar?.providerCalendarId);
    return providerCalendarId
      ? `/me/calendars/${encodeURIComponent(providerCalendarId)}`
      : "/me/calendar";
  }

  async graphJson(tokenRecord, relativeOrAbsoluteUrl, options = {}) {
    const url = /^https?:\/\//i.test(relativeOrAbsoluteUrl)
      ? relativeOrAbsoluteUrl
      : `${this.graphBaseUrl}${relativeOrAbsoluteUrl}`;
    const response = await this.request(url, {
      ...options,
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Microsoft Graph request failed with HTTP ${response.status}.`);
    }
    return payload;
  }

  async getConnectedIdentity(calendar) {
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) throw new Error(`Microsoft token is not usable for ${calendar.label}.`);
    const payload = await this.graphJson(tokenRecord, "/me?$select=id,displayName,mail,userPrincipalName");
    return {
      providerIdentityId: normalizeString(payload.id),
      displayName: normalizeString(payload.displayName),
      email: normalizeString(payload.mail || payload.userPrincipalName),
      userPrincipalName: normalizeString(payload.userPrincipalName),
      accountType: calendar.provider === "outlook" ? "personal" : "organization"
    };
  }

  async listCalendars(calendar) {
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) throw new Error(`Microsoft token is not usable for ${calendar.label}.`);
    let url = `${this.graphBaseUrl}/me/calendars?$select=id,name,canEdit,canShare,canViewPrivateItems,owner,isDefaultCalendar,color,hexColor&$top=100`;
    const calendars = [];
    const seen = new Set();
    while (url && !seen.has(url)) {
      seen.add(url);
      const payload = await this.graphJson(tokenRecord, url);
      calendars.push(...(Array.isArray(payload.value) ? payload.value : []));
      url = normalizeString(payload["@odata.nextLink"]);
    }
    return calendars.map((item) => ({
      providerCalendarId: normalizeString(item.id),
      name: normalizeString(item.name || "Calendar"),
      ownerName: normalizeString(item?.owner?.name),
      ownerAddress: normalizeString(item?.owner?.address),
      canEdit: Boolean(item.canEdit),
      canShare: Boolean(item.canShare),
      canViewPrivateItems: Boolean(item.canViewPrivateItems),
      isDefaultCalendar: Boolean(item.isDefaultCalendar),
      color: normalizeString(item.hexColor || item.color)
    })).filter((item) => item.providerCalendarId);
  }

  async assessCalendarCapabilities(calendar, options = {}) {
    const checkedAt = new Date(options.nowMs || Date.now()).toISOString();
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      return { ready: false, checkedAt, read: false, write: false, refresh: false, subscription: false, issues: ["Microsoft token is not usable."] };
    }
    const calendars = await this.listCalendars(calendar);
    const selected = normalizeString(calendar.providerCalendarId)
      ? calendars.find((item) => item.providerCalendarId === calendar.providerCalendarId)
      : calendars.find((item) => item.isDefaultCalendar) || calendars[0];
    let read = false;
    let readIssue = "";
    if (selected) {
      const start = encodeURIComponent(new Date(options.nowMs || Date.now()).toISOString());
      const end = encodeURIComponent(new Date((options.nowMs || Date.now()) + 24 * 60 * 60 * 1000).toISOString());
      try {
        await this.graphJson(tokenRecord, `${this.calendarCollectionPath({ ...calendar, providerCalendarId: selected.providerCalendarId })}/calendarView?startDateTime=${start}&endDateTime=${end}&$top=1&$select=id`);
        read = true;
      } catch (error) {
        readIssue = error instanceof Error ? error.message : String(error);
      }
    }
    const runtime = this.config.profile?.runtime?.providerConnections?.microsoft || {};
    const refresh = Boolean(normalizeString(tokenRecord.refreshToken) && normalizeString(runtime.clientId));
    const subscription = Boolean((calendar.provider === "m365" || calendar.provider === "outlook") && /^https:\/\//i.test(normalizeString(options.notificationUrl)));
    const issues = [];
    if (!selected) issues.push("The selected Microsoft calendar was not found.");
    if (selected && !read) issues.push(`Microsoft calendar events could not be read. ${readIssue}`.trim());
    if (selected && !selected.canEdit) issues.push("The selected Microsoft calendar is read-only.");
    if (!refresh) issues.push("Offline refresh is not configured.");
    if (!subscription) issues.push("A hosted HTTPS webhook URL is not configured for real-time updates.");
    return {
      ready: Boolean(read && selected?.canEdit && refresh && subscription),
      checkedAt,
      read,
      write: Boolean(selected?.canEdit),
      refresh,
      subscription,
      selectedCalendar: selected || null,
      issues
    };
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
        actionRequired: true,
        refreshFailureReason: refreshed.reason || "token-refresh-failed",
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

    const resource = normalizeString(existingRecord?.resource || `${this.calendarCollectionPath(calendar)}/events`);
    const method = normalizeString(existingRecord?.subscriptionId) ? "PATCH" : "POST";
    const url = method === "PATCH"
      ? `${this.graphBaseUrl}/subscriptions/${encodeURIComponent(existingRecord.subscriptionId)}`
      : `${this.graphBaseUrl}/subscriptions`;
    let response = await this.request(url, {
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
    let payload = await response.json().catch(() => ({}));
    if (method === "PATCH" && (response.status === 404 || response.status === 410)) {
      response = await this.request(`${this.graphBaseUrl}/subscriptions`, {
        method: "POST",
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
      payload = await response.json().catch(() => ({}));
    }
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
    if (!isTokenRecordUsable(tokenRecord)) return [];

    const startDateTime = encodeURIComponent(toIsoUtc(options.windowStart));
    const endDateTime = encodeURIComponent(toIsoUtc(options.windowEnd));
    let url = `${this.graphBaseUrl}${this.calendarCollectionPath(calendar)}/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$select=${GRAPH_EVENT_SELECT}`;
    const events = [];
    const seenPages = new Set();

    while (url && !seenPages.has(url)) {
      seenPages.add(url);
      const response = await this.request(url, {
        headers: {
          Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
          Prefer: `outlook.timezone="UTC", IdType="ImmutableId"`
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Microsoft Graph calendarView failed with HTTP ${response.status}.`);
      events.push(...(Array.isArray(payload?.value) ? payload.value : []));
      url = normalizeString(payload?.["@odata.nextLink"]);
    }

    return normalizeGraphEvents(events, calendar, options);
  }

  async listSourceEventChanges(calendar, options = {}) {
    const tokenRecord = await this.ensureUsableToken(calendar);
    if (!isTokenRecordUsable(tokenRecord)) return { events: [], deletedEventIds: [], deltaLink: "" };
    const startDateTime = encodeURIComponent(toIsoUtc(options.windowStart));
    const endDateTime = encodeURIComponent(toIsoUtc(options.windowEnd));
    const initialUrl = `${this.graphBaseUrl}${this.calendarCollectionPath(calendar)}/calendarView/delta?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$select=${GRAPH_EVENT_SELECT}`;
    const savedDeltaLink = normalizeString(options.deltaLink);
    let url = savedDeltaLink || initialUrl;
    const changed = [];
    const deletedEventIds = [];
    const seenPages = new Set();
    let deltaLink = "";
    let cursorReset = false;
    while (url && !seenPages.has(url)) {
      seenPages.add(url);
      const response = await this.request(url, {
        headers: {
          Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
          Prefer: `outlook.timezone="UTC", IdType="ImmutableId", odata.maxpagesize=100`
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 410 && savedDeltaLink && !cursorReset) {
        cursorReset = true;
        url = initialUrl;
        continue;
      }
      if (!response.ok) throw new Error(payload?.error?.message || `Microsoft Graph calendarView delta failed with HTTP ${response.status}.`);
      for (const event of Array.isArray(payload.value) ? payload.value : []) {
        if (event?.["@removed"] || event?.isCancelled) {
          if (normalizeString(event.id)) deletedEventIds.push(normalizeString(event.id));
        } else {
          changed.push(event);
        }
      }
      url = normalizeString(payload?.["@odata.nextLink"]);
      deltaLink = normalizeString(payload?.["@odata.deltaLink"] || deltaLink);
    }
    return {
      events: normalizeGraphEvents(changed, calendar, options),
      deletedEventIds: [...new Set(deletedEventIds)],
      deltaLink,
      cursorReset
    };
  }
  buildGraphPayload(operation) {
    const payload = operation.payload;
    const graphTimeZone = payload.preserveOriginalTimezone ? normalizeTimeZoneName(payload.sourceEventTimezone || "UTC") : "UTC";
    const allDay = Boolean(payload.allDay);
    const dateOnly = (value) => normalizeString(value).slice(0, 10);
    return {
      subject: payload.subject,
      sensitivity: payload.visibility === "private" ? "private" : "normal",
      showAs: normalizeString(payload.availability || "busy"),
      isAllDay: allDay,
      categories: [MARVIN_MIRROR_MARKER],
      body: {
        contentType: "text",
        content: buildMarvinBody(payload)
      },
      location: payload.location ? { displayName: payload.location } : undefined,
      start: {
        dateTime: allDay ? `${dateOnly(payload.start)}T00:00:00` : formatDateTimeInZone(payload.start, graphTimeZone),
        timeZone: graphTimeZone
      },
      end: {
        dateTime: allDay ? `${dateOnly(payload.end)}T00:00:00` : formatDateTimeInZone(payload.end, graphTimeZone),
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
      ? `${this.graphBaseUrl}${this.calendarCollectionPath(operation.target)}/events/${encodeURIComponent(existingMapping.targetEventId)}`
      : `${this.graphBaseUrl}${this.calendarCollectionPath(operation.target)}/events`;
    const graphPayload = this.buildGraphPayload(operation);
    if (method === "POST") graphPayload.transactionId = deterministicTransactionId(operation);
    const response = await this.request(url, {
      method,
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        Prefer: `IdType="ImmutableId"`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(graphPayload)
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
    if (String(process.env.MARVIN_PROVIDER_DELETE_MODE || "disabled").trim().toLowerCase() !== "managed-mirrors-only") {
      throw new Error("Microsoft provider deletion is disabled. Enable managed-mirrors-only mode explicitly after validating ownership mappings.");
    }
    const tokenRecord = await this.ensureUsableToken(targetCalendar);
    if (!isTokenRecordUsable(tokenRecord)) {
      throw new Error(`Microsoft token is not usable for ${targetCalendar.label}.`);
    }
    const url = `${this.graphBaseUrl}${this.calendarCollectionPath(targetCalendar)}/events/${encodeURIComponent(targetEventId)}`;
    const verifyResponse = await this.request(`${url}?$select=id,subject,categories,body,bodyPreview`, {
      headers: {
        Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}`,
        Prefer: `IdType="ImmutableId"`
      }
    });
    if (verifyResponse.status === 404) {
      return { targetEventId, status: "already-missing" };
    }
    const verifyPayload = await verifyResponse.json().catch(() => ({}));
    if (!verifyResponse.ok) {
      throw new Error(verifyPayload?.error?.message || `Microsoft Graph delete verification failed with HTTP ${verifyResponse.status}.`);
    }
    if (!hasMarvinMarker(verifyPayload)) {
      throw new Error("Microsoft event deletion was refused because the target does not contain a Marvin ownership marker.");
    }
    const response = await this.request(url, {
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
