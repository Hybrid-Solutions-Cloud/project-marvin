import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const uiPath = path.join(root, "operator-ui", "public", "index.html");
const homepage = fs.readFileSync(uiPath, "utf8");

assert.match(homepage, /setupPersisted:false/);
assert.match(homepage, /signedIn:false/);
assert.match(homepage, /requiresLogin:false/);
assert.match(homepage, /if\(!state\.setupPersisted\)\{alert\("Save Marvin setup first/);
assert.match(homepage, /const automationReady=\(\)=>Boolean\(state\.readinessSummary\?\.readyToStartAutomation\)/);
assert.match(homepage, /document\.getElementById\("startRuntime"\)\.disabled=!automationReady\(\)/);
assert.match(homepage, /Check All Calendars/);
assert.match(homepage, /Start Automation/);
assert.match(homepage, /Save And Open Console/);
assert.match(homepage, /Workspace Account|Marvin Workspace/);
assert.match(homepage, /Sign Out/);
assert.match(homepage, /signInWorkspace\(/);
assert.match(homepage, /signOutWorkspace\(/);
assert.match(homepage, /result\.authenticated/);
assert.match(homepage, /result\.requiresLogin/);
assert.doesNotMatch(homepage, /Start Automation From Setup/);
assert.doesNotMatch(homepage, /Marvin Admin/);
assert.doesNotMatch(homepage, /Keeper/i);

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Setup persisted flag exists",
    "Signed-in and requires-login state exists",
    "Protected actions still gate on saved setup",
    "Automation button gates on readiness",
    "Batch validation control is present",
    "Current setup and console labels are present",
    "Workspace sign-in and sign-out functions exist",
    "Bootstrap reads authenticated and requiresLogin state",
    "Old setup and branding copy is absent"
  ]
}, null, 2));
