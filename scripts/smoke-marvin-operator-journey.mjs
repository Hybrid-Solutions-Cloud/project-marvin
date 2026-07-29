import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { stopRuntimeProcess } from "../solutions/marvin-engine/src/util/runtime-process.mjs";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-operator-journey-smoke-${Date.now()}`);
const port = 4233;
const tokenPort = 4333;
const profileName = "marvin-journey-smoke";

fs.mkdirSync(tempRoot, { recursive: true });

const tokenRequests = [];
const idTokenClaims = { oid: "ms-work-user", email: "work@example.com" };
const idToken = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(idTokenClaims)).toString("base64url")}.sig`;
const tokenServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    tokenRequests.push({ method: req.method || "", url: req.url || "", body });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      access_token: "marvin-access-token",
      refresh_token: "marvin-refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "offline_access openid profile User.Read Calendars.ReadWrite",
      id_token: idToken
    }));
  });
});
await new Promise((resolve, reject) => {
  tokenServer.once("error", reject);
  tokenServer.listen(tokenPort, "127.0.0.1", resolve);
});

const caldavRequests = [];
const caldavServer = http.createServer((req, res) => {
  const auth = req.headers.authorization || "";
  caldavRequests.push({ method: req.method || "", auth });
  if (auth === `Basic ${Buffer.from("apple@example.com:apple-secret", "utf8").toString("base64")}`) {
    res.writeHead(207, { "Content-Type": "application/xml" });
    res.end("<multistatus xmlns=\"DAV:\"></multistatus>");
    return;
  }
  res.writeHead(401, { "Content-Type": "text/plain" });
  res.end("unauthorized");
});
const caldavUrl = await new Promise((resolve, reject) => {
  caldavServer.once("error", reject);
  caldavServer.listen(0, "127.0.0.1", () => {
    const address = caldavServer.address();
    resolve(`http://127.0.0.1:${address.port}/dav`);
  });
});

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port),
    MARVIN_SYNC_INTERVAL_SECONDS: "1",
    MARVIN_MOCK_MICROSOFT_TOKEN_URL: `http://127.0.0.1:${tokenPort}/microsoft/token`
  },
  stdio: "ignore"
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  return response.json();
}

try {
  await waitFor(async () => {
    try {
      const result = await requestJson(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
      return result?.ok ? result : null;
    } catch {
      return null;
    }
  }, 10000, "bootstrap API");

  const createAccount = await requestJson(`http://127.0.0.1:${port}/marvin-api/create-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinDisplayName: "Marvin Journey",
      marvinEmail: "marvin-journey@example.com",
      marvinPassword: "correct-horse-battery-staple"
    })
  });
  assert.equal(createAccount.ok, true);

  const saveConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "marvin-journey@example.com",
      marvinAccount: {
        email: "marvin-journey@example.com",
        displayName: "Marvin Journey",
        timezone: "America/New_York"
      },
      profileName,
      timezone: "America/New_York",
      syncWindowDays: 14,
      accounts: [
        {
          id: "work_m365",
          label: "Work",
          provider: "m365",
          email: "work@example.com",
          scope: "work",
          sourcePrefix: "WORK: "
        },
        {
          id: "family_google",
          label: "Family",
          provider: "google",
          email: "family@example.com",
          scope: "family",
          sourcePrefix: "FAM: ",
          inboundOverrides: {
            visibility: "default",
            detailMode: "full",
            copyLocation: true,
            copyDescription: true
          }
        },
        {
          id: "apple_family",
          label: "Apple Family",
          provider: "apple-caldav",
          email: "apple@example.com",
          scope: "family",
          sourcePrefix: "APPLE: ",
          caldavServerUrl: caldavUrl,
          caldavUsername: "apple@example.com"
        }
      ],
      preferences: {
        defaultDetailMode: "subject",
        defaultVisibility: "private",
        familyDetailMode: "full",
        familyVisibility: "default",
        subjectPrefix: "SRC: ",
        copyLocationToFamily: true,
        copyDescriptionToFamily: true,
        preserveOriginalTimezone: true
      },
      providerCredentials: {
        microsoftClientId: "ms-client-id",
        googleClientId: "google-client-id"
      },
      providerSecrets: {
        microsoftClientSecret: "ms-client-secret",
        googleClientSecret: "google-client-secret",
        caldavPasswords: {
          apple_family: "apple-secret"
        }
      }
    })
  });
  assert.equal(saveConfig.ok, true);
  assert.equal(saveConfig.config.accounts.length, 3);

  const bootstrapAfterSave = await requestJson(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
  assert.equal(bootstrapAfterSave.ok, true);
  assert.equal(bootstrapAfterSave.hasOperator, true);
  assert.equal(bootstrapAfterSave.hasConfig, true);

  const validateGooglePending = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "family_google" })
  });
  assert.equal(validateGooglePending.ok, true);
  assert.equal(validateGooglePending.validation.status, "pending");

  const connectApple = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "apple_family" })
  });
  assert.equal(connectApple.ok, true);
  assert.equal(connectApple.connectionRecord.status, "connected");

  const beginMicrosoft = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(beginMicrosoft.ok, true);
  assert.ok(beginMicrosoft.launchUrl.includes("/marvin-api/oauth/microsoft/start?state="));
  const oauthStart = await fetch(beginMicrosoft.launchUrl, { redirect: "manual" });
  assert.equal(oauthStart.status, 302);
  const microsoftAuthState = beginMicrosoft.authSession?.state;
  assert.ok(microsoftAuthState);

  const oauthCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?state=${encodeURIComponent(microsoftAuthState)}&code=marvin-code-journey&scope=${encodeURIComponent("offline_access openid profile User.Read Calendars.ReadWrite")}`);
  const oauthCallbackHtml = await oauthCallback.text();
  assert.equal(oauthCallback.status, 200);
  assert.match(oauthCallbackHtml, /marked this calendar connected/i);

  const configAfterAuth = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(configAfterAuth.ok, true);
  const workAccount = configAfterAuth.config.accounts.find((account) => account.id === "work_m365");
  const googleAccount = configAfterAuth.config.accounts.find((account) => account.id === "family_google");
  const appleAccount = configAfterAuth.config.accounts.find((account) => account.id === "apple_family");
  assert.equal(workAccount.connectionStatus, "connected");
  assert.equal(workAccount.tokenStatus, "usable");
  assert.equal(googleAccount.connectionStatus, "pending");
  assert.equal(appleAccount.connectionStatus, "connected");
  assert.equal(appleAccount.caldavPasswordConfigured, true);

  const startRuntime = await requestJson(`http://127.0.0.1:${port}/marvin-api/runtime-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, intervalSeconds: 1, windowDays: 14 })
  });
  assert.equal(startRuntime.ok, true);
  assert.ok(Number(startRuntime.runtimeProcess.pid) > 0);

  const stoppedRuntime = await requestJson(`http://127.0.0.1:${port}/marvin-api/runtime-stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName })
  });
  assert.equal(stoppedRuntime.ok, true);

  console.log(JSON.stringify({
    ok: true,
    profileName,
    accountCreated: true,
    accountsConfigured: saveConfig.config.accounts.length,
    googlePendingValidation: validateGooglePending.validation.status,
    appleValidated: connectApple.connectionRecord.status,
    microsoftConnected: workAccount.connectionStatus,
    runtimeStarted: Boolean(startRuntime.runtimeStatus),
    runtimeStopped: stoppedRuntime.runtimeStatus?.running === false,
    tokenExchangeCount: tokenRequests.length,
    caldavValidationRequests: caldavRequests.length
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  try { stopRuntimeProcess(tempRoot, profileName); } catch {}
  await new Promise((resolve) => tokenServer.close(() => resolve()));
  await new Promise((resolve) => caldavServer.close(() => resolve()));
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
