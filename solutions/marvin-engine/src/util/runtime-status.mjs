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
    nextPollAt: "",
    currentPollDelaySeconds: 300,
    consecutiveFailures: 0,
    lastResult: null,
    recentRuns: []
  });
}

function compactProviderSummary(summary = {}) {
  return {
    provider: String(summary.provider || ""),
    checkedAt: String(summary.checkedAt || ""),
    eligible: Number(summary.eligible || 0),
    active: Number(summary.active || 0),
    created: Number(summary.created || 0),
    renewed: Number(summary.renewed || 0),
    skipped: Number(summary.skipped || 0),
    failed: Number(summary.failed || 0),
    ready: Boolean(summary.ready)
  };
}

export function compactRuntimeRun(run = {}) {
  const subscriptionProviders = Object.fromEntries(Object.entries(run?.subscriptionSummary?.providers || {})
    .map(([provider, summary]) => [provider, compactProviderSummary(summary)]));
  return {
    runId: String(run.runId || ""),
    startedAt: String(run.startedAt || ""),
    completedAt: String(run.completedAt || ""),
    wakeReason: String(run.wakeReason || ""),
    webhookTrigger: run.webhookTrigger ? {
      requestedAt: String(run.webhookTrigger.requestedAt || ""),
      provider: String(run.webhookTrigger.provider || ""),
      calendarIds: Array.isArray(run.webhookTrigger.calendarIds) ? run.webhookTrigger.calendarIds.map(String) : []
    } : null,
    subscriptionSummary: run.subscriptionSummary ? {
      checkedAt: String(run.subscriptionSummary.checkedAt || ""),
      providers: subscriptionProviders,
      eligible: Number(run.subscriptionSummary.eligible || 0),
      active: Number(run.subscriptionSummary.active || 0),
      created: Number(run.subscriptionSummary.created || 0),
      renewed: Number(run.subscriptionSummary.renewed || 0),
      skipped: Number(run.subscriptionSummary.skipped || 0),
      failed: Number(run.subscriptionSummary.failed || 0)
    } : null,
    sourceLoad: run.sourceLoad ? {
      loaded: Number(run.sourceLoad.loaded || 0),
      skippedMirrors: Number(run.sourceLoad.skippedMirrors || 0),
      calendars: Number(run.sourceLoad.calendars || 0),
      loadedCalendarIds: Array.isArray(run.sourceLoad.loadedCalendarIds) ? run.sourceLoad.loadedCalendarIds.map(String) : [],
      errors: Array.isArray(run.sourceLoad.errors) ? run.sourceLoad.errors.map((failure) => ({
        calendarId: String(failure.calendarId || ""),
        provider: String(failure.provider || ""),
        message: String(failure.message || "")
      })) : [],
      windowStart: String(run.sourceLoad.windowStart || ""),
      windowEnd: String(run.sourceLoad.windowEnd || "")
    } : null,
    applyResult: run.applyResult ? {
      attempted: Number(run.applyResult.attempted || 0),
      succeeded: Number(run.applyResult.succeeded || 0),
      failed: Number(run.applyResult.failed || 0),
      skipped: Number(run.applyResult.skipped || 0),
      results: Array.isArray(run.applyResult.results) ? run.applyResult.results.map((result) => ({
        sourceCalendarId: String(result.sourceCalendarId || ""),
        targetCalendarId: String(result.targetCalendarId || ""),
        status: String(result.status || ""),
        message: String(result.message || "")
      })) : []
    } : null,
    failures: Array.isArray(run.failures) ? run.failures.map((failure) => ({
      provider: String(failure.provider || ""),
      calendarId: String(failure.calendarId || ""),
      sourceCalendarId: String(failure.sourceCalendarId || ""),
      targetCalendarId: String(failure.targetCalendarId || ""),
      operation: String(failure.operation || ""),
      occurredAt: String(failure.occurredAt || ""),
      message: String(failure.message || ""),
      action: String(failure.action || "")
    })) : [],
    tokenSummary: run.tokenSummary?.summary ? { summary: { ...run.tokenSummary.summary } } : (run.tokenSummary ? { ...run.tokenSummary } : null),
    adapterStatus: run.adapterStatus || {},
    success: Boolean(run.success),
    message: String(run.message || "")
  };
}

export function appendRuntimeRun(currentState, runRecord, maxRuns = 20) {
  const recentRuns = Array.isArray(currentState?.recentRuns) ? currentState.recentRuns.map(compactRuntimeRun) : [];
  recentRuns.unshift(compactRuntimeRun(runRecord));
  return recentRuns.slice(0, maxRuns);
}
