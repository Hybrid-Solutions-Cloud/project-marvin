import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const profileName = "marvin-bootstrap-smoke";
const profileSlug = profileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
const operatorFileName = "marvin-bootstrap-smoke-example.com.account.json";

const latestPath = path.join(root, ".marvin", "latest.json");
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
    "-File", ".\\scripts\\bootstrap-marvin.ps1",
    "-WorkspaceId", profileName,
    "-WorkspaceEmail", "marvin-bootstrap-smoke@example.com",
    "-MarvinOperatorDisplayName", "Bootstrap Smoke Operator",
    "-WorkspacePassword", "smoke-password",
    "-NoPrompt",
    "-SkipNpmInstall",
    "-SkipSmokeSetup",
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
  assert.equal(setup.providerRequirements.microsoft.redirectUri, "http://127.0.0.1:4177/marvin-api/oauth/microsoft/callback");
  assert.equal(summary.profile, profileSlug);
  assert.equal(operator.displayName, "Bootstrap Smoke Operator");
  assert.equal(operator.email, "marvin-bootstrap-smoke@example.com");
  assert.equal(typeof operator.password?.salt, "string");
  assert.equal(typeof operator.password?.hash, "string");
  assert.match(output, /Creating local Marvin workspace sign-in/);
  assert.match(output, /Bootstrap complete\./);
  assert.match(output, /Sign in with the Marvin workspace account created by this bootstrap run\./);
  assert.match(output, /npm run marvin:ui/);
  assert.match(output, /npm run marvin:doctor/);
  assert.match(output, /npm run marvin:smoke-operator-journey/);
  assert.match(output, /Paranoid Keeper starts automatically after all calendar links validate/);
  assert.doesNotMatch(output, /Keeper\.sh/i);
  assert.doesNotMatch(bootstrapScript, /KeeperUrl/);
  assert.match(bootstrapScript, /\[Alias\('WorkspaceId'\)\]/);
  assert.match(bootstrapScript, /\[Alias\('WorkspaceEmail'\)\]/);
  assert.match(bootstrapScript, /\[Alias\('WorkspacePassword'\)\]/);

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
