import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const result = spawnSync("pwsh", [
  "-ExecutionPolicy", "Bypass",
  "-File", ".\\solutions\\marvin-engine\\deploy-azure-container-app.ps1",
  "-EmitPlanOnly",
  "-SubscriptionId", "00000000-0000-0000-0000-000000000000",
  "-WorkloadName", "calendarsync",
  "-Environment", "stg",
  "-RegionShort", "eus2",
  "-Instance", "99",
  "-Location", "eastus2",
  "-PublicBaseUrl", "https://calendar.example.com/"
], {
  cwd: process.cwd(),
  encoding: "utf8",
  windowsHide: true
});

if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || `Deploy plan exited with code ${result.status}`);
}

const stdout = result.stdout.trim();
const jsonStart = stdout.indexOf("{");
assert.ok(jsonStart >= 0, "Expected JSON output from deploy plan.");
const plan = JSON.parse(stdout.slice(jsonStart));

assert.equal(plan.mode, "azure-container-apps");
assert.equal(plan.location, "eastus2");
assert.equal(plan.naming.workloadName, "calendarsync");
assert.equal(plan.naming.environment, "stg");
assert.equal(plan.naming.regionShort, "eus2");
assert.equal(plan.naming.instance, "99");
assert.equal(plan.resources.resourceGroup, "rg-calendarsync-stg-eus2-99");
assert.equal(plan.resources.containerAppsEnvironment, "cae-calendarsync-stg-eus2-99");
assert.equal(plan.resources.marvinContainerApp, "ca-calendarsync-stg-eus2-99");
assert.equal(plan.resources.logAnalyticsWorkspace, "law-calendarsync-stg-eus2-99");
assert.equal(plan.resources.fileShare, "marvinstate");
assert.equal(plan.runtime.syncIntervalSeconds, 300);
assert.equal(plan.runtime.syncWindowDays, 45);
assert.equal(plan.runtime.hostedMode, true);
assert.equal(plan.runtime.autoStart, true);
assert.equal(plan.runtime.providerDeleteMode, "disabled");
assert.equal(plan.runtime.stateMountPath, "/data");
assert.equal(plan.runtime.publicBaseUrl, "https://calendar.example.com");
assert.match(plan.files.bicepTemplate, /infra[\\/]marvin-azure\.bicep$/i);
assert.equal(plan.files.deployScript, "solutions/marvin-engine/deploy-azure-container-app.ps1");
assert.match(plan.nextCommand, /npm run marvin:azure:deploy/i);
assert.match(plan.nextCommand, /-PublicBaseUrl https:\/\/calendar\.example\.com/i);

const deploymentSource = fs.readFileSync("solutions/marvin-engine/deploy-azure-container-app.ps1", "utf8");
assert.match(deploymentSource, /\$entraAppDisplayName\s*=\s*'Project Marvin Portal'/);
assert.match(deploymentSource, /\$microsoftCalendarAppDisplayName\s*=\s*'Project Marvin'/);
assert.match(deploymentSource, /--display-name \$legacyEntraAppDisplayName/);
assert.match(deploymentSource, /--display-name \$legacyMicrosoftCalendarAppDisplayName/);
assert.match(deploymentSource, /az ad app update --id \$microsoftCalendarClientId --display-name \$microsoftCalendarAppDisplayName/);
assert.match(deploymentSource, /\$preflightMarvinUrl = if \(\$PublicBaseUrl\)/);
assert.match(deploymentSource, /\$marvinUrl = if \(\$PublicBaseUrl\)/);
const firstBicepPass = deploymentSource.indexOf("$deploymentJson = az deployment group create");
assert.ok(firstBicepPass > 0);
assert.ok(deploymentSource.indexOf("$preflightEntraClientSecret = az containerapp secret list") < firstBicepPass);
assert.ok(deploymentSource.indexOf("$preflightCalendarClientSecret = az containerapp secret list") < firstBicepPass);
assert.ok(deploymentSource.slice(firstBicepPass).includes("entraClientSecret=$preflightEntraClientSecret"));
assert.ok(deploymentSource.slice(firstBicepPass).includes("microsoftCalendarClientSecret=$preflightCalendarClientSecret"));
const secretReads = deploymentSource.match(/az containerapp secret list[^\r\n]*/g) || [];
assert.ok(secretReads.length >= 5);
assert.ok(secretReads.every((line) => line.includes("--show-values")));

console.log(JSON.stringify({
  ok: true,
  resourceGroup: plan.resources.resourceGroup,
  containerApp: plan.resources.marvinContainerApp,
  nextCommand: plan.nextCommand
}, null, 2));
