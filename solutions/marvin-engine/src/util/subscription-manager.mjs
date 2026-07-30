import crypto from "node:crypto";
import { createSubscriptionStateStore } from "./subscription-state.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function addMinutes(nowMs, minutes) {
  return new Date(nowMs + minutes * 60 * 1000).toISOString();
}

function getProviderBaseUrl(profile, providerKey) {
  return normalizeString(profile?.runtime?.providerConnections?.[providerKey]?.marvinBaseUrl || profile?.runtime?.deployment?.marvinUrl);
}

export function buildMicrosoftNotificationUrl(profile) {
  const baseUrl = getProviderBaseUrl(profile, "microsoft");
  return baseUrl ? `${baseUrl}/marvin-api/webhooks/microsoft` : "";
}

export function buildGoogleNotificationUrl(profile) {
  const baseUrl = getProviderBaseUrl(profile, "google");
  return baseUrl ? `${baseUrl}/marvin-api/webhooks/google` : "";
}

function buildProviderSummary(provider, profileName, notificationUrl) {
  return {
    provider,
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

function buildOverallSummary(profileName, summaries) {
  const values = Object.values(summaries || {});
  return {
    profileName,
    checkedAt: new Date().toISOString(),
    providers: summaries,
    eligible: values.reduce((sum, item) => sum + Number(item?.eligible || 0), 0),
    active: values.reduce((sum, item) => sum + Number(item?.active || 0), 0),
    created: values.reduce((sum, item) => sum + Number(item?.created || 0), 0),
    renewed: values.reduce((sum, item) => sum + Number(item?.renewed || 0), 0),
    skipped: values.reduce((sum, item) => sum + Number(item?.skipped || 0), 0),
    failed: values.reduce((sum, item) => sum + Number(item?.failed || 0), 0)
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

function upsertErrorRecord(existing, nextValues) {
  return {
    calendarId: normalizeString(nextValues.calendarId || existing?.calendarId),
    provider: normalizeString(nextValues.provider || existing?.provider),
    subscriptionId: normalizeString(nextValues.subscriptionId || existing?.subscriptionId),
    channelId: normalizeString(nextValues.channelId || existing?.channelId),
    resourceId: normalizeString(nextValues.resourceId || existing?.resourceId),
    resourceUri: normalizeString(nextValues.resourceUri || existing?.resourceUri),
    resource: normalizeString(nextValues.resource || existing?.resource),
    notificationUrl: normalizeString(nextValues.notificationUrl || existing?.notificationUrl),
    clientState: normalizeString(nextValues.clientState || existing?.clientState),
    changeType: normalizeString(nextValues.changeType || existing?.changeType || "created,updated,deleted"),
    expiresAt: normalizeString(nextValues.expiresAt || existing?.expiresAt),
    status: normalizeString(nextValues.status || existing?.status || "pending"),
    createdAt: normalizeString(nextValues.createdAt || existing?.createdAt),
    lastRenewedAt: normalizeString(nextValues.lastRenewedAt || existing?.lastRenewedAt),
    lastCheckedAt: normalizeString(nextValues.lastCheckedAt || existing?.lastCheckedAt),
    lastError: normalizeString(nextValues.lastError || existing?.lastError),
    updatedAt: normalizeString(nextValues.updatedAt || existing?.updatedAt)
  };
}

async function ensureProviderSubscriptions(runtime, providerConfig) {
  const { providerId, adapterKey, notificationUrlBuilder, calendarMatcher, expirationMinutes, renewWindowMinutes, channelLabel } = providerConfig;
  const profile = runtime.profile;
  const adapter = runtime.adapters?.[adapterKey];
  const nowMs = Number(providerConfig.nowMs || Date.now());
  const notificationUrl = normalizeString(providerConfig.notificationUrl || notificationUrlBuilder(profile));
  const summary = buildProviderSummary(providerId, profile.name, notificationUrl);
  const stateStore = runtime.subscriptionStore || createSubscriptionStateStore(runtime.rootDir, profile.name);
  const currentState = stateStore.load();
  const existingByCalendar = new Map((currentState.subscriptions || []).filter((record) => record.provider === providerId).map((record) => [record.calendarId, record]));
  const retained = (currentState.subscriptions || []).filter((record) => record.provider !== providerId);
  const nextRecords = [];
  const calendars = (Array.isArray(profile?.calendars) ? profile.calendars : []).filter(calendarMatcher);

  for (const calendar of calendars) {
    const existing = existingByCalendar.get(calendar.id) || null;
    if (normalizeString(calendar.connectionStatus).toLowerCase() !== "connected") {
      if (existing) {
        nextRecords.push(upsertErrorRecord(existing, {
          calendarId: calendar.id,
          provider: providerId,
          status: "skipped",
          lastCheckedAt: new Date(nowMs).toISOString(),
          updatedAt: new Date(nowMs).toISOString(),
          lastError: "Calendar is not connected in Marvin."
        }));
      }
      summary.skipped += 1;
      summary.records.push({ calendarId: calendar.id, action: "skip", reason: "not-connected" });
      continue;
    }

    summary.eligible += 1;
    if (!notificationUrl) {
      nextRecords.push(upsertErrorRecord(existing, {
        calendarId: calendar.id,
        provider: providerId,
        resource: normalizeString(existing?.resource || `/users/${calendar.email}/events`),
        notificationUrl: "",
        status: "skipped",
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        lastError: `Marvin does not have a public webhook URL for ${channelLabel} subscriptions yet.`
      }));
      summary.skipped += 1;
      summary.records.push({ calendarId: calendar.id, action: "skip", reason: "missing-notification-url" });
      continue;
    }

    if (!adapter || typeof adapter.hasCalendarAuthMaterial !== "function" || !adapter.hasCalendarAuthMaterial(calendar)) {
      nextRecords.push(upsertErrorRecord(existing, {
        calendarId: calendar.id,
        provider: providerId,
        resource: normalizeString(existing?.resource || `/users/${calendar.email}/events`),
        notificationUrl,
        status: "skipped",
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        lastError: `${channelLabel} auth material is not ready for webhook subscription creation.`
      }));
      summary.skipped += 1;
      summary.records.push({ calendarId: calendar.id, action: "skip", reason: "auth-not-ready" });
      continue;
    }

    const due = !existing || existing.status !== "active" || existing.notificationUrl !== notificationUrl || isRenewalDue(existing, nowMs, renewWindowMinutes) || providerConfig.forceRenew;
    if (!due) {
      const activeRecord = upsertErrorRecord(existing, {
        status: "active",
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        lastError: ""
      });
      nextRecords.push(activeRecord);
      summary.active += 1;
      summary.records.push({
        calendarId: calendar.id,
        action: "active",
        subscriptionId: activeRecord.subscriptionId,
        channelId: activeRecord.channelId
      });
      continue;
    }

    const clientState = normalizeString(existing?.clientState || `marvin-${providerId}-${calendar.id}-${crypto.randomBytes(6).toString("hex")}`);
    const expiresAt = addMinutes(nowMs, expirationMinutes);
    const result = await adapter.ensureCalendarWebhookSubscription(calendar, existing, {
      notificationUrl,
      clientState,
      expiresAt,
      ttlSeconds: expirationMinutes * 60,
      channelId: normalizeString(existing?.channelId || `marvin-${calendar.id}-${crypto.randomBytes(8).toString("hex")}`),
      nowMs
    });

    if (!result.ok) {
      nextRecords.push(upsertErrorRecord(existing, {
        calendarId: calendar.id,
        provider: providerId,
        resource: normalizeString(existing?.resource || `/users/${calendar.email}/events`),
        notificationUrl,
        clientState,
        status: "error",
        expiresAt: normalizeString(existing?.expiresAt || expiresAt),
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        lastError: normalizeString(result.message || `${channelLabel} subscription request failed.`)
      }));
      summary.failed += 1;
      summary.records.push({ calendarId: calendar.id, action: "error", reason: normalizeString(result.reason || "request-failed") });
      continue;
    }

    nextRecords.push(result.subscription);
    if (existing?.subscriptionId || existing?.channelId) {
      summary.renewed += 1;
      summary.records.push({ calendarId: calendar.id, action: "renew", subscriptionId: result.subscription.subscriptionId, channelId: result.subscription.channelId });
    } else {
      summary.created += 1;
      summary.records.push({ calendarId: calendar.id, action: "create", subscriptionId: result.subscription.subscriptionId, channelId: result.subscription.channelId });
    }
  }

  return {
    retained,
    nextRecords,
    summary,
    currentState,
    stateStore
  };
}

export async function ensureRuntimeSubscriptions(runtime, options = {}) {
  const microsoft = await ensureProviderSubscriptions(runtime, {
    providerId: "microsoft",
    adapterKey: "microsoft",
    notificationUrlBuilder: buildMicrosoftNotificationUrl,
    calendarMatcher: (calendar) => calendar.provider === "m365" || calendar.provider === "outlook",
    expirationMinutes: Number(options.microsoftExpirationMinutes || 60 * 48),
    renewWindowMinutes: Number(options.microsoftRenewWindowMinutes || 12 * 60),
    channelLabel: "Microsoft",
    notificationUrl: options.notificationUrl,
    nowMs: options.nowMs,
    forceRenew: options.forceRenew
  });

  const google = await ensureProviderSubscriptions(runtime, {
    providerId: "google",
    adapterKey: "google",
    notificationUrlBuilder: buildGoogleNotificationUrl,
    calendarMatcher: (calendar) => calendar.provider === "google",
    expirationMinutes: Number(options.googleExpirationMinutes || 60 * 24 * 6),
    renewWindowMinutes: Number(options.googleRenewWindowMinutes || 12 * 60),
    channelLabel: "Google",
    notificationUrl: options.googleNotificationUrl,
    nowMs: options.nowMs,
    forceRenew: options.forceRenew
  });

  const stateStore = microsoft.stateStore || google.stateStore || runtime.subscriptionStore || createSubscriptionStateStore(runtime.rootDir, runtime.profile.name);
  const currentState = microsoft.currentState || google.currentState || stateStore.load();
  const retained = (currentState.subscriptions || []).filter((record) => record.provider !== "microsoft" && record.provider !== "google");
  const summaries = {
    ...(currentState.providerSummaries || {}),
    microsoft: microsoft.summary,
    google: google.summary
  };
  const nextState = {
    subscriptions: [...retained, ...microsoft.nextRecords, ...google.nextRecords],
    providerSummaries: summaries,
    webhooks: currentState.webhooks || {},
    automation: currentState.automation || {},
    updatedAt: new Date(Number(options.nowMs || Date.now())).toISOString()
  };
  stateStore.save(nextState);
  runtime.subscriptionStore = stateStore;
  runtime.subscriptionState = nextState;
  return {
    state: nextState,
    summaries,
    summary: buildOverallSummary(runtime.profile.name, summaries)
  };
}
