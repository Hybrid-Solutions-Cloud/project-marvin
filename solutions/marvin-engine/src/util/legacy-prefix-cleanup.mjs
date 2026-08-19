function normalizeString(value) {
  return String(value ?? "").trim();
}

function adapterKey(provider) {
  if (provider === "m365" || provider === "outlook") return "microsoft";
  if (provider === "google") return "google";
  return "caldav";
}

function parseMirrorMetadata(description = "") {
  const text = String(description || "")
    .replace(/<\/(?:p|div|li|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return {
    sourceCalendarLabel: normalizeString((text.match(/Source Calendar:\s*([^\r\n]+)/i) || [])[1]),
    sourceEventId: normalizeString((text.match(/Source Event:\s*([^\r\n]+)/i) || [])[1])
  };
}

function normalizePrefix(prefix) {
  const value = normalizeString(prefix);
  return value && !value.endsWith(":") ? `${value}:` : value;
}

function startsWithPrefix(subject, prefix) {
  const value = normalizePrefix(prefix);
  return Boolean(value) && normalizeString(subject).toLowerCase().startsWith(value.toLowerCase());
}

function stripPrefix(subject, prefixes = []) {
  const value = normalizeString(subject);
  const match = prefixes.find((prefix) => startsWithPrefix(value, prefix));
  return match ? value.slice(normalizePrefix(match).length).trim() : value;
}

function sameEventShape(left, right, prefixes = []) {
  return left.calendarId === right.calendarId
    && left.start === right.start
    && left.end === right.end
    && stripPrefix(left.subject, prefixes).toLowerCase() === stripPrefix(right.subject, prefixes).toLowerCase();
}

export async function buildLegacyPrefixCleanupPlan({
  profile,
  adapters,
  mappings = [],
  legacyPrefixes = ["Kristopher:", "Kris:"],
  windowStart,
  windowEnd
}) {
  const calendars = profile.calendars || [];
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const configuredPrefixes = calendars.map((calendar) => normalizeString(calendar.sourcePrefix)).filter(Boolean);
  const allPrefixes = [...legacyPrefixes, ...configuredPrefixes];
  const events = [];
  const errors = [];
  const loadedCalendarIds = [];

  for (const calendar of calendars) {
    const adapter = adapters[adapterKey(calendar.provider)];
    if (!adapter?.listSourceEvents) continue;
    try {
      const calendarEvents = await adapter.listSourceEvents(calendar, {
        profile,
        timezone: profile.timezone,
        windowStart,
        windowEnd
      });
      events.push(...calendarEvents.map((event) => ({ ...event, calendarLabel: calendar.label || calendar.id })));
      loadedCalendarIds.push(calendar.id);
    } catch (error) {
      errors.push({
        calendarId: calendar.id,
        calendarLabel: calendar.label || calendar.id,
        provider: calendar.provider,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const mirrors = events.filter((event) => event.mirroredByMarvin);
  const originals = events.filter((event) => !event.mirroredByMarvin);
  const mappingByTarget = new Map(mappings.map((mapping) => [`${mapping.targetCalendarId}::${mapping.targetEventId}`, mapping]));
  const candidates = mirrors.filter((event) => legacyPrefixes.some((prefix) => startsWithPrefix(event.subject, prefix))).map((event) => {
    const legacyPrefix = legacyPrefixes.find((prefix) => startsWithPrefix(event.subject, prefix));
    const metadata = parseMirrorMetadata(event.description);
    const currentMapping = mappingByTarget.get(`${event.calendarId}::${event.id}`) || null;
    const baseSubject = stripPrefix(event.subject, legacyPrefixes);
    const sourceById = metadata.sourceEventId
      ? originals.filter((source) => source.id === metadata.sourceEventId && source.calendarId !== event.calendarId)
      : [];
    const sourceByShape = originals.filter((source) => source.calendarId !== event.calendarId
      && source.start === event.start
      && source.end === event.end
      && normalizeString(source.subject).toLowerCase() === baseSubject.toLowerCase());
    const resolvedSource = currentMapping
      ? originals.find((source) => source.calendarId === currentMapping.sourceCalendarId && source.id === currentMapping.sourceEventId)
      : sourceById.length === 1
        ? sourceById[0]
        : sourceByShape.length === 1
          ? sourceByShape[0]
          : null;
    const labelCalendar = calendars.find((calendar) => calendar.id !== event.calendarId
      && normalizeString(calendar.label).toLowerCase() === metadata.sourceCalendarLabel.toLowerCase());
    const onlyOtherCalendar = calendars.length === 2 ? calendars.find((calendar) => calendar.id !== event.calendarId) : null;
    const sourceCalendarId = currentMapping?.sourceCalendarId || resolvedSource?.calendarId || labelCalendar?.id || onlyOtherCalendar?.id || "";
    const sourceEventId = currentMapping?.sourceEventId || resolvedSource?.id || metadata.sourceEventId || "";
    const sourceCalendar = calendarById.get(sourceCalendarId);
    const expectedPrefix = normalizeString(sourceCalendar?.sourcePrefix);
    const replacementMapping = mappings.find((mapping) => mapping.sourceCalendarId === sourceCalendarId
      && mapping.sourceEventId === sourceEventId
      && mapping.targetCalendarId === event.calendarId
      && mapping.targetEventId !== event.id);
    const replacement = mirrors.find((mirror) => mirror.calendarId === event.calendarId
      && mirror.id !== event.id
      && expectedPrefix
      && startsWithPrefix(mirror.subject, expectedPrefix)
      && (replacementMapping?.targetEventId === mirror.id
        || (metadata.sourceEventId && parseMirrorMetadata(mirror.description).sourceEventId === metadata.sourceEventId)
        || sameEventShape(event, mirror, allPrefixes)));
    const nativeTargetEvent = originals.find((targetEvent) => targetEvent.calendarId === event.calendarId
      && ((resolvedSource?.providerEventIdentity && targetEvent.providerEventIdentity === resolvedSource.providerEventIdentity)
        || (targetEvent.start === event.start
          && targetEvent.end === event.end
          && normalizeString(targetEvent.subject).toLowerCase() === baseSubject.toLowerCase())));
    const trackedByMarvin = Boolean(currentMapping);
    const sourceCalendarReadSucceeded = loadedCalendarIds.includes(sourceCalendarId) && !errors.some((error) => error.calendarId === sourceCalendarId);
    const sourceAbsentVerified = sourceCalendarReadSucceeded
      && Boolean(sourceEventId)
      && !resolvedSource
      && sourceById.length === 0
      && sourceByShape.length === 0;
    const coverageMode = replacement?.mirroredByMarvin
      ? "correct-prefix-mirror"
      : nativeTargetEvent
        ? "native-target-event"
        : sourceAbsentVerified
          ? "source-absent"
          : "";
    const safeToDelete = !trackedByMarvin && Boolean(sourceCalendarId && sourceEventId && coverageMode);
    return {
      calendarId: event.calendarId,
      calendarLabel: event.calendarLabel,
      provider: calendarById.get(event.calendarId)?.provider || "",
      eventId: event.id,
      subject: event.subject,
      start: event.start,
      end: event.end,
      availability: event.availability || event.status || "busy",
      description: event.description || "",
      legacyPrefix: normalizePrefix(legacyPrefix),
      sourceCalendarId,
      sourceCalendarLabel: sourceCalendar?.label || metadata.sourceCalendarLabel || "",
      sourceEventId,
      expectedPrefix,
      trackedByMarvin,
      replacementEventId: replacement?.id || "",
      nativeTargetEventId: nativeTargetEvent?.id || "",
      sourceAbsentVerified,
      coverageMode,
      safeToDelete,
      blockedReason: safeToDelete
        ? ""
        : trackedByMarvin
          ? "The obsolete mirror is still the current Marvin mapping and must be repaired first."
          : !sourceCalendarId || !sourceEventId
            ? "The original source event could not be resolved safely."
            : "No correctly prefixed mirror, equivalent native target event, or verified missing source was found."
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(windowEnd).toISOString(),
    legacyPrefixes: legacyPrefixes.map(normalizePrefix),
    configuredPrefixes,
    errors,
    candidates,
    summary: {
      calendars: calendars.length,
      totalEvents: events.length,
      mirrorEvents: mirrors.length,
      legacyMirrors: candidates.length,
      safeToDelete: candidates.filter((candidate) => candidate.safeToDelete).length,
      blocked: candidates.filter((candidate) => !candidate.safeToDelete).length,
      trackedLegacyMirrors: candidates.filter((candidate) => candidate.trackedByMarvin).length,
      replacementsVerified: candidates.filter((candidate) => candidate.replacementEventId).length,
      nativeCoverageVerified: candidates.filter((candidate) => candidate.nativeTargetEventId).length,
      sourceAbsenceVerified: candidates.filter((candidate) => candidate.sourceAbsentVerified).length,
      providerErrors: errors.length
    }
  };
}

export async function applyLegacyPrefixCleanup({ profile, adapters, plan }) {
  if (plan.errors.length) throw new Error("Legacy-prefix cleanup cannot run while a provider read failed.");
  const blocked = plan.candidates.filter((candidate) => !candidate.safeToDelete);
  if (blocked.length) throw new Error(`Legacy-prefix cleanup is blocked for ${blocked.length} mirror(s) that do not have a verified replacement.`);
  const results = [];
  for (const candidate of plan.candidates) {
    const calendar = (profile.calendars || []).find((item) => item.id === candidate.calendarId);
    const adapter = calendar ? adapters[adapterKey(calendar.provider)] : null;
    if (!calendar || !adapter?.deleteEvent) {
      results.push({ eventId: candidate.eventId, calendarId: candidate.calendarId, status: "error", message: "No delete adapter is available for the target calendar." });
      continue;
    }
    try {
      const result = await adapter.deleteEvent(calendar, candidate.eventId, { cleanupCandidate: candidate, profile });
      results.push({ eventId: candidate.eventId, calendarId: candidate.calendarId, status: result.status || "deleted" });
    } catch (error) {
      results.push({ eventId: candidate.eventId, calendarId: candidate.calendarId, status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    attempted: results.length,
    deleted: results.filter((result) => result.status === "deleted").length,
    alreadyMissing: results.filter((result) => result.status === "already-missing").length,
    failed: results.filter((result) => result.status === "error").length,
    results
  };
}
