import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "operator-ui", "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "operator-ui", "public", "app.js"), "utf8");

assert.match(html, /Paranoid Keeper/);
assert.match(app, /workspaceAccountExists:false,signedIn:false,requiresLogin:false,setupPersisted:false/);
assert.match(app, /if\(!state\.setupPersisted\)\{alert\("Save Paranoid Keeper setup first/);
assert.match(app, /const automationReady=\(\)=>Boolean\(state\.readinessSummary\?\.readyToStartAutomation\)/);
assert.match(app, /id="startAutomation" \$\{automationReady\(\)\?"":"disabled"\}/);
assert.match(app, /Check All Calendars/);
assert.match(app, /Open Management Console/);
assert.match(app, /Paranoid Keeper Account/);
assert.match(app, /Sign Out/);
assert.match(app, /signInWorkspace\(/);
assert.match(app, /signOutWorkspace\(/);
assert.match(app, /result\.authenticated/);
assert.match(app, /result\.requiresLogin/);
assert.doesNotMatch(app, /Paranoid Paranoid Keeper/);
assert.doesNotMatch(html, /Sign in to your Keeper\.sh account/i);

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Module-based setup state and auth state",
    "Saved-setup and automation readiness gates",
    "Batch validation and management console controls",
    "Paranoid Keeper account branding",
    "No duplicated or legacy Keeper login copy"
  ]
}, null, 2));