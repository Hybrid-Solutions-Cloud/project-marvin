import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { SyncEngine } from "../solutions/marvin-engine/src/core/sync-engine.mjs";
import { FileMapStore } from "../solutions/marvin-engine/src/storage/file-map-store.mjs";

const profile = {
  name: "marvin-microsoft-sync-smoke",
  timezone: "America/New_York",
  runtime: { providerConnections: { microsoft: { clientId: "client-id", tenantMode: "multi-tenant" } } }
};
const calendar = {
  id: "work",
  label: "Work",
  provider: "m365",
  providerCalendarId: "calendar-immutable-id",
  email: "work@example.com",
  connectionStatus: "connected"
};
const tokenState = {
  records: [{
    calendarId: "work",
    provider: "m365",
    email: "work@example.com",
    accessToken: "access-token",
    tokenType: "Bearer",
    expiresAt: "2099-01-01T00:00:00.000Z",
    status: "connected"
  }]
};

const requests = [];
let deltaAttempts = 0;
let initialDeltaAttempts = 0;
const fetchImpl = async (url, options = {}) => {
  const request = { url: String(url), method: options.method || "GET", headers: options.headers || {}, body: options.body || "" };
  requests.push(request);

  if (request.url.includes("/calendarView/delta")) {
    deltaAttempts += 1;
    if (request.url.includes("$deltatoken=stale-cursor")) {
      return {
        ok: false,
        status: 410,
        headers: { get: () => null },
        json: async () => ({ error: { message: "Delta token is no longer valid." } })
      };
    }
    initialDeltaAttempts += 1;
    if (initialDeltaAttempts === 1) {
      return {
        ok: false,
        status: 429,
        headers: { get: (name) => String(name).toLowerCase() === "retry-after" ? "0.001" : null },
        json: async () => ({ error: { message: "throttled" } })
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        value: [
          {
            id: "series-master-immutable",
            iCalUId: "ical-series",
            type: "seriesMaster",
            changeKey: "change-1",
            lastModifiedDateTime: "2026-08-18T12:00:00Z",
            subject: "Weekly planning",
            start: { dateTime: "2026-08-20T09:00:00", timeZone: "America/New_York" },
            end: { dateTime: "2026-08-20T10:00:00", timeZone: "America/New_York" },
            originalStartTimeZone: "America/New_York",
            originalEndTimeZone: "America/New_York",
            showAs: "busy",
            isAllDay: false
          },
          {
            id: "exception-immutable",
            iCalUId: "ical-series",
            seriesMasterId: "series-master-immutable",
            type: "exception",
            originalStart: "2026-08-27T13:00:00.0000000Z",
            subject: "Weekly planning - moved",
            start: { dateTime: "2026-08-27T11:00:00", timeZone: "America/New_York" },
            end: { dateTime: "2026-08-27T12:00:00", timeZone: "America/New_York" },
            originalStartTimeZone: "America/New_York",
            originalEndTimeZone: "America/New_York",
            showAs: "busy",
            isAllDay: false
          },
          {
            id: "all-day-immutable",
            iCalUId: "ical-all-day",
            type: "singleInstance",
            subject: "Company holiday",
            start: { dateTime: "2026-08-21T00:00:00", timeZone: "America/New_York" },
            end: { dateTime: "2026-08-22T00:00:00", timeZone: "America/New_York" },
            originalStartTimeZone: "America/New_York",
            originalEndTimeZone: "America/New_York",
            showAs: "free",
            isAllDay: true
          },
          { id: "deleted-immutable", "@removed": { reason: "deleted" } }
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendars/calendar-immutable-id/calendarView/delta?$deltatoken=cursor-2"
      })
    };
  }

  if (request.url.includes("/subscriptions/stale-sub") && request.method === "PATCH") {
    return { ok: false, status: 410, json: async () => ({ error: { message: "Gone" } }) };
  }
  if (request.url.endsWith("/subscriptions") && request.method === "POST") {
    const body = JSON.parse(request.body);
    return { ok: true, status: 201, json: async () => ({ id: "replacement-sub", ...body }) };
  }
  if (request.url.includes("/events") && request.method === "POST") {
    return { ok: true, status: 201, json: async () => ({ id: "mirror-immutable-id" }) };
  }
  throw new Error(`Unexpected request: ${request.method} ${request.url}`);
};

const adapter = new MicrosoftGraphAdapter({ profile, tokenState, fetchImpl, maxRetries: 1 });
const changes = await adapter.listSourceEventChanges(calendar, {
  windowStart: new Date("2026-08-18T00:00:00Z"),
  windowEnd: new Date("2026-09-01T00:00:00Z"),
  timezone: profile.timezone,
  deltaLink: "https://graph.microsoft.com/v1.0/me/calendars/calendar-immutable-id/calendarView/delta?$deltatoken=stale-cursor"
});

assert.equal(deltaAttempts, 3);
assert.equal(initialDeltaAttempts, 2);
assert.equal(changes.cursorReset, true);
assert.equal(changes.events.length, 3);
assert.deepEqual(changes.deletedEventIds, ["deleted-immutable"]);
assert.ok(changes.deltaLink.includes("cursor-2"));
assert.equal(changes.events.find((event) => event.id === "series-master-immutable")?.recurrenceType, "seriesMaster");
assert.equal(changes.events.find((event) => event.id === "exception-immutable")?.seriesMasterId, "series-master-immutable");
assert.equal(changes.events.find((event) => event.id === "exception-immutable")?.originalStart, "2026-08-27T13:00:00.0000000Z");
assert.equal(changes.events.find((event) => event.id === "all-day-immutable")?.allDay, true);
assert.equal(changes.events.find((event) => event.id === "all-day-immutable")?.providerEventIdentity, "ical:ical-all-day");
assert.equal(changes.events.find((event) => event.id === "exception-immutable")?.providerEventIdentity, "ical:ical-series::2026-08-27T13:00:00.0000000Z");
const deltaRequest = requests.find((item) => item.url.includes("/calendarView/delta"));
assert.ok(deltaRequest.url.includes("/me/calendars/calendar-immutable-id/"));
assert.ok(String(deltaRequest.headers.Prefer).includes('IdType="ImmutableId"'));

const operation = {
  source: { id: "family", label: "Family" },
  event: { id: "accepted-meeting-1", subject: "Accepted meeting" },
  target: calendar,
  payload: {
    subject: "FAMILY: Accepted meeting",
    start: "2026-08-20T17:00:00Z",
    end: "2026-08-20T18:00:00Z",
    sourceEventTimezone: "America/New_York",
    preserveOriginalTimezone: true,
    allDay: false,
    visibility: "private",
    mirrorMode: "subject",
    sourceCalendarId: "family",
    sourceEventId: "accepted-meeting-1"
  }
};
const firstWrite = await adapter.upsertEvent(operation);
const secondWrite = await adapter.upsertEvent(operation);
assert.equal(firstWrite.targetEventId, "mirror-immutable-id");
assert.equal(secondWrite.targetEventId, "mirror-immutable-id");
const createPayloads = requests.filter((item) => item.method === "POST" && item.url.includes("/events")).map((item) => JSON.parse(item.body));
const createRequests = requests.filter((item) => item.method === "POST" && item.url.includes("/events"));
assert.equal(createPayloads.length, 2);
assert.ok(createRequests.every((item) => String(item.headers.Prefer).includes('IdType="ImmutableId"')));
assert.match(createPayloads[0].transactionId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(createPayloads[0].transactionId, createPayloads[1].transactionId);
assert.equal(createPayloads[0].attendees, undefined);
assert.equal(createPayloads[0].isOnlineMeeting, undefined);
assert.equal(createPayloads[0].responseRequested, undefined);
assert.equal(createPayloads[0].start.timeZone, "America/New_York");
assert.equal(createPayloads[0].end.timeZone, "America/New_York");

const subscription = await adapter.ensureCalendarWebhookSubscription(calendar, {
  subscriptionId: "stale-sub",
  resource: "/me/calendars/calendar-immutable-id/events",
  createdAt: "2026-08-01T00:00:00Z"
}, {
  notificationUrl: "https://marvin.example.com/marvin-api/webhooks/microsoft",
  clientState: "known-client-state",
  expiresAt: "2026-08-20T00:00:00Z",
  nowMs: Date.parse("2026-08-18T00:00:00Z")
});
assert.equal(subscription.ok, true);
assert.equal(subscription.subscription.subscriptionId, "replacement-sub");
assert.equal(requests.some((item) => item.method === "PATCH" && item.url.includes("stale-sub")), true);
assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/subscriptions")), true);

await assert.rejects(() => adapter.deleteEvent(calendar, "must-not-delete"), /deletion is disabled/i);
assert.equal(requests.some((item) => item.method === "DELETE"), false);

const checkpointRoot = path.resolve(`C:/tmp/marvin-microsoft-checkpoint-${Date.now()}`);
fs.mkdirSync(checkpointRoot, { recursive: true });
const checkpointStore = new FileMapStore(path.join(checkpointRoot, "mappings.json"));
const checkpointProfile = {
  name: "marvin-microsoft-checkpoint",
  timezone: "America/New_York",
  syncWindowDays: 7,
  privacyDefaults: { mirrorMode: "subject", visibility: "private", subjectPrefix: "SRC: ", preserveOriginalTimezone: true },
  calendars: [
    { id: "source", label: "Source", provider: "m365", connectionStatus: "connected", sourcePrefix: "SOURCE: " },
    { id: "target", label: "Target", provider: "m365", connectionStatus: "connected", sourcePrefix: "TARGET: " }
  ],
  routes: [{ source: "source", targets: [{ calendarId: "target", visibility: "private", detailMode: "subject", subjectPrefix: "SOURCE: " }] }]
};
let failCheckpointWrite = true;
const observedDeltaLinks = [];
const checkpointAdapter = {
  hasCalendarAuthMaterial: () => true,
  listSourceEvents: async () => [],
  listSourceEventChanges: async (sourceCalendar, options) => {
    observedDeltaLinks.push({ calendarId: sourceCalendar.id, deltaLink: options.deltaLink || "" });
    return {
      events: sourceCalendar.id === "source" ? [{
        id: "source-event",
        calendarId: "source",
        subject: "Checkpoint test",
        start: "2026-08-20T13:00:00Z",
        end: "2026-08-20T14:00:00Z",
        timezone: "America/New_York",
        allDay: false
      }] : [],
      deletedEventIds: [],
      deltaLink: `${sourceCalendar.id}-cursor`
    };
  },
  upsertEvent: async () => {
    if (failCheckpointWrite) throw new Error("Synthetic target failure");
    return { targetEventId: "target-event", status: "created" };
  }
};
const checkpointEngine = new SyncEngine({ profile: checkpointProfile, store: checkpointStore, adapters: { microsoft: checkpointAdapter }, sourceEvents: [] });
await checkpointEngine.loadSourceEventsFromProviders();
const failedCheckpoint = await checkpointEngine.applyLiveSync();
assert.equal(failedCheckpoint.failed, 1);
assert.deepEqual(failedCheckpoint.changeTrackingDeferred, ["source"]);
assert.equal(checkpointStore.load().changeTracking.source, undefined);
assert.equal(checkpointStore.load().changeTracking.target.deltaLink, "target-cursor");
failCheckpointWrite = false;
await checkpointEngine.loadSourceEventsFromProviders();
const successfulCheckpoint = await checkpointEngine.applyLiveSync();
assert.equal(successfulCheckpoint.failed, 0);
assert.equal(checkpointStore.load().changeTracking.source.deltaLink, "source-cursor");
assert.deepEqual(observedDeltaLinks.filter((item) => item.calendarId === "source").map((item) => item.deltaLink), ["", ""]);

console.log(JSON.stringify({
  ok: true,
  deltaAttempts,
  cursorReset: changes.cursorReset,
  normalizedEvents: changes.events.map((event) => ({ id: event.id, recurrenceType: event.recurrenceType, allDay: event.allDay })),
  deletedEventIds: changes.deletedEventIds,
  deterministicTransactionId: createPayloads[0].transactionId,
  subscriptionRecoveredAs: subscription.subscription.subscriptionId,
  failedCursorDeferred: failedCheckpoint.changeTrackingDeferred,
  successfulCursorCommitted: successfulCheckpoint.changeTrackingCommitted,
  providerDeleteDisabled: true
}, null, 2));
