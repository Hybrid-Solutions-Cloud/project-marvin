import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-route-policy-smoke-${Date.now()}`);
const port = 4214;
const profileName = "marvin-route-policy-smoke";

fs.mkdirSync(tempRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port),
    MARVIN_DEV_AUTH_ENABLED: "true",
    MARVIN_DEV_AUTH_EMAIL: "marvin-policy@example.com",
    MARVIN_DEV_AUTH_DISPLAY_NAME: "Marvin Policy"
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
  if (cookieHeader) headers.Cookie = cookieHeader;
  const response = await fetch(url, { ...options, headers });
  const setCookie = response.headers.get("set-cookie") || "";
  if (setCookie) cookieHeader = setCookie.split(";")[0];
  return response.json();
}

function readProfile() {
  return JSON.parse(fs.readFileSync(path.join(tempRoot, "profiles", `${profileName}.json`), "utf8"));
}

function routeTo(profile, sourceId, targetId) {
  const route = profile.routes.find((item) => item.source === sourceId);
  assert.ok(route, `Missing route for ${sourceId}`);
  const target = route.targets.find((item) => item.calendarId === targetId);
  assert.ok(target, `Missing target ${targetId} on route ${sourceId}`);
  return target;
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
      marvinEmail: "marvin-policy@example.com",
      marvinAccount: {
        email: "marvin-policy@example.com",
        displayName: "Marvin Policy",
        timezone: "America/New_York"
      },
      profileName,
      timezone: "America/New_York",
      syncWindowDays: 30,
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

  const addContract = await requestJson(`http://127.0.0.1:${port}/marvin-api/account-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileName,
      account: {
        id: "contract_outlook",
        label: "Contract",
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
  assert.equal(addContract.ok, true);

  const profile = readProfile();
  assert.equal(profile.privacyDefaults.visibility, "private");
  assert.equal(profile.privacyDefaults.mirrorMode, "subject");
  assert.equal(profile.privacyDefaults.preserveOriginalTimezone, true);
  assert.equal(profile.calendars.length, 3);
  assert.equal(profile.routes.length, 3);

  assert.deepEqual(routeTo(profile, "work_m365", "family_google"), {
    calendarId: "family_google",
    visibility: "default",
    detailMode: "busy",
    availabilityMode: "source",
    subjectPrefix: "WORK: ",
    copyLocation: false,
    copyDescription: false
  });

  assert.deepEqual(routeTo(profile, "work_m365", "contract_outlook"), {
    calendarId: "contract_outlook",
    visibility: "default",
    detailMode: "full",
    availabilityMode: "source",
    subjectPrefix: "WORK: ",
    copyLocation: true,
    copyDescription: true
  });

  assert.deepEqual(routeTo(profile, "family_google", "work_m365"), {
    calendarId: "work_m365",
    visibility: "private",
    detailMode: "subject",
    availabilityMode: "free",
    subjectPrefix: "FAM: ",
    copyLocation: true,
    copyDescription: true
  });

  assert.deepEqual(routeTo(profile, "family_google", "contract_outlook"), {
    calendarId: "contract_outlook",
    visibility: "default",
    detailMode: "full",
    availabilityMode: "free",
    subjectPrefix: "FAM: ",
    copyLocation: true,
    copyDescription: true
  });

  assert.deepEqual(routeTo(profile, "contract_outlook", "work_m365"), {
    calendarId: "work_m365",
    visibility: "private",
    detailMode: "subject",
    availabilityMode: "source",
    subjectPrefix: "SIDEGIG: ",
    copyLocation: true,
    copyDescription: true
  });

  assert.deepEqual(routeTo(profile, "contract_outlook", "family_google"), {
    calendarId: "family_google",
    visibility: "default",
    detailMode: "busy",
    availabilityMode: "source",
    subjectPrefix: "SIDEGIG: ",
    copyLocation: false,
    copyDescription: false
  });

  console.log(JSON.stringify({
    ok: true,
    profileName,
    calendars: profile.calendars.length,
    routes: profile.routes.length,
    checked: [
      "Private-by-default mirror policy persists through Marvin onboarding save flow",
      "Professional events use Busy-only details on shared-family targets",
      "Shared-family events remain visible but Free on professional targets",
      "Per-target inbound override persists through Marvin account management flow",
      "Source prefixes propagate into generated routes",
      "Preserve-original-timezone flag persists in generated profile"
    ]
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
