function normalizeString(value) {
  return String(value ?? "").trim();
}

function mergeTokenRecord(currentRecord, payload = {}) {
  const obtainedAt = new Date();
  const expiresIn = Number(payload.expires_in || 0);
  const expiresAt = expiresIn > 0 ? new Date(obtainedAt.getTime() + expiresIn * 1000).toISOString() : normalizeString(currentRecord?.expiresAt);
  return {
    ...currentRecord,
    status: 'connected',
    accessToken: normalizeString(payload.access_token),
    refreshToken: normalizeString(payload.refresh_token || currentRecord?.refreshToken),
    tokenType: normalizeString(payload.token_type || currentRecord?.tokenType || 'Bearer'),
    scope: normalizeString(payload.scope || currentRecord?.scope),
    expiresAt,
    obtainedAt: obtainedAt.toISOString(),
    accountRef: normalizeString(currentRecord?.accountRef),
    identity: currentRecord?.identity || null,
    actionRequired: false,
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
      : calendar?.provider === 'outlook' ? 'common' : 'organizations';
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
    const providerError = normalizeString(payload?.error);
    return {
      ok: false,
      reason: providerError === 'invalid_grant' || providerError === 'interaction_required' ? 'reauthorization-required' : 'token-refresh-failed',
      message: normalizeString(payload?.error_description || payload?.error || `Token refresh failed with HTTP ${response.status}.`),
      requiresReauthorization: providerError === 'invalid_grant' || providerError === 'interaction_required',
      providerPayload: payload
    };
  }

  return {
    ok: true,
    tokenRecord: mergeTokenRecord(currentRecord, payload)
  };
}
