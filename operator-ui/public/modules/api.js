export async function requestJson(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { ok: false, error: await response.text() };

  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error || `Request failed with HTTP ${response.status}.`);
    error.statusCode = response.status;
    error.payload = payload;
    error.code = payload.code || "REQUEST_FAILED";
    error.action = payload.action || "Review the request and try again.";
    error.retryable = Boolean(payload.retryable);
    throw error;
  }

  return payload;
}
