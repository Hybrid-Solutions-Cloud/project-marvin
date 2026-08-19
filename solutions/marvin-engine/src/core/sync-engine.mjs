import { buildPlan } from "./planner.mjs";
import crypto from "node:crypto";

const LEGACY_MANAGED_BY = Buffer.from("cGFyYW5vaWQta2VlcGVy", "base64").toString("utf8");

function isKnownMirroredEvent(event, mappings = []) {
  return mappings.some((item) => item.targetCalendarId === event.calendarId && item.targetEventId === event.id);
}

function isManagedMirrorEvent(event, mappings = []) {
  return Boolean(event?.mirroredByMarvin) || isKnownMirroredEvent(event, mappings);
}

function buildSourceEventKey(calendarId, eventId) {
  return `${calendarId}::${eventId}`;
}

function buildPayloadHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeChangeCursor(value) {
  return String(value || "").trim();
}

function normalizeEventIdentity(value) {
  return String(value || "").trim();
}

function updateEventIdentityIndex(existing = {}, calendarId, events = [], deletedEventIds = []) {
  const next = { ...(existing || {}) };
  const calendarIndex = { ...(next[calendarId] || {}) };
  for (const eventId of deletedEventIds) delete calendarIndex[eventId];
  for (const event of events) {
    const identity = normalizeEventIdentity(event?.providerEventIdentity);
    if (!event?.id || !identity) continue;
    calendarIndex[event.id] = { identity, observedAt: new Date().toISOString() };
  }
  next[calendarId] = calendarIndex;
  return next;
}

function targetAlreadyHasSourceEvent(operation, eventIdentities = {}) {
  const identity = normalizeEventIdentity(operation?.event?.providerEventIdentity);
  if (!identity) return false;
  return Object.values(eventIdentities?.[operation.target.id] || {}).some((entry) => normalizeEventIdentity(entry?.identity) === identity);
}

function providerDeleteEnabled() {
  return String(process.env.MARVIN_PROVIDER_DELETE_MODE || "disabled").trim().toLowerCase() === "managed-mirrors-only";
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
    const state = this.store.load();
    const mappings = Array.isArray(state?.mappings) ? state.mappings : [];
    const changeTracking = { ...(state?.changeTracking || {}) };
    let eventIdentities = { ...(state?.eventIdentities || {}) };
    const deletedSourceEventKeys = [];

    for (const calendar of this.profile.calendars) {
      const adapter = this.adapters[this.targetAdapterKey(calendar.provider)];
      const readiness = getCalendarReadiness(adapter, calendar);
      if (!readiness.ready || !adapter?.listSourceEvents) {
        continue;
      }
      try {
        const requestOptions = {
          timezone: this.profile.timezone,
          windowStart,
          windowEnd,
          profile: this.profile
        };
        let providerEvents = [];
        let providerDeletedEventIds = [];
        if (typeof adapter.listSourceEventChanges === "function") {
          const hasIdentityBaseline = Object.prototype.hasOwnProperty.call(eventIdentities, calendar.id);
          const changes = await adapter.listSourceEventChanges(calendar, {
            ...requestOptions,
            // An identity baseline is required to suppress meetings that already
            // exist in another selected calendar. Rebuild it once when upgrading
            // state that predates provider event identity tracking.
            deltaLink: hasIdentityBaseline ? normalizeChangeCursor(changeTracking[calendar.id]?.deltaLink) : ""
          });
          providerEvents = Array.isArray(changes?.events) ? changes.events : [];
          providerDeletedEventIds = Array.isArray(changes?.deletedEventIds) ? changes.deletedEventIds : [];
          deletedSourceEventKeys.push(...providerDeletedEventIds.map((eventId) => buildSourceEventKey(calendar.id, eventId)));
          if (changes?.deltaLink) {
            changeTracking[calendar.id] = {
              provider: calendar.provider,
              providerCalendarId: calendar.providerCalendarId || "",
              deltaLink: changes.deltaLink,
              updatedAt: new Date().toISOString()
            };
          }
        } else {
          providerEvents = await adapter.listSourceEvents(calendar, requestOptions);
        }
        const filteredEvents = providerEvents.filter((event) => !isManagedMirrorEvent(event, mappings));
        eventIdentities = updateEventIdentityIndex(eventIdentities, calendar.id, filteredEvents, providerDeletedEventIds);
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
      deletedSourceEventKeys,
      changeTracking,
      eventIdentities,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString()
    };
    return {
      loaded: events.length,
      skippedMirrors,
      calendars: this.profile.calendars.length,
      loadedCalendarIds,
      errors,
      deletedSourceEventKeys,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      events
    };
  }

  buildOperations() {
    const filteredSourceEvents = this.getLoopFilteredSourceEvents(this.sourceEvents);
    const plan = buildPlan(this.profile, filteredSourceEvents);
    const eventIdentities = this.lastSourceLoad?.eventIdentities || this.store.load()?.eventIdentities || {};
    return plan.flatMap((entry) => entry.targets.map((target) => ({
      source: entry.source,
      event: entry.event,
      target,
      payload: target.payload
    }))).filter((operation) => !targetAlreadyHasSourceEvent(operation, eventIdentities));
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
    const state = this.store.load();
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
      payloadHash: buildPayloadHash(operation.payload),
      managedBy: "project-marvin",
      updatedAt: new Date().toISOString()
    }));
    const nextState = { ...state, mappings: newMappings };
    this.store.save(nextState);
    return {
      applied: newMappings.length,
      storePath: this.store.filePath,
      mappings: newMappings
    };
  }

  async cleanupStaleMirrors(mappings = [], pendingTombstones = []) {
    const loadedCalendarIds = new Set(this.lastSourceLoad?.loadedCalendarIds || []);
    if (loadedCalendarIds.size === 0) {
      return { attempted: 0, succeeded: 0, failed: 0, skipped: 0, results: [], mappings };
    }

    const deletedSourceKeys = new Set([...(Array.isArray(pendingTombstones) ? pendingTombstones : []), ...(this.lastSourceLoad?.deletedSourceEventKeys || [])]);
    const staleMappings = mappings
      .map((mapping, index) => ({ mapping, index }))
      .filter(({ mapping }) => loadedCalendarIds.has(mapping.sourceCalendarId)
        && ["project-marvin", LEGACY_MANAGED_BY].includes(mapping.managedBy)
        && deletedSourceKeys.has(buildSourceEventKey(mapping.sourceCalendarId, mapping.sourceEventId)));

    if (!providerDeleteEnabled()) {
      return {
        attempted: staleMappings.length,
        succeeded: 0,
        failed: 0,
        skipped: staleMappings.length,
        results: staleMappings.map(({ mapping }) => ({
          sourceCalendarId: mapping.sourceCalendarId,
          sourceEventId: mapping.sourceEventId,
          targetCalendarId: mapping.targetCalendarId,
          targetEventId: mapping.targetEventId,
          status: "skipped",
          message: "Provider deletion is disabled. The explicit source tombstone was recorded without deleting the managed mirror."
        })),
        mappings
      };
    }

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
      const payloadHash = buildPayloadHash(operation.payload);
      if (existingMapping?.payloadHash === payloadHash && existingMapping?.targetEventId) {
        results.push({
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          targetEventId: existingMapping.targetEventId,
          status: "unchanged"
        });
        continue;
      }

      try {
        const writeResult = await adapter.upsertEvent(operation, { existingMapping, profile: this.profile });
        const nextMapping = {
          sourceCalendarId: operation.source.id,
          sourceEventId: operation.event.id,
          targetCalendarId: operation.target.id,
          targetEventId: writeResult.targetEventId,
          targetEtag: writeResult.targetEtag || existingMapping?.targetEtag || "",
          sourceSubject: operation.event.subject,
          mirrorMode: operation.payload.mirrorMode,
          visibility: operation.payload.visibility,
          subjectPrefix: operation.payload.subjectPrefix,
          sourceEventTimezone: operation.payload.sourceEventTimezone,
          payloadHash,
          managedBy: "project-marvin",
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

    const pendingTombstones = [...new Set([...(Array.isArray(state?.pendingTombstones) ? state.pendingTombstones : []), ...(this.lastSourceLoad?.deletedSourceEventKeys || [])])];
    const cleanupResult = await this.cleanupStaleMirrors(mappings, pendingTombstones);
    const allResults = [...results, ...cleanupResult.results];
    const failedSourceCalendarIds = new Set([
      ...(this.lastSourceLoad?.errors || []).map((failure) => failure.calendarId),
      ...allResults.filter((result) => result.status === "error").map((result) => result.sourceCalendarId)
    ].filter(Boolean));
    const changeTracking = { ...(state?.changeTracking || {}) };
    for (const [calendarId, cursor] of Object.entries(this.lastSourceLoad?.changeTracking || {})) {
      if (!failedSourceCalendarIds.has(calendarId)) changeTracking[calendarId] = cursor;
    }
    const completedTombstones = new Set(cleanupResult.results
      .filter((result) => result.status === "deleted" || result.status === "already-missing")
      .map((result) => buildSourceEventKey(result.sourceCalendarId, result.sourceEventId)));
    const nextPendingTombstones = pendingTombstones.filter((key) => !completedTombstones.has(key));
    this.store.save({
      ...state,
      mappings: cleanupResult.mappings,
      changeTracking,
      eventIdentities: this.lastSourceLoad?.eventIdentities || state?.eventIdentities || {},
      pendingTombstones: nextPendingTombstones
    });
    return {
      attempted: operations.length + cleanupResult.attempted,
      succeeded: allResults.filter((item) => item.status !== "error" && item.status !== "skipped").length,
      failed: allResults.filter((item) => item.status === "error").length,
      skipped: allResults.filter((item) => item.status === "skipped").length,
      storePath: this.store.filePath,
      results: allResults,
      mappings: cleanupResult.mappings,
      cleanup: cleanupResult,
      changeTrackingCommitted: Object.keys(this.lastSourceLoad?.changeTracking || {}).filter((calendarId) => !failedSourceCalendarIds.has(calendarId)),
      changeTrackingDeferred: [...failedSourceCalendarIds]
    };
  }

  targetAdapterKey(provider) {
    if (provider === "m365" || provider === "outlook") return "microsoft";
    if (provider === "google") return "google";
    return "caldav";
  }
}
