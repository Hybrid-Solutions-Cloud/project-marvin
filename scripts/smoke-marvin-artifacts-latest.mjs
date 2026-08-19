import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const tempRoot = path.resolve(`C:/tmp/marvin-artifacts-latest-smoke-${Date.now()}`);
const profileName = "marvin-artifacts-latest-smoke";

fs.mkdirSync(path.join(tempRoot, "profiles"), { recursive: true });
fs.mkdirSync(path.join(tempRoot, ".marvin"), { recursive: true });

const profile = {
  name: profileName,
  timezone: "America/New_York",
  syncWindowDays: 7,
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
      microsoft: { provider: "m365", authMode: "marvin-engine", clientId: "ms-client" },
      google: { provider: "google", authMode: "marvin-engine", clientId: "google-client" },
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

fs.writeFileSync(path.join(tempRoot, "profiles", `${profileName}.json`), JSON.stringify(profile, null, 2) + "\n", "utf8");
fs.writeFileSync(
  path.join(tempRoot, ".marvin", "latest.json"),
  JSON.stringify({ operatorEmail: "marvin@example.com", profileName }, null, 2) + "\n",
  "utf8"
);

try {
  const output = execFileSync(process.execPath, ["scripts/build-calendar-options.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MARVIN_ROOT_DIR: tempRoot
    }
  });

  const summaryPath = path.join(tempRoot, "artifacts", "solutions", profileName, "summary.json");
  assert.equal(fs.existsSync(summaryPath), true);
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  assert.equal(summary.profile, profileName);
  assert.equal(summary.routes, 2);
  assert.match(output, new RegExp(`Generated solution artifacts for ${profileName} at artifacts[\\\\/]solutions[\\\\/]${profileName} \\(latest\\)`));

  console.log(JSON.stringify({
    ok: true,
    profileName,
    generatedSolutions: summary.solutions.map((item) => item.name)
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
