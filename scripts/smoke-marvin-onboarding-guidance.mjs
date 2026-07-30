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
  assert.match(entrypoint, /Paranoid Keeper account card and each calendar card before Paranoid Keeper starts automatically after validation\./);
  assert.match(entrypoint, /marvin:smoke-operator-journey/);
  assert.match(entrypoint, /marvin:verify-local/);
}

assert.match(install, /Use the Paranoid Keeper flow: add calendars, link accounts, and run Check Access until every calendar is ready\./);
assert.match(bootstrap, /Use the Paranoid Keeper flow: add calendars, link accounts, and run Check Access until every calendar is ready\./);
assert.match(setup, /Use Paranoid Keeper: add calendars, link accounts, and run Check Access until every calendar is ready\./);
assert.match(install, /Sign in with the Paranoid Keeper account created by this install run\./);
assert.match(bootstrap, /Sign in with the Paranoid Keeper account created by this bootstrap run\./);
assert.match(setup, /register-marvin-entra-app\.ps1/);
assert.match(setup, /marvin:dry-run/);

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Install guidance includes current Paranoid Keeper browser flow",
    "Bootstrap guidance includes current Paranoid Keeper browser flow",
    "Setup guidance includes current Paranoid Keeper browser flow",
    "Paranoid Keeper readiness guidance stays aligned across entrypoints",
    "Setup guidance still includes Entra plan and dry-run references"
  ]
}, null, 2));
