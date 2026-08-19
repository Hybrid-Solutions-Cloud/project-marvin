import path from "node:path";
import { EncryptedFileStateStore } from "../storage/encrypted-file-state-store.mjs";

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

export function buildProviderSecretsPath(rootDir, profileName) {
  return path.resolve(rootDir, ".marvin", "provider-secrets", `${sanitizeName(profileName)}.secrets.json`);
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeSecretMap(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});
  return Object.fromEntries(entries.map(([key, secret]) => [sanitizeName(key), normalizeString(secret)]).filter(([, secret]) => secret));
}

export function normalizeProviderSecrets(input = {}) {
  const caldavPasswords = normalizeSecretMap(input.caldavPasswords);
  const legacyPassword = normalizeString(input.caldavPassword);
  return {
    microsoftClientSecret: normalizeString(input.microsoftClientSecret),
    googleClientSecret: normalizeString(input.googleClientSecret),
    caldavPassword: legacyPassword,
    caldavPasswords: caldavPasswords
  };
}

export function loadProviderSecretsForProfile(rootDir, profileName) {
  const store = new EncryptedFileStateStore(buildProviderSecretsPath(rootDir, profileName), {
    microsoftClientSecret: "",
    googleClientSecret: "",
    caldavPassword: "",
    caldavPasswords: {}
  });
  return normalizeProviderSecrets(store.load());
}
