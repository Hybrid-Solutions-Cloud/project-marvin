
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assessProfileConnections, buildProviderRuntime, getProviderAuthUrl, getProviderRuntime } from "../solutions/marvin-engine/src/util/provider-connections.mjs";
import { validateCalDavCredentials } from "../solutions/marvin-engine/src/util/caldav-connection.mjs";
import { FileStateStore } from "../solutions/marvin-engine/src/storage/file-state-store.mjs";
import { FileTokenStore, buildTokenStorePath } from "../solutions/marvin-engine/src/storage/file-token-store.mjs";
import { startRuntimeProcess, stopRuntimeProcess, getRuntimeProcessStatus } from "../solutions/marvin-engine/src/util/runtime-process.mjs";
import { getTokenRecord, isTokenRecordUsable } from "../solutions/marvin-engine/src/util/token-state.mjs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.env.MARVIN_ROOT_DIR || process.cwd());
const appRoot = path.resolve(process.env.MARVIN_APP_DIR || process.cwd());
const uiRoot = path.join(appRoot, "operator-ui");
const publicRoot = path.join(uiRoot, "public");
const stateRoot = path.join(root, ".marvin");
const operatorsRoot = path.join(stateRoot, "operators");
const latestStatePath = path.join(stateRoot, "latest.json");
const port = Number(process.env.MARVIN_UI_PORT || 4177);
const deployEnabled = (process.env.MARVIN_DEPLOY_ENABLED || "true").toLowerCase() === "true";
const hostedMode = (process.env.MARVIN_HOSTED || "false").toLowerCase() === "true";
const mockMicrosoftTokenUrl = normalizeString(process.env.MARVIN_MOCK_MICROSOFT_TOKEN_URL);
const mockGoogleTokenUrl = normalizeString(process.env.MARVIN_MOCK_GOOGLE_TOKEN_URL);
const sessionCookieName = "marvin_session";
const sessionTtlSeconds = 60 * 60 * 12;
const sessionStore = new Map();

const mimeMap = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function sendBuffer(res, statusCode, body, contentType = "application/octet-stream") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": body.length
  });
  res.end(body);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function writeText(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data, "utf8");
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword?.salt || !storedPassword?.hash) {
    return false;
  }
  const candidate = crypto.scryptSync(String(password || ""), storedPassword.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(storedPassword.hash, "hex"));
}

function listOperators() {
  if (!fs.existsSync(operatorsRoot)) {
    return [];
  }
  return fs.readdirSync(operatorsRoot)
    .filter((name) => name.endsWith(".account.json"))
    .map((name) => readJson(path.join(operatorsRoot, name), null))
    .filter(Boolean);
}

function getPrimaryOperator() {
  const latest = getLatestState();
  if (latest.operatorEmail) {
    const latestOperator = readJson(getOperatorPath(latest.operatorEmail), null);
    if (latestOperator) {
      return latestOperator;
    }
  }
  return listOperators()[0] || null;
}

function toPublicOperator(operator) {
  return operator ? {
    displayName: operator.displayName,
    email: operator.email,
    createdAt: operator.createdAt,
    updatedAt: operator.updatedAt
  } : null;
}

function parseCookies(req) {
  const header = String(req?.headers?.cookie || "");
  return Object.fromEntries(header.split(";").map((segment) => segment.trim()).filter(Boolean).map((segment) => {
    const index = segment.indexOf("=");
    if (index < 0) return [segment, ""];
    return [segment.slice(0, index), decodeURIComponent(segment.slice(index + 1))];
  }));
}

function buildSessionCookie(token) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionTtlSeconds}`;
}

function buildClearedSessionCookie() {
  return `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessionStore.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) sessionStore.delete(token);
  }
}

function createSession(operator) {
  pruneExpiredSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + (sessionTtlSeconds * 1000);
  sessionStore.set(token, { operatorEmail: operator.email, expiresAt });
  return { token, expiresAt, operator: toPublicOperator(operator), cookie: buildSessionCookie(token) };
}

function getAuthContext(req) {
  pruneExpiredSessions();
  const token = parseCookies(req)[sessionCookieName] || "";
  if (!token) return { authenticated: false, operator: null, sessionToken: "" };
  const session = sessionStore.get(token);
  if (!session) return { authenticated: false, operator: null, sessionToken: token };
  const operator = readJson(getOperatorPath(session.operatorEmail), null);
  if (!operator) {
    sessionStore.delete(token);
    return { authenticated: false, operator: null, sessionToken: token };
  }
  return { authenticated: true, operator, sessionToken: token };
}

function createAuthError(message = "Sign in to the Marvin workspace account to continue.") {
  const error = new Error(message);
  error.statusCode = 401;
  error.payload = { ok: false, error: message, requiresLogin: true };
  return error;
}

function requireAuth(req) {
  const auth = getAuthContext(req);
  if (!auth.authenticated || !auth.operator) throw createAuthError();
  return auth;
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => !normalizeString(payload?.[field]));
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
}

function getOperatorPath(email) {
  return path.join(operatorsRoot, `${sanitizeName(email)}.account.json`);
}

function getConfigPath(profileName) {
  return path.join(stateRoot, `${sanitizeName(profileName)}.setup.json`);
}

function getProfilePath(profileName) {
  return path.join(root, "profiles", `${sanitizeName(profileName)}.json`);
}

function getEventsPath(profileName) {
  return path.join(root, "profiles", `${sanitizeName(profileName)}.events.json`);
}

function getConnectionStatePath(profileName) {
  return path.join(stateRoot, "connections", `${sanitizeName(profileName)}.connections.json`);
}

function getTokenStatePath(profileName) {
  return buildTokenStorePath(root, profileName);
}
function getProviderSecretsPath(profileName) {
  return path.join(stateRoot, "provider-secrets", `${sanitizeName(profileName)}.secrets.json`);
}
function getRuntimeStatusPath(profileName) {
  return path.join(stateRoot, "runtime", `${sanitizeName(profileName)}.runtime.json`);
}



function getLatestState() {
  return readJson(latestStatePath, { operatorEmail: "", profileName: "" });
}

function setLatestState(nextState) {
  writeJson(latestStatePath, nextState);
}

function loadRuntimeStatus(profileName) {
  if (!normalizeString(profileName)) {
    return null;
  }
  return readJson(getRuntimeStatusPath(profileName), null);
}

function loadRuntimeProcessStatus(profileName) {
  if (!normalizeString(profileName)) {
    return null;
  }
  return getRuntimeProcessStatus(root, profileName);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRuntimeCondition(profileName, predicate, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 4000);
  const intervalMs = Number(options.intervalMs || 200);
  const started = Date.now();
  do {
    const runtimeStatus = loadRuntimeStatus(profileName);
    const runtimeProcess = loadRuntimeProcessStatus(profileName);
    if (predicate(runtimeStatus, runtimeProcess)) {
      return { runtimeStatus, runtimeProcess };
    }
    await sleep(intervalMs);
  } while (Date.now() - started < timeoutMs);
  return {
    runtimeStatus: loadRuntimeStatus(profileName),
    runtimeProcess: loadRuntimeProcessStatus(profileName)
  };
}

function getConnectionStore(profileName) {
  return new FileStateStore(getConnectionStatePath(profileName), { records: [] });
}

function loadConnectionState(profileName) {
  return getConnectionStore(profileName).load();
}

function saveConnectionState(profileName, state) {
  getConnectionStore(profileName).save(state);
}

function getTokenStore(profileName) {
  return new FileTokenStore(getTokenStatePath(profileName));
}

function loadTokenState(profileName) {
  return getTokenStore(profileName).load();
}

function saveTokenState(profileName, state) {
  getTokenStore(profileName).save(state);
}

function normalizeSecretMap(input = {}) {
  return Object.fromEntries(Object.entries(input && typeof input === "object" ? input : {}).map(([key, value]) => [sanitizeName(key), normalizeString(value)]).filter(([, value]) => value));
}

function normalizeProviderSecrets(input = {}) {
  return {
    microsoftClientSecret: normalizeString(input.microsoftClientSecret),
    googleClientSecret: normalizeString(input.googleClientSecret),
    caldavPassword: normalizeString(input.caldavPassword),
    caldavPasswords: normalizeSecretMap(input.caldavPasswords)
  };
}

function loadProviderSecrets(profileName) {
  return normalizeProviderSecrets(readJson(getProviderSecretsPath(profileName), {}));
}

function saveProviderSecrets(profileName, nextSecrets, preserveExisting = true) {
  const current = preserveExisting ? loadProviderSecrets(profileName) : normalizeProviderSecrets({});
  const requested = normalizeProviderSecrets(nextSecrets);
  const merged = {
    microsoftClientSecret: requested.microsoftClientSecret || current.microsoftClientSecret || "",
    googleClientSecret: requested.googleClientSecret || current.googleClientSecret || "",
    caldavPassword: requested.caldavPassword || current.caldavPassword || "",
    caldavPasswords: { ...current.caldavPasswords, ...requested.caldavPasswords }
  };
  writeJson(getProviderSecretsPath(profileName), merged);
  return merged;
}

function describeProviderSecretStatus(secrets = {}) {
  return {
    microsoftClientSecretConfigured: Boolean(normalizeString(secrets.microsoftClientSecret)),
    googleClientSecretConfigured: Boolean(normalizeString(secrets.googleClientSecret)),
    caldavPasswordConfigured: Boolean(normalizeString(secrets.caldavPassword) || Object.keys(secrets.caldavPasswords || {}).length > 0),
    caldavPasswordsConfigured: Object.fromEntries(Object.keys(secrets.caldavPasswords || {}).map((key) => [sanitizeName(key), true]))
  };
}

function upsertTokenStateRecord(profileName, calendar, nextValues) {
  const state = loadTokenState(profileName);
  const records = Array.isArray(state?.records) ? state.records.slice() : [];
  const index = records.findIndex((item) => item.calendarId === calendar.id);
  const current = index >= 0 ? records[index] : { calendarId: calendar.id, provider: calendar.provider, email: calendar.email };
  const next = { ...current, ...nextValues, calendarId: calendar.id, provider: calendar.provider, email: calendar.email };
  if (index >= 0) {
    records[index] = next;
  } else {
    records.push(next);
  }
  saveTokenState(profileName, { records });
  return next;
}

function resolveOperatorEmail(payload, fallback = "") {
  return normalizeString(payload?.marvinEmail || payload?.marvinOperator || payload?.marvinAccount?.email || fallback);
}
function makeSourcePrefix(label, sourcePrefix, fallbackProvider) {
  const trimmed = normalizeString(sourcePrefix);
  if (trimmed) {
    return trimmed.endsWith(":") ? `${trimmed} ` : trimmed.endsWith(": ") ? trimmed : `${trimmed}: `;
  }
  const base = String(label || fallbackProvider || "CAL").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] || "CAL";
  return `${base}: `;
}

function normalizeInboundOverrides(account = {}) {
  const visibility = normalizeString(account.inboundVisibility || account.inboundOverrides?.visibility);
  const detailMode = normalizeString(account.inboundDetailMode || account.inboundOverrides?.detailMode);
  const hasCopyLocation = typeof account.inboundCopyLocation === "boolean" || typeof account.inboundOverrides?.copyLocation === "boolean";
  const hasCopyDescription = typeof account.inboundCopyDescription === "boolean" || typeof account.inboundOverrides?.copyDescription === "boolean";
  const overrides = {};
  if (visibility === "private" || visibility === "default") overrides.visibility = visibility;
  if (detailMode === "busy" || detailMode === "subject" || detailMode === "full") overrides.detailMode = detailMode;
  if (hasCopyLocation) overrides.copyLocation = Boolean(typeof account.inboundCopyLocation === "boolean" ? account.inboundCopyLocation : account.inboundOverrides?.copyLocation);
  if (hasCopyDescription) overrides.copyDescription = Boolean(typeof account.inboundCopyDescription === "boolean" ? account.inboundCopyDescription : account.inboundOverrides?.copyDescription);
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
function buildProviderConnections(input = {}) {
  const runtime = buildProviderRuntime({
    providerConnections: input.providerConnections,
    deployment: input.deployment,
    marvinUrl: input.deployment?.marvinUrl,
    microsoftClientId: input.providerCredentials?.microsoftClientId || input.microsoftClientId,
    googleClientId: input.providerCredentials?.googleClientId || input.googleClientId,
    providerSecrets: input.providerSecrets,
    providerSecretStatus: input.providerSecretStatus
  });
  runtime.caldav = {
    ...runtime.caldav,
    passwords: normalizeSecretMap(input.providerSecrets?.caldavPasswords),
    passwordConfigured: Boolean(input.providerSecretStatus?.caldavPasswordConfigured || normalizeString(input.providerSecrets?.caldavPassword) || Object.keys(input.providerSecrets?.caldavPasswords || {}).length)
  };
  return runtime;
}

function buildAccounts(input) {
  return (Array.isArray(input?.accounts) ? input.accounts : []).map((account, index) => ({
    id: sanitizeName(account.id || `${account.provider || "account"}-${index + 1}`),
    label: normalizeString(account.label || `Calendar ${index + 1}`),
    provider: normalizeString(account.provider || "m365"),
    email: normalizeString(account.email),
    tenantId: normalizeString(account.tenantId),
    scope: normalizeString(account.scope || "work"),
    sourcePrefix: makeSourcePrefix(account.label, account.sourcePrefix, account.provider),
    inboundOverrides: normalizeInboundOverrides(account),
    connectionStatus: normalizeString(account.connectionStatus || "pending"),
    connectedAt: normalizeString(account.connectedAt),
    caldavServerUrl: normalizeString(account.caldavServerUrl),
    caldavUsername: normalizeString(account.caldavUsername) || normalizeString(account.email)
  })).filter((account) => account.label && account.provider && account.email);
}

function buildTargetPolicy(source, target, preferences) {
  const isFamily = target.scope === "family";
  const inbound = target.inboundOverrides || {};
  return {
    calendarId: target.id,
    visibility: inbound.visibility || (isFamily ? (preferences.familyVisibility || "default") : (preferences.defaultVisibility || "private")),
    detailMode: inbound.detailMode || (isFamily ? (preferences.familyDetailMode || "full") : (preferences.defaultDetailMode || "subject")),
    subjectPrefix: source.sourcePrefix,
    copyLocation: typeof inbound.copyLocation === "boolean" ? inbound.copyLocation : (isFamily ? Boolean(preferences.copyLocationToFamily ?? true) : false),
    copyDescription: typeof inbound.copyDescription === "boolean" ? inbound.copyDescription : (isFamily ? Boolean(preferences.copyDescriptionToFamily ?? true) : false)
  };
}

function buildProfile(input) {
    const calendars = buildAccounts(input).map((account) => ({
    id: account.id,
    label: account.label,
    provider: account.provider,
    email: account.email,
    tenantId: account.tenantId || undefined,
    scope: account.scope,
    sourcePrefix: account.sourcePrefix,
    inboundOverrides: account.inboundOverrides,
    connectionStatus: account.connectionStatus,
    connectedAt: account.connectedAt || undefined,
    optional: account.provider === "apple-caldav",
    caldavServerUrl: account.provider === "apple-caldav" ? (account.caldavServerUrl || undefined) : undefined,
    caldavUsername: account.provider === "apple-caldav" ? (account.caldavUsername || account.email || undefined) : undefined
  }));
  const preferences = {
    defaultDetailMode: input.preferences?.defaultDetailMode || "subject",
    defaultVisibility: input.preferences?.defaultVisibility || "private",
    familyDetailMode: input.preferences?.familyDetailMode || "full",
    familyVisibility: input.preferences?.familyVisibility || "default",
    subjectPrefix: input.preferences?.subjectPrefix || "SRC: ",
    copyLocationToFamily: Boolean(input.preferences?.copyLocationToFamily ?? true),
    copyDescriptionToFamily: Boolean(input.preferences?.copyDescriptionToFamily ?? true),
    preserveOriginalTimezone: Boolean(input.preferences?.preserveOriginalTimezone ?? true)
  };
  const deployment = {
    subscriptionId: normalizeString(input.deployment?.subscriptionId),
    workloadName: normalizeString(input.deployment?.workloadName || "marvin"),
    environment: normalizeString(input.deployment?.environment || "dev"),
    regionShort: normalizeString(input.deployment?.regionShort || "wus3"),
    location: normalizeString(input.deployment?.location || "westus3"),
    instance: normalizeString(input.deployment?.instance || "01"),
    marvinUrl: normalizeString(input.deployment?.marvinUrl || `http://127.0.0.1:${port}`)
  };
  return {
    name: sanitizeName(input.profileName),
    timezone: input.timezone,
    syncWindowDays: Number(input.syncWindowDays || 45),
    privacyDefaults: {
      mirrorMode: preferences.defaultDetailMode,
      visibility: preferences.defaultVisibility,
      subjectPrefix: preferences.subjectPrefix,
      copyLocation: false,
      copyDescription: false,
      preserveOriginalTimezone: preferences.preserveOriginalTimezone
    },
    runtime: (() => {
      const runtime = {
        deployment,
        providerConnections: buildProviderConnections({
          providerConnections: input.providerConnections,
          providerCredentials: input.providerCredentials,
          deployment,
          microsoftClientId: input.microsoftClientId,
          googleClientId: input.googleClientId
        })
      };
      if (normalizeString(input.automationTenantId) || normalizeString(input.automationEnvironmentUrl)) {
        runtime.powerAutomate = {
          automationTenantId: input.automationTenantId || "",
          environmentUrl: input.automationEnvironmentUrl || "",
          deploymentModel: "graph-http-entra-id",
          graphAppDisplayName: "Project Marvin Flow Runtime",
          supportedAccountTypes: "AzureADMultipleOrgs"
        };
      }
      return runtime;
    })(),
    calendars,
    routes: calendars.map((calendar) => ({
      source: calendar.id,
      targets: calendars.filter((item) => item.id !== calendar.id).map((target) => buildTargetPolicy(calendar, target, preferences))
    })).filter((route) => route.targets.length > 0)
  };
}

function buildEvents(profile) {
  return { events: profile.calendars.slice(0, 3).map((calendar, index) => ({
    id: `evt-${calendar.id}`,
    calendarId: calendar.id,
    subject: `Example ${calendar.label} event`,
    start: `2026-07-29T${String(9 + index).padStart(2, "0")}:00:00-04:00`,
    end: `2026-07-29T${String(10 + index).padStart(2, "0")}:00:00-04:00`,
    timezone: profile.timezone,
    location: index === 0 ? "Teams" : "Remote",
    description: `Mirrored from ${calendar.label}`,
    status: "confirmed"
  })) };
}

function getLocalMarvinBaseUrl() {
  return `http://127.0.0.1:${port}`;
}

function buildProviderRequirements(profile, providerCredentials = {}) {
  const calendars = Array.isArray(profile?.calendars) ? profile.calendars : [];
  const marvinBaseUrl = normalizeString(profile?.runtime?.deployment?.marvinUrl || getLocalMarvinBaseUrl()).replace(/\/$/, "");
  const microsoftNeeded = calendars.some((calendar) => calendar.provider === "m365" || calendar.provider === "outlook");
  const googleNeeded = calendars.some((calendar) => calendar.provider === "google");
  return {
    marvinBaseUrl,
    microsoft: {
      required: microsoftNeeded,
      clientIdConfigured: Boolean(normalizeString(providerCredentials.microsoftClientId)),
      signInAudience: "AzureADMultipleOrgs",
      suggestedDisplayName: "Project Marvin " + sanitizeName(profile?.name || "marvin") + " Microsoft",
      startUrl: marvinBaseUrl + "/marvin-api/oauth/microsoft/start",
      redirectUri: marvinBaseUrl + "/marvin-api/oauth/microsoft/callback",
      graphResourceAppId: "00000003-0000-0000-c000-000000000000",
      delegatedPermissions: [
        { name: "User.Read", id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d", type: "Scope" },
        { name: "Calendars.ReadWrite", id: "1ec239c2-d7c9-4623-a91a-a9775856bb36", type: "Scope" }
      ],
      oidcScopes: ["offline_access", "openid", "profile"]
    },
    google: {
      required: googleNeeded,
      clientIdConfigured: Boolean(normalizeString(providerCredentials.googleClientId)),
      suggestedDisplayName: "Project Marvin " + sanitizeName(profile?.name || "marvin") + " Google",
      startUrl: marvinBaseUrl + "/marvin-api/oauth/google/start",
      redirectUri: marvinBaseUrl + "/marvin-api/oauth/google/callback",
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar"]
    }
  };
}

function buildProviderAuthorizeRequest(profile, account, authState) {
  const providerRuntime = getProviderRuntime(profile, account?.provider);
  const marvinBaseUrl = normalizeString(providerRuntime?.marvinBaseUrl || getLocalMarvinBaseUrl()).replace(/\/$/, "");
  if (account?.provider === "m365" || account?.provider === "outlook") {
    const redirectUri = `${marvinBaseUrl}/marvin-api/oauth/microsoft/callback`;
    if (!normalizeString(providerRuntime?.clientId)) {
      return {
        provider: "microsoft",
        redirectUri,
        authorizeUrl: "",
        reason: "Set MICROSOFT_CLIENT_ID for Marvin before starting Microsoft sign-in."
      };
    }
    const tenantSegment = providerRuntime?.tenantMode === "single-tenant" && normalizeString(account?.tenantId)
      ? normalizeString(account.tenantId)
      : "organizations";
    const params = new URLSearchParams({
      client_id: providerRuntime.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "offline_access openid profile User.Read Calendars.ReadWrite",
      prompt: "select_account",
      state: authState
    });
    return {
      provider: "microsoft",
      redirectUri,
      authorizeUrl: `https://login.microsoftonline.com/${tenantSegment}/oauth2/v2.0/authorize?${params.toString()}`,
      reason: ""
    };
  }
  if (account?.provider === "google") {
    const redirectUri = `${marvinBaseUrl}/marvin-api/oauth/google/callback`;
    if (!normalizeString(providerRuntime?.clientId)) {
      return {
        provider: "google",
        redirectUri,
        authorizeUrl: "",
        reason: "Set GOOGLE_CLIENT_ID for Marvin before starting Google sign-in."
      };
    }
    const params = new URLSearchParams({
      client_id: providerRuntime.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      scope: "openid email profile https://www.googleapis.com/auth/calendar",
      state: authState
    });
    return {
      provider: "google",
      redirectUri,
      authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      reason: ""
    };
  }
  return {
    provider: account?.provider || "unknown",
    redirectUri: "",
    authorizeUrl: "",
    reason: "This provider does not have a live Marvin-owned sign-in flow yet."
  };
}

function buildConnectionLaunchUrl(profile, account, authState) {
  const providerRuntime = getProviderRuntime(profile, account?.provider);
  const marvinBaseUrl = normalizeString(providerRuntime?.marvinBaseUrl || getLocalMarvinBaseUrl()).replace(/\/$/, "");
  const request = buildProviderAuthorizeRequest(profile, account, authState);
  const startPath = request.provider === "microsoft"
    ? "/marvin-api/oauth/microsoft/start"
    : request.provider === "google"
      ? "/marvin-api/oauth/google/start"
      : "";
  return {
    provider: request.provider,
    redirectUri: request.redirectUri,
    launchUrl: startPath && request.authorizeUrl ? `${marvinBaseUrl}${startPath}?state=${encodeURIComponent(authState)}` : "",
    authorizeUrl: request.authorizeUrl,
    ready: Boolean(request.authorizeUrl),
    reason: request.reason
  };
}

function findConnectionStateByAuthState(authState) {
  const connectionDir = path.join(stateRoot, "connections");
  if (!authState || !fs.existsSync(connectionDir)) {
    return null;
  }
  for (const entry of fs.readdirSync(connectionDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.connections.json')) {
      continue;
    }
    const profileName = entry.name.replace(/\.connections\.json$/i, '');
    const filePath = path.join(connectionDir, entry.name);
    const state = readJson(filePath, { records: [] });
    const record = Array.isArray(state?.records) ? state.records.find((item) => item?.authSession?.state === authState) : null;
    if (record) {
      return { profileName, filePath, state, record };
    }
  }
  return null;
}

function renderAuthCompletionHtml(title, message, ok = true) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:Verdana,Geneva,sans-serif;background:#0b1117;color:#eef3f8;margin:0;padding:32px}main{max-width:720px;margin:0 auto;border:1px solid #2f4355;border-radius:20px;padding:24px;background:#101922}h1{margin:0 0 12px;font-family:Georgia,'Times New Roman',serif}p{line-height:1.6;color:#c5d5e3}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:${ok ? 'rgba(121,217,167,.12)' : 'rgba(255,140,140,.12)'};color:${ok ? '#79d9a7' : '#ff8c8c'};border:1px solid ${ok ? 'rgba(121,217,167,.25)' : 'rgba(255,140,140,.25)'};margin-bottom:12px}</style></head><body><main><div class="badge">${ok ? 'Auth Captured' : 'Auth Error'}</div><h1>${title}</h1><p>${message}</p><p>You can return to Marvin now and continue the connection flow from the management console.</p></main></body></html>`;
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html)
  });
  res.end(html);
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function decodeJwtPayload(token) {
  const value = normalizeString(token);
  if (!value || value.split(".").length < 2) {
    return {};
  }
  try {
    const payload = value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "="), "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function resolveProviderClientSecret(provider, profileName = "") {
  const localSecrets = profileName ? loadProviderSecrets(profileName) : normalizeProviderSecrets({});
  if (provider === "microsoft") {
    return normalizeString(localSecrets.microsoftClientSecret || process.env.MICROSOFT_CLIENT_SECRET || process.env.MARVIN_MICROSOFT_CLIENT_SECRET);
  }
  if (provider === "google") {
    return normalizeString(localSecrets.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || process.env.MARVIN_GOOGLE_CLIENT_SECRET);
  }
  if (provider === "caldav") {
    return normalizeString(localSecrets.caldavPassword || process.env.MARVIN_CALDAV_PASSWORD);
  }
  return "";
}

function getCalDavPasswordForCalendar(profileName, calendarId = "") {
  const localSecrets = profileName ? loadProviderSecrets(profileName) : normalizeProviderSecrets({});
  const normalizedCalendarId = sanitizeName(calendarId);
  return normalizeString(localSecrets.caldavPasswords?.[normalizedCalendarId] || localSecrets.caldavPassword || process.env.MARVIN_CALDAV_PASSWORD);
}

async function validateCalDavCalendarConnection(profile, calendar) {
  const providerRuntime = getProviderRuntime(profile, calendar?.provider);
  const password = getCalDavPasswordForCalendar(profile?.name, calendar?.id);
  return validateCalDavCredentials({
    serverUrl: calendar?.caldavServerUrl || providerRuntime?.serverUrl,
    username: calendar?.caldavUsername || providerRuntime?.username || calendar?.email,
    password
  });
}

function createValidationAdapters(profileName, profile, providerSecrets, tokenState) {
  const onTokenStateChange = async (nextState) => {
    saveTokenState(profileName, nextState);
    tokenState.records = Array.isArray(nextState?.records) ? nextState.records.slice() : [];
  };

  return {
    microsoft: new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, onTokenStateChange }),
    google: new GoogleCalendarAdapter({ profile, tokenState, providerSecrets, onTokenStateChange }),
    caldav: new CalDavAdapter({ profile, tokenState, providerSecrets })
  };
}

async function validateCalendarLiveAccess(profile, calendar, tokenState, providerSecrets) {
  const validatedAt = new Date().toISOString();

  if (calendar.provider === "apple-caldav") {
    const validation = await validateCalDavCalendarConnection(profile, calendar);
    return {
      ok: Boolean(validation.ok),
      status: validation.ok ? "connected" : "invalid",
      validatedAt,
      message: validation.message || (validation.ok ? "Marvin validated the Apple / CalDAV credentials for this calendar." : "Marvin could not validate the Apple / CalDAV credentials for this calendar.")
    };
  }

  const adapters = createValidationAdapters(profile.name, profile, providerSecrets, tokenState);
  const adapter = calendar.provider === "google" ? adapters.google : adapters.microsoft;
  const providerName = calendar.provider === "google" ? "Google Calendar" : "Microsoft Graph";

  try {
    const existingRecord = getTokenRecord(tokenState, calendar.id);
    if (!existingRecord?.accessToken && !existingRecord?.refreshToken) {
      return {
        ok: false,
        status: "pending",
        validatedAt,
        message: "Marvin does not have a usable " + providerName + " token for this calendar yet. Finish provider sign-in first."
      };
    }

    const tokenRecord = await adapter.ensureUsableToken(calendar);
    const latestRecord = getTokenRecord(tokenState, calendar.id) || tokenRecord;
    if (!isTokenRecordUsable(latestRecord)) {
      return {
        ok: false,
        status: normalizeString(latestRecord?.lastError) ? "invalid" : "pending",
        validatedAt,
        message: normalizeString(latestRecord?.lastError) || ("Marvin does not have a usable " + providerName + " token for this calendar yet. Finish provider sign-in first.")
      };
    }

    await adapter.listSourceEvents(calendar, {
      windowStart: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      timezone: profile.timezone || "UTC"
    });

    return {
      ok: true,
      status: "connected",
      validatedAt,
      message: "Marvin verified live " + providerName + " access for this calendar."
    };
  } catch (error) {
    return {
      ok: false,
      status: "invalid",
      validatedAt,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function exchangeAuthorizationCode(profile, calendar, authSession) {
  const providerRuntime = getProviderRuntime(profile, calendar.provider);
  const provider = calendar.provider === "google" ? "google" : "microsoft";
  const clientId = normalizeString(providerRuntime?.clientId);
  const clientSecret = resolveProviderClientSecret(provider, profile?.name);
  const authorizationCode = normalizeString(authSession?.authorizationCode);
  const redirectUri = normalizeString(authSession?.redirectUri);
  if (!authorizationCode) {
    return { exchanged: false, reason: "missing-authorization-code", message: "Authorization code was not present in the callback." };
  }
  if (!clientId) {
    return { exchanged: false, reason: "missing-client-id", message: "Client ID is missing from Marvin provider runtime." };
  }
  if (!clientSecret) {
    return { exchanged: false, reason: "missing-client-secret", message: `Set the corresponding provider client secret in Marvin before token exchange can complete.` };
  }
  if (!redirectUri) {
    return { exchanged: false, reason: "missing-redirect-uri", message: "Redirect URI was not recorded for this authorization request." };
  }
  let tokenUrl = "";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  if (provider === "microsoft") {
    const tenantSegment = providerRuntime?.tenantMode === "single-tenant" && normalizeString(calendar.tenantId) ? normalizeString(calendar.tenantId) : "organizations";
    tokenUrl = mockMicrosoftTokenUrl || `https://login.microsoftonline.com/${tenantSegment}/oauth2/v2.0/token`;
    body.set("scope", "offline_access openid profile User.Read Calendars.ReadWrite");
  } else {
    tokenUrl = mockGoogleTokenUrl || "https://oauth2.googleapis.com/token";
  }
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !normalizeString(payload?.access_token)) {
    return {
      exchanged: false,
      reason: "token-exchange-failed",
      message: normalizeString(payload?.error_description || payload?.error || `Token endpoint returned HTTP ${response.status}.`),
      providerPayload: payload
    };
  }
  const obtainedAt = new Date();
  const expiresIn = Number(payload?.expires_in || 0);
  const expiresAt = expiresIn > 0 ? new Date(obtainedAt.getTime() + expiresIn * 1000).toISOString() : "";
  const claims = decodeJwtPayload(payload?.id_token);
  const accountRef = normalizeString(claims?.oid || claims?.sub || claims?.email);
  return {
    exchanged: true,
    tokenRecord: {
      status: "connected",
      accessToken: normalizeString(payload?.access_token),
      refreshToken: normalizeString(payload?.refresh_token),
      tokenType: normalizeString(payload?.token_type || "Bearer"),
      scope: normalizeString(payload?.scope || authSession?.scope),
      expiresAt,
      obtainedAt: obtainedAt.toISOString(),
      accountRef,
      idTokenClaims: claims,
      lastError: ""
    }
  };
}

async function runCommand(command, args, options = {}) {
  return execFileAsync(command, args, { cwd: appRoot, windowsHide: true, maxBuffer: 1024 * 1024 * 20, ...options });
}

async function generateArtifacts(profilePath) {
  await runCommand("node", [path.join("scripts", "build-calendar-options.mjs"), profilePath]);
}

function loadConfigBundle(profileName) {
  return {
    configPath: getConfigPath(profileName),
    profilePath: getProfilePath(profileName),
    eventsPath: getEventsPath(profileName),
    config: readJson(getConfigPath(profileName), null),
    profile: readJson(getProfilePath(profileName), null),
    events: readJson(getEventsPath(profileName), null),
    connectionState: loadConnectionState(profileName),
    tokenState: loadTokenState(profileName),
    providerSecrets: loadProviderSecrets(profileName)
  };
}

function synchronizeConnectionState(profile, existingState = { records: [] }) {
  const previous = Array.isArray(existingState?.records) ? existingState.records : [];
  return {
    records: profile.calendars.map((calendar) => {
      const match = previous.find((record) => record.calendarId === calendar.id);
      return {
        calendarId: calendar.id,
        provider: calendar.provider,
        email: calendar.email,
        status: match?.status || calendar.connectionStatus || "pending",
        connectedAt: match?.connectedAt || calendar.connectedAt || "",
        lastValidatedAt: match?.lastValidatedAt || "",
        accountRef: match?.accountRef || "",
        authSession: match?.authSession || null
      };
    })
  };
}

function mergeProfileWithConnectionState(profile, connectionState) {
  const records = Array.isArray(connectionState?.records) ? connectionState.records : [];
  return {
    ...profile,
    calendars: profile.calendars.map((calendar) => {
      const match = records.find((record) => record.calendarId === calendar.id);
      return match ? { ...calendar, connectionStatus: match.status || calendar.connectionStatus, connectedAt: match.connectedAt || calendar.connectedAt } : calendar;
    })
  };
}

function summarizeTokenStateForUi(tokenState, calendars = []) {
  const summary = {
    total: calendars.length,
    usable: 0,
    pending: 0,
    expired: 0,
    error: 0,
    missing: 0
  };
  for (const calendar of calendars) {
    const record = getTokenRecord(tokenState, calendar.id);
    if (!record) {
      summary.missing += 1;
      continue;
    }
    if (record.status === "pending") {
      summary.pending += 1;
      continue;
    }
    if (record.status === "error") {
      summary.error += 1;
      continue;
    }
    if (isTokenRecordUsable(record)) {
      summary.usable += 1;
      continue;
    }
    summary.expired += 1;
  }
  return summary;
}

function describeTokenRecord(record) {
  if (!record) {
    return {
      tokenStatus: "missing",
      tokenReason: "Provider authentication has not completed yet.",
      tokenExpiresAt: ""
    };
  }
  if (record.status === "pending") {
    return {
      tokenStatus: "pending",
      tokenReason: record.lastError || "Provider consent completed, but token exchange still needs provider credentials.",
      tokenExpiresAt: normalizeString(record.expiresAt)
    };
  }
  if (record.status === "error") {
    return {
      tokenStatus: "error",
      tokenReason: record.lastError || "Token exchange failed.",
      tokenExpiresAt: normalizeString(record.expiresAt)
    };
  }
  if (isTokenRecordUsable(record)) {
    return {
      tokenStatus: "usable",
      tokenReason: "",
      tokenExpiresAt: normalizeString(record.expiresAt)
    };
  }
  return {
    tokenStatus: "expired",
    tokenReason: record.lastError || "Token exists but is expired or incomplete.",
    tokenExpiresAt: normalizeString(record.expiresAt)
  };
}

function describeAccountReadiness(account) {
  const providerLabel = account.provider === "m365" ? "Microsoft 365" : account.provider === "outlook" ? "Outlook" : account.provider === "google" ? "Google Calendar" : account.provider === "apple-caldav" ? "Apple / CalDAV" : "Calendar";
  if (account.connectionStatus === "connected") {
    if (account.provider === "apple-caldav") {
      return {
        readinessState: "ready",
        readinessLabel: "Ready",
        readinessDetail: "Apple / CalDAV credentials validated and ready for Marvin automation.",
        nextActionLabel: "None"
      };
    }
    if (account.tokenStatus === "usable") {
      return {
        readinessState: "ready",
        readinessLabel: "Ready",
        readinessDetail: `${providerLabel} sign-in completed and Marvin has a usable token.`,
        nextActionLabel: "None"
      };
    }
    if (account.tokenStatus === "expired") {
      return {
        readinessState: "action-required",
        readinessLabel: "Reconnect Or Validate",
        readinessDetail: `${providerLabel} is marked connected, but the stored token is expired or incomplete.`,
        nextActionLabel: "Validate Access"
      };
    }
    if (account.tokenStatus === "pending") {
      return {
        readinessState: "action-required",
        readinessLabel: "Finish Token Exchange",
        readinessDetail: `${providerLabel} sign-in returned to Marvin, but token exchange has not finished yet.`,
        nextActionLabel: "Refresh Or Validate"
      };
    }
    if (account.tokenStatus === "error") {
      return {
        readinessState: "action-required",
        readinessLabel: "Fix Provider Auth",
        readinessDetail: `${providerLabel} token exchange failed. Review the provider error and reconnect.`,
        nextActionLabel: "Reconnect"
      };
    }
  }
  if (account.connectionStatus === "connector-not-ready") {
    return {
      readinessState: "action-required",
      readinessLabel: "Finish Access Setup",
      readinessDetail: account.connectionReason || `${providerLabel} still needs access setup before Marvin can connect it.`,
      nextActionLabel: account.provider === "apple-caldav" ? "Add App Password" : "Open Access Settings"
    };
  }
  if (account.connectionStatus === "invalid") {
    return {
      readinessState: "action-required",
      readinessLabel: "Fix And Validate",
      readinessDetail: account.connectionReason || `${providerLabel} has invalid setup or failed validation.`,
      nextActionLabel: "Validate Access"
    };
  }
  if (account.provider === "apple-caldav") {
    return {
      readinessState: "action-required",
      readinessLabel: account.caldavPasswordConfigured ? "Validate Credentials" : "Add App Password",
      readinessDetail: account.caldavPasswordConfigured ? "Apple / CalDAV still needs Marvin-side credential validation." : "Apple / CalDAV needs a server URL, username, and app password before validation can succeed.",
      nextActionLabel: account.caldavPasswordConfigured ? "Validate Access" : "Edit Calendar"
    };
  }
  if (account.authCallbackReceivedAt && account.tokenStatus !== "usable") {
    return {
      readinessState: "action-required",
      readinessLabel: "Finish Provider Return",
      readinessDetail: `${providerLabel} returned to Marvin, but the connection still needs refresh or validation to settle.`,
      nextActionLabel: "Refresh Or Validate"
    };
  }
  if (account.authRequestedAt || account.authStartVisitedAt) {
    return {
      readinessState: "action-required",
      readinessLabel: "Finish Sign-In",
      readinessDetail: `${providerLabel} sign-in started, but Marvin has not confirmed a usable connection yet.`,
      nextActionLabel: "Complete Provider Sign-In"
    };
  }
  return {
    readinessState: "action-required",
    readinessLabel: "Connect Account",
    readinessDetail: `${providerLabel} is configured in Marvin, but provider sign-in or validation has not finished yet.`,
    nextActionLabel: "Connect"
  };
}

function buildReadinessSummary(accounts, runtimeStatus, runtimeProcess) {
  const summary = {
    total: accounts.length,
    ready: 0,
    actionRequired: 0,
    automationRunning: Boolean(runtimeProcess?.running || runtimeStatus?.running),
    readyToStartAutomation: false,
    overallState: "not-ready",
    nextSteps: []
  };
  const nextSteps = [];
  for (const account of accounts) {
    if (account.readinessState === "ready") {
      summary.ready += 1;
      continue;
    }
    summary.actionRequired += 1;
    const action = account.nextActionLabel || "Review Account";
    nextSteps.push(`${account.label}: ${action}. ${account.readinessDetail || account.connectionReason || "Finish the remaining setup in Marvin."}`);
  }
  if (accounts.length < 2) {
    nextSteps.unshift("Add at least two calendars before expecting Marvin to mirror events between accounts.");
  }
  summary.readyToStartAutomation = accounts.length > 1 && summary.actionRequired === 0;
  if (summary.automationRunning) {
    summary.overallState = summary.actionRequired === 0 ? "running" : "running-with-gaps";
  } else if (summary.readyToStartAutomation) {
    summary.overallState = "ready-to-start";
    nextSteps.unshift("All current calendars look ready. Start Marvin automation when you are ready to keep them synced.");
  } else {
    summary.overallState = "action-required";
  }
  summary.nextSteps = nextSteps.slice(0, 8);
  return summary;
}
function materializeConfigFromProfile(profile, payload = {}, existingConfig = null, connectionState = { records: [] }, tokenState = { records: [] }, providerSecrets = normalizeProviderSecrets({})) {
  const effectiveProfile = mergeProfileWithConnectionState(profile, connectionState);
  const providerSecretStatus = describeProviderSecretStatus(providerSecrets);
  const providerCredentials = {
    microsoftClientId: payload.microsoftClientId || existingConfig?.providerCredentials?.microsoftClientId || profile.runtime?.providerConnections?.microsoft?.clientId || "",
    googleClientId: payload.googleClientId || existingConfig?.providerCredentials?.googleClientId || profile.runtime?.providerConnections?.google?.clientId || ""
  };
  const runtimeProviderConnections = buildProviderConnections({
    providerConnections: effectiveProfile.runtime?.providerConnections || existingConfig?.providerConnections || {},
    deployment: effectiveProfile.runtime?.deployment || existingConfig?.deployment || {},
    providerCredentials,
    providerSecretStatus,
    providerSecrets
  });
  const effectiveProfileForAssessment = {
    ...effectiveProfile,
    runtime: {
      ...(effectiveProfile.runtime || {}),
      providerConnections: runtimeProviderConnections
    }
  };
  const connectionSummary = assessProfileConnections(effectiveProfileForAssessment);
  const accounts = effectiveProfile.calendars.map((calendar) => {
    const assessment = connectionSummary.calendars.find((item) => item.calendarId === calendar.id);
    const record = connectionState.records.find((item) => item.calendarId === calendar.id);
    const tokenRecord = getTokenRecord(tokenState, calendar.id);
    const token = describeTokenRecord(tokenRecord);
    const readiness = describeAccountReadiness({
      provider: calendar.provider,
      label: calendar.label,
      connectionStatus: assessment?.status || calendar.connectionStatus,
      connectionReason: assessment?.reason || "",
      tokenStatus: token.tokenStatus,
      authRequestedAt: normalizeString(record?.authSession?.requestedAt),
      authStartVisitedAt: normalizeString(record?.authSession?.startVisitedAt),
      authCallbackReceivedAt: normalizeString(record?.authSession?.callbackReceivedAt),
      caldavPasswordConfigured: calendar.provider === "apple-caldav" ? Boolean(providerSecretStatus.caldavPasswordsConfigured?.[sanitizeName(calendar.id)] || providerSecrets.caldavPassword) : false,
    });
    return {
      id: calendar.id,
      label: calendar.label,
      provider: calendar.provider,
      email: calendar.email,
      tenantId: calendar.tenantId || "",
      scope: calendar.scope,
      sourcePrefix: calendar.sourcePrefix,
      inboundOverrides: calendar.inboundOverrides || {},
      connectionStatus: assessment?.status || calendar.connectionStatus,
      connectedAt: calendar.connectedAt || "",
      connectionReason: assessment?.reason || "",
      connectorReady: Boolean(assessment?.connectorReady),
      connectorMode: assessment?.connectorMode || "unconfigured",
      authUrl: assessment?.authUrl || "",
      supportsRealtime: Boolean(assessment?.supportsRealtime),
      lastValidatedAt: record?.lastValidatedAt || "",
      accountRef: record?.accountRef || "",
      authProvider: normalizeString(record?.authSession?.provider),
      authRequestedAt: normalizeString(record?.authSession?.requestedAt),
      authStartVisitedAt: normalizeString(record?.authSession?.startVisitedAt),
      authCallbackReceivedAt: normalizeString(record?.authSession?.callbackReceivedAt),
      authLastError: normalizeString(record?.authSession?.error),
      tokenStatus: token.tokenStatus,
      tokenReason: token.tokenReason,
      tokenExpiresAt: token.tokenExpiresAt,
      caldavServerUrl: calendar.provider === "apple-caldav" ? (calendar.caldavServerUrl || "") : "",
      caldavUsername: calendar.provider === "apple-caldav" ? (calendar.caldavUsername || calendar.email || "") : "",
      caldavPasswordConfigured: calendar.provider === "apple-caldav" ? Boolean(providerSecretStatus.caldavPasswordsConfigured?.[sanitizeName(calendar.id)] || providerSecrets.caldavPassword) : false,
      readinessState: readiness.readinessState,
      readinessLabel: readiness.readinessLabel,
      readinessDetail: readiness.readinessDetail,
      nextActionLabel: readiness.nextActionLabel
    };
  });
  const operatorEmail = resolveOperatorEmail(payload, existingConfig?.marvinOperator || "");
  const operatorDisplayName = normalizeString(payload?.marvinAccount?.displayName || existingConfig?.marvinDisplayName || "");
  const providerRequirements = buildProviderRequirements(effectiveProfileForAssessment, providerCredentials);
  const runtimeStatus = loadRuntimeStatus(effectiveProfile.name);
  const runtimeProcess = loadRuntimeProcessStatus(effectiveProfile.name);
  const readinessSummary = buildReadinessSummary(accounts, runtimeStatus, runtimeProcess);
  return {
    marvinOperator: operatorEmail,
    marvinDisplayName: operatorDisplayName,
    profileName: effectiveProfile.name,
    timezone: effectiveProfile.timezone,
    syncWindowDays: effectiveProfile.syncWindowDays,
    updatedAt: new Date().toISOString(),
    accounts,
    preferences: payload.preferences || existingConfig?.preferences || {},
    runtime: effectiveProfile.runtime,
    deployment: effectiveProfile.runtime?.deployment || existingConfig?.deployment || {},
    providerCredentials,
    providerConnections: effectiveProfile.runtime?.providerConnections || existingConfig?.providerConnections || buildProviderConnections({ providerCredentials }),
    providerSecretStatus: describeProviderSecretStatus(providerSecrets),
    providerRequirements,
    readinessSummary,
    connectionSummary,
    connectionState,
    tokenSummary: summarizeTokenStateForUi(tokenState, effectiveProfile.calendars),
    tokenState,
    runtimeStatus,
    runtimeProcess
  };
}

async function persistProfileAndConfig(profile, payload, existingConfig = null, existingConnectionState = null) {
  const profilePath = getProfilePath(profile.name);
  const eventsPath = getEventsPath(profile.name);
  const connectionState = synchronizeConnectionState(profile, existingConnectionState || loadConnectionState(profile.name));
  const tokenState = loadTokenState(profile.name);
  const providerSecrets = saveProviderSecrets(profile.name, payload.providerSecrets || {}, true);
  const config = materializeConfigFromProfile(profile, payload, existingConfig, connectionState, tokenState, providerSecrets);
  writeJson(profilePath, profile);
  writeJson(eventsPath, buildEvents(profile));
  saveConnectionState(profile.name, connectionState);
  writeJson(getConfigPath(profile.name), config);
  await generateArtifacts(profilePath);
  const latest = getLatestState();
  latest.operatorEmail = resolveOperatorEmail(payload, latest.operatorEmail);
  latest.profileName = profile.name;
  setLatestState(latest);
  return { profilePath, eventsPath, statePath: getConfigPath(profile.name), config };
}

async function handleCreateAccount(payload, auth = null) {
  requireFields(payload, ["marvinDisplayName", "marvinEmail"]);
  const primaryOperator = getPrimaryOperator();
  if (primaryOperator && !auth?.authenticated) throw createAuthError("Sign in to edit the Marvin workspace account.");
  const email = payload.marvinEmail.trim();
  const existing = readJson(getOperatorPath(email), null);
  const password = normalizeString(payload.marvinPassword);
  if (!existing && !password) throw new Error("Missing required fields: marvinPassword");
  const now = new Date().toISOString();
  const operator = {
    accountId: sanitizeName(email),
    displayName: payload.marvinDisplayName.trim(),
    email,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    password: password ? hashPassword(password) : existing?.password
  };
  if (!operator.password) throw new Error("Marvin account password is missing.");
  writeJson(getOperatorPath(operator.email), operator);
  setLatestState({ ...getLatestState(), operatorEmail: operator.email });
  const session = createSession(operator);
  let config = null;
  const latest = getLatestState();
  if (latest.profileName) {
    try { config = (await handleLoadConfig(latest.profileName)).config; }
    catch { config = readJson(getConfigPath(latest.profileName), null); }
  }
  return { operator: session.operator, authenticated: true, requiresLogin: false, config, nextStep: "accounts", headers: { "Set-Cookie": session.cookie } };
}

async function handleLogin(payload) {
  requireFields(payload, ["marvinEmail", "marvinPassword"]);
  const email = payload.marvinEmail.trim();
  const operator = readJson(getOperatorPath(email), null);
  if (!operator || !verifyPassword(payload.marvinPassword, operator.password)) throw createAuthError("Invalid Marvin workspace email or password.");
  setLatestState({ ...getLatestState(), operatorEmail: operator.email });
  const session = createSession(operator);
  let config = null;
  const latest = getLatestState();
  if (latest.profileName) {
    try { config = (await handleLoadConfig(latest.profileName)).config; }
    catch { config = readJson(getConfigPath(latest.profileName), null); }
  }
  return { operator: session.operator, authenticated: true, requiresLogin: false, config, headers: { "Set-Cookie": session.cookie } };
}

async function handleLogout(req) {
  const auth = getAuthContext(req);
  if (auth.sessionToken) sessionStore.delete(auth.sessionToken);
  return { signedOut: true, headers: { "Set-Cookie": buildClearedSessionCookie() } };
}

async function handleSaveConfig(payload) {
  payload = {
    ...payload,
    marvinEmail: resolveOperatorEmail(payload)
  };
  requireFields(payload, ["marvinEmail", "profileName", "timezone"]);
  const accounts = buildAccounts(payload);
  if (accounts.length === 0) throw new Error("Add at least one calendar account before continuing.");
  const profile = buildProfile({ ...payload, accounts });
  return { ...(await persistProfileAndConfig(profile, { ...payload, accounts })), nextStep: "console" };
}

async function handleLoadConfig(profileName) {
  if (!normalizeString(profileName)) {
    throw new Error("Profile name is required.");
  }
  const bundle = loadConfigBundle(profileName);
  if (!bundle.config || !bundle.profile) {
    throw new Error("Profile not found.");
  }
  const connectionState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, connectionState, bundle.tokenState, bundle.providerSecrets);
  writeJson(bundle.configPath, config);
  return { config, nextStep: "console" };
}

async function handleProviderRequirements(profileName) {
  const loaded = await handleLoadConfig(profileName);
  return {
    profileName: loaded.config.profileName,
    providerRequirements: loaded.config.providerRequirements || {}
  };
}

async function handleProviderPlan(profileName, provider) {
  const safeProfile = sanitizeName(profileName || "marvin.local");
  const bundle = loadConfigBundle(safeProfile);
  if (!bundle.config || !bundle.profile) {
    throw new Error("Profile not found.");
  }
  const normalizedProvider = normalizeString(provider).toLowerCase();
  const scriptName = normalizedProvider === "microsoft"
    ? "register-marvin-entra-app.ps1"
    : normalizedProvider === "google"
      ? "register-marvin-google-app.ps1"
      : "";
  if (!scriptName) {
    throw new Error("Unsupported provider plan request.");
  }
  const { stdout } = await execFileAsync("pwsh", [
    "-ExecutionPolicy", "Bypass",
    "-File", path.join("scripts", scriptName),
    "-ProfileName", bundle.profile.name,
    "-RootDir", root,
    "-EmitOnly"
  ], {
    cwd: appRoot,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10
  });
  const trimmed = String(stdout || "").trim();
  if (!trimmed) {
    throw new Error("Provider plan script returned no output.");
  }
  const requirements = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, bundle.connectionState, loadTokenState(bundle.profile.name), normalizeProviderSecrets(readJson(getProviderSecretsPath(bundle.profile.name), {}))).providerRequirements || {};
  const providerRequirements = normalizedProvider === "microsoft"
    ? requirements.microsoft || {}
    : normalizedProvider === "google"
      ? requirements.google || {}
      : {};
  const plan = {
    ...JSON.parse(trimmed),
    authorizePath: normalizedProvider === "microsoft"
      ? providerRequirements.startUrl ? "/marvin-api/oauth/microsoft/start" : "/marvin-api/oauth/microsoft/start"
      : normalizedProvider === "google"
        ? providerRequirements.startUrl ? "/marvin-api/oauth/google/start" : "/marvin-api/oauth/google/start"
        : undefined,
    startUrl: providerRequirements.startUrl || undefined,
    redirectUri: providerRequirements.redirectUri || JSON.parse(trimmed).redirectUri
  };
  return {
    profileName: bundle.profile.name,
    provider: normalizedProvider,
    plan
  };
}

async function handleAccountUpsert(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const accounts = buildAccounts({ accounts: [...bundle.config.accounts.filter((item) => sanitizeName(item.id) !== sanitizeName(payload.account?.id || "")), payload.account] });
  const profile = buildProfile({ ...bundle.config, ...payload, profileName: bundle.profile.name, timezone: payload.timezone || bundle.profile.timezone, syncWindowDays: payload.syncWindowDays || bundle.profile.syncWindowDays, accounts, preferences: payload.preferences || bundle.config.preferences, deployment: payload.deployment || bundle.config.deployment, providerConnections: payload.providerConnections || bundle.config.providerConnections, providerCredentials: payload.providerCredentials || bundle.config.providerCredentials, automationTenantId: bundle.profile.runtime?.powerAutomate?.automationTenantId || "", automationEnvironmentUrl: bundle.profile.runtime?.powerAutomate?.environmentUrl || "" });
  return { ...(await persistProfileAndConfig(profile, { ...bundle.config, ...payload, accounts }, bundle.config, bundle.connectionState)), nextStep: "console" };
}

async function handleAccountRemove(payload) {
  requireFields(payload, ["profileName", "accountId"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const accounts = buildAccounts({ accounts: bundle.config.accounts.filter((item) => sanitizeName(item.id) !== sanitizeName(payload.accountId)) });
  if (accounts.length === 0) throw new Error("At least one calendar account must remain.");
  const profile = buildProfile({ ...bundle.config, profileName: bundle.profile.name, timezone: bundle.profile.timezone, syncWindowDays: bundle.profile.syncWindowDays, accounts, preferences: bundle.config.preferences, deployment: bundle.config.deployment, providerConnections: bundle.config.providerConnections, providerCredentials: bundle.config.providerCredentials, automationTenantId: bundle.profile.runtime?.powerAutomate?.automationTenantId || "", automationEnvironmentUrl: bundle.profile.runtime?.powerAutomate?.environmentUrl || "" });
  return { ...(await persistProfileAndConfig(profile, bundle.config, bundle.config, bundle.connectionState)), nextStep: "console" };
}

async function handleProviderConfig(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const profile = buildProfile({ ...bundle.config, profileName: bundle.profile.name, timezone: bundle.profile.timezone, syncWindowDays: bundle.profile.syncWindowDays, accounts: bundle.config.accounts, preferences: bundle.config.preferences, deployment: { ...bundle.config.deployment, ...(payload.deployment || {}) }, providerConnections: { ...bundle.config.providerConnections, ...(payload.providerConnections || {}) }, providerCredentials: { ...bundle.config.providerCredentials, ...(payload.providerCredentials || {}) }, automationTenantId: bundle.profile.runtime?.powerAutomate?.automationTenantId || "", automationEnvironmentUrl: bundle.profile.runtime?.powerAutomate?.environmentUrl || "" });
  return { ...(await persistProfileAndConfig(profile, { ...bundle.config, ...payload }, bundle.config, bundle.connectionState)), nextStep: "console" };
}

async function handleConnectionUpdate(payload) {
  requireFields(payload, ["profileName", "calendarId", "status"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === payload.calendarId);
  if (!target) throw new Error("Calendar not found.");
  target.status = payload.status;
  target.connectedAt = payload.status === "connected" ? (payload.connectedAt || new Date().toISOString()) : "";
  target.lastValidatedAt = new Date().toISOString();
  target.accountRef = normalizeString(payload.accountRef);
  target.authSession = payload.authSession || target.authSession || null;
  bundle.profile.calendars = bundle.profile.calendars.map((calendar) => calendar.id === payload.calendarId ? { ...calendar, connectionStatus: target.status, connectedAt: target.connectedAt || undefined } : calendar);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  saveConnectionState(bundle.profile.name, nextState);
  writeJson(bundle.profilePath, bundle.profile);
  writeJson(bundle.configPath, config);
  return { config, connectionRecord: target, nextStep: "console" };
}

async function handleConnectionValidate(payload) {
  requireFields(payload, ["profileName", "calendarId"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === payload.calendarId);
  const calendar = bundle.profile.calendars.find((item) => item.id === payload.calendarId);
  if (!target || !calendar) throw new Error("Calendar not found.");

  const validation = await validateCalendarLiveAccess(bundle.profile, calendar, bundle.tokenState, bundle.providerSecrets);
  target.status = validation.status;
  target.connectedAt = validation.ok ? validation.validatedAt : "";
  target.lastValidatedAt = validation.validatedAt;
  target.accountRef = normalizeString(calendar.email || target.accountRef || calendar.id);
  target.authSession = {
    ...(target.authSession || {}),
    provider: calendar.provider,
    validatedAt: validation.validatedAt,
    lastValidationMessage: validation.message || ""
  };

  bundle.profile.calendars = bundle.profile.calendars.map((item) => item.id === calendar.id
    ? { ...item, connectionStatus: target.status, connectedAt: target.connectedAt || undefined }
    : item);

  saveConnectionState(bundle.profile.name, nextState);
  writeJson(bundle.profilePath, bundle.profile);
  const refreshedTokenState = loadTokenState(bundle.profile.name);
  const refreshedSecrets = loadProviderSecrets(bundle.profile.name);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, refreshedTokenState, refreshedSecrets);
  writeJson(bundle.configPath, config);
  return {
    config,
    connectionRecord: target,
    validation,
    nextStep: "console"
  };
}

async function handleConnectionValidateAll(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const results = [];

  for (const calendar of bundle.profile.calendars) {
    const target = nextState.records.find((item) => item.calendarId === calendar.id);
    if (!target) {
      continue;
    }

    const validation = await validateCalendarLiveAccess(bundle.profile, calendar, bundle.tokenState, bundle.providerSecrets);
    target.status = validation.status;
    target.connectedAt = validation.ok ? validation.validatedAt : "";
    target.lastValidatedAt = validation.validatedAt;
    target.accountRef = normalizeString(calendar.email || target.accountRef || calendar.id);
    target.authSession = {
      ...(target.authSession || {}),
      provider: calendar.provider,
      validatedAt: validation.validatedAt,
      lastValidationMessage: validation.message || ""
    };

    results.push({
      calendarId: calendar.id,
      label: calendar.label,
      provider: calendar.provider,
      ok: Boolean(validation.ok),
      status: validation.status,
      message: validation.message || "",
      validatedAt: validation.validatedAt
    });
  }

  bundle.profile.calendars = bundle.profile.calendars.map((item) => {
    const match = results.find((result) => result.calendarId === item.id);
    if (!match) {
      return item;
    }
    return {
      ...item,
      connectionStatus: match.status,
      connectedAt: match.ok ? match.validatedAt : undefined
    };
  });

  saveConnectionState(bundle.profile.name, nextState);
  writeJson(bundle.profilePath, bundle.profile);
  const refreshedTokenState = loadTokenState(bundle.profile.name);
  const refreshedSecrets = loadProviderSecrets(bundle.profile.name);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, refreshedTokenState, refreshedSecrets);
  writeJson(bundle.configPath, config);

  const validationSummary = {
    total: results.length,
    connected: results.filter((item) => item.status === "connected").length,
    pending: results.filter((item) => item.status === "pending").length,
    invalid: results.filter((item) => item.status === "invalid").length
  };

  return {
    config,
    results,
    validationSummary,
    nextStep: "console"
  };
}

async function handleConnectionBegin(payload) {
  requireFields(payload, ["profileName", "calendarId"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const account = bundle.config.accounts.find((item) => item.id === payload.calendarId);
  if (!account) throw new Error("Calendar not found.");
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === payload.calendarId);
  if (!target) throw new Error("Calendar connection state not found.");

  if (account.provider === "apple-caldav") {
    const validation = await validateCalDavCalendarConnection(bundle.profile, account);
    const validatedAt = new Date().toISOString();
    target.status = validation.ok ? "connected" : "invalid";
    target.connectedAt = validation.ok ? validatedAt : "";
    target.lastValidatedAt = validatedAt;
    target.accountRef = normalizeString(account.email || account.id);
    target.authSession = {
      provider: "caldav",
      validatedAt,
      message: validation.message || "",
      httpStatus: validation.httpStatus || 0
    };
    bundle.profile.calendars = bundle.profile.calendars.map((calendar) => (
      calendar.id === account.id
        ? { ...calendar, connectionStatus: target.status, connectedAt: target.connectedAt || undefined }
        : calendar
    ));
    saveConnectionState(bundle.profile.name, nextState);
    writeJson(bundle.profilePath, bundle.profile);
    const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
    writeJson(bundle.configPath, config);
    return {
      config,
      connectionRecord: target,
      launchUrl: "",
      message: validation.message || "",
      nextStep: "console"
    };
  }

  const authState = crypto.randomUUID();
  const launch = buildConnectionLaunchUrl(bundle.profile, account, authState);
  target.authSession = {
    state: authState,
    provider: launch.provider,
    requestedAt: new Date().toISOString(),
    authUrl: launch.launchUrl,
    redirectUri: launch.redirectUri
  };
  target.lastValidatedAt = new Date().toISOString();
  saveConnectionState(bundle.profile.name, nextState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return { config, authSession: target.authSession, launchUrl: launch.launchUrl, message: launch.reason || "", nextStep: "console" };
}
async function handleRuntimeStart(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const readinessConfig = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, bundle.connectionState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  const readiness = readinessConfig.readinessSummary || {};
  if (!readiness.readyToStartAutomation) {
    const nextSteps = Array.isArray(readiness.nextSteps) ? readiness.nextSteps.filter(Boolean) : [];
    const detail = nextSteps.length ? ` Next steps: ${nextSteps.join(" ")}` : "";
    throw new Error(`Marvin cannot start automation yet because not every calendar is connected and validated.${detail}`);
  }
  startRuntimeProcess(root, {
    profileName: bundle.profile.name,
    profilePath: bundle.profilePath,
    intervalSeconds: Number(payload.intervalSeconds || process.env.MARVIN_SYNC_INTERVAL_SECONDS || 300),
    windowDays: Number(payload.windowDays || bundle.profile.syncWindowDays || 0)
  });
  const { runtimeStatus, runtimeProcess } = await waitForRuntimeCondition(
    bundle.profile.name,
    (status, processStatus) => Boolean(processStatus?.running) && Number(status?.runCount || 0) >= 1
  );
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, bundle.connectionState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return {
    config,
    runtimeProcess,
    runtimeStatus,
    nextStep: "console"
  };
}

async function handleRuntimeStop(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  stopRuntimeProcess(root, bundle.profile.name);
  const { runtimeStatus, runtimeProcess } = await waitForRuntimeCondition(
    bundle.profile.name,
    (status, processStatus) => processStatus?.running === false && status?.running === false
  );
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, bundle.connectionState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return {
    config,
    runtimeProcess,
    runtimeStatus,
    nextStep: "console"
  };
}

async function handleDeploy(payload) {
  if (!deployEnabled) throw new Error("Hosted Marvin runtime cannot redeploy itself. Use the local repo deployment flow.");
  requireFields(payload, ["subscriptionId", "workloadName", "environment", "regionShort", "instance", "location"]);
  const args = ["-File", path.join("solutions", "marvin-engine", "deploy-azure-container-app.ps1"), "-SubscriptionId", payload.subscriptionId, "-WorkloadName", payload.workloadName, "-Environment", payload.environment, "-RegionShort", payload.regionShort, "-Instance", payload.instance, "-Location", payload.location];
  const { stdout, stderr } = await execFileAsync("pwsh", args, { cwd: appRoot, windowsHide: true, maxBuffer: 1024 * 1024 * 20, env: { ...process.env, AZURE_EXTENSION_DIR: "C:\tmp\azext" } });
  const marvinUrl = stdout.match(/URL:\s+(https:\/\/\S+)/i)?.[1] || "";
  const latest = getLatestState();
  if (latest.profileName) await handleProviderConfig({ profileName: latest.profileName, deployment: { subscriptionId: payload.subscriptionId, workloadName: payload.workloadName, environment: payload.environment, regionShort: payload.regionShort, location: payload.location, instance: payload.instance, marvinUrl } });
  return { stdout, stderr, marvinUrl, nextStep: "console" };
}

async function handleOAuthStart(provider, url) {
  const authState = normalizeString(url.searchParams.get("state"));
  const match = findConnectionStateByAuthState(authState);
  if (!match) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Marvin could not match this authorization request", "The auth state was not found in Marvin's local connection store.", false) };
  }
  const bundle = loadConfigBundle(match.profileName);
  if (!bundle.config || !bundle.profile) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Marvin profile not found", "The matching profile for this authorization request could not be loaded.", false) };
  }
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === match.record.calendarId);
  const calendar = bundle.profile.calendars.find((item) => item.id === match.record.calendarId);
  if (!target || !calendar) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Calendar record not found", "Marvin found the auth state but could not locate the target calendar record.", false) };
  }
  const launch = buildProviderAuthorizeRequest(bundle.profile, calendar, authState);
  target.lastValidatedAt = new Date().toISOString();
  target.status = launch.authorizeUrl ? "pending" : "invalid";
  target.authSession = {
    ...(target.authSession || {}),
    provider,
    redirectUri: launch.redirectUri,
    startVisitedAt: new Date().toISOString()
  };
  bundle.profile.calendars = bundle.profile.calendars.map((item) => item.id === calendar.id ? { ...item, connectionStatus: target.status } : item);
  saveConnectionState(bundle.profile.name, nextState);
  writeJson(bundle.profilePath, bundle.profile);
  writeJson(bundle.configPath, materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name)));
  if (!launch.authorizeUrl) {
    return { statusCode: 409, html: renderAuthCompletionHtml(`Marvin cannot start ${provider} sign-in yet`, launch.reason || "Provider runtime is missing required configuration.", false) };
  }
  return { statusCode: 302, redirectUrl: launch.authorizeUrl };
}

async function handleOAuthCallback(provider, url) {
  const authState = normalizeString(url.searchParams.get("state"));
  const code = normalizeString(url.searchParams.get("code"));
  const scope = normalizeString(url.searchParams.get("scope"));
  const error = normalizeString(url.searchParams.get("error"));
  const match = findConnectionStateByAuthState(authState);
  if (!match) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Marvin could not match this authorization request", "The auth state was not found in Marvin's local connection store.", false) };
  }
  const bundle = loadConfigBundle(match.profileName);
  if (!bundle.config || !bundle.profile) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Marvin profile not found", "The matching profile for this authorization request could not be loaded.", false) };
  }
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === match.record.calendarId);
  const calendar = bundle.profile.calendars.find((item) => item.id === match.record.calendarId);
  if (!target || !calendar) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Calendar record not found", "Marvin found the auth state but could not locate the target calendar record.", false) };
  }
  target.lastValidatedAt = new Date().toISOString();
  target.status = error ? "invalid" : "pending";
  target.authSession = {
    ...(target.authSession || {}),
    provider,
    callbackReceivedAt: new Date().toISOString(),
    authorizationCode: code,
    scope,
    error
  };

  let tokenMessage = "";
  let tokenOk = !error;
  if (!error) {
    const exchange = await exchangeAuthorizationCode(bundle.profile, calendar, target.authSession);
    if (exchange.exchanged) {
      target.status = "connected";
      target.connectedAt = new Date().toISOString();
      target.accountRef = normalizeString(exchange.tokenRecord?.accountRef || target.accountRef);
      upsertTokenStateRecord(bundle.profile.name, calendar, exchange.tokenRecord);
      tokenMessage = `Marvin exchanged the ${provider} authorization code for tokens and marked this calendar connected.`;
    } else {
      upsertTokenStateRecord(bundle.profile.name, calendar, {
        status: exchange.reason === "token-exchange-failed" ? "error" : "pending",
        authorizationCode: code,
        authorizationCodeCapturedAt: new Date().toISOString(),
        scope,
        redirectUri: target.authSession?.redirectUri || "",
        lastError: exchange.message || ""
      });
      tokenMessage = exchange.message || `Marvin captured the ${provider} authorization code, but token exchange is not complete yet.`;
      tokenOk = exchange.reason !== "token-exchange-failed";
    }
  }

  bundle.profile.calendars = bundle.profile.calendars.map((item) => item.id === target.calendarId ? { ...item, connectionStatus: target.status, connectedAt: target.connectedAt || undefined } : item);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  saveConnectionState(bundle.profile.name, nextState);
  writeJson(bundle.profilePath, bundle.profile);
  writeJson(bundle.configPath, config);
  if (error) {
    upsertTokenStateRecord(bundle.profile.name, calendar, {
      status: "error",
      authorizationCode: "",
      authorizationCodeCapturedAt: "",
      scope,
      redirectUri: target.authSession?.redirectUri || "",
      lastError: `Provider returned error: ${error}`
    });
    return { statusCode: 400, html: renderAuthCompletionHtml(`Marvin ${provider} authorization failed`, `Provider returned error: ${error}.`, false) };
  }
  return { statusCode: tokenOk ? 200 : 502, html: renderAuthCompletionHtml(`Marvin processed the ${provider} authorization callback`, tokenMessage, tokenOk) };
}

async function bootstrapPayload(req) {
  const latest = getLatestState();
  const operator = getPrimaryOperator();
  const auth = getAuthContext(req);
  let config = null;
  if (auth.authenticated && latest.profileName) {
    try { config = (await handleLoadConfig(latest.profileName)).config; }
    catch { config = readJson(getConfigPath(latest.profileName), null); }
  }
  return {
    ok: true,
    port,
    product: "marvin",
    deployEnabled,
    hostedMode,
    hasOperator: Boolean(operator),
    hasConfig: Boolean(latest.profileName && readJson(getConfigPath(latest.profileName), null)),
    authenticated: Boolean(auth.authenticated),
    requiresLogin: Boolean(operator) && !auth.authenticated,
    operator: toPublicOperator(operator),
    config
  };
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

export function startMarvinOnboardServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      if (req.method === "GET" && (url.pathname === "/marvin-api/status" || url.pathname === "/api/status" || url.pathname === "/marvin-api/bootstrap")) return sendJson(res, 200, await bootstrapPayload(req));
      if (req.method === "POST" && url.pathname === "/marvin-api/login") { const result = await handleLogin(await parseJson(req)); return sendJson(res, 200, { ok: true, ...result }, result.headers || {}); }
      if (req.method === "POST" && url.pathname === "/marvin-api/logout") { const result = await handleLogout(req); return sendJson(res, 200, { ok: true, ...result }, result.headers || {}); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/microsoft/start") { const result = await handleOAuthStart("microsoft", url); if (result.redirectUrl) return sendRedirect(res, result.redirectUrl); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/google/start") { const result = await handleOAuthStart("google", url); if (result.redirectUrl) return sendRedirect(res, result.redirectUrl); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/microsoft/callback") { const result = await handleOAuthCallback("microsoft", url); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/google/callback") { const result = await handleOAuthCallback("google", url); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/connections") { requireAuth(req); return sendJson(res, 200, { ok: true, profileName: url.searchParams.get("profileName") || "", connectionState: loadConnectionState(url.searchParams.get("profileName") || ""), tokenState: loadTokenState(url.searchParams.get("profileName") || "") }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/runtime-status") { requireAuth(req); const profileName = url.searchParams.get("profileName") || getLatestState().profileName || ""; return sendJson(res, 200, { ok: true, profileName, runtimeStatus: loadRuntimeStatus(profileName), runtimeProcess: loadRuntimeProcessStatus(profileName) }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/config") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleLoadConfig(url.searchParams.get("profileName") || getLatestState().profileName || "")) }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/provider-requirements") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleProviderRequirements(url.searchParams.get("profileName") || getLatestState().profileName || "")) }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/provider-plan") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleProviderPlan(url.searchParams.get("profileName") || getLatestState().profileName || "", url.searchParams.get("provider") || "")) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/create-account") { const result = await handleCreateAccount(await parseJson(req), getAuthContext(req)); return sendJson(res, 200, { ok: true, ...result }, result.headers || {}); }
      if (req.method === "POST" && url.pathname === "/marvin-api/save-config") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleSaveConfig(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/account-upsert") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleAccountUpsert(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/account-remove") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleAccountRemove(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/provider-config") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleProviderConfig(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-update") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionUpdate(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-begin") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionBegin(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-validate") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionValidate(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-validate-all") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionValidateAll(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/runtime-start") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleRuntimeStart(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/runtime-stop") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleRuntimeStop(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/deploy") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleDeploy(await parseJson(req))) }); }
      const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      const resolvedPath = path.normalize(path.join(publicRoot, requestedPath));
      if (!resolvedPath.startsWith(publicRoot)) return sendJson(res, 403, { ok: false, error: "Forbidden" });
      if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) return sendJson(res, 404, { ok: false, error: "Not found" });
      return sendBuffer(res, 200, fs.readFileSync(resolvedPath), mimeMap[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream");
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      const payload = error?.payload && typeof error.payload === "object" ? error.payload : { ok: false, error: error instanceof Error ? error.message : String(error) };
      return sendJson(res, statusCode, payload, error?.headers || {});
    }
  });
  server.listen(port, () => {
    console.log(`Marvin onboard UI running at http://localhost:${port}`);
  });
  return server;
}


















