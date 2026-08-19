import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { ensureRuntimeSubscriptions } from "../solutions/marvin-engine/src/util/subscription-manager.mjs";
import { buildSubscriptionStatePath } from "../solutions/marvin-engine/src/util/subscription-state.mjs";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-subscriptions-smoke-${Date.now()}`);
const port = 4600 + Math.floor(Math.random() * 300);
const profileName = "marvin-subscriptions-smoke";

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(tempRoot, ".marvin"), { recursive: true });
fs.writeFileSync(path.join(tempRoot, ".marvin", "latest.json"), JSON.stringify({ profileName, operatorEmail: "" }, null, 2) + "\n");

const profile = {
  name: profileName,
  timezone: "America/New_York",
  syncWindowDays: 7,
  runtime: {
    deployment: {
      marvinUrl: `http://127.0.0.1:${port}`
    },
    providerConnections: {
      microsoft: {
        clientId: "ms-client",
        marvinBaseUrl: `http://127.0.0.1:${port}`,
        authorizePath: "/marvin-api/oauth/microsoft/start"
      },
      google: {
        clientId: "google-client",
        marvinBaseUrl: `http://127.0.0.1:${port}`,
        authorizePath: "/marvin-api/oauth/google/start"
      }
    }
  },
  calendars: [
    {
      id: "work",
      label: "Work",
      provider: "m365",
      email: "work@example.com",
      scope: "work",
      sourcePrefix: "WORK: ",
      connectionStatus: "connected"
    },
    {
      id: "family",
      label: "Family",
      provider: "google",
      email: "family@example.com",
      scope: "family",
      sourcePrefix: "FAM: ",
      connectionStatus: "connected"
    }
  ]
};

const tokenState = {
  records: [
    {
      calendarId: "work",
      provider: "m365",
      email: "work@example.com",
      accessToken: "ms-token",
      tokenType: "Bearer",
      expiresAt: "2099-01-01T00:00:00.000Z",
      status: "connected"
    },
    {
      calendarId: "family",
      provider: "google",
      email: "family@example.com",
      accessToken: "google-token",
      tokenType: "Bearer",
      expiresAt: "2099-01-01T00:00:00.000Z",
      status: "connected"
    }
  ]
};
const providerSecrets = { microsoftClientSecret: "ms-secret", googleClientSecret: "google-secret" };
const requests = [];
let microsoftCounter = 0;
let googleCounter = 0;
let failNextMicrosoftRenewal = false;
const fetchImpl = async (url, options = {}) => {
  const method = options.method || "GET";
  requests.push({ url: String(url), method, body: options.body || "" });

  if (String(url).includes("graph.microsoft.com/v1.0/subscriptions") && (method === "POST" || method === "PATCH")) {
    const payload = JSON.parse(options.body || "{}");
    if (method === "PATCH" && failNextMicrosoftRenewal) {
      failNextMicrosoftRenewal = false;
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "Subscription no longer exists." } })
      };
    }
    if (method === "POST") {
      microsoftCounter += 1;
    }
    return {
      ok: true,
      json: async () => ({
        id: method === "POST" ? `sub-${microsoftCounter}` : "sub-1",
        resource: payload.resource,
        notificationUrl: payload.notificationUrl,
        clientState: payload.clientState,
        changeType: payload.changeType,
        expirationDateTime: payload.expirationDateTime
      })
    };
  }

  if (String(url).includes("googleapis.com/calendar/v3/channels/stop") && method === "POST") {
    return {
      ok: true,
      status: 204,
      json: async () => ({})
    };
  }

  if (String(url).includes("googleapis.com/calendar/v3/calendars/") && String(url).includes("/events/watch") && method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    googleCounter += 1;
    return {
      ok: true,
      json: async () => ({
        kind: "api#channel",
        id: payload.id,
        resourceId: `google-resource-${googleCounter}`,
        resourceUri: `https://www.googleapis.com/calendar/v3/calendars/family@example.com/events?channel=${googleCounter}`,
        token: payload.token,
        expiration: String(Date.now() + 6 * 24 * 60 * 60 * 1000)
      })
    };
  }

  throw new Error(`Unexpected request: ${method} ${url}`);
};

const microsoftAdapter = new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange: async () => {} });
const googleAdapter = new GoogleCalendarAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange: async () => {} });
const runtime = {
  rootDir: tempRoot,
  profile,
  adapters: { microsoft: microsoftAdapter, google: googleAdapter }
};

const first = await ensureRuntimeSubscriptions(runtime);
assert.equal(first.summary.created, 2);
assert.equal(first.summary.renewed, 0);
assert.equal(first.summary.providers.microsoft.created, 1);
assert.equal(first.summary.providers.google.created, 1);
assert.equal(first.state.subscriptions.length, 2);
assert.equal(first.state.subscriptions.find((item) => item.provider === "microsoft")?.subscriptionId, "sub-1");
assert.ok(first.state.subscriptions.find((item) => item.provider === "google")?.channelId);

const second = await ensureRuntimeSubscriptions(runtime, { forceRenew: true, nowMs: Date.now() + 60000 });
assert.equal(second.summary.renewed, 2);
assert.equal(second.summary.providers.microsoft.renewed, 1);
assert.equal(second.summary.providers.google.renewed, 1);
assert.equal(requests.filter((item) => item.method === "POST" && item.url.includes("graph.microsoft.com/v1.0/subscriptions")).length, 1);
assert.equal(requests.filter((item) => item.method === "PATCH" && item.url.includes("graph.microsoft.com/v1.0/subscriptions")).length, 1);
assert.equal(requests.filter((item) => item.method === "POST" && item.url.includes("/events/watch")).length, 2);
assert.equal(requests.filter((item) => item.method === "POST" && item.url.includes("/channels/stop")).length, 1);
failNextMicrosoftRenewal = true;
const recovered = await ensureRuntimeSubscriptions(runtime, { forceRenew: true, nowMs: Date.now() + 120000 });
assert.equal(recovered.summary.providers.microsoft.renewed, 1);
assert.equal(requests.filter((item) => item.method === "POST" && item.url.includes("graph.microsoft.com/v1.0/subscriptions")).length, 2);
assert.equal(requests.filter((item) => item.method === "PATCH" && item.url.includes("graph.microsoft.com/v1.0/subscriptions")).length, 2);
const microsoftSubscription = recovered.state.subscriptions.find((item) => item.provider === "microsoft");
const microsoftSubscriptionId = microsoftSubscription?.subscriptionId;
const microsoftClientState = microsoftSubscription?.clientState;
assert.equal(microsoftSubscriptionId, "sub-2");
assert.ok(microsoftClientState);

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port)
  },
  stdio: "ignore"
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/marvin-api/bootstrap`);
      if (response.ok) {
        return;
      }
    } catch {
      // wait
    }
    await sleep(200);
  }
  throw new Error("Timed out waiting for Marvin webhook smoke server.");
}

try {
  await waitForServer();
  const validation = await fetch(`http://127.0.0.1:${port}/marvin-api/webhooks/microsoft?validationToken=marvin-proof-token`);
  assert.equal(validation.status, 200);
  assert.equal(await validation.text(), "marvin-proof-token");

  const rejectedMicrosoftNotification = await fetch(`http://127.0.0.1:${port}/marvin-api/webhooks/microsoft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: [{ subscriptionId: microsoftSubscriptionId, clientState: "wrong-client-state", changeType: "updated" }] })
  });
  const rejectedMicrosoftBody = await rejectedMicrosoftNotification.json();
  assert.equal(rejectedMicrosoftBody.received, 0);
  assert.equal(rejectedMicrosoftBody.queuedSync, false);

  const microsoftNotification = await fetch(`http://127.0.0.1:${port}/marvin-api/webhooks/microsoft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      value: [
        {
          subscriptionId: microsoftSubscriptionId,
          clientState: microsoftClientState,
          changeType: "updated",
          resource: "/users/work@example.com/events"
        }
      ]
    })
  });
  assert.equal(microsoftNotification.status, 202);
  const microsoftNotificationBody = await microsoftNotification.json();
  assert.equal(microsoftNotificationBody.received, 1);
  assert.equal(microsoftNotificationBody.queuedSync, true);
  assert.deepEqual(microsoftNotificationBody.calendarIds, ["work"]);

  const lifecycleNotification = await fetch(`http://127.0.0.1:${port}/marvin-api/webhooks/microsoft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: [{ subscriptionId: microsoftSubscriptionId, clientState: microsoftClientState, lifecycleEvent: "subscriptionRemoved" }] })
  });
  assert.equal(lifecycleNotification.status, 202);
  const lifecycleNotificationBody = await lifecycleNotification.json();
  assert.equal(lifecycleNotificationBody.received, 1);

  const googleNotification = await fetch(`http://127.0.0.1:${port}/marvin-api/webhooks/google`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Channel-ID": "marvin-family-channel",
      "X-Goog-Channel-Token": "marvin-google-state",
      "X-Goog-Resource-ID": "google-resource-3",
      "X-Goog-Resource-URI": "https://www.googleapis.com/calendar/v3/calendars/family@example.com/events",
      "X-Goog-Resource-State": "exists",
      "X-Goog-Message-Number": "7"
    },
    body: JSON.stringify({ changed: "events" })
  });
  assert.equal(googleNotification.status, 202);
  const googleNotificationBody = await googleNotification.json();
  assert.equal(googleNotificationBody.received, 1);
  assert.equal(googleNotificationBody.queuedSync, true);
  assert.deepEqual(googleNotificationBody.calendarIds, ["family"]);

  const persisted = JSON.parse(fs.readFileSync(buildSubscriptionStatePath(tempRoot, profileName), "utf8"));
  assert.equal(persisted.subscriptions.length, 2);
  assert.equal(persisted.webhooks.microsoft.validationRequests, 1);
  assert.equal(persisted.webhooks.microsoft.notificationsReceived, 2);
  assert.equal(persisted.webhooks.microsoft.lastValidationTokenHash.length, 64);
  assert.equal(JSON.stringify(persisted).includes("marvin-proof-token"), false);
  assert.equal(persisted.webhooks.microsoft.notificationsRejected, 1);
  assert.equal(persisted.webhooks.microsoft.lastNotificationSample.subscriptionId, microsoftSubscriptionId);
  assert.deepEqual(persisted.webhooks.microsoft.lastLifecycleEvents, ["subscriptionRemoved"]);
  assert.equal(persisted.subscriptions.find((item) => item.provider === "microsoft")?.status, "error");
  assert.equal(persisted.webhooks.google.notificationsReceived, 1);
  assert.equal(persisted.webhooks.google.lastNotificationHeaders.channelId, "marvin-family-channel");
  assert.equal(persisted.webhooks.google.lastNotificationHeaders.resourceState, "exists");
  assert.equal(persisted.webhooks.google.lastNotificationBody.changed, "events");
  assert.equal(persisted.automation.pendingSyncRequested, true);
  assert.equal(persisted.automation.lastRequestedByProvider, "google");
  assert.deepEqual(persisted.automation.lastRequestedByCalendarIds.sort(), ["family", "work"]);
  assert.equal(persisted.automation.requestCount, 3);

  console.log(JSON.stringify({
    ok: true,
    created: first.summary.created,
    renewed: second.summary.renewed,
    microsoftCreated: first.summary.providers.microsoft.created,
    googleCreated: first.summary.providers.google.created,
    webhookValidationRequests: persisted.webhooks.microsoft.validationRequests,
    microsoftWebhookNotificationsReceived: persisted.webhooks.microsoft.notificationsReceived,
    googleWebhookNotificationsReceived: persisted.webhooks.google.notificationsReceived,
    pendingWebhookSyncRequested: persisted.automation.pendingSyncRequested,
    queuedWebhookProvider: persisted.automation.lastRequestedByProvider,
    queuedWebhookCalendarIds: persisted.automation.lastRequestedByCalendarIds,
    subscriptionStatePath: buildSubscriptionStatePath(tempRoot, profileName)
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
