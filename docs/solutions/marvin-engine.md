# Marvin Engine

## Summary

Marvin Engine is the repo's first-party sync engine and the primary product path for Project Marvin.
It is the code path intended to satisfy the user's core requirements:

- fully automated background sync
- bidirectional mirroring from any connected calendar
- Microsoft 365, Outlook, Google, and optional Apple / CalDAV support
- private-by-default mirrored events
- per-target visibility, detail, location, and description overrides
- per-source subject prefixes
- timezone-correct mirrored events
- real provider auth and connected-account validation
- simple installer, setup, and management

## What exists now on July 29, 2026

Implemented now:

- shared profile loader
- shared runtime-context loader for profile, tokens, provider secrets, adapters, and engine state
- file-backed token-state loader
- file-backed local provider-secret loader
- file-backed local runtime-status store
- route planning and mirror policy generation
- per-source prefixes
- per-target visibility and detail rules
- connected-account state in calendar profiles
- validated provider-auth-material gating so a calendar must be marked connected and have real token or credential state before live source loading, writes, or stale-mirror cleanup can run
- computed readiness summaries, ready-versus-action-required stats, and per-account next-action hints for the Marvin management console
- timezone-preservation metadata in mirror payloads and mappings
- file-backed mapping store
- dry-run mode
- mock apply mode
- local Microsoft and Google auth launch/callback persistence in Marvin onboarding
- default generated Marvin Engine profiles now omit Bureaucratic Flow / Power Platform runtime metadata unless that reference track is explicitly chosen
- local token-state persistence under `.marvin/tokens/*.tokens.json`
- on-demand refresh-token exchange for expired Microsoft and Google tokens when Marvin has local provider client secrets
- runtime persistence of refreshed access and refresh tokens back into `.marvin/tokens/*.tokens.json`
- live Microsoft Graph source reads, mirror writes, and stale-mirror deletes in the mocked runtime path
- live Google Calendar source reads, mirror writes, and stale-mirror deletes in the mocked runtime path
- live Apple / CalDAV REPORT-based source reads plus PUT/DELETE mirror lifecycle support in the mocked runtime path
- Apple / CalDAV credential validation helpers for manual provider validation
- onboarding-API support for separate Apple / CalDAV app passwords per calendar account
- a daemon-style automated local runtime that can run recurring live sync cycles and persist status under `.marvin/runtime/*.runtime.json`
- runtime process control helpers for starting, stopping, and inspecting the local daemon
- automatic active-profile resolution from `.marvin/latest.json` for runtime CLI helpers
- automatic derived event-fixture resolution for dry-run and mock-apply CLI commands
- automatic saved-account resolution for solution artifact generation
- Marvin mirror markers on provider-side mirrored events
- loop prevention for previously mirrored target events by filtering Marvin-managed mirrored events during source-event ingestion
- stale-mirror cleanup when a previously synced source event no longer exists on a successfully loaded source calendar

Not implemented or not yet proven:

- fully verified live tenant-to-tenant sync against real customer-owned calendars
- production-safe encryption for stored local tokens and provider secrets
- production-grade long-term token lifecycle controls beyond on-demand refresh
- webhook/subscription renewal
- a production management API boundary
- full production deployment and operations proof for Marvin's final runtime lifecycle

## Architecture

### Current engine flow

1. Marvin profile defines calendars, prefixes, privacy defaults, and routes. On the default Marvin Engine path, that generated profile carries Marvin runtime deployment and provider-connection state without automatically embedding Bureaucratic Flow runtime metadata.
2. Source events are loaded from fixture JSON or provider adapters.
3. Planner expands every source event into per-target operations.
4. Policy engine computes private or visible mirror payloads per target.
5. Provider adapters read or refresh credentials as needed, then perform live writes or stale-mirror deletes.
6. Mapping state is written to disk after mock or live apply.
7. When a source event disappears and the source calendar was loaded from a ready provider connection, Marvin removes the stale mirrored targets and deletes their mappings.
8. Refreshed token state is written back into `.marvin/tokens/*.tokens.json`.
9. The optional daemon runner repeats that cycle on an interval and records runtime status in `.marvin/runtime/*.runtime.json`.

### Current policy model

The engine currently supports:

- `sourcePrefix` on each calendar
- `connectionStatus` on each calendar
- adapter-level auth-material readiness per calendar
- per-target `visibility`
- per-target `detailMode`
- optional location and description copying
- preserved source timezone metadata
- Marvin-managed mirror metadata for provider-side loop prevention

### Example outcomes

- A work calendar event is mirrored to a contract calendar as `WORK: Subject`, private by default.
- The same work event is mirrored to a family calendar with fuller visibility if that route allows it.
- A Google-originated or Apple-originated event is mirrored back into Microsoft 365 with its source prefix preserved.

## Repo files

- `profiles/marvin.schema.json`
- `profiles/marvin.example.json`
- `solutions/marvin-engine/src/core/planner.mjs`
- `solutions/marvin-engine/src/core/policy.mjs`
- `solutions/marvin-engine/src/core/sync-engine.mjs`
- `solutions/marvin-engine/src/daemon.mjs`
- `solutions/marvin-engine/src/adapters/*.mjs`
- `solutions/marvin-engine/src/storage/*.mjs`
- `solutions/marvin-engine/src/util/*.mjs`
- `scripts/setup-marvin.ps1`
- `scripts/build-calendar-options.mjs`
- `scripts/smoke-marvin-live-engine.mjs`
- `scripts/smoke-marvin-daemon-once.mjs`
- `scripts/smoke-marvin-onboard-caldav.mjs`
- `scripts/smoke-marvin-onboard-api.mjs`

## Hosted deployment

Marvin now has a first-party Azure Container Apps deployment path:

```powershell
npm run marvin:azure:deploy -- 
  -SubscriptionId <subscription-guid> 
  -WorkloadName marvin 
  -Environment dev 
  -RegionShort wus3 
  -Instance 01 
  -Location westus3
``` 

That deployment builds `Dockerfile.marvin`, deploys `infra/marvin-azure.bicep`, mounts persistent Marvin state into the container, and runs hosted Marvin with runtime auto-start enabled.

See [Marvin on Azure](/solutions/marvin-azure).

## Commands

Fixture-driven planning and mock apply:

```powershell
npm run marvin:dry-run
npm run marvin:apply-mock
```

Those commands now follow Marvin's latest saved Marvin account and its matching `.events.json` file automatically unless explicit overrides are provided.

Provider-backed source loading and live apply:

```powershell
npm run marvin:source-live:dry-run
npm run marvin:source-live:apply-live
```

Those commands now follow Marvin's latest saved Marvin account automatically unless a specific `--profile` override is provided.

Automated local runtime:

```powershell
npm run marvin:daemon
npm run marvin:runtime:start
npm run marvin:runtime:status
npm run marvin:runtime:stop
```

Those commands now follow Marvin's latest saved Marvin account automatically unless a specific `--profile` override is provided.

Adapter and runtime smoke tests with mocked provider responses:

Unified local verification entrypoint:

```powershell
npm run marvin:verify-local
```

```powershell
npm run marvin:smoke-live
npm run marvin:smoke-live-readiness
npm run marvin:smoke-daemon
npm run marvin:smoke-runtime-manager
npm run marvin:smoke-caldav
npm run marvin:smoke-onboard-caldav
npm run marvin:smoke-caldav-live
npm run marvin:smoke-delete-cleanup
npm run marvin:smoke-doctor
npm run marvin:smoke-onboard-api
npm run marvin:smoke-auth-gating
npm run marvin:smoke-operator-journey
npm run marvin:smoke-account-management
npm run marvin:smoke-connection-validation
npm run marvin:smoke-create-operator
npm run marvin:smoke-runtime-latest
npm run marvin:smoke-cli-latest
npm run marvin:smoke-artifacts-latest
```

## Verification done on July 29, 2026

The current engine and runtime were verified with:

```powershell
npm run marvin:smoke-live
npm run marvin:smoke-live-readiness
npm run marvin:smoke-daemon
npm run marvin:smoke-onboard-caldav
npm run marvin:smoke-caldav-live
```

The `marvin:smoke-live` output now also surfaces: bidirectional source-target pair coverage, visibility-mode counts, preserved timezone sources, and explicit prefix preservation.

That verification now proves:

- the Marvin browser surface exposes the Setup Assistant, Management Console, one Calendars management list, and automation controls instead of the older Keeper login copy
- Marvin can refresh saved setup state back into the UI, validate per-calendar live access from the same Calendars management list, and compute operator-facing readiness steps for unfinished accounts
- Marvin now proves that protected config access is blocked after logout and restored only after a valid Marvin workspace login
- Marvin now has a fuller local operator-journey smoke covering Marvin account creation, multi-provider account save, Microsoft callback auth, Google pending validation, Apple / CalDAV direct validation, and runtime start/stop
- Marvin now proves that a non-interactive workspace-account record can be created ahead of browser setup and that doctor guidance exposes that path for fresh-clone onboarding

- bidirectional provider pairs are exercised across Microsoft, Google, and Apple / CalDAV targets in the mocked runtime path
- calendars that are disconnected or missing validated provider auth material are skipped during live source loading, live writes, and stale-mirror cleanup, so Marvin no longer calls provider adapters for calendars that are not actually ready
- per-source prefixes are emitted into payloads and persisted mappings
- private-by-default target policy is represented with four private mirrored targets in the current live-engine smoke
- family and custom per-calendar target overrides are represented with two default-visibility mirrored targets in the current live-engine smoke
- source timezone metadata is preserved in payloads and mappings for both `America/New_York` and `UTC` source events
- Microsoft and Google adapters can ingest source events and perform live write request construction in the mocked runtime path
- Microsoft and Google adapters can refresh expired tokens in the mocked runtime path and persist refreshed tokens back into Marvin's local token store
- Apple / CalDAV can validate credentials through Marvin's shared validation helpers
- Apple / CalDAV can perform REPORT-based source loading and PUT-based mirror writes in the mocked runtime path
- Marvin can remove stale mirrored target events through Google, Microsoft, and CalDAV delete calls when a source event disappears from a successfully loaded source calendar
- the daemon-style local runtime can execute a three-provider sync cycle, persist runtime status, and record the last result for later inspection
- Marvin can start, stop, and inspect the local daemon process through shared runtime-manager helpers
- Marvin skips previously mirrored target events during provider source loading
- Marvin also skips mirrored target events when the provider-side Marvin marker exists even without a local mapping file

It does **not** prove real customer-owned provider sync yet.

## Recommendation

If the goal is the actual Marvin product, this is the path to keep building.
Keeper and the other repo tracks should be treated as references or interim bridges, not as Marvin's finished product boundary.





