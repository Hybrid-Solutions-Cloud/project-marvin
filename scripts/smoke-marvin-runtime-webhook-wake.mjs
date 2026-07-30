import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startRuntimeProcess, stopRuntimeProcess, getRuntimeProcessStatus } from "../solutions/marvin-engine/src/util/runtime-process.mjs";
import { buildRuntimeStatusPath } from "../solutions/marvin-engine/src/util/runtime-status.mjs";
import { createSubscriptionStateStore, markWebhookSyncRequest } from "../solutions/marvin-engine/src/util/subscription-state.mjs";

const tempRoot = path.resolve(`C:/tmp/marvin-runtime-webhook-wake-smoke-${Date.now()}`);
fs.mkdirSync(path.join(tempRoot, "profiles"), { recursive: true });

const profile = {
  name: "marvin-runtime-webhook-wake-smoke",
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

const runtimeStatusPath = buildRuntimeStatusPath(tempRoot, profile.name);
const subscriptionStore = createSubscriptionStateStore(tempRoot, profile.name);

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

const intervalSeconds = 60;
const started = startRuntimeProcess(tempRoot, {
  profileName: profile.name,
  profilePath,
  daemonEntry: path.resolve("solutions/marvin-engine/src/daemon.mjs"),
  intervalSeconds,
  windowDays: 1
});
assert.equal(started.running, true);
assert.ok(started.pid > 0);

let runtimeStatus = await waitFor(() => {
  if (!fs.existsSync(runtimeStatusPath)) return null;
  const status = JSON.parse(fs.readFileSync(runtimeStatusPath, "utf8"));
  return Number(status.runCount || 0) >= 1 ? status : null;
}, 10000, "initial daemon cycle");
assert.equal(runtimeStatus.runCount, 1);

const requestQueuedAt = new Date().toISOString();
subscriptionStore.save(markWebhookSyncRequest(subscriptionStore.load(), {
  provider: "microsoft",
  calendarIds: ["work"],
  requestedAt: requestQueuedAt
}));

runtimeStatus = await waitFor(() => {
  if (!fs.existsSync(runtimeStatusPath)) return null;
  const status = JSON.parse(fs.readFileSync(runtimeStatusPath, "utf8"));
  return Number(status.runCount || 0) >= 2 ? status : null;
}, 15000, "daemon webhook wake cycle");

const stopped = stopRuntimeProcess(tempRoot, profile.name);
assert.equal(stopped.running, false);
let finalProcess = getRuntimeProcessStatus(tempRoot, profile.name);
for (let attempt = 0; attempt < 20 && finalProcess.running; attempt += 1) {
  await delay(250);
  finalProcess = getRuntimeProcessStatus(tempRoot, profile.name);
}
assert.equal(finalProcess.running, false);

const finalRuntimeStatus = JSON.parse(fs.readFileSync(runtimeStatusPath, "utf8"));
const subscriptionState = subscriptionStore.load();
const secondRun = Array.isArray(finalRuntimeStatus.recentRuns) ? finalRuntimeStatus.recentRuns.find((run) => Number(run?.startedAt ? Date.parse(run.startedAt) : 0) >= Date.parse(requestQueuedAt)) : null;
assert.ok(secondRun, "Expected a daemon run after queuing the webhook wake request.");
assert.equal(finalRuntimeStatus.lastWakeReason, "webhook");
assert.equal(finalRuntimeStatus.lastResult?.wakeReason, "webhook");
assert.equal(finalRuntimeStatus.lastResult?.webhookTrigger?.provider, "microsoft");
assert.deepEqual(finalRuntimeStatus.lastResult?.webhookTrigger?.calendarIds, ["work"]);
assert.equal(subscriptionState.automation.pendingSyncRequested, false);
assert.equal(subscriptionState.automation.lastRequestedByProvider, "microsoft");
assert.ok(subscriptionState.automation.lastConsumedAt);
assert.ok(Date.parse(finalRuntimeStatus.lastStartedAt) - Date.parse(requestQueuedAt) < intervalSeconds * 1000, "Daemon waited for the full interval instead of waking early.");

console.log(JSON.stringify({
  ok: true,
  pid: started.pid,
  initialRunCount: 1,
  finalRunCount: finalRuntimeStatus.runCount,
  intervalSeconds,
  requestedAt: requestQueuedAt,
  lastWakeReason: finalRuntimeStatus.lastWakeReason,
  webhookTrigger: finalRuntimeStatus.lastResult?.webhookTrigger,
  runtimeStatusPath
}, null, 2));
