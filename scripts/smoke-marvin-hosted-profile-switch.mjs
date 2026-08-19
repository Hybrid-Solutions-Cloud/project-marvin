import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { stopRuntimeProcess } from "../solutions/marvin-engine/src/util/runtime-process.mjs";

const repoRoot = process.cwd();
const tempRoot = path.resolve("C:/tmp/marvin-hosted-switch-smoke-" + Date.now());
const profileA = "marvin-hosted-a";
const profileB = "marvin-hosted-b";
const port = 4194;

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(tempRoot, ".marvin", "runtime"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, "profiles"), { recursive: true });

function buildProfile(name) {
  return {
    name,
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
}

fs.writeFileSync(path.join(tempRoot, "profiles", profileA + ".json"), JSON.stringify(buildProfile(profileA), null, 2));
fs.writeFileSync(path.join(tempRoot, "profiles", profileB + ".json"), JSON.stringify(buildProfile(profileB), null, 2));
fs.writeFileSync(path.join(tempRoot, ".marvin", "latest.json"), JSON.stringify({ operatorEmail: "marvin@example.com", profileName: profileA }, null, 2));

const hosted = spawn(process.execPath, ["scripts/marvin-hosted.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port),
    MARVIN_HOSTED: "true",
    MARVIN_AUTO_START: "true",
    MARVIN_STOP_RUNTIME_ON_EXIT: "true",
    MARVIN_BOOTSTRAP_POLL_MS: "200",
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
  throw new Error("Timed out waiting for " + label);
}

function processPath(profileName) {
  return path.join(tempRoot, ".marvin", "runtime", profileName + ".process.json");
}

function statusPath(profileName) {
  return path.join(tempRoot, ".marvin", "runtime", profileName + ".runtime.json");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

try {
  await waitFor(async () => {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/marvin-api/bootstrap");
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }, 10000, "hosted bootstrap API");

  await waitFor(() => fs.existsSync(processPath(profileA)) ? readJson(processPath(profileA)) : null, 10000, "profile A runtime process");
  await waitFor(() => fs.existsSync(statusPath(profileA)) ? readJson(statusPath(profileA))?.runCount >= 1 : false, 10000, "profile A runtime status");

  fs.writeFileSync(path.join(tempRoot, ".marvin", "latest.json"), JSON.stringify({ operatorEmail: "marvin@example.com", profileName: profileB }, null, 2));

  await waitFor(() => {
    if (!fs.existsSync(processPath(profileA)) || !fs.existsSync(processPath(profileB))) {
      return null;
    }
    const oldProcess = readJson(processPath(profileA));
    const newProcess = readJson(processPath(profileB));
    return oldProcess?.stoppedAt && newProcess?.pid ? { oldProcess, newProcess } : null;
  }, 10000, "runtime switch from profile A to profile B");

  await waitFor(() => fs.existsSync(statusPath(profileB)) ? readJson(statusPath(profileB))?.runCount >= 1 : false, 10000, "profile B runtime status");

  fs.rmSync(path.join(tempRoot, "profiles", profileB + ".json"), { force: true });
  fs.writeFileSync(path.join(tempRoot, ".marvin", "latest.json"), JSON.stringify({ operatorEmail: "marvin@example.com", profileName: profileB }, null, 2));

  const stopped = await waitFor(() => {
    if (!fs.existsSync(processPath(profileB)) || !fs.existsSync(statusPath(profileB))) {
      return null;
    }
    const processJson = readJson(processPath(profileB));
    const statusJson = readJson(statusPath(profileB));
    return processJson?.stoppedAt && statusJson?.running === false ? { processJson, statusJson } : null;
  }, 10000, "runtime stop after latest profile disappears");

  console.log(JSON.stringify({
    ok: true,
    switchedTo: profileB,
    stoppedMissingProfileAt: stopped.processJson.stoppedAt,
    runtimeRunning: stopped.statusJson.running
  }, null, 2));
} finally {
  try { hosted.kill("SIGTERM"); } catch {}
  try { stopRuntimeProcess(tempRoot, profileA); } catch {}
  try { stopRuntimeProcess(tempRoot, profileB); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}