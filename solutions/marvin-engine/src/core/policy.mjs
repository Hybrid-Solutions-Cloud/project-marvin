export const MARVIN_MIRROR_MARKER = "[Project Marvin Mirror]";

const SUPPORTED_AVAILABILITY = new Set(["free", "tentative", "busy", "oof", "workingElsewhere"]);

function normalizeAvailability(value, fallback = "busy") {
  const normalized = String(value || "").trim();
  const lower = normalized.toLowerCase();
  const alias = lower === "outofoffice" || lower === "out-of-office"
    ? "oof"
    : lower === "workingelsewhere"
      ? "workingElsewhere"
      : lower;
  return SUPPORTED_AVAILABILITY.has(alias) ? alias : fallback;
}

function matchingEventOverride(profile, sourceCalendar, targetCalendar, sourceEvent) {
  const overrides = Array.isArray(profile?.eventOverrides) ? profile.eventOverrides : [];
  return overrides.find((item) => {
    if (item?.sourceCalendarId !== sourceCalendar.id) return false;
    const identityMatches = item.providerEventIdentity && sourceEvent.providerEventIdentity
      ? item.providerEventIdentity === sourceEvent.providerEventIdentity
      : item.sourceEventId === sourceEvent.id;
    if (!identityMatches) return false;
    return !Array.isArray(item.targetCalendarIds)
      || item.targetCalendarIds.length === 0
      || item.targetCalendarIds.includes(targetCalendar.id);
  }) || null;
}

function buildMarvinMirrorMetadata(sourceCalendar, targetCalendar, sourceEvent) {
  return {
    managed: true,
    marker: MARVIN_MIRROR_MARKER,
    sourceCalendarId: sourceCalendar.id,
    sourceCalendarLabel: sourceCalendar.label,
    targetCalendarId: targetCalendar.id,
    targetCalendarLabel: targetCalendar.label,
    sourceEventId: sourceEvent.id,
    sourceSubject: sourceEvent.subject ?? "Busy"
  };
}

export function buildMirrorPayload(profile, route, sourceCalendar, targetCalendar, targetPolicy, sourceEvent) {
  const defaults = profile.privacyDefaults ?? {};
  const eventOverride = matchingEventOverride(profile, sourceCalendar, targetCalendar, sourceEvent);
  const detailMode = eventOverride?.detailMode ?? targetPolicy.detailMode ?? route.mirrorMode ?? defaults.mirrorMode ?? "full";
  const visibility = eventOverride?.visibility ?? targetPolicy.visibility ?? defaults.visibility ?? "private";
  const subjectPrefix = targetPolicy.subjectPrefix ?? route.subjectPrefix ?? sourceCalendar.sourcePrefix ?? defaults.subjectPrefix ?? `${sourceCalendar.label}: `;
  const copyLocation = eventOverride?.copyLocation ?? targetPolicy.copyLocation ?? defaults.copyLocation ?? true;
  const copyDescription = eventOverride?.copyDescription ?? targetPolicy.copyDescription ?? defaults.copyDescription ?? true;
  const preserveOriginalTimezone = defaults.preserveOriginalTimezone ?? true;
  const normalizedSubject = detailMode === "busy" ? "Busy" : (sourceEvent.subject ?? "Busy");
  const availabilityMode = eventOverride?.availabilityMode ?? targetPolicy.availabilityMode ?? defaults.availabilityMode ?? "source";
  const sourceAvailability = normalizeAvailability(sourceEvent.availability || sourceEvent.status, "busy");
  const availability = availabilityMode === "source"
    ? sourceAvailability
    : normalizeAvailability(availabilityMode, "busy");

  return {
    mirrorMode: detailMode,
    visibility,
    availabilityMode,
    availability,
    subjectPrefix,
    subject: `${subjectPrefix}${normalizedSubject}`,
    sourceCalendar: sourceCalendar.label,
    sourceCalendarId: sourceCalendar.id,
    targetCalendar: targetCalendar.label,
    targetCalendarId: targetCalendar.id,
    sourceEventId: sourceEvent.id,
    sourceEventTimezone: sourceEvent.timezone ?? profile.timezone,
    preserveOriginalTimezone,
    start: sourceEvent.start,
    end: sourceEvent.end,
    allDay: Boolean(sourceEvent.allDay),
    location: copyLocation && detailMode !== "busy" ? (sourceEvent.location ?? "") : "",
    description: copyDescription && detailMode === "full" ? (sourceEvent.description ?? "") : "",
    descriptionPolicy: copyDescription && detailMode === "full" ? "copy" : "empty",
    eventOverrideApplied: Boolean(eventOverride),
    marvinMirror: buildMarvinMirrorMetadata(sourceCalendar, targetCalendar, sourceEvent)
  };
}
