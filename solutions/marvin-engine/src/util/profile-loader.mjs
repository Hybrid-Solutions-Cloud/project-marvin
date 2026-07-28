import fs from "node:fs";
import path from "node:path";

export function loadProfile(profilePath) {
  const resolved = path.resolve(profilePath);
  return {
    path: resolved,
    profile: JSON.parse(fs.readFileSync(resolved, "utf8"))
  };
}
