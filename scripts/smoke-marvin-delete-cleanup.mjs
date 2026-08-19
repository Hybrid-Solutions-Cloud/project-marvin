import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";
import { SyncEngine } from "../solutions/marvin-engine/src/core/sync-engine.mjs";
import { FileMapStore } from "../solutions/marvin-engine/src/storage/file-map-store.mjs";
import { FileTokenStore, buildTokenStorePath } from "../solutions/marvin-engine/src/storage/file-token-store.mjs";

const tempRoot = path.resolve("C:/tmp/marvin-delete-cleanup-smoke");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const profile = {
  name: "marvin-delete-cleanup-smoke",
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
    { id: "apple", label: "Apple", provider: "apple-caldav", email: "apple@example.com", scope: "personal", sourcePrefix: "APPLE: ", connectionStatus: "connected", caldavServerUrl: "http://127.0.0.1:9997/calendars/apple", caldavUsername: "apple@example.com" }
  ],
  routes: []
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
  requests.push({ url, method: options.method || "GET" });
  if (String(url).includes("graph.microsoft.com") && String(url).includes("/events/") && String(url).includes("$select=id,subject,categories,body,bodyPreview") && (!options.method || options.method === "GET")) {
    return {
      ok: true,
      status: 200,
      json: async () => String(url).includes("not-marvin")
        ? ({ id: "not-marvin", subject: "Original appointment", categories: [] })
        : ({ id: "ms-stale-1", subject: "FAMILY: Old family event", categories: ["[Project Marvin Mirror]"] })
    };
  }
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
            id: "stale-work-google",
            "@removed": { reason: "deleted" }
          },
          {
            id: "stale-work-apple",
            "@removed": { reason: "deleted" }
          }
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=work-cursor"
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
  if (String(url).includes("127.0.0.1:9997") && (options.method || "GET") === "REPORT") {
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
  if (String(url).includes("graph.microsoft.com") && (options.method === "POST" || options.method === "PATCH")) {
    return { ok: true, status: options.method === "POST" ? 201 : 204, json: async () => ({ id: "ms-mirror" }) };
  }
  if (String(url).includes("googleapis.com") && (options.method === "POST" || options.method === "PUT")) {
    return { ok: true, status: options.method === "POST" ? 201 : 200, json: async () => ({ id: "google-mirror" }) };
  }
  if (String(url).includes("127.0.0.1:9997") && options.method === "PUT") {
    return { ok: true, status: 201, text: async () => "created" };
  }  if (String(url).includes("graph.microsoft.com") && options.method === "DELETE") {
    return { ok: true, status: 204, json: async () => ({}) };
  }
  if (String(url).includes("googleapis.com") && options.method === "DELETE") {
    return { ok: true, status: 204, json: async () => ({}) };
  }
  if (String(url).includes("127.0.0.1:9997") && options.method === "DELETE") {
    return { ok: true, status: 204, text: async () => "deleted" };
  }
  throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
};

const onTokenStateChange = async (nextState) => tokenStore.save(nextState);
const adapters = {
  microsoft: new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
  google: new GoogleCalendarAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
  caldav: new CalDavAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange })
};
adapters.google.listSourceEventChanges = async (calendar) => ({
  events: [{
    id: "google-event-1",
    calendarId: calendar.id,
    subject: "Family dinner",
    start: "2026-07-29T18:00:00-04:00",
    end: "2026-07-29T19:00:00-04:00",
    timezone: "America/New_York",
    location: "Home",
    description: "Dinner",
    status: "confirmed",
    sourceProvider: "google"
  }],
  deletedEventIds: ["stale-family-ms"],
  deltaLink: "google-cursor"
});

const store = new FileMapStore(path.join(tempRoot, "mappings.json"));
store.save({
  mappings: [
    {
      sourceCalendarId: "work",
      sourceEventId: "stale-work-google",
      targetCalendarId: "family",
      targetEventId: "google-stale-1",
      sourceSubject: "Old work event",
      mirrorMode: "full",
      visibility: "default",
      subjectPrefix: "WORK: ",
      sourceEventTimezone: "America/New_York",
      managedBy: "project-marvin",
      updatedAt: "2026-07-29T00:00:00.000Z"
    },
    {
      sourceCalendarId: "family",
      sourceEventId: "stale-family-ms",
      targetCalendarId: "work",
      targetEventId: "ms-stale-1",
      sourceSubject: "Old family event",
      mirrorMode: "subject",
      visibility: "private",
      subjectPrefix: "FAMILY: ",
      sourceEventTimezone: "America/New_York",
      managedBy: "project-marvin",
      updatedAt: "2026-07-29T00:00:00.000Z"
    },
    {
      sourceCalendarId: "work",
      sourceEventId: "stale-work-apple",
      targetCalendarId: "apple",
      targetEventId: "apple-stale-1.ics",
      sourceSubject: "Old Apple mirror",
      mirrorMode: "subject",
      visibility: "private",
      subjectPrefix: "WORK: ",
      sourceEventTimezone: "America/New_York",
      managedBy: "project-marvin",
      updatedAt: "2026-07-29T00:00:00.000Z"
    }
  ]
});

const engine = new SyncEngine({ profile, store, adapters, sourceEvents: [] });
const sourceLoad = await engine.loadSourceEventsFromProviders({ windowDays: 2 });
assert.equal(sourceLoad.loaded, 3);
assert.deepEqual(new Set(sourceLoad.loadedCalendarIds), new Set(["work", "family", "apple"]));
assert.deepEqual(new Set(sourceLoad.deletedSourceEventKeys), new Set(["work::stale-work-google", "work::stale-work-apple", "family::stale-family-ms"]));
assert.equal(store.load().changeTracking, undefined);

const originalDeleteMode = process.env.MARVIN_PROVIDER_DELETE_MODE;
delete process.env.MARVIN_PROVIDER_DELETE_MODE;
const safeResult = await engine.applyLiveSync();
assert.equal(safeResult.attempted, 9);
assert.equal(safeResult.succeeded, 6);
assert.equal(safeResult.failed, 0);
assert.equal(safeResult.skipped, 3);
assert.equal(safeResult.cleanup.attempted, 3);
assert.equal(safeResult.cleanup.succeeded, 0);
assert.equal(safeResult.cleanup.skipped, 3);
assert.equal(safeResult.mappings.length, 9);
assert.equal(requests.some((item) => item.method === "DELETE"), false);
assert.equal(store.load().changeTracking.work.deltaLink.includes("work-cursor"), true);
assert.equal(store.load().changeTracking.family.deltaLink, "google-cursor");
assert.deepEqual(new Set(store.load().pendingTombstones), new Set(sourceLoad.deletedSourceEventKeys));
const writesAfterSafeRun = requests.filter((item) => ["POST", "PATCH", "PUT"].includes(item.method)).length;

process.env.MARVIN_PROVIDER_DELETE_MODE = "managed-mirrors-only";
const liveResult = await engine.applyLiveSync();
if (originalDeleteMode === undefined) delete process.env.MARVIN_PROVIDER_DELETE_MODE;
else process.env.MARVIN_PROVIDER_DELETE_MODE = originalDeleteMode;
assert.equal(liveResult.attempted, 9);
assert.equal(liveResult.succeeded, 9);
assert.equal(liveResult.failed, 0);
assert.equal(liveResult.skipped, 0);
assert.equal(liveResult.cleanup.attempted, 3);
assert.equal(liveResult.cleanup.succeeded, 3);
assert.equal(liveResult.mappings.length, 6);
assert.equal(requests.filter((item) => ["POST", "PATCH", "PUT"].includes(item.method)).length, writesAfterSafeRun);
assert.ok(requests.some((item) => item.url.includes("googleapis.com") && item.method === "DELETE"));
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "DELETE"));
assert.ok(requests.some((item) => item.url.includes("127.0.0.1:9997") && item.method === "DELETE"));

process.env.MARVIN_PROVIDER_DELETE_MODE = "managed-mirrors-only";
await assert.rejects(
  adapters.microsoft.deleteEvent(profile.calendars[0], "not-marvin"),
  /does not contain a Marvin ownership marker/
);
if (originalDeleteMode === undefined) delete process.env.MARVIN_PROVIDER_DELETE_MODE;
else process.env.MARVIN_PROVIDER_DELETE_MODE = originalDeleteMode;
assert.equal(requests.some((item) => item.url.includes("not-marvin") && item.method === "DELETE"), false);

console.log(JSON.stringify({
  ok: true,
  loaded: sourceLoad.loaded,
  loadedCalendarIds: sourceLoad.loadedCalendarIds,
  cleanup: {
    defaultModeSkipped: safeResult.cleanup.skipped,
    attempted: liveResult.cleanup.attempted,
    succeeded: liveResult.cleanup.succeeded,
    failed: liveResult.cleanup.failed,
    skipped: liveResult.cleanup.skipped
  },
  ownershipMarkerGuard: true,
  requests: requests.filter((item) => item.method === "DELETE")
}, null, 2));
