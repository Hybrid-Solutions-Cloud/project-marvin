# Marvin Engine Dry Run Plan

Profile: marvin-example
Timezone: America/New_York
Sync window: 45 days

This is the in-repo first-party service path.

## Planned Routes

- Work Microsoft 365 -> Contract Microsoft 365, Personal Google, Family Google, Personal Apple (subject)
- Contract Microsoft 365 -> Work Microsoft 365, Personal Google, Family Google, Personal Apple (subject)
- Personal Google -> Work Microsoft 365, Contract Microsoft 365, Family Google, Personal Apple (subject)
- Family Google -> Work Microsoft 365, Contract Microsoft 365, Personal Google, Personal Apple (subject)

## Provider Runtime

- Microsoft: marvin-engine
- Google: marvin-engine
- CalDAV: manual-caldav

## Policy Guarantees Under Design

- private-by-default mirrored events
- family-calendar visibility overrides
- per-source prefixes
- preserved source timezone behavior
- account connection status tracked per calendar
