import path from "node:path";
import { FileStateStore } from "./file-state-store.mjs";

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

export function buildTokenStorePath(rootDir, profileName) {
  return path.resolve(rootDir, ".marvin", "tokens", `${sanitizeName(profileName)}.tokens.json`);
}

export class FileTokenStore extends FileStateStore {
  constructor(filePath) {
    super(filePath, { records: [] });
  }
}
