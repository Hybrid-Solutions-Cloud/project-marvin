import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { stopRuntimeProcess } from "../solutions/marvin-engine/src/util/runtime-process.mjs";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-hosted-bootstrap-smoke-${Date.now()}`);
const profileName = "marvin-hosted-smoke";
const port = 4193;

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(tempRoot, ".marvin", "runtime"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, "profiles"), { recursive: true });

const profile = {
  name: profileName,
  timezone: "America/New_York",
  syncWindowDays: 7,
  runtime: { providerConnections: {} },
  privacyDefaults: {
    mirrorMode: "subject",
    visibility: "private",
    subjectPrefix: "SRC: ",
    copyLocation: false,
    copyDescription: false,
    preserveOriginalTimezone: true
  },
  calendars: [],
  routes: []
};

fs.writeFileSync(path.join(tempRoot, "profiles", `${profileName}.json`), JSON.stringify(profile, null, 2));
fs.writeFileSync(path.join(tempRoot, ".marvin", "latest.json"), JSON.stringify({ operatorEmail: "marvin@example.com", profileName }, null, 2));

const hosted = spawn(process.execPath, ["scripts/marvin-hosted.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port),
    MARVIN_HOSTED: "true",
    MARVIN_DEV_AUTH_ENABLED: "true",
    MARVIN_AUTO_START: "true",
    MARVIN_STOP_RUNTIME_ON_EXIT: "true",
    MARVIN_BOOTSTRAP_POLL_MS: "250",
    MARVIN_SYNC_INTERVAL_SECONDS: "1"
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

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Timed out waiting for hosted process exit"));
    }, timeoutMs);

    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ code, signal });
    };

    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    function cleanup() {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    }

    child.once("exit", onExit);
    child.once("error", onError);
  });
}

const processPath = path.join(tempRoot, ".marvin", "runtime", `${profileName}.process.json`);
const statusPath = path.join(tempRoot, ".marvin", "runtime", `${profileName}.runtime.json`);

try {
  const bootstrap = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }, 10000, "hosted bootstrap API");

  assert.equal(bootstrap.ok, true);
  assert.equal(bootstrap.hostedMode, true);
  assert.equal(bootstrap.authentication.devAuthEnabled, false);
  const rejectedDevAuth = await fetch(`http://127.0.0.1:${port}/marvin-api/auth/dev`, { method: "POST" });
  assert.equal(rejectedDevAuth.status, 404);

  await waitFor(() => fs.existsSync(processPath) ? JSON.parse(fs.readFileSync(processPath, "utf8")) : null, 10000, "runtime process record");
  const processRecord = JSON.parse(fs.readFileSync(processPath, "utf8"));
  assert.equal(processRecord.profileName, profileName);
  assert.ok(Number(processRecord.pid) > 0);

  const runtimeStatus = await waitFor(() => {
    if (!fs.existsSync(statusPath)) return null;
    const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    return Number(status.runCount || 0) >= 1 ? status : null;
  }, 10000, "completed hosted runtime cycle");
  assert.ok(runtimeStatus.runCount >= 1);

  hosted.kill("SIGTERM");
  await waitForExit(hosted, 5000).catch(() => null);

  let stopped = null;
  try {
    stopped = await waitFor(() => {
      if (!fs.existsSync(processPath) || !fs.existsSync(statusPath)) return null;
      const processJson = JSON.parse(fs.readFileSync(processPath, "utf8"));
      const statusJson = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      return processJson.stoppedAt && statusJson.running === false ? { processJson, statusJson } : null;
    }, 5000, "hosted shutdown cleanup");
  } catch {
    stopRuntimeProcess(tempRoot, profileName);
    stopped = await waitFor(() => {
      if (!fs.existsSync(processPath) || !fs.existsSync(statusPath)) return null;
      const processJson = JSON.parse(fs.readFileSync(processPath, "utf8"));
      const statusJson = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      return processJson.stoppedAt && statusJson.running === false ? { processJson, statusJson } : null;
    }, 5000, "runtime forced shutdown cleanup");
  }

  console.log(JSON.stringify({
    ok: true,
    hostedMode: bootstrap.hostedMode,
    hostedDevAuthRejected: true,
    runtimePid: processRecord.pid,
    runCount: runtimeStatus.runCount,
    stoppedAt: stopped.processJson.stoppedAt,
    runtimeRunning: stopped.statusJson.running
  }, null, 2));
} finally {
  try { hosted.kill("SIGTERM"); } catch {}
  try { stopRuntimeProcess(tempRoot, profileName); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
