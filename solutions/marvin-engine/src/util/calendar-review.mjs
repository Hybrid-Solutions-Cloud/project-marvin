import crypto from "node:crypto";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`;
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

function normalizeTitle(subject, prefixes = []) {
  let value = normalizeString(subject).replace(/\s+/g, " ");
  for (const prefix of prefixes.filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }
  return value.toLowerCase();
}

function startsWithPrefix(subject, prefix) {
  const normalizedPrefix = normalizeString(prefix);
  return Boolean(normalizedPrefix) && normalizeString(subject).toLowerCase().startsWith(normalizedPrefix.toLowerCase());
}

function subjectPrefix(subject) {
  return normalizeString((normalizeString(subject).match(/^([^:]{1,64}:\s*)/) || [])[1]);
}

function resolveMirrorMetadata(event, mappings, profile, sourceEvents) {
  const parsed = parseMirrorMetadata(event.description);
  const calendars = profile.calendars || [];
  const mapping = (mappings || []).find((item) => item.targetCalendarId === event.calendarId && item.targetEventId === event.id);
  const sourceMatches = parsed.sourceEventId
    ? (sourceEvents || []).filter((item) => item.id === parsed.sourceEventId && item.calendarId !== event.calendarId)
    : [];
  const sourceCalendarId = mapping?.sourceCalendarId
    || (sourceMatches.length === 1 ? sourceMatches[0].calendarId : "")
    || calendars.find((calendar) => calendar.id !== event.calendarId && normalizeString(calendar.label).toLowerCase() === parsed.sourceCalendarLabel.toLowerCase())?.id
    || "";
  const sourceCalendar = calendars.find((calendar) => calendar.id === sourceCalendarId);
  const configuredPrefixes = calendars.map((calendar) => normalizeString(calendar.sourcePrefix)).filter(Boolean);
  const expectedPrefix = normalizeString(sourceCalendar?.sourcePrefix);
  const detectedPrefix = subjectPrefix(event.subject);
  const usesConfiguredPrefix = configuredPrefixes.some((prefix) => startsWithPrefix(event.subject, prefix));
  const obsoletePrefix = expectedPrefix
    ? !startsWithPrefix(event.subject, expectedPrefix)
    : Boolean(detectedPrefix && configuredPrefixes.length > 0 && !usesConfiguredPrefix);
  return {
    ...parsed,
    sourceCalendarId,
    sourceCalendarLabel: normalizeString(sourceCalendar?.label || parsed.sourceCalendarLabel),
    expectedPrefix,
    detectedPrefix,
    obsoletePrefix,
    obsoleteReason: obsoletePrefix
      ? expectedPrefix
        ? `Mirror title does not use the current ${expectedPrefix} prefix.`
        : `${detectedPrefix} is not a configured calendar prefix.`
      : ""
  };
}

function createUnionFind(length) {
  const parent = Array.from({ length }, (_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  return { find, union };
}

function groupDuplicateMirrors(events, mappings, profile, sourceEvents = []) {
  const prefixes = (profile.calendars || []).map((calendar) => normalizeString(calendar.sourcePrefix));
  const calendarLabels = new Map((profile.calendars || []).map((calendar) => [calendar.id, calendar.label || calendar.id]));
  const mappedTargets = new Set((mappings || []).map((item) => `${item.targetCalendarId}::${item.targetEventId}`));
  const unionFind = createUnionFind(events.length);
  const keys = new Map();

  events.forEach((event, index) => {
    const metadata = resolveMirrorMetadata(event, mappings, profile, sourceEvents);
    event.reviewMetadata = metadata;
    const identityKeys = [
      metadata.sourceEventId ? `source::${event.calendarId}::${metadata.sourceEventId}` : "",
      `time::${event.calendarId}::${normalizeTitle(event.subject, prefixes)}::${event.start}::${event.end}`
    ].filter(Boolean);
    for (const key of identityKeys) {
      if (keys.has(key)) unionFind.union(index, keys.get(key));
      else keys.set(key, index);
    }
  });

  const groups = new Map();
  events.forEach((event, index) => {
    const root = unionFind.find(index);
    const collection = groups.get(root) || [];
    collection.push(event);
    groups.set(root, collection);
  });

  return [...groups.values()].filter((items) => items.length > 1 || items.some((item) => item.reviewMetadata.obsoletePrefix)).map((items) => {
    const sorted = items.slice().sort((left, right) => {
      const leftObsolete = left.reviewMetadata.obsoletePrefix ? 1 : 0;
      const rightObsolete = right.reviewMetadata.obsoletePrefix ? 1 : 0;
      if (leftObsolete !== rightObsolete) return leftObsolete - rightObsolete;
      const leftMapped = mappedTargets.has(`${left.calendarId}::${left.id}`) ? 1 : 0;
      const rightMapped = mappedTargets.has(`${right.calendarId}::${right.id}`) ? 1 : 0;
      if (leftMapped !== rightMapped) return rightMapped - leftMapped;
      return normalizeString(right.lastModifiedDateTime).localeCompare(normalizeString(left.lastModifiedDateTime));
    });
    const candidateIds = sorted.map((item) => stableId("candidate", `${item.calendarId}\n${item.id}`));
    const sourceIds = new Set(sorted.map((item) => item.reviewMetadata.sourceEventId).filter(Boolean));
    const confirmed = sourceIds.size === 1 && sourceIds.size > 0;
    const keepCandidateIndex = sorted.findIndex((item) => !item.reviewMetadata.obsoletePrefix);
    const candidates = sorted.map((item, index) => ({
      candidateId: candidateIds[index],
      calendarId: item.calendarId,
      calendarLabel: calendarLabels.get(item.calendarId) || item.calendarId,
      subject: item.subject,
      start: item.start,
      end: item.end,
      availability: item.availability || item.status || "busy",
      lastModifiedDateTime: item.lastModifiedDateTime || "",
      trackedByMarvin: mappedTargets.has(`${item.calendarId}::${item.id}`),
      sourceCalendarId: item.reviewMetadata.sourceCalendarId,
      sourceCalendarLabel: item.reviewMetadata.sourceCalendarLabel,
      expectedPrefix: item.reviewMetadata.expectedPrefix,
      detectedPrefix: item.reviewMetadata.detectedPrefix,
      obsoletePrefix: item.reviewMetadata.obsoletePrefix,
      obsoleteReason: item.reviewMetadata.obsoleteReason,
      recommendedDecision: index === keepCandidateIndex ? "keep" : "remove"
    }));
    return {
      groupId: stableId("duplicate", candidateIds.slice().sort().join("\n")),
      confidence: confirmed ? "confirmed" : "probable",
      calendarId: sorted[0].calendarId,
      calendarLabel: calendarLabels.get(sorted[0].calendarId) || sorted[0].calendarId,
      subject: sorted[0].subject,
      start: sorted[0].start,
      end: sorted[0].end,
      sourceCalendarLabel: sorted[0].reviewMetadata.sourceCalendarLabel,
      copies: candidates.length,
      kind: candidates.length > 1 ? "duplicate" : "obsolete-prefix",
      requiresReplacement: keepCandidateIndex < 0,
      candidates
    };
  }).sort((left, right) => left.start.localeCompare(right.start) || left.subject.localeCompare(right.subject));
}

export async function buildCalendarReview({ profile, adapters, mappings = [], windowStart, windowEnd }) {
  const startedAt = new Date().toISOString();
  const events = [];
  const errors = [];
  const calendarSummaries = [];
  for (const calendar of profile.calendars || []) {
    const adapter = adapters[adapterKey(calendar.provider)];
    if (!adapter?.listSourceEvents) continue;
    try {
      const calendarEvents = await adapter.listSourceEvents(calendar, {
        profile,
        timezone: profile.timezone,
        windowStart,
        windowEnd
      });
      events.push(...calendarEvents);
      calendarSummaries.push({
        calendarId: calendar.id,
        label: calendar.label,
        provider: calendar.provider,
        events: calendarEvents.length,
        mirrors: calendarEvents.filter((event) => event.mirroredByMarvin).length
      });
    } catch (error) {
      errors.push({
        calendarId: calendar.id,
        label: calendar.label,
        provider: calendar.provider,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const mirrorEvents = events.filter((event) => event.mirroredByMarvin);
  const originalEvents = events.filter((event) => !event.mirroredByMarvin);
  const sourceEvents = originalEvents.map((event) => ({
    eventKey: stableId("event", `${event.calendarId}\n${event.providerEventIdentity || event.id}`),
    sourceCalendarId: event.calendarId,
    sourceEventId: event.id,
    providerEventIdentity: event.providerEventIdentity || "",
    subject: event.subject,
    start: event.start,
    end: event.end,
    availability: event.availability || event.status || "busy",
    allDay: Boolean(event.allDay)
  })).sort((left, right) => left.start.localeCompare(right.start));
  const duplicateGroups = groupDuplicateMirrors(mirrorEvents, mappings, profile, originalEvents);
  const obsoleteMirrors = duplicateGroups.flatMap((group) => group.candidates).filter((candidate) => candidate.obsoletePrefix);

  return {
    generatedAt: new Date().toISOString(),
    startedAt,
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(windowEnd).toISOString(),
    calendarSummaries,
    errors,
    sourceEvents,
    duplicateGroups,
    summary: {
      calendars: calendarSummaries.length,
      totalEvents: events.length,
      sourceEvents: sourceEvents.length,
      mirrorEvents: mirrorEvents.length,
      duplicateGroups: duplicateGroups.filter((group) => group.copies > 1).length,
      reviewGroups: duplicateGroups.length,
      duplicateCopies: duplicateGroups.filter((group) => group.copies > 1).reduce((total, group) => total + group.copies, 0),
      recommendedRemovals: duplicateGroups.reduce((total, group) => total + group.candidates.filter((candidate) => candidate.recommendedDecision === "remove").length, 0),
      obsoleteMirrors: obsoleteMirrors.length,
      groupsRequiringReplacement: duplicateGroups.filter((group) => group.requiresReplacement).length
    }
  };
}

export function mergeDuplicateDecisions(review, decisions = {}) {
  return {
    ...review,
    duplicateGroups: review.duplicateGroups.map((group) => ({
      ...group,
      candidates: group.candidates.map((candidate) => ({
        ...candidate,
        decision: candidate.obsoletePrefix ? "remove" : decisions[candidate.candidateId] || candidate.recommendedDecision
      }))
    }))
  };
}
