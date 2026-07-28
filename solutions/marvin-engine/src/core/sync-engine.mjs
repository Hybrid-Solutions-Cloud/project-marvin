import { buildPlan } from "./planner.mjs";

export class SyncEngine {
  constructor({ profile, store, adapters }) {
    this.profile = profile;
    this.store = store;
    this.adapters = adapters;
  }

  dryRun() {
    const state = this.store.load();
    const plan = buildPlan(this.profile);
    return {
      profile: this.profile.name,
      timezone: this.profile.timezone,
      syncWindowDays: this.profile.syncWindowDays,
      routes: plan.map((entry) => ({
        source: entry.source.label,
        targets: entry.targets.map((target) => target.label),
        payload: entry.payload
      })),
      knownMappings: state.mappings.length,
      adapters: Object.fromEntries(
        Object.entries(this.adapters).map(([key, adapter]) => [key, adapter.describe()])
      )
    };
  }
}
