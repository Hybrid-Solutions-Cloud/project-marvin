import fs from "node:fs";
import path from "node:path";
import { resolveActiveProfile, loadLatestProfileState } from "../solutions/marvin-engine/src/util/active-profile.mjs";
import { assessProfileConnections } from "../solutions/marvin-engine/src/util/provider-connections.mjs";
import { getRuntimeProcessStatus } from "../solutions/marvin-engine/src/util/runtime-process.mjs";
import { buildRequirementCoverage } from "./lib/marvin-status.mjs";

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function parseArgs(argv = process.argv.slice(2)) {
  const profileFlagIndex = argv.indexOf("--profile");
  const rootDir = process.env.MARVIN_ROOT_DIR ? path.resolve(process.env.MARVIN_ROOT_DIR) : process.cwd();
  const explicitProfilePath = profileFlagIndex >= 0 ? argv[profileFlagIndex + 1] : "";
  return {
    rootDir,
    explicitProfilePath,
    json: argv.includes("--json")
  };
}

function buildPaths(rootDir, profileName) {
  const slug = sanitizeName(profileName);
  return {
    configPath: path.join(rootDir, ".marvin", `${slug}.setup.json`),
    secretsPath: path.join(rootDir, ".marvin", "provider-secrets", `${slug}.secrets.json`),
    runtimeStatusPath: path.join(rootDir, ".marvin", "runtime", `${slug}.runtime.json`)
  };
}


function buildVerificationGuidance() {
  return {
    verifyLocalCommand: "npm run marvin:verify-local",
    operatorCreationCommand: "npm run marvin:create-operator -- --email <email> --display-name <name> --password <password>",
    operatorCreationProofCommand: "npm run marvin:smoke-create-operator",
    authGatingProofCommand: "npm run marvin:smoke-auth-gating",
    operatorJourneyCommand: "npm run marvin:smoke-operator-journey",
    syncProofCommand: "npm run marvin:smoke-live",
    statusReportingProofCommand: "npm run marvin:smoke-status-reporting",
    requirementsDocsPath: "docs/requirements.md",
    onboardingDocsPath: "docs/operator/onboarding-ui.md"
  };
}

function buildHostedGuidance(profileName = "marvin") {
  const safeProfile = sanitizeName(profileName || "marvin");
  return {
    supported: true,
    planCommand: "npm run marvin:azure:plan -- -SubscriptionId <subscription-guid> -WorkloadName marvin -Environment dev -RegionShort wus3 -Instance 01 -Location westus3",
    deployCommand: "npm run marvin:azure:deploy -- -SubscriptionId <subscription-guid> -WorkloadName marvin -Environment dev -RegionShort wus3 -Instance 01 -Location westus3",
    entraPlanCommand: `pwsh -ExecutionPolicy Bypass -File .\\scripts\\register-marvin-entra-app.ps1 -ProfileName ${safeProfile} -EmitOnly`,
    googlePlanCommand: `pwsh -ExecutionPolicy Bypass -File .\\scripts\\register-marvin-google-app.ps1 -ProfileName ${safeProfile} -MarvinBaseUrl <marvin-url> -EmitOnly`,
    docsPath: "docs/solutions/marvin-azure.md"
  };
}

function buildNextSteps(profile, config, connectionSummary, runtimeStatus, runtimeProcess, providerSecrets) {
  const steps = [];
  const hasProfile = Boolean(profile);
  const hasConfig = Boolean(config);

  if (!hasProfile && !hasConfig) {
    steps.push("Run npm run marvin:install or npm run marvin:bootstrap to scaffold Marvin locally.");
    steps.push("If you want the Marvin workspace account created before opening the UI, run npm run marvin:create-operator -- --email <email> --display-name <name> --password <password>.");
    steps.push("Run npm run marvin:ui to open the Marvin setup and management UI.");
    steps.push("If you plan to host Marvin on Azure, run npm run marvin:azure:plan to review the deployment shape before a live deploy.");
    return steps;
  }

  if (hasProfile && !hasConfig) {
    steps.push("Run npm run marvin:ui or npm run marvin:setup so Marvin saves local setup state under .marvin/ and exposes the staged Marvin setup flow.");
  }

  if (!Array.isArray(profile?.calendars) || profile.calendars.length === 0) {
    steps.push("Add at least one calendar in Marvin before expecting sync behavior.");
  }

  const calendars = Array.isArray(profile?.calendars) ? profile.calendars : [];
  const needsMicrosoft = calendars.some((calendar) => calendar.provider === "m365" || calendar.provider === "outlook");
  const needsGoogle = calendars.some((calendar) => calendar.provider === "google");
  const needsCalDav = calendars.some((calendar) => calendar.provider === "apple-caldav");

  if (needsMicrosoft && !config?.providerCredentials?.microsoftClientId) {
    steps.push(`Run pwsh -ExecutionPolicy Bypass -File .\\scripts\\register-marvin-entra-app.ps1 -ProfileName ${sanitizeName(profile?.name || config?.profileName || "marvin.local")} -EmitOnly so Marvin can show the exact Microsoft app-registration plan before you save the client ID and secret.`);
  }
  if (needsGoogle && !config?.providerCredentials?.googleClientId) {
    steps.push(`Run pwsh -ExecutionPolicy Bypass -File .\\scripts\\register-marvin-google-app.ps1 -ProfileName ${sanitizeName(profile?.name || config?.profileName || "marvin.local")} -MarvinBaseUrl <marvin-url> -EmitOnly so Marvin can show the exact Google OAuth plan before you save the client ID and secret.`);
  }
  if (needsCalDav) {
    const missingApple = (config?.accounts || []).filter((account) => account.provider === "apple-caldav" && !account.caldavPasswordConfigured);
    if (!config || missingApple.length > 0) {
      steps.push("Add and validate an app password for every Apple / CalDAV calendar.");
    }
  }
  if ((connectionSummary?.summary?.connected || 0) < (connectionSummary?.summary?.total || 0)) {
    steps.push("Use Marvin's Link Accounts stage or Calendars management list to authenticate or validate every calendar you expect to sync.");
  }
  steps.push("Use npm run marvin:smoke-operator-journey when you want one Marvin-owned verification path for Marvin account setup, provider auth state, validation state, and runtime control.");
  if (!runtimeProcess?.running || runtimeStatus?.running === false || !runtimeStatus) {
    steps.push("Start Marvin automation with npm run marvin:runtime:start or from the Marvin console once connections are ready.");
  }
  if (hasConfig) {
    steps.push("Use npm run marvin:azure:plan if you want a scriptable preview of the hosted Azure resource names and runtime settings before deployment.");
  }
  steps.push("Run npm run marvin:doctor -- --json and review requirementCoverage for the current product-level proof and remaining gaps.");
  if (steps.length === 0) {
    steps.push("No obvious local blockers found. The next proof point is live end-to-end sync against real provider accounts.");
  }
  return steps;
}

function buildDoctorReport(args) {
  const activeProfile = resolveActiveProfile(args.rootDir, args.explicitProfilePath);
  const latest = loadLatestProfileState(args.rootDir);
  const profile = readJson(activeProfile.profilePath, null);
  const paths = buildPaths(args.rootDir, activeProfile.profileName);
  const config = readJson(paths.configPath, null);
  const providerSecrets = readJson(paths.secretsPath, {});
  const runtimeStatus = readJson(paths.runtimeStatusPath, null);
  const runtimeProcess = getRuntimeProcessStatus(args.rootDir, activeProfile.profileName);
  const connectionSummary = profile ? assessProfileConnections(profile) : null;

  const report = {
    ok: true,
    rootDir: args.rootDir,
    latestProfileState: latest,
    activeProfile: {
      profileName: activeProfile.profileName,
      profilePath: activeProfile.profilePath,
      source: activeProfile.source,
      exists: Boolean(profile)
    },
    setup: {
      configPath: paths.configPath,
      configExists: Boolean(config),
      calendarsConfigured: Array.isArray(profile?.calendars) ? profile.calendars.length : 0,
      timezone: profile?.timezone || config?.timezone || "",
      syncWindowDays: profile?.syncWindowDays || config?.syncWindowDays || 0
    },
    providerCredentials: {
      microsoftClientIdConfigured: Boolean(config?.providerCredentials?.microsoftClientId),
      microsoftClientSecretConfigured: Boolean(providerSecrets?.microsoftClientSecret),
      googleClientIdConfigured: Boolean(config?.providerCredentials?.googleClientId),
      googleClientSecretConfigured: Boolean(providerSecrets?.googleClientSecret)
    },
    connections: connectionSummary,
    runtime: {
      status: runtimeStatus,
      process: runtimeProcess
    },
    verification: buildVerificationGuidance(),
    hosted: buildHostedGuidance(activeProfile.profileName),
    requirementCoverage: buildRequirementCoverage()
  };

  report.nextSteps = buildNextSteps(profile, config, connectionSummary, runtimeStatus, runtimeProcess, providerSecrets);
  return report;
}

const args = parseArgs();
const report = buildDoctorReport(args);
console.log(JSON.stringify(report, null, 2));
