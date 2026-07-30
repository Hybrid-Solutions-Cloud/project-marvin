export const MARVIN_MIRROR_MARKER = "[Project Marvin Mirror]";

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
  const detailMode = targetPolicy.detailMode ?? route.mirrorMode ?? defaults.mirrorMode ?? "full";
  const visibility = targetPolicy.visibility ?? defaults.visibility ?? "private";
  const subjectPrefix = targetPolicy.subjectPrefix ?? route.subjectPrefix ?? sourceCalendar.sourcePrefix ?? defaults.subjectPrefix ?? `${sourceCalendar.label}: `;
  const copyLocation = targetPolicy.copyLocation ?? defaults.copyLocation ?? true;
  const copyDescription = targetPolicy.copyDescription ?? defaults.copyDescription ?? true;
  const preserveOriginalTimezone = defaults.preserveOriginalTimezone ?? true;
  const normalizedSubject = detailMode === "busy" ? "Busy" : (sourceEvent.subject ?? "Busy");

  return {
    mirrorMode: detailMode,
    visibility,
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
    marvinMirror: buildMarvinMirrorMetadata(sourceCalendar, targetCalendar, sourceEvent)
  };
}
