import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../solutions/marvin-engine/src/storage/file-state-store.mjs";

const BACKUP_FORMAT = "project-marvin.backup.aes-256-gcm";
const LEGACY_BACKUP_FORMAT = Buffer.from("cGFyYW5vaWQta2VlcGVyLmJhY2t1cC5hZXMtMjU2LWdjbQ==", "base64").toString("utf8");
const BACKUP_VERSION = 1;
const INCLUDED_PATHS = [
  "profiles",
  ".marvin",
  ".marvin/latest.json",
  ".marvin/setup.json",
  ".marvin/connections",
  ".marvin/tokens",
  ".marvin/provider-secrets",
  ".marvin/mappings",
  ".marvin/subscriptions",
  ".marvin/operators",
  ".marvin/keys"
];
const EXCLUDED_SUFFIXES = [".tmp", ".process.json", ".runtime.json", ".session.json"];

function normalizeString(value) {
  return String(value ?? "").trim();
}

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? normalizeString(process.argv[index + 1]) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function ensureInside(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} resolves outside the allowed root.`);
  }
  return resolved;
}

function listFiles(root, current) {
  if (!fs.existsSync(current)) return [];
  const stat = fs.statSync(current);
  if (stat.isFile()) return [current];
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, target) : [target];
  });
}

function shouldInclude(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  return !EXCLUDED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
    && !normalized.includes("restore-safety/")
    && !normalized.includes("migration-backup/")
    && !normalized.includes(".marvin/backups/")
    && !normalized.includes(".marvin/sessions/");
}

function collectFiles(root) {
  const seen = new Set();
  return INCLUDED_PATHS.flatMap((relative) => listFiles(root, ensureInside(root, path.join(root, relative), "Backup path")))
    .filter((filePath) => {
      const relative = path.relative(root, filePath).replaceAll("\\", "/");
      if (!relative || seen.has(relative) || !shouldInclude(relative)) return false;
      seen.add(relative);
      return true;
    })
    .map((filePath) => {
      const contents = fs.readFileSync(filePath);
      const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
      return { path: relativePath, bytes: contents.length, sha256: sha256(contents), contents: contents.toString("base64") };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

function encryptPayload(payload, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: payload.createdAt,
    profileCount: payload.profileCount,
    fileCount: payload.files.length,
    kdf: { algorithm: "scrypt", N: 16384, r: 8, p: 1, salt: salt.toString("base64") },
    cipher: { algorithm: "AES-256-GCM", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptEnvelope(filePath, passphrase) {
  const envelope = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (![BACKUP_FORMAT, LEGACY_BACKUP_FORMAT].includes(envelope?.format) || Number(envelope?.version) !== BACKUP_VERSION) throw new Error("Unsupported Project Marvin backup format or version.");
  const salt = Buffer.from(envelope.kdf?.salt || "", "base64");
  const iv = Buffer.from(envelope.cipher?.iv || "", "base64");
  const tag = Buffer.from(envelope.cipher?.tag || "", "base64");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext || "", "base64")), decipher.final()]).toString("utf8"));
  } catch {
    throw new Error("Backup authentication failed. The passphrase is wrong or the backup is corrupt.");
  }
}

function verifyPayload(payload) {
  if (Number(payload?.version) !== BACKUP_VERSION || !Array.isArray(payload?.files)) throw new Error("Backup payload is not compatible with this runtime.");
  const paths = new Set();
  for (const record of payload.files) {
    const normalized = normalizeString(record.path).replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || paths.has(normalized)) throw new Error("Backup contains an unsafe or duplicate path.");
    paths.add(normalized);
    const contents = Buffer.from(record.contents || "", "base64");
    if (contents.length !== Number(record.bytes) || sha256(contents) !== record.sha256) throw new Error(`Backup integrity check failed for ${normalized}.`);
  }
  return { ok: true, createdAt: payload.createdAt, files: payload.files.length, profiles: Number(payload.profileCount || 0) };
}

function backup() {
  const root = path.resolve(argument("--root", process.cwd()));
  const output = path.resolve(argument("--output"));
  if (!argument("--output")) throw new Error("backup requires --output <file.marvinbackup>.");
  const passphrase = normalizeString(process.env[argument("--passphrase-env", "MARVIN_BACKUP_PASSPHRASE")]);
  if (passphrase.length < 16) throw new Error("Backup passphrase must be supplied through the configured environment variable and contain at least 16 characters.");
  const files = collectFiles(root);
  if (files.length === 0) throw new Error("No Project Marvin state files were found to back up.");
  const payload = {
    version: BACKUP_VERSION,
    product: "project-marvin",
    createdAt: new Date().toISOString(),
    profileCount: files.filter((item) => /^profiles\/[^/]+\.json$/i.test(item.path) && !item.path.endsWith(".events.json")).length,
    files
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  atomicWriteFile(output, `${JSON.stringify(encryptPayload(payload, passphrase), null, 2)}\n`, { mode: 0o600 });
  return { ok: true, operation: "backup", output, files: files.length, profiles: payload.profileCount, encrypted: true };
}

function verify() {
  const input = path.resolve(argument("--input"));
  if (!argument("--input") || !fs.existsSync(input)) throw new Error("verify requires an existing --input <file.marvinbackup>.");
  const passphrase = normalizeString(process.env[argument("--passphrase-env", "MARVIN_BACKUP_PASSPHRASE")]);
  return { operation: "verify", input, ...verifyPayload(decryptEnvelope(input, passphrase)) };
}

function restore() {
  const input = path.resolve(argument("--input"));
  const targetRootArg = argument("--target-root");
  if (!argument("--input") || !fs.existsSync(input)) throw new Error("restore requires an existing --input <file.marvinbackup>.");
  if (!targetRootArg) throw new Error("restore requires an explicit --target-root.");
  const targetRoot = path.resolve(targetRootArg);
  const passphrase = normalizeString(process.env[argument("--passphrase-env", "MARVIN_BACKUP_PASSPHRASE")]);
  const payload = decryptEnvelope(input, passphrase);
  const verification = verifyPayload(payload);
  const existing = payload.files.filter((record) => fs.existsSync(ensureInside(targetRoot, path.join(targetRoot, record.path), "Restore path")));
  if (existing.length > 0 && !hasFlag("--allow-overwrite")) throw new Error(`Restore target already contains ${existing.length} tracked file(s). Use an isolated target or explicitly pass --allow-overwrite.`);
  const safetyRoot = path.join(targetRoot, ".marvin", "restore-safety", new Date().toISOString().replace(/[:.]/g, "-"));
  for (const record of payload.files) {
    const destination = ensureInside(targetRoot, path.join(targetRoot, record.path), "Restore path");
    if (fs.existsSync(destination)) {
      const safetyCopy = ensureInside(safetyRoot, path.join(safetyRoot, record.path), "Restore safety path");
      fs.mkdirSync(path.dirname(safetyCopy), { recursive: true });
      fs.copyFileSync(destination, safetyCopy);
    }
    const contents = Buffer.from(record.contents, "base64");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    atomicWriteFile(destination, contents, { encoding: null, mode: 0o600 });
  }
  return { ok: true, operation: "restore", input, targetRoot, files: verification.files, profiles: verification.profiles, overwritten: existing.length, safetyCopyCreated: existing.length > 0 };
}

const command = normalizeString(process.argv[2]);
const result = command === "backup" ? backup() : command === "verify" ? verify() : command === "restore" ? restore() : null;
if (!result) throw new Error("Usage: node scripts/marvin-state-tool.mjs <backup|verify|restore> [options]");
console.log(JSON.stringify(result, null, 2));
