import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const name = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[name] = true;
      continue;
    }

    options[name] = next;
    index += 1;
  }

  return options;
}

function requireOption(options, name) {
  const value = typeof options[name] === "string" ? options[name].trim() : "";
  if (!value) {
    throw new Error(`Missing required option --${name}`);
  }

  return value;
}

function sanitizeName(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "marvin";
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

const options = parseArgs(process.argv.slice(2));
const email = requireOption(options, "email");
const displayName = requireOption(options, "display-name");
const password = requireOption(options, "password");

const latestPath = path.join(root, ".marvin", "latest.json");
const latest = readJson(latestPath, {});
const accountId = sanitizeName(email);
const operatorPath = path.join(root, ".marvin", "operators", `${accountId}.account.json`);
const existing = readJson(operatorPath, null);
const now = new Date().toISOString();

const operator = {
  accountId,
  displayName,
  email,
  createdAt: existing?.createdAt || now,
  updatedAt: now,
  password: hashPassword(password)
};

writeJson(operatorPath, operator);
writeJson(latestPath, {
  ...latest,
  operatorEmail: email,
  updatedAt: now
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  email,
  displayName,
  operatorPath,
  createdAt: operator.createdAt,
  updatedAt: operator.updatedAt
}, null, 2)}\n`);
