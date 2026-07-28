import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const uiRoot = path.join(root, "operator-ui");
const publicRoot = path.join(uiRoot, "public");
const stateRoot = path.join(root, ".marvin");
const operatorsRoot = path.join(stateRoot, "operators");
const latestStatePath = path.join(stateRoot, "latest.json");
const port = Number(process.env.MARVIN_UI_PORT || 4177);
const deployEnabled = (process.env.MARVIN_DEPLOY_ENABLED || "true").toLowerCase() === "true";
const hostedMode = (process.env.MARVIN_HOSTED || "false").toLowerCase() === "true";
const keeperLinkUrl = process.env.MARVIN_KEEPER_LINK_URL || "/login";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendBuffer(res, statusCode, body, contentType = "application/octet-stream") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": body.length
  });
  res.end(body);
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

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function writeText(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data, "utf8");
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64");
}

function sanitizeName(value) {
  return String(value || "marvin.local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => !String(payload[field] || "").trim());
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function getOperatorPath(email) {
  return path.join(operatorsRoot, `${sanitizeName(email)}.account.json`);
}

function getConfigPath(profileName) {
  return path.join(stateRoot, `${sanitizeName(profileName)}.setup.json`);
}

function getLatestState() {
  return readJson(latestStatePath, {
    operatorEmail: "",
    profileName: "",
    selectedSolution: "paranoid-keeper"
  });
}

function setLatestState(nextState) {
  writeJson(latestStatePath, nextState);
}

function buildAccounts(input) {
  const accounts = Array.isArray(input.accounts) ? input.accounts : [];
  return accounts
    .map((account, index) => ({
      id: sanitizeName(account.id || `${account.provider || "account"}-${index + 1}`),
      label: String(account.label || `Calendar ${index + 1}`).trim(),
      provider: String(account.provider || "m365").trim(),
      email: String(account.email || "").trim(),
      tenantId: String(account.tenantId || "").trim(),
      scope: String(account.scope || "work").trim()
    }))
    .filter((account) => account.label && account.provider && account.email);
}

function buildProfile(input) {
  const calendars = buildAccounts(input).map((account) => ({
    id: account.id,
    label: account.label,
    provider: account.provider,
    email: account.email,
    tenantId: account.tenantId || undefined,
    optional: account.provider === "apple-caldav"
  }));

  const mirrorMode = input.preferences?.mirrorMode || "busy";
  const subjectPrefix = input.preferences?.subjectPrefix || "BUSY: ";

  const routes = calendars.map((calendar) => ({
    source: calendar.id,
    targets: calendars.filter((item) => item.id !== calendar.id).map((item) => item.id),
    mirrorMode,
    subjectPrefix
  })).filter((route) => route.targets.length > 0);

  return {
    name: sanitizeName(input.profileName),
    timezone: input.timezone,
    syncWindowDays: Number(input.syncWindowDays || 45),
    privacyDefaults: {
      mirrorMode,
      visibility: input.preferences?.visibility || "private",
      displayMode: input.preferences?.displayMode || "busy"
    },
    runtime: {
      powerAutomate: {
        automationTenantId: input.automationTenantId || "",
        environmentUrl: input.automationEnvironmentUrl || "",
        deploymentModel: "graph-http-entra-id",
        graphAppDisplayName: "Project Marvin Flow Runtime",
        supportedAccountTypes: "AzureADMultipleOrgs"
      }
    },
    selectedSolution: input.selectedSolution || "paranoid-keeper",
    calendars,
    routes
  };
}

function buildEvents(profile) {
  const events = profile.calendars.slice(0, 3).map((calendar, index) => ({
    id: `evt-${calendar.id}`,
    calendarId: calendar.id,
    subject: `Example ${calendar.label} event`,
    start: `2026-07-29T${String(9 + index).padStart(2, "0")}:00:00-04:00`,
    end: `2026-07-29T${String(10 + index).padStart(2, "0")}:00:00-04:00`,
    location: index === 0 ? "Teams" : "Remote",
    status: "confirmed"
  }));

  return { events };
}

function buildKeeperEnv(input, keeperUrl = "") {
  const trustedOrigins = keeperUrl || "http://localhost:3000";
  return [
    `BETTER_AUTH_SECRET=${input.betterAuthSecret || randomSecret()}`,
    `ENCRYPTION_KEY=${input.encryptionKey || randomSecret()}`,
    `TRUSTED_ORIGINS=${trustedOrigins}`,
    `GOOGLE_CLIENT_ID=${input.googleClientId || ""}`,
    `GOOGLE_CLIENT_SECRET=${input.googleClientSecret || ""}`,
    `MICROSOFT_CLIENT_ID=${input.microsoftClientId || ""}`,
    `MICROSOFT_CLIENT_SECRET=${input.microsoftClientSecret || ""}`
  ].join("\n") + "\n";
}

async function runCommand(command, args, options = {}) {
  return execFileAsync(command, {
    cwd: root,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20,
    ...options
  });
}

function bootstrapPayload() {
  const latestState = getLatestState();
  const operator = latestState.operatorEmail ? readJson(getOperatorPath(latestState.operatorEmail), null) : null;
  const config = latestState.profileName ? readJson(getConfigPath(latestState.profileName), null) : null;

  return {
    ok: true,
    port,
    product: "marvin",
    deployEnabled,
    hostedMode,
    keeperLink: config?.deployment?.keeperUrl || keeperLinkUrl,
    hasOperator: Boolean(operator),
    hasConfig: Boolean(config),
    operator: operator ? {
      displayName: operator.displayName,
      email: operator.email,
      createdAt: operator.createdAt
    } : null,
    config
  };
}

async function handleCreateAccount(payload) {
  requireFields(payload, ["marvinDisplayName", "marvinEmail", "marvinPassword"]);

  const operator = {
    accountId: sanitizeName(payload.marvinEmail),
    displayName: payload.marvinDisplayName.trim(),
    email: payload.marvinEmail.trim(),
    createdAt: new Date().toISOString(),
    password: hashPassword(payload.marvinPassword)
  };

  writeJson(getOperatorPath(operator.email), operator);
  const latest = getLatestState();
  latest.operatorEmail = operator.email;
  setLatestState(latest);

  return {
    operator: {
      displayName: operator.displayName,
      email: operator.email,
      createdAt: operator.createdAt
    },
    nextStep: "solution"
  };
}

async function handleSaveConfig(payload) {
  requireFields(payload, ["marvinEmail", "profileName", "timezone"]);

  const accounts = buildAccounts(payload);
  if (accounts.length === 0) {
    throw new Error("Add at least one calendar account before continuing.");
  }

  const profile = buildProfile({ ...payload, accounts });
  const events = buildEvents(profile);
  const profilePath = path.join(root, "profiles", `${profile.name}.json`);
  const eventsPath = path.join(root, "profiles", `${profile.name}.events.json`);
  const envPath = path.join(root, "solutions", "paranoid-keeper", ".env");
  const statePath = getConfigPath(profile.name);

  const config = {
    marvinOperator: payload.marvinEmail,
    profileName: profile.name,
    selectedSolution: payload.selectedSolution || "paranoid-keeper",
    updatedAt: new Date().toISOString(),
    accounts,
    preferences: payload.preferences || {
      mirrorMode: "busy",
      displayMode: "busy",
      visibility: "private",
      subjectPrefix: "BUSY: "
    },
    runtime: profile.runtime,
    deployment: payload.deployment || {
      subscriptionId: "",
      workloadName: "marvin",
      environment: "dev",
      regionShort: "wus3",
      location: "westus3",
      instance: "01",
      keeperUrl: "",
      marvinUrl: ""
    },
    providerCredentials: {
      microsoftClientId: payload.microsoftClientId || "",
      googleClientId: payload.googleClientId || ""
    }
  };

  writeJson(profilePath, profile);
  writeJson(eventsPath, events);
  writeText(envPath, buildKeeperEnv(payload, config.deployment.keeperUrl || ""));
  writeJson(statePath, config);

  const latest = getLatestState();
  latest.operatorEmail = payload.marvinEmail;
  latest.profileName = profile.name;
  latest.selectedSolution = config.selectedSolution;
  setLatestState(latest);

  await runCommand("node", [path.join("scripts", "build-calendar-options.mjs"), profilePath]);

  return {
    profilePath,
    eventsPath,
    envPath,
    statePath,
    config,
    nextStep: "console"
  };
}

async function handleDeploy(payload) {
  if (!deployEnabled) {
    throw new Error("Hosted Marvin runtime cannot redeploy itself. Use the local repo deployment flow.");
  }

  requireFields(payload, ["subscriptionId", "workloadName", "environment", "regionShort", "instance", "location"]);

  const args = [
    "-File",
    path.join("solutions", "paranoid-keeper", "deploy-azure-container-app.ps1"),
    "-SubscriptionId",
    payload.subscriptionId,
    "-WorkloadName",
    payload.workloadName,
    "-Environment",
    payload.environment,
    "-RegionShort",
    payload.regionShort,
    "-Instance",
    payload.instance,
    "-Location",
    payload.location
  ];

  if (payload.usePlaceholderProviderSecrets) {
    args.push("-UsePlaceholderProviderSecrets");
  }

  const { stdout, stderr } = await execFileAsync("pwsh", args, {
    cwd: root,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      AZURE_EXTENSION_DIR: "C:\\tmp\\azext"
    }
  });

  const marvinUrl = stdout.match(/URL:\s+(https:\/\/\S+)/i)?.[1] || "";
  const keeperUrl = stdout.match(/KEEPER_URL:\s+(https:\/\/\S+)/i)?.[1] || keeperLinkUrl;

  const latest = getLatestState();
  if (latest.profileName) {
    const configPath = getConfigPath(latest.profileName);
    const config = readJson(configPath, null);
    if (config) {
      config.deployment = {
        ...(config.deployment || {}),
        subscriptionId: payload.subscriptionId,
        workloadName: payload.workloadName,
        environment: payload.environment,
        regionShort: payload.regionShort,
        location: payload.location,
        instance: payload.instance,
        marvinUrl,
        keeperUrl
      };
      config.updatedAt = new Date().toISOString();
      writeJson(configPath, config);
    }
  }

  return {
    stdout,
    stderr,
    marvinUrl,
    keeperUrl,
    nextStep: "console"
  };
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const mimeMap = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/marvin-api/status" || url.pathname === "/api/status" || url.pathname === "/marvin-api/bootstrap")) {
      return sendJson(res, 200, bootstrapPayload());
    }

    if (req.method === "POST" && url.pathname === "/marvin-api/create-account") {
      return sendJson(res, 200, { ok: true, ...(await handleCreateAccount(await parseJson(req))) });
    }

    if (req.method === "POST" && url.pathname === "/marvin-api/save-config") {
      return sendJson(res, 200, { ok: true, ...(await handleSaveConfig(await parseJson(req))) });
    }

    if (req.method === "POST" && url.pathname === "/marvin-api/deploy") {
      return sendJson(res, 200, { ok: true, ...(await handleDeploy(await parseJson(req))) });
    }

    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const filePath = path.join(publicRoot, relativePath);

    if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath)) {
      return sendBuffer(res, 404, Buffer.from("Not found", "utf8"), "text/plain; charset=utf-8");
    }

    const ext = path.extname(filePath).toLowerCase();
    return sendBuffer(res, 200, fs.readFileSync(filePath), mimeMap[ext] || "application/octet-stream");
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Marvin onboarding UI listening on http://localhost:${port}`);
});
