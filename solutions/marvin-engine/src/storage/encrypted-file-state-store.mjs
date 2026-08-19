import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFile, atomicWriteJson, CURRENT_STATE_SCHEMA_VERSION } from "./file-state-store.mjs";

const ENCRYPTED_FORMAT = "project-marvin.aes-256-gcm";
const LEGACY_ENCRYPTED_FORMAT = Buffer.from("cGFyYW5vaWQta2VlcGVyLmFlcy0yNTYtZ2Nt", "base64").toString("utf8");

function decodeConfiguredKey(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (/^[a-f0-9]{64}$/i.test(normalized)) return Buffer.from(normalized, "hex");
  const base64 = Buffer.from(normalized.replace(/^base64:/i, ""), "base64");
  if (base64.length === 32) return base64;
  return crypto.createHash("sha256").update(normalized).digest();
}

function localKeyPath(filePath) {
  const resolved = path.resolve(filePath);
  const segments = resolved.split(path.sep);
  const marvinIndex = segments.lastIndexOf(".marvin");
  const stateRoot = marvinIndex >= 0
    ? segments.slice(0, marvinIndex + 1).join(path.sep) || path.parse(resolved).root
    : path.dirname(resolved);
  return path.join(stateRoot, "keys", "data-protection.key");
}

export function resolveDataProtectionKey(filePath) {
  const configured = decodeConfiguredKey(process.env.MARVIN_DATA_PROTECTION_KEY);
  if (configured) return configured;
  const hosted = String(process.env.MARVIN_HOSTED || "false").toLowerCase() === "true" || process.env.NODE_ENV === "production";
  if (hosted) {
    throw new Error("MARVIN_DATA_PROTECTION_KEY is required in hosted mode before credentials can be read or written.");
  }

  const keyPath = localKeyPath(filePath);
  if (!fs.existsSync(keyPath)) {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    atomicWriteFile(keyPath, `${crypto.randomBytes(32).toString("base64")}\n`, { mode: 0o600 });
  }
  const key = decodeConfiguredKey(fs.readFileSync(keyPath, "utf8"));
  if (!key) throw new Error("Local data-protection key could not be loaded.");
  return key;
}

export class EncryptedFileStateStore {
  constructor(filePath, defaultState = {}, options = {}) {
    this.filePath = path.resolve(filePath);
    this.defaultState = structuredClone(defaultState);
    this.schemaVersion = Number(options.schemaVersion || CURRENT_STATE_SCHEMA_VERSION);
  }

  load() {
    if (!fs.existsSync(this.filePath)) return structuredClone(this.defaultState);
    const persisted = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (persisted?._format !== ENCRYPTED_FORMAT && persisted?._format !== LEGACY_ENCRYPTED_FORMAT) {
      this.save(persisted);
      return { ...persisted, _schemaVersion: this.schemaVersion };
    }
    if (Number(persisted._schemaVersion || 0) > this.schemaVersion) {
      throw new Error(`Encrypted state schema is newer than this runtime: ${this.filePath}`);
    }
    const key = resolveDataProtectionKey(this.filePath);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(persisted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(persisted.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(persisted.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
    return JSON.parse(plaintext);
  }

  save(state) {
    const key = resolveDataProtectionKey(this.filePath);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const plaintext = Buffer.from(JSON.stringify({ ...state, _schemaVersion: this.schemaVersion }), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    atomicWriteJson(this.filePath, {
      _format: ENCRYPTED_FORMAT,
      _schemaVersion: this.schemaVersion,
      algorithm: "AES-256-GCM",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64")
    });
  }
}
