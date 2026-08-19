import assert from "node:assert/strict";
import { requestJson } from "../operator-ui/public/modules/api.js";
import {
  applyConfig,
  buildAccountDraft,
  buildConfigPayload,
  createInitialState,
  deriveCalendarState,
  getDashboardSummary,
  isTrustedTarget,
  PORTAL_VIEWS,
  withTrustedTarget
} from "../operator-ui/public/modules/model.js";
import { renderPortal } from "../operator-ui/public/modules/views.js";

const pendingMicrosoft = buildAccountDraft({
  provider: "m365",
  email: "operator@example.com"
});

assert.equal(pendingMicrosoft.id, "m365-operator-example.com");
assert.equal(pendingMicrosoft.scope, "work");
assert.equal(pendingMicrosoft.sourcePrefix, "OPERATOR: ");
assert.equal(deriveCalendarState(pendingMicrosoft).id, "authorizing");

const readyMicrosoft = {
  ...pendingMicrosoft,
  connectionStatus: "connected",
  tokenStatus: "usable",
  readinessState: "ready",
  providerCalendarId: "calendar-primary",
  capabilities: { ready: true, read: true, write: true, refresh: true, subscription: true }
};
assert.equal(deriveCalendarState(readyMicrosoft).id, "ready");

const expiredMicrosoft = { ...readyMicrosoft, tokenStatus: "expired", readinessState: "" };
assert.equal(deriveCalendarState(expiredMicrosoft).id, "expired");
const failedMicrosoft = { ...readyMicrosoft, connectionStatus: "invalid", tokenStatus: "error", readinessState: "invalid" };
assert.equal(deriveCalendarState(failedMicrosoft).id, "failed");
const recoveredMicrosoft = { ...failedMicrosoft, connectionStatus: "connected", tokenStatus: "usable", readinessState: "ready" };
assert.equal(deriveCalendarState(recoveredMicrosoft).id, "ready");

const trustedMicrosoft = withTrustedTarget(readyMicrosoft, true);
assert.equal(isTrustedTarget(trustedMicrosoft), true);
assert.deepEqual(trustedMicrosoft.inboundOverrides, {
  visibility: "default",
  detailMode: "full",
  copyLocation: true,
  copyDescription: true
});
assert.equal(isTrustedTarget(withTrustedTarget(trustedMicrosoft, false)), false);

let state = createInitialState();
state = applyConfig(state, {
  profileName: "marvin-operator-example.com",
  marvinOperator: "operator@example.com",
  marvinDisplayName: "Marvin",
  accounts: [readyMicrosoft],
  syncWindowDays: 30,
  preferences: { preserveOriginalTimezone: false }
});

const summary = getDashboardSummary(state);
assert.deepEqual(
  { total: summary.total, ready: summary.ready, actionRequired: summary.actionRequired },
  { total: 1, ready: 1, actionRequired: 0 }
);

const apple = buildAccountDraft({
  provider: "apple-caldav",
  email: "apple@example.com",
  caldavPassword: "app-password"
});
state.accounts.push(apple);
const payload = buildConfigPayload(state, {
  origin: "https://calendar.example.com",
  timezone: "America/Chicago"
});

assert.equal(payload.preferences.defaultVisibility, "private");
assert.equal(payload.preferences.preserveOriginalTimezone, false);
assert.equal(payload.providerSecrets.caldavPasswords[apple.id], "app-password");
assert.equal(payload.deployment.marvinUrl, "https://calendar.example.com");
assert.deepEqual(
  PORTAL_VIEWS.map((view) => view.id),
  ["dashboard", "calendars", "rules", "review", "activity", "diagnostics", "settings"]
);

const selectionRequiredMicrosoft = {
  ...pendingMicrosoft,
  connectionStatus: "selection-required",
  tokenStatus: "usable",
  discoveredCalendars: [
    { providerCalendarId: "primary", name: "Calendar", canEdit: true, ownerAddress: "operator@example.com" },
    { providerCalendarId: "holidays", name: "Holidays", canEdit: false, ownerAddress: "operator@example.com" }
  ]
};
const selectionState = {
  ...createInitialState(),
  signedIn: true,
  activeView: "calendars",
  operator: { email: "operator@example.com", displayName: "Operator" },
  accounts: [selectionRequiredMicrosoft]
};
const selectionHtml = renderPortal(selectionState);
assert.match(selectionHtml, /Found 2 calendars; 1 can be synchronized/i);
assert.match(selectionHtml, /value="primary"[^>]*checked/i);
assert.match(selectionHtml, /value="holidays"[^>]*disabled/i);
assert.match(selectionHtml, /Save calendar selection/i);
assert.match(selectionHtml, /will not delete existing calendar items/i);
const dashboardHtml = renderPortal({ ...selectionState, activeView: "dashboard" });
assert.match(dashboardHtml, /data-focus-calendar="m365-operator-example\.com"/i);
assert.match(dashboardHtml, /Continue setup/i);
const familyCalendar = { ...apple, id: "apple-family", label: "Turner Family", calendarRole: "shared-family", sourcePrefix: "FAMILY: " };
const privatePolicyHtml = renderPortal({ ...selectionState, activeView: "rules", accounts: [readyMicrosoft, familyCalendar] });
assert.match(privatePolicyHtml, /Private and Busy are different settings/i);
assert.match(privatePolicyHtml, /Full details/i);
assert.match(privatePolicyHtml, /Always free/i);
assert.match(privatePolicyHtml, /Professional events copied to a shared family calendar default to Busy-only details/i);
assert.match(privatePolicyHtml, /data-action="destination-policy-save"/i);

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({
  ok: false,
  error: "Provider access expired.",
  requiresLogin: true
}), {
  status: 401,
  headers: { "Content-Type": "application/json" }
});
try {
  await assert.rejects(
    requestJson("/marvin-api/config"),
    (error) => error.message === "Provider access expired."
      && error.statusCode === 401
      && error.payload.requiresLogin === true
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log(JSON.stringify({
  ok: true,
  checked: [
    "Calendar lifecycle states",
    "Private and trusted destination policy",
    "Provider account drafts",
    "Dashboard summary",
    "Configuration payload",
    "Portal navigation model",
    "Calendar selection guidance and dashboard continuation",
    "Structured API errors"
  ]
}, null, 2));
