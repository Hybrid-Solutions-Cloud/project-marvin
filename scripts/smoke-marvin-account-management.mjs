import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-account-management-smoke-${Date.now()}`);
const port = 4202;
const profileName = "marvin-manage-smoke";

fs.mkdirSync(tempRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port),
    MARVIN_DEV_AUTH_ENABLED: "true",
    MARVIN_DEV_AUTH_EMAIL: "marvin-manager@example.com",
    MARVIN_DEV_AUTH_DISPLAY_NAME: "Marvin Manager"
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
      const result = await requestJson(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
      return result?.ok ? result : null;
    } catch {
      return null;
    }
  }, 10000, "bootstrap API");

  await requestJson(`http://127.0.0.1:${port}/marvin-api/auth/dev`, { method: "POST" });

  const saveConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marvinEmail: "marvin-manager@example.com",
      marvinAccount: {
        email: "marvin-manager@example.com",
        displayName: "Marvin Manager",
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
  assert.equal(saveConfig.config.accounts.length, 2);

  const addContract = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      account: {
        label: "Contract",
        provider: "outlook",
        email: "contract@example.com",
        scope: "contract",
        sourcePrefix: "CONTRACT: ",
        inboundOverrides: {
          visibility: "private",
          detailMode: "subject"
        }
      }
    })
  });

  assert.equal(addContract.ok, true);
  assert.equal(addContract.config.accounts.length, 3);
  const contractAdded = addContract.config.accounts.find((account) => account.email === "contract@example.com");
  assert.ok(contractAdded);
  assert.equal(contractAdded.provider, "outlook");
  assert.equal(contractAdded.sourcePrefix, "CONTRACT: ");
  assert.equal(contractAdded.inboundOverrides.visibility, "private");
  assert.equal(contractAdded.inboundOverrides.detailMode, "subject");

  const editContract = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      account: {
        id: contractAdded.id,
        label: "Contracting",
        provider: "outlook",
        email: "contract@example.com",
        scope: "contract",
        sourcePrefix: "SIDEGIG: ",
        inboundOverrides: {
          visibility: "default",
          detailMode: "full",
          copyLocation: true,
          copyDescription: true
        }
      }
    })
  });

  assert.equal(editContract.ok, true);
  const contractEdited = editContract.config.accounts.find((account) => account.id === contractAdded.id);
  assert.ok(contractEdited);
  assert.equal(contractEdited.label, "Contracting");
  assert.equal(contractEdited.sourcePrefix, "SIDEGIG: ");
  assert.equal(contractEdited.inboundOverrides.visibility, "default");
  assert.equal(contractEdited.inboundOverrides.detailMode, "full");
  assert.equal(contractEdited.inboundOverrides.copyLocation, true);
  assert.equal(contractEdited.inboundOverrides.copyDescription, true);

  const renameContract = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      account: {
        ...contractEdited,
        label: "Consulting Calendar"
      }
    })
  });

  assert.equal(renameContract.ok, true);
  const renamedContract = renameContract.config.accounts.find((account) => account.id === contractAdded.id);
  assert.ok(renamedContract);
  assert.equal(renamedContract.label, "Consulting Calendar");
  assert.equal(renamedContract.id, contractAdded.id);

  const removeContractPrefix = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      account: {
        ...renamedContract,
        sourcePrefix: ""
      }
    })
  });

  assert.equal(removeContractPrefix.ok, true);
  const contractWithoutPrefix = removeContractPrefix.config.accounts.find((account) => account.id === contractAdded.id);
  assert.ok(contractWithoutPrefix);
  assert.equal(contractWithoutPrefix.sourcePrefix, "");
  const prefixlessProfile = JSON.parse(fs.readFileSync(path.join(tempRoot, "profiles", `${profileName}.json`), "utf8"));
  const prefixlessRoute = prefixlessProfile.routes.find((route) => route.source === contractAdded.id);
  assert.ok(prefixlessRoute);
  assert.ok(prefixlessRoute.targets.every((target) => target.subjectPrefix === ""));

  const addApple = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      account: {
        label: "Apple Family",
        provider: "apple-caldav",
        email: "apple@example.com",
        scope: "family",
        sourcePrefix: "APPLE: ",
        caldavServerUrl: "https://caldav.example.com/family",
        caldavUsername: "apple@example.com",
        caldavPassword: "apple-app-password",
        inboundOverrides: {
          visibility: "default",
          detailMode: "full",
          copyLocation: true,
          copyDescription: true
        }
      }
    })
  });

  assert.equal(addApple.ok, true);
  const appleAdded = addApple.config.accounts.find((account) => account.email === "apple@example.com");
  assert.ok(appleAdded);
  assert.equal(appleAdded.provider, "apple-caldav");
  assert.equal(appleAdded.sourcePrefix, "APPLE: ");
  assert.equal(appleAdded.caldavServerUrl, "https://caldav.example.com/family");
  assert.equal(appleAdded.caldavUsername, "apple@example.com");
  assert.equal(appleAdded.inboundOverrides.visibility, "default");
  assert.equal(appleAdded.inboundOverrides.detailMode, "full");

  const reloadedConfig = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(reloadedConfig.ok, true);
  const reloadedApple = reloadedConfig.config.accounts.find((account) => account.id === appleAdded.id);
  const reloadedContract = reloadedConfig.config.accounts.find((account) => account.id === contractAdded.id);
  assert.ok(reloadedApple);
  assert.ok(reloadedContract);
  assert.equal(reloadedContract.sourcePrefix, "");
  assert.equal(reloadedContract.label, "Consulting Calendar");
  assert.equal(reloadedContract.inboundOverrides.copyLocation, true);
  assert.equal(reloadedApple.caldavServerUrl, "https://caldav.example.com/family");
  assert.equal(reloadedApple.inboundOverrides.copyDescription, true);

  const removeContract = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      accountId: contractAdded.id
    })
  });

  assert.equal(removeContract.ok, true);
  assert.equal(removeContract.config.accounts.length, 3);
  assert.equal(removeContract.config.accounts.some((account) => account.id === contractAdded.id), false);
  assert.equal(removeContract.config.accounts.some((account) => account.id === appleAdded.id), true);

  const configAfterRemoval = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(configAfterRemoval.ok, true);
  assert.equal(configAfterRemoval.config.accounts.length, 3);
  assert.equal(configAfterRemoval.config.accounts.some((account) => account.id === contractAdded.id), false);
  assert.equal(configAfterRemoval.config.accounts.some((account) => account.id === appleAdded.id), true);

  const removeApple = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      accountId: appleAdded.id
    })
  });

  assert.equal(removeApple.ok, true);
  assert.equal(removeApple.config.accounts.length, 2);
  assert.equal(removeApple.config.accounts.some((account) => account.id === appleAdded.id), false);
  assert.equal(Boolean(removeApple.config.providerSecretStatus?.caldavPasswordsConfigured?.[appleAdded.id]), false);

  const configAfterAppleRemoval = await requestJson(`http://127.0.0.1:${port}/marvin-api/config?profileName=${encodeURIComponent(profileName)}`);
  assert.equal(configAfterAppleRemoval.ok, true);
  assert.equal(configAfterAppleRemoval.config.accounts.length, 2);
  assert.equal(configAfterAppleRemoval.config.accounts.some((account) => account.id === appleAdded.id), false);
  assert.equal(Boolean(configAfterAppleRemoval.config.providerSecretStatus?.caldavPasswordsConfigured?.[appleAdded.id]), false);

  console.log(JSON.stringify({
    ok: true,
    profileName,
    addedAccountId: contractAdded.id,
    appleAccountId: appleAdded.id,
    finalAccounts: configAfterAppleRemoval.config.accounts.map((account) => ({
      id: account.id,
      label: account.label,
      provider: account.provider,
      sourcePrefix: account.sourcePrefix,
      inboundOverrides: account.inboundOverrides || {}
    }))
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
