# Marvin Engine Dry Run Plan

Profile: marvin-example
Timezone: America/New_York
Sync window: 45 days

This is the in-repo first-party service path. It can now execute a deterministic mock sync and write mapping state. Remarkable, really.

## Planned Routes

- Work Microsoft 365 -> Contract Microsoft 365, Personal Google, Personal Apple (busy)
- Contract Microsoft 365 -> Work Microsoft 365, Personal Google, Personal Apple (busy)
- Personal Google -> Work Microsoft 365, Contract Microsoft 365 (busy)

## Intended Providers

- Microsoft Graph for Microsoft 365 and Outlook
- Google Calendar API if a Google hub remains relevant
- CalDAV for optional Apple calendar support

## Local Test Sequence

1. Run npm run marvin:dry-run
2. Run npm run marvin:apply-mock
3. Inspect artifacts/marvin-engine/marvin-example.mappings.json
