
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
import { EncryptedFileStateStore } from "../solutions/marvin-engine/src/storage/encrypted-file-state-store.mjs";
import { atomicWriteFile, atomicWriteJson, CURRENT_STATE_SCHEMA_VERSION } from "../solutions/marvin-engine/src/storage/file-state-store.mjs";
import { startRuntimeProcess, stopRuntimeProcess, getRuntimeProcessStatus } from "../solutions/marvin-engine/src/util/runtime-process.mjs";
import { getTokenRecord, isTokenRecordUsable } from "../solutions/marvin-engine/src/util/token-state.mjs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";
import { markWebhookSyncRequest, normalizeSubscriptionState } from "../solutions/marvin-engine/src/util/subscription-state.mjs";
import { createRuntimeContext } from "../solutions/marvin-engine/src/util/runtime-context.mjs";
import { buildCalendarReview, mergeDuplicateDecisions } from "../solutions/marvin-engine/src/util/calendar-review.mjs";
import { createEntraAuthenticator } from "./entra-auth.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.env.MARVIN_ROOT_DIR || process.cwd());
const appRoot = path.resolve(process.env.MARVIN_APP_DIR || process.cwd());
const uiRoot = path.join(appRoot, "operator-ui");
const publicRoot = path.resolve(process.env.MARVIN_UI_PUBLIC_DIR || path.join(uiRoot, "public"));
const stateRoot = path.join(root, ".marvin");
const operatorsRoot = path.join(stateRoot, "operators");
const latestStatePath = path.join(stateRoot, "latest.json");
const port = Number(process.env.MARVIN_UI_PORT || 4177);
const deployEnabled = (process.env.MARVIN_DEPLOY_ENABLED || "true").toLowerCase() === "true";
const hostedMode = (process.env.MARVIN_HOSTED || "false").toLowerCase() === "true";
const devAuthEnabled = !hostedMode && (process.env.MARVIN_DEV_AUTH_ENABLED || "false").toLowerCase() === "true";
const devAuthEmail = normalizeString(process.env.MARVIN_DEV_AUTH_EMAIL || "developer@localhost");
const devAuthDisplayName = normalizeString(process.env.MARVIN_DEV_AUTH_DISPLAY_NAME || "Local Developer");
const mockMicrosoftTokenUrl = normalizeString(process.env.MARVIN_MOCK_MICROSOFT_TOKEN_URL);
const microsoftGraphBaseUrl = normalizeString(process.env.MARVIN_MICROSOFT_GRAPH_BASE_URL || "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
const mockGoogleTokenUrl = normalizeString(process.env.MARVIN_MOCK_GOOGLE_TOKEN_URL);
const oauthTransactionTtlMs = Math.max(1_000, Number(process.env.MARVIN_OAUTH_TRANSACTION_TTL_MS || 10 * 60 * 1000));
const sessionCookieName = "marvin_session";
const sessionTtlSeconds = Math.max(1, Number(process.env.MARVIN_SESSION_TTL_SECONDS || 60 * 60 * 12));
const sessionStore = new Map();
const adminConsentTransactions = new Map();
const entraAuthenticator = createEntraAuthenticator({
  tenantId: normalizeString(process.env.MARVIN_ENTRA_TENANT_ID),
  clientId: normalizeString(process.env.MARVIN_ENTRA_CLIENT_ID),
  clientSecret: normalizeString(process.env.MARVIN_ENTRA_CLIENT_SECRET),
  redirectUri: normalizeString(process.env.MARVIN_ENTRA_REDIRECT_URI)
});

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

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  const value = String(body ?? "");
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(value)
  });
  res.end(value);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (filePath.startsWith(stateRoot) && Number(value?._schemaVersion || 0) > CURRENT_STATE_SCHEMA_VERSION) {
    throw new Error(`State schema is newer than this runtime: ${filePath}`);
  }
  return value;
}

function writeJson(filePath, data) {
  const persisted = filePath.startsWith(stateRoot) && data && typeof data === "object" && !Array.isArray(data)
    ? { ...data, _schemaVersion: CURRENT_STATE_SCHEMA_VERSION }
    : data;
  atomicWriteJson(filePath, persisted);
}

function writeText(filePath, data) {
  atomicWriteFile(filePath, data);
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

function randomBase64Url(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function buildPkceChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(normalizeString(value), "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function listOperators() {
  if (!fs.existsSync(operatorsRoot)) return [];
  return fs.readdirSync(operatorsRoot)
    .filter((name) => name.endsWith(".account.json"))
    .map((name) => readJson(path.join(operatorsRoot, name), null))
    .filter(Boolean);
}

function getPrimaryOperator() {
  const latest = getLatestState();
  const identity = normalizeString(latest.operatorId || latest.operatorEmail);
  if (identity) {
    const operator = readJson(getOperatorPath(identity), null);
    if (operator) return operator;
  }
  return listOperators()[0] || null;
}

function toPublicOperator(operator) {
  return operator ? {
    displayName: operator.displayName,
    email: operator.email,
    provider: operator.provider || "entra",
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
  const secure = hostedMode ? "; Secure" : "";
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionTtlSeconds}${secure}`;
}

function buildClearedSessionCookie() {
  const secure = hostedMode ? "; Secure" : "";
  return `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
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
  sessionStore.set(token, { operatorId: operator.accountId, expiresAt });
  return { token, expiresAt, operator: toPublicOperator(operator), cookie: buildSessionCookie(token) };
}

function getAuthContext(req) {
  pruneExpiredSessions();
  const token = parseCookies(req)[sessionCookieName] || "";
  if (!token) return { authenticated: false, operator: null, sessionToken: "" };
  const session = sessionStore.get(token);
  if (!session) return { authenticated: false, operator: null, sessionToken: token };
  const operator = readJson(getOperatorPath(session.operatorId), null);
  if (!operator) {
    sessionStore.delete(token);
    return { authenticated: false, operator: null, sessionToken: token };
  }
  return { authenticated: true, operator, sessionToken: token };
}

function requireAuth(req) {
  const auth = getAuthContext(req);
  if (!auth.authenticated || !auth.operator) throw createAuthError();
  return auth;
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => !normalizeString(payload?.[field]));
  if (missing.length > 0) throw createApiError({
    code: "VALIDATION_ERROR",
    message: `Missing required fields: ${missing.join(", ")}`,
    action: "Complete the required fields and try again.",
    statusCode: 400
  });
}

function createApiError({ code, message, action, retryable = false, statusCode = 400, details } = {}) {
  const error = new Error(message || "The request could not be completed.");
  error.code = code || "REQUEST_FAILED";
  error.action = action || "Review the request and try again.";
  error.retryable = Boolean(retryable);
  error.statusCode = Number(statusCode) || 500;
  error.details = details;
  return error;
}

function normalizeApiError(error) {
  if (error?.payload && typeof error.payload === "object") {
    return {
      statusCode: Number(error.statusCode) || 500,
      payload: {
        ok: false,
        code: error.payload.code || error.code || "REQUEST_FAILED",
        error: error.payload.error || error.message || "The request could not be completed.",
        action: error.payload.action || error.action || "Review the request and try again.",
        retryable: Boolean(error.payload.retryable ?? error.retryable),
        ...error.payload
      }
    };
  }

  const message = error instanceof Error ? error.message : String(error || "The request could not be completed.");
  let statusCode = Number(error?.statusCode) || 500;
  let code = normalizeString(error?.code);
  let action = normalizeString(error?.action);
  let retryable = Boolean(error?.retryable);
  if (!code && /not found/i.test(message)) { code = "NOT_FOUND"; statusCode = 404; }
  if (!code && /missing required|at least one|is required/i.test(message)) { code = "VALIDATION_ERROR"; statusCode = 400; }
  if (!code && /unsupported/i.test(message)) { code = "UNSUPPORTED_OPERATION"; statusCode = 400; }
  if (!code && /cannot start synchronization|not every calendar is connected/i.test(message)) { code = "READINESS_REQUIRED"; statusCode = 409; }
  if (!code) code = statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED";
  if (!action) {
    action = code === "NOT_FOUND" ? "Refresh the workspace and select an existing resource."
      : code === "READINESS_REQUIRED" ? "Connect and validate at least two calendars before starting synchronization."
        : code === "VALIDATION_ERROR" ? "Correct the highlighted values and try again."
          : statusCode >= 500 ? "Try again. If the problem continues, review Diagnostics."
            : "Review the request and try again.";
  }
  if (statusCode === 429 || statusCode >= 500) retryable = error?.retryable !== false;
  return { statusCode, payload: { ok: false, code, error: message, action, retryable } };
}

function createAuthError(message = "Sign in to the Project Marvin workspace account to continue.") {
  const error = createApiError({
    code: "AUTH_REQUIRED",
    message,
    action: "Sign in with the workspace Microsoft identity and try again.",
    statusCode: 401
  });
  error.payload = {
    ok: false,
    code: error.code,
    error: error.message,
    action: error.action,
    retryable: false,
    requiresLogin: true
  };
  return error;
}

function getOperatorPath(identity) {
  return path.join(operatorsRoot, `${sanitizeName(identity)}.account.json`);
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

function getCalendarReviewPath(profileName) {
  return path.join(stateRoot, "reviews", `${sanitizeName(profileName)}.calendar-review.json`);
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
  const timeoutas = Number(options.timeoutas || 4000);
  const intervalMs = Number(options.intervalMs || 200);
  const started = Date.now();
  do {
    const runtimeStatus = loadRuntimeStatus(profileName);
    const runtimeProcess = loadRuntimeProcessStatus(profileName);
    if (predicate(runtimeStatus, runtimeProcess)) {
      return { runtimeStatus, runtimeProcess };
    }
    await sleep(intervalMs);
  } while (Date.now() - started < timeoutas);
  return {
    runtimeStatus: loadRuntimeStatus(profileName),
    runtimeProcess: loadRuntimeProcessStatus(profileName)
  };
}

function getConnectionStore(profileName) {
  return new EncryptedFileStateStore(getConnectionStatePath(profileName), { records: [] });
}

function loadConnectionState(profileName) {
  return getConnectionStore(profileName).load();
}

function saveConnectionState(profileName, state) {
  getConnectionStore(profileName).save(state);
}

function sanitizeAuthSession(authSession) {
  if (!authSession) return null;
  const { codeVerifier, authorizationCode, ...safe } = authSession;
  return safe;
}

function sanitizeConnectionStateForUi(connectionState = { records: [] }) {
  return {
    records: (Array.isArray(connectionState?.records) ? connectionState.records : []).map((record) => ({
      ...record,
      authSession: sanitizeAuthSession(record.authSession)
    }))
  };
}

function sanitizeTokenStateForUi(tokenState = { records: [] }) {
  return {
    records: (Array.isArray(tokenState?.records) ? tokenState.records : []).map((record) => {
      const token = describeTokenRecord(record);
      return {
        calendarId: normalizeString(record.calendarId),
        provider: normalizeString(record.provider),
        email: normalizeString(record.email),
        status: normalizeString(record.status),
        accountRef: token.linkedAccountRef,
        linkedAccountEmail: token.linkedAccountEmail,
        linkedAccountName: token.linkedAccountName,
        expiresAt: token.tokenExpiresAt,
        obtainedAt: token.tokenObtainedAt,
        lastError: token.tokenReason
      };
    })
  };
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

function getSubscriptionStatePath(profileName) {
  return path.join(stateRoot, "subscriptions", `${sanitizeName(profileName)}.subscriptions.json`);
}

function getSubscriptionStore(profileName) {
  return new FileStateStore(getSubscriptionStatePath(profileName), normalizeSubscriptionState({}));
}

function loadSubscriptionState(profileName) {
  return normalizeSubscriptionState(getSubscriptionStore(normalizeString(profileName) || "marvin.local").load());
}

function saveSubscriptionState(profileName, state) {
  getSubscriptionStore(normalizeString(profileName) || "marvin.local").save(normalizeSubscriptionState(state));
}

function resolveSubscriptionProfileName() {
  return getLatestState().profileName || "marvin.local";
}

function findSubscriptionCalendarIds(state, provider, matcher) {
  const records = Array.isArray(state?.subscriptions) ? state.subscriptions : [];
  return Array.from(new Set(records
    .filter((record) => normalizeString(record?.provider) === normalizeString(provider))
    .filter((record) => matcher(record))
    .map((record) => normalizeString(record?.calendarId))
    .filter(Boolean)));
}

function recordMicrosoftWebhookValidation(profileName, validationToken) {
  const state = loadSubscriptionState(profileName);
  const next = {
    ...state,
    webhooks: {
      ...(state.webhooks || {}),
      microsoft: {
        ...((state.webhooks || {}).microsoft || {}),
        validationRequests: Number((state.webhooks || {}).microsoft?.validationRequests || 0) + 1,
        lastValidationTokenHash: crypto.createHash("sha256").update(normalizeString(validationToken)).digest("hex"),
        lastValidationAt: new Date().toISOString()
      }
    },
    updatedAt: new Date().toISOString()
  };
  saveSubscriptionState(profileName, next);
}

function recordMicrosoftWebhookNotifications(profileName, payload) {
  const state = loadSubscriptionState(profileName);
  const notifications = Array.isArray(payload?.value) ? payload.value : [];
  const accepted = notifications.filter((notification) => findSubscriptionCalendarIds(state, "microsoft", (record) => {
    const subscriptionId = normalizeString(notification?.subscriptionId);
    const suppliedState = normalizeString(notification?.clientState);
    const expectedState = normalizeString(record?.clientState);
    const stateMatches = suppliedState && expectedState
      && suppliedState.length === expectedState.length
      && crypto.timingSafeEqual(Buffer.from(suppliedState), Buffer.from(expectedState));
    return subscriptionId && normalizeString(record?.subscriptionId) === subscriptionId && stateMatches;
  }).length > 0);
  const calendarIds = Array.from(new Set(accepted.flatMap((notification) => findSubscriptionCalendarIds(state, "microsoft", (record) => normalizeString(record?.subscriptionId) === normalizeString(notification?.subscriptionId)))));
  const lifecycleEvents = accepted.map((notification) => normalizeString(notification?.lifecycleEvent)).filter(Boolean);
  const affectedSubscriptionIds = new Set(accepted.map((notification) => normalizeString(notification?.subscriptionId)).filter(Boolean));
  const subscriptions = (state.subscriptions || []).map((record) => {
    if (record.provider !== "microsoft" || !affectedSubscriptionIds.has(record.subscriptionId)) return record;
    const lifecycleEvent = normalizeString(accepted.find((notification) => normalizeString(notification?.subscriptionId) === record.subscriptionId)?.lifecycleEvent);
    if (!lifecycleEvent) return record;
    return {
      ...record,
      status: lifecycleEvent === "reauthorizationRequired" || lifecycleEvent === "subscriptionRemoved" ? "error" : record.status,
      lastError: lifecycleEvent ? `Microsoft lifecycle event: ${lifecycleEvent}. Subscription recovery is required.` : record.lastError,
      updatedAt: new Date().toISOString()
    };
  });
  let next = {
    ...state,
    subscriptions,
    webhooks: {
      ...(state.webhooks || {}),
      microsoft: {
        ...((state.webhooks || {}).microsoft || {}),
        notificationsReceived: Number((state.webhooks || {}).microsoft?.notificationsReceived || 0) + accepted.length,
        notificationsRejected: Number((state.webhooks || {}).microsoft?.notificationsRejected || 0) + (notifications.length - accepted.length),
        lastNotificationAt: new Date().toISOString(),
        lastLifecycleEvents: lifecycleEvents,
        lastNotificationSample: accepted[0] ? {
          subscriptionId: normalizeString(accepted[0].subscriptionId),
          changeType: normalizeString(accepted[0].changeType),
          resource: normalizeString(accepted[0].resource),
          lifecycleEvent: normalizeString(accepted[0].lifecycleEvent)
        } : null
      }
    },
    updatedAt: new Date().toISOString()
  };
  if (accepted.length > 0 && calendarIds.length > 0) {
    next = markWebhookSyncRequest(next, { provider: "microsoft", calendarIds });
  }
  saveSubscriptionState(profileName, next);
  return { notificationsReceived: accepted.length, notificationsRejected: notifications.length - accepted.length, calendarIds };
}

function extractGoogleWebhookHeaders(req) {
  return {
    channelId: normalizeString(req?.headers?.["x-goog-channel-id"]),
    channelToken: normalizeString(req?.headers?.["x-goog-channel-token"]),
    resourceId: normalizeString(req?.headers?.["x-goog-resource-id"]),
    resourceUri: normalizeString(req?.headers?.["x-goog-resource-uri"]),
    resourceState: normalizeString(req?.headers?.["x-goog-resource-state"]),
    messageNumber: normalizeString(req?.headers?.["x-goog-message-number"]),
    channelExpiration: normalizeString(req?.headers?.["x-goog-channel-expiration"]),
    changed: normalizeString(req?.headers?.["x-goog-changed"]),
    contentLength: normalizeString(req?.headers?.["content-length"])
  };
}

function recordGoogleWebhookNotification(profileName, req, payload) {
  const state = loadSubscriptionState(profileName);
  const headers = extractGoogleWebhookHeaders(req);
  const calendarIds = findSubscriptionCalendarIds(state, "google", (record) => {
    return (headers.channelId && normalizeString(record?.channelId) === headers.channelId)
      || (headers.resourceId && normalizeString(record?.resourceId) === headers.resourceId)
      || (headers.resourceUri && normalizeString(record?.resourceUri) === headers.resourceUri);
  });
  let next = {
    ...state,
    webhooks: {
      ...(state.webhooks || {}),
      google: {
        ...((state.webhooks || {}).google || {}),
        notificationsReceived: Number((state.webhooks || {}).google?.notificationsReceived || 0) + 1,
        lastNotificationAt: new Date().toISOString(),
        lastNotificationHeaders: headers,
        lastNotificationBody: payload || null
      }
    },
    updatedAt: new Date().toISOString()
  };
  next = markWebhookSyncRequest(next, { provider: "google", calendarIds });
  saveSubscriptionState(profileName, next);
  return { notificationsReceived: 1, calendarIds };
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
  const store = new EncryptedFileStateStore(getProviderSecretsPath(profileName), normalizeProviderSecrets({}));
  return normalizeProviderSecrets(store.load());
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
  const store = new EncryptedFileStateStore(getProviderSecretsPath(profileName), normalizeProviderSecrets({}));
  store.save(merged);
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
function makeSourcePrefix(label, sourcePrefix, fallbackProvider, hasExplicitPrefix = false) {
  const trimmed = normalizeString(sourcePrefix);
  if (hasExplicitPrefix && !trimmed) {
    return "";
  }
  if (trimmed.length > 40) {
    const error = new Error("Event prefix must be 40 characters or fewer.");
    error.statusCode = 400;
    throw error;
  }
  if (trimmed) {
    return trimmed.endsWith(":") ? `${trimmed} ` : trimmed.endsWith(": ") ? trimmed : `${trimmed}: `;
  }
  const base = String(label || fallbackProvider || "CAL").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] || "CAL";
  return `${base}: `;
}

function makeCalendarLabel(account, index) {
  const hasExplicitLabel = Object.prototype.hasOwnProperty.call(account, "label");
  const label = normalizeString(account.label);
  if (hasExplicitLabel && !label) {
    const error = new Error("Enter a calendar name.");
    error.statusCode = 400;
    throw error;
  }
  if (label.length > 80) {
    const error = new Error("Calendar name must be 80 characters or fewer.");
    error.statusCode = 400;
    throw error;
  }
  return label || `Calendar ${index + 1}`;
}

const CALENDAR_ROLES = new Set(["employer-work", "personal-work", "consulting", "personal", "shared-family", "volunteer", "travel", "other"]);
const AVAILABILITY_MODES = new Set(["source", "free", "busy", "tentative", "oof", "workingElsewhere"]);

function normalizeCalendarRole(account = {}) {
  const requested = normalizeString(account.calendarRole).toLowerCase();
  if (CALENDAR_ROLES.has(requested)) return requested;
  const scope = normalizeString(account.scope).toLowerCase();
  if (scope === "family") return "shared-family";
  if (scope === "contract") return "consulting";
  if (scope === "personal") return "personal";
  return "employer-work";
}

function roleScope(role) {
  if (role === "shared-family") return "family";
  if (role === "consulting") return "contract";
  if (role === "personal" || role === "travel") return "personal";
  return "work";
}

function normalizePolicy(input = {}) {
  const policy = {};
  if (input.visibility === "private" || input.visibility === "default") policy.visibility = input.visibility;
  if (["busy", "subject", "full"].includes(input.detailMode)) policy.detailMode = input.detailMode;
  if (AVAILABILITY_MODES.has(input.availabilityMode)) policy.availabilityMode = input.availabilityMode;
  if (typeof input.copyLocation === "boolean") policy.copyLocation = input.copyLocation;
  if (typeof input.copyDescription === "boolean") policy.copyDescription = input.copyDescription;
  return policy;
}

function normalizeDestinationPolicies(account = {}) {
  const input = account.destinationPolicies && typeof account.destinationPolicies === "object" ? account.destinationPolicies : {};
  return Object.fromEntries(Object.entries(input)
    .map(([calendarId, policy]) => [sanitizeName(calendarId), normalizePolicy(policy)])
    .filter(([calendarId, policy]) => calendarId && Object.keys(policy).length > 0));
}

function normalizeEventOverrides(input = []) {
  return (Array.isArray(input) ? input : []).map((item) => ({
    id: sanitizeName(item.id || crypto.randomUUID()),
    sourceCalendarId: sanitizeName(item.sourceCalendarId),
    sourceEventId: normalizeString(item.sourceEventId),
    providerEventIdentity: normalizeString(item.providerEventIdentity),
    targetCalendarIds: (Array.isArray(item.targetCalendarIds) ? item.targetCalendarIds : []).map(sanitizeName).filter(Boolean),
    ...normalizePolicy(item),
    updatedAt: normalizeString(item.updatedAt || new Date().toISOString())
  })).filter((item) => item.sourceCalendarId && (item.sourceEventId || item.providerEventIdentity));
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
  return (Array.isArray(input?.accounts) ? input.accounts : []).map((account, index) => {
    const label = makeCalendarLabel(account, index);
    const calendarRole = normalizeCalendarRole(account);
    return {
      id: sanitizeName(account.id || `${account.provider || "account"}-${index + 1}`),
      label,
      provider: normalizeString(account.provider || "m365"),
      email: normalizeString(account.email),
      tenantId: normalizeString(account.tenantId),
      providerCalendarId: normalizeString(account.providerCalendarId),
      microsoftAccountId: normalizeString(account.microsoftAccountId),
      caldavAccountId: normalizeString(account.caldavAccountId),
      scope: roleScope(calendarRole),
      calendarRole,
      sourcePrefix: makeSourcePrefix(label, account.sourcePrefix, account.provider, Object.prototype.hasOwnProperty.call(account, "sourcePrefix")),
      inboundOverrides: normalizeInboundOverrides(account),
      destinationPolicies: normalizeDestinationPolicies(account),
      connectionStatus: normalizeString(account.connectionStatus || "pending"),
      connectedAt: normalizeString(account.connectedAt),
      caldavServerUrl: normalizeString(account.caldavServerUrl),
      caldavUsername: normalizeString(account.caldavUsername) || normalizeString(account.email)
    };
  }).filter((account) => account.label && account.provider && account.email);
}

function buildTargetPolicy(source, target, preferences) {
  const sourceRole = normalizeCalendarRole(source);
  const targetRole = normalizeCalendarRole(target);
  const sourceIsFamily = sourceRole === "shared-family";
  const targetIsFamily = targetRole === "shared-family";
  const inbound = target.inboundOverrides || {};
  const explicit = normalizePolicy(source.destinationPolicies?.[target.id] || {});
  return {
    calendarId: target.id,
    visibility: explicit.visibility || inbound.visibility || (targetIsFamily ? (preferences.familyVisibility || "default") : (preferences.defaultVisibility || "private")),
    detailMode: explicit.detailMode || inbound.detailMode || (targetIsFamily && !sourceIsFamily ? "busy" : (preferences.defaultDetailMode || "full")),
    availabilityMode: explicit.availabilityMode || (sourceIsFamily && !targetIsFamily ? "free" : "source"),
    subjectPrefix: source.sourcePrefix,
    copyLocation: typeof explicit.copyLocation === "boolean" ? explicit.copyLocation : (typeof inbound.copyLocation === "boolean" ? inbound.copyLocation : !targetIsFamily),
    copyDescription: typeof explicit.copyDescription === "boolean" ? explicit.copyDescription : (typeof inbound.copyDescription === "boolean" ? inbound.copyDescription : !targetIsFamily)
  };
}

function buildProfile(input) {
    const calendars = buildAccounts(input).map((account) => ({
    id: account.id,
    label: account.label,
    provider: account.provider,
    email: account.email,
    tenantId: account.tenantId || undefined,
    providerCalendarId: account.providerCalendarId || undefined,
    microsoftAccountId: account.microsoftAccountId || undefined,
    caldavAccountId: account.caldavAccountId || undefined,
    scope: account.scope,
    calendarRole: account.calendarRole,
    sourcePrefix: account.sourcePrefix,
    inboundOverrides: account.inboundOverrides,
    destinationPolicies: account.destinationPolicies,
    connectionStatus: account.connectionStatus,
    connectedAt: account.connectedAt || undefined,
    optional: account.provider === "apple-caldav",
    caldavServerUrl: account.provider === "apple-caldav" ? (account.caldavServerUrl || undefined) : undefined,
    caldavUsername: account.provider === "apple-caldav" ? (account.caldavUsername || account.email || undefined) : undefined
  }));
  const preferences = {
    defaultDetailMode: input.preferences?.defaultDetailMode || "full",
    defaultVisibility: input.preferences?.defaultVisibility || "private",
    familyDetailMode: input.preferences?.familyDetailMode || "full",
    familyVisibility: input.preferences?.familyVisibility || "private",
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
      availabilityMode: "source",
      subjectPrefix: preferences.subjectPrefix,
      copyLocation: true,
      copyDescription: true,
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
          graphAppDisplayName: "Project Project Marvin Flow Runtime",
          supportedAccountTypes: "AzureADMultipleOrgs"
        };
      }
      return runtime;
    })(),
    calendars,
    eventOverrides: normalizeEventOverrides(input.eventOverrides),
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
      signInAudience: "AzureADandPersonalMicrosoftAccount",
      suggestedDisplayName: "Project Project Marvin " + sanitizeName(profile?.name || "marvin") + " Microsoft",
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
      suggestedDisplayName: "Project Project Marvin " + sanitizeName(profile?.name || "marvin") + " Google",
      startUrl: marvinBaseUrl + "/marvin-api/oauth/google/start",
      redirectUri: marvinBaseUrl + "/marvin-api/oauth/google/callback",
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar"]
    }
  };
}

function buildProviderAuthorizeRequest(profile, account, authState, codeChallenge = "") {
  const providerRuntime = getProviderRuntime(profile, account?.provider);
  const marvinBaseUrl = normalizeString(providerRuntime?.marvinBaseUrl || getLocalMarvinBaseUrl()).replace(/\/$/, "");
  if (account?.provider === "m365" || account?.provider === "outlook") {
    const redirectUri = `${marvinBaseUrl}/marvin-api/oauth/microsoft/callback`;
    if (!normalizeString(providerRuntime?.clientId)) {
      return {
        provider: "microsoft",
        redirectUri,
        authorizeUrl: "",
        reason: "Set MICROSOFT_CLIENT_ID for Project Marvin before starting Microsoft sign-in."
      };
    }
    const tenantSegment = providerRuntime?.tenantMode === "single-tenant" && normalizeString(account?.tenantId)
      ? normalizeString(account.tenantId)
      : account?.provider === "outlook" ? "common" : "organizations";
    const params = new URLSearchParams({
      client_id: providerRuntime.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "offline_access openid profile User.Read Calendars.ReadWrite",
      prompt: "select_account",
      state: authState,
      ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: "S256" } : {})
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
        reason: "Set GOOGLE_CLIENT_ID for Project Marvin before starting Google sign-in."
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
      state: authState,
      ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: "S256" } : {})
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
    reason: "This provider does not have a live Project Marvin-owned sign-in flow yet."
  };
}

function buildConnectionLaunchUrl(profile, account, authState, codeChallenge = "") {
  const providerRuntime = getProviderRuntime(profile, account?.provider);
  const marvinBaseUrl = normalizeString(providerRuntime?.marvinBaseUrl || getLocalMarvinBaseUrl()).replace(/\/$/, "");
  const request = buildProviderAuthorizeRequest(profile, account, authState, codeChallenge);
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
    const state = getConnectionStore(profileName).load();
    const record = Array.isArray(state?.records) ? state.records.find((item) => item?.authSession?.state === authState) : null;
    if (record) {
      return { profileName, filePath, state, record };
    }
  }
  return null;
}

function escapeAuthCompletionText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function renderAuthCompletionHtml(title, message, ok = true) {
  const safeTitle = escapeAuthCompletionText(title);
  const safeMessage = escapeAuthCompletionText(message);
  const autoReturn = ok ? '<meta http-equiv="refresh" content="2;url=/"><script>window.setTimeout(()=>window.location.replace("/"),1800);</script>' : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title>${autoReturn}<style>body{font-family:Verdana,Geneva,sans-serif;background:#0b1117;color:#eef3f8;margin:0;padding:32px}main{max-width:720px;margin:0 auto;border:1px solid #2f4355;border-radius:20px;padding:24px;background:#101922}h1{margin:0 0 12px;font-family:Georgia,'Times New Roman',serif}p{line-height:1.6;color:#c5d5e3}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:${ok ? 'rgba(121,217,167,.12)' : 'rgba(255,140,140,.12)'};color:${ok ? '#79d9a7' : '#ff8c8c'};border:1px solid ${ok ? 'rgba(121,217,167,.25)' : 'rgba(255,140,140,.25)'};margin-bottom:12px}.button{display:inline-block;margin-top:8px;padding:12px 16px;border-radius:10px;background:#79d9a7;color:#08120d;text-decoration:none;font-weight:700}.hint{font-size:.9rem}</style></head><body><main><div class="badge">${ok ? 'Authorization complete' : 'Authorization error'}</div><h1>${safeTitle}</h1><p>${safeMessage}</p><p>${ok ? 'Returning you to the same Project Marvin workspace view automatically…' : 'Return to Project Marvin to review the error and try again.'}</p><a class="button" href="/">Return to Project Marvin</a>${ok ? '<p class="hint">If the page does not return automatically, use the button above.</p>' : ''}</main></body></html>`;
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html)
  });
  res.end(html);
}

function sendRedirect(res, location, extraHeaders = {}) {
  res.writeHead(302, { Location: location, ...extraHeaders });
  res.end();
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
      message: validation.message || (validation.ok ? "Project Marvin validated the Apple / CalDAV credentials for this calendar." : "Project Marvin could not validate the Apple / CalDAV credentials for this calendar.")
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
        message: "Project Marvin does not have a usable " + providerName + " token for this calendar yet. Finish provider sign-in first."
      };
    }

    const tokenRecord = await adapter.ensureUsableToken(calendar);
    const latestRecord = getTokenRecord(tokenState, calendar.id) || tokenRecord;
    if (!isTokenRecordUsable(latestRecord)) {
      return {
        ok: false,
        status: latestRecord?.actionRequired ? "action-required" : normalizeString(latestRecord?.lastError) ? "invalid" : "pending",
        validatedAt,
        message: normalizeString(latestRecord?.lastError) || ("Project Marvin does not have a usable " + providerName + " token for this calendar yet. Finish provider sign-in first.")
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
      message: "Project Marvin verified live " + providerName + " access for this calendar."
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

async function fetchVerifiedMicrosoftIdentity(tokenRecord) {
  const response = await fetch(`${microsoftGraphBaseUrl}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `${tokenRecord.tokenType || "Bearer"} ${tokenRecord.accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !normalizeString(payload?.id)) {
    return {
      ok: false,
      message: normalizeString(payload?.error?.message || `Microsoft Graph identity verification returned HTTP ${response.status}.`)
    };
  }
  return {
    ok: true,
    identity: {
      providerIdentityId: normalizeString(payload.id),
      displayName: normalizeString(payload.displayName),
      email: normalizeString(payload.mail || payload.userPrincipalName),
      userPrincipalName: normalizeString(payload.userPrincipalName)
    }
  };
}

async function exchangeAuthorizationCode(profile, calendar, authSession, authorizationCode) {
  const providerRuntime = getProviderRuntime(profile, calendar.provider);
  const provider = calendar.provider === "google" ? "google" : "microsoft";
  const clientId = normalizeString(providerRuntime?.clientId);
  const clientSecret = resolveProviderClientSecret(provider, profile?.name);
  const code = normalizeString(authorizationCode);
  const redirectUri = normalizeString(authSession?.redirectUri);
  if (!code) {
    return { exchanged: false, reason: "missing-authorization-code", message: "Authorization code was not present in the callback." };
  }
  if (!clientId) {
    return { exchanged: false, reason: "missing-client-id", message: "Client ID is missing from Project Marvin provider runtime." };
  }
  if (!clientSecret) {
    return { exchanged: false, reason: "missing-client-secret", message: `Set the corresponding provider client secret in Project Marvin before token exchange can complete.` };
  }
  if (!redirectUri) {
    return { exchanged: false, reason: "missing-redirect-uri", message: "Redirect URI was not recorded for this authorization request." };
  }
  let tokenUrl = "";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  if (normalizeString(authSession?.codeVerifier)) {
    body.set("code_verifier", normalizeString(authSession.codeVerifier));
  }
  if (provider === "microsoft") {
    const tenantSegment = providerRuntime?.tenantMode === "single-tenant" && normalizeString(calendar.tenantId) ? normalizeString(calendar.tenantId) : calendar.provider === "outlook" ? "common" : "organizations";
    tokenUrl = mockMicrosoftTokenUrl || `https://login.microsoftonline.com/${tenantSegment}/oauth2/v2.0/token`;
    body.set("scope", "offline_access openid profile User.Read Calendars.ReadWrite");
    body.set("client_info", "1");
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
  const tokenRecord = {
    status: "connected",
    accessToken: normalizeString(payload?.access_token),
    refreshToken: normalizeString(payload?.refresh_token),
    tokenType: normalizeString(payload?.token_type || "Bearer"),
    scope: normalizeString(payload?.scope || authSession?.scope),
    expiresAt,
    obtainedAt: obtainedAt.toISOString(),
    accountRef: "",
    lastError: ""
  };
  if (provider === "microsoft") {
    const verification = await fetchVerifiedMicrosoftIdentity(tokenRecord);
    if (!verification.ok) {
      return { exchanged: false, reason: "identity-verification-failed", message: verification.message };
    }
    tokenRecord.accountRef = verification.identity.providerIdentityId;
    const clientInfo = decodeBase64UrlJson(payload?.client_info);
    tokenRecord.identity = {
      ...verification.identity,
      tenantId: normalizeString(clientInfo?.utid || calendar.tenantId),
      accountType: calendar.provider === "outlook" ? "personal" : "organization"
    };
  }
  return {
    exchanged: true,
    tokenRecord
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
        verifiedIdentity: match?.verifiedIdentity || null,
        identityMismatchConfirmedAt: match?.identityMismatchConfirmedAt || "",
        discoveredCalendars: Array.isArray(match?.discoveredCalendars) ? match.discoveredCalendars : [],
        selectedProviderCalendarIds: Array.isArray(match?.selectedProviderCalendarIds) && match.selectedProviderCalendarIds.length
          ? match.selectedProviderCalendarIds
          : (calendar.providerCalendarId ? [calendar.providerCalendarId] : []),
        providerCalendarAccountIds: match?.providerCalendarAccountIds && typeof match.providerCalendarAccountIds === "object"
          ? match.providerCalendarAccountIds
          : (calendar.providerCalendarId ? { [calendar.providerCalendarId]: calendar.id } : {}),
        capabilities: match?.capabilities || null,
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
  const identity = record?.identity || {};
  const linkedAccountEmail = normalizeString(identity?.email || identity?.userPrincipalName);
  const linkedAccountName = normalizeString(identity?.displayName);
  const linkedAccountRef = normalizeString(record?.accountRef || identity?.providerIdentityId || linkedAccountEmail);
  if (!record) {
    return {
      tokenStatus: "missing",
      tokenReason: "Provider authentication has not completed yet.",
      tokenExpiresAt: "",
      tokenObtainedAt: "",
      linkedAccountRef: "",
      linkedAccountEmail: "",
      linkedAccountName: ""
    };
  }
  if (record.status === "pending") {
    return {
      tokenStatus: "pending",
      tokenReason: record.lastError || "Provider consent completed, but token exchange still needs provider credentials.",
      tokenExpiresAt: normalizeString(record.expiresAt),
      tokenObtainedAt: normalizeString(record.obtainedAt),
      linkedAccountRef,
      linkedAccountEmail,
      linkedAccountName
    };
  }
  if (record.status === "error") {
    return {
      tokenStatus: "error",
      tokenReason: record.lastError || "Token exchange failed.",
      tokenExpiresAt: normalizeString(record.expiresAt),
      tokenObtainedAt: normalizeString(record.obtainedAt),
      linkedAccountRef,
      linkedAccountEmail,
      linkedAccountName
    };
  }
  if (isTokenRecordUsable(record)) {
    return {
      tokenStatus: "usable",
      tokenReason: "",
      tokenExpiresAt: normalizeString(record.expiresAt),
      tokenObtainedAt: normalizeString(record.obtainedAt),
      linkedAccountRef,
      linkedAccountEmail,
      linkedAccountName
    };
  }
  return {
    tokenStatus: "expired",
    tokenReason: record.lastError || "Token exists but is expired or incomplete.",
    tokenExpiresAt: normalizeString(record.expiresAt),
    tokenObtainedAt: normalizeString(record.obtainedAt),
    linkedAccountRef,
    linkedAccountEmail,
    linkedAccountName
  };
}

function describeAccountReadiness(account) {
  const providerLabel = account.provider === "m365" ? "Microsoft 365" : account.provider === "outlook" ? "Outlook" : account.provider === "google" ? "Google Calendar" : account.provider === "apple-caldav" ? "Apple / CalDAV" : "Calendar";
  if (account.connectionStatus === "connected") {
    if (account.provider === "apple-caldav") {
      return {
        readinessState: "ready",
        readinessLabel: "Ready",
        readinessDetail: "Apple / CalDAV credentials validated and ready for the Marvin Engine runtime.",
        nextActionLabel: "None"
      };
    }
    if (account.tokenStatus === "usable") {
      const linkedIdentity = normalizeString(account.linkedAccountEmail || account.linkedAccountName || account.linkedAccountRef);
      return {
        readinessState: "ready",
        readinessLabel: "Ready",
        readinessDetail: linkedIdentity
          ? `${providerLabel} sign-in completed and Project Marvin has a usable token for ${linkedIdentity}.`
          : `${providerLabel} sign-in completed and Project Marvin has a usable token.`,
        nextActionLabel: "None"
      };
    }
    return {
      readinessState: "pending",
      readinessLabel: "Action Required",
      readinessDetail: `${providerLabel} returned to Project Marvin, but the provider token is not usable yet.`,
      nextActionLabel: "Check Access"
    };
  }
  if (account.connectionStatus === "invalid") {
    return {
      readinessState: "invalid",
      readinessLabel: "Action Required",
      readinessDetail: account.connectionReason || `${providerLabel} validation failed.`,
      nextActionLabel: "Fix Access"
    };
  }
  if (account.connectionStatus === "connector-not-ready") {
    return {
      readinessState: "pending",
      readinessLabel: "Action Required",
      readinessDetail: account.connectionReason || `${providerLabel} still needs setup before Project Marvin can link it.`,
      nextActionLabel: "Finish Setup"
    };
  }
  if (account.authCallbackReceivedAt) {
    return {
      readinessState: "pending",
      readinessLabel: "Action Required",
      readinessDetail: `${providerLabel} returned to Project Marvin at ${account.authCallbackReceivedAt}, but final token validation is still pending.`,
      nextActionLabel: "Check Access"
    };
  }
  if (account.authRequestedAt) {
    return {
      readinessState: "pending",
      readinessLabel: "Action Required",
      readinessDetail: `${providerLabel} sign-in was started, but Project Marvin is still waiting for the provider callback.`,
      nextActionLabel: "Finish Sign-In"
    };
  }
  return {
    readinessState: "pending",
    readinessLabel: "Action Required",
    readinessDetail: account.connectionReason || `${providerLabel} still needs provider sign-in and validation before automation can start.`,
    nextActionLabel: "Link Account"
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
    nextSteps.push(`${account.label}: ${action}. ${account.readinessDetail || account.connectionReason || "Finish the remaining setup in Project Marvin."}`);
  }
  if (accounts.length < 2) {
    nextSteps.unshift("Add at least two calendars before expecting Project Marvin to mirror events between accounts.");
  }
  summary.readyToStartAutomation = accounts.length > 1 && summary.actionRequired === 0;
  if (summary.automationRunning) {
    summary.overallState = summary.actionRequired === 0 ? "running" : "running-with-gaps";
  } else if (summary.readyToStartAutomation) {
    summary.overallState = "ready-to-start";
    nextSteps.unshift("All current calendars look ready. Start the Marvin Engine runtime when you are ready to keep them synced.");
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
    const linkedAccountRef = token.linkedAccountRef || normalizeString(record?.accountRef);
    const linkedAccountEmail = token.linkedAccountEmail || "";
    const linkedAccountName = token.linkedAccountName || "";
    const authEvidence = calendar.provider === "apple-caldav"
      ? ((assessment?.status || calendar.connectionStatus) === "connected"
        ? "Project Marvin validated the saved Apple / CalDAV credentials against the configured server."
        : "Apple / CalDAV credentials have not been validated yet.")
      : (token.tokenStatus === "usable"
        ? "OAuth callback completed and Project Marvin stored a usable provider token locally."
        : token.tokenStatus === "pending"
          ? "Provider callback reached Project Marvin, but token completion still depends on provider settings or validation."
          : token.tokenStatus === "error"
            ? `Provider token exchange failed: ${token.tokenReason}`
            : normalizeString(record?.authSession?.callbackReceivedAt)
              ? "Provider callback reached Project Marvin, but a usable token is not present yet."
              : "Provider sign-in has not been proven yet.");
    const readiness = describeAccountReadiness({
      provider: calendar.provider,
      label: calendar.label,
      connectionStatus: record?.status || assessment?.status || calendar.connectionStatus,
      connectionReason: assessment?.reason || "",
      tokenStatus: token.tokenStatus,
      authRequestedAt: normalizeString(record?.authSession?.requestedAt),
      authStartVisitedAt: normalizeString(record?.authSession?.startVisitedAt),
      authCallbackReceivedAt: normalizeString(record?.authSession?.callbackReceivedAt),
      caldavPasswordConfigured: calendar.provider === "apple-caldav" ? Boolean(providerSecretStatus.caldavPasswordsConfigured?.[sanitizeName(calendar.id)] || providerSecrets.caldavPassword) : false,
      linkedAccountRef,
      linkedAccountEmail,
      linkedAccountName
    });
    const microsoftCapabilitiesRequired = (calendar.provider === "m365" || calendar.provider === "outlook") && !record?.capabilities?.ready;
    const appleCapabilitiesRequired = calendar.provider === "apple-caldav" && !record?.capabilities?.ready;
    const effectiveReadiness = microsoftCapabilitiesRequired
      ? {
          readinessState: "action-required",
          readinessLabel: normalizeString(calendar.providerCalendarId) ? "Validate capabilities" : "Choose a Microsoft calendar",
          readinessDetail: normalizeString(calendar.providerCalendarId)
            ? ((record?.capabilities?.issues || []).join(" ") || "Confirm read, write, refresh, and real-time subscription capabilities.")
            : "Discover and select a writable Microsoft calendar before synchronization can start.",
          nextActionLabel: normalizeString(calendar.providerCalendarId) ? "Check capabilities" : "Discover calendars"
        }
      : appleCapabilitiesRequired
        ? {
            readinessState: "action-required",
            readinessLabel: normalizeString(calendar.providerCalendarId) ? "Validate capabilities" : "Choose an Apple calendar",
            readinessDetail: normalizeString(calendar.providerCalendarId)
              ? ((record?.capabilities?.issues || []).join(" ") || "Confirm read, write, and polling capabilities.")
              : "Discover and select a writable Apple calendar before synchronization can start.",
            nextActionLabel: normalizeString(calendar.providerCalendarId) ? "Check capabilities" : "Discover calendars"
          }
      : readiness;
    return {
      id: calendar.id,
      label: calendar.label,
      provider: calendar.provider,
      email: calendar.email,
      tenantId: calendar.tenantId || "",
      providerCalendarId: calendar.providerCalendarId || "",
      microsoftAccountId: calendar.microsoftAccountId || "",
      caldavAccountId: calendar.caldavAccountId || "",
      scope: calendar.scope,
      calendarRole: calendar.calendarRole || normalizeCalendarRole(calendar),
      sourcePrefix: calendar.sourcePrefix,
      inboundOverrides: calendar.inboundOverrides || {},
      destinationPolicies: calendar.destinationPolicies || {},
      connectionStatus: record?.status || assessment?.status || calendar.connectionStatus,
      connectedAt: calendar.connectedAt || "",
      connectionReason: assessment?.reason || "",
      connectorReady: Boolean(assessment?.connectorReady),
      connectorMode: assessment?.connectorMode || "unconfigured",
      authUrl: assessment?.authUrl || "",
      supportsRealtime: Boolean(assessment?.supportsRealtime),
      lastValidatedAt: record?.lastValidatedAt || "",
      accountRef: record?.accountRef || "",
      verifiedIdentity: record?.verifiedIdentity || null,
      identityMismatchConfirmedAt: record?.identityMismatchConfirmedAt || "",
      discoveredCalendars: Array.isArray(record?.discoveredCalendars) ? record.discoveredCalendars : [],
      selectedProviderCalendarIds: Array.isArray(record?.selectedProviderCalendarIds) ? record.selectedProviderCalendarIds : [],
      capabilities: record?.capabilities || null,
      linkedAccountRef,
      linkedAccountEmail,
      linkedAccountName,
      authEvidence,
      authProvider: normalizeString(record?.authSession?.provider),
      authRequestedAt: normalizeString(record?.authSession?.requestedAt),
      authStartVisitedAt: normalizeString(record?.authSession?.startVisitedAt),
      authCallbackReceivedAt: normalizeString(record?.authSession?.callbackReceivedAt),
      authLastError: normalizeString(record?.authSession?.error),
      tokenStatus: token.tokenStatus,
      tokenReason: token.tokenReason,
      tokenExpiresAt: token.tokenExpiresAt,
      tokenObtainedAt: token.tokenObtainedAt,
      caldavServerUrl: calendar.provider === "apple-caldav" ? (calendar.caldavServerUrl || "") : "",
      caldavUsername: calendar.provider === "apple-caldav" ? (calendar.caldavUsername || calendar.email || "") : "",
      caldavPasswordConfigured: calendar.provider === "apple-caldav" ? Boolean(providerSecretStatus.caldavPasswordsConfigured?.[sanitizeName(calendar.id)] || providerSecrets.caldavPassword) : false,
      readinessState: effectiveReadiness.readinessState,
      readinessLabel: effectiveReadiness.readinessLabel,
      readinessDetail: effectiveReadiness.readinessDetail,
      nextActionLabel: effectiveReadiness.nextActionLabel
    };
  });
  const operatorEmail = resolveOperatorEmail(payload, existingConfig?.marvinOperator || "");
  const operatorDisplayName = normalizeString(payload?.marvinAccount?.displayName || existingConfig?.marvinDisplayName || "");
  const providerRequirements = buildProviderRequirements(effectiveProfileForAssessment, providerCredentials);
  const runtimeStatus = loadRuntimeStatus(effectiveProfile.name);
  const runtimeProcess = loadRuntimeProcessStatus(effectiveProfile.name);
  const subscriptionState = loadSubscriptionState(effectiveProfile.name);
  const readinessSummary = buildReadinessSummary(accounts, runtimeStatus, runtimeProcess);
  return {
    marvinOperator: operatorEmail,
    marvinDisplayName: operatorDisplayName,
    profileName: effectiveProfile.name,
    timezone: effectiveProfile.timezone,
    syncWindowDays: effectiveProfile.syncWindowDays,
    updatedAt: new Date().toISOString(),
    accounts,
    eventOverrides: normalizeEventOverrides(payload.eventOverrides || existingConfig?.eventOverrides || effectiveProfile.eventOverrides || []),
    preferences: payload.preferences || existingConfig?.preferences || {},
    runtime: effectiveProfile.runtime,
    deployment: effectiveProfile.runtime?.deployment || existingConfig?.deployment || {},
    providerCredentials,
    providerConnections: effectiveProfile.runtime?.providerConnections || existingConfig?.providerConnections || buildProviderConnections({ providerCredentials }),
    providerSecretStatus: describeProviderSecretStatus(providerSecrets),
    providerRequirements,
    readinessSummary,
    connectionSummary,
    connectionState: sanitizeConnectionStateForUi(connectionState),
    tokenSummary: summarizeTokenStateForUi(tokenState, effectiveProfile.calendars),
    tokenState: sanitizeTokenStateForUi(tokenState),
    runtimeStatus,
    runtimeProcess,
    subscriptionState
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

async function handleEntraCallback(url) {
  const identity = await entraAuthenticator.complete(url);
  const primaryOperator = getPrimaryOperator();
  if (primaryOperator && (primaryOperator.provider !== "entra" || primaryOperator.issuer !== identity.issuer || primaryOperator.subject !== identity.subject)) {
    const error = new Error("This Project Marvin workspace is already bound to another Microsoft identity.");
    error.statusCode = 403;
    throw error;
  }
  const now = new Date().toISOString();
  const accountId = primaryOperator?.accountId || `entra-${crypto.createHash("sha256").update(`${identity.issuer}|${identity.subject}`).digest("hex").slice(0, 32)}`;
  const operator = {
    accountId,
    provider: "entra",
    issuer: identity.issuer,
    tenantId: identity.tenantId,
    subject: identity.subject,
    displayName: identity.displayName || primaryOperator?.displayName || identity.email,
    email: identity.email || primaryOperator?.email || "",
    createdAt: primaryOperator?.createdAt || now,
    updatedAt: now
  };
  writeJson(getOperatorPath(accountId), operator);
  setLatestState({ ...getLatestState(), operatorId: accountId, operatorEmail: operator.email });
  const session = createSession(operator);
  return { operator: session.operator, headers: { "Set-Cookie": session.cookie } };
}

function isLoopbackRequest(req) {
  const address = normalizeString(req?.socket?.remoteAddress).toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function handleDevAuth(req) {
  if (!devAuthEnabled || !isLoopbackRequest(req)) {
    const error = new Error("Local development sign-in is not available.");
    error.statusCode = 404;
    throw error;
  }

  const primaryOperator = getPrimaryOperator();
  if (primaryOperator && primaryOperator.provider !== "dev") {
    const error = new Error("Local development sign-in cannot replace an existing workspace identity.");
    error.statusCode = 403;
    throw error;
  }

  const now = new Date().toISOString();
  const subject = crypto.createHash("sha256").update(devAuthEmail).digest("hex");
  const accountId = primaryOperator?.accountId || `dev-${subject.slice(0, 32)}`;
  const operator = {
    accountId,
    provider: "dev",
    issuer: "urn:project-marvin:local-development",
    tenantId: "local-development",
    subject,
    displayName: devAuthDisplayName,
    email: devAuthEmail,
    createdAt: primaryOperator?.createdAt || now,
    updatedAt: now
  };
  writeJson(getOperatorPath(accountId), operator);
  setLatestState({ ...getLatestState(), operatorId: accountId, operatorEmail: operator.email });
  const session = createSession(operator);
  return { operator: session.operator, headers: { "Set-Cookie": session.cookie } };
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
  const reviewState = readJson(getCalendarReviewPath(bundle.profile.name), null);
  const calendarReview = reviewState?.review
    ? mergeDuplicateDecisions(reviewState.review, reviewState.decisions || {})
    : null;
  return { config, calendarReview, nextStep: "console" };
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
  const liveConfig = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, bundle.connectionState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  const requirements = liveConfig.providerRequirements || {};
  const marvinBaseUrl = normalizeString(requirements?.marvinBaseUrl || bundle.config?.deployment?.marvinUrl || bundle.profile?.runtime?.deployment?.marvinUrl || "");
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
    ...(marvinBaseUrl ? ["-MarvinBaseUrl", marvinBaseUrl] : []),
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
  const providerRequirements = normalizedProvider === "microsoft"
    ? requirements.microsoft || {}
    : normalizedProvider === "google"
      ? requirements.google || {}
      : {};
  const helperCommand = normalizedProvider === "microsoft"
    ? `pwsh -ExecutionPolicy Bypass -File .\\scripts\\register-marvin-entra-app.ps1 -ProfileName ${bundle.profile.name} -MarvinBaseUrl ${marvinBaseUrl || "<marvin-url>"} -EmitOnly`
    : `pwsh -ExecutionPolicy Bypass -File .\\scripts\\register-marvin-google-app.ps1 -ProfileName ${bundle.profile.name} -MarvinBaseUrl ${marvinBaseUrl || "<marvin-url>"} -EmitOnly`;
  const parsedPlan = JSON.parse(trimmed);
  const plan = {
    ...parsedPlan,
    authorizePath: normalizedProvider === "microsoft"
      ? "/marvin-api/oauth/microsoft/start"
      : normalizedProvider === "google"
        ? "/marvin-api/oauth/google/start"
        : undefined,
    startUrl: providerRequirements.startUrl || undefined,
    redirectUri: providerRequirements.redirectUri || parsedPlan.redirectUri,
    marvinBaseUrl: marvinBaseUrl || parsedPlan.marvinBaseUrl || undefined
  };
  return {
    profileName: bundle.profile.name,
    provider: normalizedProvider,
    helperCommand,
    plan
  };
}

async function handleAccountUpsert(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const accounts = buildAccounts({ accounts: [...bundle.config.accounts.filter((item) => sanitizeName(item.id) !== sanitizeName(payload.account?.id || "")), payload.account] });
  const profile = buildProfile({ ...bundle.config, ...payload, profileName: bundle.profile.name, timezone: payload.timezone || bundle.profile.timezone, syncWindowDays: payload.syncWindowDays || bundle.profile.syncWindowDays, accounts, preferences: payload.preferences || bundle.config.preferences, deployment: payload.deployment || bundle.config.deployment, providerConnections: payload.providerConnections || bundle.config.providerConnections, providerCredentials: payload.providerCredentials || bundle.config.providerCredentials, automationTenantId: bundle.profile.runtime?.powerAutomate?.automationTenantId || "", automationEnvironmentUrl: bundle.profile.runtime?.powerAutomate?.environmentUrl || "" });
  const persisted = await persistProfileAndConfig(profile, { ...bundle.config, ...payload, accounts }, bundle.config, bundle.connectionState);
  queuePolicyReconciliation(bundle.profile.name, [payload.account?.id].filter(Boolean));
  return { ...persisted, nextStep: "console" };
}

async function handleAccountRemove(payload) {
  requireFields(payload, ["profileName", "accountId"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const accounts = buildAccounts({ accounts: bundle.config.accounts.filter((item) => sanitizeName(item.id) !== sanitizeName(payload.accountId)) });
  if (accounts.length === 0) throw new Error("At least one calendar account must remain.");
  const tokenState = loadTokenState(bundle.profile.name);
  saveTokenState(bundle.profile.name, {
    records: (Array.isArray(tokenState?.records) ? tokenState.records : []).filter((record) => sanitizeName(record.calendarId) !== sanitizeName(payload.accountId))
  });
  const subscriptionState = loadSubscriptionState(bundle.profile.name);
  const providerSummaries = Object.fromEntries(Object.entries(subscriptionState?.providerSummaries || {}).map(([provider, summary]) => [
    provider,
    {
      ...summary,
      records: (Array.isArray(summary?.records) ? summary.records : []).filter((record) => sanitizeName(record.calendarId) !== sanitizeName(payload.accountId))
    }
  ]));
  saveSubscriptionState(bundle.profile.name, {
    ...subscriptionState,
    subscriptions: (Array.isArray(subscriptionState?.subscriptions) ? subscriptionState.subscriptions : []).filter((record) => sanitizeName(record.calendarId) !== sanitizeName(payload.accountId)),
    providerSummaries,
    automation: {
      ...(subscriptionState?.automation || {}),
      lastRequestedByCalendarIds: (Array.isArray(subscriptionState?.automation?.lastRequestedByCalendarIds) ? subscriptionState.automation.lastRequestedByCalendarIds : []).filter((calendarId) => sanitizeName(calendarId) !== sanitizeName(payload.accountId))
    }
  });
  const providerSecrets = loadProviderSecrets(bundle.profile.name);
  const removedSecretKey = sanitizeName(payload.accountId);
  const remainingCaldavPasswords = Object.fromEntries(
    Object.entries(providerSecrets.caldavPasswords || {}).filter(([calendarId]) => sanitizeName(calendarId) !== removedSecretKey)
  );
  const hasRemainingAppleAccount = accounts.some((account) => account.provider === "apple-caldav");
  saveProviderSecrets(bundle.profile.name, {
    ...providerSecrets,
    caldavPassword: hasRemainingAppleAccount ? providerSecrets.caldavPassword : "",
    caldavPasswords: remainingCaldavPasswords
  }, false);
  const profile = buildProfile({ ...bundle.config, profileName: bundle.profile.name, timezone: bundle.profile.timezone, syncWindowDays: bundle.profile.syncWindowDays, accounts, preferences: bundle.config.preferences, deployment: bundle.config.deployment, providerConnections: bundle.config.providerConnections, providerCredentials: bundle.config.providerCredentials, automationTenantId: bundle.profile.runtime?.powerAutomate?.automationTenantId || "", automationEnvironmentUrl: bundle.profile.runtime?.powerAutomate?.environmentUrl || "" });
  return { ...(await persistProfileAndConfig(profile, { ...bundle.config, accounts }, bundle.config, bundle.connectionState)), nextStep: "console" };
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

function getMicrosoftConnectionContext(payload) {
  requireFields(payload, ["profileName", "calendarId"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const calendar = bundle.profile.calendars.find((item) => item.id === payload.calendarId);
  if (!calendar || (calendar.provider !== "m365" && calendar.provider !== "outlook")) throw new Error("Microsoft calendar not found.");
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === calendar.id);
  if (!target) throw new Error("Microsoft connection state not found.");
  const adapters = createValidationAdapters(bundle.profile.name, bundle.profile, bundle.providerSecrets, bundle.tokenState);
  return { bundle, calendar, nextState, target, adapter: adapters.microsoft };
}

async function handleMicrosoftDiscover(payload) {
  const { bundle, calendar, nextState, target, adapter } = getMicrosoftConnectionContext(payload);
  const identity = await adapter.getConnectedIdentity(calendar);
  const expectedEmail = normalizeString(calendar.email).toLowerCase();
  const verifiedEmail = normalizeString(identity.email || identity.userPrincipalName).toLowerCase();
  const mismatch = Boolean(expectedEmail && verifiedEmail && expectedEmail !== verifiedEmail && !target.identityMismatchConfirmedAt);
  const calendars = await adapter.listCalendars(calendar);
  target.verifiedIdentity = identity;
  target.accountRef = identity.providerIdentityId;
  target.discoveredCalendars = calendars;
  target.status = mismatch ? "confirmation-required" : "selection-required";
  target.lastValidatedAt = new Date().toISOString();
  saveConnectionState(bundle.profile.name, nextState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return {
    config,
    identity,
    calendars,
    requiresIdentityConfirmation: mismatch,
    message: mismatch
      ? `Microsoft verified ${verifiedEmail}, which differs from ${expectedEmail}. Confirm this identity or reconnect.`
      : `Microsoft verified ${verifiedEmail || identity.providerIdentityId} and returned ${calendars.length} calendar(s).`,
    nextStep: mismatch ? "confirm-identity" : "select-calendars"
  };
}

async function handleMicrosoftConfirmIdentity(payload) {
  if (payload.confirmed !== true) throw new Error("Explicit identity confirmation is required.");
  const { bundle, nextState, target } = getMicrosoftConnectionContext(payload);
  if (!target.verifiedIdentity?.providerIdentityId) throw new Error("Discover and verify the Microsoft identity before confirming it.");
  target.identityMismatchConfirmedAt = new Date().toISOString();
  target.status = "selection-required";
  saveConnectionState(bundle.profile.name, nextState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return { config, identity: target.verifiedIdentity, nextStep: "select-calendars" };
}

async function handleMicrosoftSelectCalendars(payload) {
  const { bundle, calendar, target } = getMicrosoftConnectionContext(payload);
  const selectedIds = [...new Set((Array.isArray(payload.providerCalendarIds) ? payload.providerCalendarIds : []).map(normalizeString).filter(Boolean))];
  const discovered = Array.isArray(target.discoveredCalendars) ? target.discoveredCalendars : [];
  const selected = selectedIds.map((id) => discovered.find((item) => item.providerCalendarId === id));
  if (selected.some((item) => !item)) throw createApiError({ code: "MICROSOFT_CALENDAR_NOT_DISCOVERED", message: "One or more selected Microsoft calendars were not returned by the latest discovery.", action: "Refresh Microsoft calendar discovery and select from the current list.", statusCode: 400 });
  if (selected.some((item) => !item.canEdit)) throw createApiError({ code: "MICROSOFT_CALENDAR_READ_ONLY", message: "Only writable Microsoft calendars can be selected for synchronization.", action: "Choose a calendar marked writable, or update its Microsoft permissions.", statusCode: 400 });
  const expectedEmail = normalizeString(calendar.email).toLowerCase();
  const verifiedEmail = normalizeString(target.verifiedIdentity?.email || target.verifiedIdentity?.userPrincipalName).toLowerCase();
  if (expectedEmail && verifiedEmail && expectedEmail !== verifiedEmail && !target.identityMismatchConfirmedAt) {
    throw createApiError({ code: "MICROSOFT_IDENTITY_CONFIRMATION_REQUIRED", message: "Confirm the verified Microsoft identity before selecting calendars.", action: "Confirm the displayed Microsoft identity or reconnect with the intended account.", statusCode: 409 });
  }

  const microsoftAccountId = normalizeString(calendar.microsoftAccountId || calendar.id);
  const linkedAccounts = bundle.config.accounts.filter((account) => account.id === microsoftAccountId || account.microsoftAccountId === microsoftAccountId);
  const linkedAccountIds = new Set(linkedAccounts.map((account) => account.id));
  const retainedAccounts = bundle.config.accounts.filter((account) => (
    !linkedAccountIds.has(account.id)
  ));
  const providerCalendarAccountIds = {};
  for (const account of linkedAccounts) {
    if (normalizeString(account.providerCalendarId)) providerCalendarAccountIds[account.providerCalendarId] = account.id;
  }
  for (const record of (Array.isArray(bundle.connectionState?.records) ? bundle.connectionState.records : [])) {
    if (!linkedAccountIds.has(record.calendarId) || !record.providerCalendarAccountIds || typeof record.providerCalendarAccountIds !== "object") continue;
    Object.assign(providerCalendarAccountIds, record.providerCalendarAccountIds);
  }
  const baseAccount = linkedAccounts.find((account) => account.id === calendar.id) || linkedAccounts[0] || calendar;
  const usedAccountIds = new Set(retainedAccounts.map((account) => account.id));
  let availablePlaceholderId = normalizeString(linkedAccounts.find((account) => !normalizeString(account.providerCalendarId))?.id);
  const accountIdForProviderCalendar = (providerCalendarId) => {
    const preserved = normalizeString(providerCalendarAccountIds[providerCalendarId]);
    if (preserved && !usedAccountIds.has(preserved)) {
      usedAccountIds.add(preserved);
      return preserved;
    }
    if (availablePlaceholderId && !usedAccountIds.has(availablePlaceholderId)) {
      const id = availablePlaceholderId;
      availablePlaceholderId = "";
      usedAccountIds.add(id);
      providerCalendarAccountIds[providerCalendarId] = id;
      return id;
    }
    let candidate = `${microsoftAccountId}-${crypto.createHash("sha256").update(providerCalendarId).digest("hex").slice(0, 8)}`;
    let suffix = 1;
    while (usedAccountIds.has(candidate)) candidate = `${microsoftAccountId}-${crypto.createHash("sha256").update(providerCalendarId).digest("hex").slice(0, 8)}-${suffix++}`;
    usedAccountIds.add(candidate);
    providerCalendarAccountIds[providerCalendarId] = candidate;
    return candidate;
  };
  const connectedAt = new Date().toISOString();
  const selectedAccounts = selected.map((item) => {
    const existingAccount = linkedAccounts.find((account) => account.providerCalendarId === item.providerCalendarId);
    const template = existingAccount || baseAccount;
    const id = accountIdForProviderCalendar(item.providerCalendarId);
    providerCalendarAccountIds[item.providerCalendarId] = id;
    return {
      ...template,
      id,
      label: existingAccount?.label || item.name || calendar.label,
      email: verifiedEmail || calendar.email,
      tenantId: target.verifiedIdentity?.tenantId || calendar.tenantId || "",
      providerCalendarId: item.providerCalendarId,
      microsoftAccountId,
      connectionStatus: "connected",
      connectedAt
    };
  });
  const connectionAccounts = selectedAccounts.length ? selectedAccounts : [{
    ...baseAccount,
    id: microsoftAccountId,
    providerCalendarId: "",
    microsoftAccountId,
    connectionStatus: "selection-required",
    connectedAt: ""
  }];
  const accounts = buildAccounts({ accounts: [...retainedAccounts, ...connectionAccounts] });
  const profile = buildProfile({
    ...bundle.config,
    profileName: bundle.profile.name,
    timezone: bundle.profile.timezone,
    syncWindowDays: bundle.profile.syncWindowDays,
    accounts,
    preferences: bundle.config.preferences,
    deployment: bundle.config.deployment,
    providerConnections: bundle.config.providerConnections,
    providerCredentials: bundle.config.providerCredentials,
    automationTenantId: bundle.profile.runtime?.powerAutomate?.automationTenantId || "",
    automationEnvironmentUrl: bundle.profile.runtime?.powerAutomate?.environmentUrl || ""
  });
  const sourceToken = getTokenRecord(bundle.tokenState, calendar.id) || (Array.isArray(bundle.tokenState?.records) ? bundle.tokenState.records.find((record) => linkedAccountIds.has(record.calendarId)) : null);
  const unrelatedTokens = (Array.isArray(bundle.tokenState?.records) ? bundle.tokenState.records : []).filter((record) => (
    !linkedAccountIds.has(record.calendarId)
  ));
  const selectedTokens = sourceToken ? connectionAccounts.map((account) => ({ ...sourceToken, calendarId: account.id, email: account.email })) : [];
  saveTokenState(profile.name, { records: [...unrelatedTokens, ...selectedTokens] });

  const nextState = synchronizeConnectionState(profile, bundle.connectionState);
  for (const account of connectionAccounts) {
    const record = nextState.records.find((item) => item.calendarId === account.id);
    if (!record) continue;
    record.status = selectedAccounts.length ? "connected" : "selection-required";
    record.connectedAt = account.connectedAt;
    record.accountRef = target.accountRef;
    record.verifiedIdentity = target.verifiedIdentity;
    record.identityMismatchConfirmedAt = target.identityMismatchConfirmedAt;
    record.discoveredCalendars = discovered;
    record.selectedProviderCalendarIds = selectedIds;
    record.providerCalendarAccountIds = providerCalendarAccountIds;
    record.authSession = target.authSession;
  }
  saveConnectionState(profile.name, nextState);
  writeJson(bundle.profilePath, profile);
  writeJson(bundle.eventsPath, buildEvents(profile));
  const config = materializeConfigFromProfile(profile, bundle.config, bundle.config, nextState, loadTokenState(profile.name), loadProviderSecrets(profile.name));
  writeJson(bundle.configPath, config);
  await generateArtifacts(bundle.profilePath);
  return {
    config,
    selectedCalendars: selectedAccounts,
    connectionCalendarId: connectionAccounts[0]?.id || calendar.id,
    nextStep: selectedAccounts.length ? "validate-capabilities" : "selection-paused"
  };
}

async function handleMicrosoftCapabilities(payload) {
  const { bundle, calendar, nextState, target, adapter } = getMicrosoftConnectionContext(payload);
  if (!normalizeString(calendar.providerCalendarId)) throw new Error("Select a discovered Microsoft calendar before checking capabilities.");
  const marvinBaseUrl = normalizeString(bundle.profile.runtime?.deployment?.marvinUrl).replace(/\/$/, "");
  const capabilities = await adapter.assessCalendarCapabilities(calendar, {
    notificationUrl: /^https:\/\//i.test(marvinBaseUrl) ? `${marvinBaseUrl}/marvin-api/webhooks/microsoft` : ""
  });
  target.capabilities = capabilities;
  target.lastValidatedAt = capabilities.checkedAt;
  target.status = capabilities.ready ? "connected" : "action-required";
  target.connectedAt = capabilities.ready ? (target.connectedAt || capabilities.checkedAt) : "";
  saveConnectionState(bundle.profile.name, nextState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return { config, capabilities, nextStep: capabilities.ready ? "privacy-preview" : "resolve-capability" };
}

function getAppleConnectionContext(payload) {
  requireFields(payload, ["profileName", "calendarId"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const calendar = bundle.profile.calendars.find((item) => item.id === payload.calendarId);
  if (!calendar || calendar.provider !== "apple-caldav") throw new Error("Apple calendar not found.");
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === calendar.id);
  if (!target) throw new Error("Apple connection state not found.");
  const adapters = createValidationAdapters(bundle.profile.name, bundle.profile, bundle.providerSecrets, bundle.tokenState);
  return { bundle, calendar, nextState, target, adapter: adapters.caldav };
}

async function handleAppleDiscover(payload) {
  const { bundle, calendar, nextState, target, adapter } = getAppleConnectionContext(payload);
  let discovery;
  try {
    discovery = await adapter.discoverCalendars(calendar);
  } catch (error) {
    target.status = "action-required";
    target.lastValidatedAt = new Date().toISOString();
    target.authSession = {
      ...(target.authSession || {}),
      provider: "caldav",
      failureStage: error?.stage || "discovery",
      lastValidationMessage: error instanceof Error ? error.message : String(error)
    };
    saveConnectionState(bundle.profile.name, nextState);
    throw createApiError({
      code: error?.code || "CALDAV_DISCOVERY_FAILED",
      message: error instanceof Error ? error.message : String(error),
      action: "Verify the Apple Account, app-specific password, and CalDAV service address, then run discovery again.",
      statusCode: error?.httpStatus === 401 || error?.httpStatus === 403 ? 401 : 502
    });
  }
  target.accountRef = discovery.principalUrl;
  target.discoveredCalendars = discovery.calendars;
  target.status = "selection-required";
  target.lastValidatedAt = new Date().toISOString();
  target.authSession = {
    ...(target.authSession || {}),
    provider: "caldav",
    principalUrl: discovery.principalUrl,
    calendarHomeUrl: discovery.calendarHomeUrl,
    discoveryCompletedAt: target.lastValidatedAt,
    lastValidationMessage: "Apple CalDAV discovery completed."
  };
  saveConnectionState(bundle.profile.name, nextState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return {
    config,
    calendars: discovery.calendars,
    message: `Apple returned ${discovery.calendars.length} calendar collection(s). Select the calendars Project Marvin should use.`,
    nextStep: "select-calendars"
  };
}

async function handleAppleSelectCalendars(payload) {
  const { bundle, calendar, target } = getAppleConnectionContext(payload);
  const selectedIds = [...new Set((Array.isArray(payload.providerCalendarIds) ? payload.providerCalendarIds : []).map(normalizeString).filter(Boolean))];
  if (selectedIds.length === 0) throw createApiError({ code: "CALDAV_CALENDAR_SELECTION_REQUIRED", message: "Select at least one writable Apple calendar.", action: "Choose one or more calendars marked writable.", statusCode: 400 });
  const discovered = Array.isArray(target.discoveredCalendars) ? target.discoveredCalendars : [];
  const selected = selectedIds.map((id) => discovered.find((item) => normalizeString(item.providerCalendarId) === id));
  if (selected.some((item) => !item)) throw createApiError({ code: "CALDAV_CALENDAR_NOT_DISCOVERED", message: "One or more selected Apple calendars were not returned by current discovery.", action: "Refresh Apple calendar discovery and choose from the current list.", statusCode: 400 });
  if (selected.some((item) => !item.canRead || !item.canEdit)) throw createApiError({ code: "CALDAV_CALENDAR_READ_ONLY", message: "Only readable, writable Apple calendars can be selected for two-way synchronization.", action: "Choose calendars marked writable.", statusCode: 400 });

  const caldavAccountId = normalizeString(calendar.caldavAccountId || calendar.id);
  const linkedAccountIds = new Set(bundle.config.accounts
    .filter((account) => account.id === caldavAccountId || account.caldavAccountId === caldavAccountId)
    .map((account) => account.id));
  const retainedAccounts = bundle.config.accounts.filter((account) => !linkedAccountIds.has(account.id));
  const connectedAt = new Date().toISOString();
  const selectedAccounts = selected.map((item, index) => ({
    ...bundle.config.accounts.find((account) => account.id === calendar.id),
    id: index === 0 ? caldavAccountId : `${caldavAccountId}-${crypto.createHash("sha256").update(item.providerCalendarId).digest("hex").slice(0, 8)}`,
    label: item.name || calendar.label,
    providerCalendarId: item.providerCalendarId,
    caldavServerUrl: item.providerCalendarId,
    caldavAccountId,
    connectionStatus: "connected",
    connectedAt
  }));
  const accounts = buildAccounts({ accounts: [...retainedAccounts, ...selectedAccounts] });
  const profile = buildProfile({
    ...bundle.config,
    profileName: bundle.profile.name,
    timezone: bundle.profile.timezone,
    syncWindowDays: bundle.profile.syncWindowDays,
    accounts,
    preferences: bundle.config.preferences,
    deployment: bundle.config.deployment,
    providerConnections: bundle.config.providerConnections,
    providerCredentials: bundle.config.providerCredentials,
    automationTenantId: bundle.profile.runtime?.powerAutomate?.automationTenantId || "",
    automationEnvironmentUrl: bundle.profile.runtime?.powerAutomate?.environmentUrl || ""
  });
  const sourcePassword = getCalDavPasswordForCalendar(bundle.profile.name, calendar.id);
  if (!sourcePassword) throw createApiError({ code: "CALDAV_CREDENTIAL_MISSING", message: "The Apple app-specific password is no longer available.", action: "Enter a replacement app-specific password and reconnect.", statusCode: 409 });
  saveProviderSecrets(profile.name, {
    caldavPasswords: Object.fromEntries(selectedAccounts.map((account) => [account.id, sourcePassword]))
  }, true);

  const nextState = synchronizeConnectionState(profile, bundle.connectionState);
  for (const account of selectedAccounts) {
    const record = nextState.records.find((item) => item.calendarId === account.id);
    if (!record) continue;
    record.status = "connected";
    record.connectedAt = connectedAt;
    record.lastValidatedAt = connectedAt;
    record.accountRef = target.accountRef;
    record.discoveredCalendars = discovered;
    record.selectedProviderCalendarIds = selectedIds;
    record.authSession = target.authSession;
  }
  saveConnectionState(profile.name, nextState);
  writeJson(bundle.profilePath, profile);
  writeJson(bundle.eventsPath, buildEvents(profile));
  const config = materializeConfigFromProfile(profile, bundle.config, bundle.config, nextState, loadTokenState(profile.name), loadProviderSecrets(profile.name));
  writeJson(bundle.configPath, config);
  await generateArtifacts(bundle.profilePath);
  return { config, selectedCalendars: selectedAccounts, nextStep: "validate-capabilities" };
}

async function handleAppleCapabilities(payload) {
  const { bundle, calendar, nextState, target, adapter } = getAppleConnectionContext(payload);
  if (!normalizeString(calendar.providerCalendarId)) throw new Error("Select a discovered Apple calendar before checking capabilities.");
  const capabilities = await adapter.assessCalendarCapabilities(calendar);
  target.capabilities = capabilities;
  target.lastValidatedAt = capabilities.checkedAt;
  target.status = capabilities.ready ? "connected" : "action-required";
  target.connectedAt = capabilities.ready ? (target.connectedAt || capabilities.checkedAt) : "";
  saveConnectionState(bundle.profile.name, nextState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return { config, capabilities, nextStep: capabilities.ready ? "privacy-preview" : "resolve-capability" };
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

  // A successful final validation hands setup to the always-on sync process.
  let runtimeStart = null;
  if (validationSummary.total > 1 && validationSummary.connected === validationSummary.total) {
    try {
      runtimeStart = await handleRuntimeStart({
        profileName: bundle.profile.name,
        intervalSeconds: Number(process.env.MARVIN_SYNC_INTERVAL_SECONDS || 300),
        windowDays: bundle.profile.syncWindowDays
      });
    } catch (error) {
      runtimeStart = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    config: runtimeStart?.config || config,
    results,
    validationSummary,
    runtimeStarted: Boolean(runtimeStart?.runtimeProcess?.running),
    runtimeStatus: runtimeStart?.runtimeStatus || null,
    runtimeProcess: runtimeStart?.runtimeProcess || null,
    runtimeStartError: runtimeStart?.error || "",
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
    target.status = validation.ok ? "discovery-required" : "invalid";
    target.connectedAt = "";
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
        ? { ...calendar, connectionStatus: target.status, connectedAt: undefined }
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
      message: validation.ok ? "Apple credentials were accepted. Discover and select a writable calendar next." : (validation.message || ""),
      nextStep: "console"
    };
  }

  const authState = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = buildPkceChallenge(codeVerifier);
  const requestedAt = new Date();
  const launch = buildConnectionLaunchUrl(bundle.profile, account, authState, codeChallenge);
  target.authSession = {
    state: authState,
    provider: launch.provider,
    requestedAt: requestedAt.toISOString(),
    expiresAt: new Date(requestedAt.getTime() + oauthTransactionTtlMs).toISOString(),
    codeVerifier,
    codeChallengeMethod: "S256",
    authUrl: launch.launchUrl,
    redirectUri: launch.redirectUri
  };
  target.lastValidatedAt = new Date().toISOString();
  saveConnectionState(bundle.profile.name, nextState);
  const config = materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, nextState, loadTokenState(bundle.profile.name), loadProviderSecrets(bundle.profile.name));
  writeJson(bundle.configPath, config);
  return { config, authSession: sanitizeAuthSession(target.authSession), launchUrl: launch.launchUrl, message: launch.reason || "", nextStep: "console" };
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
    throw new Error(`Project Marvin cannot start synchronization yet because not every calendar is connected and validated.${detail}`);
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
  if (!deployEnabled) throw new Error("Hosted Project Marvin runtime cannot redeploy itself. Use the local repo deployment flow.");
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
    return { statusCode: 404, html: renderAuthCompletionHtml("Project Marvin could not match this authorization request", "The auth state was not found in Project Marvin's local connection store.", false) };
  }
  const bundle = loadConfigBundle(match.profileName);
  if (!bundle.config || !bundle.profile) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Project Marvin profile not found", "The matching profile for this authorization request could not be loaded.", false) };
  }
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === match.record.calendarId);
  const calendar = bundle.profile.calendars.find((item) => item.id === match.record.calendarId);
  if (!target || !calendar) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Calendar record not found", "Project Marvin found the auth state but could not locate the target calendar record.", false) };
  }
  const expiresAt = Date.parse(target.authSession?.expiresAt || "");
  if (target.authSession?.provider !== provider || target.authSession?.consumedAt || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { statusCode: 400, html: renderAuthCompletionHtml("Project Marvin authorization request expired", "Start the provider connection again from the management portal.", false) };
  }
  const launch = buildProviderAuthorizeRequest(bundle.profile, calendar, authState, buildPkceChallenge(target.authSession?.codeVerifier || ""));
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
    return { statusCode: 409, html: renderAuthCompletionHtml(`Project Marvin cannot start ${provider} sign-in yet`, launch.reason || "Provider runtime is missing required configuration.", false) };
  }
  return { statusCode: 302, redirectUrl: launch.authorizeUrl };
}

function handleMicrosoftAdminConsentStart(url) {
  const tenant = normalizeString(url.searchParams.get("tenant"));
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tenant)) {
    return { statusCode: 400, html: renderAuthCompletionHtml("Microsoft administrator consent could not start", "The tenant ID is missing or invalid.", false) };
  }
  const latest = getLatestState();
  const bundle = loadConfigBundle(latest.profileName || "");
  if (!bundle.config || !bundle.profile) {
    return { statusCode: 503, html: renderAuthCompletionHtml("Microsoft administrator consent could not start", "Project Marvin does not have an active hosted profile.", false) };
  }
  const requirements = buildProviderRequirements(bundle.profile, bundle.config.providerCredentials || {});
  const clientId = normalizeString(bundle.config.providerCredentials?.microsoftClientId || bundle.profile.runtime?.providerConnections?.microsoft?.clientId);
  if (!clientId) {
    return { statusCode: 503, html: renderAuthCompletionHtml("Microsoft administrator consent could not start", "Project Marvin's Microsoft application ID is not configured.", false) };
  }
  const state = randomBase64Url(32);
  const expiresAt = Date.now() + oauthTransactionTtlMs;
  adminConsentTransactions.set(state, { tenant, expiresAt });
  for (const [candidate, transaction] of adminConsentTransactions.entries()) {
    if (!transaction || transaction.expiresAt <= Date.now()) adminConsentTransactions.delete(candidate);
  }
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "openid profile offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.ReadWrite",
    redirect_uri: requirements.microsoft.redirectUri,
    state
  });
  return { statusCode: 302, redirectUrl: `https://login.microsoftonline.com/${tenant}/v2.0/adminconsent?${params.toString()}` };
}

async function handleOAuthCallback(provider, url) {
  const authState = normalizeString(url.searchParams.get("state"));
  const code = normalizeString(url.searchParams.get("code"));
  const scope = normalizeString(url.searchParams.get("scope"));
  const error = normalizeString(url.searchParams.get("error"));
  const errorDescription = normalizeString(url.searchParams.get("error_description"));
  const adminConsent = normalizeString(url.searchParams.get("admin_consent")).toLowerCase();
  const consentTenant = normalizeString(url.searchParams.get("tenant"));
  const adminConsentTransaction = provider === "microsoft" && authState ? adminConsentTransactions.get(authState) : null;
  if (provider === "microsoft" && (adminConsent || adminConsentTransaction)) {
    if (!adminConsentTransaction || adminConsentTransaction.expiresAt <= Date.now()) {
      if (authState) adminConsentTransactions.delete(authState);
      return {
        statusCode: 400,
        html: renderAuthCompletionHtml("Microsoft administrator consent could not be verified", "The confirmation state is missing, expired, or was already used. Start again from the administrator approval page.", false)
      };
    }
    adminConsentTransactions.delete(authState);
    if (error) {
      return {
        statusCode: 400,
        html: renderAuthCompletionHtml("Microsoft administrator consent failed", errorDescription || `Microsoft returned error: ${error}.`, false)
      };
    }
    const granted = adminConsent === "true";
    const tenantMatches = !consentTenant || consentTenant.toLowerCase() === adminConsentTransaction.tenant.toLowerCase();
    return {
      statusCode: granted && tenantMatches ? 200 : 400,
      html: renderAuthCompletionHtml(
        granted && tenantMatches ? "Microsoft administrator consent granted" : "Microsoft administrator consent was not granted",
        granted && tenantMatches
          ? "Microsoft confirmed administrator approval for the requested organization. Return to Marvin and connect the Microsoft calendar account again."
          : !tenantMatches
            ? "Microsoft returned a different tenant than the approval request. Start again from the tenant-specific administrator approval page."
            : "The Microsoft administrator did not approve Project Marvin. Ask the tenant administrator to review the requested delegated permissions and try again.",
        granted && tenantMatches
      )
    };
  }
  if (provider === "microsoft" && !authState && error) {
    return {
      statusCode: 400,
      html: renderAuthCompletionHtml("Microsoft administrator consent failed", errorDescription || `Microsoft returned error: ${error}.`, false)
    };
  }
  const match = findConnectionStateByAuthState(authState);
  if (!match) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Project Marvin could not match this authorization request", "The auth state was not found in Project Marvin's local connection store.", false) };
  }
  const bundle = loadConfigBundle(match.profileName);
  if (!bundle.config || !bundle.profile) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Project Marvin profile not found", "The matching profile for this authorization request could not be loaded.", false) };
  }
  const nextState = synchronizeConnectionState(bundle.profile, bundle.connectionState);
  const target = nextState.records.find((item) => item.calendarId === match.record.calendarId);
  const calendar = bundle.profile.calendars.find((item) => item.id === match.record.calendarId);
  if (!target || !calendar) {
    return { statusCode: 404, html: renderAuthCompletionHtml("Calendar record not found", "Project Marvin found the auth state but could not locate the target calendar record.", false) };
  }
  const expiresAt = Date.parse(target.authSession?.expiresAt || "");
  if (target.authSession?.provider !== provider || target.authSession?.consumedAt || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { statusCode: 400, html: renderAuthCompletionHtml("Project Marvin authorization request expired or was already used", "Start the provider connection again from the management portal.", false) };
  }
  target.lastValidatedAt = new Date().toISOString();
  target.status = error ? "invalid" : "pending";
  target.authSession = {
    ...(target.authSession || {}),
    provider,
    callbackReceivedAt: new Date().toISOString(),
    consumedAt: new Date().toISOString(),
    scope,
    error
  };
  saveConnectionState(bundle.profile.name, nextState);

  let tokenMessage = "";
  let tokenOk = !error;
  if (!error) {
    const exchange = await exchangeAuthorizationCode(bundle.profile, calendar, target.authSession, code);
    if (exchange.exchanged) {
      const verifiedIdentity = exchange.tokenRecord.identity || null;
      const expectedEmail = normalizeString(calendar.email).toLowerCase();
      const verifiedEmail = normalizeString(verifiedIdentity?.email || verifiedIdentity?.userPrincipalName).toLowerCase();
      const identityMismatch = Boolean(expectedEmail && verifiedEmail && expectedEmail !== verifiedEmail);
      target.status = identityMismatch ? "confirmation-required" : "connected";
      target.connectedAt = new Date().toISOString();
      target.accountRef = normalizeString(exchange.tokenRecord?.accountRef || target.accountRef);
      target.verifiedIdentity = verifiedIdentity;
      upsertTokenStateRecord(bundle.profile.name, calendar, exchange.tokenRecord);
      tokenMessage = identityMismatch
        ? `Microsoft verified ${verifiedEmail}, which differs from ${expectedEmail}. Return to Project Marvin to confirm this account before selecting calendars.`
        : `Project Marvin exchanged the ${provider} authorization code, verified the Microsoft identity, and marked this account connected.`;
    } else {
      upsertTokenStateRecord(bundle.profile.name, calendar, {
        status: exchange.reason === "token-exchange-failed" ? "error" : "pending",
        scope,
        redirectUri: target.authSession?.redirectUri || "",
        lastError: exchange.message || ""
      });
      tokenMessage = exchange.message || `Project Marvin captured the ${provider} authorization code, but token exchange is not complete yet.`;
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
      scope,
      redirectUri: target.authSession?.redirectUri || "",
      lastError: `Provider returned error: ${error}`
    });
    return { statusCode: 400, html: renderAuthCompletionHtml(`Project Marvin ${provider} authorization failed`, `Provider returned error: ${error}.`, false) };
  }
  return { statusCode: tokenOk ? 200 : 502, html: renderAuthCompletionHtml(`Project Marvin processed the ${provider} authorization callback`, tokenMessage, tokenOk) };
}

async function bootstrapPayload(req) {
  const latest = getLatestState();
  const operator = getPrimaryOperator();
  const auth = getAuthContext(req);
  let config = null;
  let calendarReview = null;
  if (auth.authenticated && latest.profileName) {
    try {
      const loaded = await handleLoadConfig(latest.profileName);
      config = loaded.config;
      calendarReview = loaded.calendarReview;
    }
    catch { config = readJson(getConfigPath(latest.profileName), null); }
  }
  return {
    ok: true,
    port,
    product: "project-marvin",
    authentication: { entraConfigured: entraAuthenticator.configured(), devAuthEnabled, provider: "entra" },
    deployEnabled,
    hostedMode,
    hasOperator: Boolean(operator),
    hasConfig: Boolean(latest.profileName && readJson(getConfigPath(latest.profileName), null)),
    authenticated: Boolean(auth.authenticated),
    requiresLogin: Boolean(operator) && !auth.authenticated,
    operator: toPublicOperator(operator),
    config,
    calendarReview
  };
}

async function handleRuntimeRetry(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const runtimeStatus = loadRuntimeStatus(bundle.profile.name) || {};
  const failures = Array.isArray(runtimeStatus.lastResult?.failures) ? runtimeStatus.lastResult.failures : [];
  const calendarIds = [...new Set(failures.flatMap((failure) => [failure.calendarId, failure.sourceCalendarId, failure.targetCalendarId]).map(normalizeString).filter(Boolean))];
  const current = loadSubscriptionState(bundle.profile.name);
  const next = markWebhookSyncRequest(current, { provider: "operator", calendarIds });
  saveSubscriptionState(bundle.profile.name, next);
  return {
    config: materializeConfigFromProfile(bundle.profile, bundle.config, bundle.config, bundle.connectionState, bundle.tokenState, bundle.providerSecrets),
    queued: true,
    calendarIds,
    previousFailureCount: failures.length,
    message: failures.length ? "Failed synchronization work was queued for an idempotent reconciliation cycle." : "An operator-directed reconciliation cycle was queued."
  };
}

function queuePolicyReconciliation(profileName, calendarIds = []) {
  const mappingPath = path.join(root, "artifacts", "marvin-engine", `${sanitizeName(profileName)}.mappings.json`);
  const mappingState = readJson(mappingPath, null);
  if (mappingState) {
    writeJson(mappingPath, { ...mappingState, changeTracking: {} });
  }
  const current = loadSubscriptionState(profileName);
  saveSubscriptionState(profileName, markWebhookSyncRequest(current, { provider: "operator-policy", calendarIds }));
}

async function handleCalendarReview(payload) {
  requireFields(payload, ["profileName"]);
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const now = Date.now();
  const windowStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now + Number(bundle.profile.syncWindowDays || 45) * 24 * 60 * 60 * 1000);
  const runtime = createRuntimeContext({ rootDir: root, profilePath: bundle.profilePath });
  const review = await buildCalendarReview({
    profile: runtime.profile,
    adapters: runtime.adapters,
    mappings: runtime.store.load()?.mappings || [],
    windowStart,
    windowEnd
  });
  const reviewPath = getCalendarReviewPath(bundle.profile.name);
  const previous = readJson(reviewPath, { decisions: {} });
  const state = {
    generatedAt: review.generatedAt,
    review,
    decisions: previous?.decisions && typeof previous.decisions === "object" ? previous.decisions : {}
  };
  writeJson(reviewPath, state);
  return { review: mergeDuplicateDecisions(review, state.decisions), deleteEnabled: false };
}

async function handleDuplicateDecision(payload) {
  requireFields(payload, ["profileName", "candidateId", "decision"]);
  if (!['keep', 'remove'].includes(payload.decision)) throw new Error("Duplicate decision must be Keep or Remove.");
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const reviewPath = getCalendarReviewPath(bundle.profile.name);
  const state = readJson(reviewPath, null);
  if (!state?.review) throw new Error("Run the duplicate scan before reviewing entries.");
  const candidates = state.review.duplicateGroups.flatMap((group) => group.candidates);
  const candidate = candidates.find((item) => item.candidateId === payload.candidateId);
  if (!candidate) throw new Error("Duplicate candidate was not found in the latest scan.");
  if (candidate.obsoletePrefix && payload.decision === "keep") throw new Error("A mirror using an obsolete prefix cannot be kept. Repair the correctly prefixed mirror first.");
  const decisions = { ...(state.decisions || {}), [payload.candidateId]: payload.decision };
  writeJson(reviewPath, { ...state, decisions, updatedAt: new Date().toISOString() });
  return {
    review: mergeDuplicateDecisions(state.review, decisions),
    deleteEnabled: false,
    message: "Decision saved for review. No calendar item was deleted."
  };
}

async function handleEventOverride(payload) {
  requireFields(payload, ["profileName", "eventKey", "availabilityMode"]);
  if (!["default", ...AVAILABILITY_MODES].includes(payload.availabilityMode)) throw new Error("Choose a supported availability behavior.");
  const bundle = loadConfigBundle(payload.profileName);
  if (!bundle.config || !bundle.profile) throw new Error("Profile not found.");
  const reviewState = readJson(getCalendarReviewPath(bundle.profile.name), null);
  const sourceEvent = reviewState?.review?.sourceEvents?.find((event) => event.eventKey === payload.eventKey);
  if (!sourceEvent) throw new Error("Run the calendar review again before changing this event.");
  const existing = normalizeEventOverrides(bundle.config.eventOverrides || []);
  const matches = (item) => item.sourceCalendarId === sourceEvent.sourceCalendarId
    && (sourceEvent.providerEventIdentity ? item.providerEventIdentity === sourceEvent.providerEventIdentity : item.sourceEventId === sourceEvent.sourceEventId);
  const eventOverrides = existing.filter((item) => !matches(item));
  if (payload.availabilityMode !== "default") {
    eventOverrides.push(normalizeEventOverrides([{
      id: sourceEvent.eventKey,
      sourceCalendarId: sourceEvent.sourceCalendarId,
      sourceEventId: sourceEvent.sourceEventId,
      providerEventIdentity: sourceEvent.providerEventIdentity,
      targetCalendarIds: payload.targetCalendarIds,
      availabilityMode: payload.availabilityMode,
      detailMode: payload.detailMode,
      visibility: payload.visibility,
      updatedAt: new Date().toISOString()
    }])[0]);
  }
  const profile = buildProfile({
    ...bundle.config,
    profileName: bundle.profile.name,
    timezone: bundle.profile.timezone,
    syncWindowDays: bundle.profile.syncWindowDays,
    accounts: bundle.config.accounts,
    eventOverrides
  });
  const persisted = await persistProfileAndConfig(profile, { ...bundle.config, eventOverrides }, bundle.config, bundle.connectionState);
  queuePolicyReconciliation(bundle.profile.name, [sourceEvent.sourceCalendarId]);
  return {
    ...persisted,
    eventOverrides,
    message: "Event exception saved. Marvin will update its mirrors only; the original event remains unchanged."
  };
}

function buildOperationalHealth() {
  const latest = getLatestState();
  const profileName = normalizeString(latest.profileName);
  const profileConfigured = Boolean(profileName && fs.existsSync(getProfilePath(profileName)));
  const runtimeStatus = profileConfigured ? loadRuntimeStatus(profileName) : null;
  const runtimeProcess = profileConfigured ? loadRuntimeProcessStatus(profileName) : null;
  const tokenState = profileConfigured ? loadTokenState(profileName) : { records: [] };
  const subscriptionState = profileConfigured ? loadSubscriptionState(profileName) : normalizeSubscriptionState({});
  const bundle = profileConfigured ? loadConfigBundle(profileName) : null;
  const now = Date.now();
  const tokens = Array.isArray(tokenState?.records) ? tokenState.records : [];
  const configuredCalendars = Array.isArray(bundle?.profile?.calendars) ? bundle.profile.calendars : [];
  const connectionRecords = Array.isArray(bundle?.connectionState?.records) ? bundle.connectionState.records : [];
  const providerReadiness = configuredCalendars.map((calendar) => {
    const provider = normalizeString(calendar.provider).toLowerCase();
    const connection = connectionRecords.find((record) => record.calendarId === calendar.id);
    const connectionStatus = normalizeString(connection?.status || calendar.connectionStatus).toLowerCase();
    const token = getTokenRecord(tokenState, calendar.id);
    const isApple = provider === "apple-caldav";
    const requiresCapabilities = isApple || provider === "m365" || provider === "outlook";
    const credentialReady = isApple
      ? Boolean(bundle?.providerSecrets?.caldavPassword || bundle?.providerSecrets?.caldavPasswords?.[sanitizeName(calendar.id)])
      : isTokenRecordUsable(token, now);
    return {
      ready: connectionStatus === "connected" && credentialReady && (!requiresCapabilities || Boolean(connection?.capabilities?.ready)),
      failed: connectionStatus === "invalid" || normalizeString(token?.status).toLowerCase() === "error"
    };
  });
  const providerReadyCalendars = providerReadiness.filter((record) => record.ready).length;
  const providerActionRequired = configuredCalendars.length - providerReadyCalendars;
  const providerConnectionErrors = providerReadiness.filter((record) => record.failed).length;
  const expiringTokens = tokens.filter((record) => {
    const expiresAt = Date.parse(record.expiresAt || "");
    return Number.isFinite(expiresAt) && expiresAt > now && expiresAt - now <= 24 * 60 * 60 * 1000;
  }).length;
  const consecutiveFailures = Number(runtimeStatus?.consecutiveFailures || 0);
  const alerts = [];
  if (profileConfigured && !runtimeProcess?.running) alerts.push({ code: "SYNC_STOPPED", severity: "critical", threshold: "configured runtime is not running" });
  if (consecutiveFailures >= 3) alerts.push({ code: "REPEATED_FAILURE", severity: "warning", threshold: "3 consecutive failed runs" });
  if (expiringTokens > 0) alerts.push({ code: "TOKEN_EXPIRING", severity: "warning", threshold: "provider token expires within 24 hours", count: expiringTokens });
  if (providerActionRequired > 0) alerts.push({ code: "PROVIDER_AUTH_REQUIRED", severity: "warning", threshold: "configured calendar authorization or capability validation is incomplete", count: providerActionRequired });
  if (providerConnectionErrors > 0) alerts.push({ code: "PROVIDER_CONNECTION_ERROR", severity: "warning", threshold: "provider connection or token validation failed", count: providerConnectionErrors });
  const lastCompletedAt = normalizeString(runtimeStatus?.lastCompletedAt);
  const staleAfterMs = Math.max(900, Number(runtimeStatus?.intervalSeconds || 300) * 3) * 1000;
  if (runtimeProcess?.running && lastCompletedAt && now - Date.parse(lastCompletedAt) > staleAfterMs) alerts.push({ code: "SYNC_STALE", severity: "warning", threshold: "no completed run within 3 polling intervals" });
  const state = !profileConfigured ? "setup-required" : alerts.some((alert) => alert.severity === "critical") ? "degraded" : alerts.length ? "attention" : "ready";
  return {
    product: "project-marvin",
    state,
    live: true,
    ready: state !== "degraded",
    checkedAt: new Date().toISOString(),
    profileConfigured,
    metrics: {
      runtimeRunning: Boolean(runtimeProcess?.running),
      runCount: Number(runtimeStatus?.runCount || 0),
      consecutiveFailures,
      currentPollDelaySeconds: Number(runtimeStatus?.currentPollDelaySeconds || runtimeStatus?.intervalSeconds || 0),
      lastCompletedAt,
      nextPollAt: normalizeString(runtimeStatus?.nextPollAt),
      configuredCalendars: configuredCalendars.length,
      providerReadyCalendars,
      providerActionRequired,
      usableTokens: tokens.filter((record) => isTokenRecordUsable(record)).length,
      tokenErrors: tokens.filter((record) => normalizeString(record.status).toLowerCase() === "error").length,
      expiringTokens,
      activeSubscriptions: (subscriptionState.subscriptions || []).filter((record) => normalizeString(record.status).toLowerCase() === "active").length,
      pendingWebhookSync: Boolean(subscriptionState.automation?.pendingSyncRequested)
    },
    alerts
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
    const requestStartedAt = Date.now();
    const requestedCorrelationId = normalizeString(req.headers["x-correlation-id"]);
    const correlationId = /^[a-z0-9._-]{8,128}$/i.test(requestedCorrelationId) ? requestedCorrelationId : crypto.randomUUID();
    req.marvinCorrelationId = correlationId;
    res.setHeader("X-Correlation-ID", correlationId);
    res.once("finish", () => {
      let route = "/";
      try { route = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname; } catch {}
      console.log(JSON.stringify({ event: "http.request", correlationId, method: req.method || "GET", route, statusCode: res.statusCode, durationMs: Date.now() - requestStartedAt }));
    });
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      if (req.method === "GET" && url.pathname === "/api/health/live") return sendJson(res, 200, { product: "project-marvin", state: "live", live: true, checkedAt: new Date().toISOString() });
      if (req.method === "GET" && url.pathname === "/api/health/ready") { const health = buildOperationalHealth(); return sendJson(res, health.ready ? 200 : 503, health); }
      if (req.method === "GET" && (url.pathname === "/marvin-api/status" || url.pathname === "/api/status" || url.pathname === "/marvin-api/bootstrap")) return sendJson(res, 200, await bootstrapPayload(req));
      if ((req.method === "GET" || req.method === "POST") && url.pathname === "/marvin-api/webhooks/microsoft") { const profileName = resolveSubscriptionProfileName(); const validationToken = url.searchParams.get("validationToken") || ""; if (validationToken) { recordMicrosoftWebhookValidation(profileName, validationToken); return sendText(res, 200, validationToken); } const payload = req.method === "POST" ? await parseJson(req).catch(() => ({})) : {}; const recorded = recordMicrosoftWebhookNotifications(profileName, payload); return sendJson(res, 202, { ok: true, provider: "microsoft", profileName, received: recorded.notificationsReceived, queuedSync: recorded.notificationsReceived > 0, calendarIds: recorded.calendarIds }); }
      if ((req.method === "POST" || req.method === "GET") && url.pathname === "/marvin-api/webhooks/google") { const profileName = resolveSubscriptionProfileName(); const payload = req.method === "POST" ? await parseJson(req).catch(() => ({})) : {}; const recorded = recordGoogleWebhookNotification(profileName, req, payload); return sendJson(res, 202, { ok: true, provider: "google", profileName, received: recorded.notificationsReceived, queuedSync: true, calendarIds: recorded.calendarIds }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/auth/entra/start") { const redirectUrl = await entraAuthenticator.start(); return sendRedirect(res, redirectUrl); }
      if (req.method === "GET" && url.pathname === "/marvin-api/auth/entra/callback") { const result = await handleEntraCallback(url); return sendRedirect(res, "/", result.headers || {}); }
      if (req.method === "POST" && url.pathname === "/marvin-api/auth/dev") { const result = await handleDevAuth(req); return sendJson(res, 200, { ok: true, authenticated: true, operator: result.operator }, result.headers || {}); }
      if (req.method === "POST" && url.pathname === "/marvin-api/logout") { const result = await handleLogout(req); return sendJson(res, 200, { ok: true, ...result }, result.headers || {}); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/microsoft/start") { const result = await handleOAuthStart("microsoft", url); if (result.redirectUrl) return sendRedirect(res, result.redirectUrl); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/microsoft/admin-consent/start") { const result = handleMicrosoftAdminConsentStart(url); if (result.redirectUrl) return sendRedirect(res, result.redirectUrl); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/google/start") { const result = await handleOAuthStart("google", url); if (result.redirectUrl) return sendRedirect(res, result.redirectUrl); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/microsoft/callback") { const result = await handleOAuthCallback("microsoft", url); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/oauth/google/callback") { const result = await handleOAuthCallback("google", url); return sendHtml(res, result.statusCode, result.html); }
      if (req.method === "GET" && url.pathname === "/marvin-api/connections") { requireAuth(req); const profileName = url.searchParams.get("profileName") || ""; return sendJson(res, 200, { ok: true, profileName, connectionState: sanitizeConnectionStateForUi(loadConnectionState(profileName)), tokenState: sanitizeTokenStateForUi(loadTokenState(profileName)) }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/runtime-status") { requireAuth(req); const profileName = url.searchParams.get("profileName") || getLatestState().profileName || ""; return sendJson(res, 200, { ok: true, profileName, runtimeStatus: loadRuntimeStatus(profileName), runtimeProcess: loadRuntimeProcessStatus(profileName), subscriptionState: loadSubscriptionState(profileName) }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/health") { requireAuth(req); return sendJson(res, 200, { ok: true, correlationId, ...buildOperationalHealth() }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/config") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleLoadConfig(url.searchParams.get("profileName") || getLatestState().profileName || "")) }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/provider-requirements") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleProviderRequirements(url.searchParams.get("profileName") || getLatestState().profileName || "")) }); }
      if (req.method === "GET" && url.pathname === "/marvin-api/provider-plan") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleProviderPlan(url.searchParams.get("profileName") || getLatestState().profileName || "", url.searchParams.get("provider") || "")) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/save-config") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleSaveConfig(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/account-upsert") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleAccountUpsert(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/account-remove") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleAccountRemove(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/provider-config") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleProviderConfig(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-update") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionUpdate(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/microsoft/discover") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleMicrosoftDiscover(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/microsoft/confirm-identity") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleMicrosoftConfirmIdentity(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/microsoft/select-calendars") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleMicrosoftSelectCalendars(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/microsoft/capabilities") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleMicrosoftCapabilities(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/apple/discover") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleAppleDiscover(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/apple/select-calendars") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleAppleSelectCalendars(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/apple/capabilities") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleAppleCapabilities(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-begin") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionBegin(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-validate") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionValidate(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/connection-validate-all") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleConnectionValidateAll(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/runtime-start") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleRuntimeStart(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/runtime-stop") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleRuntimeStop(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/runtime-retry") { requireAuth(req); return sendJson(res, 202, { ok: true, ...(await handleRuntimeRetry(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/calendar-review") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleCalendarReview(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/duplicate-decision") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleDuplicateDecision(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/event-override") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleEventOverride(await parseJson(req))) }); }
      if (req.method === "POST" && url.pathname === "/marvin-api/deploy") { requireAuth(req); return sendJson(res, 200, { ok: true, ...(await handleDeploy(await parseJson(req))) }); }
      const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      const resolvedPath = path.normalize(path.join(publicRoot, requestedPath));
      if (!resolvedPath.startsWith(publicRoot)) throw createApiError({ code: "FORBIDDEN", message: "The requested path is not allowed.", action: "Use a supported portal or API path.", statusCode: 403 });
      if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) throw createApiError({ code: "NOT_FOUND", message: "Resource not found.", action: "Check the requested path.", statusCode: 404 });
      return sendBuffer(res, 200, fs.readFileSync(resolvedPath), mimeMap[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream");
    } catch (error) {
      const normalized = normalizeApiError(error);
      normalized.payload.correlationId = req.marvinCorrelationId;
      return sendJson(res, normalized.statusCode, normalized.payload, error?.headers || {});
    }
  });
  server.listen(port, () => {
    console.log(`Project Marvin onboard UI running at http://localhost:${port}`);
  });
  return server;
}
