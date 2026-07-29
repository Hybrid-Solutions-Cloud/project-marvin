import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-google-app-plan-smoke-${Date.now()}`);
const profileName = "marvin-google-app-plan-smoke";
const profileSlug = profileName.toLowerCase();
const stateDir = path.join(tempRoot, ".marvin");
const providerSecretsDir = path.join(stateDir, "provider-secrets");
const providerAppsDir = path.join(stateDir, "provider-apps");
const profilesDir = path.join(tempRoot, "profiles");
const setupPath = path.join(stateDir, `${profileSlug}.setup.json`);
const outputPath = path.join(tempRoot, "google-plan.json");
const secretsPath = path.join(providerSecretsDir, `${profileSlug}.secrets.json`);
const appStatePath = path.join(providerAppsDir, `${profileSlug}.google.json`);
const profilePath = path.join(profilesDir, `${profileSlug}.json`);

fs.mkdirSync(providerSecretsDir, { recursive: true });
fs.mkdirSync(providerAppsDir, { recursive: true });
fs.mkdirSync(profilesDir, { recursive: true });

fs.writeFileSync(setupPath, JSON.stringify({
  profileName,
  deployment: {
    marvinUrl: "https://marvin.example.com"
  },
  providerRequirements: {
    marvinBaseUrl: "https://marvin.example.com",
    google: {
      required: true,
      redirectUri: "https://marvin.example.com/marvin-api/oauth/google/callback"
    }
  }
}, null, 2));

fs.writeFileSync(profilePath, JSON.stringify({
  name: profileName,
  runtime: {
    providerConnections: {
      google: {
        provider: "google",
        authMode: "marvin-engine",
        clientId: "",
        marvinBaseUrl: "",
        authorizePath: "/auth/google"
      }
    }
  }
}, null, 2));

execFileSync("pwsh", [
  "-ExecutionPolicy", "Bypass",
  "-File", ".\\scripts\\register-marvin-google-app.ps1",
  "-ProfileName", profileName,
  "-RootDir", tempRoot,
  "-EmitOnly",
  "-OutputPath", outputPath
], {
  cwd: repoRoot,
  windowsHide: true,
  stdio: "pipe"
});

const plan = JSON.parse(fs.readFileSync(outputPath, "utf8"));
assert.equal(plan.profileName, profileSlug);
assert.equal(plan.provider, "google");
assert.equal(plan.creationMode, "console-only");
assert.equal(plan.redirectUri, "https://marvin.example.com/marvin-api/oauth/google/callback");
assert.match(plan.reason, /Google OAuth clients/i);
assert.equal(plan.authorizePath, "/marvin-api/oauth/google/start");
assert.ok(plan.consoleUrls.oauthClients.includes("console.cloud.google.com"));
assert.ok(plan.oauthScopes.includes("https://www.googleapis.com/auth/calendar"));

execFileSync("pwsh", [
  "-ExecutionPolicy", "Bypass",
  "-File", ".\\scripts\\register-marvin-google-app.ps1",
  "-ProfileName", profileName,
  "-RootDir", tempRoot,
  "-GoogleClientId", "google-client-id",
  "-GoogleClientSecret", "google-client-secret"
], {
  cwd: repoRoot,
  windowsHide: true,
  stdio: "pipe"
});

const updatedSetup = JSON.parse(fs.readFileSync(setupPath, "utf8"));
const updatedSecrets = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
const updatedAppState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));
const updatedProfile = JSON.parse(fs.readFileSync(profilePath, "utf8"));

assert.equal(updatedSetup.providerCredentials.googleClientId, "google-client-id");
assert.equal(updatedSetup.providerSecretStatus.googleClientSecretConfigured, true);
assert.equal(updatedSetup.providerRequirements.google.clientIdConfigured, true);
assert.equal(updatedSecrets.googleClientSecret, "google-client-secret");
assert.equal(updatedAppState.clientId, "google-client-id");
assert.equal(updatedAppState.creationMode, "console-only");
assert.equal(updatedProfile.runtime.providerConnections.google.clientId, "google-client-id");
assert.equal(updatedProfile.runtime.providerConnections.google.authMode, "marvin-engine");
assert.equal(updatedProfile.runtime.providerConnections.google.marvinBaseUrl, "https://marvin.example.com");
assert.equal(updatedProfile.runtime.providerConnections.google.authorizePath, "/marvin-api/oauth/google/start");

console.log(JSON.stringify({
  ok: true,
  redirectUri: plan.redirectUri,
  creationMode: plan.creationMode,
  appliedClientId: updatedProfile.runtime.providerConnections.google.clientId
}, null, 2));

fs.rmSync(tempRoot, { recursive: true, force: true });
