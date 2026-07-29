import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-auth-gating-smoke-${Date.now()}`);
const port = 4247;
const profileName = "marvin-auth-gating-smoke";

fs.mkdirSync(tempRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port)
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
  return {
    status: response.status,
    body: await response.json()
  };
}

try {
  const bootstrapBefore = await waitFor(async () => {
    try {
      const result = await requestJson(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
      return result.body?.ok ? result : null;
    } catch {
      return null;
    }
  }, 10000, "bootstrap before account creation");

  assert.equal(bootstrapBefore.status, 200);
  assert.equal(bootstrapBefore.body.hasOperator, false);
  assert.equal(bootstrapBefore.body.authenticated, false);
  assert.equal(bootstrapBefore.body.requiresLogin, false);

  const createAccount = await requestJson(`http://127.0.0.1:${port}/marvin-api/create-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinDisplayName: "Auth Gating Operator",
      marvinEmail: "auth-gating@example.com",
      marvinPassword: "correct-horse-battery-staple"
    })
  });

  assert.equal(createAccount.status, 200);
  assert.equal(createAccount.body.ok, true);
  assert.equal(createAccount.body.authenticated, true);

  const saveConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "auth-gating@example.com",
      marvinAccount: {
        email: "auth-gating@example.com",
        displayName: "Auth Gating Operator",
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

  assert.equal(saveConfig.status, 200);
  assert.equal(saveConfig.body.ok, true);

  const logout = await requestJson(`http://127.0.0.1:${port}/marvin-api/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  assert.equal(logout.status, 200);
  assert.equal(logout.body.ok, true);

  const bootstrapAfterLogout = await requestJson(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
  assert.equal(bootstrapAfterLogout.status, 200);
  assert.equal(bootstrapAfterLogout.body.hasOperator, true);
  assert.equal(bootstrapAfterLogout.body.hasConfig, true);
  assert.equal(bootstrapAfterLogout.body.authenticated, false);
  assert.equal(bootstrapAfterLogout.body.requiresLogin, true);
  assert.equal(bootstrapAfterLogout.body.config, null);

  const blockedConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(blockedConfig.status, 401);
  assert.equal(blockedConfig.body.ok, false);
  assert.equal(blockedConfig.body.requiresLogin, true);

  const login = await requestJson(`http://127.0.0.1:${port}/marvin-api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "auth-gating@example.com",
      marvinPassword: "correct-horse-battery-staple"
    })
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);
  assert.equal(login.body.authenticated, true);
  assert.equal(login.body.operator.email, "auth-gating@example.com");
  assert.equal(login.body.config.profileName, profileName);

  const configAfterLogin = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(configAfterLogin.status, 200);
  assert.equal(configAfterLogin.body.ok, true);
  assert.equal(configAfterLogin.body.config.profileName, profileName);
  assert.equal(configAfterLogin.body.config.accounts.length, 2);

  console.log(JSON.stringify({
    ok: true,
    profileName,
    blockedStatus: blockedConfig.status,
    requiresLoginAfterLogout: bootstrapAfterLogout.body.requiresLogin,
    loginRestoredAccess: true
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
