import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EncryptedFileStateStore } from "../solutions/marvin-engine/src/storage/encrypted-file-state-store.mjs";
import { FileStateStore, atomicWriteJson } from "../solutions/marvin-engine/src/storage/file-state-store.mjs";
import { FileTokenStore, buildTokenStorePath } from "../solutions/marvin-engine/src/storage/file-token-store.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-storage-security-"));
const originalHosted = process.env.MARVIN_HOSTED;
const originalKey = process.env.MARVIN_DATA_PROTECTION_KEY;

try {
  process.env.MARVIN_HOSTED = "false";
  delete process.env.MARVIN_DATA_PROTECTION_KEY;

  const tokenPath = buildTokenStorePath(tempRoot, "storage-security");
  const tokenStore = new FileTokenStore(tokenPath);
  const tokenState = {
    records: [{
      calendarId: "work",
      provider: "m365",
      accessToken: "sensitive-access-token",
      refreshToken: "sensitive-refresh-token"
    }]
  };
  tokenStore.save(tokenState);
  const rawTokenState = fs.readFileSync(tokenPath, "utf8");
  assert.doesNotMatch(rawTokenState, /sensitive-access-token|sensitive-refresh-token/);
  assert.match(rawTokenState, /project-marvin\.aes-256-gcm/);
  assert.equal(tokenStore.load().records[0].refreshToken, "sensitive-refresh-token");

  const secretPath = path.join(tempRoot, ".marvin", "provider-secrets", "storage-security.secrets.json");
  const secretStore = new EncryptedFileStateStore(secretPath, {});
  secretStore.save({ microsoftClientSecret: "microsoft-secret", caldavPasswords: { apple: "apple-password" } });
  const rawSecrets = fs.readFileSync(secretPath, "utf8");
  assert.doesNotMatch(rawSecrets, /microsoft-secret|apple-password/);
  assert.equal(secretStore.load().caldavPasswords.apple, "apple-password");

  execFileSync(process.execPath, [path.resolve("scripts/store-marvin-provider-secrets.mjs"), "--root", tempRoot, "--profile", "merge-security", "--merge"], {
    input: JSON.stringify({ microsoftClientSecret: "merge-microsoft-secret" }),
    windowsHide: true
  });
  execFileSync(process.execPath, [path.resolve("scripts/store-marvin-provider-secrets.mjs"), "--root", tempRoot, "--profile", "merge-security", "--merge"], {
    input: JSON.stringify({ googleClientSecret: "merge-google-secret" }),
    windowsHide: true
  });
  const mergedSecretPath = path.join(tempRoot, ".marvin", "provider-secrets", "merge-security.secrets.json");
  const mergedStore = new EncryptedFileStateStore(mergedSecretPath, {});
  assert.equal(mergedStore.load().microsoftClientSecret, "merge-microsoft-secret");
  assert.equal(mergedStore.load().googleClientSecret, "merge-google-secret");
  assert.doesNotMatch(fs.readFileSync(mergedSecretPath, "utf8"), /merge-microsoft-secret|merge-google-secret/);

  execFileSync(process.execPath, [path.resolve("scripts/store-marvin-provider-secrets.mjs"), "--root", tempRoot, "--profile", "bom-security"], {
    input: `\uFEFF${JSON.stringify({ microsoftClientSecret: "bom-microsoft-secret" })}`,
    windowsHide: true
  });
  const bomSecretPath = path.join(tempRoot, ".marvin", "provider-secrets", "bom-security.secrets.json");
  const bomStore = new EncryptedFileStateStore(bomSecretPath, {});
  assert.equal(bomStore.load().microsoftClientSecret, "bom-microsoft-secret");
  assert.doesNotMatch(fs.readFileSync(bomSecretPath, "utf8"), /bom-microsoft-secret/);

  const legacyPath = path.join(tempRoot, ".marvin", "tokens", "legacy.tokens.json");
  atomicWriteJson(legacyPath, { records: [{ refreshToken: "legacy-refresh-token" }] });
  const legacyStore = new FileTokenStore(legacyPath);
  assert.equal(legacyStore.load().records[0].refreshToken, "legacy-refresh-token");
  assert.doesNotMatch(fs.readFileSync(legacyPath, "utf8"), /legacy-refresh-token/);

  const statePath = path.join(tempRoot, ".marvin", "runtime", "state.json");
  const stateStore = new FileStateStore(statePath, { value: "default" });
  stateStore.save({ value: "valid" });
  fs.writeFileSync(path.join(path.dirname(statePath), ".state.json.interrupted.tmp"), "{incomplete", "utf8");
  assert.equal(stateStore.load().value, "valid");
  assert.equal(stateStore.load()._schemaVersion, 1);

  atomicWriteJson(statePath, { value: "legacy-state" });
  assert.equal(stateStore.load().value, "legacy-state");
  assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8"))._schemaVersion, 1);
  const migrationBackups = fs.readdirSync(path.join(path.dirname(statePath), ".migration-backup"));
  assert.equal(migrationBackups.length, 1);
  assert.match(fs.readFileSync(path.join(path.dirname(statePath), ".migration-backup", migrationBackups[0]), "utf8"), /legacy-state/);

  atomicWriteJson(statePath, { _schemaVersion: 999, value: "future" });
  assert.throws(() => stateStore.load(), /newer than supported schema/i);

  process.env.MARVIN_HOSTED = "true";
  delete process.env.MARVIN_DATA_PROTECTION_KEY;
  const hostedStore = new EncryptedFileStateStore(path.join(tempRoot, "hosted", "tokens.json"), {});
  assert.throws(() => hostedStore.save({ secret: "blocked" }), /MARVIN_DATA_PROTECTION_KEY is required/i);

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "Token encryption at rest",
      "Provider-secret encryption at rest",
      "Encrypted provider-secret merge",
      "PowerShell BOM-prefixed secret input",
      "Legacy plaintext migration",
      "Atomic state replacement",
      "Recoverable legacy schema migration",
      "Schema-version rejection",
      "Hosted key requirement"
    ]
  }, null, 2));
} finally {
  if (originalHosted === undefined) delete process.env.MARVIN_HOSTED;
  else process.env.MARVIN_HOSTED = originalHosted;
  if (originalKey === undefined) delete process.env.MARVIN_DATA_PROTECTION_KEY;
  else process.env.MARVIN_DATA_PROTECTION_KEY = originalKey;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
