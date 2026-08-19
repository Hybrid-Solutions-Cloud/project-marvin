import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolveActiveProfile } from "./util/active-profile.mjs";
import { summarizeTokenState } from "./util/token-state.mjs";
import { createRuntimeContext } from "./util/runtime-context.mjs";
import { ensureRuntimeSubscriptions } from "./util/subscription-manager.mjs";
import { appendRuntimeRun, createRuntimeStatusStore } from "./util/runtime-status.mjs";
import { consumeWebhookSyncRequest, createSubscriptionStateStore } from "./util/subscription-state.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculatePollDelaySeconds(intervalSeconds, consecutiveFailures = 0) {
  const base = Math.max(1, Number(intervalSeconds || 300));
  const failures = Math.max(0, Number(consecutiveFailures || 0));
  return failures === 0 ? base : Math.min(3600, base * (2 ** Math.min(failures, 4)));
}

function sanitizeOperationalMessage(value) {
  return String(value || "Operation failed.")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/((?:access|refresh)[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

function calendarProvider(runtime, calendarId) {
  return runtime.profile.calendars.find((calendar) => calendar.id === calendarId)?.provider || "runtime";
}

function normalizeFailureProvider(error) {
  return String(error?.provider || "runtime");
}

function buildFailureHistory(runtime, sourceLoad, applyResult, occurredAt) {
  const readFailures = (sourceLoad.errors || []).map((failure) => ({
    provider: failure.provider || calendarProvider(runtime, failure.calendarId),
    calendarId: failure.calendarId || "",
    operation: "read",
    occurredAt,
    message: sanitizeOperationalMessage(failure.message),
    action: "Verify provider access in Diagnostics, then retry the synchronization."
  }));
  const writeFailures = (applyResult.results || []).filter((result) => result.status === "error").map((failure) => ({
    provider: calendarProvider(runtime, failure.targetCalendarId || failure.sourceCalendarId),
    calendarId: failure.targetCalendarId || failure.sourceCalendarId || "",
    sourceCalendarId: failure.sourceCalendarId || "",
    targetCalendarId: failure.targetCalendarId || "",
    operation: "write",
    occurredAt,
    message: sanitizeOperationalMessage(failure.message),
    action: "Check the target calendar connection in Diagnostics, then retry."
  }));
  return [...readFailures, ...writeFailures];
}

function summarizeApplyResult(applyResult) {
  return {
    attempted: Number(applyResult.attempted || 0),
    succeeded: Number(applyResult.succeeded || 0),
    failed: Number(applyResult.failed || 0),
    skipped: Number(applyResult.skipped || 0),
    results: (applyResult.results || []).map((result) => ({
      sourceCalendarId: result.sourceCalendarId || "",
      targetCalendarId: result.targetCalendarId || "",
      status: result.status || "",
      message: result.message ? sanitizeOperationalMessage(result.message) : ""
    }))
  };
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

function getSubscriptionStore(runtime) {
  return runtime.subscriptionStore || createSubscriptionStateStore(runtime.rootDir, runtime.profile.name);
}

function readPendingWebhookTrigger(runtime) {
  const store = getSubscriptionStore(runtime);
  const state = store.load();
  runtime.subscriptionStore = store;
  runtime.subscriptionState = state;
  const automation = state.automation || {};
  return {
    store,
    state,
    pending: Boolean(automation.pendingSyncRequested),
    requestedAt: automation.lastRequestedAt || automation.pendingSince || "",
    provider: automation.lastRequestedByProvider || "",
    calendarIds: Array.isArray(automation.lastRequestedByCalendarIds) ? automation.lastRequestedByCalendarIds : []
  };
}

function consumePendingWebhookTrigger(runtime, trigger, runStartedAt) {
  if (!trigger?.pending) {
    return trigger?.state || runtime.subscriptionState || null;
  }
  const store = trigger.store || getSubscriptionStore(runtime);
  const nextState = consumeWebhookSyncRequest(trigger.state, {
    consumedAt: new Date().toISOString(),
    runStartedAt,
    wakeReason: "webhook"
  });
  store.save(nextState);
  runtime.subscriptionStore = store;
  runtime.subscriptionState = nextState;
  return nextState;
}

export async function runMarvinSyncCycle(runtime, options = {}) {
  const startedAt = new Date();
  const runId = String(options.runId || crypto.randomUUID());
  const trigger = options.webhookTrigger || readPendingWebhookTrigger(runtime);
  if (trigger.pending) {
    consumePendingWebhookTrigger(runtime, trigger, startedAt.toISOString());
  }
  const subscriptionResult = await ensureRuntimeSubscriptions(runtime, { notificationUrl: options.notificationUrl, forceRenew: options.forceRenewSubscriptions });
  const sourceLoad = await runtime.engine.loadSourceEventsFromProviders({ windowDays: options.windowDays });
  const applyResult = await runtime.engine.applyLiveSync();
  const currentTokenState = runtime.adapters.google?.config?.tokenState || runtime.tokenState;
  const completedAt = new Date().toISOString();
  return {
    runId,
    startedAt: startedAt.toISOString(),
    completedAt,
    wakeReason: trigger.pending ? "webhook" : (options.wakeReason || "interval"),
    webhookTrigger: trigger.pending ? {
      requestedAt: trigger.requestedAt,
      provider: trigger.provider,
      calendarIds: trigger.calendarIds
    } : null,
    subscriptionSummary: subscriptionResult.summary,
    sourceLoad: {
      loaded: Number(sourceLoad.loaded || 0),
      skippedMirrors: Number(sourceLoad.skippedMirrors || 0),
      calendars: Number(sourceLoad.calendars || 0),
      loadedCalendarIds: sourceLoad.loadedCalendarIds || [],
      errors: (sourceLoad.errors || []).map((failure) => ({ ...failure, message: sanitizeOperationalMessage(failure.message) })),
      windowStart: sourceLoad.windowStart,
      windowEnd: sourceLoad.windowEnd
    },
    applyResult: summarizeApplyResult(applyResult),
    failures: buildFailureHistory(runtime, sourceLoad, applyResult, completedAt),
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

async function waitForNextCycle(runtime, intervalSeconds, stopSignal) {
  const pollMs = 5000;
  const totalMs = Math.max(0, Number(intervalSeconds || 0) * 1000);
  const startedAt = Date.now();
  while (!stopSignal.stopRequested && Date.now() - startedAt < totalMs) {
    const remainingMs = totalMs - (Date.now() - startedAt);
    const delayMs = Math.min(pollMs, Math.max(remainingMs, 0));
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    if (stopSignal.stopRequested) {
      return { wakeReason: "stop", trigger: null };
    }
    const trigger = readPendingWebhookTrigger(runtime);
    if (trigger.pending) {
      return { wakeReason: "webhook", trigger };
    }
  }
  return { wakeReason: "interval", trigger: readPendingWebhookTrigger(runtime) };
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

  let runtime = options.runtime || createRuntimeContext({ rootDir, profilePath: parsed.profilePath, sourceEvents: [] });
  const statusStore = options.statusStore || createRuntimeStatusStore(rootDir, runtime.profile.name);
  let status = statusStore.load();
  status = await updateRuntimeStatus(statusStore, status, {
    profileName: runtime.profile.name,
    intervalSeconds: parsed.intervalSeconds,
    running: true,
    startedAt: new Date().toISOString()
  });

  const stopSignal = { stopRequested: false };
  const stop = () => { stopSignal.stopRequested = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    let cycleWakeReason = "startup";
    let cycleTrigger = readPendingWebhookTrigger(runtime);
    let currentPollDelaySeconds = parsed.intervalSeconds;
    do {
      // Hosted configuration, calendar selection, profile names, and refreshed
      // tokens can change while the daemon is running. Rehydrate the production
      // runtime before every cycle so those changes take effect without a restart.
      if (!options.runtime) {
        runtime = createRuntimeContext({ rootDir, profilePath: parsed.profilePath, sourceEvents: [] });
      }
      const cycleStartedAt = new Date().toISOString();
      status = await updateRuntimeStatus(statusStore, status, {
        lastStartedAt: cycleStartedAt,
        running: true,
        lastWakeReason: cycleTrigger?.pending ? "webhook" : cycleWakeReason,
        pendingWebhookSyncRequested: Boolean(cycleTrigger?.pending),
        pendingWebhookProvider: cycleTrigger?.pending ? cycleTrigger.provider : "",
        pendingWebhookCalendarIds: cycleTrigger?.pending ? cycleTrigger.calendarIds : []
      });
      const cycleRunId = crypto.randomUUID();
      try {
        const runRecord = await runMarvinSyncCycle(runtime, {
          runId: cycleRunId,
          windowDays: parsed.windowDays,
          webhookTrigger: cycleTrigger,
          wakeReason: cycleTrigger?.pending ? "webhook" : cycleWakeReason
        });
        const consecutiveFailures = runRecord.success ? 0 : Number(status.consecutiveFailures || 0) + 1;
        currentPollDelaySeconds = calculatePollDelaySeconds(parsed.intervalSeconds, consecutiveFailures);
        const nextPollAt = new Date(Date.now() + currentPollDelaySeconds * 1000).toISOString();
        status = await updateRuntimeStatus(statusStore, status, {
          runCount: Number(status.runCount || 0) + 1,
          lastCompletedAt: runRecord.completedAt,
          lastResult: runRecord,
          recentRuns: appendRuntimeRun(status, runRecord),
          lastWakeReason: runRecord.wakeReason,
          consecutiveFailures,
          currentPollDelaySeconds,
          nextPollAt,
          pendingWebhookSyncRequested: false,
          pendingWebhookProvider: "",
          pendingWebhookCalendarIds: []
        });
        if (parsed.once) {
          console.log(JSON.stringify({ ok: true, profile: runtime.profile.name, result: runRecord }, null, 2));
          return runRecord;
        }
      } catch (error) {
        const failureRecord = {
          runId: cycleRunId,
          startedAt: cycleStartedAt,
          completedAt: new Date().toISOString(),
          success: false,
          wakeReason: cycleTrigger?.pending ? "webhook" : cycleWakeReason,
          webhookTrigger: cycleTrigger?.pending ? {
            requestedAt: cycleTrigger.requestedAt,
            provider: cycleTrigger.provider,
            calendarIds: cycleTrigger.calendarIds
          } : null,
          message: sanitizeOperationalMessage(error instanceof Error ? error.message : String(error)),
          failures: [{
            provider: normalizeFailureProvider(error),
            calendarId: String(error?.calendarId || ""),
            operation: String(error?.operation || "runtime"),
            occurredAt: new Date().toISOString(),
            message: sanitizeOperationalMessage(error instanceof Error ? error.message : String(error)),
            action: "Review Diagnostics and retry. If the failure continues, inspect the provider status."
          }]
        };
        const consecutiveFailures = Number(status.consecutiveFailures || 0) + 1;
        currentPollDelaySeconds = calculatePollDelaySeconds(parsed.intervalSeconds, consecutiveFailures);
        const nextPollAt = new Date(Date.now() + currentPollDelaySeconds * 1000).toISOString();
        status = await updateRuntimeStatus(statusStore, status, {
          runCount: Number(status.runCount || 0) + 1,
          lastCompletedAt: failureRecord.completedAt,
          lastResult: failureRecord,
          recentRuns: appendRuntimeRun(status, failureRecord),
          lastWakeReason: failureRecord.wakeReason,
          consecutiveFailures,
          currentPollDelaySeconds,
          nextPollAt,
          pendingWebhookSyncRequested: false,
          pendingWebhookProvider: "",
          pendingWebhookCalendarIds: []
        });
        if (parsed.once) {
          console.error(JSON.stringify({ ok: false, profile: runtime.profile.name, error: failureRecord.message }, null, 2));
          throw error;
        }
      }

      if (parsed.once || stopSignal.stopRequested) {
        break;
      }
      const nextCycle = await waitForNextCycle(runtime, currentPollDelaySeconds, stopSignal);
      cycleWakeReason = nextCycle.wakeReason;
      cycleTrigger = nextCycle.trigger;
    } while (!stopSignal.stopRequested);
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
