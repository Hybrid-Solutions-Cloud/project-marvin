import { buildTokenStorePath, FileTokenStore } from "../storage/file-token-store.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

export function getTokenRecord(tokenState, calendarId) {
  return (Array.isArray(tokenState?.records) ? tokenState.records : []).find((record) => record.calendarId === calendarId) || null;
}

export function isTokenRecordUsable(record, now = Date.now()) {
  if (!record || !normalizeString(record.accessToken)) {
    return false;
  }
  const expiresAt = normalizeString(record.expiresAt);
  if (!expiresAt) {
    return true;
  }
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return false;
  }
  return expiresMs - now > 60000;
}

export function summarizeTokenState(tokenState, calendars = []) {
  const records = Array.isArray(tokenState?.records) ? tokenState.records : [];
  const summary = {
    total: calendars.length || records.length,
    usable: 0,
    expired: 0,
    missing: 0,
    errors: 0
  };

  if (calendars.length > 0) {
    for (const calendar of calendars) {
      const record = getTokenRecord(tokenState, calendar.id);
      if (!record) {
        summary.missing += 1;
      } else if (record.status === "error") {
        summary.errors += 1;
      } else if (isTokenRecordUsable(record)) {
        summary.usable += 1;
      } else {
        summary.expired += 1;
      }
    }
    return summary;
  }

  for (const record of records) {
    if (record.status === "error") {
      summary.errors += 1;
    } else if (isTokenRecordUsable(record)) {
      summary.usable += 1;
    } else {
      summary.expired += 1;
    }
  }
  return summary;
}

export function loadTokenStateForProfile(rootDir, profileName) {
  return new FileTokenStore(buildTokenStorePath(rootDir, profileName)).load();
}
