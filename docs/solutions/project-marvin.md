# Project Marvin Application Contract

Project Marvin is the calendar synchronization application. Marvin Engine is its synchronization runtime.

## Guarantees

- Every connected calendar is both a source and a target for every other connected calendar.
- A mirror keeps the source prefix, subject, location, description, event duration, and source timezone behavior.
- Mirrors are private by default.
- Trusted targets, such as family calendars, can opt into normal visibility and alternate detail policies.
- Managed event markers and persistent mappings prevent sync loops.
- Updates change existing mirrors. Source cleanup requires an explicit provider tombstone and a Marvin-owned mapping; provider deletion is disabled by default.
- All-day events remain all-day across Microsoft, Google, and CalDAV targets.

## Provider support

1. Microsoft 365 and Outlook.com through Microsoft Graph OAuth, subscriptions, and webhooks.
2. Apple Calendar through CalDAV credentials and periodic polling.
3. Google Calendar through Google OAuth, event watches, and webhooks.

## Runtime

The portal permits a manual runtime start only after every configured calendar is connected and validated. The hosted process starts when a saved profile exists, including while some calendars still require action; provider readiness determines which calendar work is eligible. See [Getting Started](/getting-started) and [Azure deployment](/solutions/marvin-azure).
