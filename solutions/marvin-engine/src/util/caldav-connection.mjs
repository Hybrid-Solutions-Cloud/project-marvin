function normalizeString(value) {
  return String(value ?? "").trim();
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
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
