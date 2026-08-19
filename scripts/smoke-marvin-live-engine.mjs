import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";
import { SyncEngine } from "../solutions/marvin-engine/src/core/sync-engine.mjs";
import { FileMapStore } from "../solutions/marvin-engine/src/storage/file-map-store.mjs";
import { FileTokenStore, buildTokenStorePath } from "../solutions/marvin-engine/src/storage/file-token-store.mjs";
import { MARVIN_MIRROR_MARKER } from "../solutions/marvin-engine/src/core/policy.mjs";

const tempRoot = path.resolve("C:/tmp/marvin-live-smoke");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const profile = {
  name: "marvin-live-smoke",
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
    { id: "apple", label: "Apple", provider: "apple-caldav", email: "apple@example.com", scope: "personal", sourcePrefix: "APPLE: ", connectionStatus: "connected", caldavServerUrl: "http://127.0.0.1:9999/calendars/apple", caldavUsername: "apple@example.com" }
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
    { calendarId: "work", provider: "m365", email: "work@example.com", accessToken: "expired-ms-token", refreshToken: "ms-refresh", tokenType: "Bearer", expiresAt: "2020-01-01T00:00:00.000Z", status: "connected" },
    { calendarId: "family", provider: "google", email: "family@example.com", accessToken: "expired-google-token", refreshToken: "google-refresh", tokenType: "Bearer", expiresAt: "2020-01-01T00:00:00.000Z", status: "connected" }
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
  if (String(url).includes("oauth2.googleapis.com/token")) {
    return {
      ok: true,
      json: async () => ({ access_token: "google-token-refreshed", refresh_token: "google-refresh-2", token_type: "Bearer", expires_in: 3600, scope: "calendar" })
    };
  }
  if (String(url).includes("login.microsoftonline.com") && String(url).includes("/token")) {
    return {
      ok: true,
      json: async () => ({ access_token: "ms-token-refreshed", refresh_token: "ms-refresh-2", token_type: "Bearer", expires_in: 3600, scope: "Calendars.ReadWrite", id_token: "aaa.eyJvaWQiOiJtc29pZC0xIn0.bbb" })
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
            id: "ms-mirror-1",
            subject: "FAMILY: Family dinner",
            start: { dateTime: "2026-07-29T18:00:00", timeZone: "UTC" },
            end: { dateTime: "2026-07-29T19:00:00", timeZone: "UTC" },
            originalStartTimeZone: "America/New_York",
            location: { displayName: "Home" },
            bodyPreview: MARVIN_MIRROR_MARKER,
            body: { contentType: "text", content: `${MARVIN_MIRROR_MARKER}\nSource Event: google-event-1` },
            categories: [MARVIN_MIRROR_MARKER],
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
            id: "google-mirror-1",
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
          },
          {
            id: "google-mirror-apple-1",
            summary: "APPLE: Doctor visit",
            start: { dateTime: "2026-07-29T20:00:00-04:00", timeZone: "America/New_York" },
            end: { dateTime: "2026-07-29T21:00:00-04:00", timeZone: "America/New_York" },
            location: "Clinic",
            description: `${MARVIN_MIRROR_MARKER}\nSource Event: apple-event-1`,
            status: "confirmed",
            extendedProperties: {
              private: {
                projectMarvinManaged: "true",
                projectMarvinSourceCalendarId: "apple",
                projectMarvinSourceEventId: "apple-event-1"
              }
            }
          }
        ]
      })
    };
  }
  if (String(url).includes("127.0.0.1:9999") && (options.method || "GET") === "REPORT") {
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
  if (String(url).includes("graph.microsoft.com") && options.method === "PATCH") {
    return {
      ok: true,
      json: async () => ({})
    };
  }
  if (String(url).includes("googleapis.com") && options.method === "PUT") {
    return {
      ok: true,
      json: async () => ({ id: String(url).includes('google-mirror-1') ? 'google-mirror-1' : 'google-mirror-apple-1' })
    };
  }
  if (String(url).includes("127.0.0.1:9999") && options.method === "PUT") {
    return {
      ok: true,
      status: 201,
      text: async () => "created"
    };
  }
  throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
};

const onTokenStateChange = async (nextState) => {
  tokenStore.save(nextState);
};

const adapters = {
  microsoft: new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
  google: new GoogleCalendarAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
  caldav: new CalDavAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange })
};

const mappedStore = new FileMapStore(path.join(tempRoot, "mappings.json"));
mappedStore.save({
  mappings: [
    {
      sourceCalendarId: "work",
      sourceEventId: "ms-event-1",
      targetCalendarId: "family",
      targetEventId: "google-mirror-1",
      sourceSubject: "Quarterly review",
      mirrorMode: "full",
      visibility: "default",
      subjectPrefix: "WORK: ",
      sourceEventTimezone: "America/New_York",
      updatedAt: "2026-07-29T00:00:00.000Z"
    },
    {
      sourceCalendarId: "family",
      sourceEventId: "google-event-1",
      targetCalendarId: "work",
      targetEventId: "ms-mirror-1",
      sourceSubject: "Family dinner",
      mirrorMode: "subject",
      visibility: "private",
      subjectPrefix: "FAMILY: ",
      sourceEventTimezone: "America/New_York",
      updatedAt: "2026-07-29T00:00:00.000Z"
    },
    {
      sourceCalendarId: "apple",
      sourceEventId: "apple-event-1",
      targetCalendarId: "work",
      targetEventId: "ms-mirror-apple-1",
      sourceSubject: "Doctor visit",
      mirrorMode: "subject",
      visibility: "private",
      subjectPrefix: "APPLE: ",
      sourceEventTimezone: "UTC",
      updatedAt: "2026-07-29T00:00:00.000Z"
    },
    {
      sourceCalendarId: "apple",
      sourceEventId: "apple-event-1",
      targetCalendarId: "family",
      targetEventId: "google-mirror-apple-1",
      sourceSubject: "Doctor visit",
      mirrorMode: "full",
      visibility: "default",
      subjectPrefix: "APPLE: ",
      sourceEventTimezone: "UTC",
      updatedAt: "2026-07-29T00:00:00.000Z"
    },
    {
      sourceCalendarId: "work",
      sourceEventId: "ms-event-1",
      targetCalendarId: "apple",
      targetEventId: "work-evt-123.ics",
      sourceSubject: "Quarterly review",
      mirrorMode: "subject",
      visibility: "private",
      subjectPrefix: "WORK: ",
      sourceEventTimezone: "America/New_York",
      updatedAt: "2026-07-29T00:00:00.000Z"
    }
  ]
});

const engine = new SyncEngine({
  profile,
  store: mappedStore,
  adapters,
  sourceEvents: []
});

const sourceLoad = await engine.loadSourceEventsFromProviders({ windowDays: 2 });
assert.equal(sourceLoad.loaded, 3);
assert.equal(sourceLoad.skippedMirrors, 5);
assert.equal(engine.sourceEvents.length, 3);

const liveResult = await engine.applyLiveSync();
assert.equal(liveResult.failed, 0);
assert.equal(liveResult.succeeded, 6);
assert.equal(liveResult.results.length, 6);
assert.equal(liveResult.mappings.length, 6);
const mappingPairs = new Set(liveResult.mappings.map((item) => `${item.sourceCalendarId}->${item.targetCalendarId}`));
assert.deepEqual([...mappingPairs].sort(), ["apple->family", "apple->work", "family->apple", "family->work", "work->apple", "work->family"]);
assert.ok(requests.some((item) => item.url.includes("oauth2.googleapis.com/token") && item.method === "POST"));
assert.ok(requests.some((item) => item.url.includes("login.microsoftonline.com") && item.url.includes("/token") && item.method === "POST"));
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "PATCH"));
assert.ok(requests.some((item) => item.url.includes("googleapis.com") && item.method === "PUT"));
assert.ok(requests.some((item) => item.url.includes("127.0.0.1:9999") && item.method === "REPORT"));
assert.ok(requests.some((item) => item.url.includes("127.0.0.1:9999") && item.method === "PUT"));
assert.ok(!requests.some((item) => item.url.includes("/events") && item.method === "POST"));

const graphWrites = requests.filter((item) => item.url.includes("graph.microsoft.com") && item.method === "PATCH");
const googleWrites = requests.filter((item) => item.url.includes("googleapis.com") && item.method === "PUT");
const caldavWrites = requests.filter((item) => item.url.includes("127.0.0.1:9999") && item.method === "PUT");
assert.equal(graphWrites.length, 2);
assert.equal(googleWrites.length, 2);
assert.equal(caldavWrites.length, 2);

const graphPayloads = graphWrites.map((item) => JSON.parse(item.body));
const googlePayloads = googleWrites.map((item) => JSON.parse(item.body));
const caldavBodies = caldavWrites.map((item) => String(item.body || ""));

for (const payload of graphPayloads) {
  assert.deepEqual(payload.categories, [MARVIN_MIRROR_MARKER]);
  assert.equal(payload.sensitivity, "private");
  assert.equal(payload.showAs, "busy");
  assert.ok(String(payload.body?.content || "").includes(MARVIN_MIRROR_MARKER));
}

const familyToWork = graphPayloads.find((payload) => payload.subject === "FAMILY: Family dinner");
const appleToWork = graphPayloads.find((payload) => payload.subject === "APPLE: Doctor visit");
assert.ok(familyToWork);
assert.ok(appleToWork);
assert.equal(familyToWork.location, undefined);
assert.equal(familyToWork.start?.timeZone, "America/New_York");
assert.equal(familyToWork.end?.timeZone, "America/New_York");
assert.ok(String(familyToWork.body?.content || "").includes("Family dinner"));
assert.ok(String(familyToWork.body?.content || "").includes("Source Event: google-event-1"));
assert.equal(appleToWork.location, undefined);
assert.equal(appleToWork.start?.timeZone, "UTC");
assert.equal(appleToWork.end?.timeZone, "UTC");
assert.ok(String(appleToWork.body?.content || "").includes("Doctor visit"));
assert.ok(String(appleToWork.body?.content || "").includes("Source Event: apple-event-1"));

for (const payload of googlePayloads) {
  assert.equal(payload.extendedProperties?.private?.projectMarvinManaged, "true");
  assert.equal(payload.visibility, "default");
  assert.ok(String(payload.description || "").includes(MARVIN_MIRROR_MARKER));
}

const workToFamily = googlePayloads.find((payload) => payload.summary === "WORK: Quarterly review");
const appleToFamily = googlePayloads.find((payload) => payload.summary === "APPLE: Doctor visit");
assert.ok(workToFamily);
assert.ok(appleToFamily);
assert.equal(workToFamily.location, "Teams");
assert.equal(workToFamily.start?.timeZone, "America/New_York");
assert.equal(workToFamily.end?.timeZone, "America/New_York");
assert.ok(String(workToFamily.description || "").includes("Review meeting"));
assert.ok(String(workToFamily.description || "").includes("Source Event: ms-event-1"));
assert.equal(appleToFamily.location, "Clinic");
assert.equal(appleToFamily.start?.timeZone, "UTC");
assert.equal(appleToFamily.end?.timeZone, "UTC");
assert.ok(String(appleToFamily.description || "").includes("Annual checkup"));
assert.ok(String(appleToFamily.description || "").includes("Source Event: apple-event-1"));

for (const body of caldavBodies) {
  assert.ok(body.includes("X-PROJECT-MARVIN-MANAGED:TRUE"));
  assert.ok(body.includes("CLASS:PRIVATE"));
}
assert.ok(caldavBodies.some((body) => body.includes("SUMMARY:WORK: Quarterly review")));
assert.ok(caldavBodies.some((body) => body.includes("SUMMARY:FAMILY: Family dinner")));
assert.ok(caldavBodies.every((body) => !body.includes("LOCATION:")));
const liveMappingsByVisibility = liveResult.mappings.reduce((groups, item) => { (groups[item.visibility] ||= []).push(item); return groups; }, {});
assert.equal((liveMappingsByVisibility.private || []).length, 4);
assert.equal((liveMappingsByVisibility.default || []).length, 2);
assert.ok(liveResult.mappings.every((item) => item.subjectPrefix.endsWith(": ")));
assert.ok(liveResult.mappings.some((item) => item.sourceCalendarId === "apple" && item.sourceEventTimezone === "UTC"));
assert.ok(liveResult.mappings.some((item) => item.sourceCalendarId === "work" && item.sourceEventTimezone === "America/New_York"));

const markerOnlyStore = new FileMapStore(path.join(tempRoot, "marker-only-mappings.json"));
markerOnlyStore.save({ mappings: [] });
const markerOnlyEngine = new SyncEngine({
  profile,
  store: markerOnlyStore,
  adapters,
  sourceEvents: []
});
const markerOnlyLoad = await markerOnlyEngine.loadSourceEventsFromProviders({ windowDays: 2 });
assert.equal(markerOnlyLoad.loaded, 3);
assert.equal(markerOnlyLoad.skippedMirrors, 5);
assert.equal(markerOnlyEngine.sourceEvents.length, 3);

const identityStore = new FileMapStore(path.join(tempRoot, "identity-mappings.json"));
identityStore.save({
  mappings: [],
  eventIdentities: {
    family: {
      "same-meeting-on-family": { identity: "ical:same-meeting", observedAt: new Date().toISOString() }
    }
  }
});
const identityEngine = new SyncEngine({
  profile,
  store: identityStore,
  adapters,
  sourceEvents: [{
    id: "same-meeting-on-work",
    calendarId: "work",
    providerEventIdentity: "ical:same-meeting",
    subject: "Already accepted in both accounts",
    start: "2026-07-29T14:00:00Z",
    end: "2026-07-29T15:00:00Z",
    timezone: "America/New_York"
  }]
});
const identityOperations = identityEngine.buildOperations();
assert.equal(identityOperations.some((operation) => operation.target.id === "family"), false);
assert.equal(identityOperations.some((operation) => operation.target.id === "apple"), true);

const persistedTokens = new FileTokenStore(buildTokenStorePath(tempRoot, profile.name)).load();
assert.equal(persistedTokens.records.find((item) => item.calendarId === "work")?.accessToken, "ms-token-refreshed");
assert.equal(persistedTokens.records.find((item) => item.calendarId === "family")?.accessToken, "google-token-refreshed");

console.log(JSON.stringify({
  ok: true,
  loaded: sourceLoad.loaded,
  skippedMirrors: sourceLoad.skippedMirrors,
  markerOnlyLoaded: markerOnlyLoad.loaded,
  markerOnlySkippedMirrors: markerOnlyLoad.skippedMirrors,
  duplicateMeetingTargetSuppressed: true,
  succeeded: liveResult.succeeded,
  bidirectionalPairsCovered: [...mappingPairs].sort(),
  visibilityCounts: Object.fromEntries(Object.entries(liveMappingsByVisibility).map(([key, value]) => [key, value.length])),
  timezoneSources: [...new Set(liveResult.mappings.map((item) => item.sourceEventTimezone))].sort(),
  prefixesPreserved: true,
  refreshed: persistedTokens.records.map((item) => ({ calendarId: item.calendarId, accessToken: item.accessToken, refreshToken: item.refreshToken })),
  requests: requests.map((item) => ({ method: item.method, url: item.url }))
}, null, 2));
