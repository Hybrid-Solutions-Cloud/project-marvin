import http from "node:http";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";

function toBasicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function startStubServer() {
  const requests = [];
  const puts = [];
  const calendarQueryXml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/calendars/apple/source-one.ics</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:source-one
SUMMARY:Work Planning
DTSTART:20260729T130000Z
DTEND:20260729T140000Z
DESCRIPTION:Customer sync
LOCATION:Teams
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ method: req.method || "", url: req.url || "", auth: req.headers.authorization || "", body });
      if ((req.method || "") === "REPORT") {
        res.writeHead(207, { "Content-Type": "application/xml; charset=utf-8" });
        res.end(calendarQueryXml);
        return;
      }
      if ((req.method || "") === "PUT") {
        puts.push({ url: req.url || "", body, auth: req.headers.authorization || "" });
        res.writeHead(201, { "Content-Type": "text/plain" });
        res.end("created");
        return;
      }
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("method not allowed");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        requests,
        puts,
        baseUrl: `http://127.0.0.1:${address.port}/calendars/apple`
      });
    });
  });
}

const stub = await startStubServer();
const adapter = new CalDavAdapter({
  profile: {
    calendars: [
      {
        id: "apple-home",
        label: "Apple Home",
        provider: "apple-caldav",
        email: "apple@example.com",
        caldavServerUrl: stub.baseUrl,
        caldavUsername: "apple@example.com"
      }
    ],
    runtime: { providerConnections: { caldav: {} } }
  },
  providerSecrets: {
    caldavPasswords: {
      "apple-home": "secret-pass"
    }
  },
  fetchImpl: fetch
});

try {
  const calendar = {
    id: "apple-home",
    label: "Apple Home",
    provider: "apple-caldav",
    email: "apple@example.com",
    caldavServerUrl: stub.baseUrl,
    caldavUsername: "apple@example.com"
  };
  const events = await adapter.listSourceEvents(calendar, {
    windowStart: new Date("2026-07-28T00:00:00Z"),
    windowEnd: new Date("2026-07-30T00:00:00Z"),
    timezone: "UTC"
  });
  if (events.length !== 1 || events[0].id !== "source-one") {
    throw new Error(`Unexpected REPORT result: ${JSON.stringify(events)}`);
  }

  const writeResult = await adapter.upsertEvent({
    source: { id: "work", label: "Work" },
    event: { id: "evt-123", subject: "Planning" },
    target: calendar,
    payload: {
      subject: "WORK: Planning",
      description: "Customer sync",
      location: "Teams",
      start: "2026-07-29T13:00:00Z",
      end: "2026-07-29T14:00:00Z",
      visibility: "private",
      sourceEventTimezone: "UTC",
      marvinMirror: {
        sourceCalendarId: "work",
        sourceCalendarLabel: "Work",
        sourceEventId: "evt-123",
        targetCalendarId: "apple-home"
      }
    }
  }, {});
  if (!writeResult.targetEventId.endsWith('.ics')) {
    throw new Error(`Unexpected PUT result: ${JSON.stringify(writeResult)}`);
  }
  if (stub.puts.length !== 1 || !stub.puts[0].body.includes('X-PROJECT-MARVIN-MANAGED:TRUE')) {
    throw new Error(`Unexpected PUT payload: ${JSON.stringify(stub.puts)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    reportAuth: stub.requests[0]?.auth || '',
    putAuth: stub.puts[0]?.auth || '',
    loadedEvents: events.length,
    writeResult
  }, null, 2));
} finally {
  await new Promise((resolve) => stub.server.close(resolve));
}
