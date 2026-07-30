import assert from "node:assert/strict";
import { buildMirrorPayload } from "../solutions/marvin-engine/src/core/policy.mjs";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../solutions/marvin-engine/src/adapters/google-calendar.mjs";
import { CalDavAdapter } from "../solutions/marvin-engine/src/adapters/caldav.mjs";

const source = { id: "source", label: "Source", sourcePrefix: "SOURCE: " };
const target = { id: "target", label: "Target", provider: "apple-caldav", email: "target@example.com", connectionStatus: "connected", caldavServerUrl: "https://cal.example/calendar", caldavUsername: "target@example.com" };
const event = { id: "holiday", subject: "Holiday", start: "2026-12-25", end: "2026-12-26", timezone: "America/New_York", allDay: true };
const payload = buildMirrorPayload({ privacyDefaults: {} }, {}, source, target, {}, event);

assert.equal(payload.allDay, true);
const graphPayload = new MicrosoftGraphAdapter().buildGraphPayload({ payload });
assert.equal(graphPayload.isAllDay, true);
assert.equal(graphPayload.start.dateTime, "2026-12-25T00:00:00");
assert.equal(graphPayload.end.dateTime, "2026-12-26T00:00:00");

const googlePayload = new GoogleCalendarAdapter().buildGooglePayload({ payload });
assert.deepEqual(googlePayload.start, { date: "2026-12-25" });
assert.deepEqual(googlePayload.end, { date: "2026-12-26" });

let writtenIcs = "";
const caldav = new CalDavAdapter({
  profile: { calendars: [target] },
  providerSecrets: { caldavPasswords: { target: "secret" } },
  fetchImpl: async (_url, options = {}) => {
    if (options.method === "REPORT") {
      return { ok: true, status: 207, text: async () => "<d:multistatus><d:response><d:href>/calendar/holiday.ics</d:href><c:calendar-data>BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:holiday\nDTSTART;VALUE=DATE:20261225\nDTEND;VALUE=DATE:20261226\nSUMMARY:Holiday\nEND:VEVENT\nEND:VCALENDAR</c:calendar-data></d:response></d:multistatus>" };
    }
    writtenIcs = String(options.body || "");
    return { ok: true, status: 201, text: async () => "" };
  }
});
const [caldavEvent] = await caldav.listSourceEvents(target);
assert.equal(caldavEvent.allDay, true);
await caldav.upsertEvent({ source, event: caldavEvent, target, payload });
assert.match(writtenIcs, /DTSTART;VALUE=DATE:20261225/);
assert.match(writtenIcs, /DTEND;VALUE=DATE:20261226/);

console.log(JSON.stringify({ ok: true, providers: ["microsoft", "google", "caldav"], allDayPreserved: true }, null, 2));