import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const defaultProfileName = "marvin-runtime-split-default";
const optInProfileName = "marvin-runtime-split-bureau";
const defaultSlug = defaultProfileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
const optInSlug = optInProfileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();

const targets = [
  path.join(root, "profiles", `${defaultSlug}.json`),
  path.join(root, "profiles", `${defaultSlug}.events.json`),
  path.join(root, ".marvin", `${defaultSlug}.setup.json`),
  path.join(root, ".marvin", "provider-secrets", `${defaultSlug}.secrets.json`),
  path.join(root, ".marvin", "connections", `${defaultSlug}.connections.json`),
  path.join(root, "artifacts", "solutions", defaultSlug),
  path.join(root, "profiles", `${optInSlug}.json`),
  path.join(root, "profiles", `${optInSlug}.events.json`),
  path.join(root, ".marvin", `${optInSlug}.setup.json`),
  path.join(root, ".marvin", "provider-secrets", `${optInSlug}.secrets.json`),
  path.join(root, ".marvin", "connections", `${optInSlug}.connections.json`),
  path.join(root, "artifacts", "solutions", optInSlug)
];

function cleanup() {
  for (const target of targets) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

cleanup();

try {
  const exampleProfile = readJson(path.join(root, "profiles", "marvin.example.json"));
  assert.equal("powerAutomate" in (exampleProfile.runtime || {}), false);

  execFileSync("powershell", [
    "-ExecutionPolicy", "Bypass",
    "-File", ".\\scripts\\setup-marvin.ps1",
    "-ProfileName", defaultProfileName,
    "-MarvinOperatorEmail", "runtime-split-default@example.com",
    "-NoPrompt",
    "-RunGenerators",
    "-WorkEmail", "work@example.com",
    "-ContractEmail", "contract@example.com",
    "-MicrosoftClientId", "ms-client",
    "-MicrosoftClientSecret", "ms-secret"
  ], { cwd: root, stdio: "pipe", encoding: "utf8" });

  execFileSync("powershell", [
    "-ExecutionPolicy", "Bypass",
    "-File", ".\\scripts\\setup-marvin.ps1",
    "-ProfileName", optInProfileName,
    "-MarvinOperatorEmail", "runtime-split-bureau@example.com",
    "-NoPrompt",
    "-RunGenerators",
    "-IncludeBureaucraticFlow",
    "-AutomationTenantId", "44444444-4444-4444-4444-444444444444",
    "-AutomationEnvironmentUrl", "https://org444444.crm.dynamics.com",
    "-WorkEmail", "work@example.com",
    "-ContractEmail", "contract@example.com",
    "-MicrosoftClientId", "ms-client",
    "-MicrosoftClientSecret", "ms-secret"
  ], { cwd: root, stdio: "pipe", encoding: "utf8" });

  const defaultProfile = readJson(path.join(root, "profiles", `${defaultSlug}.json`));
  const optInProfile = readJson(path.join(root, "profiles", `${optInSlug}.json`));

  assert.equal("powerAutomate" in (defaultProfile.runtime || {}), false);
  assert.equal(optInProfile.runtime.powerAutomate.automationTenantId, "44444444-4444-4444-4444-444444444444");
  assert.equal(optInProfile.runtime.powerAutomate.environmentUrl, "https://org444444.crm.dynamics.com");

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "Example profile omits Bureaucratic Flow runtime metadata by default",
      "Default generated setup profile omits Bureaucratic Flow runtime metadata",
      "Explicit Bureaucratic Flow opt-in generated profile includes runtime.powerAutomate metadata"
    ]
  }, null, 2));
} finally {
  cleanup();
}
