import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { startRuntimeProcess, getRuntimeProcessStatus, stopRuntimeProcess } from "../solutions/marvin-engine/src/util/runtime-process.mjs";
import { startMarvinOnboardServer } from "./marvin-onboard-server.mjs";

const rootDir = path.resolve(process.env.MARVIN_ROOT_DIR || process.cwd());
const pollMs = Number(process.env.MARVIN_BOOTSTRAP_POLL_MS || 5000);
const intervalSeconds = Number(process.env.MARVIN_SYNC_INTERVAL_SECONDS || 300);
const windowDays = Number(process.env.MARVIN_WINDOW_DAYS || 0);
const autoStart = (process.env.MARVIN_AUTO_START || "true").toLowerCase() === "true";
const stopRuntimeOnExit = (process.env.MARVIN_STOP_RUNTIME_ON_EXIT || "false").toLowerCase() === "true";
const latestStatePath = path.join(rootDir, ".marvin", "latest.json");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadLatestProfileName() {
  return String(readJson(latestStatePath, {})?.profileName || "").trim();
}

function buildProfilePath(profileName) {
  return path.join(rootDir, "profiles", `${profileName}.json`);
}

let activeProfileName = "";
let disposed = false;

function stopActiveRuntime() {
  if (!activeProfileName) {
    return;
  }
  const current = getRuntimeProcessStatus(rootDir, activeProfileName);
  if (current.running) {
    stopRuntimeProcess(rootDir, activeProfileName);
  }
  activeProfileName = "";
}

function ensureRuntime() {
  if (!autoStart || disposed) {
    return;
  }
  const latestProfileName = loadLatestProfileName();
  if (!latestProfileName) {
    stopActiveRuntime();
    return;
  }
  const profilePath = buildProfilePath(latestProfileName);
  if (!fs.existsSync(profilePath)) {
    stopActiveRuntime();
    return;
  }

  if (activeProfileName && activeProfileName !== latestProfileName) {
    stopActiveRuntime();
  }

  const status = getRuntimeProcessStatus(rootDir, latestProfileName);
  if (!status.running) {
    startRuntimeProcess(rootDir, {
      profileName: latestProfileName,
      profilePath,
      intervalSeconds,
      windowDays
    });
  }
  activeProfileName = latestProfileName;
}

const server = startMarvinOnboardServer();
ensureRuntime();
const timer = setInterval(ensureRuntime, pollMs);

async function shutdown() {
  if (disposed) {
    return;
  }
  disposed = true;
  clearInterval(timer);
  if (stopRuntimeOnExit && activeProfileName) {
    try {
      stopRuntimeProcess(rootDir, activeProfileName);
    } catch {
      // Ignore shutdown races.
    }
  }
  await new Promise((resolve) => server.close(resolve));
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
