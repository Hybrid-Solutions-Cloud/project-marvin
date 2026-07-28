import { buildMirrorPayload } from "./policy.mjs";

export function buildPlan(profile) {
  const calendars = new Map(profile.calendars.map((calendar) => [calendar.id, calendar]));
  return profile.routes.map((route) => {
    const source = calendars.get(route.source);
    const targets = route.targets.map((targetId) => calendars.get(targetId)).filter(Boolean);
    return {
      source,
      targets,
      payload: buildMirrorPayload(route, source)
    };
  });
}
