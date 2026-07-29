import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
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
    }
  ]
};
const providerSecrets = { microsoftClientSecret: "ms-secret" };
const requests = [];
let subscriptionCounter = 0;
const fetchImpl = async (url, options = {}) => {
  requests.push({ url: String(url), method: options.method || "GET", body: options.body || "" });
  if (String(url).includes("graph.microsoft.com/v1.0/subscriptions") && (options.method === "POST" || options.method === "PATCH")) {
    const payload = JSON.parse(options.body || "{}");
    if (options.method === "POST") {
      subscriptionCounter += 1;
    }
    return {
      ok: true,
      json: async () => ({
        id: options.method === "POST" ? `sub-${subscriptionCounter}` : "sub-1",
        resource: payload.resource,
        notificationUrl: payload.notificationUrl,
        clientState: payload.clientState,
        changeType: payload.changeType,
        expirationDateTime: payload.expirationDateTime
      })
    };
  }
  throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
};

const adapter = new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange: async () => {} });
const runtime = {
  rootDir: tempRoot,
  profile,
  adapters: { microsoft: adapter }
};

const first = await ensureRuntimeSubscriptions(runtime);
assert.equal(first.summary.created, 1);
assert.equal(first.summary.renewed, 0);
assert.equal(first.state.subscriptions.length, 1);
assert.equal(first.state.subscriptions[0].subscriptionId, "sub-1");

const second = await ensureRuntimeSubscriptions(runtime, { forceRenew: true, nowMs: Date.now() + 60000 });
assert.equal(second.summary.renewed, 1);
assert.equal(second.state.subscriptions[0].subscriptionId, "sub-1");
assert.equal(requests.filter((item) => item.method === "POST").length, 1);
assert.equal(requests.filter((item) => item.method === "PATCH").length, 1);

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

  const notification = await fetch(`http://127.0.0.1:${port}/marvin-api/webhooks/microsoft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      value: [
        {
          subscriptionId: "sub-1",
          changeType: "updated",
          resource: "/users/work@example.com/events"
        }
      ]
    })
  });
  assert.equal(notification.status, 202);
  const notificationBody = await notification.json();
  assert.equal(notificationBody.received, 1);

  const persisted = JSON.parse(fs.readFileSync(buildSubscriptionStatePath(tempRoot, profileName), "utf8"));
  assert.equal(persisted.subscriptions.length, 1);
  assert.equal(persisted.webhooks.microsoft.validationRequests, 1);
  assert.equal(persisted.webhooks.microsoft.notificationsReceived, 1);
  assert.equal(persisted.webhooks.microsoft.lastValidationToken, "marvin-proof-token");
  assert.equal(persisted.webhooks.microsoft.lastNotificationSample.subscriptionId, "sub-1");

  console.log(JSON.stringify({
    ok: true,
    created: first.summary.created,
    renewed: second.summary.renewed,
    webhookValidationRequests: persisted.webhooks.microsoft.validationRequests,
    webhookNotificationsReceived: persisted.webhooks.microsoft.notificationsReceived,
    subscriptionStatePath: buildSubscriptionStatePath(tempRoot, profileName)
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}