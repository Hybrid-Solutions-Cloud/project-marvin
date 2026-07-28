# Spike: Graph + CalDAV Service

## Summary

This is the strongest fit for the actual requirement set.

Build or adapt a small service that uses:

- Microsoft Graph for Outlook and Microsoft 365 calendars
- CalDAV for Apple Calendar or iCloud-backed calendars

## Why this fits

- It supports the provider mix you actually described.
- It allows strict privacy policies on mirrored events.
- It can be deployed and configured through scripts.
- It centralizes loop prevention and event mapping.
- It is easier to observe and repair than scattered low-code flows.

## Suggested behavior

For every source calendar event that passes policy:

1. Normalize the event.
2. Decide destination calendars.
3. Generate a mirror payload.
4. Create or update a managed event in each destination.
5. Delete managed destination events when the source disappears or no longer qualifies.

## Privacy policy options

### Minimal blocker

- Subject: `Busy`
- Body: empty
- Location: empty
- Visibility: private

### Medium detail

- Subject: original subject
- Body: empty
- Location: optional
- Visibility: private

### Full mirror

- Subject and body copied
- Only appropriate inside trusted domains

## Data model

Persist a sync mapping table with:

- source account
- source calendar id
- source event id
- source etag or modified timestamp
- destination account
- destination calendar id
- destination event id
- sync policy
- last synced fingerprint

## Operational model

Recommended deployment shape:

- containerized worker or small web service
- scheduled reconciliation job as baseline
- webhook support for Microsoft Graph where available
- durable storage for mappings
- secrets through environment variables or a vault

## Risks

- CalDAV recurrence behavior can be fiddly.
- Graph subscriptions require lifecycle renewal and error handling.
- Cross-provider field mapping must be narrowed to avoid surprises.

## Recommended first slice

Implement only:

- create/update/delete
- timed events
- all-day events
- private blocker payloads
- one recurrence strategy that is tested before broadening scope

## Spike outcome

Verdict: preferred target architecture.
