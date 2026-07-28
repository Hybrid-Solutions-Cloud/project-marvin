export function buildMirrorPayload(route, sourceCalendar) {
  const mirrorMode = route.mirrorMode ?? "busy";
  return {
    mirrorMode,
    visibility: "private",
    subjectPrefix: route.subjectPrefix ?? "BUSY: ",
    sourceCalendar: sourceCalendar.label,
    descriptionPolicy: mirrorMode === "busy" ? "empty" : "copy-if-allowed"
  };
}
