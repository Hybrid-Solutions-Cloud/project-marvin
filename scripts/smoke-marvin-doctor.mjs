import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();

function runDoctor(tempRoot) {
  const output = execFileSync(process.execPath, ["scripts/marvin-doctor.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      MARVIN_ROOT_DIR: tempRoot
    }
  });
  return JSON.parse(output);
}

const configuredRoot = path.resolve(`C:/tmp/marvin-doctor-smoke-${Date.now()}`);
const profilesDir = path.join(configuredRoot, "profiles");
const stateDir = path.join(configuredRoot, ".marvin");
const runtimeDir = path.join(stateDir, "runtime");
const secretsDir = path.join(stateDir, "provider-secrets");

fs.mkdirSync(profilesDir, { recursive: true });
fs.mkdirSync(runtimeDir, { recursive: true });
fs.mkdirSync(secretsDir, { recursive: true });

const profileName = "marvin-doctor-smoke";
const profile = {
  name: profileName,
  timezone: "America/New_York",
  syncWindowDays: 21,
  runtime: {
    deployment: { marvinUrl: "http://127.0.0.1:4177" },
    providerConnections: {
      microsoft: { authMode: "marvin-engine", clientId: "ms-client", marvinBaseUrl: "http://127.0.0.1:4177", authorizePath: "/marvin-api/oauth/microsoft/start" },
      google: { authMode: "marvin-engine", clientId: "google-client", marvinBaseUrl: "http://127.0.0.1:4177", authorizePath: "/marvin-api/oauth/google/start" },
      caldav: { authMode: "manual-caldav", passwordConfigured: true, passwords: { apple_home: "secret" } }
    }
  },
  calendars: [
    { id: "work_m365", label: "Work", provider: "m365", email: "work@example.com", scope: "work", sourcePrefix: "WORK: ", connectionStatus: "pending" },
    { id: "family_google", label: "Family", provider: "google", email: "family@example.com", scope: "family", sourcePrefix: "FAM: ", connectionStatus: "connected" },
    { id: "apple_home", label: "Home", provider: "apple-caldav", email: "home@example.com", scope: "personal", sourcePrefix: "HOME: ", caldavServerUrl: "https://caldav.example.com/home", caldavUsername: "home@example.com", connectionStatus: "pending" }
  ],
  routes: []
};

fs.writeFileSync(path.join(profilesDir, `${profileName}.json`), JSON.stringify(profile, null, 2));
fs.writeFileSync(path.join(stateDir, "latest.json"), JSON.stringify({ operatorEmail: "marvin@example.com", profileName }, null, 2));
fs.writeFileSync(path.join(stateDir, `${profileName}.setup.json`), JSON.stringify({
  profileName,
  timezone: "America/New_York",
  syncWindowDays: 21,
  providerCredentials: {
    microsoftClientId: "ms-client",
    googleClientId: "google-client"
  }
}, null, 2));
fs.writeFileSync(path.join(secretsDir, `${profileName}.secrets.json`), JSON.stringify({
  microsoftClientSecret: "ms-secret",
  googleClientSecret: "google-secret",
  caldavPasswords: { apple_home: "secret" }
}, null, 2));
fs.writeFileSync(path.join(runtimeDir, `${profileName}.runtime.json`), JSON.stringify({
  running: false,
  runCount: 0,
  intervalSeconds: 300
}, null, 2));

const emptyRoot = path.resolve(`C:/tmp/marvin-doctor-empty-${Date.now()}`);
fs.mkdirSync(emptyRoot, { recursive: true });

try {
  const report = runDoctor(configuredRoot);
  assert.equal(report.ok, true);
  assert.equal(report.activeProfile.profileName, profileName);
  assert.equal(report.providerCredentials.microsoftClientIdConfigured, true);
  assert.equal(report.providerCredentials.googleClientSecretConfigured, true);
  assert.equal(report.connections.summary.total, 3);
  assert.equal(report.runtime.status.running, false);
  assert.equal(report.verification.verifyLocalCommand, "npm run marvin:verify-local");
  assert.equal(report.verification.operatorCreationCommand, "npm run marvin:create-operator -- --email <email> --display-name <name> --password <password>");
  assert.equal(report.verification.operatorCreationProofCommand, "npm run marvin:smoke-create-operator");
  assert.equal(report.verification.authGatingProofCommand, "npm run marvin:smoke-auth-gating");
  assert.equal(report.verification.operatorJourneyCommand, "npm run marvin:smoke-operator-journey");
  assert.equal(report.verification.syncProofCommand, "npm run marvin:smoke-live");
  assert.equal(report.verification.requirementsDocsPath, "docs/requirements.md");
  assert.match(report.requirementCoverage.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(report.requirementCoverage.summary.total >= 10);
  assert.ok(report.requirementCoverage.summary.provenLocally >= 1);
  assert.ok(report.requirementCoverage.requirements.some((item) => /source calendar prefix/i.test(item.requirement) && item.status === "proven-locally"));
  assert.ok(report.requirementCoverage.requirements.some((item) => /private by default/i.test(item.requirement) && item.status === "partial"));
  assert.equal(report.hosted.supported, true);
  assert.match(report.hosted.planCommand, /marvin:azure:plan/i);
  assert.match(report.hosted.deployCommand, /marvin:azure:deploy/i);
  assert.match(report.hosted.entraPlanCommand, new RegExp(profileName, "i"));
  assert.match(report.hosted.googlePlanCommand, new RegExp(profileName, "i"));
  assert.ok(Array.isArray(report.nextSteps));
  assert.ok(report.nextSteps.some((step) => /Calendars management list/i.test(step)));
  assert.ok(report.nextSteps.some((step) => /smoke-operator-journey/i.test(step)));
  assert.ok(report.nextSteps.some((step) => /runtime:start/i.test(step)));
  assert.ok(report.nextSteps.some((step) => /marvin:azure:plan/i.test(step)));

  const emptyReport = runDoctor(emptyRoot);
  assert.equal(emptyReport.ok, true);
  assert.equal(emptyReport.activeProfile.exists, false);
  assert.ok(emptyReport.nextSteps.some((step) => /marvin:install|marvin:bootstrap/i.test(step)));
  assert.ok(emptyReport.nextSteps.some((step) => /marvin:create-operator/i.test(step)));
  assert.ok(emptyReport.nextSteps.some((step) => /marvin:ui/i.test(step)));
  assert.ok(emptyReport.nextSteps.some((step) => /marvin:azure:plan/i.test(step)));
  assert.ok(emptyReport.requirementCoverage.requirements.some((item) => /event created or accepted in any connected calendar mirrors/i.test(item.requirement)));

  console.log(JSON.stringify({
    ok: true,
    profileName: report.activeProfile.profileName,
    calendarsConfigured: report.setup.calendarsConfigured,
    connected: report.connections.summary.connected,
    nextSteps: report.nextSteps.length,
    emptyNextSteps: emptyReport.nextSteps.length,
    operatorJourney: report.verification.operatorJourneyCommand,
    hostedPlan: report.hosted.planCommand
  }, null, 2));
} finally {
  fs.rmSync(configuredRoot, { recursive: true, force: true });
  fs.rmSync(emptyRoot, { recursive: true, force: true });
}
