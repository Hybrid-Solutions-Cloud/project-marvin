function normalizeString(value) {
  return String(value ?? "").trim();
}

function sanitizeName(value) {
  return String(value || "").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function normalizeUrl(value) {
  return normalizeString(value);
}

function canonicalUrl(value) {
  return normalizeString(value).replace(/\/+$/, "");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unfoldIcsLines(content = "") {
  return normalizeString(content).replace(/\r?\n[ \t]/g, "");
}

function findIcsPropertyLine(lines, propertyName) {
  const upper = propertyName.toUpperCase();
  return lines.find((entry) => {
    const normalized = entry.toUpperCase();
    return normalized.startsWith(`${upper}:`) || normalized.startsWith(`${upper};`);
  }) || "";
}

function readIcsPropertyParameters(line = "") {
  const separator = line.indexOf(":");
  const header = separator >= 0 ? line.slice(0, separator) : line;
  return Object.fromEntries(header.split(";").slice(1).map((segment) => {
    const index = segment.indexOf("=");
    return index >= 0 ? [segment.slice(0, index).toUpperCase(), segment.slice(index + 1)] : [segment.toUpperCase(), ""];
  }));
}

function readIcsProperty(lines, propertyName) {
  const line = findIcsPropertyLine(lines, propertyName);
  const separator = line.indexOf(":");
  return separator >= 0 ? line.slice(separator + 1).trim() : "";
}

function unescapeIcsText(value = "") {
  return normalizeString(value)
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeIcsText(value = "") {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function isSupportedTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getZoneOffsetMs(instantMs, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]));
  const displayedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return displayedAsUtc - Math.floor(instantMs / 1000) * 1000;
}

function parseIcsDate(value, timeZone = "UTC") {
  const normalized = normalizeString(value);
  if (!normalized) return "";
  if (/^\d{8}$/.test(normalized)) return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T00:00:00.000Z`;
  if (/^\d{8}T\d{6}Z$/.test(normalized)) return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}.000Z`;
  if (/^\d{8}T\d{6}$/.test(normalized)) {
    const wallClock = Date.UTC(Number(normalized.slice(0, 4)), Number(normalized.slice(4, 6)) - 1, Number(normalized.slice(6, 8)), Number(normalized.slice(9, 11)), Number(normalized.slice(11, 13)), Number(normalized.slice(13, 15)));
    const zone = isSupportedTimeZone(timeZone) ? timeZone : "UTC";
    let instant = wallClock - getZoneOffsetMs(wallClock, zone);
    instant = wallClock - getZoneOffsetMs(instant, zone);
    return new Date(instant).toISOString();
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : date.toISOString();
}
function formatIcsUtc(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function formatIcsDateTime(value, timeZone) {
  const date = new Date(value);
  const zone = isSupportedTimeZone(timeZone) ? timeZone : "UTC";
  if (Number.isNaN(date.getTime()) || zone === "UTC") return { value: formatIcsUtc(value), zone: "UTC" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { value: `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`, zone };
}
function parseVeventComponent(component = "", calendarId = "", href = "") {
  const lines = unfoldIcsLines(component).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const uid = readIcsProperty(lines, "UID");
  const recurrenceId = readIcsProperty(lines, "RECURRENCE-ID");
  const summary = unescapeIcsText(readIcsProperty(lines, "SUMMARY")) || "Busy";
  const description = unescapeIcsText(readIcsProperty(lines, "DESCRIPTION"));
  const location = unescapeIcsText(readIcsProperty(lines, "LOCATION"));
  const startLine = findIcsPropertyLine(lines, "DTSTART");
  const endLine = findIcsPropertyLine(lines, "DTEND");
  const timezone = normalizeString(readIcsProperty(lines, "X-WR-TIMEZONE") || readIcsPropertyParameters(startLine).TZID || readIcsPropertyParameters(endLine).TZID || "UTC");
  const start = parseIcsDate(readIcsProperty(lines, "DTSTART"), timezone);
  const end = parseIcsDate(readIcsProperty(lines, "DTEND"), timezone);
  const managed = normalizeString(readIcsProperty(lines, "X-PROJECT-MARVIN-MANAGED")).toUpperCase() === "TRUE" || description.includes("[Project Marvin Mirror]");
  const transparency = normalizeString(readIcsProperty(lines, "TRANSP") || "OPAQUE").toUpperCase();
  return {
    id: normalizeString(`${uid || href.split("/").pop().replace(/\.ics$/i, "") || href}${recurrenceId ? `::${recurrenceId}` : ""}`),
    providerEventIdentity: uid ? `ical:${uid}${recurrenceId ? `::${recurrenceId}` : ""}` : "",
    targetEventId: normalizeString(href.split("/").pop() || uid),
    href,
    calendarId,
    subject: summary,
    start,
    end,
    timezone,
    location,
    description,
    status: normalizeString(readIcsProperty(lines, "STATUS") || "confirmed").toLowerCase(),
    availability: transparency === "TRANSPARENT" ? "free" : "busy",
    recurrenceId: recurrenceId ? parseIcsDate(recurrenceId, timezone) : "",
    recurrenceRule: normalizeString(readIcsProperty(lines, "RRULE")),
    excludedDates: lines.filter((line) => /^EXDATE(?:;|:)/i.test(line)).flatMap((line) => {
      const parameters = readIcsPropertyParameters(line);
      const raw = line.slice(line.indexOf(":") + 1);
      return raw.split(",").map((value) => parseIcsDate(value, parameters.TZID || timezone)).filter(Boolean);
    }),
    allDay: /^\d{8}$/.test(readIcsProperty(lines, "DTSTART")) || normalizeString(readIcsPropertyParameters(startLine).VALUE).toUpperCase() === "DATE",
    mirroredByMarvin: managed,
    sourceProvider: "apple-caldav"
  };
}

function parseVevents(icsContent = "", calendarId = "", href = "") {
  const calendarTimezone = normalizeString((unfoldIcsLines(icsContent).match(/(?:^|\n)X-WR-TIMEZONE:(.+?)(?:\n|$)/i) || [])[1]);
  return [...unfoldIcsLines(icsContent).matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/gi)].map((match) => (
    parseVeventComponent(`${calendarTimezone ? `X-WR-TIMEZONE:${calendarTimezone}\r\n` : ""}${match[1] || ""}`, calendarId, href)
  )).filter((event) => event.id && event.start && event.end);
}

function buildCalendarQueryXml(windowStart, windowEnd) {
  const start = formatIcsUtc(windowStart);
  const end = formatIcsUtc(windowEnd);
  return `<?xml version="1.0" encoding="utf-8" ?>\n<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">\n  <d:prop>\n    <d:getetag />\n    <c:calendar-data><c:expand start="${start}" end="${end}" /></c:calendar-data>\n  </d:prop>\n  <c:filter>\n    <c:comp-filter name="VCALENDAR">\n      <c:comp-filter name="VEVENT">\n        <c:time-range start="${start}" end="${end}" />\n      </c:comp-filter>\n    </c:comp-filter>\n  </c:filter>\n</c:calendar-query>`;
}

function parseCalendarQueryXml(xml = "", calendarId = "") {
  const matches = [...String(xml).matchAll(/<[^:>]*:?response[^>]*>([\s\S]*?)<\/[^:>]*:?response>/gi)];
  const resources = matches.map((match) => {
    const block = match[1] || "";
    const href = decodeXml(normalizeString((block.match(/<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i) || [])[1]));
    const etag = decodeXml(normalizeString((block.match(/<[^:>]*:?getetag[^>]*>([\s\S]*?)<\/[^:>]*:?getetag>/i) || [])[1]));
    const ics = decodeXml(normalizeString((block.match(/<[^:>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^:>]*:?calendar-data>/i) || [])[1]));
    const events = parseVevents(ics, calendarId, href);
    return { href, etag, events };
  }).filter((resource) => resource.href);
  return { resources, events: resources.flatMap((resource) => resource.events) };
}

function encodeChangeCursor(resources = []) {
  const state = Object.fromEntries(resources.map((resource) => [resource.href, {
    etag: resource.etag,
    eventIds: resource.events.filter((event) => event.status !== "cancelled").map((event) => event.id)
  }]));
  return `caldav-etag:${Buffer.from(JSON.stringify({ version: 1, resources: state }), "utf8").toString("base64url")}`;
}

function decodeChangeCursor(value = "") {
  try {
    const normalized = normalizeString(value);
    if (!normalized.startsWith("caldav-etag:")) return { version: 1, resources: {} };
    const parsed = JSON.parse(Buffer.from(normalized.slice("caldav-etag:".length), "base64url").toString("utf8"));
    return parsed?.version === 1 && parsed.resources && typeof parsed.resources === "object" ? parsed : { version: 1, resources: {} };
  } catch {
    return { version: 1, resources: {} };
  }
}

function buildResourceName(operation, existingMapping = null) {
  if (normalizeString(existingMapping?.targetEventId)) {
    return normalizeString(existingMapping.targetEventId);
  }
  return `${sanitizeName(operation.source.id)}-${sanitizeName(operation.event.id)}.ics`;
}

function buildIcsEvent(operation) {
  const payload = operation.payload || {};
  const mirror = payload.marvinMirror || {};
  const uid = `${sanitizeName(operation.source.id)}-${sanitizeName(operation.event.id)}@project-marvin`;
  const summary = normalizeString(payload.subject || "Busy");
  const description = normalizeString(payload.description || summary);
  const location = normalizeString(payload.location);
  const timezone = normalizeString(payload.sourceEventTimezone || operation.event.timezone || "UTC");
  const allDay = Boolean(payload.allDay);
  const start = allDay ? { value: normalizeString(payload.start).slice(0, 10).replaceAll("-", ""), zone: "DATE" } : formatIcsDateTime(payload.start, timezone);
  const end = allDay ? { value: normalizeString(payload.end).slice(0, 10).replaceAll("-", ""), zone: "DATE" } : formatIcsDateTime(payload.end, timezone);
  const dateProperty = (name, value) => value.zone === "DATE" ? `${name};VALUE=DATE:${value.value}` : (value.zone === "UTC" ? `${name}:${value.value}` : `${name};TZID=${value.zone}:${value.value}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Project Marvin//Calendar Sync//EN",
    `X-WR-TIMEZONE:${timezone}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(`${description}\n\n[Project Marvin Mirror]\nSource Calendar: ${normalizeString(mirror.sourceCalendarLabel || operation.source.label)}\nSource Event: ${normalizeString(mirror.sourceEventId || operation.event.id)}`)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : "",
    dateProperty("DTSTART", start),
    dateProperty("DTEND", end),
    "STATUS:CONFIRMED",
    `TRANSP:${payload.availability === "free" || payload.availability === "workingElsewhere" ? "TRANSPARENT" : "OPAQUE"}`,
    `CLASS:${payload.visibility === "private" ? "PRIVATE" : "PUBLIC"}`,
    "X-PROJECT-MARVIN-MANAGED:TRUE",
    `X-PROJECT-MARVIN-SOURCE-CALENDAR:${sanitizeName(mirror.sourceCalendarId || operation.source.id)}`,
    `X-PROJECT-MARVIN-SOURCE-EVENT:${sanitizeName(mirror.sourceEventId || operation.event.id)}`,
    `X-PROJECT-MARVIN-TARGET-CALENDAR:${sanitizeName(mirror.targetCalendarId || operation.target.id)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].filter(Boolean).join("\r\n");
}

function resolveCalendarConnection(config = {}, calendar = {}) {
  const runtime = config.profile?.runtime?.providerConnections?.caldav || {};
  const secrets = config.providerSecrets || {};
  const passwordMap = secrets.caldavPasswords || {};
  return {
    serverUrl: normalizeUrl(calendar.caldavServerUrl || runtime.serverUrl),
    username: normalizeString(calendar.caldavUsername || runtime.username || calendar.email),
    password: normalizeString(passwordMap[sanitizeName(calendar.id)] || secrets.caldavPassword)
  };
}

function hasCalDavCredentials(config = {}, calendar = {}) {
  const connection = resolveCalendarConnection(config, calendar);
  return Boolean(connection.serverUrl && connection.username && connection.password);
}

export function isCalDavCalendarReady(config = {}, calendar = {}) {
  return hasCalDavCredentials(config, calendar);
}

export class CalDavAdapter {
  constructor(config = {}) {
    this.config = config;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  describe() {
    const calendars = Array.isArray(this.config.profile?.calendars) ? this.config.profile.calendars.filter((calendar) => calendar.provider === "apple-caldav") : [];
    const ready = calendars.filter((calendar) => isCalDavCalendarReady(this.config, calendar)).length;
    return {
      provider: "apple-caldav",
      status: ready > 0 ? "credential-ready" : "credential-missing",
      notes: ready > 0
        ? `CalDAV credentials are configured for ${ready} Apple calendar(s). Marvin can attempt live CalDAV reads and writes for those calendars.`
        : "Marvin still needs CalDAV server URL, username, and app password before Apple live sync can run."
    };
  }

  hasCalendarAuthMaterial(calendar) {
    return isCalDavCalendarReady(this.config, calendar);
  }

  async discoverCalendars(calendar) {
    const connection = resolveCalendarConnection(this.config, calendar);
    return discoverCalDavCalendars({ ...connection, fetchImpl: this.fetchImpl });
  }

  async assessCalendarCapabilities(calendar) {
    const checkedAt = new Date().toISOString();
    try {
      const discovery = await this.discoverCalendars(calendar);
      const providerCalendarId = canonicalUrl(calendar.providerCalendarId || calendar.caldavServerUrl);
      const selected = discovery.calendars.find((item) => canonicalUrl(item.providerCalendarId) === providerCalendarId);
      const issues = [];
      if (!selected) issues.push("The selected Apple calendar collection was not returned by current discovery.");
      if (selected && !selected.canRead) issues.push("The selected Apple calendar is not readable.");
      if (selected && !selected.canEdit) issues.push("The selected Apple calendar is read-only and cannot receive mirrors.");
      return {
        ready: Boolean(selected?.canRead && selected?.canEdit),
        authentication: true,
        discovery: true,
        read: Boolean(selected?.canRead),
        write: Boolean(selected?.canEdit),
        polling: Boolean(selected),
        checkedAt,
        issues,
        collection: selected || null
      };
    } catch (error) {
      return {
        ready: false,
        authentication: error?.stage !== "authentication",
        discovery: false,
        read: false,
        write: false,
        polling: false,
        checkedAt,
        failureStage: error?.stage || "discovery",
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  planWrite(operation) {
    return {
      adapter: "caldav",
      action: "put-ics-event",
      targetCalendar: operation.target.label,
      ready: this.hasCalendarAuthMaterial(operation.target),
      payload: operation.payload
    };
  }

  async listSourceEvents(calendar, options = {}) {
    const connection = resolveCalendarConnection(this.config, calendar);
    if (!isCalDavCalendarReady(this.config, calendar)) {
      return [];
    }
    const request = await requestCalDavWithAuthRedirects({
      url: connection.serverUrl,
      username: connection.username,
      password: connection.password,
      method: "REPORT",
      headers: {
        Depth: "1",
        Prefer: 'return=minimal',
        "Content-Type": 'application/xml; charset="utf-8"'
      },
      body: buildCalendarQueryXml(options.windowStart, options.windowEnd),
      fetchImpl: this.fetchImpl,
      stage: "event-read"
    });
    const { response } = request;
    const xml = await response.text();
    if (!response.ok && response.status !== 207) {
      throw new Error(`CalDAV REPORT failed with HTTP ${response.status}.`);
    }
    return parseCalendarQueryXml(xml, calendar.id).events.filter((event) => event.status !== "cancelled");
  }

  async listSourceEventChanges(calendar, options = {}) {
    const connection = resolveCalendarConnection(this.config, calendar);
    if (!isCalDavCalendarReady(this.config, calendar)) {
      return { events: [], deletedEventIds: [], deltaLink: normalizeString(options.deltaLink) };
    }
    const request = await requestCalDavWithAuthRedirects({
      url: connection.serverUrl,
      username: connection.username,
      password: connection.password,
      method: "REPORT",
      headers: {
        Depth: "1",
        Prefer: "return=minimal",
        "Content-Type": 'application/xml; charset="utf-8"'
      },
      body: buildCalendarQueryXml(options.windowStart, options.windowEnd),
      fetchImpl: this.fetchImpl,
      stage: "event-change-read"
    });
    const { response } = request;
    const xml = await response.text();
    if (!response.ok && response.status !== 207) throw new Error(`CalDAV REPORT failed with HTTP ${response.status}.`);
    const current = parseCalendarQueryXml(xml, calendar.id);
    const previous = decodeChangeCursor(options.deltaLink).resources;
    const currentByHref = Object.fromEntries(current.resources.map((resource) => [resource.href, resource]));
    const firstLoad = Object.keys(previous).length === 0;
    const changed = firstLoad
      ? current.resources
      : current.resources.filter((resource) => previous[resource.href]?.etag !== resource.etag);
    const deletedEventIds = Object.entries(previous)
      .filter(([href]) => !currentByHref[href])
      .flatMap(([, resource]) => Array.isArray(resource.eventIds) ? resource.eventIds : []);
    const cancelledEventIds = changed.flatMap((resource) => resource.events.filter((event) => event.status === "cancelled").map((event) => event.id));
    const removedInstances = changed.flatMap((resource) => {
      const previousIds = Array.isArray(previous[resource.href]?.eventIds) ? previous[resource.href].eventIds : [];
      const currentIds = new Set(resource.events.filter((event) => event.status !== "cancelled").map((event) => event.id));
      return previousIds.filter((eventId) => !currentIds.has(eventId));
    });
    return {
      events: changed.flatMap((resource) => resource.events).filter((event) => event.status !== "cancelled"),
      deletedEventIds: [...new Set([...deletedEventIds, ...cancelledEventIds, ...removedInstances])],
      deltaLink: encodeChangeCursor(current.resources),
      evidence: {
        mode: "etag",
        resourcesScanned: current.resources.length,
        resourcesChanged: changed.length
      }
    };
  }

  async upsertEvent(operation, context = {}) {
    const connection = resolveCalendarConnection(this.config, operation.target);
    if (!isCalDavCalendarReady(this.config, operation.target)) {
      throw new Error(`CalDAV credentials are not usable for ${operation.target.label}.`);
    }
    const resourceName = buildResourceName(operation, context.existingMapping);
    const targetUrl = `${canonicalUrl(connection.serverUrl)}/${encodeURIComponent(resourceName)}`;
    const request = await requestCalDavWithAuthRedirects({
      url: targetUrl,
      username: connection.username,
      password: connection.password,
      method: "PUT",
      headers: {
        "Content-Type": 'text/calendar; charset="utf-8"',
        ...(normalizeString(context.existingMapping?.targetEtag)
          ? { "If-Match": normalizeString(context.existingMapping.targetEtag) }
          : { "If-None-Match": "*" })
      },
      body: buildIcsEvent(operation),
      fetchImpl: this.fetchImpl,
      stage: "event-write"
    });
    const { response } = request;
    if (response.status === 412) {
      throw new Error("CalDAV write was rejected because the target event changed remotely. Refresh before retrying this mirror.");
    }
    if (!response.ok) {
      throw new Error(`CalDAV PUT failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId: resourceName,
      targetEtag: normalizeString(response.headers?.get?.("etag")),
      status: context.existingMapping?.targetEventId ? "updated" : "created"
    };
  }

  async deleteEvent(targetCalendar, targetEventId) {
    const connection = resolveCalendarConnection(this.config, targetCalendar);
    if (!isCalDavCalendarReady(this.config, targetCalendar)) {
      throw new Error(`CalDAV credentials are not usable for ${targetCalendar.label}.`);
    }
    const targetUrl = `${canonicalUrl(connection.serverUrl)}/${encodeURIComponent(normalizeString(targetEventId))}`;
    const request = await requestCalDavWithAuthRedirects({
      url: targetUrl,
      username: connection.username,
      password: connection.password,
      method: "DELETE",
      fetchImpl: this.fetchImpl,
      stage: "event-delete"
    });
    const { response } = request;
    if (!response.ok && response.status !== 404) {
      throw new Error(`CalDAV DELETE failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId,
      status: response.status === 404 ? "already-missing" : "deleted"
    };
  }
}
import { discoverCalDavCalendars, requestCalDavWithAuthRedirects } from "../util/caldav-connection.mjs";
