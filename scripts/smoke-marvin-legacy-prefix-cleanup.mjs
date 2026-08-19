import assert from "node:assert/strict";
import { buildLegacyPrefixCleanupPlan, applyLegacyPrefixCleanup } from "../solutions/marvin-engine/src/util/legacy-prefix-cleanup.mjs";

const source = {
  id: "source-1",
  calendarId: "tierpoint",
  subject: "Coffee",
  start: "2026-08-22T14:00:00.000Z",
  end: "2026-08-22T14:30:00.000Z",
  mirroredByMarvin: false
};
const description = "[Project Marvin Mirror]\nSource Calendar: TierPoint\nSource Event: source-1";
const events = {
  hybrid: [
    { id: "legacy-1", calendarId: "hybrid", subject: "Kristopher: Coffee", start: source.start, end: source.end, mirroredByMarvin: true, description },
    { id: "legacy-2", calendarId: "hybrid", subject: "Kris: Coffee", start: source.start, end: source.end, mirroredByMarvin: true, description },
    { id: "replacement-1", calendarId: "hybrid", subject: "TP: Coffee", start: source.start, end: source.end, mirroredByMarvin: true, description }
  ],
  tierpoint: [source]
};
const deleted = [];
const microsoft = {
  listSourceEvents: async (calendar) => events[calendar.id],
  deleteEvent: async (calendar, eventId) => {
    deleted.push(`${calendar.id}::${eventId}`);
    return { eventId, status: "deleted" };
  }
};
const profile = {
  name: "legacy-prefix-cleanup-smoke",
  timezone: "America/New_York",
  calendars: [
    { id: "hybrid", label: "Hybrid Cloud", provider: "m365", sourcePrefix: "Hybrid: " },
    { id: "tierpoint", label: "TierPoint", provider: "m365", sourcePrefix: "TP: " }
  ]
};
const mappings = [{
  sourceCalendarId: "tierpoint",
  sourceEventId: "source-1",
  targetCalendarId: "hybrid",
  targetEventId: "replacement-1",
  subjectPrefix: "TP: ",
  managedBy: "project-marvin"
}];
const options = {
  profile,
  adapters: { microsoft },
  mappings,
  windowStart: new Date("2026-08-18T00:00:00.000Z"),
  windowEnd: new Date("2026-10-01T00:00:00.000Z")
};
const plan = await buildLegacyPrefixCleanupPlan(options);
assert.equal(plan.summary.legacyMirrors, 2);
assert.equal(plan.summary.safeToDelete, 2);
assert.equal(plan.summary.blocked, 0);
assert.equal(plan.summary.trackedLegacyMirrors, 0);
assert.ok(plan.candidates.every((candidate) => candidate.replacementEventId === "replacement-1"));
const applied = await applyLegacyPrefixCleanup({ profile, adapters: { microsoft }, plan });
assert.equal(applied.deleted, 2);
assert.deepEqual(new Set(deleted), new Set(["hybrid::legacy-1", "hybrid::legacy-2"]));

const blockedPlan = await buildLegacyPrefixCleanupPlan({
  ...options,
  mappings: [{ ...mappings[0], targetEventId: "legacy-1", subjectPrefix: "Kristopher: " }]
});
assert.equal(blockedPlan.summary.trackedLegacyMirrors, 1);
assert.equal(blockedPlan.summary.blocked, 1);
await assert.rejects(
  applyLegacyPrefixCleanup({ profile, adapters: { microsoft }, plan: blockedPlan }),
  /verified replacement/
);

const nativeCoveragePlan = await buildLegacyPrefixCleanupPlan({
  ...options,
  adapters: {
    microsoft: {
      ...microsoft,
      listSourceEvents: async (calendar) => calendar.id === "hybrid"
        ? [
            { id: "legacy-native", calendarId: "hybrid", subject: "Kristopher: Coffee", start: source.start, end: source.end, mirroredByMarvin: true, description },
            { id: "native-target", calendarId: "hybrid", subject: "Coffee", start: source.start, end: source.end, mirroredByMarvin: false, providerEventIdentity: "ical:shared-meeting" }
          ]
        : [{ ...source, providerEventIdentity: "ical:shared-meeting" }]
    }
  },
  mappings: []
});
assert.equal(nativeCoveragePlan.summary.legacyMirrors, 1);
assert.equal(nativeCoveragePlan.summary.safeToDelete, 1);
assert.equal(nativeCoveragePlan.summary.nativeCoverageVerified, 1);
assert.equal(nativeCoveragePlan.candidates[0].coverageMode, "native-target-event");

const absentSourcePlan = await buildLegacyPrefixCleanupPlan({
  ...options,
  adapters: {
    microsoft: {
      ...microsoft,
      listSourceEvents: async (calendar) => calendar.id === "hybrid"
        ? [{ id: "legacy-orphan", calendarId: "hybrid", subject: "Kristopher: Removed source", start: source.start, end: source.end, mirroredByMarvin: true, description: "[Project Marvin Mirror]\nSource Calendar: TierPoint\nSource Event: removed-source" }]
        : []
    }
  },
  mappings: []
});
assert.equal(absentSourcePlan.summary.safeToDelete, 1);
assert.equal(absentSourcePlan.summary.sourceAbsenceVerified, 1);
assert.equal(absentSourcePlan.candidates[0].coverageMode, "source-absent");

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Only Marvin mirrors with configured-prefix replacements are removable",
    "Tracked legacy mirrors are blocked until repaired",
    "Equivalent native target events satisfy coverage without creating another mirror",
    "Missing sources count only after a successful source-calendar read",
    "Cleanup deletes exact reviewed target event IDs"
  ]
}, null, 2));
