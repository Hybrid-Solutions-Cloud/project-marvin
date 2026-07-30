import assert from "node:assert/strict";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";

const calendar = {
  id: "apple",
  label: "Apple",
  provider: "apple-caldav",
  email: "apple@example.com",
  connectionStatus: "connected",
  caldavServerUrl: "https://cal.example/calendar",
  caldavUsername: "apple@example.com"
};
const sourceIcs = String.raw`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:escaped-details
SUMMARY:Plan\, Review\; Follow-up
DTSTART:20261201T140000Z
DTEND:20261201T150000Z
DESCRIPTION:First line\nSecond line\, item\; done
LOCATION:Room\, 12
END:VEVENT
END:VCALENDAR`;
let writtenIcs = "";
const adapter = new CalDavAdapter({
  profile: { calendars: [calendar] },
  providerSecrets: { caldavPasswords: { apple: "secret" } },
  fetchImpl: async (_url, options = {}) => {
    if (options.method === "REPORT") {
      return { ok: true, status: 207, text: async () => `<d:multistatus><d:response><d:href>/calendar/escaped-details.ics</d:href><c:calendar-data>${sourceIcs}</c:calendar-data></d:response></d:multistatus>` };
    }
    writtenIcs = String(options.body || "");
    return { ok: true, status: 201, text: async () => "" };
  }
});

const [event] = await adapter.listSourceEvents(calendar, { windowStart: "2026-12-01T00:00:00.000Z", windowEnd: "2026-12-02T00:00:00.000Z" });
assert.equal(event.subject, "Plan, Review; Follow-up");
assert.equal(event.description, "First line\nSecond line, item; done");
assert.equal(event.location, "Room, 12");

await adapter.upsertEvent({
  source: { id: "source", label: "Source" },
  event,
  target: calendar,
  payload: {
    subject: `SOURCE: ${event.subject}`,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    sourceEventTimezone: "UTC",
    visibility: "private",
    marvinMirror: { sourceCalendarId: "source", sourceEventId: event.id, targetCalendarId: calendar.id }
  }
});
assert.match(writtenIcs, /SUMMARY:SOURCE: Plan\\, Review\\; Follow-up/);
assert.match(writtenIcs, /DESCRIPTION:First line\\nSecond line\\, item\\; done/);
assert.match(writtenIcs, /LOCATION:Room\\, 12/);
console.log(JSON.stringify({ ok: true, multilineDetailsPreserved: true }, null, 2));