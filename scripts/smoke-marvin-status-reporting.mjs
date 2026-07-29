import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildRequirementCoverage } from "./lib/marvin-status.mjs";

const root = process.cwd();
const coverage = buildRequirementCoverage();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const doctor = JSON.parse(execFileSync(process.execPath, ["scripts/marvin-doctor.mjs", "--json"], {
  cwd: root,
  encoding: "utf8"
}));
const statusDoc = fs.readFileSync(path.join(root, "docs", "status.md"), "utf8");
const requirementsDoc = fs.readFileSync(path.join(root, "docs", "requirements.md"), "utf8");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

assert.equal(doctor.requirementCoverage.asOf, coverage.asOf);
assert.deepEqual(doctor.requirementCoverage.summary, coverage.summary);
assert.equal(doctor.requirementCoverage.requirements.length, coverage.requirements.length);

for (const requirement of coverage.requirements) {
  const doctorRequirement = doctor.requirementCoverage.requirements.find((item) => item.id === requirement.id);
  assert.ok(doctorRequirement, `Missing doctor requirement ${requirement.id}`);
  assert.equal(doctorRequirement.requirement, requirement.requirement);
  assert.equal(doctorRequirement.status, requirement.status);
  assert.equal(doctorRequirement.remainingGap, requirement.remainingGap);
  assert.deepEqual(doctorRequirement.evidence, requirement.evidence);

  assert.match(statusDoc, new RegExp(escapeRegex(requirement.requirement)));
  const requirementStem = requirement.requirement.replace(/\.$/, "").slice(0, Math.min(48, requirement.requirement.replace(/\.$/, "").length));
  assert.match(requirementsDoc, new RegExp(escapeRegex(requirementStem)));

  for (const command of requirement.evidence) {
    assert.match(statusDoc, new RegExp(escapeRegex(command)));
    if (command.startsWith("npm run ")) {
      const scriptName = command.replace(/^npm run\s+/, "").trim();
      assert.ok(packageJson.scripts[scriptName], `Missing npm script for evidence command: ${scriptName}`);
    }
  }
}

assert.match(statusDoc, new RegExp(`Total requirements tracked: ${coverage.summary.total}`));
assert.match(statusDoc, new RegExp(`Proven locally: ${coverage.summary.provenLocally}`));
assert.match(statusDoc, new RegExp(`Partially proven locally: ${coverage.summary.partial}`));
assert.match(statusDoc, new RegExp(`Missing: ${coverage.summary.missing}`));
assert.equal(doctor.verification.statusReportingProofCommand, "npm run marvin:smoke-status-reporting");

console.log(JSON.stringify({
  ok: true,
  requirements: coverage.summary.total,
  provenLocally: coverage.summary.provenLocally,
  partial: coverage.summary.partial,
  checked: [
    "Doctor report matches shared requirement coverage model",
    "Generated status page matches shared requirement coverage model",
    "Requirements doc contains every tracked requirement line",
    "Every status-model evidence command resolves to a real npm script when applicable"
  ]
}, null, 2));