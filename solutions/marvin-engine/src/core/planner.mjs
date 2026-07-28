import { buildMirrorPayload } from "./policy.mjs";

export function buildPlan(profile, sourceEvents = []) {
  const calendars = new Map(profile.calendars.map((calendar) => [calendar.id, calendar]));
  return profile.routes.flatMap((route) => {
    const source = calendars.get(route.source);
    const targets = route.targets.map((targetId) => calendars.get(targetId)).filter(Boolean);
    const events = sourceEvents.filter((event) => event.calendarId === route.source);
    return events.map((event) => ({
      route,
      source,
      event,
      targets,
      payload: buildMirrorPayload(route, source, event)
    }));
  });
}
