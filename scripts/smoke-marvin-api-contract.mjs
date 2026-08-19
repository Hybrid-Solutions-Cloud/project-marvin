import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-api-contract-${Date.now()}`);
const port = 4400 + Math.floor(Math.random() * 300);
const profileName = "marvin-api-contract";
fs.mkdirSync(tempRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port),
    MARVIN_DEV_AUTH_ENABLED: "true",
    MARVIN_DEV_AUTH_EMAIL: "api-contract@example.com",
    MARVIN_DEV_AUTH_DISPLAY_NAME: "API Contract"
  },
  stdio: "ignore"
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cookie = "";

async function request(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, correlationId: response.headers.get("x-correlation-id") || "", body: await response.json() };
}

async function waitForServer() {
  for (let started = Date.now(); Date.now() - started < 10000; await sleep(200)) {
    try {
      const response = await request("/marvin-api/bootstrap");
      if (response.body.ok) return response;
    } catch {}
  }
  throw new Error("Timed out waiting for management API.");
}

function assertErrorEnvelope(result, { status, code, retryable }) {
  assert.equal(result.status, status);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, code);
  assert.equal(typeof result.body.error, "string");
  assert.ok(result.body.error.length > 0);
  assert.equal(typeof result.body.action, "string");
  assert.ok(result.body.action.length > 0);
  assert.equal(result.body.retryable, retryable);
}

try {
  const bootstrap = await waitForServer();
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.ok, true);
  assert.equal(bootstrap.body.product, "project-marvin");
  assert.equal(bootstrap.body.authentication.provider, "entra");
  assert.equal(bootstrap.body.authentication.devAuthEnabled, true);
  assert.equal(bootstrap.body.authenticated, false);
  assert.match(bootstrap.correlationId, /^[a-f0-9-]{36}$/i);

  const liveHealth = await request("/api/health/live", { headers: { "X-Correlation-ID": "marvin-health-smoke-01" } });
  assert.equal(liveHealth.status, 200);
  assert.equal(liveHealth.body.live, true);
  assert.equal(liveHealth.correlationId, "marvin-health-smoke-01");
  const setupHealth = await request("/api/health/ready");
  assert.equal(setupHealth.status, 200);
  assert.equal(setupHealth.body.state, "setup-required");
  assert.equal(setupHealth.body.metrics.configuredCalendars, 0);
  assert.equal(setupHealth.body.metrics.providerActionRequired, 0);

  const unauthorized = await request(`/marvin-api/config?profileName=${profileName}`);
  assertErrorEnvelope(unauthorized, { status: 401, code: "AUTH_REQUIRED", retryable: false });
  assert.equal(unauthorized.body.requiresLogin, true);
  assert.equal(unauthorized.body.correlationId, unauthorized.correlationId);

  const login = await request("/marvin-api/auth/dev", { method: "POST" });
  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);
  assert.equal(login.body.authenticated, true);
  assert.equal(login.body.operator.email, "api-contract@example.com");

  const invalid = await request("/marvin-api/save-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertErrorEnvelope(invalid, { status: 400, code: "VALIDATION_ERROR", retryable: false });

  const saved = await request("/marvin-api/save-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      marvinEmail: "api-contract@example.com",
      marvinAccount: { email: "api-contract@example.com", displayName: "API Contract" },
      timezone: "America/New_York",
      syncWindowDays: 7,
      accounts: [{ id: "work", label: "Work", provider: "m365", email: "work@example.com", scope: "work", sourcePrefix: "WORK: " }],
      preferences: { defaultVisibility: "private", defaultDetailMode: "subject", preserveOriginalTimezone: true },
      providerSecrets: { microsoftClientSecret: "must-not-be-returned" }
    })
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ok, true);
  assert.equal(saved.body.config.profileName, profileName);
  assert.doesNotMatch(JSON.stringify(saved.body), /must-not-be-returned/);

  const config = await request(`/marvin-api/config?profileName=${profileName}`);
  assert.equal(config.status, 200);
  assert.equal(config.body.ok, true);
  assert.equal(Array.isArray(config.body.config.accounts), true);
  assert.equal(typeof config.body.config.readinessSummary, "object");

  const runtimeStatus = await request(`/marvin-api/runtime-status?profileName=${profileName}`);
  assert.equal(runtimeStatus.status, 200);
  assert.equal(runtimeStatus.body.ok, true);
  assert.equal(typeof runtimeStatus.body.runtimeProcess, "object");

  const degradedHealth = await request("/api/health/ready");
  assert.equal(degradedHealth.status, 503);
  assert.equal(degradedHealth.body.state, "degraded");
  assert.ok(degradedHealth.body.alerts.some((alert) => alert.code === "SYNC_STOPPED"));
  assert.ok(degradedHealth.body.alerts.some((alert) => alert.code === "PROVIDER_AUTH_REQUIRED" && alert.count === 1));
  assert.equal(degradedHealth.body.metrics.configuredCalendars, 1);
  assert.equal(degradedHealth.body.metrics.providerReadyCalendars, 0);
  assert.equal(degradedHealth.body.metrics.providerActionRequired, 1);
  const operationalHealth = await request("/marvin-api/health");
  assert.equal(operationalHealth.status, 200);
  assert.equal(operationalHealth.body.metrics.runtimeRunning, false);
  assert.equal(JSON.stringify(operationalHealth.body).includes("must-not-be-returned"), false);

  const retry = await request("/marvin-api/runtime-retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName })
  });
  assert.equal(retry.status, 202);
  assert.equal(retry.body.queued, true);
  const queuedStatus = await request(`/marvin-api/runtime-status?profileName=${profileName}`);
  assert.equal(queuedStatus.body.subscriptionState.automation.pendingSyncRequested, true);

  const blockedStart = await request("/marvin-api/runtime-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName })
  });
  assertErrorEnvelope(blockedStart, { status: 409, code: "READINESS_REQUIRED", retryable: false });

  const missing = await request("/marvin-api/not-a-route");
  assertErrorEnvelope(missing, { status: 404, code: "NOT_FOUND", retryable: false });

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "Bootstrap success contract",
      "Liveness, readiness, degraded-state, and correlation contracts",
      "Authentication error contract",
      "Development session contract",
      "Validation error contract",
      "Redacted configuration contract",
      "Runtime status contract",
      "Operator-directed reconciliation queue contract",
      "Readiness conflict contract",
      "Not-found error contract"
    ]
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
