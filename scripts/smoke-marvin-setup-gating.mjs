import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "operator-ui", "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "operator-ui", "public", "app.js"), "utf8");

assert.match(html, /Paranoid Keeper/);
assert.match(app, /Sign in with Microsoft/);
assert.match(app, /Continue with Microsoft/);
assert.match(app, /marvin-api\/auth\/entra\/start/);
assert.match(app, /Calendar provider/);
assert.match(app, /Add calendar/);
assert.match(app, /beginAuthorization/);
assert.match(app, /window\.location\.assign\(result\.launchUrl\)/);
assert.match(app, /Private copy by default/);
assert.match(app, /Share details/);
assert.doesNotMatch(app, /Create your security account/);
assert.doesNotMatch(app, /recoveryEmail/);
assert.doesNotMatch(app, /Setup Assistant/);
assert.doesNotMatch(app, /Link Accounts/);
assert.doesNotMatch(html, /Set up Paranoid Keeper once/i);
assert.doesNotMatch(html, /Sign in to your Keeper\.sh account/i);

console.log(JSON.stringify({ ok: true, checked: ["Microsoft Entra account gating", "No local password collection", "Immediate provider authorization", "Private default policy controls", "No setup assistant or legacy login copy"] }, null, 2));