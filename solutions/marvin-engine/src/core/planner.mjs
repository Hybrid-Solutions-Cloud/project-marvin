import { buildMirrorPayload } from "./policy.mjs";

function normalizeTargetConfig(targetConfig) {
  return typeof targetConfig === "string" ? { calendarId: targetConfig } : (targetConfig || {});
}

// The product contract is all-source-to-all-other-calendars. A profile may add
// per-target policy overrides, but it cannot accidentally omit a calendar from sync.
function buildCompleteRoutes(profile) {
  const configuredRoutes = Array.isArray(profile.routes) ? profile.routes : [];
  return profile.calendars.map((source) => {
    const configuredRoute = configuredRoutes.find((route) => route.source === source.id) || {};
    const configuredTargets = new Map(
      (Array.isArray(configuredRoute.targets) ? configuredRoute.targets : [])
        .map(normalizeTargetConfig)
        .filter((target) => target.calendarId)
        .map((target) => [target.calendarId, target])
    );
    return {
      ...configuredRoute,
      source: source.id,
      targets: profile.calendars
        .filter((target) => target.id !== source.id)
        .map((target) => ({ calendarId: target.id, ...(configuredTargets.get(target.id) || {}) }))
    };
  });
}

export function buildPlan(profile, sourceEvents = []) {
  const calendars = new Map(profile.calendars.map((calendar) => [calendar.id, calendar]));
  return buildCompleteRoutes(profile).flatMap((route) => {
    const source = calendars.get(route.source);
    if (!source) return [];
    const targets = route.targets
      .map(normalizeTargetConfig)
      .map((config) => {
        const target = calendars.get(config.calendarId);
        return target ? { calendar: target, config } : null;
      })
      .filter(Boolean);
    const events = sourceEvents.filter((event) => event.calendarId === route.source);
    return events.map((event) => ({
      route,
      source,
      event,
      targets: targets.map(({ calendar, config }) => ({
        ...calendar,
        policy: config,
        payload: buildMirrorPayload(profile, route, source, calendar, config, event)
      }))
    }));
  });
}