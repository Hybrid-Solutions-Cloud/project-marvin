function normalizeString(value) {
  return String(value ?? "").trim();
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
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

function propertyBlock(xml = "", property = "") {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (String(xml).match(new RegExp(`<[^:>]*:?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/[^:>]*:?${escaped}>`, "i")) || [])[1] || "";
}

function propertyText(xml = "", property = "") {
  return decodeXml(propertyBlock(xml, property).replace(/<[^>]+>/g, "")).trim();
}

function propertyHref(xml = "", property = "") {
  const block = propertyBlock(xml, property);
  return decodeXml((block.match(/<[^:>]*:?href(?:\s[^>]*)?>([\s\S]*?)<\/[^:>]*:?href>/i) || [])[1] || "").trim();
}

function responseBlocks(xml = "") {
  return [...String(xml).matchAll(/<[^:>]*:?response(?:\s[^>]*)?>([\s\S]*?)<\/[^:>]*:?response>/gi)].map((match) => match[1] || "");
}

function resolveDavUrl(baseUrl, href) {
  try {
    return new URL(decodeXml(href), baseUrl).toString();
  } catch {
    return "";
  }
}

function discoveryError(stage, message, httpStatus = 0) {
  const error = new Error(message);
  error.code = `CALDAV_${stage.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAILED`;
  error.stage = stage;
  error.httpStatus = httpStatus;
  return error;
}

async function propfind({ url, username, password, depth, body, fetchImpl, timeoutMs, stage }) {
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "PROPFIND",
      redirect: "follow",
      headers: {
        Authorization: buildBasicAuthHeader(username, password),
        Depth: String(depth),
        Prefer: "return=minimal",
        "Content-Type": 'application/xml; charset="utf-8"'
      },
      body,
      signal
    });
  } catch (error) {
    throw discoveryError(stage, `${stage} request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const xml = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw discoveryError("authentication", "CalDAV server rejected the supplied username or app-specific password.", response.status);
  }
  if (response.status !== 207 && !response.ok) {
    throw discoveryError(stage, `CalDAV ${stage} returned HTTP ${response.status}.`, response.status);
  }
  return { response, xml, finalUrl: response.url || url };
}

export async function discoverCalDavCalendars({
  serverUrl,
  username,
  password,
  fetchImpl = fetch,
  timeoutMs = 15000
} = {}) {
  const serviceUrl = normalizeString(serverUrl);
  const normalizedUsername = normalizeString(username);
  const normalizedPassword = normalizeString(password);
  if (!serviceUrl || !normalizedUsername || !normalizedPassword) {
    throw discoveryError("configuration", "CalDAV discovery needs server URL, username, and app-specific password.");
  }

  const principalResult = await propfind({
    url: serviceUrl,
    username: normalizedUsername,
    password: normalizedPassword,
    depth: 0,
    body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    fetchImpl,
    timeoutMs,
    stage: "principal-discovery"
  });
  const principalHref = propertyHref(principalResult.xml, "current-user-principal");
  if (!principalHref) throw discoveryError("principal-discovery", "CalDAV did not return a current-user-principal URL.", principalResult.response.status);
  const principalUrl = resolveDavUrl(principalResult.finalUrl, principalHref);
  if (!principalUrl) throw discoveryError("principal-discovery", "CalDAV returned an invalid current-user-principal URL.");

  const homeResult = await propfind({
    url: principalUrl,
    username: normalizedUsername,
    password: normalizedPassword,
    depth: 0,
    body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    fetchImpl,
    timeoutMs,
    stage: "calendar-home-discovery"
  });
  const homeHref = propertyHref(homeResult.xml, "calendar-home-set");
  if (!homeHref) throw discoveryError("calendar-home-discovery", "CalDAV did not return a calendar-home-set URL.", homeResult.response.status);
  const calendarHomeUrl = resolveDavUrl(homeResult.finalUrl, homeHref);
  if (!calendarHomeUrl) throw discoveryError("calendar-home-discovery", "CalDAV returned an invalid calendar-home-set URL.");

  const collectionResult = await propfind({
    url: calendarHomeUrl,
    username: normalizedUsername,
    password: normalizedPassword,
    depth: 1,
    body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><d:current-user-privilege-set/><d:sync-token/><a:calendar-color/></d:prop></d:propfind>',
    fetchImpl,
    timeoutMs,
    stage: "calendar-enumeration"
  });
  const calendars = responseBlocks(collectionResult.xml).map((block) => {
    const href = propertyText(block, "href");
    const resourceType = propertyBlock(block, "resourcetype");
    const components = propertyBlock(block, "supported-calendar-component-set");
    if (!/<[^:>]*:?calendar(?:\s|\/|>)/i.test(resourceType) || (components && !/name\s*=\s*["']VEVENT["']/i.test(components))) return null;
    const privileges = propertyBlock(block, "current-user-privilege-set");
    const providerCalendarId = resolveDavUrl(collectionResult.finalUrl, href);
    if (!providerCalendarId) return null;
    const canEdit = /<[^:>]*:?(?:write|write-content|write-properties|bind)(?:\s|\/|>)/i.test(privileges);
    return {
      providerCalendarId,
      name: propertyText(block, "displayname") || "Apple Calendar",
      color: propertyText(block, "calendar-color"),
      canRead: !/HTTP\/\d(?:\.\d)?\s+403/i.test(block),
      canEdit,
      syncToken: propertyText(block, "sync-token")
    };
  }).filter(Boolean);
  if (calendars.length === 0) throw discoveryError("calendar-enumeration", "CalDAV authentication succeeded, but no VEVENT calendar collections were discovered.", collectionResult.response.status);
  return {
    serviceUrl: principalResult.finalUrl,
    principalUrl,
    calendarHomeUrl,
    calendars
  };
}

export async function validateCalDavCredentials({
  serverUrl,
  username,
  password,
  fetchImpl = fetch,
  timeoutMs = 10000
} = {}) {
  const normalizedUrl = normalizeString(serverUrl).replace(/\/$/, "");
  const normalizedUsername = normalizeString(username);
  const normalizedPassword = normalizeString(password);

  if (!normalizedUrl || !normalizedUsername || !normalizedPassword) {
    return {
      ok: false,
      status: "invalid",
      message: "CalDAV validation needs server URL, username, and app password."
    };
  }

  const headers = {
    Authorization: buildBasicAuthHeader(normalizedUsername, normalizedPassword),
    Depth: "0",
    Prefer: 'return=minimal',
    "Content-Type": 'application/xml; charset="utf-8"'
  };

  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;

  try {
    let response = await fetchImpl(normalizedUrl, {
      method: "PROPFIND",
      headers,
      body: '<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><displayname /></prop></propfind>',
      signal
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetchImpl(normalizedUrl, {
        method: "OPTIONS",
        headers: {
          Authorization: headers.Authorization
        },
        signal
      });
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: "invalid",
        httpStatus: response.status,
        message: "CalDAV server rejected the supplied username or app password."
      };
    }

    if ((response.status >= 200 && response.status < 300) || response.status === 207) {
      return {
        ok: true,
        status: "connected",
        httpStatus: response.status,
        message: "CalDAV credentials were accepted by the remote server."
      };
    }

    return {
      ok: false,
      status: "invalid",
      httpStatus: response.status,
      message: `CalDAV server returned HTTP ${response.status}.`
    };
  } catch (error) {
    return {
      ok: false,
      status: "invalid",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
