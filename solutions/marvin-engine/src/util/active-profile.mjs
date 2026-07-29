import fs from "node:fs";
import path from "node:path";

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function listCandidateProfiles(rootDir) {
  const profilesDir = path.resolve(rootDir, "profiles");
  if (!fs.existsSync(profilesDir)) {
    return [];
  }

  return fs.readdirSync(profilesDir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".events.json") && name !== "marvin.schema.json")
    .map((name) => {
      const profilePath = path.join(profilesDir, name);
      const stat = fs.statSync(profilePath);
      return {
        profileName: path.basename(name, ".json"),
        profilePath,
        mtimeMs: stat.mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function buildLatestProfileStatePath(rootDir) {
  return path.resolve(rootDir, ".marvin", "latest.json");
}

export function loadLatestProfileState(rootDir) {
  return readJson(buildLatestProfileStatePath(rootDir), null);
}

export function saveLatestProfileState(rootDir, value) {
  writeJson(buildLatestProfileStatePath(rootDir), value);
  return value;
}

function repairLatestProfileState(rootDir, previousLatest, profileName) {
  return saveLatestProfileState(rootDir, {
    operatorEmail: String(previousLatest?.operatorEmail || "").trim(),
    profileName
  });
}

export function resolveActiveProfile(rootDir, explicitProfilePath = "") {
  if (explicitProfilePath) {
    const resolvedPath = path.resolve(rootDir, explicitProfilePath);
    return {
      profileName: path.basename(resolvedPath, ".json"),
      profilePath: resolvedPath,
      source: "explicit"
    };
  }

  const latest = loadLatestProfileState(rootDir);
  const latestProfileName = sanitizeName(latest?.profileName);
  if (latestProfileName) {
    const latestProfilePath = path.resolve(rootDir, "profiles", `${latestProfileName}.json`);
    if (fs.existsSync(latestProfilePath)) {
      return {
        profileName: latestProfileName,
        profilePath: latestProfilePath,
        source: "latest"
      };
    }
  }

  const candidates = listCandidateProfiles(rootDir);
  if (candidates.length > 0) {
    const selected = candidates[0];
    repairLatestProfileState(rootDir, latest, selected.profileName);
    return {
      profileName: selected.profileName,
      profilePath: selected.profilePath,
      source: latestProfileName ? "fallback-existing" : "existing"
    };
  }

  return {
    profileName: "marvin.example",
    profilePath: path.resolve(rootDir, "profiles", "marvin.example.json"),
    source: "default"
  };
}

export function resolveActiveEventsPath(rootDir, explicitEventsPath = "", profilePath = "") {
  if (explicitEventsPath) {
    return {
      eventsPath: path.resolve(rootDir, explicitEventsPath),
      source: "explicit"
    };
  }

  const resolvedProfilePath = profilePath
    ? path.resolve(rootDir, profilePath)
    : resolveActiveProfile(rootDir).profilePath;
  const dirname = path.dirname(resolvedProfilePath);
  const basename = path.basename(resolvedProfilePath, ".json");
  return {
    eventsPath: path.join(dirname, `${basename}.events.json`),
    source: "derived"
  };
}

