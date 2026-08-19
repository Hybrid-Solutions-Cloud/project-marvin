import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "operator-ui", "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "operator-ui", "public", "app.js"), "utf8");
const views = fs.readFileSync(path.join(root, "operator-ui", "public", "modules", "views.js"), "utf8");
const source = [app, views].join("\n");

assert.match(html, /Project Marvin/);
assert.match(source, /Sign in with Microsoft/);
assert.match(source, /Continue with Microsoft/);
assert.match(app, /marvin-api\/auth\/entra\/start/);
assert.match(source, /Calendar provider/);
assert.match(source, /Add calendar/);
assert.match(app, /beginAuthorization/);
assert.match(app, /window\.location\.assign\(result\.launchUrl\)/);
assert.match(source, /Calendar role/);
assert.match(source, /Private and Busy are different settings/);
assert.match(source, /What you see/);
assert.match(source, /What others see/);
assert.match(source, /Blocks scheduling/);
assert.doesNotMatch(source, /Create your security account/);
assert.doesNotMatch(source, /recoveryEmail/);
assert.doesNotMatch(source, /Setup Assistant/);
assert.doesNotMatch(source, /Link Accounts/);
assert.doesNotMatch(html, /Set up Project Marvin once/i);

console.log(JSON.stringify({ ok: true, checked: ["Microsoft Entra account gating", "No local password collection", "Immediate provider authorization", "Calendar role and directional policy controls", "No setup assistant or legacy login copy"] }, null, 2));
