import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const platform = read("docs/platform-support.md");
const roadmap = read("docs/roadmap.md");
const releases = read("docs/releases.md");
const changelog = read("CHANGELOG.md");
const config = read("docs/.vitepress/config.mts");
const productBoundary = read("docs/product-boundary.md");
const azure = read("docs/solutions/marvin-azure.md");
const operations = read("docs/operator/operations-runbook.md");

for (const label of ["Supported", "Tested", "Experimental", "Planned"]) {
  assert.match(platform, new RegExp(`\\*\\*${label}\\*\\*`), `Missing maturity label ${label}`);
}

assert.match(platform, /No hosted target has reached \*\*Supported\*\*/);
assert.match(platform, /Local source workflow on Windows \| \*\*Tested\*\*/);
assert.match(platform, /Raw `linux\/amd64` OCI image \| \*\*Experimental\*\*/);
assert.match(platform, /Azure Container Apps \| \*\*Experimental\*\*/);
assert.match(platform, /Docker Compose on Linux Docker Engine \| \*\*Planned\*\*/);
assert.match(platform, /Cloudflare Containers \| \*\*Planned\*\*/);
assert.match(platform, /Cloudflare becomes \*\*Experimental\*\* only when a usable prototype exists/);
assert.match(platform, /cannot become \*\*Supported\*\* until every listed persistence, scheduling, security, update, rollback, and conformance gate passes/);

assert.match(roadmap, /Publish platform support and maturity contract/);
assert.match(roadmap, /AB#7741/);
assert.match(roadmap, /\[platform matrix\]\(\/platform-support\)/);
assert.match(roadmap, /`0\.2\.0-preview` \| \*\*In progress\*\*/);
assert.match(roadmap, /`0\.3\.0-preview` \| Next/);
assert.match(roadmap, /`1\.0\.0-rc\.1`/);
assert.match(roadmap, /`1\.0\.0` \| General availability gate/);
assert.match(roadmap, /AB#7734, AB#7735, AB#7736, AB#7738, AB#7739/);
assert.match(releases, /Project Marvin is \*\*Preview\*\* software/);
assert.match(releases, /there is no generally available or production-support release yet/i);
assert.match(releases, /No hosted target is currently labeled \*\*Supported\*\*/);
assert.match(releases, /Docker Compose, Cloudflare Containers, and additional hosting adapters remain post-GA/);
assert.match(changelog, /AB#7741/);
assert.match(changelog, /0\.1\.0-preview\.1/);
assert.match(changelog, /Cloudflare Containers as Planned until a prototype exists/);

for (const route of ["/platform-support", "/roadmap", "/releases"]) {
  assert.match(config, new RegExp(route.replaceAll("/", "\\/")), `Missing docs navigation route ${route}`);
}

assert.doesNotMatch(productBoundary, /one deployment path/i);
assert.match(productBoundary, /portable Open Container Initiative contract/);
assert.match(azure, /Experimental reference adapter/);
assert.doesNotMatch(operations, /supported Azure-hosted/i);
assert.doesNotMatch(operations, /Codex with Kris|deployment revision 000/i);

const publicProseFiles = [
  "README.md",
  "CHANGELOG.md",
  ...fs.readdirSync(path.join(root, "docs"), { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".md"))
    .map((entry) => path.join("docs", entry))
];
const publicProse = publicProseFiles.map((file) => read(file)).join("\n");
const privatePatterns = [
  /marvin\.hybridsolutions\.cloud/i,
  /tetoncloudconsulting/i,
  /kris\.turner/i,
  /1711249c-d33d-408a-9427-cf92bb5c1930/i,
  /06051820-6af6-481b-b63f-834ae867a0b2/i,
  /thisismydemo\.cloud/i,
  /Paranoid Keeper/i
];
for (const pattern of privatePatterns) {
  assert.doesNotMatch(publicProse, pattern, `Public documentation contains private deployment material matching ${pattern}`);
}

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Platform maturity definitions and matrix",
    "Cloudflare and Azure status boundaries",
    "Roadmap, release record, and changelog coverage",
    "Navigation and product-boundary consistency",
    "Public documentation private-deployment scan"
  ]
}, null, 2));
