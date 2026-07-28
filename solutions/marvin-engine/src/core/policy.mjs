export function buildMirrorPayload(route, sourceCalendar, sourceEvent) {
  const mirrorMode = route.mirrorMode ?? "busy";
  const subjectPrefix = route.subjectPrefix ?? "BUSY: ";
  const busySubject = `${subjectPrefix}${mirrorMode === "busy" ? "Busy" : sourceEvent.subject}`;
  return {
    mirrorMode,
    visibility: "private",
    subject: busySubject,
    sourceCalendar: sourceCalendar.label,
    sourceEventId: sourceEvent.id,
    start: sourceEvent.start,
    end: sourceEvent.end,
    location: mirrorMode === "busy" ? "" : (sourceEvent.location ?? ""),
    descriptionPolicy: mirrorMode === "busy" ? "empty" : "copy-if-allowed"
  };
}
