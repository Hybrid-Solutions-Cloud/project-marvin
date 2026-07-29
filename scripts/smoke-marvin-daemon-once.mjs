import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";
import { SyncEngine } from "../solutions/marvin-engine/src/core/sync-engine.mjs";
import { startMarvinDaemon } from "../solutions/marvin-engine/src/daemon.mjs";
import { MARVIN_MIRROR_MARKER } from "../solutions/marvin-engine/src/core/policy.mjs";
import { FileMapStore } from "../solutions/marvin-engine/src/storage/file-map-store.mjs";
import { FileTokenStore, buildTokenStorePath } from "../solutions/marvin-engine/src/storage/file-token-store.mjs";
import { createRuntimeStatusStore, buildRuntimeStatusPath } from "../solutions/marvin-engine/src/util/runtime-status.mjs";

const tempRoot = path.resolve("C:/tmp/marvin-daemon-smoke");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const profile = {
  name: "marvin-daemon-smoke",
  timezone: "America/New_York",
  syncWindowDays: 7,
  runtime: {
    providerConnections: {
      microsoft: { clientId: "ms-client", tenantMode: "multi-tenant" },
      google: { clientId: "google-client" },
      caldav: { authMode: "manual-caldav" }
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
    { id: "work", label: "Work", provider: "m365", email: "work@example.com", scope: "work", sourcePrefix: "WORK: ", connectionStatus: "connected" },
    { id: "family", label: "Family", provider: "google", email: "family@example.com", scope: "family", sourcePrefix: "FAMILY: ", connectionStatus: "connected" },
    { id: "apple", label: "Apple", provider: "apple-caldav", email: "apple@example.com", scope: "personal", sourcePrefix: "APPLE: ", connectionStatus: "connected", caldavServerUrl: "http://127.0.0.1:9998/calendars/apple", caldavUsername: "apple@example.com" }
  ],
  routes: [
    { source: "work", targets: [{ calendarId: "family", visibility: "default", detailMode: "full", subjectPrefix: "WORK: ", copyLocation: true, copyDescription: true }, { calendarId: "apple", visibility: "private", detailMode: "subject", subjectPrefix: "WORK: " }] },
    { source: "family", targets: [{ calendarId: "work", visibility: "private", detailMode: "subject", subjectPrefix: "FAMILY: ", copyLocation: false, copyDescription: false }, { calendarId: "apple", visibility: "private", detailMode: "subject", subjectPrefix: "FAMILY: " }] },
    { source: "apple", targets: [{ calendarId: "work", visibility: "private", detailMode: "subject", subjectPrefix: "APPLE: ", copyLocation: false, copyDescription: false }, { calendarId: "family", visibility: "default", detailMode: "full", subjectPrefix: "APPLE: ", copyLocation: true, copyDescription: true }] }
  ]
};

const tokenStore = new FileTokenStore(buildTokenStorePath(tempRoot, profile.name));
const tokenState = {
  records: [
    { calendarId: "work", provider: "m365", email: "work@example.com", accessToken: "ms-token", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z", status: "connected" },
    { calendarId: "family", provider: "google", email: "family@example.com", accessToken: "google-token", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z", status: "connected" }
  ]
};
tokenStore.save(tokenState);

const providerSecrets = {
  microsoftClientSecret: "ms-secret",
  googleClientSecret: "google-secret",
  caldavPasswords: { apple: "apple-secret" }
};

const requests = [];
const fetchImpl = async (url, options = {}) => {
  requests.push({ url, method: options.method || "GET", body: options.body || "" });
  if (String(url).includes("graph.microsoft.com") && (!options.method || options.method === "GET")) {
    return {
      ok: true,
      json: async () => ({
        value: [
          {
            id: "ms-event-1",
            subject: "Quarterly review",
            start: { dateTime: "2026-07-29T14:00:00", timeZone: "UTC" },
            end: { dateTime: "2026-07-29T15:00:00", timeZone: "UTC" },
            originalStartTimeZone: "America/New_York",
            location: { displayName: "Teams" },
            bodyPreview: "Review meeting",
            showAs: "busy"
          },
          {
            id: "ms-mirror-apple-1",
            subject: "APPLE: Doctor visit",
            start: { dateTime: "2026-07-29T20:00:00", timeZone: "UTC" },
            end: { dateTime: "2026-07-29T21:00:00", timeZone: "UTC" },
            originalStartTimeZone: "America/New_York",
            location: { displayName: "Clinic" },
            bodyPreview: MARVIN_MIRROR_MARKER,
            body: { contentType: "text", content: `${MARVIN_MIRROR_MARKER}\nSource Event: apple-event-1` },
            categories: [MARVIN_MIRROR_MARKER],
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
          },
          {
            id: "google-mirror-work-1",
            summary: "WORK: Quarterly review",
            start: { dateTime: "2026-07-29T14:00:00-04:00", timeZone: "America/New_York" },
            end: { dateTime: "2026-07-29T15:00:00-04:00", timeZone: "America/New_York" },
            location: "Teams",
            description: `${MARVIN_MIRROR_MARKER}\nSource Event: ms-event-1`,
            status: "confirmed",
            extendedProperties: {
              private: {
                projectMarvinManaged: "true",
                projectMarvinSourceCalendarId: "work",
                projectMarvinSourceEventId: "ms-event-1"
              }
            }
          }
        ]
      })
    };
  }
  if (String(url).includes("127.0.0.1:9998") && (options.method || "GET") === "REPORT") {
    return {
      ok: true,
      status: 207,
      text: async () => `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/calendars/apple/apple-event-1.ics</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:apple-event-1
SUMMARY:Doctor visit
DTSTART:20260729T200000Z
DTEND:20260729T210000Z
DESCRIPTION:Annual checkup
LOCATION:Clinic
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/calendars/apple/work-evt-123.ics</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:work-evt-123@project-marvin
SUMMARY:WORK: Quarterly review
DTSTART:20260729T140000Z
DTEND:20260729T150000Z
DESCRIPTION:${MARVIN_MIRROR_MARKER}\nSource Event: ms-event-1
X-PROJECT-MARVIN-MANAGED:TRUE
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`
    };
  }
  if (String(url).includes("graph.microsoft.com") && options.method === "POST") {
    return { ok: true, json: async () => ({ id: "ms-created-1" }) };
  }
  if (String(url).includes("googleapis.com") && options.method === "POST") {
    return { ok: true, json: async () => ({ id: "google-created-1" }) };
  }
  if (String(url).includes("127.0.0.1:9998") && options.method === "PUT") {
    return { ok: true, status: 201, text: async () => "created" };
  }
  throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
};

const onTokenStateChange = async (nextState) => tokenStore.save(nextState);
const adapters = {
  microsoft: new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
  google: new GoogleCalendarAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
  caldav: new CalDavAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange })
};
const engine = new SyncEngine({
  profile,
  store: new FileMapStore(path.join(tempRoot, "mappings.json")),
  adapters,
  sourceEvents: []
});
const runtime = {
  rootDir: tempRoot,
  profile,
  connections: {},
  tokenStore,
  tokenState,
  providerSecrets,
  store: engine.store,
  adapters,
  engine
};
const statusStore = createRuntimeStatusStore(tempRoot, profile.name);

const result = await startMarvinDaemon({ rootDir: tempRoot, runtime, statusStore, once: true, intervalSeconds: 1, windowDays: 2, profilePath: "profiles/marvin.example.json" });
const runtimeStatus = JSON.parse(readFileSync(buildRuntimeStatusPath(tempRoot, profile.name), "utf8"));
assert.equal(result.success, true);
assert.equal(runtimeStatus.running, false);
assert.equal(runtimeStatus.runCount, 1);
assert.equal(runtimeStatus.lastResult?.sourceLoad?.loaded, 3);
assert.equal(runtimeStatus.lastResult?.sourceLoad?.skippedMirrors, 3);
assert.equal(runtimeStatus.lastResult?.applyResult?.succeeded, 6);
assert.equal(runtimeStatus.lastResult?.applyResult?.failed, 0);
assert.equal(runtimeStatus.lastResult?.adapterStatus?.caldav?.status, "credential-ready");
assert.ok(Array.isArray(runtimeStatus.recentRuns) && runtimeStatus.recentRuns.length === 1);
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "POST"));
assert.ok(requests.some((item) => item.url.includes("googleapis.com") && item.method === "POST"));
assert.ok(requests.some((item) => item.url.includes("127.0.0.1:9998") && item.method === "REPORT"));
assert.ok(requests.some((item) => item.url.includes("127.0.0.1:9998") && item.method === "PUT"));

console.log(JSON.stringify({
  ok: true,
  runCount: runtimeStatus.runCount,
  adapterStatus: runtimeStatus.lastResult?.adapterStatus,
  lastResult: {
    loaded: runtimeStatus.lastResult?.sourceLoad?.loaded,
    skippedMirrors: runtimeStatus.lastResult?.sourceLoad?.skippedMirrors,
    succeeded: runtimeStatus.lastResult?.applyResult?.succeeded,
    failed: runtimeStatus.lastResult?.applyResult?.failed
  },
  statusPath: buildRuntimeStatusPath(tempRoot, profile.name)
}, null, 2));

