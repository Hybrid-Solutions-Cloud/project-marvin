import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-ui-surface-smoke-${Date.now()}`);
const port = 4300 + Math.floor(Math.random() * 1000);

fs.mkdirSync(tempRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/marvin-onboard-ui.mjs"], {
  cwd: repoRoot,
  windowsHide: true,
  env: {
    ...process.env,
    MARVIN_ROOT_DIR: tempRoot,
    MARVIN_UI_PORT: String(port)
  },
  stdio: "ignore"
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPage() {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const text = await response.text();
      if (response.ok && text) {
        return text;
      }
    } catch {
      // wait for server
    }
    await sleep(200);
  }
  throw new Error("Timed out waiting for Marvin UI homepage.");
}

try {
  const homepage = await waitForPage();

  assert.match(homepage, /Project Marvin/i);
  assert.match(homepage, /Setup Assistant/i);
  assert.match(homepage, /Management Console/i);
  assert.match(homepage, /Marvin Account|Workspace/i);
  assert.match(homepage, /Linked Accounts|Account Connections|Connection Center|Connected Calendars/i);
  assert.match(homepage, /automation status/i);
  assert.match(homepage, /Create your Marvin admin sign-in|Create your Marvin account/i);
  assert.match(homepage, /Link And Start|Connect And Start|Connect And Launch|Access, Connect, Automate/i);
  assert.match(homepage, /Automation/i);
  assert.match(homepage, /Start Automation/i);
  assert.match(homepage, /Refresh Runtime/i);
  assert.match(homepage, /Action Required/i);
  assert.match(homepage, /Ready/i);
  assert.match(homepage, /Set up Marvin once\. Keep every calendar current\./i);
  assert.match(homepage, /Access setup:/i);
  assert.match(homepage, /Authentication:/i);
  assert.match(homepage, /Validate All Calendars/i);
  assert.match(homepage, /Automation stays blocked until every calendar below is connected and validated\./i);

  assert.doesNotMatch(homepage, /keeper\.sh/i);
  assert.doesNotMatch(homepage, /Welcome back/i);
  assert.doesNotMatch(homepage, /Sign in to your Keeper\.sh account/i);

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "Project Marvin branding",
      "Account-first setup flow",
      "Management Console",
      "Marvin admin summary",
      "Account Connections",
      "Automation controls",
      "Readiness-oriented stats",
      "Per-calendar access and authentication state",
      "Batch validation control",
      "Automation readiness gate messaging",
      "Setup-step automation start action",
      "No Keeper login copy"
    ]
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}





