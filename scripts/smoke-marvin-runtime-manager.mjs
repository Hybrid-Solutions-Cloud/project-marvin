import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startRuntimeProcess, stopRuntimeProcess, getRuntimeProcessStatus } from "../solutions/marvin-engine/src/util/runtime-process.mjs";
import { buildRuntimeStatusPath } from "../solutions/marvin-engine/src/util/runtime-status.mjs";

const tempRoot = path.resolve("C:/tmp/marvin-runtime-manager-smoke");
fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(tempRoot, "profiles"), { recursive: true });

const profile = {
  name: "marvin-runtime-manager-smoke",
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

const profilePath = path.join(tempRoot, "profiles", `${profile.name}.json`);
fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");

const started = startRuntimeProcess(tempRoot, {
  profileName: profile.name,
  profilePath,
  daemonEntry: path.resolve("solutions/marvin-engine/src/daemon.mjs"),
  intervalSeconds: 1,
  windowDays: 1
});
assert.equal(started.running, true);
assert.ok(started.pid > 0);

const runtimeStatusPath = buildRuntimeStatusPath(tempRoot, profile.name);
let runtimeStatus = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await delay(500);
  if (fs.existsSync(runtimeStatusPath)) {
    runtimeStatus = JSON.parse(fs.readFileSync(runtimeStatusPath, "utf8"));
    if (Number(runtimeStatus.runCount || 0) >= 1) {
      break;
    }
  }
}
assert.ok(runtimeStatus, "Runtime status file was not created.");
assert.ok(Number(runtimeStatus.runCount || 0) >= 1, "Runtime daemon did not complete a cycle.");

const stopped = stopRuntimeProcess(tempRoot, profile.name);
assert.equal(stopped.running, false);

let finalStatus = getRuntimeProcessStatus(tempRoot, profile.name);
for (let attempt = 0; attempt < 20; attempt += 1) {
  if (!finalStatus.running) {
    break;
  }
  await delay(250);
  finalStatus = getRuntimeProcessStatus(tempRoot, profile.name);
}
assert.equal(finalStatus.running, false);
assert.ok(finalStatus.stoppedAt);

const finalRuntimeStatus = JSON.parse(fs.readFileSync(runtimeStatusPath, "utf8"));
assert.equal(finalRuntimeStatus.running, false);

console.log(JSON.stringify({
  ok: true,
  pid: started.pid,
  runCount: runtimeStatus.runCount,
  stoppedAt: finalStatus.stoppedAt,
  runtimeStatusPath
}, null, 2));
