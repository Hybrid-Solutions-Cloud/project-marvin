import { buildPlan } from "./planner.mjs";

function isKnownMirroredEvent(event, mappings = []) {
  return mappings.some((item) => item.targetCalendarId === event.calendarId && item.targetEventId === event.id);
}

function isManagedMirrorEvent(event, mappings = []) {
  return Boolean(event?.mirroredByMarvin) || isKnownMirroredEvent(event, mappings);
}

function buildSourceEventKey(calendarId, eventId) {
  return `${calendarId}::${eventId}`;
}

function isCalendarConnected(calendar) {
  return String(calendar?.connectionStatus || "").trim().toLowerCase() === "connected";
}

function getCalendarReadiness(adapter, calendar) {
  if (!calendar || !adapter) {
    return { ready: false, reason: "No live adapter is available." };
  }
  if (!isCalendarConnected(calendar)) {
    return { ready: false, reason: `Calendar ${calendar.label} is not connected.` };
  }
  if (typeof adapter.hasCalendarAuthMaterial === "function" && !adapter.hasCalendarAuthMaterial(calendar)) {
    return { ready: false, reason: `Calendar ${calendar.label} is missing validated auth material.` };
  }
  return { ready: true, reason: "" };
}

export class SyncEngine {
  constructor({ profile, store, adapters, sourceEvents = [] }) {
    this.profile = profile;
    this.store = store;
    this.adapters = adapters;
    this.sourceEvents = sourceEvents;
    this.lastSourceLoad = null;
  }

  setSourceEvents(events = []) {
    this.sourceEvents = Array.isArray(events) ? events : [];
  }

  getKnownMappings() {
    const state = this.store.load();
    return Array.isArray(state?.mappings) ? state.mappings : [];
  }

  getLoopFilteredSourceEvents(events = []) {
    const mappings = this.getKnownMappings();
    return (Array.isArray(events) ? events : []).filter((event) => !isManagedMirrorEvent(event, mappings));
  }

  getCalendarById(calendarId) {
    return this.profile.calendars.find((calendar) => calendar.id === calendarId) || null;
  }

  isSourceCleanupReady(calendar) {
    const adapter = this.adapters[this.targetAdapterKey(calendar.provider)];
    return getCalendarReadiness(adapter, calendar).ready;
  }

  async loadSourceEventsFromProviders(options = {}) {
    const windowDays = Number(options.windowDays || this.profile.syncWindowDays || 45);
    const now = new Date();
    const windowStart = options.windowStart || new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = options.windowEnd || new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const events = [];
    const errors = [];
    const loadedCalendarIds = [];
    let skippedMirrors = 0;
    const mappings = this.getKnownMappings();

    for (const calendar of this.profile.calendars) {
      const adapter = this.adapters[this.targetAdapterKey(calendar.provider)];
      const readiness = getCalendarReadiness(adapter, calendar);
      if (!readiness.ready || !adapter?.listSourceEvents) {
        continue;
      }
      try {
        const providerEvents = await adapter.listSourceEvents(calendar, {
          timezone: this.profile.timezone,
          windowStart,
          windowEnd,
          profile: this.profile
        });
        const filteredEvents = providerEvents.filter((event) => !isManagedMirrorEvent(event, mappings));
        skippedMirrors += providerEvents.length - filteredEvents.length;
        events.push(...filteredEvents);
        if (this.isSourceCleanupReady(calendar)) {
          loadedCalendarIds.push(calendar.id);
        }
      } catch (error) {
        errors.push({
          calendarId: calendar.id,
          provider: calendar.provider,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.sourceEvents = events;
    this.lastSourceLoad = {
      loadedCalendarIds,
      errors,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString()
    };
    return {
      loaded: events.length,
      skippedMirrors,
      calendars: this.profile.calendars.length,
      loadedCalendarIds,
      errors,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      events
    };
  }

  buildOperations() {
    const filteredSourceEvents = this.getLoopFilteredSourceEvents(this.sourceEvents);
    const plan = buildPlan(this.profile, filteredSourceEvents);
    return plan.flatMap((entry) => entry.targets.map((target) => ({
      source: entry.source,
      event: entry.event,
      target,
      payload: target.payload
    })));
  }

  dryRun() {
    const state = this.store.load();
    const operations = this.buildOperations();
    return {
      profile: this.profile.name,
      timezone: this.profile.timezone,
      syncWindowDays: this.profile.syncWindowDays,
      sourceEvents: this.getLoopFilteredSourceEvents(this.sourceEvents).length,
      operations: operations.map((operation) => ({
        source: operation.source.label,
        eventId: operation.event.id,
        target: operation.target.label,
        payload: operation.payload,
        providerPlan: this.adapters[this.targetAdapterKey(operation.target.provider)].planWrite(operation)
      })),
      knownMappings: state.mappings.length,
      adapters: Object.fromEntries(
        Object.entries(this.adapters).map(([key, adapter]) => [key, adapter.describe()])
      )
    };
  }

  applyMockSync() {
    const operations = this.buildOperations();
    const newMappings = operations.map((operation) => ({
      sourceCalendarId: operation.source.id,
      sourceEventId: operation.event.id,
      targetCalendarId: operation.target.id,
      targetEventId: `${operation.target.id}__${operation.event.id}`,
      sourceSubject: operation.event.subject,
      mirrorMode: operation.payload.mirrorMode,
      visibility: operation.payload.visibility,
      subjectPrefix: operation.payload.subjectPrefix,
      sourceEventTimezone: operation.payload.sourceEventTimezone,
      updatedAt: new Date().toISOString()
    }));
    const nextState = { mappings: newMappings };
    this.store.save(nextState);
    return {
      applied: newMappings.length,
      storePath: this.store.filePath,
      mappings: newMappings
    };
  }

  async cleanupStaleMirrors(mappings = []) {
    const loadedCalendarIds = new Set(this.lastSourceLoad?.loadedCalendarIds || []);
    if (loadedCalendarIds.size === 0) {
      return { attempted: 0, succeeded: 0, failed: 0, skipped: 0, results: [], mappings };
    }

    const liveSourceKeys = new Set(
      this.getLoopFilteredSourceEvents(this.sourceEvents).map((event) => buildSourceEventKey(event.calendarId, event.id))
    );
    const staleMappings = mappings
      .map((mapping, index) => ({ mapping, index }))
      .filter(({ mapping }) => loadedCalendarIds.has(mapping.sourceCalendarId) && !liveSourceKeys.has(buildSourceEventKey(mapping.sourceCalendarId, mapping.sourceEventId)));

    const results = [];
    const removeIndexes = [];

    for (const entry of staleMappings) {
      const targetCalendar = this.getCalendarById(entry.mapping.targetCalendarId);
      const adapter = targetCalendar ? this.adapters[this.targetAdapterKey(targetCalendar.provider)] : null;
      const readiness = getCalendarReadiness(adapter, targetCalendar);
      if (targetCalendar && !readiness.ready) {
        results.push({
          sourceCalendarId: entry.mapping.sourceCalendarId,
          sourceEventId: entry.mapping.sourceEventId,
          targetCalendarId: entry.mapping.targetCalendarId,
          targetEventId: entry.mapping.targetEventId,
          status: "skipped",
          message: `${readiness.reason} Stale mirror cleanup was skipped.`
        });
        continue;
      }
      if (!targetCalendar || !adapter?.deleteEvent) {
        results.push({
          sourceCalendarId: entry.mapping.sourceCalendarId,
          sourceEventId: entry.mapping.sourceEventId,
          targetCalendarId: entry.mapping.targetCalendarId,
          targetEventId: entry.mapping.targetEventId,
          status: "skipped",
          message: "No live delete adapter is available for stale mirror cleanup."
        });
        continue;
      }

      try {
        const deleteResult = await adapter.deleteEvent(targetCalendar, entry.mapping.targetEventId, { mapping: entry.mapping, profile: this.profile });
        removeIndexes.push(entry.index);
        results.push({
          sourceCalendarId: entry.mapping.sourceCalendarId,
          sourceEventId: entry.mapping.sourceEventId,
          targetCalendarId: entry.mapping.targetCalendarId,
          targetEventId: entry.mapping.targetEventId,
          status: deleteResult.status || "deleted"
        });
      } catch (error) {
        results.push({
          sourceCalendarId: entry.mapping.sourceCalendarId,
          sourceEventId: entry.mapping.sourceEventId,
          targetCalendarId: entry.mapping.targetCalendarId,
          targetEventId: entry.mapping.targetEventId,
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    for (const index of removeIndexes.sort((a, b) => b - a)) {
      mappings.splice(index, 1);
    }

    return {
      attempted: staleMappings.length,
      succeeded: results.filter((item) => item.status !== "error" && item.status !== "skipped").length,
      failed: results.filter((item) => item.status === "error").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      results,
      mappings
    };
  }

  async applyLiveSync() {
    const operations = this.buildOperations();
    const state = this.store.load();
    const mappings = Array.isArray(state?.mappings) ? state.mappings.slice() : [];
    const results = [];

    for (const operation of operations) {
      const sourceAdapter = this.adapters[this.targetAdapterKey(operation.source.provider)];
      const sourceReadiness = getCalendarReadiness(sourceAdapter, operation.source);
      if (!sourceReadiness.ready) {
        results.push({
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          status: "skipped",
          message: sourceReadiness.reason.replace(`Calendar ${operation.source.label}`, `Source calendar ${operation.source.label}`)
        });
        continue;
      }
      const adapter = this.adapters[this.targetAdapterKey(operation.target.provider)];
      const targetReadiness = getCalendarReadiness(adapter, operation.target);
      if (!targetReadiness.ready) {
        results.push({
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          status: "skipped",
          message: targetReadiness.reason.replace(`Calendar ${operation.target.label}`, `Target calendar ${operation.target.label}`)
        });
        continue;
      }
      if (!adapter?.upsertEvent) {
        results.push({
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          status: "skipped",
          message: `No live adapter is available for ${operation.target.provider}.`
        });
        continue;
      }

      const mappingIndex = mappings.findIndex((item) => item.sourceCalendarId === operation.source.id && item.sourceEventId === operation.event.id && item.targetCalendarId === operation.target.id);
      const existingMapping = mappingIndex >= 0 ? mappings[mappingIndex] : null;

      try {
        const writeResult = await adapter.upsertEvent(operation, { existingMapping, profile: this.profile });
        const nextMapping = {
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          targetEventId: writeResult.targetEventId,
          sourceSubject: operation.event.subject,
          mirrorMode: operation.payload.mirrorMode,
          visibility: operation.payload.visibility,
          subjectPrefix: operation.payload.subjectPrefix,
          sourceEventTimezone: operation.payload.sourceEventTimezone,
          updatedAt: new Date().toISOString()
        };
        if (mappingIndex >= 0) {
          mappings[mappingIndex] = nextMapping;
        } else {
          mappings.push(nextMapping);
        }
        results.push({
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          targetEventId: writeResult.targetEventId,
          status: writeResult.status || "ok"
        });
      } catch (error) {
        results.push({
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const cleanupResult = await this.cleanupStaleMirrors(mappings);
    this.store.save({ mappings: cleanupResult.mappings });
    const allResults = [...results, ...cleanupResult.results];
    return {
      attempted: operations.length + cleanupResult.attempted,
      succeeded: allResults.filter((item) => item.status !== "error" && item.status !== "skipped").length,
      failed: allResults.filter((item) => item.status === "error").length,
      skipped: allResults.filter((item) => item.status === "skipped").length,
      storePath: this.store.filePath,
      results: allResults,
      mappings: cleanupResult.mappings,
      cleanup: cleanupResult
    };
  }

  targetAdapterKey(provider) {
    if (provider === "m365" || provider === "outlook") return "microsoft";
    if (provider === "google") return "google";
    return "caldav";
  }
}
