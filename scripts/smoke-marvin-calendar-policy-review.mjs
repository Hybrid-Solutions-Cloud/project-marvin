import assert from "node:assert/strict";
import { buildMirrorPayload } from "../solutions/marvin-engine/src/core/policy.mjs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { buildCalendarReview, mergeDuplicateDecisions } from "../solutions/marvin-engine/src/util/calendar-review.mjs";

const family = { id: "family", label: "Turner Family", provider: "apple-caldav", calendarRole: "shared-family", sourcePrefix: "FAMILY: " };
const work = { id: "work", label: "TierPoint", provider: "m365", calendarRole: "employer-work", sourcePrefix: "TP: " };
const sourceEvent = {
  id: "family-event-1",
  providerEventIdentity: "ical:family-event-1",
  calendarId: family.id,
  subject: "Soccer practice",
  start: "2026-08-22T14:00:00.000Z",
  end: "2026-08-22T16:00:00.000Z",
  availability: "busy",
  timezone: "America/New_York"
};
const profile = {
  privacyDefaults: { mirrorMode: "full", visibility: "private", availabilityMode: "source", preserveOriginalTimezone: true },
  calendars: [family, work],
  eventOverrides: []
};
const familyToWork = { calendarId: work.id, detailMode: "full", visibility: "private", availabilityMode: "free" };
const freePayload = buildMirrorPayload(profile, { source: family.id }, family, work, familyToWork, sourceEvent);
assert.equal(freePayload.subject, "FAMILY: Soccer practice");
assert.equal(freePayload.visibility, "private");
assert.equal(freePayload.availability, "free");

const overriddenPayload = buildMirrorPayload({
  ...profile,
  eventOverrides: [{
    id: "override-family-event-1",
    sourceCalendarId: family.id,
    providerEventIdentity: sourceEvent.providerEventIdentity,
    availabilityMode: "busy"
  }]
}, { source: family.id }, family, work, familyToWork, sourceEvent);
assert.equal(overriddenPayload.availability, "busy");
assert.equal(overriddenPayload.eventOverrideApplied, true);

const graphPayload = new MicrosoftGraphAdapter().buildGraphPayload({ payload: overriddenPayload });
assert.equal(graphPayload.subject, "FAMILY: Soccer practice");
assert.equal(graphPayload.sensitivity, "private");
assert.equal(graphPayload.showAs, "busy");
const googlePayload = new GoogleCalendarAdapter().buildGooglePayload({ payload: freePayload });
assert.equal(googlePayload.visibility, "private");
assert.equal(googlePayload.transparency, "transparent");

const mirrorDescription = (sourceId) => `[Project Marvin Mirror]\nSource Calendar: Turner Family\nSource Event: ${sourceId}`;
const fakeEvents = {
  work: [
    { id: "mirror-current", calendarId: "work", subject: "FAMILY: Soccer practice", start: sourceEvent.start, end: sourceEvent.end, mirroredByMarvin: true, description: mirrorDescription("family-event-1"), lastModifiedDateTime: "2026-08-19T01:00:00.000Z", availability: "free" },
    { id: "mirror-old-1", calendarId: "work", subject: "FAMILY: Soccer practice", start: sourceEvent.start, end: sourceEvent.end, mirroredByMarvin: true, description: mirrorDescription("family-event-1"), lastModifiedDateTime: "2026-08-18T01:00:00.000Z", availability: "busy" },
    { id: "mirror-old-2", calendarId: "work", subject: "FAMILY: Soccer practice", start: sourceEvent.start, end: sourceEvent.end, mirroredByMarvin: true, description: mirrorDescription("old-provider-id"), lastModifiedDateTime: "2026-08-17T01:00:00.000Z", availability: "busy" }
  ],
  family: [sourceEvent]
};
const adapters = {
  microsoft: { listSourceEvents: async () => fakeEvents.work },
  caldav: { listSourceEvents: async () => fakeEvents.family }
};
const review = await buildCalendarReview({
  profile: { ...profile, syncWindowDays: 45, timezone: "America/New_York" },
  adapters,
  mappings: [{ targetCalendarId: "work", targetEventId: "mirror-current" }],
  windowStart: new Date("2026-08-18T00:00:00.000Z"),
  windowEnd: new Date("2026-10-01T00:00:00.000Z")
});
assert.equal(review.summary.mirrorEvents, 3);
assert.equal(review.summary.duplicateGroups, 1);
assert.equal(review.summary.recommendedRemovals, 2);
assert.equal(review.duplicateGroups[0].candidates[0].trackedByMarvin, true);
assert.equal(review.duplicateGroups[0].candidates[0].recommendedDecision, "keep");
assert.equal(review.duplicateGroups[0].candidates[1].recommendedDecision, "remove");
const decided = mergeDuplicateDecisions(review, { [review.duplicateGroups[0].candidates[1].candidateId]: "keep" });
assert.equal(decided.duplicateGroups[0].candidates[1].decision, "keep");

const legacyEvents = {
  work: [
    { id: "legacy-1", calendarId: "work", subject: "KRISTOPHER: Soccer practice", start: sourceEvent.start, end: sourceEvent.end, mirroredByMarvin: true, description: mirrorDescription("family-event-1"), lastModifiedDateTime: "2026-08-18T01:00:00.000Z", availability: "busy" },
    { id: "legacy-2", calendarId: "work", subject: "KRIS: Soccer practice", start: sourceEvent.start, end: sourceEvent.end, mirroredByMarvin: true, description: mirrorDescription("family-event-1"), lastModifiedDateTime: "2026-08-17T01:00:00.000Z", availability: "busy" }
  ],
  family: [sourceEvent]
};
const legacyReview = await buildCalendarReview({
  profile: { ...profile, syncWindowDays: 45, timezone: "America/New_York" },
  adapters: {
    microsoft: { listSourceEvents: async () => legacyEvents.work },
    caldav: { listSourceEvents: async () => legacyEvents.family }
  },
  mappings: [],
  windowStart: new Date("2026-08-18T00:00:00.000Z"),
  windowEnd: new Date("2026-10-01T00:00:00.000Z")
});
assert.equal(legacyReview.summary.obsoleteMirrors, 2);
assert.equal(legacyReview.summary.recommendedRemovals, 2);
assert.equal(legacyReview.summary.groupsRequiringReplacement, 1);
assert.equal(legacyReview.duplicateGroups[0].requiresReplacement, true);
assert.ok(legacyReview.duplicateGroups[0].candidates.every((candidate) => candidate.recommendedDecision === "remove"));
assert.ok(legacyReview.duplicateGroups[0].candidates.every((candidate) => candidate.expectedPrefix === "FAMILY:"));
assert.ok(legacyReview.duplicateGroups[0].candidates.every((candidate) => candidate.sourceCalendarLabel === "Turner Family"));
const legacyCandidate = legacyReview.duplicateGroups[0].candidates[0];
const legacyDecision = mergeDuplicateDecisions(legacyReview, { [legacyCandidate.candidateId]: "keep" });
assert.equal(legacyDecision.duplicateGroups[0].candidates[0].decision, "remove");
const singleLegacyReview = await buildCalendarReview({
  profile: { ...profile, syncWindowDays: 45, timezone: "America/New_York" },
  adapters: {
    microsoft: { listSourceEvents: async () => legacyEvents.work.slice(0, 1) },
    caldav: { listSourceEvents: async () => legacyEvents.family }
  },
  mappings: [],
  windowStart: new Date("2026-08-18T00:00:00.000Z"),
  windowEnd: new Date("2026-10-01T00:00:00.000Z")
});
assert.equal(singleLegacyReview.summary.duplicateGroups, 0);
assert.equal(singleLegacyReview.summary.reviewGroups, 1);
assert.equal(singleLegacyReview.summary.obsoleteMirrors, 1);
assert.equal(singleLegacyReview.duplicateGroups[0].kind, "obsolete-prefix");

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Family events default to Free on professional calendars",
    "Per-event exceptions can block professional calendars",
    "Microsoft privacy and availability are independent",
    "Google Free maps to transparent",
    "Duplicate review prefers the currently tracked mirror",
    "Unconfigured legacy prefixes are all removal candidates",
    "Legacy-only groups require a replacement before cleanup",
    "Saved Keep decisions cannot override obsolete-prefix safety",
    "Single obsolete mirrors remain visible in the cleanup list",
    "Keep and Remove decisions remain review metadata"
  ]
}, null, 2));
