import assert from "node:assert/strict";
import { MicrosoftGraphAdapter } from "../solutions/marvin-engine/src/adapters/microsoft-graph.mjs";

const profile = {
  name: "marvin-microsoft-timezone-smoke",
  timezone: "America/New_York",
  syncWindowDays: 7,
  calendars: [
    {
      id: "work",
      label: "Work",
      provider: "m365",
      email: "work@example.com",
      scope: "work",
      sourcePrefix: "WORK: ",
      connectionStatus: "connected"
    }
  ]
};

const tokenState = {
  records: [
    {
      calendarId: "work",
      provider: "m365",
      email: "work@example.com",
      accessToken: "ms-token",
      tokenType: "Bearer",
      expiresAt: "2099-01-01T00:00:00.000Z",
      status: "connected"
    }
  ]
};

const requests = [];
const fetchImpl = async (url, options = {}) => {
  requests.push({ url, method: options.method || "GET" });
  if (String(url).includes("graph.microsoft.com") && (!options.method || options.method === "GET")) {
    return {
      ok: true,
      json: async () => ({
        value: [
          {
            id: "ms-eastern-event",
            subject: "Travel planning",
            start: { dateTime: "2026-07-29T09:30:00", timeZone: "Eastern Standard Time" },
            end: { dateTime: "2026-07-29T10:15:00", timeZone: "Eastern Standard Time" },
            originalStartTimeZone: "Eastern Standard Time",
            originalEndTimeZone: "Eastern Standard Time",
            location: { displayName: "Conference Room A" },
            bodyPreview: "Discuss arrival plans",
            showAs: "busy"
          }
        ]
      })
    };
  }
  throw new Error("Unexpected request: " + (options.method || "GET") + " " + url);
};

const adapter = new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets: {}, fetchImpl });
const [event] = await adapter.listSourceEvents(profile.calendars[0], {
  timezone: "America/New_York",
  windowStart: "2026-07-29T00:00:00.000Z",
  windowEnd: "2026-07-30T00:00:00.000Z"
});

assert.ok(event, "Expected a Microsoft event.");
assert.equal(event.timezone, "Eastern Standard Time");
assert.equal(event.start, "2026-07-29T13:30:00.000Z");
assert.equal(event.end, "2026-07-29T14:15:00.000Z");
assert.equal(event.location, "Conference Room A");
assert.equal(event.description, "Discuss arrival plans");
assert.ok(requests.some((item) => item.url.includes("graph.microsoft.com") && item.method === "GET"));

console.log(JSON.stringify({
  ok: true,
  timezone: event.timezone,
  start: event.start,
  end: event.end
}, null, 2));
