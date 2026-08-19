import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const CURRENT_STATE_SCHEMA_VERSION = 1;

export function atomicWriteFile(filePath, contents, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const directory = path.dirname(resolvedPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(resolvedPath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", options.mode ?? 0o600);
    fs.writeFileSync(descriptor, contents, { encoding: options.encoding || "utf8" });
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, resolvedPath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

export function atomicWriteJson(filePath, state) {
  atomicWriteFile(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export class FileStateStore {
  constructor(filePath, defaultState = {}, options = {}) {
    this.filePath = path.resolve(filePath);
    this.defaultState = structuredClone(defaultState);
    this.schemaVersion = Number(options.schemaVersion || CURRENT_STATE_SCHEMA_VERSION);
    this.migrations = options.migrations || {};
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return structuredClone(this.defaultState);
    }

    const originalContents = fs.readFileSync(this.filePath, "utf8");
    let state = JSON.parse(originalContents);
    let version = Number(state?._schemaVersion || 0);
    const originalVersion = version;
    if (version > this.schemaVersion) {
      throw new Error(`State schema ${version} is newer than supported schema ${this.schemaVersion}: ${this.filePath}`);
    }
    while (version < this.schemaVersion) {
      const migrate = this.migrations[version];
      state = typeof migrate === "function" ? migrate(state) : state;
      if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error(`State migration ${version} returned an invalid document: ${this.filePath}`);
      version += 1;
    }
    const migrated = { ...state, _schemaVersion: this.schemaVersion };
    if (originalVersion < this.schemaVersion) {
      const backupRoot = path.join(path.dirname(this.filePath), ".migration-backup");
      const backupName = `${path.basename(this.filePath)}.schema-${originalVersion}.${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      atomicWriteFile(path.join(backupRoot, backupName), originalContents, { mode: 0o600 });
      atomicWriteJson(this.filePath, migrated);
    }
    return migrated;
  }

  save(state) {
    atomicWriteJson(this.filePath, { ...state, _schemaVersion: this.schemaVersion });
  }
}
