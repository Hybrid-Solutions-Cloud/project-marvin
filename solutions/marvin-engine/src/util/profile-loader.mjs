import fs from "node:fs";
import path from "node:path";
import { assessProfileConnections } from "./provider-connections.mjs";

export function loadProfile(profilePath) {
  const resolved = path.resolve(profilePath);
  const profile = JSON.parse(fs.readFileSync(resolved, "utf8"));

  return {
    path: resolved,
    profile,
    connections: assessProfileConnections(profile)
  };
}
