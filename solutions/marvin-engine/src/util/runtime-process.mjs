import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRuntimeStatusStore } from "./runtime-status.mjs";
import { atomicWriteJson, CURRENT_STATE_SCHEMA_VERSION } from "../storage/file-state-store.mjs";

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Number(state?._schemaVersion || 0) > CURRENT_STATE_SCHEMA_VERSION) {
    throw new Error(`Runtime process state schema is newer than this runtime: ${filePath}`);
  }
  return state;
}

function writeJson(filePath, data) {
  atomicWriteJson(filePath, { ...data, _schemaVersion: CURRENT_STATE_SCHEMA_VERSION });
}

export function buildRuntimeProcessPath(rootDir, profileName) {
  return path.resolve(rootDir, ".marvin", "runtime", `${sanitizeName(profileName)}.process.json`);
}

export function loadRuntimeProcessRecord(rootDir, profileName) {
  return readJson(buildRuntimeProcessPath(rootDir, profileName), null);
}

export function saveRuntimeProcessRecord(rootDir, profileName, record) {
  writeJson(buildRuntimeProcessPath(rootDir, profileName), record);
  return record;
}

export function isPidRunning(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false;
  }
  try {
    process.kill(numericPid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getRuntimeProcessStatus(rootDir, profileName) {
  const record = loadRuntimeProcessRecord(rootDir, profileName);
  const running = Boolean(record?.pid) && isPidRunning(record.pid);
  return {
    profileName: sanitizeName(profileName),
    pid: record?.pid || 0,
    running,
    startedAt: record?.startedAt || "",
    stoppedAt: record?.stoppedAt || "",
    intervalSeconds: Number(record?.intervalSeconds || 0),
    windowDays: Number(record?.windowDays || 0),
    profilePath: record?.profilePath || "",
    daemonEntry: record?.daemonEntry || "",
    command: Array.isArray(record?.command) ? record.command : []
  };
}

export function startRuntimeProcess(rootDir, options = {}) {
  const profileName = sanitizeName(options.profileName);
  const current = getRuntimeProcessStatus(rootDir, profileName);
  if (current.running) {
    return current;
  }

  const profilePath = path.resolve(rootDir, options.profilePath || path.join("profiles", `${profileName}.json`));
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }

  const appDir = path.resolve(options.appDir || process.env.MARVIN_APP_DIR || process.cwd());
  const daemonEntry = options.daemonEntry
    ? path.resolve(options.daemonEntry)
    : path.resolve(appDir, "solutions", "marvin-engine", "src", "daemon.mjs");
  const intervalSeconds = Number(options.intervalSeconds || process.env.MARVIN_SYNC_INTERVAL_SECONDS || 300);
  const windowDays = Number(options.windowDays || 0);
  const command = [
    daemonEntry,
    "--profile",
    profilePath,
    "--interval-seconds",
    String(intervalSeconds)
  ];
  if (windowDays > 0) {
    command.push("--window-days", String(windowDays));
  }

  const child = spawn(process.execPath, command, {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      MARVIN_SYNC_INTERVAL_SECONDS: String(intervalSeconds)
    }
  });
  child.unref();

  const record = {
    profileName,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    stoppedAt: "",
    intervalSeconds,
    windowDays,
    profilePath,
    daemonEntry,
    command: [process.execPath, ...command]
  };
  saveRuntimeProcessRecord(rootDir, profileName, record);
  return getRuntimeProcessStatus(rootDir, profileName);
}

function markRuntimeStopped(rootDir, profileName, previous = null) {
  const current = previous || loadRuntimeProcessRecord(rootDir, profileName) || {};
  const next = {
    ...current,
    profileName: sanitizeName(profileName),
    stoppedAt: new Date().toISOString()
  };
  saveRuntimeProcessRecord(rootDir, profileName, next);
  const statusStore = createRuntimeStatusStore(rootDir, profileName);
  const runtimeStatus = statusStore.load();
  statusStore.save({
    ...runtimeStatus,
    running: false,
    stoppedAt: next.stoppedAt
  });
  return getRuntimeProcessStatus(rootDir, profileName);
}

export function stopRuntimeProcess(rootDir, profileName) {
  const current = loadRuntimeProcessRecord(rootDir, profileName);
  if (!current?.pid) {
    return markRuntimeStopped(rootDir, profileName, current || { profileName: sanitizeName(profileName) });
  }

  if (!isPidRunning(current.pid)) {
    return markRuntimeStopped(rootDir, profileName, current);
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(current.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
  } else {
    try {
      process.kill(current.pid, "SIGTERM");
    } catch {
      // Ignore stop races and normalize the state file below.
    }
  }

  return markRuntimeStopped(rootDir, profileName, current);
}
