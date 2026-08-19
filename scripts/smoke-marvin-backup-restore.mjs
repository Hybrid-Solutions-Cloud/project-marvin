import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EncryptedFileStateStore } from "../solutions/marvin-engine/src/storage/encrypted-file-state-store.mjs";
import { runAutomatedBackup } from "../solutions/marvin-engine/src/util/automated-backup.mjs";

const tempRoot = path.resolve(`C:/tmp/marvin-backup-smoke-${Date.now()}`);
const sourceRoot = path.join(tempRoot, "source");
const restoreRoot = path.join(tempRoot, "restore");
const backupPath = path.join(tempRoot, "state.marvinbackup");
const corruptPath = path.join(tempRoot, "corrupt.marvinbackup");
const passphrase = "backup-smoke-passphrase-2026";
const dataKey = crypto.randomBytes(32).toString("base64");
process.env.MARVIN_DATA_PROTECTION_KEY = dataKey;

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, ["scripts/marvin-state-tool.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, MARVIN_BACKUP_PASSPHRASE: passphrase }
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(sourceRoot, "profiles"), { recursive: true });
fs.mkdirSync(path.join(sourceRoot, ".marvin", "mappings"), { recursive: true });
fs.writeFileSync(path.join(sourceRoot, "profiles", "marvin.json"), JSON.stringify({ name: "marvin", calendars: [{ id: "work", email: "operator@example.com" }], _schemaVersion: 1 }, null, 2));
fs.writeFileSync(path.join(sourceRoot, ".marvin", "latest.json"), JSON.stringify({ profileName: "marvin" }, null, 2));
fs.writeFileSync(path.join(sourceRoot, ".marvin", "mappings", "marvin.mappings.json"), JSON.stringify({ mappings: [{ sourceEventId: "event-1", targetEventId: "mirror-1" }], _schemaVersion: 1 }, null, 2));
const secretPath = path.join(sourceRoot, ".marvin", "provider-secrets", "marvin.secrets.json");
new EncryptedFileStateStore(secretPath, {}).save({ microsoftClientSecret: "never-plaintext-secret" });
fs.mkdirSync(path.join(sourceRoot, ".marvin", "runtime"), { recursive: true });
fs.writeFileSync(path.join(sourceRoot, ".marvin", "runtime", "marvin.process.json"), JSON.stringify({ pid: 123 }));

try {
  const backup = run(["backup", "--root", sourceRoot, "--output", backupPath]);
  const backupResult = JSON.parse(backup.stdout);
  assert.equal(backupResult.encrypted, true);
  const rawBackup = fs.readFileSync(backupPath, "utf8");
  assert.doesNotMatch(rawBackup, /never-plaintext-secret|operator@example\.com|event-1|mirror-1/);
  assert.doesNotMatch(rawBackup, /marvin\.process\.json/);

  const verified = JSON.parse(run(["verify", "--input", backupPath]).stdout);
  assert.equal(verified.ok, true);
  assert.ok(verified.files >= 4);

  const restored = JSON.parse(run(["restore", "--input", backupPath, "--target-root", restoreRoot]).stdout);
  assert.equal(restored.overwritten, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(restoreRoot, "profiles", "marvin.json"), "utf8")).name, "marvin");
  assert.equal(new EncryptedFileStateStore(path.join(restoreRoot, ".marvin", "provider-secrets", "marvin.secrets.json"), {}).load().microsoftClientSecret, "never-plaintext-secret");
  assert.equal(fs.existsSync(path.join(restoreRoot, ".marvin", "runtime", "marvin.process.json")), false);

  const refused = run(["restore", "--input", backupPath, "--target-root", restoreRoot], 1);
  assert.match(refused.stderr, /allow-overwrite/i);
  const overwritten = JSON.parse(run(["restore", "--input", backupPath, "--target-root", restoreRoot, "--allow-overwrite"]).stdout);
  assert.ok(overwritten.overwritten > 0);
  assert.equal(overwritten.safetyCopyCreated, true);

  const corrupt = JSON.parse(rawBackup);
  corrupt.ciphertext = `${corrupt.ciphertext.slice(0, -2)}AA`;
  fs.writeFileSync(corruptPath, JSON.stringify(corrupt));
  const corruptResult = run(["verify", "--input", corruptPath], 1);
  assert.match(corruptResult.stderr, /wrong or the backup is corrupt/i);

  process.env.MARVIN_BACKUP_PASSPHRASE = passphrase;
  const backupRoot = path.join(sourceRoot, ".marvin", "backups");
  fs.mkdirSync(backupRoot, { recursive: true });
  const expiredBackup = path.join(backupRoot, "automatic-expired.marvinbackup");
  fs.writeFileSync(expiredBackup, "expired");
  const expiredAt = new Date("2026-01-01T00:00:00Z");
  fs.utimesSync(expiredBackup, expiredAt, expiredAt);
  const automatic = runAutomatedBackup({ rootDir: sourceRoot, appRoot: process.cwd(), now: new Date("2026-08-18T20:00:00Z"), retentionDays: 14 });
  assert.equal(automatic.ok, true);
  assert.equal(automatic.removedExpiredBackups, 1);
  assert.equal(fs.existsSync(automatic.output), true);

  console.log(JSON.stringify({
    ok: true,
    encrypted: true,
    files: verified.files,
    isolatedRestore: true,
    overwriteProtection: true,
    safetyCopy: true,
    corruptionDetected: true,
    automaticBackup: true,
    retentionPruning: true,
    plaintextSecretsFound: false
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
