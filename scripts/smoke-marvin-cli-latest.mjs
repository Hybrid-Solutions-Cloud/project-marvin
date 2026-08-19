import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-cli-latest-smoke-${Date.now()}`);
const profileName = "marvin-cli-latest-smoke";

fs.mkdirSync(path.join(tempRoot, "profiles"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, ".marvin"), { recursive: true });

const profile = {
  name: profileName,
  timezone: "America/New_York",
  syncWindowDays: 1,
  privacyDefaults: {
    mirrorMode: "subject",
    visibility: "private",
    subjectPrefix: "SRC: ",
    copyLocation: false,
    copyDescription: false,
    preserveOriginalTimezone: true
  },
  runtime: {
    deployment: {},
    providerConnections: {
      microsoft: { provider: "m365", authMode: "marvin-engine", clientId: "" },
      google: { provider: "google", authMode: "marvin-engine", clientId: "" },
      caldav: { provider: "apple-caldav", authMode: "manual-caldav", serverUrl: "", username: "" }
    }
  },
  calendars: [
    { id: "work", label: "Work", provider: "m365", email: "work@example.com", scope: "work", sourcePrefix: "WORK: ", connectionStatus: "pending" },
    { id: "family", label: "Family", provider: "google", email: "family@example.com", scope: "family", sourcePrefix: "FAM: ", connectionStatus: "pending", inboundOverrides: { visibility: "default", detailMode: "full", copyLocation: true, copyDescription: true } }
  ],
  routes: [
    {
      source: "work",
      targets: [
        { calendarId: "family", visibility: "default", detailMode: "full", subjectPrefix: "WORK: ", copyLocation: true, copyDescription: true }
      ]
    },
    {
      source: "family",
      targets: [
        { calendarId: "work", visibility: "private", detailMode: "subject", subjectPrefix: "FAM: ", copyLocation: false, copyDescription: false }
      ]
    }
  ]
};

const events = {
  events: [
    {
      id: "evt-1",
      calendarId: "work",
      subject: "Quarterly planning",
      description: "Roadmap review",
      start: "2026-07-29T10:00:00-04:00",
      end: "2026-07-29T11:00:00-04:00",
      timezone: "America/New_York",
      location: "Teams",
      status: "confirmed"
    }
  ]
};

const profilePath = path.join(tempRoot, "profiles", `${profileName}.json`);
const eventsPath = path.join(tempRoot, "profiles", `${profileName}.events.json`);
fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");
fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2) + "\n", "utf8");
fs.writeFileSync(
  path.join(tempRoot, ".marvin", "latest.json"),
  JSON.stringify({ operatorEmail: "marvin@example.com", profileName }, null, 2) + "\n",
  "utf8"
);

function runCli(args = []) {
  const output = execFileSync(process.execPath, ["solutions/marvin-engine/src/cli.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MARVIN_ROOT_DIR: tempRoot
    }
  });
  return JSON.parse(output);
}

try {
  const dryRun = runCli(["--dry-run"]);
  assert.equal(dryRun.profileName, profileName);
  assert.equal(path.resolve(dryRun.profilePath), path.resolve(profilePath));
  assert.equal(path.resolve(dryRun.eventsPath), path.resolve(eventsPath));
  assert.equal(dryRun.profileSource, "latest");
  assert.equal(dryRun.eventsSource, "derived");
  assert.equal(dryRun.plan.profile, profileName);
  assert.equal(dryRun.plan.sourceEvents, 1);
  assert.equal(dryRun.plan.operations.length, 1);

  const applyMock = runCli(["--apply-mock"]);
  assert.equal(applyMock.profileName, profileName);
  assert.equal(applyMock.profileSource, "latest");
  assert.equal(applyMock.eventsSource, "derived");
  assert.equal(applyMock.result.applied, 1);

  console.log(JSON.stringify({
    ok: true,
    profileName,
    operations: dryRun.plan.operations.length,
    applied: applyMock.result.applied
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
