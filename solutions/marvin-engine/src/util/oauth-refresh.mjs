function normalizeString(value) {
  return String(value ?? "").trim();
}

function decodeJwtPayload(token) {
  const value = normalizeString(token);
  if (!value || value.split('.').length < 2) {
    return {};
  }
  try {
    const payload = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(payload.padEnd(payload.length + (4 - payload.length % 4) % 4, '='), 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function mergeTokenRecord(currentRecord, payload = {}) {
  const obtainedAt = new Date();
  const expiresIn = Number(payload.expires_in || 0);
  const expiresAt = expiresIn > 0 ? new Date(obtainedAt.getTime() + expiresIn * 1000).toISOString() : normalizeString(currentRecord?.expiresAt);
  const idTokenClaims = payload.id_token ? decodeJwtPayload(payload.id_token) : (currentRecord?.idTokenClaims || {});
  return {
    ...currentRecord,
    status: 'connected',
    accessToken: normalizeString(payload.access_token),
    refreshToken: normalizeString(payload.refresh_token || currentRecord?.refreshToken),
    tokenType: normalizeString(payload.token_type || currentRecord?.tokenType || 'Bearer'),
    scope: normalizeString(payload.scope || currentRecord?.scope),
    expiresAt,
    obtainedAt: obtainedAt.toISOString(),
    accountRef: normalizeString(idTokenClaims?.oid || idTokenClaims?.sub || idTokenClaims?.email || currentRecord?.accountRef),
    idTokenClaims,
    lastError: ''
  };
}

export async function refreshProviderToken({ provider, calendar, profile, providerSecrets = {}, currentRecord, fetchImpl = fetch }) {
  const providerRuntime = profile?.runtime?.providerConnections?.[provider === 'google' ? 'google' : 'microsoft'] || {};
  const clientId = normalizeString(providerRuntime.clientId);
  const refreshToken = normalizeString(currentRecord?.refreshToken);
  if (!clientId) {
    return { ok: false, reason: 'missing-client-id', message: 'Provider client ID is missing from Marvin runtime.' };
  }
  if (!refreshToken) {
    return { ok: false, reason: 'missing-refresh-token', message: 'Refresh token is missing for this calendar.' };
  }

  let tokenUrl = '';
  let clientSecret = '';
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  if (provider === 'google') {
    clientSecret = normalizeString(providerSecrets.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || process.env.MARVIN_GOOGLE_CLIENT_SECRET);
    tokenUrl = 'https://oauth2.googleapis.com/token';
  } else {
    clientSecret = normalizeString(providerSecrets.microsoftClientSecret || process.env.MICROSOFT_CLIENT_SECRET || process.env.MARVIN_MICROSOFT_CLIENT_SECRET);
    const tenantSegment = providerRuntime.tenantMode === 'single-tenant' && normalizeString(calendar?.tenantId)
      ? normalizeString(calendar.tenantId)
      : 'organizations';
    tokenUrl = `https://login.microsoftonline.com/${tenantSegment}/oauth2/v2.0/token`;
    body.set('scope', 'offline_access openid profile User.Read Calendars.ReadWrite');
  }

  if (!clientSecret) {
    return { ok: false, reason: 'missing-client-secret', message: 'Provider client secret is missing from Marvin provider setup.' };
  }

  body.set('client_secret', clientSecret);

  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !normalizeString(payload?.access_token)) {
    return {
      ok: false,
      reason: 'token-refresh-failed',
      message: normalizeString(payload?.error_description || payload?.error || `Token refresh failed with HTTP ${response.status}.`),
      providerPayload: payload
    };
  }

  return {
    ok: true,
    tokenRecord: mergeTokenRecord(currentRecord, payload)
  };
}
