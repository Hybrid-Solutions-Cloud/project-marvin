import fs from "node:fs";
import path from "node:path";
import { createRuntimeContext } from "../solutions/marvin-engine/src/util/runtime-context.mjs";
import { buildCalendarReview } from "../solutions/marvin-engine/src/util/calendar-review.mjs";
import { atomicWriteJson, CURRENT_STATE_SCHEMA_VERSION } from "../solutions/marvin-engine/src/storage/file-state-store.mjs";

function readJson(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function sanitizeName(value) {
  return String(value || "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

const root = path.resolve(process.env.MARVIN_ROOT_DIR || process.cwd());
const stateRoot = path.join(root, ".marvin");
const requestedProfile = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const latest = readJson(path.join(stateRoot, "latest.json"), {});
const profileName = sanitizeName(requestedProfile || latest.profileName);

if (!profileName) {
  throw new Error("Profile name is required and no active Marvin profile was found.");
}

const profilePath = path.join(root, "profiles", `${profileName}.json`);
if (!fs.existsSync(profilePath)) {
  throw new Error(`Profile not found: ${profileName}`);
}

const runtime = createRuntimeContext({ rootDir: root, profilePath });
const now = Date.now();
const review = await buildCalendarReview({
  profile: runtime.profile,
  adapters: runtime.adapters,
  mappings: runtime.store.load()?.mappings || [],
  windowStart: new Date(now - 7 * 24 * 60 * 60 * 1000),
  windowEnd: new Date(now + Number(runtime.profile.syncWindowDays || 45) * 24 * 60 * 60 * 1000)
});

const reviewPath = path.join(stateRoot, "reviews", `${profileName}.calendar-review.json`);
const previous = readJson(reviewPath, {});
atomicWriteJson(reviewPath, {
  generatedAt: review.generatedAt,
  review,
  decisions: previous.decisions && typeof previous.decisions === "object" ? previous.decisions : {},
  _schemaVersion: CURRENT_STATE_SCHEMA_VERSION
});

console.log(JSON.stringify({
  ok: true,
  profileName,
  reviewPath,
  generatedAt: review.generatedAt,
  summary: review.summary,
  providerErrors: review.errors.map((error) => ({ calendarId: error.calendarId, provider: error.provider, message: error.message }))
}, null, 2));
