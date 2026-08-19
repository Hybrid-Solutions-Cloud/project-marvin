import fs from "node:fs";
import path from "node:path";
import { EncryptedFileStateStore } from "../solutions/marvin-engine/src/storage/encrypted-file-state-store.mjs";
import { normalizeProviderSecrets, buildProviderSecretsPath } from "../solutions/marvin-engine/src/util/provider-secrets.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

const rootDir = path.resolve(option("--root") || process.cwd());
const profileName = option("--profile");
const merge = process.argv.includes("--merge");
if (!profileName) throw new Error("--profile is required.");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const inputText = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "").trim();
const input = inputText ? JSON.parse(inputText) : {};
const secretPath = buildProviderSecretsPath(rootDir, profileName);
const store = new EncryptedFileStateStore(secretPath, normalizeProviderSecrets({}));
const incoming = normalizeProviderSecrets(input);
const existing = merge ? normalizeProviderSecrets(store.load()) : normalizeProviderSecrets({});
const secrets = normalizeProviderSecrets({
  microsoftClientSecret: incoming.microsoftClientSecret || existing.microsoftClientSecret,
  googleClientSecret: incoming.googleClientSecret || existing.googleClientSecret,
  caldavPassword: incoming.caldavPassword || existing.caldavPassword,
  caldavPasswords: { ...existing.caldavPasswords, ...incoming.caldavPasswords }
});
store.save(secrets);

process.stdout.write(`${JSON.stringify({
  ok: true,
  path: secretPath,
  configured: {
    microsoft: Boolean(secrets.microsoftClientSecret),
    google: Boolean(secrets.googleClientSecret),
    caldavCalendars: Object.keys(secrets.caldavPasswords || {}).length
  }
})}\n`);
