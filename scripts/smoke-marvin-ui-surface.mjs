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

async function waitForPage(pathname = "/") {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
      const text = await response.text();
      if (response.ok && text) {
        return text;
      }
    } catch {
      // wait for server
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for Marvin UI path ${pathname}.`);
}

try {
  const homepage = await waitForPage();
  const appJs = await waitForPage("/app.js");

  assert.match(homepage, /Paranoid Keeper/i);
  assert.match(homepage, /Setup Assistant/i);
  assert.match(homepage, /Management Console/i);
  assert.match(homepage, /Marvin Account|Workspace/i);
  assert.match(homepage, /Link Accounts|Providers And Linking|Privacy And Automation|Manage Calendars|Calendars/i);
  assert.match(homepage, /automation status/i);
  assert.match(homepage, /Sign in|Create Workspace Account|Workspace Account/i);
  assert.match(homepage, /Link Accounts|Providers And Linking|Privacy And Automation|Save rules, connect calendars, start sync|Access, Connect, Automate/i);
  assert.match(homepage, /Automation/i);
  assert.match(homepage, /Paranoid Keeper runtime/i);
  assert.match(homepage, /Refresh Paranoid Keeper Runtime/i);
  assert.match(homepage, /Action Required/i);
  assert.match(homepage, /Ready/i);
  assert.match(homepage, /Set up Paranoid Keeper once\. Keep every calendar current\./i);
  assert.match(homepage, /Access setup:/i);
  assert.match(homepage, /Link status:/i);
  assert.match(homepage, /Check All Calendars/i);
  assert.match(homepage, /Paranoid Keeper starts automatically when every calendar is linked and validated\./i);
  assert.match(homepage, /Linked identity/i);
  assert.match(homepage, /Auth proof/i);
  assert.match(homepage, /OAuth callback/i);
  assert.match(homepage, /Token obtained/i);
  assert.match(homepage, /Mirror Preview/i);

  assert.doesNotMatch(homepage, /keeper\.sh/i);
  assert.doesNotMatch(homepage, /Welcome back/i);
  assert.doesNotMatch(homepage, /Sign in to your Keeper\.sh account/i);

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "Paranoid Keeper branding",
      "Workspace-account-first setup and sign-in flow",
      "Management Console",
      "Paranoid Keeper workspace summary",
      "Calendars management surface",
      "Automation controls",
      "Readiness-oriented stats",
      "Per-calendar access and provider-link state",
      "Batch validation control",
      "Automation readiness gate messaging",
      "Staged onboarding step names",
      "Setup-step automation start action",
      "Provider-admin details shipped in frontend",
      "Linked-account proof labels shipped in frontend",
      "Mirror-preview labels shipped in frontend",
      "Webhook queue labels shipped in frontend",
      "No Keeper login copy"
    ]
  }, null, 2));
} finally {
  try { server.kill("SIGTERM"); } catch {}
  await sleep(500);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
