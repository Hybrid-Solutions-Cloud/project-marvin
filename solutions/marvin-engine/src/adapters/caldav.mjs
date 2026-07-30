function normalizeString(value) {
  return String(value ?? "").trim();
}

function sanitizeName(value) {
  return String(value || "").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function normalizeUrl(value) {
  return normalizeString(value).replace(/\/$/, "");
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
function parseVevent(icsContent = "", calendarId = "", href = "") {
  const unfolded = unfoldIcsLines(icsContent);
  const lines = unfolded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const uid = readIcsProperty(lines, "UID");
  const summary = readIcsProperty(lines, "SUMMARY") || "Busy";
  const description = readIcsProperty(lines, "DESCRIPTION");
  const location = readIcsProperty(lines, "LOCATION");
  const startLine = findIcsPropertyLine(lines, "DTSTART");
  const endLine = findIcsPropertyLine(lines, "DTEND");
  const timezone = normalizeString(readIcsProperty(lines, "X-WR-TIMEZONE") || readIcsPropertyParameters(startLine).TZID || readIcsPropertyParameters(endLine).TZID || "UTC");
  const start = parseIcsDate(readIcsProperty(lines, "DTSTART"), timezone);
  const end = parseIcsDate(readIcsProperty(lines, "DTEND"), timezone);
  const managed = normalizeString(readIcsProperty(lines, "X-PROJECT-MARVIN-MANAGED")).toUpperCase() === "TRUE" || description.includes("[Project Marvin Mirror]");
  return {
    id: normalizeString(uid || href.split("/").pop().replace(/\.ics$/i, "") || href),
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
    mirroredByMarvin: managed,
    sourceProvider: "apple-caldav"
  };
}

function toBasicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function buildCalendarQueryXml(windowStart, windowEnd) {
  const start = formatIcsUtc(windowStart);
  const end = formatIcsUtc(windowEnd);
  return `<?xml version="1.0" encoding="utf-8" ?>\n<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">\n  <d:prop>\n    <d:getetag />\n    <c:calendar-data />\n  </d:prop>\n  <c:filter>\n    <c:comp-filter name="VCALENDAR">\n      <c:comp-filter name="VEVENT">\n        <c:time-range start="${start}" end="${end}" />\n      </c:comp-filter>\n    </c:comp-filter>\n  </c:filter>\n</c:calendar-query>`;
}

function parseCalendarQueryXml(xml = "", calendarId = "") {
  const matches = [...String(xml).matchAll(/<[^:>]*:?response[^>]*>([\s\S]*?)<\/[^:>]*:?response>/gi)];
  return matches.map((match) => {
    const block = match[1] || "";
    const href = normalizeString((block.match(/<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i) || [])[1]).replace(/&amp;/g, "&");
    const ics = normalizeString((block.match(/<[^:>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^:>]*:?calendar-data>/i) || [])[1])
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    return parseVevent(ics, calendarId, href);
  }).filter((event) => event.id && event.start && event.end);
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
  const description = normalizeString(payload.description || summary).replaceAll("\n", "\\n");
  const location = normalizeString(payload.location).replaceAll("\n", "\\n");
  const timezone = normalizeString(payload.sourceEventTimezone || operation.event.timezone || "UTC");
  const start = formatIcsDateTime(payload.start, timezone);
  const end = formatIcsDateTime(payload.end, timezone);
  const dateProperty = (name, value) => value.zone === "UTC" ? `${name}:${value.value}` : `${name};TZID=${value.zone}:${value.value}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Project Marvin//Calendar Sync//EN",
    `X-WR-TIMEZONE:${timezone}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}\\n\\n[Project Marvin Mirror]\\nSource Calendar: ${normalizeString(mirror.sourceCalendarLabel || operation.source.label)}\\nSource Event: ${normalizeString(mirror.sourceEventId || operation.event.id)}`,
    location ? `LOCATION:${location}` : "",
    dateProperty("DTSTART", start),
    dateProperty("DTEND", end),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
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
    const response = await this.fetchImpl(connection.serverUrl, {
      method: "REPORT",
      headers: {
        Authorization: toBasicAuth(connection.username, connection.password),
        Depth: "1",
        Prefer: 'return=minimal',
        "Content-Type": 'application/xml; charset="utf-8"'
      },
      body: buildCalendarQueryXml(options.windowStart, options.windowEnd)
    });
    const xml = await response.text();
    if (!response.ok && response.status !== 207) {
      throw new Error(`CalDAV REPORT failed with HTTP ${response.status}.`);
    }
    return parseCalendarQueryXml(xml, calendar.id);
  }

  async upsertEvent(operation, context = {}) {
    const connection = resolveCalendarConnection(this.config, operation.target);
    if (!isCalDavCalendarReady(this.config, operation.target)) {
      throw new Error(`CalDAV credentials are not usable for ${operation.target.label}.`);
    }
    const resourceName = buildResourceName(operation, context.existingMapping);
    const targetUrl = `${connection.serverUrl}/${encodeURIComponent(resourceName)}`;
    const response = await this.fetchImpl(targetUrl, {
      method: "PUT",
      headers: {
        Authorization: toBasicAuth(connection.username, connection.password),
        "Content-Type": 'text/calendar; charset="utf-8"'
      },
      body: buildIcsEvent(operation)
    });
    if (!response.ok) {
      throw new Error(`CalDAV PUT failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId: resourceName,
      status: context.existingMapping?.targetEventId ? "updated" : "created"
    };
  }

  async deleteEvent(targetCalendar, targetEventId) {
    const connection = resolveCalendarConnection(this.config, targetCalendar);
    if (!isCalDavCalendarReady(this.config, targetCalendar)) {
      throw new Error(`CalDAV credentials are not usable for ${targetCalendar.label}.`);
    }
    const targetUrl = `${connection.serverUrl}/${encodeURIComponent(normalizeString(targetEventId))}`;
    const response = await this.fetchImpl(targetUrl, {
      method: "DELETE",
      headers: {
        Authorization: toBasicAuth(connection.username, connection.password)
      }
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`CalDAV DELETE failed with HTTP ${response.status}.`);
    }
    return {
      targetEventId,
      status: response.status === 404 ? "already-missing" : "deleted"
    };
  }
}
