import fs from "node:fs";
import path from "node:path";

export function loadEvents(eventsPath) {
  const resolved = path.resolve(eventsPath);
  const payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return payload.events ?? [];
}
