import { buildMirrorPayload } from "./policy.mjs";

export function buildPlan(profile, sourceEvents = []) {
  const calendars = new Map(profile.calendars.map((calendar) => [calendar.id, calendar]));
  return profile.routes.flatMap((route) => {
    const source = calendars.get(route.source);
    const targets = route.targets
      .map((targetConfig) => {
        const config = typeof targetConfig === "string" ? { calendarId: targetConfig } : targetConfig;
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
