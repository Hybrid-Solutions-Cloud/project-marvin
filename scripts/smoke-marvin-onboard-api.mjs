import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { stopRuntimeProcess } from "../solutions/marvin-engine/src/util/runtime-process.mjs";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-onboard-api-smoke-${Date.now()}`);
const port = 4195;
const tokenPort = 4295;
const profileName = "marvin-api-smoke";

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
    res.end(JSON.stringify({ value: [
      { id: "calendar-primary", name: "Work Calendar", canEdit: true, isDefaultCalendar: true, owner: { name: "Work User", address: "work@example.com" } },
      { id: "calendar-readonly", name: "Holidays", canEdit: false, owner: { name: "Tenant", address: "tenant@example.com" } }
    ] }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/graph/")) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ value: [] }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    tokenRequests.push({
      method: req.method || "",
      url: req.url || "",
      body
    });
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
    MARVIN_OAUTH_TRANSACTION_TTL_MS: "3000",
    MARVIN_DEV_AUTH_ENABLED: "true",
    MARVIN_DEV_AUTH_EMAIL: "marvin-smoke@example.com",
    MARVIN_DEV_AUTH_DISPLAY_NAME: "Marvin Smoke"
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
    if (value) {
      return value;
    }
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
  const homepage = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const text = await response.text();
      return response.ok ? text : null;
    } catch {
      return null;
    }
  }, 10000, "onboarding homepage");

  assert.ok(homepage.includes("Project Marvin"));

  const bootstrap = await waitFor(async () => {
    try {
      const result = await requestJson(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
      return result?.ok ? result : null;
    } catch {
      return null;
    }
  }, 10000, "onboarding bootstrap API");

  assert.equal(bootstrap.ok, true);
  assert.equal(bootstrap.hasOperator, false);
  assert.equal(bootstrap.hasConfig, false);

  const createAccount = await requestJson(`http://127.0.0.1:${port}/marvin-api/auth/dev`, { method: "POST" });

  assert.equal(createAccount.ok, true);
  assert.equal(createAccount.operator.email, "marvin-smoke@example.com");

  const updateAccount = await requestJson(`http://127.0.0.1:${port}/marvin-api/auth/dev`, { method: "POST" });

  assert.equal(updateAccount.ok, true);
  assert.equal(updateAccount.operator.email, "marvin-smoke@example.com");
  assert.equal(updateAccount.operator.displayName, "Marvin Smoke");

  const saveConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "marvin-smoke@example.com",
      marvinAccount: {
        email: "marvin-smoke@example.com",
        displayName: "Marvin Smoke",
        timezone: "America/New_York"
      },
      profileName,
      timezone: "America/New_York",
      syncWindowDays: 7,
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
        microsoftClientId: "",
        googleClientId: ""
      },
      providerSecrets: {
        microsoftClientSecret: "",
        googleClientSecret: ""
      }
    })
  });

  assert.equal(saveConfig.ok, true);
  assert.equal(saveConfig.config.profileName, profileName);
  assert.equal(saveConfig.config.marvinDisplayName, "Marvin Smoke");
  assert.equal(saveConfig.config.marvinOperator, "marvin-smoke@example.com");
  assert.equal(saveConfig.config.timezone, "America/New_York");
  assert.equal(saveConfig.config.syncWindowDays, 7);
  assert.equal(saveConfig.config.accounts.length, 2);
  assert.equal(saveConfig.config.accounts[0].sourcePrefix, "WORK: ");
  assert.equal(saveConfig.config.accounts[1].sourcePrefix, "FAM: ");
  assert.equal(saveConfig.config.accounts[1].inboundOverrides.detailMode, "full");
  assert.equal(saveConfig.config.providerRequirements.microsoft.redirectUri, `http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback`);
  assert.equal(saveConfig.config.providerRequirements.google.redirectUri, `http://127.0.0.1:${port}/marvin-api/oauth/google/callback`);
  const bootstrapAfterSave = await requestJson(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
  assert.equal(bootstrapAfterSave.ok, true);
  assert.equal(bootstrapAfterSave.hasOperator, true);
  assert.equal(bootstrapAfterSave.hasConfig, true);
  assert.equal(bootstrapAfterSave.operator.displayName, "Marvin Smoke");
  assert.equal(bootstrapAfterSave.operator.email, "marvin-smoke@example.com");
  assert.equal(bootstrapAfterSave.config.profileName, profileName);
  assert.equal(bootstrapAfterSave.config.marvinDisplayName, "Marvin Smoke");
  assert.equal(bootstrapAfterSave.config.timezone, "America/New_York");
  assert.equal(bootstrapAfterSave.config.syncWindowDays, 7);

  const generatedProfile = JSON.parse(fs.readFileSync(path.join(tempRoot, "profiles", profileName + ".json"), "utf8"));
  assert.equal(generatedProfile.routes.length, 2);
  const workRoute = generatedProfile.routes.find((route) => route.source === "work_m365");
  const familyRoute = generatedProfile.routes.find((route) => route.source === "family_google");
  assert.ok(workRoute);
  assert.ok(familyRoute);
  const familyAsTarget = workRoute.targets.find((target) => target.calendarId === "family_google");
  const workAsTarget = familyRoute.targets.find((target) => target.calendarId === "work_m365");
  assert.deepEqual(familyAsTarget, {
    calendarId: "family_google",
    visibility: "default",
    detailMode: "full",
    availabilityMode: "source",
    subjectPrefix: "WORK: ",
    copyLocation: true,
    copyDescription: true
  });
  assert.deepEqual(workAsTarget, {
    calendarId: "work_m365",
    visibility: "private",
    detailMode: "subject",
    availabilityMode: "free",
    subjectPrefix: "FAM: ",
    copyLocation: true,
    copyDescription: true
  });

  const beginMicrosoftWithoutClient = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });

  assert.equal(beginMicrosoftWithoutClient.ok, true);
  assert.equal(beginMicrosoftWithoutClient.launchUrl, "");
  assert.match(beginMicrosoftWithoutClient.message, /MICROSOFT_CLIENT_ID/i);

  const providerRequirements = await requestJson(`http://127.0.0.1:${port}/marvin-api/provider-requirements?profileName=${encodeURIComponent(profileName)}`);

  assert.equal(providerRequirements.ok, true);
  assert.equal(providerRequirements.providerRequirements.microsoft.redirectUri, `http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback`);
  assert.equal(providerRequirements.providerRequirements.google.redirectUri, `http://127.0.0.1:${port}/marvin-api/oauth/google/callback`);

  const providerConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/provider-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      providerCredentials: {
        microsoftClientId: "ms-client-id",
        googleClientId: "google-client-id"
      },
      providerSecrets: {
        microsoftClientSecret: "ms-client-secret",
        googleClientSecret: "google-client-secret"
      }
    })
  });

  assert.equal(providerConfig.ok, true);
  assert.equal(providerConfig.config.providerCredentials.microsoftClientId, "ms-client-id");
  assert.equal(providerConfig.config.providerCredentials.googleClientId, "google-client-id");

  const workAccount = providerConfig.config.accounts.find((account) => account.id === "work_m365");
  const familyAccount = providerConfig.config.accounts.find((account) => account.id === "family_google");
  assert.ok(workAccount?.authUrl?.includes("/marvin-api/oauth/microsoft/start"));
  assert.ok(familyAccount?.authUrl?.includes("/marvin-api/oauth/google/start"));

  const beginMicrosoft = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });

  assert.equal(beginMicrosoft.ok, true);
  assert.ok(beginMicrosoft.launchUrl.includes("/marvin-api/oauth/microsoft/start?state="));
  const pendingWorkAccount = beginMicrosoft.config.accounts.find((account) => account.id === "work_m365");
  assert.equal(pendingWorkAccount.connectionStatus, "pending");
  assert.equal(pendingWorkAccount.authProvider, "microsoft");
  assert.ok(pendingWorkAccount.authRequestedAt);

  const oauthStart = await fetch(beginMicrosoft.launchUrl, { redirect: "manual" });
  assert.equal(oauthStart.status, 302);
  assert.match(oauthStart.headers.get("location") || "", /^https:\/\/login\.microsoftonline\.com\//i);
  const authorizeUrl = new URL(oauthStart.headers.get("location"));
  assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorizeUrl.searchParams.get("code_challenge"));

  const microsoftAuthState = beginMicrosoft.authSession?.state;
  assert.ok(microsoftAuthState);

  const adminTenantId = "11111111-2222-4333-8444-555555555555";
  const adminConsentStart = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/admin-consent/start?tenant=${adminTenantId}`, { redirect: "manual" });
  assert.equal(adminConsentStart.status, 302);
  const adminConsentAuthorizeUrl = new URL(adminConsentStart.headers.get("location"));
  assert.equal(adminConsentAuthorizeUrl.hostname, "login.microsoftonline.com");
  assert.equal(adminConsentAuthorizeUrl.pathname, `/${adminTenantId}/v2.0/adminconsent`);
  assert.equal(adminConsentAuthorizeUrl.searchParams.get("client_id"), "ms-client-id");
  assert.equal(adminConsentAuthorizeUrl.searchParams.get("redirect_uri"), `http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback`);
  assert.ok(adminConsentAuthorizeUrl.searchParams.get("state"));

  const adminConsentCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?admin_consent=True&tenant=${adminTenantId}&state=${encodeURIComponent(adminConsentAuthorizeUrl.searchParams.get("state"))}`);
  const adminConsentHtml = await adminConsentCallback.text();
  assert.equal(adminConsentCallback.status, 200);
  assert.match(adminConsentHtml, /administrator consent granted/i);
  assert.match(adminConsentHtml, /connect the Microsoft calendar account again/i);

  const deniedConsentStart = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/admin-consent/start?tenant=${adminTenantId}`, { redirect: "manual" });
  const deniedConsentState = new URL(deniedConsentStart.headers.get("location")).searchParams.get("state");
  const deniedAdminConsentCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?admin_consent=True&state=${encodeURIComponent(deniedConsentState)}&error=access_denied&error_description=${encodeURIComponent("The administrator declined consent.")}`);
  const deniedAdminConsentHtml = await deniedAdminConsentCallback.text();
  assert.equal(deniedAdminConsentCallback.status, 400);
  assert.match(deniedAdminConsentHtml, /administrator consent failed/i);
  assert.match(deniedAdminConsentHtml, /administrator declined consent/i);

  const replayedAdminConsentCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?admin_consent=True&tenant=${adminTenantId}&state=${encodeURIComponent(adminConsentAuthorizeUrl.searchParams.get("state"))}`);
  assert.equal(replayedAdminConsentCallback.status, 400);
  assert.match(await replayedAdminConsentCallback.text(), /confirmation state is missing, expired, or was already used/i);

  const oauthCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?state=${encodeURIComponent(microsoftAuthState)}&code=marvin-code-123&scope=${encodeURIComponent("offline_access openid profile User.Read Calendars.ReadWrite")}`);
  const oauthCallbackHtml = await oauthCallback.text();
  assert.equal(oauthCallback.status, 200);
  assert.match(oauthCallbackHtml, /verified the Microsoft identity/i);
  assert.match(oauthCallbackHtml, /Return to Project Marvin/);
  assert.match(oauthCallbackHtml, /window\.location\.replace\("\/"\)/);
  assert.match(oauthCallbackHtml, /http-equiv="refresh" content="2;url=\/"/);
  const replayCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?state=${encodeURIComponent(microsoftAuthState)}&code=marvin-code-replay`);
  assert.equal(replayCallback.status, 400);

  const connectionState = await requestJson(`http://127.0.0.1:${port}/marvin-api/connections?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(connectionState.ok, true);
  const connectedWork = connectionState.connectionState.records.find((record) => record.calendarId === "work_m365");
  assert.equal(connectedWork.status, "connected");
  assert.ok(connectedWork.connectedAt);
  assert.equal(connectedWork.accountRef, "ms-work-user");
  assert.equal(connectedWork.authSession.authorizationCode, undefined);
  assert.equal(connectedWork.authSession.codeVerifier, undefined);

  const workToken = connectionState.tokenState.records.find((record) => record.calendarId === "work_m365");
  assert.equal(workToken.status, "connected");
  assert.equal(workToken.accessToken, undefined);
  assert.equal(workToken.refreshToken, undefined);
  assert.equal(workToken.accountRef, "ms-work-user");
  assert.ok(workToken.expiresAt);

  const discovery = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(discovery.ok, true);
  assert.equal(discovery.identity.providerIdentityId, "ms-work-user");
  assert.equal(discovery.requiresIdentityConfirmation, false);
  assert.equal(discovery.calendars.length, 2);
  assert.equal(discovery.calendars.find((item) => item.providerCalendarId === "calendar-primary").canEdit, true);

  const readonlySelection = await fetch(`http://127.0.0.1:${port}/marvin-api/microsoft/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ profileName, calendarId: "work_m365", providerCalendarIds: ["calendar-readonly"] })
  });
  assert.equal(readonlySelection.status, 400);

  const selection = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365", providerCalendarIds: ["calendar-primary"] })
  });
  assert.equal(selection.ok, true);
  assert.equal(selection.selectedCalendars[0].providerCalendarId, "calendar-primary");

  const capabilities = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/capabilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.capabilities.read, true);
  assert.equal(capabilities.capabilities.write, true);
  assert.equal(capabilities.capabilities.refresh, true);
  assert.equal(capabilities.capabilities.subscription, false);

  const rediscovery = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(rediscovery.ok, true);
  assert.deepEqual(rediscovery.config.accounts.find((account) => account.id === "work_m365")?.selectedProviderCalendarIds, ["calendar-primary"]);

  const deselection = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365", providerCalendarIds: [] })
  });
  assert.equal(deselection.ok, true);
  assert.equal(deselection.selectedCalendars.length, 0);
  assert.equal(deselection.connectionCalendarId, "work_m365");
  assert.equal(deselection.config.accounts.find((account) => account.id === "work_m365")?.providerCalendarId, "");
  assert.equal(deselection.config.accounts.find((account) => account.id === "work_m365")?.connectionStatus, "selection-required");

  const reselection = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365", providerCalendarIds: ["calendar-primary"] })
  });
  assert.equal(reselection.ok, true);
  assert.equal(reselection.selectedCalendars[0].id, "work_m365");
  assert.equal(reselection.selectedCalendars[0].providerCalendarId, "calendar-primary");

  const recapabilities = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/capabilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(recapabilities.ok, true);

  const rawConnectionStore = fs.readFileSync(path.join(tempRoot, ".marvin", "connections", `${profileName}.connections.json`), "utf8");
  const rawTokenStore = fs.readFileSync(path.join(tempRoot, ".marvin", "tokens", `${profileName}.tokens.json`), "utf8");
  const rawSetupConfig = fs.readFileSync(path.join(tempRoot, ".marvin", `${profileName}.setup.json`), "utf8");
  assert.match(rawConnectionStore, /project-marvin\.aes-256-gcm/);
  assert.doesNotMatch(rawConnectionStore, /codeVerifier|marvin-code-123/);
  assert.doesNotMatch(rawTokenStore, /marvin-access-token|marvin-refresh-token/);
  assert.doesNotMatch(rawSetupConfig, /marvin-access-token|marvin-refresh-token|codeVerifier|marvin-code-123/);

  assert.equal(tokenRequests.length, 1);
  assert.equal(tokenRequests[0].method, "POST");
  assert.equal(tokenRequests[0].url, "/microsoft/token");
  const tokenRequestBody = new URLSearchParams(tokenRequests[0].body);
  assert.equal(tokenRequestBody.get("client_id"), "ms-client-id");
  assert.equal(tokenRequestBody.get("client_secret"), "ms-client-secret");
  assert.equal(tokenRequestBody.get("code"), "marvin-code-123");
  assert.equal(tokenRequestBody.get("grant_type"), "authorization_code");
  assert.equal(tokenRequestBody.get("redirect_uri"), `http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback`);
  assert.ok(tokenRequestBody.get("code_verifier"));
  assert.match(tokenRequestBody.get("scope") || "", /Calendars\.ReadWrite/);

  const connectedConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(connectedConfig.ok, true);
  const connectedWorkAccount = connectedConfig.config.accounts.find((account) => account.id === "work_m365");
  assert.equal(connectedWorkAccount.connectionStatus, "action-required");
  assert.equal(connectedWorkAccount.accountRef, "ms-work-user");
  assert.equal(connectedWorkAccount.providerCalendarId, "calendar-primary");
  assert.equal(connectedWorkAccount.linkedAccountRef, "ms-work-user");
  assert.equal(connectedWorkAccount.linkedAccountEmail, "work@example.com");
  assert.equal(connectedWorkAccount.authProvider, "microsoft");
  assert.ok(connectedWorkAccount.authRequestedAt);
  assert.ok(connectedWorkAccount.authStartVisitedAt);
  assert.ok(connectedWorkAccount.authCallbackReceivedAt);
  assert.equal(connectedWorkAccount.tokenStatus, "usable");
  assert.ok(connectedWorkAccount.tokenExpiresAt);
  assert.ok(connectedWorkAccount.tokenObtainedAt);
  assert.match(connectedWorkAccount.authEvidence || "", /usable provider token locally/i);
  assert.equal(connectedConfig.config.tokenSummary.usable, 1);
  assert.equal(connectedConfig.config.marvinDisplayName, "Marvin Smoke");
  assert.equal(connectedConfig.config.marvinOperator, "marvin-smoke@example.com");
  assert.equal(connectedConfig.config.timezone, "America/New_York");
  assert.equal(connectedConfig.config.syncWindowDays, 7);
  assert.ok(connectedConfig.config.subscriptionState);
  assert.equal(connectedConfig.config.subscriptionState.automation.pendingSyncRequested, false);

  const expiringAuth = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  await sleep(3100);
  const expiredStart = await fetch(expiringAuth.launchUrl, { redirect: "manual" });
  assert.equal(expiredStart.status, 400);

  const mismatchAccount = {
    id: "personal_outlook",
    label: "Personal Outlook",
    provider: "outlook",
    email: "personal@example.com",
    scope: "personal",
    sourcePrefix: "PERSONAL: "
  };
  const mismatchAdded = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, account: mismatchAccount })
  });
  assert.equal(mismatchAdded.ok, true);
  const mismatchBegin = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: mismatchAccount.id })
  });
  await fetch(mismatchBegin.launchUrl, { redirect: "manual" });
  const mismatchCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?state=${encodeURIComponent(mismatchBegin.authSession.state)}&code=mismatch-code`);
  assert.equal(mismatchCallback.status, 200);
  const mismatchDiscovery = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: mismatchAccount.id })
  });
  assert.equal(mismatchDiscovery.requiresIdentityConfirmation, true);
  const blockedMismatchSelection = await fetch(`http://127.0.0.1:${port}/marvin-api/microsoft/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ profileName, calendarId: mismatchAccount.id, providerCalendarIds: ["calendar-primary"] })
  });
  assert.equal(blockedMismatchSelection.status, 409);
  const confirmedMismatch = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/confirm-identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: mismatchAccount.id, confirmed: true })
  });
  assert.equal(confirmedMismatch.ok, true);
  const selectedMismatch = await requestJson(`http://127.0.0.1:${port}/marvin-api/microsoft/select-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: mismatchAccount.id, providerCalendarIds: ["calendar-primary"] })
  });
  assert.equal(selectedMismatch.ok, true);
  assert.equal(selectedMismatch.selectedCalendars[0].email, "work@example.com");

  const removedMismatch = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, accountId: mismatchAccount.id })
  });
  assert.equal(removedMismatch.ok, true);
  const configAfterRemoval = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(configAfterRemoval.ok, true);
  assert.equal(configAfterRemoval.config.accounts.some((account) => account.id === mismatchAccount.id), false);
  const afterRemoval = await requestJson(`http://127.0.0.1:${port}/marvin-api/connections?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(afterRemoval.connectionState.records.some((record) => record.calendarId === mismatchAccount.id), false);
  assert.equal(afterRemoval.tokenState.records.some((record) => record.calendarId === mismatchAccount.id), false);

  const runtimeStatus = await requestJson(`http://127.0.0.1:${port}/marvin-api/runtime-status?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(runtimeStatus.ok, true);
  assert.ok(runtimeStatus.subscriptionState);
  assert.equal(runtimeStatus.subscriptionState.subscriptions.some((record) => record.calendarId === mismatchAccount.id), false);
  assert.equal(Object.values(runtimeStatus.subscriptionState.providerSummaries || {}).some((summary) => (summary.records || []).some((record) => record.calendarId === mismatchAccount.id)), false);
  assert.equal((runtimeStatus.subscriptionState.automation?.lastRequestedByCalendarIds || []).includes(mismatchAccount.id), false);
  assert.equal(runtimeStatus.subscriptionState.automation.pendingSyncRequested, true);

  const blockedRuntimeHeaders = { "Content-Type": "application/json" };
  if (cookieHeader) {
    blockedRuntimeHeaders.Cookie = cookieHeader;
  }
  const blockedRuntimeResponse = await fetch(`http://127.0.0.1:${port}/marvin-api/runtime-start`, {
    method: "POST",
    headers: blockedRuntimeHeaders,
    body: JSON.stringify({ profileName, intervalSeconds: 1, windowDays: 7 })
  });
  const blockedRuntime = await blockedRuntimeResponse.json();

  assert.equal(blockedRuntimeResponse.status, 409);
  assert.equal(blockedRuntime.ok, false);
  assert.equal(blockedRuntime.code, "READINESS_REQUIRED");
  assert.equal(blockedRuntime.retryable, false);
  assert.match(blockedRuntime.error || "", /cannot start synchronization yet because not every calendar is connected and validated/i);
  assert.match(blockedRuntime.action || "", /connect and validate/i);
  console.log(JSON.stringify({
    ok: true,
    profileName,
    accounts: providerConfig.config.accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      authUrl: account.authUrl
    })),
    runtimeStartBlocked: true,
    tokenExchangeCount: tokenRequests.length,
    authProgressCaptured: true,
    accountMetadataCaptured: true
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  try { stopRuntimeProcess(tempRoot, profileName); } catch {}
  await new Promise((resolve) => tokenServer.close(() => resolve()));
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
