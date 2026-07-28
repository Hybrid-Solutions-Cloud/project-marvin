# Architecture Direction

## Goal

Maintain availability across multiple calendars without exposing full meeting details to every tenant or account.

## Required capabilities

- Multi-provider support:
  - Microsoft 365 / Outlook
  - Apple Calendar / iCloud via CalDAV
  - Optional Google support later
- Two-way mirroring
- Private or obfuscated destination events
- Reliable update and delete propagation
- Recurring event handling
- Deployable through scripts
- Low ongoing maintenance

## Preferred event model

Each source event should create one or more managed mirror events in destination calendars.

Recommended mirrored payload:

- Subject:
  - either original subject, or a policy-controlled replacement such as `Busy`
- Description:
  - empty by default unless explicitly allowed
- Location:
  - optional
- Visibility:
  - private where the provider supports it
- Busy status:
  - busy
- Mapping metadata:
  - source provider
  - source calendar id
  - source event id
  - target provider
  - target calendar id
  - target event id
  - content hash or last sync fingerprint

## Sync model

Use star topology around one canonical sync engine.

Example:

- Work M365 calendar
- Contracting M365 or Outlook calendar
- Personal Apple calendar

The engine watches each source, normalizes events, applies privacy policy, and pushes managed mirrors to the other calendars.

This is better than daisy-chaining automations because:

- it reduces loop risk
- it centralizes mapping state
- it makes privacy policy consistent
- it is easier to deploy and test

## Suggested phases

### Phase 1

- Mirror time blocks only
- Support create, update, delete
- Support Microsoft 365 to Microsoft 365 and Microsoft 365 to Apple

### Phase 2

- Add selective detail copying
- Add recurrence hardening
- Add health checks and alerting

### Phase 3

- Add Google support if needed
- Add admin UI or config generator
