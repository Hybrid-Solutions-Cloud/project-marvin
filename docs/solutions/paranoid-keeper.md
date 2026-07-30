# Paranoid Keeper

Paranoid Keeper is the always-on calendar synchronization application in the Project Marvin repository.

## Guarantees

- Every connected calendar is both a source and a target for every other connected calendar.
- A mirror keeps the source prefix, subject, location, description, event duration, and source timezone behavior.
- Mirrors are private by default.
- Trusted targets, such as family calendars, can opt into normal visibility and alternate detail policies.
- Managed event markers and persistent mappings prevent sync loops.
- Updates change existing mirrors and source deletions remove stale mirrors.
- All-day events remain all-day across Microsoft, Google, and CalDAV targets.

## Supported Providers

- Microsoft 365 and Outlook.com through Microsoft Graph OAuth, subscriptions, and webhooks.
- Google Calendar through Google OAuth, event watches, and webhooks.
- Apple Calendar through CalDAV server credentials and periodic polling.

## Runtime

After every connected account validates, Paranoid Keeper starts automatically and remains active in the hosted Container App. The local installer starts the same application for local testing. See [Getting Started](/getting-started) and [Azure deployment](/solutions/marvin-azure).