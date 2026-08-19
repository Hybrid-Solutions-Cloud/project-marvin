const PROVIDER_LABELS = {
  m365: "Microsoft 365",
  outlook: "Outlook.com",
  google: "Google Calendar",
  "apple-caldav": "Apple Calendar"
};

export const PORTAL_VIEWS = [
  { id: "dashboard", label: "Dashboard", description: "Health and next actions" },
  { id: "calendars", label: "Calendars", description: "Accounts and privacy" },
  { id: "rules", label: "Sync Rules", description: "Target detail policy" },
  { id: "review", label: "Review", description: "Events and duplicates" },
  { id: "activity", label: "Activity", description: "Recent synchronization" },
  { id: "diagnostics", label: "Diagnostics", description: "Connection evidence" },
  { id: "settings", label: "Settings", description: "Workspace configuration" }
];

export const CALENDAR_ROLES = [
  { id: "employer-work", label: "Employer Work" },
  { id: "personal-work", label: "Personal Work" },
  { id: "consulting", label: "Consulting" },
  { id: "personal", label: "Personal" },
  { id: "shared-family", label: "Shared Family" },
  { id: "volunteer", label: "Volunteer / Community" },
  { id: "travel", label: "Travel" },
  { id: "other", label: "Other" }
];

export function calendarRoleLabel(role) {
  return CALENDAR_ROLES.find((item) => item.id === role)?.label || "Employer Work";
}

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || provider || "Calendar";
}

export function sanitizeName(value, fallback = "project-marvin") {
  return String(value || fallback).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;
}

export function profileNameFor(email) {
  return `marvin-${sanitizeName(email)}`;
}

export function defaultPrefix(email, provider) {
  const local = String(email || provider || "cal")
    .split("@")[0]
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)[0] || "CAL";
  return `${local.toUpperCase()}: `;
}

export function createInitialState() {
  return {
    signedIn: false,
    profileName: "",
    operator: { email: "", displayName: "" },
    accounts: [],
    config: null,
    runtime: null,
    calendarReview: null,
    entraConfigured: false,
    devAuthEnabled: false,
    activityFilters: { calendarId: "all", result: "all", timeRange: "all" },
    activeView: "dashboard"
  };
}

export function applyConfig(state, config) {
  if (!config) return state;
  return {
    ...state,
    config,
    profileName: config.profileName || state.profileName,
    accounts: Array.isArray(config.accounts) ? config.accounts : [],
    operator: {
      email: config.marvinOperator || state.operator.email,
      displayName: config.marvinDisplayName || state.operator.displayName
    }
  };
}

export function isTrustedTarget(account) {
  return account?.inboundOverrides?.visibility === "default"
    && account?.inboundOverrides?.detailMode === "full";
}

export function withTrustedTarget(account, trusted) {
  return {
    ...account,
    inboundOverrides: trusted
      ? { visibility: "default", detailMode: "full", copyLocation: true, copyDescription: true }
      : undefined
  };
}

export function deriveCalendarState(account) {
  const connection = String(account?.connectionStatus || "").toLowerCase();
  const token = String(account?.tokenStatus || "").toLowerCase();
  const readiness = String(account?.readinessState || "").toLowerCase();
  const microsoft = account?.provider === "m365" || account?.provider === "outlook";
  const apple = account?.provider === "apple-caldav";

  if (connection === "confirmation-required") {
    return { id: "confirmation-required", label: "Confirm identity", tone: "warn", action: "Confirm identity" };
  }
  if (connection === "selection-required") {
    return {
      id: Array.isArray(account?.discoveredCalendars) && account.discoveredCalendars.length ? "selection-required" : "discovery-required",
      label: Array.isArray(account?.discoveredCalendars) && account.discoveredCalendars.length ? "Choose calendar" : "Discover calendars",
      tone: "warn",
      action: Array.isArray(account?.discoveredCalendars) && account.discoveredCalendars.length ? "Choose calendars" : "Discover calendars"
    };
  }
  if (connection === "discovery-required" || ((microsoft || apple) && ((microsoft && token === "usable") || apple) && !account?.providerCalendarId)) {
    return { id: "discovery-required", label: "Discover calendars", tone: "warn", action: "Discover calendars" };
  }
  if (connection === "action-required") {
    return { id: "capability-required", label: "Action required", tone: "bad", action: "Check capabilities" };
  }
  if (microsoft && account?.providerCalendarId && !account?.capabilities?.ready) {
    return { id: "capability-required", label: "Validate capabilities", tone: "warn", action: "Check capabilities" };
  }
  if (apple && account?.providerCalendarId && !account?.capabilities?.ready) {
    return { id: "capability-required", label: "Validate capabilities", tone: "warn", action: "Check capabilities" };
  }

  if ((!microsoft && !apple && readiness === "ready") || (connection === "connected" && (token === "usable" || apple) && (!microsoft || account?.capabilities?.ready) && (!apple || account?.capabilities?.ready))) {
    return { id: "ready", label: "Ready", tone: "ok", action: "" };
  }
  if (token === "expired") {
    return { id: "expired", label: "Expired", tone: "bad", action: "Reconnect" };
  }
  if (token === "error" && account?.tokenReason) {
    return { id: "reauthorization-required", label: "Action required", tone: "bad", action: "Reconnect" };
  }
  if (connection === "invalid" || readiness === "invalid") {
    return { id: "failed", label: "Failed", tone: "bad", action: "Fix access" };
  }
  if (connection === "connector-not-ready" || account?.connectorReady === false) {
    return { id: "setup-required", label: "Setup required", tone: "warn", action: "Finish setup" };
  }
  if (account?.authCallbackReceivedAt || (connection === "connected" && token !== "usable")) {
    return { id: "verifying", label: "Verifying", tone: "warn", action: "Check access" };
  }
  if (account?.authRequestedAt || connection === "pending") {
    return { id: "authorizing", label: "Authorizing", tone: "warn", action: "Continue sign-in" };
  }
  return { id: "setup-required", label: "Setup required", tone: "warn", action: "Connect" };
}

export function getDashboardSummary(state) {
  const lifecycle = state.accounts.map(deriveCalendarState);
  const ready = lifecycle.filter((item) => item.id === "ready").length;
  const actionRequired = state.accounts.length - ready;
  const running = Boolean(state.runtime?.runtimeProcess?.running || state.config?.runtimeProcess?.running);
  const runtimeStatus = state.runtime?.runtimeStatus || state.config?.runtimeStatus || {};
  const lastCompletedAt = runtimeStatus.lastCompletedAt || runtimeStatus.lastResult?.completedAt || "";
  const nextPollAt = runtimeStatus.nextPollAt || "";
  const nextSteps = Array.isArray(state.config?.readinessSummary?.nextSteps)
    ? state.config.readinessSummary.nextSteps
    : [];

  return {
    total: state.accounts.length,
    ready,
    actionRequired,
    running,
    runtimeLabel: running ? "Running" : ready > 1 && actionRequired === 0 ? "Ready to start" : "Waiting for setup",
    lastCompletedAt,
    nextPollAt,
    currentPollDelaySeconds: Number(runtimeStatus.currentPollDelaySeconds || runtimeStatus.intervalSeconds || 0),
    consecutiveFailures: Number(runtimeStatus.consecutiveFailures || 0),
    nextSteps
  };
}

export function formatTimestamp(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function buildAccountDraft({ provider, email, caldavPassword = "" }) {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) throw new Error("Enter the calendar account email.");
  return {
    id: sanitizeName(`${provider}-${normalizedEmail}`),
    label: `${providerLabel(provider)}: ${normalizedEmail}`,
    email: normalizedEmail,
    provider,
    scope: provider === "m365" ? "work" : "personal",
    calendarRole: provider === "m365" ? "employer-work" : (provider === "apple-caldav" ? "shared-family" : "personal"),
    sourcePrefix: defaultPrefix(normalizedEmail, provider),
    connectionStatus: "pending",
    caldavServerUrl: provider === "apple-caldav" ? "https://caldav.icloud.com" : "",
    caldavUsername: provider === "apple-caldav" ? normalizedEmail : "",
    caldavPassword: provider === "apple-caldav" ? String(caldavPassword || "").trim() : ""
  };
}

export function buildConfigPayload(state, { origin, timezone } = {}) {
  const caldavPasswords = {};
  state.accounts.forEach((account) => {
    if (account.provider === "apple-caldav" && account.caldavPassword) {
      caldavPasswords[account.id] = account.caldavPassword;
    }
  });
  return {
    profileName: state.profileName,
    marvinEmail: state.operator.email,
    marvinAccount: {
      email: state.operator.email,
      displayName: state.operator.displayName
    },
    timezone: timezone || "America/New_York",
    syncWindowDays: Number(state.config?.syncWindowDays || 45),
    accounts: state.accounts,
    eventOverrides: Array.isArray(state.config?.eventOverrides) ? state.config.eventOverrides : [],
    preferences: {
      defaultDetailMode: "full",
      defaultVisibility: "private",
      familyDetailMode: "full",
      familyVisibility: "default",
      copyLocationToFamily: true,
      copyDescriptionToFamily: true,
      preserveOriginalTimezone: true,
      ...(state.config?.preferences || {})
    },
    providerSecrets: { caldavPasswords },
    deployment: {
      ...(state.config?.deployment || {}),
      marvinUrl: origin || state.config?.deployment?.marvinUrl || ""
    }
  };
}
