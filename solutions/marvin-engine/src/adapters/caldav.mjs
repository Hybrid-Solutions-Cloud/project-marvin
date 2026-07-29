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

function parseIcsDate(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T00:00:00.000Z`;
  }
  if (/^\d{8}T\d{6}Z$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}.000Z`;
  }
  if (/^\d{8}T\d{6}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}`;
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

function readIcsProperty(lines, propertyName) {
  const upper = `${propertyName.toUpperCase()}:`;
  const prefixed = `${propertyName.toUpperCase()};`;
  const line = lines.find((entry) => entry.toUpperCase().startsWith(upper) || entry.toUpperCase().startsWith(prefixed));
  if (!line) {
    return "";
  }
  const separator = line.indexOf(":");
  return separator >= 0 ? line.slice(separator + 1).trim() : "";
}

function parseVevent(icsContent = "", calendarId = "", href = "") {
  const unfolded = unfoldIcsLines(icsContent);
  const lines = unfolded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const uid = readIcsProperty(lines, "UID");
  const summary = readIcsProperty(lines, "SUMMARY") || "Busy";
  const description = readIcsProperty(lines, "DESCRIPTION");
  const location = readIcsProperty(lines, "LOCATION");
  const start = parseIcsDate(readIcsProperty(lines, "DTSTART"));
  const end = parseIcsDate(readIcsProperty(lines, "DTEND"));
  const timezone = normalizeString(readIcsProperty(lines, "X-WR-TIMEZONE") || readIcsProperty(lines, "TZID") || "UTC");
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
    `DTSTART:${formatIcsUtc(payload.start)}`,
    `DTEND:${formatIcsUtc(payload.end)}`,
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

export class CalDavAdapter {
  constructor(config = {}) {
    this.config = config;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  describe() {
    const calendars = Array.isArray(this.config.profile?.calendars) ? this.config.profile.calendars.filter((calendar) => calendar.provider === "apple-caldav") : [];
    const ready = calendars.filter((calendar) => hasCalDavCredentials(this.config, calendar)).length;
    return {
      provider: "apple-caldav",
      status: ready > 0 ? "credential-ready" : "credential-missing",
      notes: ready > 0
        ? `CalDAV credentials are configured for ${ready} Apple calendar(s). Marvin can attempt live CalDAV reads and writes for those calendars.`
        : "Marvin still needs CalDAV server URL, username, and app password before Apple live sync can run."
    };
  }

  planWrite(operation) {
    return {
      adapter: "caldav",
      action: "put-ics-event",
      targetCalendar: operation.target.label,
      ready: hasCalDavCredentials(this.config, operation.target),
      payload: operation.payload
    };
  }

  async listSourceEvents(calendar, options = {}) {
    const connection = resolveCalendarConnection(this.config, calendar);
    if (!hasCalDavCredentials(this.config, calendar)) {
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
    if (!hasCalDavCredentials(this.config, operation.target)) {
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
    if (!hasCalDavCredentials(this.config, targetCalendar)) {
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
