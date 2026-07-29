import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const uiPath = path.join(root, "operator-ui", "public", "index.html");
const homepage = fs.readFileSync(uiPath, "utf8");

assert.match(homepage, /setupPersisted:false/);
assert.match(homepage, /const validateDisabled=!state\.setupPersisted/);
assert.match(homepage, /const disabled=!state\.setupPersisted/);
assert.match(homepage, /data-recommend-index="\$\{index\}" \$\{!state\.setupPersisted\?"disabled":""\}/);
assert.match(homepage, /if\(!state\.setupPersisted\)\{alert\("Save Marvin setup first/);
assert.match(homepage, /Validate All Calendars/);
assert.match(homepage, /Start Automation From Setup/);
assert.match(homepage, /Marvin Admin/);

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Setup persisted flag exists",
    "Recommended actions gate on saved setup",
    "Recommended action buttons render disabled before save",
    "Validation actions gate on saved setup",
    "Batch validation control is present",
    "Setup-step automation action is present",
    "Marvin admin wording"
  ]
}, null, 2));


