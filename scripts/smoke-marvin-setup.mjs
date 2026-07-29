import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const profileName = "marvin-setup-smoke";
const profileSlug = profileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();

const targets = [
  path.join(root, "profiles", `${profileSlug}.json`),
  path.join(root, "profiles", `${profileSlug}.events.json`),
  path.join(root, ".marvin", `${profileSlug}.setup.json`),
  path.join(root, ".marvin", "provider-secrets", `${profileSlug}.secrets.json`),
  path.join(root, ".marvin", "connections", `${profileSlug}.connections.json`),
  path.join(root, "artifacts", "solutions", profileSlug)
];

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanup() {
  for (const targetPath of targets) {
    removeIfExists(targetPath);
  }
}

cleanup();

try {
  const output = execFileSync("powershell", [
    "-ExecutionPolicy", "Bypass",
    "-File", ".\\scripts\\setup-marvin.ps1",
    "-ProfileName", profileName,
    "-MarvinOperatorEmail", "marvin-setup-smoke@example.com",
    "-NoPrompt",
    "-RunGenerators",
    "-IncludeApple",
    "-WorkEmail", "work@example.com",
    "-ContractEmail", "contract@example.com",
    "-GoogleEmail", "personal@example.com",
    "-FamilyEmail", "family@example.com",
    "-AppleEmail", "apple@example.com",
    "-AppleCalDavServerUrl", "https://caldav.example.com/calendars/personal",
    "-AppleCalDavUsername", "apple-user",
    "-AppleCalDavAppPassword", "apple-secret",
    "-MicrosoftClientId", "ms-client",
    "-MicrosoftClientSecret", "ms-secret",
    "-GoogleClientId", "google-client",
    "-GoogleClientSecret", "google-secret"
  ], { cwd: root, stdio: "pipe", encoding: "utf8" });

  const profilePath = path.join(root, "profiles", `${profileSlug}.json`);
  const eventsPath = path.join(root, "profiles", `${profileSlug}.events.json`);
  const setupPath = path.join(root, ".marvin", `${profileSlug}.setup.json`);
  const secretsPath = path.join(root, ".marvin", "provider-secrets", `${profileSlug}.secrets.json`);
  const connectionsPath = path.join(root, ".marvin", "connections", `${profileSlug}.connections.json`);
  const summaryPath = path.join(root, "artifacts", "solutions", profileSlug, "summary.json");

  for (const filePath of [profilePath, eventsPath, setupPath, secretsPath, connectionsPath, summaryPath]) {
    assert.equal(fs.existsSync(filePath), true, `Expected generated file: ${filePath}`);
  }

  const setupScript = fs.readFileSync(path.join(root, "scripts", "setup-marvin.ps1"), "utf8");

  const profile = readJson(profilePath);
  const events = readJson(eventsPath);
  const setup = readJson(setupPath);
  const secrets = readJson(secretsPath);
  const connections = readJson(connectionsPath);
  const summary = readJson(summaryPath);

  assert.equal(profile.name, profileSlug);
  assert.equal(profile.calendars.length, 5);
  assert.equal(profile.routes.length, 5);
  assert.equal(profile.runtime.providerConnections.microsoft.clientId, "ms-client");
  assert.equal(profile.runtime.providerConnections.google.clientId, "google-client");

  const appleCalendar = profile.calendars.find((calendar) => calendar.id === "personal_apple");
  assert.ok(appleCalendar, "Expected Apple calendar in generated profile.");
  assert.equal(appleCalendar.caldavServerUrl, "https://caldav.example.com/calendars/personal");
  assert.equal(appleCalendar.caldavUsername, "apple-user");

  assert.ok(Array.isArray(events.events) && events.events.length >= 4, "Expected generated event fixtures.");
  assert.equal(setup.profileName, profileSlug);
  assert.equal(setup.accounts.length, 5);
  assert.equal(setup.connectionSummary.readyForLiveSync, true);
  assert.equal(setup.providerSecretStatus.microsoftClientSecretConfigured, true);
  assert.equal(setup.providerSecretStatus.googleClientSecretConfigured, true);
  assert.equal(setup.providerSecretStatus.caldavPasswordsConfigured.personal_apple, true);
  assert.equal(setup.providerRequirements.microsoft.redirectUri, "http://127.0.0.1:4177/marvin-api/oauth/microsoft/callback");
  assert.equal(setup.providerRequirements.google.redirectUri, "http://127.0.0.1:4177/marvin-api/oauth/google/callback");
  assert.equal(setup.providerRequirements.microsoft.delegatedPermissions.length, 2);

  const setupApple = setup.accounts.find((account) => account.id === "personal_apple");
  assert.ok(setupApple, "Expected Apple account in setup state.");
  assert.equal(setupApple.connectorReady, true);
  assert.equal(setupApple.caldavPasswordConfigured, true);

  assert.equal(secrets.microsoftClientSecret, "ms-secret");
  assert.equal(secrets.googleClientSecret, "google-secret");
  assert.equal(secrets.caldavPasswords.personal_apple, "apple-secret");

  assert.equal(Array.isArray(connections.records), true);
  assert.equal(connections.records.length, 5);
  assert.equal(summary.profile, profileSlug);
  assert.equal(summary.solutions.length, 4);
  assert.match(setupScript, /IncludeBureaucraticFlow/);
  assert.match(setupScript, /Bureaucratic Flow runtime tenant ID/);
  assert.doesNotMatch(setupScript, /Power Automate runtime tenant ID/);
  assert.match(output, /Open the Calendars list, finish Access setup, link each calendar, and run Check Access until Link status shows ready\./);
  assert.match(output, /Review the Marvin Workspace card and each calendar card before starting automation\./);
  assert.match(output, /npm run marvin:verify-local/);

  console.log(JSON.stringify({
    ok: true,
    profile: profile.name,
    calendars: profile.calendars.length,
    routes: profile.routes.length,
    generatedSolutions: summary.solutions.map((item) => item.name)
  }, null, 2));
} finally {
  cleanup();
}
