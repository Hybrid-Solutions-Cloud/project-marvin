import assert from "node:assert/strict";
import { assessProfileConnections } from "../solutions/marvin-engine/src/util/provider-connections.mjs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { SyncEngine } from "../solutions/marvin-engine/src/core/sync-engine.mjs";

const profile = {
  name: "marvin-outlook-smoke",
  timezone: "America/New_York",
  syncWindowDays: 7,
  runtime: {
    deployment: { marvinUrl: "http://127.0.0.1:4177" },
    providerConnections: {
      microsoft: { authMode: "marvin-engine", clientId: "ms-client", marvinBaseUrl: "http://127.0.0.1:4177", authorizePath: "/marvin-api/oauth/microsoft/start" },
      google: { authMode: "marvin-engine", clientId: "google-client", marvinBaseUrl: "http://127.0.0.1:4177", authorizePath: "/marvin-api/oauth/google/start" }
    }
  },
  privacyDefaults: {
    mirrorMode: "subject",
    visibility: "private",
    subjectPrefix: "SRC: ",
    copyLocation: false,
    copyDescription: false,
    preserveOriginalTimezone: true
  },
  calendars: [
    { id: "work_outlook", label: "Work Outlook", provider: "outlook", email: "work@example.com", scope: "work", sourcePrefix: "WORK: ", connectionStatus: "connected" },
    { id: "family_google", label: "Family Google", provider: "google", email: "family@example.com", scope: "family", sourcePrefix: "FAMILY: ", connectionStatus: "connected" }
  ],
  routes: [
    { source: "work_outlook", targets: [{ calendarId: "family_google", visibility: "default", detailMode: "full", subjectPrefix: "WORK: ", copyLocation: true, copyDescription: true }] },
    { source: "family_google", targets: [{ calendarId: "work_outlook", visibility: "private", detailMode: "subject", subjectPrefix: "FAMILY: ", copyLocation: false, copyDescription: false }] }
  ]
};

const connectionAssessment = assessProfileConnections(profile);
const outlookConnection = connectionAssessment.calendars.find((calendar) => calendar.calendarId === "work_outlook");
assert.ok(outlookConnection, "Expected Outlook calendar connection assessment.");
assert.equal(outlookConnection.provider, "outlook");
assert.equal(outlookConnection.connectorReady, true);
assert.equal(outlookConnection.authUrl, "http://127.0.0.1:4177/marvin-api/oauth/microsoft/start");

const tokenState = {
  records: [
    { calendarId: "work_outlook", provider: "outlook", email: "work@example.com", accessToken: "ms-token", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z", status: "connected" },
    { calendarId: "family_google", provider: "google", email: "family@example.com", accessToken: "google-token", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z", status: "connected" }
  ]
};

const providerSecrets = {
  microsoftClientSecret: "ms-secret",
  googleClientSecret: "google-secret"
};

const requests = [];
const fetchImpl = async (url, options = {}) => {
  requests.push({ url, method: options.method || "GET" });
  if (String(url).includes("graph.microsoft.com") && (!options.method || options.method === "GET")) {
    return {
      ok: true,
      json: async () => ({
        value: [
          {
            id: "outlook-event-1",
            subject: "Outlook planning",
            start: { dateTime: "2026-07-29T14:00:00", timeZone: "UTC" },
            end: { dateTime: "2026-07-29T15:00:00", timeZone: "UTC" },
            originalStartTimeZone: "America/New_York",
            location: { displayName: "Teams" },
            bodyPreview: "Planning meeting",
            showAs: "busy"
          }
        ]
      })
    };
  }
  if (String(url).includes("googleapis.com") && (!options.method || options.method === "GET")) {
    return {
      ok: true,
      json: async () => ({
        items: [
          {
            id: "google-event-1",
            summary: "Family dinner",
            start: { dateTime: "2026-07-29T18:00:00-04:00", timeZone: "America/New_York" },
            end: { dateTime: "2026-07-29T19:00:00-04:00", timeZone: "America/New_York" },
            location: "Home",
            description: "Dinner",
            status: "confirmed"
          }
        ]
      })
    };
  }
  if (String(url).includes("graph.microsoft.com") && options.method === "POST") {
    return { ok: true, json: async () => ({ id: "ms-created-1" }) };
  }
  if (String(url).includes("googleapis.com") && options.method === "POST") {
    return { ok: true, json: async () => ({ id: "google-created-1" }) };
  }
  throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
};

const onTokenStateChange = async () => {};
const microsoftAdapter = new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange });
const googleAdapter = new GoogleCalendarAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange });

assert.equal(microsoftAdapter.describe().status, "token-ready");

const engine = new SyncEngine({
  profile,
  store: { load: () => ({ mappings: [] }), save: () => {}, filePath: "memory" },
  adapters: {
    microsoft: microsoftAdapter,
    google: googleAdapter,
    caldav: { describe: () => ({ provider: "apple-caldav", status: "credential-missing" }), planWrite: () => ({ adapter: "caldav" }) }
  },
  sourceEvents: []
});

const sourceLoad = await engine.loadSourceEventsFromProviders({ windowDays: 2 });
assert.equal(sourceLoad.loaded, 2);
assert.equal(sourceLoad.errors.length, 0);

const liveResult = await engine.applyLiveSync();
assert.equal(liveResult.failed, 0);
assert.equal(liveResult.succeeded, 2);
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "GET"));
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "POST"));
assert.ok(requests.some((item) => item.url.includes("googleapis.com") && item.method === "GET"));
assert.ok(requests.some((item) => item.url.includes("googleapis.com") && item.method === "POST"));

console.log(JSON.stringify({
  ok: true,
  connectorReady: outlookConnection.connectorReady,
  authUrl: outlookConnection.authUrl,
  adapterStatus: microsoftAdapter.describe().status,
  loaded: sourceLoad.loaded,
  succeeded: liveResult.succeeded
}, null, 2));
