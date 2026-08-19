import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-provider-plan-api-smoke-${Date.now()}`);
const port = 4300 + Math.floor(Math.random() * 200);
const profileName = "marvin-provider-plan-smoke";

fs.mkdirSync(tempRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port),
    MARVIN_SYNC_INTERVAL_SECONDS: "1",
    MARVIN_DEV_AUTH_ENABLED: "true",
    MARVIN_DEV_AUTH_EMAIL: "marvin-plan@example.com",
    MARVIN_DEV_AUTH_DISPLAY_NAME: "Marvin Plan Smoke"
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

let sessionCookie = "";

async function requestJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (sessionCookie) headers.Cookie = sessionCookie;
  const response = await fetch(url, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    sessionCookie = setCookie.split(";")[0];
  }
  return response.json();
}

try {
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
      const result = await response.json();
      return result?.ok ? result : null;
    } catch {
      return null;
    }
  }, 10000, "onboarding bootstrap API");

  const createAccount = await requestJson(`http://127.0.0.1:${port}/marvin-api/auth/dev`, { method: "POST" });
  assert.equal(createAccount.ok, true);

  const saveConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "marvin-plan@example.com",
      marvinAccount: {
        email: "marvin-plan@example.com",
        displayName: "Marvin Plan Smoke",
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
  assert.equal(saveConfig.ok, true, JSON.stringify(saveConfig));

  const microsoftPlan = await requestJson(`http://127.0.0.1:${port}/marvin-api/provider-plan?profileName=${encodeURIComponent(profileName)}&provider=microsoft`);
  assert.equal(microsoftPlan.ok, true, JSON.stringify(microsoftPlan));
  assert.equal(microsoftPlan.provider, "microsoft");
  assert.equal(microsoftPlan.plan.provider, "microsoft");
  assert.match(microsoftPlan.plan.redirectUri, /\/marvin-api\/oauth\/microsoft\/callback$/);
  assert.equal(microsoftPlan.plan.authorizePath, "/marvin-api/oauth/microsoft/start");

  const googlePlan = await requestJson(`http://127.0.0.1:${port}/marvin-api/provider-plan?profileName=${encodeURIComponent(profileName)}&provider=google`);
  assert.equal(googlePlan.ok, true, JSON.stringify(googlePlan));
  assert.equal(googlePlan.provider, "google");
  assert.equal(googlePlan.plan.provider, "google");
  assert.equal(googlePlan.plan.creationMode, "console-only");
  assert.match(googlePlan.plan.redirectUri, /\/marvin-api\/oauth\/google\/callback$/);
  assert.equal(googlePlan.plan.authorizePath, "/marvin-api/oauth/google/start");

  console.log(JSON.stringify({
    ok: true,
    profileName,
    microsoftRedirectUri: microsoftPlan.plan.redirectUri,
    googleRedirectUri: googlePlan.plan.redirectUri,
    googleCreationMode: googlePlan.plan.creationMode
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
