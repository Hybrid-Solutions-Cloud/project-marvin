import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveActiveProfile } from "./util/active-profile.mjs";
import { summarizeTokenState } from "./util/token-state.mjs";
import { createRuntimeContext } from "./util/runtime-context.mjs";
import { ensureRuntimeSubscriptions } from "./util/subscription-manager.mjs";
import { appendRuntimeRun, createRuntimeStatusStore } from "./util/runtime-status.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv = process.argv.slice(2)) {
  const profileFlagIndex = argv.indexOf("--profile");
  const intervalFlagIndex = argv.indexOf("--interval-seconds");
  const windowDaysFlagIndex = argv.indexOf("--window-days");
  const rootDir = process.env.MARVIN_ROOT_DIR ? path.resolve(process.env.MARVIN_ROOT_DIR) : process.cwd();
  const explicitProfilePath = profileFlagIndex >= 0 ? argv[profileFlagIndex + 1] : "";
  const activeProfile = resolveActiveProfile(rootDir, explicitProfilePath);
  return {
    profilePath: activeProfile.profilePath,
    profileName: activeProfile.profileName,
    profileSource: activeProfile.source,
    intervalSeconds: intervalFlagIndex >= 0 ? Number(argv[intervalFlagIndex + 1] || 300) : Number(process.env.MARVIN_SYNC_INTERVAL_SECONDS || 300),
    windowDays: windowDaysFlagIndex >= 0 ? Number(argv[windowDaysFlagIndex + 1] || 45) : null,
    once: argv.includes("--once")
  };
}

export async function runMarvinSyncCycle(runtime, options = {}) {
  const startedAt = new Date();
  const subscriptionResult = await ensureRuntimeSubscriptions(runtime, { notificationUrl: options.notificationUrl, forceRenew: options.forceRenewSubscriptions });
  const sourceLoad = await runtime.engine.loadSourceEventsFromProviders({ windowDays: options.windowDays });
  const applyResult = await runtime.engine.applyLiveSync();
  const currentTokenState = runtime.adapters.google.config.tokenState || runtime.tokenState;
  return {
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    subscriptionSummary: subscriptionResult.summary,
    sourceLoad,
    applyResult,
    tokenSummary: summarizeTokenState(currentTokenState, runtime.profile.calendars),
    adapterStatus: Object.fromEntries(Object.entries(runtime.adapters).map(([key, adapter]) => [key, adapter.describe()])),
    success: applyResult.failed === 0 && sourceLoad.errors.length === 0
  };
}

async function updateRuntimeStatus(statusStore, currentState, nextValues) {
  const nextState = { ...currentState, ...nextValues };
  statusStore.save(nextState);
  return nextState;
}

export async function startMarvinDaemon(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const parsed = options.runtime || options.profilePath
    ? {
        profilePath: options.profilePath || resolveActiveProfile(rootDir).profilePath,
        profileName: options.profileName || resolveActiveProfile(rootDir, options.profilePath || "").profileName,
        profileSource: options.profilePath ? "explicit" : resolveActiveProfile(rootDir).source,
        intervalSeconds: Number(options.intervalSeconds || 300),
        windowDays: options.windowDays || null,
        once: Boolean(options.once)
      }
    : parseArgs();

  const runtime = options.runtime || createRuntimeContext({ rootDir, profilePath: parsed.profilePath, sourceEvents: [] });
  const statusStore = options.statusStore || createRuntimeStatusStore(rootDir, runtime.profile.name);
  let status = statusStore.load();
  status = await updateRuntimeStatus(statusStore, status, {
    profileName: runtime.profile.name,
    intervalSeconds: parsed.intervalSeconds,
    running: true,
    startedAt: new Date().toISOString()
  });

  let stopRequested = false;
  const stop = () => { stopRequested = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    do {
      const cycleStartedAt = new Date().toISOString();
      status = await updateRuntimeStatus(statusStore, status, {
        lastStartedAt: cycleStartedAt,
        running: true
      });
      try {
        const runRecord = await runMarvinSyncCycle(runtime, { windowDays: parsed.windowDays });
        status = await updateRuntimeStatus(statusStore, status, {
          runCount: Number(status.runCount || 0) + 1,
          lastCompletedAt: runRecord.completedAt,
          lastResult: runRecord,
          recentRuns: appendRuntimeRun(status, runRecord)
        });
        if (parsed.once) {
          console.log(JSON.stringify({ ok: true, profile: runtime.profile.name, result: runRecord }, null, 2));
          return runRecord;
        }
      } catch (error) {
        const failureRecord = {
          startedAt: cycleStartedAt,
          completedAt: new Date().toISOString(),
          success: false,
          message: error instanceof Error ? error.message : String(error)
        };
        status = await updateRuntimeStatus(statusStore, status, {
          runCount: Number(status.runCount || 0) + 1,
          lastCompletedAt: failureRecord.completedAt,
          lastResult: failureRecord,
          recentRuns: appendRuntimeRun(status, failureRecord)
        });
        if (parsed.once) {
          console.error(JSON.stringify({ ok: false, profile: runtime.profile.name, error: failureRecord.message }, null, 2));
          throw error;
        }
      }

      if (parsed.once || stopRequested) {
        break;
      }
      await sleep(parsed.intervalSeconds * 1000);
    } while (!stopRequested);
  } finally {
    status = statusStore.load();
    statusStore.save({
      ...status,
      running: false,
      stoppedAt: new Date().toISOString()
    });
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  return statusStore.load().lastResult;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startMarvinDaemon();
}
