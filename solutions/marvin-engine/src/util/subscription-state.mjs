import path from "node:path";
import { FileStateStore } from "../storage/file-state-store.mjs";

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeSubscriptions(records = []) {
  return (Array.isArray(records) ? records : []).map((record) => ({
    calendarId: normalizeString(record?.calendarId),
    provider: normalizeString(record?.provider),
    subscriptionId: normalizeString(record?.subscriptionId),
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
  })).filter((record) => record.calendarId || record.subscriptionId);
}

function normalizeWebhookState(webhooks = {}) {
  const microsoft = webhooks?.microsoft || {};
  return {
    microsoft: {
      validationRequests: Number(microsoft.validationRequests || 0),
      lastValidationToken: normalizeString(microsoft.lastValidationToken),
      lastValidationAt: normalizeString(microsoft.lastValidationAt),
      notificationsReceived: Number(microsoft.notificationsReceived || 0),
      lastNotificationAt: normalizeString(microsoft.lastNotificationAt),
      lastNotificationSample: microsoft.lastNotificationSample || null
    }
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
    updatedAt: normalizeString(state.updatedAt)
  };
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