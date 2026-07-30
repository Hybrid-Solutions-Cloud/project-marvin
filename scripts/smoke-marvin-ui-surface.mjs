import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve("C:/tmp/marvin-ui-surface-smoke-" + Date.now());
const port = 4300 + Math.floor(Math.random() * 1000);
fs.mkdirSync(tempRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: { ...process.env, MARVIN_ROOT_DIR: tempRoot, MARVIN_UI_PORT: String(port) },
  stdio: "ignore"
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForPage(pathname) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + pathname);
      const text = await response.text();
      if (response.ok && text) return text;
    } catch {}
    await sleep(200);
  }
  throw new Error("Timed out waiting for UI path " + pathname);
}

try {
  const homepage = await waitForPage("/");
  const appJs = await waitForPage("/app.js");

  assert.match(homepage, /Paranoid Keeper/i);
  assert.match(homepage, /Calendar synchronization/i);
  assert.match(appJs, /Create your security account/i);
  assert.match(appJs, /recovery identity/i);
  assert.match(appJs, /Calendar provider/i);
  assert.match(appJs, /Account email/i);
  assert.match(appJs, /Add calendar/i);
  assert.match(appJs, /Starting account authorization/i);
  assert.match(appJs, /window\.location\.assign\(result\.launchUrl\)/i);
  assert.match(appJs, /Private copy by default/i);
  assert.match(appJs, /Share details/i);
  assert.match(appJs, /Automatic after authorization/i);

  assert.doesNotMatch(homepage, /Set up Paranoid Keeper once/i);
  assert.doesNotMatch(homepage, /What Paranoid Keeper does/i);
  assert.doesNotMatch(homepage, /Setup Assistant/i);
  assert.doesNotMatch(appJs, /Setup Assistant/i);
  assert.doesNotMatch(appJs, /Link Accounts/i);
  assert.doesNotMatch(appJs, /Mirror Preview/i);
  assert.doesNotMatch(homepage, /keeper\.sh/i);

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "Security-account-first entry point",
      "Recovery identity capture",
      "Provider and email only calendar creation",
      "Immediate provider authorization",
      "Private default and later detail sharing",
      "No setup assistant or marketing landing page"
    ]
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}