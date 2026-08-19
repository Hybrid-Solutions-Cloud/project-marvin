import {
  PORTAL_VIEWS,
  CALENDAR_ROLES,
  calendarRoleLabel,
  deriveCalendarState,
  formatTimestamp,
  getDashboardSummary,
  isTrustedTarget,
  providerLabel
} from "./model.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function icon(name) {
  const icons = {
    dashboard: "◫",
    calendars: "▦",
    rules: "◇",
    review: "☷",
    activity: "↻",
    diagnostics: "⌁",
    settings: "⚙"
  };
  return icons[name] || "•";
}

function statusBadge(calendarState) {
  return `<span class="status-badge ${calendarState.tone}"><span class="status-dot"></span>${escapeHtml(calendarState.label)}</span>`;
}

function statCard(label, value, detail, tone = "") {
  return `<article class="stat-card ${tone}">
    <span class="eyebrow">${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <p>${escapeHtml(detail)}</p>
  </article>`;
}

function microsoftConnectionStep(account, lifecycle) {
  if (account.provider !== "m365" && account.provider !== "outlook") return "";
  const identity = account.verifiedIdentity || {};
  const calendars = Array.isArray(account.discoveredCalendars) ? account.discoveredCalendars : [];
  const writableCalendars = calendars.filter((item) => item.canEdit);
  const previouslySelected = new Set(Array.isArray(account.selectedProviderCalendarIds) ? account.selectedProviderCalendarIds : []);
  const capabilities = account.capabilities || null;
  const identityBlock = identity.providerIdentityId
    ? `<div class="connection-evidence"><strong>Verified Microsoft identity</strong><span>${escapeHtml(identity.displayName || identity.email || identity.providerIdentityId)}</span><small>${escapeHtml(identity.email || identity.userPrincipalName || "Email not returned")} · ${escapeHtml(identity.accountType || "Microsoft account")}</small></div>`
    : "";
  const selection = lifecycle.id === "selection-required"
    ? `<fieldset class="calendar-selector"><legend>Select calendars to sync</legend><p class="selector-guidance">Found ${calendars.length} calendar${calendars.length === 1 ? "" : "s"}; ${writableCalendars.length} can be synchronized. Check calendars to include and uncheck calendars to stop syncing.</p>${calendars.map((item) => `<label class="calendar-choice ${item.canEdit ? "" : "disabled"}"><input type="checkbox" data-microsoft-calendar="${escapeHtml(account.id)}" value="${escapeHtml(item.providerCalendarId)}" ${item.canEdit ? "" : "disabled"} ${item.canEdit && (previouslySelected.has(item.providerCalendarId) || (!previouslySelected.size && writableCalendars.length === 1)) ? "checked" : ""}><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.ownerAddress || item.ownerName || "Microsoft calendar")} · ${item.canEdit ? "Writable" : "Read only"}</small></span></label>`).join("")}<button class="button" data-action="microsoft-select" data-id="${escapeHtml(account.id)}">Save calendar selection</button><small class="selector-safety">Deselecting stops future synchronization for that calendar. Marvin will not delete existing calendar items.</small></fieldset>`
    : "";
  const capabilityBlock = capabilities
    ? `<div class="capability-grid"><span class="${capabilities.read ? "ok" : "bad"}">Read</span><span class="${capabilities.write ? "ok" : "bad"}">Write</span><span class="${capabilities.refresh ? "ok" : "bad"}">Refresh</span><span class="${capabilities.subscription ? "ok" : "bad"}">Real-time</span></div>${(capabilities.issues || []).length ? `<ul class="inline-issues">${capabilities.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}`
    : "";
  return `${identityBlock}${selection}${capabilityBlock}`;
}

function microsoftAction(account, lifecycle) {
  if (account.provider !== "m365" && account.provider !== "outlook") return "";
  if (lifecycle.id === "confirmation-required") return `<button class="button" data-action="microsoft-confirm" data-id="${escapeHtml(account.id)}">Confirm this identity</button><button class="button secondary" data-action="authorize" data-id="${escapeHtml(account.id)}">Use another account</button>`;
  if (lifecycle.id === "discovery-required") return `<button class="button" data-action="microsoft-discover" data-id="${escapeHtml(account.id)}">Discover calendars</button>`;
  if (lifecycle.id === "selection-required") return "";
  if (lifecycle.id === "capability-required") return `<button class="button" data-action="microsoft-capabilities" data-id="${escapeHtml(account.id)}">Check capabilities</button><button class="button secondary" data-action="microsoft-discover" data-id="${escapeHtml(account.id)}">Manage calendars</button><button class="button secondary" data-action="authorize" data-id="${escapeHtml(account.id)}">Reconnect</button>`;
  return `<button class="button secondary" data-action="microsoft-discover" data-id="${escapeHtml(account.id)}">Manage calendars</button>`;
}

function appleConnectionStep(account, lifecycle) {
  if (account.provider !== "apple-caldav") return "";
  const calendars = Array.isArray(account.discoveredCalendars) ? account.discoveredCalendars : [];
  const writableCalendars = calendars.filter((item) => item.canEdit && item.canRead);
  const previouslySelected = new Set(Array.isArray(account.selectedProviderCalendarIds) ? account.selectedProviderCalendarIds : []);
  const capabilities = account.capabilities || null;
  const selection = lifecycle.id === "selection-required"
    ? `<fieldset class="calendar-selector"><legend>Choose writable Apple calendars</legend><p class="selector-guidance">Found ${calendars.length} calendar${calendars.length === 1 ? "" : "s"}; ${writableCalendars.length} can be synchronized. Select one or more writable calendars, then continue.</p>${calendars.map((item) => `<label class="calendar-choice ${item.canEdit && item.canRead ? "" : "disabled"}"><input type="checkbox" data-apple-calendar="${escapeHtml(account.id)}" value="${escapeHtml(item.providerCalendarId)}" ${item.canEdit && item.canRead ? "" : "disabled"} ${item.canEdit && item.canRead && (previouslySelected.has(item.providerCalendarId) || writableCalendars.length === 1) ? "checked" : ""}><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.color || "Apple calendar")} · ${item.canEdit && item.canRead ? "Writable" : "Read only"}</small></span></label>`).join("")}<button class="button" data-action="apple-select" data-id="${escapeHtml(account.id)}">Save selection and continue</button><small class="selector-safety">Validation only reads calendar metadata and availability. It does not change or delete calendar items.</small></fieldset>`
    : "";
  const capabilityBlock = capabilities
    ? `<div class="capability-grid"><span class="${capabilities.authentication ? "ok" : "bad"}">Authentication</span><span class="${capabilities.discovery ? "ok" : "bad"}">Discovery</span><span class="${capabilities.read ? "ok" : "bad"}">Read</span><span class="${capabilities.write ? "ok" : "bad"}">Write</span><span class="${capabilities.polling ? "ok" : "bad"}">Polling</span></div>${(capabilities.issues || []).length ? `<ul class="inline-issues">${capabilities.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}`
    : "";
  return `${selection}${capabilityBlock}`;
}

function appleAction(account, lifecycle) {
  if (account.provider !== "apple-caldav") return "";
  if (lifecycle.id === "discovery-required") return `<button class="button" data-action="apple-discover" data-id="${escapeHtml(account.id)}">Discover calendars</button><button class="button secondary" data-action="authorize" data-id="${escapeHtml(account.id)}">Replace password</button>`;
  if (lifecycle.id === "selection-required") return "";
  if (lifecycle.id === "capability-required") return `<button class="button" data-action="apple-capabilities" data-id="${escapeHtml(account.id)}">Check capabilities</button><button class="button secondary" data-action="apple-discover" data-id="${escapeHtml(account.id)}">Run discovery again</button>`;
  return "";
}

function calendarSettingsEditor(account, { showHeading = false } = {}) {
  return `<div class="calendar-settings-editor">${showHeading ? `<strong>${escapeHtml(account.label || account.email)}</strong><small>${escapeHtml(account.email)}</small>` : ""}<div class="calendar-settings-editor__fields"><label class="field"><span>Calendar name</span><input type="text" maxlength="80" data-calendar-name-input="${escapeHtml(account.id)}" value="${escapeHtml(account.label || "")}" placeholder="Calendar name"></label><label class="field"><span>Calendar role</span><select data-calendar-role-input="${escapeHtml(account.id)}">${CALENDAR_ROLES.map((role) => `<option value="${role.id}" ${role.id === (account.calendarRole || "employer-work") ? "selected" : ""}>${escapeHtml(role.label)}</option>`).join("")}</select></label><label class="field"><span>Event prefix</span><input type="text" maxlength="40" data-prefix-input="${escapeHtml(account.id)}" value="${escapeHtml(account.sourcePrefix || "")}" placeholder="No prefix"></label></div><div class="calendar-settings-editor__footer"><small>The role supplies safe defaults. The prefix identifies this calendar on every mirror.</small><button class="button secondary" data-action="calendar-settings-save" data-id="${escapeHtml(account.id)}">Save changes</button></div></div>`;
}

function calendarCard(account, { compact = false } = {}) {
  const lifecycle = deriveCalendarState(account);
  const trusted = isTrustedTarget(account);
  return `<article class="calendar-card ${compact ? "compact" : ""}" data-calendar-id="${escapeHtml(account.id)}">
    <div class="calendar-card__header">
      <div class="provider-mark" aria-hidden="true">${escapeHtml(providerLabel(account.provider).slice(0, 1))}</div>
      <div class="calendar-card__identity">
        <span class="eyebrow">${escapeHtml(providerLabel(account.provider))}</span>
        <h3>${escapeHtml(account.label || account.email)}</h3>
        <p>${escapeHtml(account.email)}</p>
      </div>
      ${statusBadge(lifecycle)}
    </div>
    <div class="calendar-card__policy">
      <span>${escapeHtml(calendarRoleLabel(account.calendarRole))}</span>
      <span>${trusted ? "Details visible" : "Private"}</span>
      <span>Prefix ${escapeHtml(account.sourcePrefix || "None")}</span>
    </div>
    ${compact ? "" : '<small class="policy-helper">Controls mirrored events on this calendar. You always see full details.</small>'}
    ${compact ? "" : calendarSettingsEditor(account)}
    ${compact ? "" : `${microsoftConnectionStep(account, lifecycle)}${appleConnectionStep(account, lifecycle)}`}
    ${compact && lifecycle.id !== "ready" ? `<div class="button-row"><button class="button" data-view-target="calendars" data-focus-calendar="${escapeHtml(account.id)}">Continue setup</button></div>` : ""}
    ${compact ? "" : `<div class="button-row">
      ${microsoftAction(account, lifecycle) || appleAction(account, lifecycle) || (lifecycle.id === "ready" || lifecycle.id === "selection-required" ? "" : `<button class="button secondary" data-action="authorize" data-id="${escapeHtml(account.id)}">${escapeHtml(lifecycle.action || "Check access")}</button>`)}
      <button class="button secondary" data-action="sharing" data-id="${escapeHtml(account.id)}">${trusted ? "Keep private" : "Show details"}</button>
      <button class="button quiet danger" data-action="remove" data-id="${escapeHtml(account.id)}">Remove</button>
    </div>`}
  </article>`;
}

function renderEmptyState() {
  return `<div class="empty-state">
    <span class="empty-state__icon" aria-hidden="true">☹</span>
    <h3>No calendars yet</h3>
    <p>Connect two Microsoft calendars to begin building a complete view of your availability.</p>
    <button class="button" data-view-target="calendars">Add your first calendar</button>
  </div>`;
}

function renderDashboard(state) {
  const summary = getDashboardSummary(state);
  const healthy = summary.running && summary.actionRequired === 0;
  const canStart = summary.total >= 2 && summary.actionRequired === 0;
  const message = summary.total < 2
    ? "Add at least two calendars before synchronization can begin."
    : summary.actionRequired > 0
      ? `${summary.actionRequired} calendar${summary.actionRequired === 1 ? "" : "s"} need attention before Marvin can keep everything synchronized.`
      : summary.running
        ? "Every configured calendar is ready and the synchronization runtime is active."
        : "Every calendar is ready. The runtime is waiting to start.";

  return `<section class="view" aria-labelledby="dashboard-title">
    <div class="view-heading">
      <div>
        <span class="eyebrow">Workspace overview</span>
        <h1 id="dashboard-title">Your calendar mesh</h1>
        <p>One place to understand readiness, privacy, and synchronization health.</p>
      </div>
      <button class="button secondary" data-action="refresh">Refresh status</button>
    </div>
    <div class="health-banner ${healthy ? "healthy" : "attention"}">
      <div>
        <span class="eyebrow">${healthy ? "Everything nominal" : "Action required"}</span>
        <h2>${escapeHtml(summary.runtimeLabel)}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="health-banner__time"><span>Last completed sync</span><strong>${escapeHtml(formatTimestamp(summary.lastCompletedAt))}</strong>${summary.running ? `<small>Next poll ${escapeHtml(formatTimestamp(summary.nextPollAt))}${summary.consecutiveFailures ? ` · backoff after ${summary.consecutiveFailures} failure${summary.consecutiveFailures === 1 ? "" : "s"}` : ""}</small>` : ""}<button class="button ${summary.running ? "secondary" : ""}" data-action="runtime-${summary.running ? "stop" : "start"}" ${!summary.running && !canStart ? "disabled" : ""}>${summary.running ? "Stop runtime" : "Start runtime"}</button></div>
    </div>
    <div class="stat-grid">
      ${statCard("Calendars", summary.total, "Configured sources and targets")}
      ${statCard("Ready", summary.ready, "Validated for synchronization", summary.ready ? "positive" : "")}
      ${statCard("Need attention", summary.actionRequired, "Setup or access work remains", summary.actionRequired ? "warning" : "")}
      ${statCard("Runtime", summary.running ? "On" : "Off", summary.runtimeLabel, summary.running ? "positive" : "")}
    </div>
    <div class="content-grid">
      <section class="panel">
        <div class="section-heading"><div><span class="eyebrow">Connected calendars</span><h2>Readiness</h2></div><button class="text-button" data-view-target="calendars">Manage calendars →</button></div>
        <div class="card-list">${state.accounts.length ? state.accounts.map((account) => calendarCard(account, { compact: true })).join("") : renderEmptyState()}</div>
      </section>
      <section class="panel">
        <div class="section-heading"><div><span class="eyebrow">Recommended</span><h2>Next actions</h2></div></div>
        <ol class="next-steps">
          ${summary.nextSteps.length
            ? summary.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")
            : summary.total < 2
              ? "<li>Add and authorize at least two Microsoft calendars.</li><li>Review which destinations should remain private.</li><li>Return here to verify runtime readiness.</li>"
              : "<li>No setup action is currently required.</li>"}
        </ol>
      </section>
    </div>
  </section>`;
}

function addCalendarForm() {
  return `<section class="panel">
    <div class="section-heading"><div><span class="eyebrow">New connection</span><h2>Add a calendar</h2><p>Microsoft is the first supported release path. Other providers remain visible for existing configurations while their release gates are completed.</p></div></div>
    <div class="form-grid">
      <label class="field"><span>Calendar provider</span><select id="calendarProvider">
        <optgroup label="Microsoft — current focus">
          <option value="m365">Microsoft 365</option>
          <option value="outlook">Outlook.com</option>
        </optgroup>
        <optgroup label="Later release gates">
          <option value="apple-caldav">Apple Calendar</option>
          <option value="google">Google Calendar</option>
        </optgroup>
      </select></label>
      <label class="field"><span>Account email</span><input id="calendarEmail" type="email" autocomplete="email" placeholder="calendar-account@example.com"></label>
    </div>
    <div id="providerSpecificFields"></div>
    <div class="form-note"><strong>What happens next?</strong><span>Marvin saves this calendar, opens provider authorization, and verifies access before calling it Ready.</span></div>
    <div class="button-row"><button id="addCalendar" class="button">Add calendar</button></div>
  </section>`;
}

function renderCalendars(state) {
  return `<section class="view" aria-labelledby="calendars-title">
    <div class="view-heading"><div><span class="eyebrow">Connections</span><h1 id="calendars-title">Calendars</h1><p>Add accounts, finish authorization, and control what each destination receives.</p></div><button class="button secondary" data-action="refresh">Refresh status</button></div>
    <div class="content-grid calendars-layout">
      ${addCalendarForm()}
      <section class="panel"><div class="section-heading"><div><span class="eyebrow">${state.accounts.length} configured</span><h2>Your calendars</h2></div></div><div class="card-list">${state.accounts.length ? state.accounts.map((account) => calendarCard(account)).join("") : renderEmptyState()}</div></section>
    </div>
  </section>`;
}

function effectiveDestinationPolicy(source, target) {
  const explicit = source.destinationPolicies?.[target.id] || {};
  const sourceFamily = source.calendarRole === "shared-family";
  const targetFamily = target.calendarRole === "shared-family";
  return {
    detailMode: explicit.detailMode || (targetFamily && !sourceFamily ? "busy" : "full"),
    visibility: explicit.visibility || (targetFamily ? "default" : "private"),
    availabilityMode: explicit.availabilityMode || (sourceFamily && !targetFamily ? "free" : "source")
  };
}

function destinationRuleEditor(source, target) {
  const policy = effectiveDestinationPolicy(source, target);
  const key = `${source.id}::${target.id}`;
  return `<article class="route-policy-card" data-route-policy="${escapeHtml(key)}">
    <div class="route-policy-card__heading"><div><span class="eyebrow">${escapeHtml(calendarRoleLabel(source.calendarRole))} → ${escapeHtml(calendarRoleLabel(target.calendarRole))}</span><strong>${escapeHtml(source.label)} to ${escapeHtml(target.label)}</strong><small>${escapeHtml(source.sourcePrefix || "No prefix")} ${policy.detailMode === "busy" ? "Busy" : "original title"}</small></div></div>
    <div class="route-policy-fields">
      <label class="field"><span>What you see</span><select data-policy-detail="${escapeHtml(key)}"><option value="full" ${policy.detailMode === "full" ? "selected" : ""}>Full details</option><option value="subject" ${policy.detailMode === "subject" ? "selected" : ""}>Title only</option><option value="busy" ${policy.detailMode === "busy" ? "selected" : ""}>Busy only</option></select></label>
      <label class="field"><span>What others see</span><select data-policy-visibility="${escapeHtml(key)}"><option value="private" ${policy.visibility === "private" ? "selected" : ""}>Private</option><option value="default" ${policy.visibility === "default" ? "selected" : ""}>Calendar default</option></select></label>
      <label class="field"><span>Blocks scheduling</span><select data-policy-availability="${escapeHtml(key)}"><option value="source" ${policy.availabilityMode === "source" ? "selected" : ""}>Match original</option><option value="busy" ${policy.availabilityMode === "busy" ? "selected" : ""}>Always busy</option><option value="free" ${policy.availabilityMode === "free" ? "selected" : ""}>Always free</option><option value="tentative" ${policy.availabilityMode === "tentative" ? "selected" : ""}>Tentative</option><option value="oof" ${policy.availabilityMode === "oof" ? "selected" : ""}>Out of office</option></select></label>
    </div>
    <div class="route-policy-card__footer"><small>Only Marvin-created mirrors are changed. The original event remains untouched.</small><button class="button secondary" data-action="destination-policy-save" data-source="${escapeHtml(source.id)}" data-target="${escapeHtml(target.id)}">Save rule</button></div>
  </article>`;
}

function renderRules(state) {
  const rules = state.accounts.flatMap((source) => state.accounts.filter((target) => target.id !== source.id).map((target) => destinationRuleEditor(source, target)));
  return `<section class="view" aria-labelledby="rules-title">
    <div class="view-heading"><div><span class="eyebrow">Privacy, detail, and availability</span><h1 id="rules-title">Sync Rules</h1><p>Decide independently what you see, what other viewers see, and whether each mirror blocks scheduling.</p></div></div>
    <div class="policy-callout"><strong>Private and Busy are different settings.</strong><p>Private protects event details from ordinary calendar viewers. Availability determines whether Scheduling Assistant treats the time as open or blocked.</p></div>
    <section class="panel"><div class="section-heading"><div><span class="eyebrow">Source-to-destination policies</span><h2>How events appear elsewhere</h2><p>Family events default to Free on professional calendars. Professional events copied to a shared family calendar default to Busy-only details.</p></div></div><div class="route-policy-list">${rules.length ? rules.join("") : renderEmptyState()}</div></section>
  </section>`;
}

function renderActivity(state) {
  const runtimeStatus = state.runtime?.runtimeStatus || state.config?.runtimeStatus || {};
  const filters = state.activityFilters || { calendarId: "all", result: "all", timeRange: "all" };
  const cutoff = filters.timeRange === "24h" ? Date.now() - 24 * 60 * 60 * 1000
    : filters.timeRange === "7d" ? Date.now() - 7 * 24 * 60 * 60 * 1000
      : 0;
  const runs = (Array.isArray(runtimeStatus.recentRuns) ? runtimeStatus.recentRuns : []).filter((run) => {
    const completedAt = new Date(run.completedAt || run.startedAt || 0).getTime();
    const resultMatches = filters.result === "all" || (filters.result === "success" ? run.success : !run.success);
    const calendarIds = new Set([
      ...(run.webhookTrigger?.calendarIds || []),
      ...(run.sourceLoad?.loadedCalendarIds || []),
      ...(run.failures || []).flatMap((failure) => [failure.calendarId, failure.sourceCalendarId, failure.targetCalendarId])
    ].filter(Boolean));
    const calendarMatches = filters.calendarId === "all" || calendarIds.has(filters.calendarId);
    return resultMatches && calendarMatches && (!cutoff || completedAt >= cutoff);
  });
  return `<section class="view" aria-labelledby="activity-title">
    <div class="view-heading"><div><span class="eyebrow">Synchronization history</span><h1 id="activity-title">Activity</h1><p>Recent runtime evidence without exposing event bodies or credentials.</p></div><div class="button-row"><button class="button" data-action="runtime-retry">Retry and reconcile</button><button class="button secondary" data-action="refresh">Refresh activity</button></div></div>
    <section class="panel"><div class="activity-filters" aria-label="Activity filters">
      <label class="field"><span>Calendar</span><select data-activity-filter="calendarId"><option value="all">All calendars</option>${state.accounts.map((account) => `<option value="${escapeHtml(account.id)}" ${filters.calendarId === account.id ? "selected" : ""}>${escapeHtml(account.label)}</option>`).join("")}</select></label>
      <label class="field"><span>Result</span><select data-activity-filter="result"><option value="all" ${filters.result === "all" ? "selected" : ""}>All results</option><option value="success" ${filters.result === "success" ? "selected" : ""}>Completed</option><option value="failure" ${filters.result === "failure" ? "selected" : ""}>Failed</option></select></label>
      <label class="field"><span>Time</span><select data-activity-filter="timeRange"><option value="all" ${filters.timeRange === "all" ? "selected" : ""}>All retained</option><option value="24h" ${filters.timeRange === "24h" ? "selected" : ""}>Last 24 hours</option><option value="7d" ${filters.timeRange === "7d" ? "selected" : ""}>Last 7 days</option></select></label>
    </div><div class="activity-list">${runs.length ? runs.map((run) => {
      const apply = run.applyResult || {};
      const failures = Array.isArray(run.failures) ? run.failures : [];
      return `<article class="activity-row"><span class="status-badge ${run.success ? "ok" : "bad"}"><span class="status-dot"></span>${run.success ? "Completed" : "Failed"}</span><div><strong>${escapeHtml(formatTimestamp(run.completedAt || run.startedAt))}</strong><p>Wake: ${escapeHtml(run.wakeReason || "interval")} · ${Number(apply.succeeded || 0)} succeeded · ${Number(apply.failed || 0)} failed · ${Number(apply.skipped || 0)} skipped</p>${failures.map((failure) => `<p class="failure-detail"><strong>${escapeHtml(failure.provider || "Runtime")} · ${escapeHtml(failure.calendarId || failure.targetCalendarId || "Workspace")} · ${escapeHtml(failure.operation || "sync")}</strong><br>${escapeHtml(failure.message)} ${escapeHtml(failure.action || "Review Diagnostics and retry.")}</p>`).join("")}</div></article>`;
    }).join("") : `<div class="empty-state compact"><h3>No synchronization runs yet</h3><p>Activity will appear after the runtime completes its first cycle.</p></div>`}</div></section>
  </section>`;
}

function renderDiagnostics(state) {
  const summary = state.config?.connectionSummary?.summary || {};
  const subscriptionState = state.runtime?.subscriptionState || state.config?.subscriptionState || {};
  return `<section class="view" aria-labelledby="diagnostics-title">
    <div class="view-heading"><div><span class="eyebrow">Evidence and recovery</span><h1 id="diagnostics-title">Diagnostics</h1><p>Provider and runtime evidence used to decide whether a calendar is Ready.</p></div><button class="button secondary" data-action="refresh">Run status check</button></div>
    <div class="stat-grid">
      ${statCard("Connected", Number(summary.connected || 0), "Provider connection state")}
      ${statCard("Pending", Number(summary.pending || 0), "Authorization or validation")}
      ${statCard("Connector setup", Number(summary.connectorNotReady || 0), "Provider configuration required")}
      ${statCard("Invalid", Number(summary.invalid || 0), "Access needs correction", Number(summary.invalid || 0) ? "warning" : "")}
    </div>
    <div class="content-grid">
      <section class="panel"><div class="section-heading"><div><span class="eyebrow">Per calendar</span><h2>Connection evidence</h2></div></div><div class="diagnostic-list">${state.accounts.length ? state.accounts.map((account) => {
        const lifecycle = deriveCalendarState(account);
        return `<article><div>${statusBadge(lifecycle)}<strong>${escapeHtml(account.label)}</strong></div><p>${escapeHtml(account.readinessDetail || account.connectionReason || "Provider validation has not completed.")}</p><dl><div><dt>Token</dt><dd>${escapeHtml(account.tokenStatus || "Not applicable")}</dd></div><div><dt>Last checked</dt><dd>${escapeHtml(formatTimestamp(account.lastValidatedAt))}</dd></div></dl></article>`;
      }).join("") : renderEmptyState()}</div></section>
      <section class="panel"><div class="section-heading"><div><span class="eyebrow">Automation</span><h2>Notification state</h2></div></div><dl class="definition-list"><div><dt>Subscriptions tracked</dt><dd>${Array.isArray(subscriptionState.subscriptions) ? subscriptionState.subscriptions.length : 0}</dd></div><div><dt>Pending webhook sync</dt><dd>${subscriptionState.automation?.pendingSyncRequested ? "Yes" : "No"}</dd></div><div><dt>Last provider wake</dt><dd>${escapeHtml(subscriptionState.automation?.lastRequestedByProvider || "None")}</dd></div></dl></section>
    </div>
  </section>`;
}

function eventOverrideValue(state, event) {
  const overrides = Array.isArray(state.config?.eventOverrides) ? state.config.eventOverrides : [];
  const match = overrides.find((item) => item.sourceCalendarId === event.sourceCalendarId
    && (event.providerEventIdentity ? item.providerEventIdentity === event.providerEventIdentity : item.sourceEventId === event.sourceEventId));
  return match?.availabilityMode || "default";
}

function duplicateGroup(group) {
  return `<details class="duplicate-group" open>
    <summary><span><strong>${escapeHtml(group.subject)}</strong><small>${escapeHtml(formatTimestamp(group.start))} · ${group.copies} ${group.copies === 1 ? "copy" : "copies"} · ${escapeHtml(group.confidence)} match</small></span><span class="status-badge warn">${group.requiresReplacement ? "Repair first" : "Review"}</span></summary>
    <div class="duplicate-candidates">${group.candidates.map((candidate, index) => `<article class="duplicate-candidate"><div><strong>${candidate.obsoletePrefix ? "Obsolete prefix" : candidate.recommendedDecision === "keep" ? "Recommended copy" : `Extra copy ${index + 1}`}</strong><span>${escapeHtml(candidate.sourceCalendarLabel || candidate.sourceCalendarId || "Unresolved source calendar")} → ${escapeHtml(candidate.calendarLabel || candidate.calendarId)}</span><small>${candidate.obsoletePrefix ? `${escapeHtml(candidate.detectedPrefix || "Old prefix")} is no longer configured${candidate.expectedPrefix ? `; expected ${escapeHtml(candidate.expectedPrefix)}` : ""}.` : candidate.trackedByMarvin ? "Matches the current Marvin registry" : "Historical or untracked mirror"}</small></div><div class="decision-toggle" role="group" aria-label="Keep or remove this mirror"><button class="button quiet ${candidate.decision === "keep" ? "active" : ""}" data-action="duplicate-decision" data-candidate="${escapeHtml(candidate.candidateId)}" data-decision="keep" ${candidate.obsoletePrefix ? "disabled title=\"Obsolete prefixes cannot be kept\"" : ""}>Keep</button><button class="button quiet danger ${candidate.decision === "remove" ? "active" : ""}" data-action="duplicate-decision" data-candidate="${escapeHtml(candidate.candidateId)}" data-decision="remove">Remove</button></div></article>`).join("")}</div>
  </details>`;
}

function eventExceptionRow(state, event) {
  const account = state.accounts.find((item) => item.id === event.sourceCalendarId);
  const value = eventOverrideValue(state, event);
  return `<article class="event-exception-row"><div><strong>${escapeHtml(event.subject)}</strong><span>${escapeHtml(account?.label || event.sourceCalendarId)} · ${escapeHtml(formatTimestamp(event.start))}</span><small>Original: ${escapeHtml(event.availability || "busy")}. This setting changes mirrors only.</small></div><div class="event-exception-control"><select data-event-availability="${escapeHtml(event.eventKey)}"><option value="default" ${value === "default" ? "selected" : ""}>Use calendar rule</option><option value="free" ${value === "free" ? "selected" : ""}>Free everywhere</option><option value="busy" ${value === "busy" ? "selected" : ""}>Block as busy</option><option value="oof" ${value === "oof" ? "selected" : ""}>Out of office</option><option value="source" ${value === "source" ? "selected" : ""}>Match original</option></select><button class="button secondary" data-action="event-override-save" data-event="${escapeHtml(event.eventKey)}">Save</button></div></article>`;
}

function renderReview(state) {
  const review = state.calendarReview;
  if (!review) {
    return `<section class="view" aria-labelledby="review-title"><div class="view-heading"><div><span class="eyebrow">Safe review</span><h1 id="review-title">Events and duplicates</h1><p>Build a read-only list from your connected calendars before deciding what to keep or remove.</p></div><button class="button" data-action="calendar-review-scan">Scan calendars</button></div><div class="policy-callout"><strong>No deletion occurs here.</strong><p>The scan reads events and Marvin ownership markers. Keep and Remove choices are saved as a review plan only.</p></div></section>`;
  }
  const summary = review.summary || {};
  const upcoming = (review.sourceEvents || []).filter((event) => new Date(event.end).getTime() >= Date.now()).slice(0, 150);
  return `<section class="view" aria-labelledby="review-title">
    <div class="view-heading"><div><span class="eyebrow">Safe review</span><h1 id="review-title">Events and duplicates</h1><p>Review suspected duplicate mirrors and override availability for individual upcoming events.</p></div><button class="button secondary" data-action="calendar-review-scan">Scan again</button></div>
    <div class="stat-grid">${statCard("Mirror events", summary.mirrorEvents || 0, "Marvin-created copies in the review window")}${statCard("Duplicate groups", summary.duplicateGroups || 0, "Groups with two or more matching mirrors", summary.duplicateGroups ? "warn" : "ok")}${statCard("Obsolete prefixes", summary.obsoleteMirrors || 0, "Copies using a prefix that is no longer configured", summary.obsoleteMirrors ? "warn" : "ok")}${statCard("Suggested removals", summary.recommendedRemovals || 0, "Decisions only; cleanup requires replacement verification", summary.recommendedRemovals ? "warn" : "ok")}</div>
    <div class="policy-callout"><strong>Review mode only.</strong><p>Remove means “include in the proposed cleanup.” Marvin will not delete it until you separately approve the completed plan.</p></div>
    <section class="panel"><div class="section-heading"><div><span class="eyebrow">Keep or remove</span><h2>Mirror cleanup list</h2><p>Marvin keeps a currently configured copy when one exists. Every obsolete prefix is marked Remove—even when it is the only stale copy; groups labeled Repair first need a correct replacement before cleanup can run.</p></div></div><div class="duplicate-list">${review.duplicateGroups?.length ? review.duplicateGroups.map(duplicateGroup).join("") : '<div class="empty-state"><h3>No mirror cleanup candidates found</h3><p>The current review window does not contain duplicate or obsolete-prefix Marvin mirrors.</p></div>'}</div></section>
    <section class="panel"><div class="section-heading"><div><span class="eyebrow">Per-event exceptions</span><h2>Upcoming event availability</h2><p>Family events can remain visible but Free by default, while selected events can block every professional calendar.</p></div></div><div class="event-exception-list">${upcoming.length ? upcoming.map((event) => eventExceptionRow(state, event)).join("") : '<p>No upcoming original events were returned.</p>'}</div></section>
  </section>`;
}

function renderSettings(state) {
  return `<section class="view" aria-labelledby="settings-title">
    <div class="view-heading"><div><span class="eyebrow">Workspace configuration</span><h1 id="settings-title">Settings</h1><p>Manage calendar names, synchronization defaults, and how mirrored event titles identify their source.</p></div></div>
    <div class="content-grid">
      <section class="panel"><div class="section-heading"><div><span class="eyebrow">Workspace</span><h2>Identity</h2></div></div><dl class="definition-list"><div><dt>Owner</dt><dd>${escapeHtml(state.operator.displayName || state.operator.email || "Not bound")}</dd></div><div><dt>Email</dt><dd>${escapeHtml(state.operator.email || "Not available")}</dd></div><div><dt>Profile</dt><dd class="mono">${escapeHtml(state.profileName || "Not created")}</dd></div></dl></section>
      <section class="panel"><div class="section-heading"><div><span class="eyebrow">Synchronization</span><h2>Defaults</h2></div></div><dl class="definition-list"><div><dt>Timezone</dt><dd>${escapeHtml(state.config?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)}</dd></div><div><dt>Window</dt><dd>${Number(state.config?.syncWindowDays || 45)} days</dd></div><div><dt>Visibility</dt><dd>Private by default</dd></div><div><dt>Timezone preservation</dt><dd>${state.config?.preferences?.preserveOriginalTimezone === false ? "Off" : "On"}</dd></div></dl></section>
      <section class="panel calendar-settings-panel"><div class="section-heading"><div><span class="eyebrow">Connections and mirrored titles</span><h2>Calendar names and event prefixes</h2><p>Choose the names shown in Marvin and an optional prefix for events mirrored from each calendar.</p></div></div><div class="calendar-settings-list">${state.accounts.length ? state.accounts.map((account) => calendarSettingsEditor(account, { showHeading: true })).join("") : renderEmptyState()}</div></section>
    </div>
  </section>`;
}

function renderActiveView(state) {
  if (state.activeView === "calendars") return renderCalendars(state);
  if (state.activeView === "rules") return renderRules(state);
  if (state.activeView === "review") return renderReview(state);
  if (state.activeView === "activity") return renderActivity(state);
  if (state.activeView === "diagnostics") return renderDiagnostics(state);
  if (state.activeView === "settings") return renderSettings(state);
  return renderDashboard(state);
}

export function renderAuth(state) {
  const ready = state.entraConfigured;
  return `<main class="auth-layout">
    <section class="auth-brand">
      <img class="marvin-mark marvin-mark--hero" src="/marvin-mark.svg" alt="Project Marvin">
      <span class="product-kicker">Project Marvin</span>
      <h1>All your calendars.<br><em>One slightly gloomy calendar sync.</em></h1>
      <p>Private-by-default calendar mirrors across work, personal, and family accounts.</p>
      <div class="auth-promise"><span>Microsoft first</span><span>Apple next</span><span>Google after</span></div>
    </section>
    <section class="auth-card">
      <span class="eyebrow">Workspace access</span>
      <h2>Sign in with Microsoft</h2>
      <p>Your workspace identity protects this portal. Calendar accounts are authorized separately after sign-in.</p>
      <button id="entraSignIn" class="button wide" ${ready ? "" : "disabled"}>Continue with Microsoft</button>
      ${state.devAuthEnabled ? '<button id="devSignIn" class="button secondary wide">Local development sign-in</button>' : ""}
      <div class="form-note"><strong>${ready ? "Ready to continue" : "Sign-in configuration required"}</strong><span>${ready ? "The first verified identity becomes this workspace owner." : "Microsoft Entra settings have not been provided for this deployment."}</span></div>
    </section>
  </main>`;
}

export function renderPortal(state) {
  const current = PORTAL_VIEWS.find((view) => view.id === state.activeView) || PORTAL_VIEWS[0];
  return `<div class="portal-layout">
    <aside class="sidebar">
      <div class="brand-lockup"><img src="/marvin-mark.svg" alt=""><div><span>Calendar synchronization</span><strong>Project Marvin</strong></div></div>
      <nav aria-label="Product navigation">${PORTAL_VIEWS.map((view) => `<button class="nav-item ${view.id === current.id ? "active" : ""}" data-view-target="${view.id}" ${view.id === current.id ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icon(view.id)}</span><span><strong>${view.label}</strong><small>${view.description}</small></span></button>`).join("")}</nav>
      <div class="sidebar-footer"><span class="status-dot ${state.runtime?.runtimeProcess?.running ? "running" : ""}"></span><div><strong>${state.runtime?.runtimeProcess?.running ? "Runtime active" : "Runtime waiting"}</strong><small>${escapeHtml(state.profileName || "Workspace setup")}</small></div></div>
    </aside>
    <main class="workspace">
      <header class="topbar"><div class="mobile-brand"><img src="/marvin-mark.svg" alt=""><span class="mobile-product"><small>Calendar synchronization</small>Project Marvin</span></div><div class="topbar-actions"><span class="operator-name">${escapeHtml(state.operator.displayName || state.operator.email)}</span><button class="button quiet" data-action="signout">Sign out</button></div></header>
      ${renderActiveView(state)}
      <div id="status" class="toast" role="status" aria-live="polite" hidden></div>
    </main>
  </div>`;
}
