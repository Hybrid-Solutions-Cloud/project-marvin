import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const profileName = "marvin-caldav-multi-smoke";
const profileSlug = profileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
const marvinPort = 4187;
process.env.MARVIN_UI_PORT = String(marvinPort);

const { startMarvinOnboardServer } = await import("./marvin-onboard-server.mjs");

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function cleanup() {
  const files = [
    path.join(root, "profiles", `${profileSlug}.json`),
    path.join(root, "profiles", `${profileSlug}.events.json`),
    path.join(root, ".marvin", `${profileSlug}.setup.json`),
    path.join(root, ".marvin", "provider-secrets", `${profileSlug}.secrets.json`),
    path.join(root, ".marvin", "connections", `${profileSlug}.connections.json`),
    path.join(root, ".marvin", "tokens", `${profileSlug}.tokens.json`),
    path.join(root, ".marvin", "runtime", `${profileSlug}.runtime.json`),
    path.join(root, ".marvin", "operators", "marvin-caldav-smoke-example.com.account.json"),
    path.join(root, "artifacts", "solutions", profileSlug)
  ];
  for (const targetPath of files) {
    removeIfExists(targetPath);
  }
}

function startCalDavStub() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || "";
    requests.push({ method: req.method || "", auth });
    if (auth === `Basic ${Buffer.from("apple-two@example.com:apple-two-secret", "utf8").toString("base64")}`) {
      res.writeHead(207, { "Content-Type": "application/xml" });
      res.end("<multistatus xmlns=\"DAV:\"></multistatus>");
      return;
    }
    if (auth === `Basic ${Buffer.from("apple-one@example.com:wrong-secret", "utf8").toString("base64")}`) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("unauthorized");
      return;
    }
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("unexpected");
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        requests,
        serverUrl: `http://127.0.0.1:${address.port}/dav`
      });
    });
  });
}

let sessionCookie = "";

async function postJson(url, body) {
  const headers = { "Content-Type": "application/json" };
  if (sessionCookie) headers.Cookie = sessionCookie;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    sessionCookie = setCookie.split(";")[0];
  }
  return response.json();
}

cleanup();
const caldav = await startCalDavStub();
const marvinServer = startMarvinOnboardServer();

try {
  await new Promise((resolve) => setTimeout(resolve, 250));

  const accountResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/create-account`, {
    marvinDisplayName: "Marvin Smoke",
    marvinEmail: "marvin-caldav-smoke@example.com",
    marvinPassword: "test-password"
  });
  if (!accountResult.ok) {
    throw new Error(`create-account failed: ${JSON.stringify(accountResult)}`);
  }

  const saveResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/save-config`, {
    marvinEmail: "marvin-caldav-smoke@example.com",
    marvinAccount: { email: "marvin-caldav-smoke@example.com", displayName: "Marvin Smoke", timezone: "America/New_York" },
    profileName,
    timezone: "America/New_York",
    syncWindowDays: 30,
    accounts: [
      { id: "work-m365", label: "Work", provider: "m365", email: "work@example.com", scope: "work", sourcePrefix: "WORK: " },
      { id: "apple-one", label: "Apple One", provider: "apple-caldav", email: "apple-one@example.com", scope: "personal", sourcePrefix: "A1: ", caldavServerUrl: caldav.serverUrl, caldavUsername: "apple-one@example.com" },
      { id: "apple-two", label: "Apple Two", provider: "apple-caldav", email: "apple-two@example.com", scope: "family", sourcePrefix: "A2: ", caldavServerUrl: caldav.serverUrl, caldavUsername: "apple-two@example.com" }
    ],
    preferences: {
      defaultDetailMode: "subject",
      defaultVisibility: "private",
      familyDetailMode: "full",
      familyVisibility: "default",
      subjectPrefix: "SRC: ",
      copyLocationToFamily: true,
      copyDescriptionToFamily: true,
      preserveOriginalTimezone: true
    },
    deployment: { workloadName: "marvin", environment: "dev", regionShort: "wus3", location: "westus3", instance: "01", marvinUrl: `http://127.0.0.1:${marvinPort}` },
    providerCredentials: { microsoftClientId: "", googleClientId: "" },
    providerSecrets: {
      caldavPasswords: {
        "apple-one": "wrong-secret",
        "apple-two": "apple-two-secret"
      }
    }
  });
  if (!saveResult.ok) {
    throw new Error(`save-config failed: ${JSON.stringify(saveResult)}`);
  }

  const savedAppleOne = saveResult.config.accounts.find((account) => account.id === "apple-one");
  const savedAppleTwo = saveResult.config.accounts.find((account) => account.id === "apple-two");
  if (!savedAppleOne?.caldavPasswordConfigured || !savedAppleTwo?.caldavPasswordConfigured) {
    throw new Error("Expected both Apple accounts to report stored per-account app passwords.");
  }

  const invalidResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/connection-begin`, {
    profileName,
    calendarId: "apple-one"
  });
  if (!invalidResult.ok || invalidResult.connectionRecord?.status !== "invalid") {
    throw new Error(`Expected apple-one validation failure, got ${JSON.stringify(invalidResult)}`);
  }

  const connectedResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/connection-begin`, {
    profileName,
    calendarId: "apple-two"
  });
  if (!connectedResult.ok || connectedResult.connectionRecord?.status !== "connected") {
    throw new Error(`Expected apple-two validation success, got ${JSON.stringify(connectedResult)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    appleOneStatus: invalidResult.connectionRecord.status,
    appleTwoStatus: connectedResult.connectionRecord.status,
    requests: caldav.requests
  }, null, 2));
} finally {
  await new Promise((resolve) => marvinServer.close(resolve));
  await new Promise((resolve) => caldav.server.close(resolve));
  cleanup();
}
