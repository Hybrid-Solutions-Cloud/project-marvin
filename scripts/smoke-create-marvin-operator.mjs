import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-create-operator-"));
const scriptPath = path.join(repoRoot, "scripts", "create-marvin-operator.mjs");

try {
  const result = spawnSync(process.execPath, [scriptPath,
    "--email", "marvin-script@example.com",
    "--display-name", "Marvin Scripted",
    "--password", "correct-horse-battery-staple"
  ], {
    cwd: tempRoot,
    encoding: "utf8",
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, true);
  assert.equal(payload.email, "marvin-script@example.com");
  assert.equal(payload.displayName, "Marvin Scripted");

  const operatorPath = path.join(tempRoot, ".marvin", "operators", "marvin-script-example.com.account.json");
  const latestPath = path.join(tempRoot, ".marvin", "latest.json");
  assert.ok(fs.existsSync(operatorPath));
  assert.ok(fs.existsSync(latestPath));

  const operator = JSON.parse(fs.readFileSync(operatorPath, "utf8"));
  const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));

  assert.equal(operator.email, "marvin-script@example.com");
  assert.equal(operator.displayName, "Marvin Scripted");
  assert.ok(operator.password?.salt);
  assert.ok(operator.password?.hash);
  assert.notEqual(operator.password.hash, "correct-horse-battery-staple");
  assert.equal(latest.operatorEmail, "marvin-script@example.com");

  console.log(JSON.stringify({
    ok: true,
    operatorPath,
    latestPath,
    operatorEmail: operator.email,
    hashedPassword: true
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
