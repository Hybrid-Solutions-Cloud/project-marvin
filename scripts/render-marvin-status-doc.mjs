import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRequirementCoverage } from "./lib/marvin-status.mjs";

function renderStatusLabel(status) {
  if (status === "proven-locally") return "Proven locally";
  if (status === "partial") return "Partially proven locally";
  return "Missing";
}

function buildStatusDoc() {
  const coverage = buildRequirementCoverage();
  const rows = coverage.requirements.map((item) => {
    const evidence = item.evidence.map((command) => `\`${command}\``).join(", ");
    return `| ${item.requirement} | ${renderStatusLabel(item.status)} | ${evidence} | ${item.remainingGap} |`;
  }).join("\n");

  return `# Current Status

_This page is generated from Marvin's shared status model. Run \`npm run marvin:render-status-doc\` to refresh it manually._

As of **Wednesday, July 29, 2026**, Project Marvin is a serious local proof-of-product, not a fully proven production-finished product.

## Current coverage

The repo currently supports all of the following **locally**:

- bidirectional route planning across Microsoft 365, Outlook, Google, and optional Apple / CalDAV calendars
- private-by-default mirrored events
- family-calendar detail overrides
- automatic per-source prefixes such as \`WORK:\` and \`FAMILY:\`
- source-timezone preservation in mirror payloads
- Marvin-owned Microsoft and Google OAuth start/callback flow
- Marvin-owned Apple / CalDAV credential validation
- Marvin account creation, sign-in gating, and ongoing calendar management UI
- scriptable local install, bootstrap, verification, and Azure deployment-plan generation

## Requirement matrix

| Requirement | Repo truth on July 29, 2026 | Strongest local evidence | Remaining gap |
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
- production-grade hosted secret handling and operational hardening
- fully proven always-on hosted runtime lifecycle
- fully zero-touch provider-app creation across every Microsoft and Google tenant

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
- [Marvin Engine](/solutions/marvin-engine)
`;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputPath = path.join(repoRoot, "docs", "status.md");
fs.writeFileSync(outputPath, buildStatusDoc(), "utf8");
console.log(JSON.stringify({ ok: true, outputPath }, null, 2));
