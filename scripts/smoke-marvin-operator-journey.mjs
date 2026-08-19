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
const tokenServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/graph/me?")) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ id: "ms-work-user", displayName: "Work User", mail: "work@example.com", userPrincipalName: "work@example.com" }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/graph/me/calendars")) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ value: [{ id: "journey-calendar", name: "Work", canEdit: true, isDefaultCalendar: true }] }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/graph/")) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ value: [] }));
    return;
  }
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
      scope: "offline_access openid profile User.Read Calendars.ReadWrite"
    }));
  });
});
await new Promise((resolve, reject) => {
  tokenServer.once("error", reject);
  tokenServer.listen(tokenPort, "127.0.0.1", resolve);
});

const caldavRequests = [];
const caldavServer = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const auth = req.headers.authorization || "";
    const body = Buffer.concat(chunks).toString("utf8");
    caldavRequests.push({ method: req.method || "", url: req.url || "", auth });
    if (auth !== `Basic ${Buffer.from("apple@example.com:apple-secret", "utf8").toString("base64")}`) {
      res.writeHead(401, { "Content-Type": "text/plain" }).end("unauthorized");
      return;
    }
    res.writeHead(207, { "Content-Type": "application/xml" });
    if (body.includes("current-user-principal")) {
      res.end('<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>');
    } else if (body.includes("calendar-home-set")) {
      res.end('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-home-set><d:href>/home/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>');
    } else if (body.includes("supported-calendar-component-set")) {
      res.end('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/family/</d:href><d:propstat><d:prop><d:displayname>Apple Family</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set></d:prop></d:propstat></d:response></d:multistatus>');
    } else {
      res.end('<d:multistatus xmlns:d="DAV:"></d:multistatus>');
    }
  });
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
    MARVIN_MOCK_MICROSOFT_TOKEN_URL: `http://127.0.0.1:${tokenPort}/microsoft/token`,
    MARVIN_MICROSOFT_GRAPH_BASE_URL: `http://127.0.0.1:${tokenPort}/graph`,
    MARVIN_MOCK_GOOGLE_TOKEN_URL: `http://127.0.0.1:${tokenPort}/google/token`,
    MARVIN_DEV_AUTH_ENABLED: "true",
    MARVIN_DEV_AUTH_EMAIL: "marvin-journey@example.com",
    MARVIN_DEV_AUTH_DISPLAY_NAME: "Marvin Journey"
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

let cookieHeader = "";

async function requestJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  const response = await fetch(url, { ...options, headers });
  const setCookie = response.headers.get("set-cookie") || "";
  if (setCookie) {
    cookieHeader = setCookie.split(";")[0];
  }
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

  const createAccount = await requestJson(`http://127.0.0.1:${port}/marvin-api/auth/dev`, { method: "POST" });
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

  const beginGoogle = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "family_google" })
  });
  assert.equal(beginGoogle.ok, true);
  assert.ok(beginGoogle.launchUrl.includes("/marvin-api/oauth/google/start?state="));
  const googleAuthState = beginGoogle.authSession?.state;
  assert.ok(googleAuthState);
  const googleOauthStart = await fetch(beginGoogle.launchUrl, { redirect: "manual" });
  assert.equal(googleOauthStart.status, 302);

  const googleOauthCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/google/callback?state=${encodeURIComponent(googleAuthState)}&code=marvin-google-code&scope=${encodeURIComponent("openid profile email https://www.googleapis.com/auth/calendar")}`);
  const googleOauthCallbackHtml = await googleOauthCallback.text();
  assert.equal(googleOauthCallback.status, 200);
  assert.match(googleOauthCallbackHtml, /connected/i);

  const connectApple = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "apple_family" })
  });
  assert.equal(connectApple.ok, true);
  assert.equal(connectApple.connectionRecord.status, "discovery-required");

  const appleDiscovery = await requestJson(`http://127.0.0.1:${port}/marvin-api/apple/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "apple_family" })
  });
  assert.equal(appleDiscovery.ok, true);
  assert.equal(appleDiscovery.calendars.length, 1);
  const appleSelection = await requestJson(`http://127.0.0.1:${port}/marvin-api/apple/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "apple_family", providerCalendarIds: [appleDiscovery.calendars[0].providerCalendarId] })
  });
  assert.equal(appleSelection.ok, true);
  const appleCapabilities = await requestJson(`http://127.0.0.1:${port}/marvin-api/apple/capabilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "apple_family" })
  });
  assert.equal(appleCapabilities.ok, true);
  assert.equal(appleCapabilities.capabilities.ready, true);

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
  assert.match(oauthCallbackHtml, /verified the Microsoft identity/i);

  const discovery = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(discovery.ok, true);
  assert.equal(discovery.calendars[0].providerCalendarId, "journey-calendar");

  const selection = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365", providerCalendarIds: ["journey-calendar"] })
  });
  assert.equal(selection.ok, true, JSON.stringify(selection));

  const hostedConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/provider-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, deployment: { marvinUrl: "https://calendar.example.com" } })
  });
  assert.equal(hostedConfig.ok, true);

  const capabilityCheck = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/capabilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(capabilityCheck.ok, true);
  assert.equal(capabilityCheck.capabilities.ready, true);

  const configAfterAuth = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(configAfterAuth.ok, true);
  const workAccount = configAfterAuth.config.accounts.find((account) => account.id === "work_m365");
  const googleAccount = configAfterAuth.config.accounts.find((account) => account.id === "family_google");
  const appleAccount = configAfterAuth.config.accounts.find((account) => account.id === "apple_family");
  assert.equal(workAccount.connectionStatus, "connected");
  assert.equal(workAccount.providerCalendarId, "journey-calendar");
  assert.equal(workAccount.capabilities.ready, true);
  assert.equal(workAccount.tokenStatus, "usable");
  assert.equal(googleAccount.connectionStatus, "connected");
  assert.equal(googleAccount.tokenStatus, "usable");
  assert.equal(appleAccount.connectionStatus, "connected");
  assert.equal(appleAccount.capabilities.ready, true);
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
    googleConnected: googleAccount.connectionStatus,
    appleValidated: appleAccount.connectionStatus,
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



