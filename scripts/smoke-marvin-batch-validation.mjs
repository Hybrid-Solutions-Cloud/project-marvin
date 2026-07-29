import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { stopRuntimeProcess } from "../solutions/marvin-engine/src/util/runtime-process.mjs";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-batch-validation-smoke-${Date.now()}`);
const port = 4260;
const tokenPort = 4360;
const profileName = "marvin-batch-validation-smoke";

fs.mkdirSync(tempRoot, { recursive: true });

const tokenRequests = [];
const idTokenClaims = { oid: "ms-batch-user", email: "work@example.com" };
const idToken = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(idTokenClaims)).toString("base64url")}.sig`;
const tokenServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    tokenRequests.push({ method: req.method || "", url: req.url || "", body });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      access_token: "marvin-batch-access-token",
      refresh_token: "marvin-batch-refresh-token",
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

const caldavServer = http.createServer((req, res) => {
  const auth = req.headers.authorization || "";
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
      marvinDisplayName: "Marvin Batch",
      marvinEmail: "marvin-batch@example.com",
      marvinPassword: "correct-horse-battery-staple"
    })
  });
  assert.equal(createAccount.ok, true);

  const saveConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "marvin-batch@example.com",
      marvinAccount: {
        email: "marvin-batch@example.com",
        displayName: "Marvin Batch",
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
          sourcePrefix: "FAM: "
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

  const beginMicrosoft = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });
  assert.equal(beginMicrosoft.ok, true);
  const authState = beginMicrosoft.authSession?.state;
  assert.ok(authState);

  const oauthStart = await fetch(beginMicrosoft.launchUrl, { redirect: "manual" });
  assert.equal(oauthStart.status, 302);

  const oauthCallback = await fetch(`http://127.0.0.1:${port}/marvin-api/oauth/microsoft/callback?state=${encodeURIComponent(authState)}&code=marvin-batch-code&scope=${encodeURIComponent("offline_access openid profile User.Read Calendars.ReadWrite")}`);
  assert.equal(oauthCallback.status, 200);

  const validateAll = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-validate-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName })
  });
  assert.equal(validateAll.ok, true);
  assert.equal(validateAll.validationSummary.total, 3);
  assert.ok(Number(validateAll.validationSummary.connected) >= 1);
  assert.ok(Number(validateAll.validationSummary.pending) >= 1);
  assert.ok(Number(validateAll.validationSummary.invalid) <= 1);

  const byCalendar = Object.fromEntries(validateAll.results.map((item) => [item.calendarId, item]));
  assert.ok(["connected", "pending", "invalid"].includes(byCalendar.work_m365.status));
  assert.equal(byCalendar.apple_family.status, "connected");
  assert.equal(byCalendar.family_google.status, "pending");

  console.log(JSON.stringify({
    ok: true,
    profileName,
    validationSummary: validateAll.validationSummary,
    tokenExchangeCount: tokenRequests.length,
    statuses: Object.fromEntries(validateAll.results.map((item) => [item.calendarId, item.status]))
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  try { stopRuntimeProcess(tempRoot, profileName); } catch {}
  await new Promise((resolve) => tokenServer.close(() => resolve()));
  await new Promise((resolve) => caldavServer.close(() => resolve()));
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
