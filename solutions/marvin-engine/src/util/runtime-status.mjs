import path from "node:path";
import { FileStateStore } from "../storage/file-state-store.mjs";

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

export function buildRuntimeStatusPath(rootDir, profileName) {
  return path.resolve(rootDir, ".marvin", "runtime", `${sanitizeName(profileName)}.runtime.json`);
}

export function createRuntimeStatusStore(rootDir, profileName) {
  return new FileStateStore(buildRuntimeStatusPath(rootDir, profileName), {
    profileName: sanitizeName(profileName),
    running: false,
    intervalSeconds: 300,
    runCount: 0,
    lastStartedAt: "",
    lastCompletedAt: "",
    lastResult: null,
    recentRuns: []
  });
}

export function appendRuntimeRun(currentState, runRecord, maxRuns = 20) {
  const recentRuns = Array.isArray(currentState?.recentRuns) ? currentState.recentRuns.slice() : [];
  recentRuns.unshift(runRecord);
  return recentRuns.slice(0, maxRuns);
}
