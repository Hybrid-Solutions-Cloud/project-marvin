const PROVIDER_CATALOG = {
  m365: {
    label: "Microsoft 365",
    runtimeKey: "microsoft",
    supportsRealtime: true,
    requiredFields: ["email"],
    recommendedFields: ["tenantId", "sourcePrefix"]
  },
  outlook: {
    label: "Outlook",
    runtimeKey: "microsoft",
    supportsRealtime: true,
    requiredFields: ["email"],
    recommendedFields: ["sourcePrefix"]
  },
  google: {
    label: "Google Calendar",
    runtimeKey: "google",
    supportsRealtime: true,
    requiredFields: ["email"],
    recommendedFields: ["sourcePrefix"]
  },
  "apple-caldav": {
    label: "Apple / CalDAV",
    runtimeKey: "caldav",
    supportsRealtime: true,
    requiredFields: ["email"],
    recommendedFields: ["sourcePrefix"]
  }
};

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeUrl(value) {
  return normalizeString(value).replace(/\/$/, "");
}

function sanitizeName(value) {
  return String(value || "").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function normalizeSecretMap(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});
  return Object.fromEntries(entries.map(([key, secret]) => [sanitizeName(key), normalizeString(secret)]).filter(([, secret]) => secret));
}

export function buildProviderRuntime(input = {}) {
  const keeperUrl = normalizeUrl(input?.deployment?.keeperUrl || input?.keeperUrl);
  const marvinUrl = normalizeUrl(input?.deployment?.marvinUrl || input?.marvinUrl);
  const caldavPasswords = normalizeSecretMap(input?.providerConnections?.caldav?.passwords || input?.providerSecretStatus?.caldavPasswords || input?.providerSecrets?.caldavPasswords);

  return {
    microsoft: {
      provider: "m365",
      authMode: input?.providerConnections?.microsoft?.authMode || "marvin-engine",
      clientId: normalizeString(input?.providerConnections?.microsoft?.clientId || input?.microsoftClientId || process.env.MICROSOFT_CLIENT_ID || process.env.MARVIN_MICROSOFT_CLIENT_ID),
      tenantMode: input?.providerConnections?.microsoft?.tenantMode || "multi-tenant",
      bridgeBaseUrl: normalizeUrl(input?.providerConnections?.microsoft?.bridgeBaseUrl || keeperUrl),
      marvinBaseUrl: normalizeUrl(input?.providerConnections?.microsoft?.marvinBaseUrl || marvinUrl),
      authorizePath: input?.providerConnections?.microsoft?.authorizePath || "/marvin-api/oauth/microsoft/start"
    },
    google: {
      provider: "google",
      authMode: input?.providerConnections?.google?.authMode || "marvin-engine",
      clientId: normalizeString(input?.providerConnections?.google?.clientId || input?.googleClientId || process.env.GOOGLE_CLIENT_ID || process.env.MARVIN_GOOGLE_CLIENT_ID),
      bridgeBaseUrl: normalizeUrl(input?.providerConnections?.google?.bridgeBaseUrl || keeperUrl),
      marvinBaseUrl: normalizeUrl(input?.providerConnections?.google?.marvinBaseUrl || marvinUrl),
      authorizePath: input?.providerConnections?.google?.authorizePath || "/marvin-api/oauth/google/start"
    },
    caldav: {
      provider: "apple-caldav",
      authMode: input?.providerConnections?.caldav?.authMode || "manual-caldav",
      bridgeBaseUrl: normalizeUrl(input?.providerConnections?.caldav?.bridgeBaseUrl || keeperUrl),
      marvinBaseUrl: normalizeUrl(input?.providerConnections?.caldav?.marvinBaseUrl || marvinUrl),
      authorizePath: input?.providerConnections?.caldav?.authorizePath || "",
      serverUrl: normalizeString(input?.providerConnections?.caldav?.serverUrl),
      username: normalizeString(input?.providerConnections?.caldav?.username),
      passwordConfigured: Boolean(input?.providerConnections?.caldav?.passwordConfigured),
      passwords: caldavPasswords
    }
  };
}

function getMissingFields(calendar, fields = []) {
  return fields.filter((field) => !normalizeString(calendar?.[field]));
}

function buildCalendarProviderRuntime(calendar, providerRuntime) {
  if (calendar?.provider !== "apple-caldav") {
    return providerRuntime;
  }
  const passwordMap = normalizeSecretMap(providerRuntime?.passwords);
  return {
    ...providerRuntime,
    serverUrl: normalizeString(calendar?.caldavServerUrl || providerRuntime?.serverUrl),
    username: normalizeString(calendar?.caldavUsername || providerRuntime?.username || calendar?.email),
    passwordConfigured: Boolean(calendar?.caldavPasswordConfigured || passwordMap[sanitizeName(calendar?.id)] || providerRuntime?.passwordConfigured)
  };
}

export function describeProvider(providerId) {
  return PROVIDER_CATALOG[providerId] ?? {
    label: providerId,
    runtimeKey: providerId,
    supportsRealtime: false,
    requiredFields: ["email"],
    recommendedFields: ["sourcePrefix"]
  };
}

export function getProviderRuntime(profile, providerId) {
  const provider = describeProvider(providerId);
  const runtime = buildProviderRuntime({
    providerConnections: profile?.runtime?.providerConnections,
    deployment: profile?.runtime?.deployment
  });
  return runtime[provider.runtimeKey] ?? null;
}

export function getProviderAuthUrl(providerRuntime) {
  if (!providerRuntime) {
    return "";
  }

  const authMode = normalizeString(providerRuntime.authMode);
  const authorizePath = normalizeString(providerRuntime.authorizePath);

  if (authMode === "paranoid-keeper-bridge" && providerRuntime.bridgeBaseUrl && authorizePath) {
    return `${providerRuntime.bridgeBaseUrl}${authorizePath}`;
  }

  if (authMode === "marvin-engine" && providerRuntime.marvinBaseUrl && authorizePath) {
    return `${providerRuntime.marvinBaseUrl}${authorizePath}`;
  }

  return "";
}

function inferStatus(calendar, providerRuntime, hasAuthUrl) {
  const status = normalizeString(calendar?.connectionStatus).toLowerCase();
  if (status === "connected") {
    return "connected";
  }
  if (status === "error" || status === "invalid") {
    return "invalid";
  }
  if (providerRuntime?.authMode === "manual-caldav") {
    return normalizeString(providerRuntime.serverUrl) && normalizeString(providerRuntime.username) && providerRuntime.passwordConfigured ? "pending" : "connector-not-ready";
  }
  return hasAuthUrl ? "pending" : "connector-not-ready";
}

function buildReason(status, provider, providerRuntime, hasAuthUrl, missingRequired, missingRecommended) {
  if (missingRequired.length > 0) {
    return `Missing required fields: ${missingRequired.join(", ")}`;
  }
  if (status === "connected") {
    return "Calendar is marked connected in the Marvin profile.";
  }
  if (status === "invalid") {
    return "Calendar has invalid connection state or missing required setup.";
  }
  if (providerRuntime?.authMode === "manual-caldav") {
    return hasAuthUrl
      ? "CalDAV account still needs Marvin-side credential validation."
      : "CalDAV server URL, username, or app password is not configured yet for this calendar.";
  }
  if (!hasAuthUrl) {
    return `${provider.label} connector is not wired to a live Marvin auth endpoint yet.`;
  }
  if (missingRecommended.length > 0) {
    return `Provider auth path exists, but recommended fields are still missing: ${missingRecommended.join(", ")}`;
  }
  return `Provider auth can be started through ${providerRuntime.authMode}.`;
}

export function assessCalendarConnection(profile, calendar) {
  const provider = describeProvider(calendar?.provider);
  const providerRuntime = buildCalendarProviderRuntime(calendar, getProviderRuntime(profile, calendar?.provider));
  const missingRequired = getMissingFields(calendar, provider.requiredFields);
  const missingRecommended = getMissingFields(calendar, provider.recommendedFields);
  const requiresClientId = provider.runtimeKey === "microsoft" || provider.runtimeKey === "google";
  const hasClientId = !requiresClientId || Boolean(normalizeString(providerRuntime?.clientId));
  const authUrl = hasClientId ? getProviderAuthUrl(providerRuntime) : "";
  const hasAuthUrl = Boolean(authUrl) || providerRuntime?.authMode === "manual-caldav";
  const status = missingRequired.length > 0 ? "invalid" : inferStatus(calendar, providerRuntime, hasAuthUrl);

  return {
    calendarId: calendar?.id ?? "",
    label: calendar?.label ?? calendar?.id ?? provider.label,
    provider: calendar?.provider ?? "unknown",
    providerLabel: provider.label,
    connectorMode: providerRuntime?.authMode ?? "unconfigured",
    connectorReady: hasAuthUrl,
    supportsRealtime: provider.supportsRealtime,
    authUrl,
    bridgeBaseUrl: providerRuntime?.bridgeBaseUrl ?? "",
    marvinBaseUrl: providerRuntime?.marvinBaseUrl ?? "",
    missingRequired,
    missingRecommended,
    status,
    reason: !hasClientId
      ? `${provider.label} connector needs a client ID before Marvin can start provider sign-in.`
      : buildReason(status, provider, providerRuntime, hasAuthUrl, missingRequired, missingRecommended)
  };
}

export function assessProfileConnections(profile) {
  const calendars = Array.isArray(profile?.calendars) ? profile.calendars : [];
  const calendarsById = calendars.map((calendar) => assessCalendarConnection(profile, calendar));
  const summary = {
    total: calendarsById.length,
    connected: 0,
    pending: 0,
    invalid: 0,
    connectorNotReady: 0
  };

  for (const calendar of calendarsById) {
    if (calendar.status === "connected") {
      summary.connected += 1;
    } else if (calendar.status === "pending") {
      summary.pending += 1;
    } else if (calendar.status === "invalid") {
      summary.invalid += 1;
    } else if (calendar.status === "connector-not-ready") {
      summary.connectorNotReady += 1;
    }
  }

  return {
    calendars: calendarsById,
    summary,
    readyForLiveSync:
      summary.total > 1 &&
      summary.invalid === 0 &&
      summary.connectorNotReady === 0 &&
      summary.pending === 0,
    providerRuntime: buildProviderRuntime({
      providerConnections: profile?.runtime?.providerConnections,
      deployment: profile?.runtime?.deployment
    })
  };
}
