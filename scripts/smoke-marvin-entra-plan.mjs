import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-entra-plan-smoke-${Date.now()}`);
const profileName = "marvin-entra-plan-smoke";
const profileSlug = profileName.toLowerCase();
const stateDir = path.join(tempRoot, ".marvin");
const setupPath = path.join(stateDir, `${profileSlug}.setup.json`);
const outputPath = path.join(tempRoot, "entra-plan.json");

fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(setupPath, JSON.stringify({
  profileName,
  providerRequirements: {
    marvinBaseUrl: "https://marvin.example.com",
    microsoft: {
      required: true,
      signInAudience: "AzureADandPersonalMicrosoftAccount",
      redirectUri: "https://marvin.example.com/marvin-api/oauth/microsoft/callback"
    }
  }
}, null, 2));

execFileSync("pwsh", [
  "-ExecutionPolicy", "Bypass",
  "-File", ".\\scripts\\register-marvin-entra-app.ps1",
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
const registrationSource = fs.readFileSync(path.join(repoRoot, "scripts", "register-marvin-entra-app.ps1"), "utf8");
assert.equal(plan.profileName, profileSlug);
assert.equal(plan.provider, "microsoft");
assert.equal(plan.redirectUri, "https://marvin.example.com/marvin-api/oauth/microsoft/callback");
assert.equal(plan.signInAudience, "AzureADandPersonalMicrosoftAccount");
assert.equal(plan.credential.encryptedStore, `.marvin/provider-secrets/${profileSlug}.secrets.json`);
assert.equal(plan.credential.rotateRequested, false);
assert.doesNotMatch(JSON.stringify(plan), /clientSecret|password/i);
assert.match(registrationSource, /ad','app','list'/);
assert.match(registrationSource, /\[switch\]\$RotateCredential/);
assert.match(registrationSource, /store-marvin-provider-secrets\.mjs/);
assert.doesNotMatch(registrationSource, /clientSecret\s*=\s*\[string\]\$secret\.password/);
assert.ok(plan.commands.some((command) => command.includes("az ad app create")));
assert.ok(plan.commands.some((command) => command.includes("az ad app permission add")));
assert.ok(plan.delegatedPermissions.some((permission) => permission.name === "User.Read"));
assert.ok(plan.delegatedPermissions.some((permission) => permission.name === "Calendars.ReadWrite"));

console.log(JSON.stringify({
  ok: true,
  profileName: plan.profileName,
  redirectUri: plan.redirectUri,
  delegatedPermissions: plan.delegatedPermissions.map((permission) => permission.name)
}, null, 2));

fs.rmSync(tempRoot, { recursive: true, force: true });
