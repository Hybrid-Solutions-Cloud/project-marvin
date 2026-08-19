import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const profileName = "marvin-caldav-multi-smoke";
const profileSlug = profileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
const marvinPort = 4187;
process.env.MARVIN_UI_PORT = String(marvinPort);
process.env.MARVIN_DEV_AUTH_ENABLED = "true";
process.env.MARVIN_DEV_AUTH_EMAIL = "marvin-caldav-smoke@example.com";
process.env.MARVIN_DEV_AUTH_DISPLAY_NAME = "Marvin Smoke";

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
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const auth = req.headers.authorization || "";
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ method: req.method || "", url: req.url || "", auth, body });
      const valid = auth === `Basic ${Buffer.from("apple-two@example.com:apple-two-secret", "utf8").toString("base64")}`;
      if (!valid) {
        res.writeHead(auth.includes(Buffer.from("apple-one@example.com:wrong-secret", "utf8").toString("base64")) ? 401 : 403, { "Content-Type": "text/plain" });
        res.end("unauthorized");
        return;
      }
      res.writeHead(207, { "Content-Type": "application/xml" });
      if (body.includes("current-user-principal")) {
        res.end('<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>');
      } else if (body.includes("calendar-home-set")) {
        res.end('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-home-set><d:href>/home/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>');
      } else if (body.includes("supported-calendar-component-set")) {
        res.end('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:response><d:href>/cal/family/</d:href><d:propstat><d:prop><d:displayname>Family</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set><a:calendar-color>#00AAFFFF</a:calendar-color></d:prop></d:propstat></d:response></d:multistatus>');
      } else {
        res.end('<d:multistatus xmlns:d="DAV:"></d:multistatus>');
      }
    });
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

  const accountResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/auth/dev`, {});
  if (!accountResult.ok) {
    throw new Error(`development sign-in failed: ${JSON.stringify(accountResult)}`);
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
  if (!connectedResult.ok || connectedResult.connectionRecord?.status !== "discovery-required") {
    throw new Error(`Expected apple-two validation success, got ${JSON.stringify(connectedResult)}`);
  }

  const discoveryResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/apple/discover`, {
    profileName,
    calendarId: "apple-two"
  });
  if (!discoveryResult.ok || discoveryResult.calendars?.length !== 1 || discoveryResult.config.accounts.find((account) => account.id === "apple-two")?.connectionStatus !== "selection-required") {
    throw new Error(`Expected Apple calendar discovery, got ${JSON.stringify(discoveryResult)}`);
  }

  const selectionResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/apple/select-calendars`, {
    profileName,
    calendarId: "apple-two",
    providerCalendarIds: [discoveryResult.calendars[0].providerCalendarId]
  });
  if (!selectionResult.ok || selectionResult.selectedCalendars?.length !== 1) {
    throw new Error(`Expected Apple calendar selection, got ${JSON.stringify(selectionResult)}`);
  }

  const capabilitiesResult = await postJson(`http://127.0.0.1:${marvinPort}/marvin-api/apple/capabilities`, {
    profileName,
    calendarId: "apple-two"
  });
  if (!capabilitiesResult.ok || !capabilitiesResult.capabilities?.ready) {
    throw new Error(`Expected Apple capabilities to be ready, got ${JSON.stringify(capabilitiesResult)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    appleOneStatus: invalidResult.connectionRecord.status,
    appleTwoStatus: capabilitiesResult.config.accounts.find((account) => account.id === "apple-two")?.connectionStatus,
    discoveredCalendars: discoveryResult.calendars.length,
    requests: caldav.requests
  }, null, 2));
} finally {
  await new Promise((resolve) => marvinServer.close(resolve));
  await new Promise((resolve) => caldav.server.close(resolve));
  cleanup();
}
