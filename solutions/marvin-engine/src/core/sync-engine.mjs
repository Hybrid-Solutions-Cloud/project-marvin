import { buildPlan } from "./planner.mjs";

export class SyncEngine {
  constructor({ profile, store, adapters, sourceEvents = [] }) {
    this.profile = profile;
    this.store = store;
    this.adapters = adapters;
    this.sourceEvents = sourceEvents;
  }

  buildOperations() {
    const plan = buildPlan(this.profile, this.sourceEvents);
    return plan.flatMap((entry) => entry.targets.map((target) => ({
      source: entry.source,
      event: entry.event,
      target,
      payload: entry.payload
    })));
  }

  dryRun() {
    const state = this.store.load();
    const operations = this.buildOperations();
    return {
      profile: this.profile.name,
      timezone: this.profile.timezone,
      syncWindowDays: this.profile.syncWindowDays,
      sourceEvents: this.sourceEvents.length,
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
      mirrorMode: operation.payload.mirrorMode,
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

  targetAdapterKey(provider) {
    if (provider === 'm365' || provider === 'outlook') return 'microsoft';
    if (provider === 'google') return 'google';
    return 'caldav';
  }
}
