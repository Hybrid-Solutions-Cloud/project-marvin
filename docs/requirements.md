# Product Requirements

## Target Behavior

Project Marvin is supposed to become one fully automated calendar-sync product that can be deployed once and then run continuously.

## Functional Requirements

1. Any connected calendar can originate a meeting or accepted invite.
2. Marvin mirrors that event to every other connected calendar.
3. Mirrored events are private by default.
4. Selected target calendars, such as family calendars, can receive full detail instead.
5. Every mirrored event carries the source calendar prefix, such as `WORK:`, `CONTRACT:`, or `FAMILY:`.
6. Timezone behavior follows the source event instead of being hardcoded.
7. Account setup must be simple and should validate whether the provider is actually ready.
8. Ongoing management must allow adding, removing, and updating calendars and mirror policy.
9. Deployment must be scriptable.
10. Microsoft 365, Outlook, and Google are in scope. Apple / CalDAV remains optional.

## Product-Level Implications

Those requirements force Marvin to own:

- provider connection state
- source-to-target route policy
- loop prevention and event mapping
- background execution
- deployment automation
- management UX

## Current Implementation Status On July 29, 2026

Implemented now:

- Marvin-branded onboarding shell and management console
- generated profile model with source prefixes
- private-by-default target rules
- family-calendar overrides
- ongoing account-management proof for add, edit, reload, and remove flows across Outlook and Apple / CalDAV account types through Marvin-owned APIs
- timezone-preserving mirror payload planning
- connection-state assessment in the profile loader and setup flow
- Marvin-owned Microsoft and Google OAuth launch and callback flow
- local token storage, provider-secret storage, and runtime-status storage under `.marvin/`
- on-demand refresh for expired Microsoft and Google tokens when local provider app settings exist
- Marvin-managed provider-side mirror markers for Google and Microsoft mirrored events
- source-load loop prevention for Marvin-managed mirrored events
- dry-run, mock-sync, live-adapter smoke, and daemon smoke verification
- first live CalDAV adapter smoke coverage for REPORT-based source reads and PUT-based mirror writes

Still missing:

- authoritative proof that real live calendars sync automatically across real tenants
- completed Apple / CalDAV connector implementation beyond today's REPORT/PUT adapter baseline and mocked smoke coverage
- webhook or subscription lifecycle for production-scale near-real-time sync
- fully automated provider readiness and local secret provisioning for every target tenant, while some providers still require console-side OAuth client creation
- production-grade account-management API and deployment lifecycle proof

## Verification Evidence In Repo Today

The strongest local evidence in this repo today is:

- `node scripts/smoke-marvin-onboard-api.mjs` proves Marvin-owned account creation, saved config reload, provider requirements, Microsoft OAuth callback handling, token persistence, runtime start and stop, saved Marvin account metadata, and the computed readiness summary returned through Marvin APIs
- `node scripts/smoke-marvin-ui-surface.mjs` proves the Marvin-branded setup and management shell renders with the account-first flow, Account Connections, and automation controls without falling back to old Keeper login copy
- `node scripts/smoke-marvin-account-management.mjs` proves Marvin can add, edit, reload, and remove accounts while preserving source prefixes, per-target inbound overrides, and Apple / CalDAV account settings through Marvin-owned APIs
- `node scripts/smoke-marvin-operator-journey.mjs` proves a fuller Marvin-owned operator path: Marvin account creation, multi-provider account save, Microsoft OAuth callback, Google pending validation, Apple / CalDAV validation, and runtime start/stop
- `npm run marvin:verify-local` aggregates the current local planning, runtime, artifact, and provider smoke coverage
- `npm run docs:build` proves the current documentation set renders cleanly

Those checks are still local evidence only. They do not yet prove production completion or cross-tenant live customer sync.

## Requirement Evidence Matrix

| Requirement | Current status on July 29, 2026 | Strongest repo evidence | Remaining gap |
| --- | --- | --- | --- |
| Any connected calendar can originate a meeting or accepted invite | Partially proven locally | `node scripts/smoke-marvin-live-engine.mjs` exercises source events originating from Microsoft 365, Google, and Apple / CalDAV calendars | Not yet proven against real customer-owned live calendars |
| Marvin mirrors that event to every other connected calendar | Partially proven locally | `node scripts/smoke-marvin-live-engine.mjs` now reports all six bidirectional source-target pairs across three calendars | Not yet proven in real always-on deployed runtime |
| Mirrored events are private by default | Partially proven locally | `node scripts/smoke-marvin-live-engine.mjs` asserts four private mirrored targets and private payload behavior in Graph and CalDAV writes | Not yet proven against real tenant data and real viewer permissions |
| Selected target calendars can receive full detail instead | Partially proven locally | `node scripts/smoke-marvin-live-engine.mjs` asserts two default-visibility family-style targets with copied location and description; `node scripts/smoke-marvin-account-management.mjs` proves override persistence | Not yet proven in real customer calendars |
| Every mirrored event carries the source calendar prefix | Proven locally | `node scripts/smoke-marvin-live-engine.mjs` asserts preserved prefixes and emits `prefixesPreserved: true`; `node scripts/smoke-marvin-account-management.mjs` proves edited prefixes persist | Not yet proven in real tenant-backed provider writes observed end-to-end |
| Timezone behavior follows the source event | Proven locally | `node scripts/smoke-marvin-live-engine.mjs` asserts preserved source timezones for both `America/New_York` and `UTC`, while `node scripts/smoke-marvin-microsoft-timezone.mjs` proves Marvin normalizes Microsoft Graph wall-time events with provider timezone metadata instead of flattening them to UTC incorrectly | Not yet proven with real travel or provider edge cases |
| Account setup must be simple and validate provider readiness | Partially proven locally | `node scripts/smoke-marvin-ui-surface.mjs`, `node scripts/smoke-marvin-onboard-api.mjs`, `node scripts/smoke-marvin-operator-journey.mjs`, and `node scripts/smoke-marvin-connection-validation.mjs` cover Marvin-owned setup, connect/validate flow, OAuth callbacks, automation controls, validation APIs, and readiness-summary next-step guidance | Still not proven as finished production UX across real tenants and hosted runtime |
| Ongoing management must allow add, remove, and update | Proven locally | `node scripts/smoke-marvin-account-management.mjs` proves add, edit, reload, and remove flows including Apple / CalDAV settings and overrides, while `node scripts/smoke-marvin-ui-surface.mjs` proves the management console exposes the operator-facing controls | Not yet proven in a real deployed multi-user environment |
| Deployment must be scriptable | Partially proven locally | `node scripts/smoke-marvin-deploy-plan.mjs`, `npm run marvin:azure:plan`, and the Azure deployment scripts prove scripted plan generation | Full production deployment and operations proof is still missing |
| Microsoft 365, Outlook, Google are in scope, Apple optional | Partially proven locally | Live and onboarding smokes cover Microsoft, Outlook alias handling, Google, and Apple / CalDAV adapter paths | Real end-to-end customer proof across all providers is still missing |

## Acceptance Standard For Done

This repo should only claim the product is done when:

- a deployed Marvin instance can connect real calendars
- new and updated events propagate automatically in both directions
- privacy rules are enforced per target
- source prefixes are preserved
- timezone behavior is correct
- the operator can manage calendars and policies without editing JSON manually


