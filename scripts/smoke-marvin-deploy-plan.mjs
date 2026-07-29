import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync("pwsh", [
  "-ExecutionPolicy", "Bypass",
  "-File", ".\\solutions\\marvin-engine\\deploy-azure-container-app.ps1",
  "-EmitPlanOnly",
  "-SubscriptionId", "00000000-0000-0000-0000-000000000000",
  "-WorkloadName", "marvin",
  "-Environment", "dev",
  "-RegionShort", "wus3",
  "-Instance", "01",
  "-Location", "westus3"
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
assert.equal(plan.location, "westus3");
assert.equal(plan.naming.workloadName, "marvin");
assert.equal(plan.naming.environment, "dev");
assert.equal(plan.naming.regionShort, "wus3");
assert.equal(plan.naming.instance, "01");
assert.equal(plan.resources.resourceGroup, "rg-marvin-dev-wus3-01");
assert.equal(plan.resources.containerAppsEnvironment, "cae-marvin-dev-wus3-01");
assert.equal(plan.resources.marvinContainerApp, "ca-marvin-dev-wus3-01");
assert.equal(plan.resources.logAnalyticsWorkspace, "law-marvin-dev-wus3-01");
assert.equal(plan.resources.fileShare, "marvinstate");
assert.equal(plan.runtime.syncIntervalSeconds, 300);
assert.equal(plan.runtime.syncWindowDays, 45);
assert.equal(plan.runtime.hostedMode, true);
assert.equal(plan.runtime.autoStart, true);
assert.equal(plan.runtime.stateMountPath, "/data");
assert.match(plan.files.bicepTemplate, /infra[\\/]marvin-azure\.bicep$/i);
assert.equal(plan.files.deployScript, "solutions/marvin-engine/deploy-azure-container-app.ps1");
assert.match(plan.nextCommand, /npm run marvin:azure:deploy/i);

console.log(JSON.stringify({
  ok: true,
  resourceGroup: plan.resources.resourceGroup,
  containerApp: plan.resources.marvinContainerApp,
  nextCommand: plan.nextCommand
}, null, 2));
