import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const profileName = "marvin-bureau-opt-in-smoke";
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
    "-MarvinOperatorEmail", "marvin-bureau-opt-in@example.com",
    "-NoPrompt",
    "-RunGenerators",
    "-IncludeBureaucraticFlow",
    "-AutomationTenantId", "33333333-3333-3333-3333-333333333333",
    "-AutomationEnvironmentUrl", "https://org333333.crm.dynamics.com",
    "-WorkEmail", "work@example.com",
    "-ContractEmail", "contract@example.com",
    "-MicrosoftClientId", "ms-client",
    "-MicrosoftClientSecret", "ms-secret"
  ], { cwd: root, stdio: "pipe", encoding: "utf8" });

  const profilePath = path.join(root, "profiles", `${profileSlug}.json`);
  const setupPath = path.join(root, ".marvin", `${profileSlug}.setup.json`);
  const summaryPath = path.join(root, "artifacts", "solutions", profileSlug, "summary.json");

  for (const filePath of [profilePath, setupPath, summaryPath]) {
    assert.equal(fs.existsSync(filePath), true, `Expected generated file: ${filePath}`);
  }

  const profile = readJson(profilePath);
  const setup = readJson(setupPath);
  const summary = readJson(summaryPath);

  assert.equal(profile.name, profileSlug);
  assert.equal(profile.runtime.powerAutomate.automationTenantId, "33333333-3333-3333-3333-333333333333");
  assert.equal(profile.runtime.powerAutomate.environmentUrl, "https://org333333.crm.dynamics.com");
  assert.equal(profile.runtime.powerAutomate.deploymentModel, "graph-http-entra-id");
  assert.equal(profile.runtime.powerAutomate.graphAppDisplayName, "Project Marvin Flow Runtime");
  assert.equal(setup.profileName, profileSlug);
  assert.equal(setup.accounts.length >= 2, true);
  assert.equal(summary.profile, profileSlug);
  assert.match(output, /Historical reference generation is opt-in/i);
  assert.match(output, /marvin:verify-local/);

  console.log(JSON.stringify({
    ok: true,
    profile: profile.name,
    calendars: profile.calendars.length,
    powerAutomateTenant: profile.runtime.powerAutomate.automationTenantId,
    generatedSolutions: summary.solutions.map((item) => item.name)
  }, null, 2));
} finally {
  cleanup();
}
