import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRequirementCoverage } from "./lib/marvin-status.mjs";

function renderStatusLabel(status) {
  if (status === "proven-locally") return "Proven by automated contract";
  if (status === "partial") return "Partially proven";
  return "Missing";
}

function formatAsOfDate(value) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}

function buildStatusDoc() {
  const coverage = buildRequirementCoverage();
  const rows = coverage.requirements.map((item) => {
    const evidence = item.evidence.map((command) => `\`${command}\``).join(", ");
    return `| ${item.requirement} | ${renderStatusLabel(item.status)} | ${evidence} | ${item.remainingGap} |`;
  }).join("\n");

  return `# Current Status

_This page is generated from Marvin's shared status model. Run \`npm run marvin:render-status-doc\` to refresh it manually._

As of **${formatAsOfDate(coverage.asOf)}**, Project Marvin is **Preview** software. Its local behavior, Azure deployment-plan contract, health endpoints, persistence contracts, and provider mocks are verified by automated tests. Platform maturity is tracked separately so a passing component test is not mistaken for production support. This public status page intentionally excludes all private deployment identities, URLs, resources, and acceptance evidence.

## Current coverage

The open-source repository currently demonstrates:

- bidirectional route planning across Microsoft 365, Outlook, Apple / CalDAV, and Google calendars
- private-by-default mirrored events
- family-calendar detail overrides
- automatic per-source prefixes such as \`WORK:\` and \`FAMILY:\`
- source-timezone preservation in mirror payloads
- Marvin-owned Microsoft and Google OAuth start/callback flow
- Marvin-owned Apple / CalDAV credential validation
- Microsoft Entra workspace bootstrap, staged onboarding, sign-in gating, and ongoing calendar management UI
- scriptable local install, bootstrap, verification, and Azure deployment-plan generation
- generated doctor/status reporting tied to the shared requirement model
- an Experimental Azure Container Apps reference adapter with configurable public origin and redacted liveness/readiness endpoints
- durable profile/account state across application restarts

These capabilities do not make a hosting target Supported. See [Platform Support](/platform-support) for the evidence and promotion contract.

Apple / CalDAV is the active provider release train. Google follows Apple, then the general availability release candidate adds self-service updates, safe deletion propagation, platform-neutral state and scheduling, the portable runtime prerequisite, and declared-host validation. See the [Roadmap](/roadmap) for the complete release sequence.

## Requirement matrix

| Requirement | Evidence status on ${coverage.asOf} | Strongest automated evidence | Remaining gap |
| --- | --- | --- | --- |
${rows}

## Coverage summary

- Total requirements tracked: ${coverage.summary.total}
- Proven locally: ${coverage.summary.provenLocally}
- Partially proven locally: ${coverage.summary.partial}
- Missing: ${coverage.summary.missing}

## Biggest remaining gaps

Marvin still does **not** have strong proof of all of the following:

- real customer-owned live calendars syncing end to end across real tenants
- completed production acceptance, recovery exercises, and independent security review
- fully zero-touch provider-app creation across every Microsoft and Google tenant
- environment-specific provider authorization and real-account acceptance testing
- a published immutable OCI release and complete cross-platform container conformance evidence
- a Supported hosted deployment adapter with public backup, update, rollback, and recovery proof

## Use the repo to verify status

If you want the repo to tell you what is true right now, use:

\`\`\`powershell
npm run marvin:doctor
\`\`\`

For the full JSON report, including requirement coverage and next gaps:

\`\`\`powershell
node scripts/marvin-doctor.mjs --json
\`\`\`

For the fuller written requirement audit, read:

- [Requirements](/requirements)
- [Getting Started](/getting-started)
- [Platform Support](/platform-support)
- [Roadmap](/roadmap)
- [Releases](/releases)
- [Marvin Engine](/solutions/marvin-engine)
`;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputPath = path.join(repoRoot, "docs", "status.md");
fs.writeFileSync(outputPath, buildStatusDoc(), "utf8");
console.log(JSON.stringify({ ok: true, outputPath }, null, 2));
