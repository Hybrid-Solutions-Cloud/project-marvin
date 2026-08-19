import { requestJson } from "./modules/api.js";
import {
  applyConfig,
  buildAccountDraft,
  buildConfigPayload,
  createInitialState,
  isTrustedTarget,
  profileNameFor,
  withTrustedTarget
} from "./modules/model.js";
import { renderAuth, renderPortal } from "./modules/views.js";

const root = document.getElementById("app");
const RETURN_VIEW_KEY = "project-marvin:return-view";
const VALID_RETURN_VIEWS = new Set(["dashboard", "calendars", "rules", "review", "activity", "diagnostics", "settings"]);

function restoreReturnView() {
  const requested = window.sessionStorage.getItem(RETURN_VIEW_KEY) || "";
  window.sessionStorage.removeItem(RETURN_VIEW_KEY);
  return VALID_RETURN_VIEWS.has(requested) ? requested : "dashboard";
}

let state = { ...createInitialState(), activeView: restoreReturnView() };

function setStatus(message, tone = "ok") {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = message;
  status.className = `toast ${tone}`;
  status.hidden = false;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    status.hidden = true;
  }, 7000);
}

function payloadFor(accounts = state.accounts) {
  return buildConfigPayload({ ...state, accounts }, {
    origin: window.location.origin,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
  });
}

function render() {
  root.innerHTML = state.signedIn ? renderPortal(state) : renderAuth(state);
  bindEvents();
}

function focusCalendarCard(calendarId) {
  if (!calendarId) return;
  window.requestAnimationFrame(() => {
    const card = [...document.querySelectorAll("[data-calendar-id]")]
      .find((item) => item.dataset.calendarId === calendarId);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.querySelector("input:not(:disabled), button")?.focus({ preventScroll: true });
  });
}

function showCalendarSetup(calendarId) {
  state = { ...state, activeView: "calendars" };
  render();
  focusCalendarCard(calendarId);
}

function bindEvents() {
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => {
      state = { ...state, activeView: button.dataset.viewTarget || "dashboard" };
      render();
      focusCalendarCard(button.dataset.focusCalendar);
    });
  });

  document.querySelectorAll("[data-action=refresh]").forEach((button) => {
    button.addEventListener("click", () => void reload(false));
  });
  document.querySelectorAll("[data-action=signout]").forEach((button) => {
    button.addEventListener("click", () => void signOut());
  });
  document.querySelectorAll("[data-action=authorize]").forEach((button) => {
    button.addEventListener("click", () => void beginAuthorization(button.dataset.id));
  });
  document.querySelectorAll("[data-action=microsoft-discover]").forEach((button) => {
    button.addEventListener("click", () => void discoverMicrosoftCalendars(button.dataset.id));
  });
  document.querySelectorAll("[data-action=microsoft-confirm]").forEach((button) => {
    button.addEventListener("click", () => void confirmMicrosoftIdentity(button.dataset.id));
  });
  document.querySelectorAll("[data-action=microsoft-select]").forEach((button) => {
    button.addEventListener("click", () => void selectMicrosoftCalendars(button.dataset.id));
  });
  document.querySelectorAll("[data-action=microsoft-capabilities]").forEach((button) => {
    button.addEventListener("click", () => void checkMicrosoftCapabilities(button.dataset.id));
  });
  document.querySelectorAll("[data-action=apple-discover]").forEach((button) => {
    button.addEventListener("click", () => void discoverAppleCalendars(button.dataset.id));
  });
  document.querySelectorAll("[data-action=apple-select]").forEach((button) => {
    button.addEventListener("click", () => void selectAppleCalendars(button.dataset.id));
  });
  document.querySelectorAll("[data-action=apple-capabilities]").forEach((button) => {
    button.addEventListener("click", () => void checkAppleCapabilities(button.dataset.id));
  });
  document.querySelectorAll("[data-action=sharing]").forEach((button) => {
    button.addEventListener("click", () => void toggleSharing(button.dataset.id));
  });
  document.querySelectorAll("[data-action=calendar-settings-save]").forEach((button) => {
    button.addEventListener("click", () => void saveCalendarSettings(button.dataset.id));
  });
  document.querySelectorAll("[data-action=destination-policy-save]").forEach((button) => {
    button.addEventListener("click", () => void saveDestinationPolicy(button.dataset.source, button.dataset.target));
  });
  document.querySelectorAll("[data-action=calendar-review-scan]").forEach((button) => {
    button.addEventListener("click", () => void scanCalendarReview());
  });
  document.querySelectorAll("[data-action=duplicate-decision]").forEach((button) => {
    button.addEventListener("click", () => void saveDuplicateDecision(button.dataset.candidate, button.dataset.decision));
  });
  document.querySelectorAll("[data-action=event-override-save]").forEach((button) => {
    button.addEventListener("click", () => void saveEventOverride(button.dataset.event));
  });
  document.querySelectorAll("[data-action=remove]").forEach((button) => {
    button.addEventListener("click", () => void removeCalendar(button.dataset.id));
  });
  document.querySelectorAll("[data-action=runtime-start]").forEach((button) => {
    button.addEventListener("click", () => void setRuntimeRunning(true));
  });
  document.querySelectorAll("[data-action=runtime-stop]").forEach((button) => {
    button.addEventListener("click", () => void setRuntimeRunning(false));
  });
  document.querySelectorAll("[data-action=runtime-retry]").forEach((button) => {
    button.addEventListener("click", () => void retryRuntime());
  });
  document.querySelectorAll("[data-activity-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      state = { ...state, activityFilters: { ...state.activityFilters, [select.dataset.activityFilter]: select.value } };
      render();
    });
  });

  const entraSignIn = document.getElementById("entraSignIn");
  if (entraSignIn && state.entraConfigured) {
    entraSignIn.addEventListener("click", () => window.location.assign("/marvin-api/auth/entra/start"));
  }
  const devSignIn = document.getElementById("devSignIn");
  if (devSignIn && state.devAuthEnabled) {
    devSignIn.addEventListener("click", () => void signInForDevelopment());
  }

  const provider = document.getElementById("calendarProvider");
  if (provider) {
    provider.addEventListener("change", renderProviderFields);
    renderProviderFields();
  }
  const add = document.getElementById("addCalendar");
  if (add) add.addEventListener("click", () => void addCalendar());
}

function renderProviderFields() {
  const provider = document.getElementById("calendarProvider");
  const target = document.getElementById("providerSpecificFields");
  if (!provider || !target) return;
  target.innerHTML = provider.value === "apple-caldav"
    ? `<label class="field single"><span>Apple app-specific password</span><input id="appleAppPassword" type="password" autocomplete="off"><small>Apple uses an app-specific password instead of browser OAuth.</small></label>`
    : "";
}

function accountFromForm() {
  const provider = document.getElementById("calendarProvider")?.value || "m365";
  const email = document.getElementById("calendarEmail")?.value || "";
  const caldavPassword = document.getElementById("appleAppPassword")?.value || "";
  const account = buildAccountDraft({ provider, email, caldavPassword });
  if (state.accounts.some((item) => item.provider === account.provider && item.email.toLowerCase() === account.email.toLowerCase())) {
    throw new Error("That calendar has already been added.");
  }
  return account;
}

async function addCalendar() {
  try {
    const account = accountFromForm();
    const accounts = [...state.accounts, account];
    const result = state.config
      ? await requestJson("/marvin-api/account-upsert", { ...payloadFor(accounts), account })
      : await requestJson("/marvin-api/save-config", payloadFor(accounts));
    state = applyConfig(state, result.config);
    setStatus("Starting account authorization.", "ok");
    render();
    await beginAuthorization(account.id);
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function beginAuthorization(calendarId) {
  try {
    const result = await requestJson("/marvin-api/connection-begin", {
      profileName: state.profileName,
      calendarId
    });
    state = applyConfig(state, result.config);
    if (result.launchUrl) {
      window.sessionStorage.setItem(RETURN_VIEW_KEY, state.activeView || "calendars");
      window.location.assign(result.launchUrl);
      return;
    }
    setStatus(result.message || "Calendar validation is in progress.", result.connectionRecord?.status === "connected" ? "ok" : "warn");
    await reload(true);
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function discoverMicrosoftCalendars(calendarId) {
  try {
    setStatus("Verifying the Microsoft identity and discovering calendars…", "warn");
    const result = await requestJson("/marvin-api/microsoft/discover", { profileName: state.profileName, calendarId });
    state = applyConfig(state, result.config);
    showCalendarSetup(calendarId);
    setStatus(
      result.requiresIdentityConfirmation
        ? result.message
        : `${result.message} Select the calendar${result.discoveredCalendars?.length === 1 ? "" : "s"} below to continue.`,
      result.requiresIdentityConfirmation ? "warn" : "ok"
    );
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function confirmMicrosoftIdentity(calendarId) {
  const account = state.accounts.find((item) => item.id === calendarId);
  const identity = account?.verifiedIdentity || {};
  const label = identity.email || identity.userPrincipalName || identity.displayName || "this Microsoft identity";
  if (!window.confirm(`Use ${label} for this connection? No source calendar items will be changed by this confirmation.`)) return;
  try {
    const result = await requestJson("/marvin-api/microsoft/confirm-identity", { profileName: state.profileName, calendarId, confirmed: true });
    state = applyConfig(state, result.config);
    showCalendarSetup(calendarId);
    setStatus("Microsoft identity confirmed. Choose the calendars to synchronize.", "ok");
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function selectMicrosoftCalendars(calendarId) {
  const providerCalendarIds = [...document.querySelectorAll("[data-microsoft-calendar]:checked")]
    .filter((input) => input.dataset.microsoftCalendar === calendarId)
    .map((input) => input.value);
  if (!providerCalendarIds.length && !window.confirm("Deselect all calendars for this Microsoft connection? Synchronization will pause, and Marvin will not delete existing calendar items.")) return;
  try {
    const result = await requestJson("/marvin-api/microsoft/select-calendars", { profileName: state.profileName, calendarId, providerCalendarIds });
    state = applyConfig(state, result.config);
    showCalendarSetup(result.selectedCalendars[0]?.id || result.connectionCalendarId || calendarId);
    if (!result.selectedCalendars.length) {
      setStatus("All calendars were deselected. Synchronization is paused for this connection, and no existing calendar items were deleted.", "ok");
      return;
    }
    setStatus(`${result.selectedCalendars.length} Microsoft calendar${result.selectedCalendars.length === 1 ? "" : "s"} selected. Verifying read, write, refresh, and real-time access…`, "warn");

    const issues = [];
    for (const selectedCalendar of result.selectedCalendars) {
      try {
        const capabilityResult = await requestJson("/marvin-api/microsoft/capabilities", {
          profileName: state.profileName,
          calendarId: selectedCalendar.id
        });
        state = applyConfig(state, capabilityResult.config);
        if (!capabilityResult.capabilities.ready) issues.push(...(capabilityResult.capabilities.issues || []));
      } catch (error) {
        issues.push(error.message);
      }
    }
    showCalendarSetup(result.selectedCalendars[0]?.id || result.connectionCalendarId || calendarId);
    setStatus(
      issues.length ? issues.join(" ") : "Microsoft calendar access is ready. No calendar items were changed during validation.",
      issues.length ? "warn" : "ok"
    );
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function checkMicrosoftCapabilities(calendarId) {
  try {
    const result = await requestJson("/marvin-api/microsoft/capabilities", { profileName: state.profileName, calendarId });
    state = applyConfig(state, result.config);
    render();
    setStatus(result.capabilities.ready ? "Microsoft calendar capabilities are ready." : result.capabilities.issues.join(" "), result.capabilities.ready ? "ok" : "warn");
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function discoverAppleCalendars(calendarId) {
  try {
    setStatus("Discovering the Apple principal, calendar home, and collections…", "warn");
    const result = await requestJson("/marvin-api/apple/discover", { profileName: state.profileName, calendarId });
    state = applyConfig(state, result.config);
    showCalendarSetup(calendarId);
    setStatus(`${result.message} Select the calendar${result.discoveredCalendars?.length === 1 ? "" : "s"} below to continue.`, "ok");
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function selectAppleCalendars(calendarId) {
  const providerCalendarIds = [...document.querySelectorAll("[data-apple-calendar]:checked")]
    .filter((input) => input.dataset.appleCalendar === calendarId)
    .map((input) => input.value);
  if (!providerCalendarIds.length) {
    setStatus("Select at least one writable Apple calendar.", "warn");
    return;
  }
  try {
    const result = await requestJson("/marvin-api/apple/select-calendars", { profileName: state.profileName, calendarId, providerCalendarIds });
    state = applyConfig(state, result.config);
    showCalendarSetup(result.selectedCalendars[0]?.id || calendarId);
    setStatus(`${result.selectedCalendars.length} Apple calendar${result.selectedCalendars.length === 1 ? "" : "s"} selected. Verifying read, write, and polling access…`, "warn");

    const issues = [];
    for (const selectedCalendar of result.selectedCalendars) {
      try {
        const capabilityResult = await requestJson("/marvin-api/apple/capabilities", {
          profileName: state.profileName,
          calendarId: selectedCalendar.id
        });
        state = applyConfig(state, capabilityResult.config);
        if (!capabilityResult.capabilities.ready) issues.push(...(capabilityResult.capabilities.issues || []));
      } catch (error) {
        issues.push(error.message);
      }
    }
    showCalendarSetup(result.selectedCalendars[0]?.id || calendarId);
    setStatus(
      issues.length ? issues.join(" ") : "Apple calendar access is ready. No calendar items were changed during validation.",
      issues.length ? "warn" : "ok"
    );
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function checkAppleCapabilities(calendarId) {
  try {
    const result = await requestJson("/marvin-api/apple/capabilities", { profileName: state.profileName, calendarId });
    state = applyConfig(state, result.config);
    render();
    setStatus(result.capabilities.ready ? "Apple calendar read, write, and polling capabilities are ready." : result.capabilities.issues.join(" "), result.capabilities.ready ? "ok" : "warn");
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function toggleSharing(calendarId) {
  try {
    const account = state.accounts.find((item) => item.id === calendarId);
    if (!account) throw new Error("Calendar not found.");
    const trusted = isTrustedTarget(account);
    const updated = withTrustedTarget(account, !trusted);
    const accounts = state.accounts.map((item) => item.id === calendarId ? updated : item);
    const result = await requestJson("/marvin-api/account-upsert", {
      ...payloadFor(accounts),
      account: updated
    });
    state = applyConfig(state, result.config);
    render();
    setStatus(trusted ? "This calendar now receives private copies." : "This trusted calendar can receive meeting details.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function saveCalendarSettings(calendarId) {
  try {
    const account = state.accounts.find((item) => item.id === calendarId);
    if (!account) throw new Error("Calendar not found.");
    const nameInput = [...document.querySelectorAll("[data-calendar-name-input]")]
      .find((item) => item.dataset.calendarNameInput === calendarId);
    const prefixInput = [...document.querySelectorAll("[data-prefix-input]")]
      .find((item) => item.dataset.prefixInput === calendarId);
    const roleInput = [...document.querySelectorAll("[data-calendar-role-input]")]
      .find((item) => item.dataset.calendarRoleInput === calendarId);
    if (!nameInput || !prefixInput || !roleInput) throw new Error("Calendar settings controls not found.");
    const label = nameInput.value.trim();
    const sourcePrefix = prefixInput.value.trim();
    if (!label) throw new Error("Enter a calendar name.");
    if (label.length > 80) throw new Error("Calendar name must be 80 characters or fewer.");
    if (sourcePrefix.length > 40) throw new Error("Event prefix must be 40 characters or fewer.");
    const updated = { ...account, label, sourcePrefix, calendarRole: roleInput.value };
    const accounts = state.accounts.map((item) => item.id === calendarId ? updated : item);
    const result = await requestJson("/marvin-api/account-upsert", {
      ...payloadFor(accounts),
      account: updated
    });
    state = applyConfig(state, result.config);
    render();
    setStatus(sourcePrefix ? "Calendar role, name, and event prefix saved." : "Calendar role and name saved. Mirrored events will use the original title without a prefix.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function saveDestinationPolicy(sourceId, targetId) {
  try {
    const source = state.accounts.find((item) => item.id === sourceId);
    if (!source) throw new Error("Source calendar not found.");
    const key = `${sourceId}::${targetId}`;
    const detailMode = [...document.querySelectorAll("[data-policy-detail]")].find((item) => item.dataset.policyDetail === key)?.value;
    const visibility = [...document.querySelectorAll("[data-policy-visibility]")].find((item) => item.dataset.policyVisibility === key)?.value;
    const availabilityMode = [...document.querySelectorAll("[data-policy-availability]")].find((item) => item.dataset.policyAvailability === key)?.value;
    if (!detailMode || !visibility || !availabilityMode) throw new Error("Destination rule controls were not found.");
    const updated = {
      ...source,
      destinationPolicies: {
        ...(source.destinationPolicies || {}),
        [targetId]: { detailMode, visibility, availabilityMode }
      }
    };
    const accounts = state.accounts.map((item) => item.id === sourceId ? updated : item);
    const result = await requestJson("/marvin-api/account-upsert", {
      ...payloadFor(accounts),
      account: updated
    });
    state = applyConfig(state, result.config);
    render();
    setStatus("Destination rule saved. Marvin queued a safe mirror reconciliation; original events will not be changed.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function scanCalendarReview() {
  try {
    setStatus("Reading connected calendars and building the review list…", "warn");
    const result = await requestJson("/marvin-api/calendar-review", { profileName: state.profileName });
    state = { ...state, calendarReview: result.review, activeView: "review" };
    render();
    setStatus(`Review ready: ${result.review.summary.duplicateGroups} duplicate group(s), ${result.review.summary.recommendedRemovals} suggested removal(s). Nothing was deleted.`, result.review.summary.duplicateGroups ? "warn" : "ok");
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, "bad");
  }
}

async function saveDuplicateDecision(candidateId, decision) {
  try {
    const result = await requestJson("/marvin-api/duplicate-decision", {
      profileName: state.profileName,
      candidateId,
      decision
    });
    state = { ...state, calendarReview: result.review };
    render();
    setStatus(`${decision === "keep" ? "Keep" : "Remove"} decision saved. No calendar item was deleted.`, "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function saveEventOverride(eventKey) {
  try {
    const select = [...document.querySelectorAll("[data-event-availability]")]
      .find((item) => item.dataset.eventAvailability === eventKey);
    if (!select) throw new Error("Event availability control was not found.");
    const result = await requestJson("/marvin-api/event-override", {
      profileName: state.profileName,
      eventKey,
      availabilityMode: select.value
    });
    state = applyConfig(state, result.config);
    render();
    setStatus(result.message || "Event exception saved.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function removeCalendar(calendarId) {
  if (state.accounts.length <= 1) {
    setStatus("Keep at least one calendar configured.", "warn");
    return;
  }
  if (!window.confirm("Remove this calendar connection? Existing source events will not be deleted.")) return;
  try {
    const result = await requestJson("/marvin-api/account-remove", {
      profileName: state.profileName,
      accountId: calendarId
    });
    state = applyConfig(state, result.config);
    render();
    setStatus("Calendar connection removed. Source calendar events were not changed.", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function setRuntimeRunning(running) {
  try {
    const result = await requestJson(`/marvin-api/runtime-${running ? "start" : "stop"}`, {
      profileName: state.profileName
    });
    state = applyConfig(state, result.config);
    state = { ...state, runtime: result };
    render();
    setStatus(running ? "Synchronization runtime started." : "Synchronization runtime stopped.", "ok");
  } catch (error) {
    setStatus(`${error.message}${error.action ? ` ${error.action}` : ""}`, error.retryable ? "warn" : "bad");
  }
}

async function retryRuntime() {
  try {
    const result = await requestJson("/marvin-api/runtime-retry", { profileName: state.profileName });
    state = applyConfig(state, result.config);
    setStatus(result.message, "ok");
    await reload(true);
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function reload(silent = true) {
  try {
    const result = await requestJson(`/marvin-api/config?profileName=${encodeURIComponent(state.profileName)}`);
    state = applyConfig(state, result.config);
    state = {
      ...state,
      calendarReview: result.calendarReview || state.calendarReview,
      runtime: await requestJson(`/marvin-api/runtime-status?profileName=${encodeURIComponent(state.profileName)}`)
    };
    render();
    if (!silent) setStatus("Workspace status refreshed.", "ok");
  } catch (error) {
    if (!silent) setStatus(error.message, "bad");
  }
}

async function signOut() {
  try {
    await requestJson("/marvin-api/logout", {});
  } finally {
    state = { ...createInitialState(), entraConfigured: state.entraConfigured, devAuthEnabled: state.devAuthEnabled };
    render();
  }
}

async function signInForDevelopment() {
  try {
    await requestJson("/marvin-api/auth/dev", {});
    await bootstrap();
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function bootstrap() {
  try {
    const result = await requestJson("/marvin-api/bootstrap");
    state = {
      ...state,
      signedIn: Boolean(result.authenticated),
      entraConfigured: Boolean(result.authentication?.entraConfigured),
      devAuthEnabled: Boolean(result.authentication?.devAuthEnabled),
      operator: {
        email: result.operator?.email || "",
        displayName: result.operator?.displayName || ""
      }
    };
    state = applyConfig(state, result.config);
    state = {
      ...state,
      calendarReview: result.calendarReview || state.calendarReview,
      profileName: state.profileName || profileNameFor(state.operator.email)
    };
    if (state.signedIn && state.config) {
      await reload(true);
      return;
    }
  } catch (error) {
    state = { ...state, bootstrapError: error.message };
  }
  render();
}

void bootstrap();
