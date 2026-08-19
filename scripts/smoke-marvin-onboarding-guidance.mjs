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

const allEntrypoints = [install, bootstrap, setup];

for (const entrypoint of allEntrypoints) {
  assert.match(entrypoint, /MARVIN_DEV_AUTH_ENABLED=true and run npm run marvin:ui\./);
  assert.match(entrypoint, /every calendar is Ready\./);
  assert.match(entrypoint, /Review privacy rules, then start synchronization from the Dashboard\./);
  assert.match(entrypoint, /marvin:verify-local/);
}

assert.match(install, /Hosted deployments use Continue with Microsoft instead\./);
assert.match(bootstrap, /Hosted deployments use Continue with Microsoft instead\./);
assert.match(setup, /Use the Calendars page to add each account, complete provider authorization, and verify every calendar is Ready\./);
assert.match(setup, /marvin:smoke-operator-journey/);
assert.doesNotMatch(install, /operator password|local password|account created by this install/i);
assert.doesNotMatch(bootstrap, /operator password|local password|account created by this bootstrap/i);
assert.match(setup, /register-marvin-entra-app\.ps1/);
assert.match(setup, /marvin:dry-run/);

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Install guidance includes current Project Marvin browser flow",
    "Bootstrap guidance includes current Project Marvin browser flow",
    "Setup guidance includes current Project Marvin browser flow",
    "Project Marvin readiness guidance stays aligned across entrypoints",
    "Setup guidance still includes Entra plan and dry-run references"
  ]
}, null, 2));
