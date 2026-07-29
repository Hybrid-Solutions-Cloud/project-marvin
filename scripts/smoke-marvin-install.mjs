import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const profileName = "marvin-install-smoke";
const profileSlug = profileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
const operatorFileName = "marvin-install-smoke-example.com.account.json";

const latestPath = path.join(root, ".marvin", "latest.json");
const installScriptPath = path.join(root, "scripts", "install-marvin.ps1");
const bootstrapScriptPath = path.join(root, "scripts", "bootstrap-marvin.ps1");
const previousLatest = fs.existsSync(latestPath) ? fs.readFileSync(latestPath, "utf8") : null;

const targets = [
  path.join(root, "profiles", `${profileSlug}.json`),
  path.join(root, "profiles", `${profileSlug}.events.json`),
  path.join(root, ".marvin", `${profileSlug}.setup.json`),
  path.join(root, ".marvin", "provider-secrets", `${profileSlug}.secrets.json`),
  path.join(root, ".marvin", "connections", `${profileSlug}.connections.json`),
  path.join(root, ".marvin", "operators", operatorFileName),
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
  const output = execFileSync("pwsh", [
    "-ExecutionPolicy", "Bypass",
    "-File", ".\\scripts\\install-marvin.ps1",
    "-WorkspaceId", profileName,
    "-WorkspaceEmail", "marvin-install-smoke@example.com",
    "-MarvinOperatorDisplayName", "Install Smoke Operator",
    "-WorkspacePassword", "smoke-password",
    "-NoPrompt",
    "-SkipNpmInstall",
    "-SkipSmokeSetup",
    "-SkipVerify",
    "-SkipUiReminder",
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
  ], { cwd: root, encoding: "utf8", stdio: "pipe" });

  const installScript = fs.readFileSync(installScriptPath, "utf8");
  const bootstrapScript = fs.readFileSync(bootstrapScriptPath, "utf8");

  const profilePath = path.join(root, "profiles", `${profileSlug}.json`);
  const setupPath = path.join(root, ".marvin", `${profileSlug}.setup.json`);
  const summaryPath = path.join(root, "artifacts", "solutions", profileSlug, "summary.json");
  const operatorPath = path.join(root, ".marvin", "operators", operatorFileName);

  for (const filePath of [profilePath, setupPath, summaryPath, operatorPath]) {
    assert.equal(fs.existsSync(filePath), true, `Expected generated file: ${filePath}`);
  }

  const profile = readJson(profilePath);
  const setup = readJson(setupPath);
  const summary = readJson(summaryPath);
  const operator = readJson(operatorPath);

  assert.equal(profile.name, profileSlug);
  assert.equal(setup.profileName, profileSlug);
  assert.equal(setup.accounts.length, 5);
  assert.equal(setup.providerRequirements.microsoft.redirectUri, "http://127.0.0.1:4177/marvin-api/oauth/microsoft/callback");
  assert.equal(summary.profile, profileSlug);
  assert.equal(operator.displayName, "Install Smoke Operator");
  assert.equal(operator.email, "marvin-install-smoke@example.com");
  assert.equal(typeof operator.password?.salt, "string");
  assert.equal(typeof operator.password?.hash, "string");
  assert.match(output, /Installing and bootstrapping Project Marvin/);
  assert.match(output, /Creating local Marvin workspace sign-in/);
  assert.match(output, /Marvin install completed\./);
  assert.match(output, /Sign in with the Marvin workspace account created by this install run\./);
  assert.match(output, /npm run marvin:doctor/);
  assert.match(output, /npm run marvin:smoke-operator-journey/);
  assert.match(output, /npm run marvin:runtime:start/);
  assert.doesNotMatch(output, /Running Marvin doctor/);
  assert.doesNotMatch(output, /Keeper/i);
  assert.doesNotMatch(installScript, /KeeperUrl/);
  assert.doesNotMatch(bootstrapScript, /KeeperUrl/);
  assert.match(installScript, /\[Alias\('WorkspaceId'\)\]/);
  assert.match(installScript, /\[Alias\('WorkspaceEmail'\)\]/);
  assert.match(installScript, /\[Alias\('WorkspacePassword'\)\]/);

  console.log(JSON.stringify({
    ok: true,
    profile: profile.name,
    calendars: profile.calendars.length,
    routes: profile.routes.length,
    operator: operator.email,
    generatedSolutions: summary.solutions.map((item) => item.name)
  }, null, 2));
} finally {
  cleanup();
  if (previousLatest === null) {
    fs.rmSync(latestPath, { force: true });
  } else {
    fs.writeFileSync(latestPath, previousLatest, "utf8");
  }
}
