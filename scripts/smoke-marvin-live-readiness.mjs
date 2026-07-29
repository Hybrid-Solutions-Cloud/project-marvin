import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { SyncEngine } from "../solutions/marvin-engine/src/core/sync-engine.mjs";
import { FileMapStore } from "../solutions/marvin-engine/src/storage/file-map-store.mjs";
import { FileTokenStore, buildTokenStorePath } from "../solutions/marvin-engine/src/storage/file-token-store.mjs";

const tempRoot = path.resolve(`C:/tmp/marvin-live-readiness-${Date.now()}`);
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const profile = {
  name: "marvin-live-readiness",
  timezone: "America/New_York",
  syncWindowDays: 7,
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
    { id: "apple", label: "Apple", provider: "apple-caldav", email: "apple@example.com", scope: "personal", sourcePrefix: "APPLE: ", connectionStatus: "connected", caldavServerUrl: "http://127.0.0.1:9999/calendars/apple", caldavUsername: "apple@example.com" }
  ],
  routes: [
    { source: "work", targets: [{ calendarId: "family", visibility: "default", detailMode: "full", subjectPrefix: "WORK: ", copyLocation: true, copyDescription: true }, { calendarId: "apple", visibility: "private", detailMode: "subject", subjectPrefix: "WORK: " }] },
    { source: "family", targets: [{ calendarId: "work", visibility: "private", detailMode: "subject", subjectPrefix: "FAMILY: " }, { calendarId: "apple", visibility: "private", detailMode: "subject", subjectPrefix: "FAMILY: " }] },
    { source: "apple", targets: [{ calendarId: "work", visibility: "private", detailMode: "subject", subjectPrefix: "APPLE: " }, { calendarId: "family", visibility: "default", detailMode: "full", subjectPrefix: "APPLE: ", copyLocation: true, copyDescription: true }] }
  ]
};

const tokenStore = new FileTokenStore(buildTokenStorePath(tempRoot, profile.name));
tokenStore.save({
  records: [
    { calendarId: "work", provider: "m365", email: "work@example.com", accessToken: "token", refreshToken: "refresh", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z", status: "connected" }
  ]
});

const requests = [];
const fetchImpl = async (url, options = {}) => {
  const method = options.method || "GET";
  requests.push({ url: String(url), method, body: String(options.body || "") });

  if (String(url).includes("graph.microsoft.com") && method === "GET") {
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
          }
        ]
      })
    };
  }

  if (String(url).includes("127.0.0.1:9999") && method === "REPORT") {
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
</d:multistatus>`
    };
  }

  if (String(url).includes("graph.microsoft.com") && method === "POST") {
    return {
      ok: true,
      json: async () => ({ id: "ms-created-1" })
    };
  }

  if (String(url).includes("127.0.0.1:9999") && method === "PUT") {
    return {
      ok: true,
      status: 201,
      text: async () => "created"
    };
  }

  if (String(url).includes("graph.microsoft.com") && method === "DELETE") {
    return {
      ok: true,
      status: 204,
      text: async () => ""
    };
  }

  throw new Error(`Unexpected request: ${method} ${url}`);
};

const adapterBase = { profile, tokenState: tokenStore.load(), providerSecrets: { caldavPasswords: { apple: "apple-secret" } }, fetchImpl, onTokenStateChange: async () => {} };
const { MicrosoftGraphAdapter } = await import("../solutions/marvin-engine/src/adapters/microsoft-graph.mjs");
const { GoogleCalendarAdapter } = await import("../solutions/marvin-engine/src/adapters/google-calendar.mjs");
const { CalDavAdapter } = await import("../solutions/marvin-engine/src/adapters/caldav.mjs");

const adapters = {
  microsoft: new MicrosoftGraphAdapter({ ...adapterBase, providerSecrets: { microsoftClientSecret: "ms-secret" } }),
  google: new GoogleCalendarAdapter({ ...adapterBase, providerSecrets: { googleClientSecret: "google-secret" } }),
  caldav: new CalDavAdapter({ ...adapterBase, providerSecrets: { caldavPasswords: { apple: "apple-secret" } } })
};

const store = new FileMapStore(path.join(tempRoot, "mappings.json"));
store.save({
  mappings: [
    {
      sourceCalendarId: "work",
      sourceEventId: "stale-work-event",
      targetCalendarId: "family",
      targetEventId: "google-stale-1",
      sourceSubject: "Old review",
      mirrorMode: "full",
      visibility: "default",
      subjectPrefix: "WORK: ",
      sourceEventTimezone: "America/New_York",
      updatedAt: "2026-07-29T00:00:00.000Z"
    }
  ]
});

const engine = new SyncEngine({ profile, store, adapters, sourceEvents: [] });
const sourceLoad = await engine.loadSourceEventsFromProviders({ windowDays: 2 });
assert.equal(sourceLoad.loaded, 2);
assert.equal(engine.sourceEvents.length, 2);
assert.deepEqual(engine.sourceEvents.map((event) => event.calendarId).sort(), ["apple", "work"]);
assert.ok(!requests.some((item) => item.url.includes("googleapis.com") && item.method === "GET"));

const liveResult = await engine.applyLiveSync();
assert.equal(liveResult.failed, 0);
assert.equal(liveResult.succeeded, 2);
assert.equal(liveResult.skipped, 3);
assert.ok(liveResult.results.some((item) => item.status === "skipped" && /Family/.test(item.message || "") && /validated auth material/i.test(item.message || "")));
assert.ok(liveResult.results.some((item) => item.status === "skipped" && /stale mirror cleanup/i.test(item.message || "")));
assert.ok(!requests.some((item) => item.url.includes("googleapis.com") && (item.method === "GET" || item.method === "POST" || item.method === "PUT" || item.method === "PATCH" || item.method === "DELETE")));
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "GET"));
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "POST"));
assert.ok(requests.some((item) => item.url.includes("127.0.0.1:9999") && item.method === "REPORT"));
assert.ok(requests.some((item) => item.url.includes("127.0.0.1:9999") && item.method === "PUT"));
assert.ok(!requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "DELETE"));
assert.deepEqual(liveResult.mappings.map((item) => `${item.sourceCalendarId}->${item.targetCalendarId}`).sort(), ["apple->work", "work->apple", "work->family"]);

console.log(JSON.stringify({
  ok: true,
  loadedCalendars: sourceLoad.loadedCalendarIds.sort(),
  loadedEvents: sourceLoad.loaded,
  succeeded: liveResult.succeeded,
  skipped: liveResult.skipped,
  mappingPairs: liveResult.mappings.map((item) => `${item.sourceCalendarId}->${item.targetCalendarId}`).sort()
}, null, 2));
