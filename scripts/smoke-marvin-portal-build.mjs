import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "operator-ui", "dist", "asset-manifest.json");

function build() {
  const result = spawnSync(process.execPath, ["scripts/build-marvin-portal.mjs"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const contents = fs.readFileSync(manifestPath);
  return { manifest: JSON.parse(contents.toString("utf8")), hash: crypto.createHash("sha256").update(contents).digest("hex") };
}

const first = build();
const second = build();
assert.equal(first.hash, second.hash);
assert.equal(second.manifest.product, "project-marvin");
assert.equal(second.manifest.entrypoint, "index.html");
assert.ok(second.manifest.files.some((file) => file.path === "modules/api.js"));
assert.ok(second.manifest.files.some((file) => file.path === "modules/model.js"));
assert.ok(second.manifest.files.some((file) => file.path === "modules/views.js"));
assert.ok(second.manifest.files.some((file) => file.path === "marvin-mark.svg"));
assert.ok(second.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));

console.log(JSON.stringify({ ok: true, files: second.manifest.files.length, deterministicManifest: second.hash }, null, 2));
