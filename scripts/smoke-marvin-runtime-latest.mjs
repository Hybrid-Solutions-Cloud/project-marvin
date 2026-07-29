import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-runtime-latest-smoke-${Date.now()}`);
const profileName = "marvin-runtime-latest-smoke";
const profilePath = path.join(tempRoot, "profiles", `${profileName}.json`);

async function cleanupTempRoot() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 9) {
        throw error;
      }
      await delay(300);
    }
  }
}

function runRuntimeCommand(args = []) {
  const output = execFileSync(process.execPath, ["scripts/marvin-runtime.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MARVIN_ROOT_DIR: tempRoot,
      MARVIN_APP_DIR: repoRoot
    }
  });
  return JSON.parse(output);
}

fs.mkdirSync(path.join(tempRoot, "profiles"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, ".marvin"), { recursive: true });

const profile = {
  name: profileName,
  timezone: "America/New_York",
  syncWindowDays: 1,
  privacyDefaults: {
    mirrorMode: "subject",
    visibility: "private",
    subjectPrefix: "SRC: ",
    copyLocation: false,
    copyDescription: false,
    preserveOriginalTimezone: true
  },
  runtime: {
    deployment: {},
    providerConnections: {
      microsoft: { provider: "m365", authMode: "marvin-engine", clientId: "" },
      google: { provider: "google", authMode: "marvin-engine", clientId: "" },
      caldav: { provider: "apple-caldav", authMode: "manual-caldav", serverUrl: "", username: "" }
    }
  },
  calendars: [],
  routes: []
};

fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");
fs.writeFileSync(
  path.join(tempRoot, ".marvin", "latest.json"),
  JSON.stringify({ operatorEmail: "marvin@example.com", profileName }, null, 2) + "\n",
  "utf8"
);

try {
  const start = runRuntimeCommand(["start", "--interval-seconds", "1", "--window-days", "1"]);
  assert.equal(start.ok, true);
  assert.equal(start.profileName, profileName);
  assert.equal(start.profileSource, "latest");
  assert.equal(start.runtimeProcess.running, true);
  assert.ok(start.runtimeProcess.pid > 0);
  assert.equal(path.resolve(start.profilePath), path.resolve(profilePath));

  let status = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(500);
    status = runRuntimeCommand(["status"]);
    if (status.runtimeProcess.running) {
      break;
    }
  }
  assert.ok(status);
  assert.equal(status.profileName, profileName);
  assert.equal(status.profileSource, "latest");
  assert.equal(status.runtimeProcess.running, true);

  const stop = runRuntimeCommand(["stop"]);
  assert.equal(stop.ok, true);
  assert.equal(stop.profileName, profileName);
  assert.equal(stop.profileSource, "latest");
  assert.equal(stop.runtimeProcess.running, false);

  console.log(JSON.stringify({
    ok: true,
    profileName,
    profileSource: start.profileSource,
    pid: start.runtimeProcess.pid
  }, null, 2));
} finally {
  try {
    runRuntimeCommand(["stop"]);
  } catch {}
  await cleanupTempRoot();
}