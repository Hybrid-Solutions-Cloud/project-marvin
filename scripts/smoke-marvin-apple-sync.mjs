import assert from "node:assert/strict";
import http from "node:http";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";
import { calculatePollDelaySeconds } from "../solutions/marvin-engine/src/daemon.mjs";

const username = "apple@example.com";
const password = "app-specific-password";
const expectedAuth = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
const requests = [];
let reportCount = 0;

function davResponse(body) {
  return `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">${body}</d:multistatus>`;
}

function calendarResource({ href, etag, ics }) {
  return `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:getetag>${etag}</d:getetag><c:calendar-data><![CDATA[${ics}]]></c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
}

const recurringIcsV1 = `BEGIN:VCALENDAR\r
VERSION:2.0\r
X-WR-TIMEZONE:America/New_York\r
BEGIN:VEVENT\r
UID:recurring-one\r
RECURRENCE-ID;TZID=America/New_York:20261101T013000\r
SUMMARY:First\\, occurrence\r
DTSTART;TZID=America/New_York:20261101T013000\r
DTEND;TZID=America/New_York:20261101T023000\r
DESCRIPTION:Line one\\nLine two\r
LOCATION:Room\\; 1\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:recurring-one\r
RECURRENCE-ID;TZID=America/New_York:20261108T013000\r
SUMMARY:Second occurrence\r
DTSTART;TZID=America/New_York:20261108T013000\r
DTEND;TZID=America/New_York:20261108T023000\r
END:VEVENT\r
END:VCALENDAR`;

const recurringIcsV2 = recurringIcsV1
  .replace("SUMMARY:First\\, occurrence", "SUMMARY:Updated\\, occurrence")
  .replace(/BEGIN:VEVENT\r\nUID:recurring-one\r\nRECURRENCE-ID;TZID=America\/New_York:20261108T013000[\s\S]*?END:VEVENT\r\n/, "");

const allDayIcs = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:all-day-one\r
SUMMARY:All day\r
DTSTART;VALUE=DATE:20261102\r
DTEND;VALUE=DATE:20261103\r
END:VEVENT\r
END:VCALENDAR`;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: req.method || "", url: req.url || "", auth: req.headers.authorization || "", depth: req.headers.depth || "", ifMatch: req.headers["if-match"] || "", ifNoneMatch: req.headers["if-none-match"] || "", body });
    if (req.headers.authorization !== expectedAuth) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    if (req.url === "/entry" && req.method === "PROPFIND") {
      res.writeHead(301, { Location: "/dav/" }).end();
      return;
    }
    if ((req.url === "/dav/" || req.url === "/cal/home/") && req.method === "PROPFIND" && req.headers.depth === "0") {
      res.writeHead(207, { "Content-Type": "application/xml" });
      res.end(davResponse("<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>"));
      return;
    }
    if (req.url === "/principal/" && req.method === "PROPFIND") {
      res.writeHead(207, { "Content-Type": "application/xml" });
      res.end(davResponse("<d:response><d:href>/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/home/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response>"));
      return;
    }
    if (req.url === "/home/" && req.method === "PROPFIND") {
      res.writeHead(207, { "Content-Type": "application/xml" });
      res.end(davResponse(`
        <d:response><d:href>/home/</d:href><d:propstat><d:prop><d:displayname>Home</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
        <d:response><d:href>/cal/home/</d:href><d:propstat><d:prop><d:displayname>Family &amp; Home</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set><a:calendar-color>#00AAFFFF</a:calendar-color><d:sync-token>https://sync.example/1</d:sync-token></d:prop></d:propstat></d:response>
        <d:response><d:href>/cal/read-only/</d:href><d:propstat><d:prop><d:displayname>Birthdays</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set></d:prop></d:propstat></d:response>`));
      return;
    }
    if (req.url === "/cal/home/" && req.method === "REPORT") {
      reportCount += 1;
      const recurring = reportCount >= 3 ? recurringIcsV2 : recurringIcsV1;
      const resources = calendarResource({ href: "/cal/home/recurring.ics", etag: reportCount >= 3 ? '"r2"' : '"r1"', ics: recurring })
        + (reportCount >= 3 ? "" : calendarResource({ href: "/cal/home/all-day.ics", etag: '"a1"', ics: allDayIcs }));
      res.writeHead(207, { "Content-Type": "application/xml" }).end(davResponse(resources));
      return;
    }
    if (req.url?.startsWith("/cal/home/") && req.method === "PUT") {
      res.writeHead(201, { ETag: '"created-1"' }).end();
      return;
    }
    res.writeHead(404).end("not found");
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const entryUrl = `http://127.0.0.1:${port}/entry`;
const selectedUrl = `http://127.0.0.1:${port}/cal/home/`;
const calendar = { id: "apple-home", label: "Apple Home", provider: "apple-caldav", email: username, caldavServerUrl: entryUrl, caldavUsername: username };
const adapter = new CalDavAdapter({
  profile: { calendars: [calendar], runtime: { providerConnections: { caldav: {} } } },
  providerSecrets: { caldavPasswords: { "apple-home": password } },
  fetchImpl: fetch
});

try {
  const discovery = await adapter.discoverCalendars(calendar);
  assert.equal(discovery.principalUrl, `http://127.0.0.1:${port}/principal/`);
  assert.equal(discovery.calendarHomeUrl, `http://127.0.0.1:${port}/home/`);
  assert.equal(discovery.calendars.length, 2);
  assert.equal(discovery.calendars[0].name, "Family & Home");
  assert.equal(discovery.calendars[0].canEdit, true);
  assert.equal(discovery.calendars[1].canEdit, false);

  const selectedCalendar = { ...calendar, providerCalendarId: selectedUrl, caldavServerUrl: selectedUrl };
  const selectedAdapter = new CalDavAdapter({
    profile: { calendars: [selectedCalendar], runtime: { providerConnections: { caldav: {} } } },
    providerSecrets: { caldavPasswords: { "apple-home": password } },
    fetchImpl: fetch
  });
  const capabilities = await selectedAdapter.assessCalendarCapabilities(selectedCalendar);
  assert.equal(capabilities.ready, true, JSON.stringify(capabilities));

  const window = { windowStart: new Date("2026-10-31T00:00:00Z"), windowEnd: new Date("2026-11-10T00:00:00Z") };
  const first = await selectedAdapter.listSourceEventChanges(selectedCalendar, window);
  assert.equal(first.events.length, 3);
  assert.equal(first.events.find((event) => event.id === "all-day-one")?.allDay, true);
  assert.equal(first.events.find((event) => event.id.includes("20261101"))?.subject, "First, occurrence");
  assert.equal(first.events.find((event) => event.id.includes("20261101"))?.description, "Line one\nLine two");
  assert.equal(first.events.find((event) => event.id.includes("20261101"))?.location, "Room; 1");

  const second = await selectedAdapter.listSourceEventChanges(selectedCalendar, { ...window, deltaLink: first.deltaLink });
  assert.equal(second.events.length, 0);
  assert.deepEqual(second.deletedEventIds, []);

  const third = await selectedAdapter.listSourceEventChanges(selectedCalendar, { ...window, deltaLink: second.deltaLink });
  assert.equal(third.events.length, 1);
  assert.equal(third.events[0].subject, "Updated, occurrence");
  assert.equal(third.deletedEventIds.length, 2);
  assert.ok(third.deletedEventIds.includes("all-day-one"));
  assert.ok(third.deletedEventIds.some((id) => id.includes("20261108")));

  const operation = {
    source: { id: "work", label: "Work" },
    event: { id: "event-1", subject: "Planning" },
    target: selectedCalendar,
    payload: { subject: "WORK: Planning", description: "Line one\nLine two", location: "Room; 1", start: "2026-11-01T05:30:00Z", end: "2026-11-01T07:30:00Z", visibility: "private", sourceEventTimezone: "America/New_York", marvinMirror: { sourceCalendarId: "work", sourceCalendarLabel: "Work", sourceEventId: "event-1", targetCalendarId: "apple-home" } }
  };
  const created = await selectedAdapter.upsertEvent(operation, {});
  assert.equal(created.targetEtag, '"created-1"');
  await selectedAdapter.upsertEvent(operation, { existingMapping: { targetEventId: created.targetEventId, targetEtag: created.targetEtag } });
  const puts = requests.filter((request) => request.method === "PUT");
  assert.equal(puts[0].ifNoneMatch, "*");
  assert.equal(puts[1].ifMatch, '"created-1"');
  assert.equal(requests.filter((request) => request.method === "DELETE").length, 0);
  assert.equal(calculatePollDelaySeconds(300, 0), 300);
  assert.equal(calculatePollDelaySeconds(300, 1), 600);
  assert.equal(calculatePollDelaySeconds(300, 4), 3600);
  assert.equal(calculatePollDelaySeconds(300, 0), 300);

  console.log(JSON.stringify({
    ok: true,
    discovered: discovery.calendars.length,
    writable: discovery.calendars.filter((item) => item.canEdit).length,
    initialEvents: first.events.length,
    unchangedEvents: second.events.length,
    changedEvents: third.events.length,
    tombstones: third.deletedEventIds.length,
    conditionalWrites: puts.length,
    pollingBackoffSeconds: [calculatePollDelaySeconds(300, 0), calculatePollDelaySeconds(300, 1), calculatePollDelaySeconds(300, 4), calculatePollDelaySeconds(300, 0)],
    deleteRequests: 0
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
