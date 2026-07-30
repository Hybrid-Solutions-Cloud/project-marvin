import path from "node:path";
import { FileStateStore } from "../storage/file-state-store.mjs";

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeStringList(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeString(value))
    .filter(Boolean)));
}

function normalizeSubscriptions(records = []) {
  return (Array.isArray(records) ? records : []).map((record) => ({
    calendarId: normalizeString(record?.calendarId),
    provider: normalizeString(record?.provider),
    subscriptionId: normalizeString(record?.subscriptionId),
    channelId: normalizeString(record?.channelId),
    resourceId: normalizeString(record?.resourceId),
    resourceUri: normalizeString(record?.resourceUri),
    resource: normalizeString(record?.resource),
    notificationUrl: normalizeString(record?.notificationUrl),
    clientState: normalizeString(record?.clientState),
    changeType: normalizeString(record?.changeType || "created,updated,deleted"),
    expiresAt: normalizeString(record?.expiresAt),
    status: normalizeString(record?.status || "pending"),
    createdAt: normalizeString(record?.createdAt),
    lastRenewedAt: normalizeString(record?.lastRenewedAt),
    lastCheckedAt: normalizeString(record?.lastCheckedAt),
    lastError: normalizeString(record?.lastError),
    updatedAt: normalizeString(record?.updatedAt)
  })).filter((record) => record.calendarId || record.subscriptionId || record.channelId);
}

function normalizeWebhookState(webhooks = {}) {
  const microsoft = webhooks?.microsoft || {};
  const google = webhooks?.google || {};
  return {
    microsoft: {
      validationRequests: Number(microsoft.validationRequests || 0),
      lastValidationToken: normalizeString(microsoft.lastValidationToken),
      lastValidationAt: normalizeString(microsoft.lastValidationAt),
      notificationsReceived: Number(microsoft.notificationsReceived || 0),
      lastNotificationAt: normalizeString(microsoft.lastNotificationAt),
      lastNotificationSample: microsoft.lastNotificationSample || null
    },
    google: {
      notificationsReceived: Number(google.notificationsReceived || 0),
      lastNotificationAt: normalizeString(google.lastNotificationAt),
      lastNotificationHeaders: google.lastNotificationHeaders || null,
      lastNotificationBody: google.lastNotificationBody || null
    }
  };
}

function normalizeAutomationState(automation = {}) {
  return {
    pendingSyncRequested: Boolean(automation.pendingSyncRequested),
    pendingSince: normalizeString(automation.pendingSince),
    lastRequestedAt: normalizeString(automation.lastRequestedAt),
    lastRequestedByProvider: normalizeString(automation.lastRequestedByProvider),
    lastRequestedByCalendarIds: normalizeStringList(automation.lastRequestedByCalendarIds),
    requestCount: Number(automation.requestCount || 0),
    lastConsumedAt: normalizeString(automation.lastConsumedAt),
    lastConsumedByRunStartedAt: normalizeString(automation.lastConsumedByRunStartedAt),
    lastWakeReason: normalizeString(automation.lastWakeReason)
  };
}

export function buildSubscriptionStatePath(rootDir, profileName) {
  return path.resolve(rootDir, ".marvin", "subscriptions", `${sanitizeName(profileName)}.subscriptions.json`);
}

export function normalizeSubscriptionState(state = {}) {
  return {
    subscriptions: normalizeSubscriptions(state.subscriptions),
    providerSummaries: state.providerSummaries && typeof state.providerSummaries === "object" ? state.providerSummaries : {},
    webhooks: normalizeWebhookState(state.webhooks),
    automation: normalizeAutomationState(state.automation),
    updatedAt: normalizeString(state.updatedAt)
  };
}

export function markWebhookSyncRequest(state = {}, request = {}) {
  const current = normalizeSubscriptionState(state);
  const now = normalizeString(request.requestedAt) || new Date().toISOString();
  const existingCalendarIds = current.automation.pendingSyncRequested
    ? current.automation.lastRequestedByCalendarIds
    : [];
  const calendarIds = normalizeStringList([
    ...existingCalendarIds,
    ...(Array.isArray(request.calendarIds) ? request.calendarIds : [])
  ]);
  return normalizeSubscriptionState({
    ...current,
    automation: {
      ...current.automation,
      pendingSyncRequested: true,
      pendingSince: current.automation.pendingSyncRequested ? current.automation.pendingSince || now : now,
      lastRequestedAt: now,
      lastRequestedByProvider: normalizeString(request.provider) || current.automation.lastRequestedByProvider,
      lastRequestedByCalendarIds: calendarIds,
      requestCount: Number(current.automation.requestCount || 0) + 1,
      lastWakeReason: "webhook"
    },
    updatedAt: now
  });
}

export function consumeWebhookSyncRequest(state = {}, details = {}) {
  const current = normalizeSubscriptionState(state);
  const consumedAt = normalizeString(details.consumedAt) || new Date().toISOString();
  return normalizeSubscriptionState({
    ...current,
    automation: {
      ...current.automation,
      pendingSyncRequested: false,
      pendingSince: "",
      lastConsumedAt: consumedAt,
      lastConsumedByRunStartedAt: normalizeString(details.runStartedAt),
      lastWakeReason: normalizeString(details.wakeReason) || current.automation.lastWakeReason
    },
    updatedAt: consumedAt
  });
}

export function createSubscriptionStateStore(rootDir, profileName) {
  const store = new FileStateStore(buildSubscriptionStatePath(rootDir, profileName), normalizeSubscriptionState({}));
  return {
    load() {
      return normalizeSubscriptionState(store.load());
    },
    save(state) {
      store.save(normalizeSubscriptionState(state));
    }
  };
}

export function loadSubscriptionStateForProfile(rootDir, profileName) {
  return createSubscriptionStateStore(rootDir, profileName).load();
}
