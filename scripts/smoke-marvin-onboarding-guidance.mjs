import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const install = read("scripts/install-marvin.ps1");
const bootstrap = read("scripts/bootstrap-marvin.ps1");
const setup = read("scripts/setup-marvin.ps1");

const sharedGuidance = [
  "Open the Calendars list, finish Access setup, link each calendar, and run Check Access until Link status shows ready.",
  "Review the Marvin Workspace card and each calendar card before starting automation.",
  "marvin:smoke-operator-journey",
  "marvin:verify-local"
];

for (const expected of sharedGuidance) {
  assert.match(install, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(bootstrap, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(setup, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.match(install, /Sign in with the Marvin workspace account created by this install run\./);
assert.match(bootstrap, /Sign in with the Marvin workspace account created by this bootstrap run\./);
assert.match(setup, /register-marvin-entra-app\.ps1/);
assert.match(setup, /marvin:dry-run/);

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Install guidance includes current Marvin browser flow",
    "Bootstrap guidance includes current Marvin browser flow",
    "Setup guidance includes current Marvin browser flow",
    "Shared next-step wording stays aligned across entrypoints",
    "Setup guidance still includes Entra plan and dry-run references"
  ]
}, null, 2));
