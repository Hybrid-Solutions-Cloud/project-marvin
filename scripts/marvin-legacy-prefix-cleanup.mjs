import fs from "node:fs";
import path from "node:path";
import { createRuntimeContext } from "../solutions/marvin-engine/src/util/runtime-context.mjs";
import { buildLegacyPrefixCleanupPlan, applyLegacyPrefixCleanup } from "../solutions/marvin-engine/src/util/legacy-prefix-cleanup.mjs";
import { atomicWriteJson, CURRENT_STATE_SCHEMA_VERSION } from "../solutions/marvin-engine/src/storage/file-state-store.mjs";

function readJson(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function sanitizeName(value) {
  return String(value || "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

const args = process.argv.slice(2);
const root = path.resolve(process.env.MARVIN_ROOT_DIR || process.cwd());
const latest = readJson(path.join(root, ".marvin", "latest.json"), {});
const requestedProfile = args.find((argument) => !argument.startsWith("--"));
const profileName = sanitizeName(requestedProfile || latest.profileName);
const apply = args.includes("--apply");
const repair = args.includes("--repair") || apply;
const confirmation = (args.find((argument) => argument.startsWith("--confirm=")) || "").slice("--confirm=".length);

if (!profileName) throw new Error("Profile name is required and no active Marvin profile was found.");
if (apply && confirmation !== "REMOVE-LEGACY-MIRRORS") {
  throw new Error("Apply mode requires --confirm=REMOVE-LEGACY-MIRRORS.");
}

const profilePath = path.join(root, "profiles", `${profileName}.json`);
if (!fs.existsSync(profilePath)) throw new Error(`Profile not found: ${profileName}`);
const runtime = createRuntimeContext({ rootDir: root, profilePath });
const now = Date.now();
const windowStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
const windowEnd = new Date(now + Number(runtime.profile.syncWindowDays || 45) * 24 * 60 * 60 * 1000);
let reconciliation = null;

if (repair) {
  process.env.MARVIN_PROVIDER_DELETE_MODE = "disabled";
  const state = runtime.store.load();
  runtime.store.save({ ...state, changeTracking: {} });
  const sourceLoad = await runtime.engine.loadSourceEventsFromProviders({ windowStart, windowEnd });
  if (sourceLoad.errors.length) throw new Error(`Prefix repair stopped because ${sourceLoad.errors.length} provider read(s) failed.`);
  const applyResult = await runtime.engine.applyLiveSync();
  reconciliation = {
    sourceEvents: sourceLoad.loaded,
    attempted: applyResult.attempted,
    succeeded: applyResult.succeeded,
    failed: applyResult.failed,
    skipped: applyResult.skipped
  };
  if (applyResult.failed) throw new Error(`Prefix repair stopped because ${applyResult.failed} mirror write(s) failed.`);
}

const plan = await buildLegacyPrefixCleanupPlan({
  profile: runtime.profile,
  adapters: runtime.adapters,
  mappings: runtime.store.load()?.mappings || [],
  windowStart,
  windowEnd
});

const auditRoot = path.join(root, ".marvin", "reviews");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const auditPath = path.join(auditRoot, `${profileName}.legacy-prefix-cleanup.${stamp}.json`);
atomicWriteJson(auditPath, {
  profileName,
  mode: apply ? "apply" : "plan",
  reconciliation,
  plan,
  _schemaVersion: CURRENT_STATE_SCHEMA_VERSION
});

if (!apply) {
  console.log(JSON.stringify({ ok: true, mode: "plan", profileName, auditPath, reconciliation, summary: plan.summary, providerErrors: plan.errors }, null, 2));
  process.exit(0);
}

if (plan.errors.length || plan.summary.blocked) {
  throw new Error(`Cleanup was not applied: ${plan.summary.providerErrors} provider error(s), ${plan.summary.blocked} mirror(s) without a verified replacement. Audit: ${auditPath}`);
}

process.env.MARVIN_PROVIDER_DELETE_MODE = "managed-mirrors-only";
const cleanup = await applyLegacyPrefixCleanup({ profile: runtime.profile, adapters: runtime.adapters, plan });
const verification = await buildLegacyPrefixCleanupPlan({
  profile: runtime.profile,
  adapters: runtime.adapters,
  mappings: runtime.store.load()?.mappings || [],
  windowStart,
  windowEnd
});
atomicWriteJson(auditPath, {
  profileName,
  mode: "apply",
  reconciliation,
  plan,
  cleanup,
  verification: { summary: verification.summary, errors: verification.errors },
  completedAt: new Date().toISOString(),
  _schemaVersion: CURRENT_STATE_SCHEMA_VERSION
});

if (cleanup.failed || verification.summary.legacyMirrors) {
  throw new Error(`Cleanup verification failed: ${cleanup.failed} deletion error(s), ${verification.summary.legacyMirrors} legacy mirror(s) remain. Audit: ${auditPath}`);
}

console.log(JSON.stringify({ ok: true, mode: "apply", profileName, auditPath, reconciliation, cleanup: { attempted: cleanup.attempted, deleted: cleanup.deleted, alreadyMissing: cleanup.alreadyMissing, failed: cleanup.failed }, verification: verification.summary }, null, 2));
