import crypto from "node:crypto";
import { createSubscriptionStateStore } from "./subscription-state.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function addMinutes(nowMs, minutes) {
  return new Date(nowMs + minutes * 60 * 1000).toISOString();
}

function getMicrosoftBaseUrl(profile) {
  return normalizeString(profile?.runtime?.providerConnections?.microsoft?.marvinBaseUrl || profile?.runtime?.deployment?.marvinUrl);
}

export function buildMicrosoftNotificationUrl(profile) {
  const baseUrl = getMicrosoftBaseUrl(profile);
  return baseUrl ? `${baseUrl}/marvin-api/webhooks/microsoft` : "";
}

function buildSummary(profileName, notificationUrl) {
  return {
    provider: "microsoft",
    profileName,
    notificationUrl,
    checkedAt: new Date().toISOString(),
    eligible: 0,
    active: 0,
    created: 0,
    renewed: 0,
    skipped: 0,
    failed: 0,
    ready: Boolean(notificationUrl),
    records: []
  };
}

function isRenewalDue(record, nowMs, renewWindowMinutes) {
  const expiresAt = normalizeString(record?.expiresAt);
  if (!expiresAt) {
    return true;
  }
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return true;
  }
  return expiresMs - nowMs <= renewWindowMinutes * 60 * 1000;
}

export async function ensureRuntimeSubscriptions(runtime, options = {}) {
  const profile = runtime.profile;
  const adapter = runtime.adapters?.microsoft;
  const stateStore = runtime.subscriptionStore || createSubscriptionStateStore(runtime.rootDir, profile.name);
  const currentState = stateStore.load();
  const notificationUrl = normalizeString(options.notificationUrl || buildMicrosoftNotificationUrl(profile));
  const renewWindowMinutes = Number(options.renewWindowMinutes || 12 * 60);
  const nowMs = Number(options.nowMs || Date.now());
  const summary = buildSummary(profile.name, notificationUrl);
  const existingMicrosoft = new Map((currentState.subscriptions || []).filter((record) => record.provider === "microsoft").map((record) => [record.calendarId, record]));
  const retained = (currentState.subscriptions || []).filter((record) => record.provider !== "microsoft");
  const nextRecords = [];
  const calendars = Array.isArray(profile?.calendars) ? profile.calendars : [];

  for (const calendar of calendars) {
    if (calendar.provider !== "m365" && calendar.provider !== "outlook") {
      continue;
    }
    const existing = existingMicrosoft.get(calendar.id) || null;
    if (normalizeString(calendar.connectionStatus).toLowerCase() !== "connected") {
      if (existing) {
        nextRecords.push({ ...existing, status: "skipped", lastCheckedAt: new Date(nowMs).toISOString(), updatedAt: new Date(nowMs).toISOString(), lastError: "Calendar is not connected in Marvin." });
      }
      summary.skipped += 1;
      summary.records.push({ calendarId: calendar.id, action: "skip", reason: "not-connected" });
      continue;
    }
    summary.eligible += 1;
    if (!notificationUrl) {
      nextRecords.push({
        calendarId: calendar.id,
        provider: "microsoft",
        status: "skipped",
        resource: existing?.resource || `/users/${calendar.email}/events`,
        notificationUrl: "",
        clientState: existing?.clientState || "",
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        lastError: "Marvin does not have a public webhook URL for Microsoft subscriptions yet."
      });
      summary.skipped += 1;
      summary.records.push({ calendarId: calendar.id, action: "skip", reason: "missing-notification-url" });
      continue;
    }
    if (!adapter || typeof adapter.hasCalendarAuthMaterial !== "function" || !adapter.hasCalendarAuthMaterial(calendar)) {
      nextRecords.push({
        calendarId: calendar.id,
        provider: "microsoft",
        subscriptionId: normalizeString(existing?.subscriptionId),
        resource: normalizeString(existing?.resource || `/users/${calendar.email}/events`),
        notificationUrl,
        clientState: normalizeString(existing?.clientState),
        status: "skipped",
        expiresAt: normalizeString(existing?.expiresAt),
        createdAt: normalizeString(existing?.createdAt),
        lastRenewedAt: normalizeString(existing?.lastRenewedAt),
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        lastError: "Microsoft auth material is not ready for webhook subscription creation."
      });
      summary.skipped += 1;
      summary.records.push({ calendarId: calendar.id, action: "skip", reason: "auth-not-ready" });
      continue;
    }

    const due = !existing || existing.status !== "active" || existing.notificationUrl !== notificationUrl || isRenewalDue(existing, nowMs, renewWindowMinutes) || options.forceRenew;
    if (!due) {
      const activeRecord = { ...existing, status: "active", lastCheckedAt: new Date(nowMs).toISOString(), updatedAt: new Date(nowMs).toISOString(), lastError: "" };
      nextRecords.push(activeRecord);
      summary.active += 1;
      summary.records.push({ calendarId: calendar.id, action: "active", subscriptionId: activeRecord.subscriptionId });
      continue;
    }

    const clientState = normalizeString(existing?.clientState || `marvin-${calendar.id}-${crypto.randomBytes(6).toString("hex")}`);
    const expiresAt = addMinutes(nowMs, Number(options.microsoftExpirationMinutes || 60 * 48));
    const result = await adapter.ensureCalendarWebhookSubscription(calendar, existing, {
      notificationUrl,
      clientState,
      expiresAt,
      nowMs
    });
    if (!result.ok) {
      nextRecords.push({
        calendarId: calendar.id,
        provider: "microsoft",
        subscriptionId: normalizeString(existing?.subscriptionId),
        resource: normalizeString(existing?.resource || `/users/${calendar.email}/events`),
        notificationUrl,
        clientState,
        status: "error",
        expiresAt: normalizeString(existing?.expiresAt || expiresAt),
        createdAt: normalizeString(existing?.createdAt),
        lastRenewedAt: normalizeString(existing?.lastRenewedAt),
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        lastError: normalizeString(result.message || "Microsoft subscription request failed.")
      });
      summary.failed += 1;
      summary.records.push({ calendarId: calendar.id, action: "error", reason: normalizeString(result.reason || "request-failed") });
      continue;
    }

    nextRecords.push(result.subscription);
    if (existing?.subscriptionId) {
      summary.renewed += 1;
      summary.records.push({ calendarId: calendar.id, action: "renew", subscriptionId: result.subscription.subscriptionId });
    } else {
      summary.created += 1;
      summary.records.push({ calendarId: calendar.id, action: "create", subscriptionId: result.subscription.subscriptionId });
    }
  }

  const nextState = {
    subscriptions: [...retained, ...nextRecords],
    providerSummaries: {
      ...(currentState.providerSummaries || {}),
      microsoft: summary
    },
    webhooks: currentState.webhooks || {},
    updatedAt: new Date(nowMs).toISOString()
  };
  stateStore.save(nextState);
  runtime.subscriptionStore = stateStore;
  runtime.subscriptionState = nextState;
  return { state: nextState, summary };
}