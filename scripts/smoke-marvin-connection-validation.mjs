import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-connection-validation-smoke-${Date.now()}`);
const port = 4211;
const profileName = "marvin-validation-smoke";

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

  await requestJson(`http://127.0.0.1:${port}/marvin-api/create-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinDisplayName: "Marvin Validator",
      marvinEmail: "marvin-validator@example.com",
      marvinPassword: "correct-horse-battery-staple"
    })
  });

  const saveConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "marvin-validator@example.com",
      marvinAccount: {
        email: "marvin-validator@example.com",
        displayName: "Marvin Validator",
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
        microsoftClientId: "ms-client-id",
        googleClientId: "google-client-id"
      },
      providerSecrets: {
        microsoftClientSecret: "ms-client-secret",
        googleClientSecret: "google-client-secret"
      }
    })
  });

  assert.equal(saveConfig.ok, true);

  const config = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(config.ok, true);
  assert.equal(config.config.profileName, profileName);
  assert.equal(config.config.accounts.length, 2);

  const validateWork = await requestJson(`http://127.0.0.1:${port}/marvin-api/connection-validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName, calendarId: "work_m365" })
  });

  assert.equal(validateWork.ok, true);
  assert.equal(validateWork.validation.ok, false);
  assert.equal(validateWork.validation.status, "pending");
  assert.match(validateWork.validation.message, /Finish provider sign-in first/i);

  const refreshedConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(refreshedConfig.ok, true);
  const workAccount = refreshedConfig.config.accounts.find((account) => account.id === "work_m365");
  assert.ok(workAccount);
  assert.equal(workAccount.connectionStatus, "pending");
  assert.ok(workAccount.authUrl.includes("/marvin-api/oauth/microsoft/start"));
  assert.equal(refreshedConfig.config.readinessSummary.actionRequired, 2);
  assert.ok(refreshedConfig.config.readinessSummary.nextSteps.some((item) => /Work: Connect|Work: Finish Sign-In|Work: Connect account/i.test(item)));

  console.log(JSON.stringify({
    ok: true,
    profileName,
    validationStatus: validateWork.validation.status,
    validationMessage: validateWork.validation.message,
    refreshedConnectionStatus: workAccount.connectionStatus
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
