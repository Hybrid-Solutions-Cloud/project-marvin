# Architecture Direction

## Product objective

Project Marvin is supposed to become one product-owned sync service that keeps multiple calendars aligned without leaking sensitive meeting details across work, contracting, family, and personal contexts.

The required behavior is:

- any connected calendar can originate an event
- the event is mirrored to the other connected calendars
- mirrored events are private by default
- selected target calendars can receive fuller visibility, such as family calendars
- mirrored events carry a per-source prefix so the origin remains obvious
- source timezone behavior is preserved instead of hardcoding one display timezone
- the entire system runs continuously once deployed

## Canonical model

Use one central Marvin sync engine with a mapping store and provider adapters.
Do not daisy-chain sync products together as the final architecture.

### Core entities

- `calendar account`
  - provider
  - address
  - tenant or server identity
  - connected-account status
  - source prefix
- `route`
  - source calendar
  - destination calendars
  - per-target visibility policy
  - per-target detail policy
  - per-target prefix override when needed
- `mapping`
  - source event identity
  - target event identity
  - last fingerprint
  - timezone metadata
  - last sync timestamp

## Mirror policy

Every mirrored event should be computed from:

- source event data
- source calendar prefix
- target visibility rule
- target detail rule
- timezone preservation rule

### Default target policy

- visibility: `private`
- detail mode: `subject`
- subject format: `<SOURCE_PREFIX><SUBJECT>`
- location: stripped unless allowed
- description: stripped unless allowed

### Family override example

A family calendar may use:

- visibility: `default`
- detail mode: `full`
- location: copied
- description: copied when allowed

## Engine responsibilities

Marvin Engine is intended to own:

- provider auth and token lifecycle
- source event ingestion
- normalization across providers
- bidirectional route planning
- loop prevention
- create, update, and delete propagation
- recurrence handling
- mapping persistence
- health reporting
- installer and deployment automation
- operator onboarding and management UI

## Current implementation status on July 29, 2026

Implemented now:

- richer Marvin profile model
- per-source prefixes
- per-target visibility and detail rules
- connected-account state in the profile
- timezone preservation metadata in mirror payloads and mappings
- provider readiness and connection-state assessment in Marvin
- Marvin-owned Microsoft and Google OAuth start/callback flow
- Marvin-owned Apple / CalDAV credential validation with per-account app passwords
- local setup, token, provider-secret, connection, and runtime state under `.marvin/`
- live Microsoft, Google, and Apple / CalDAV adapter smoke coverage
- stale-mirror cleanup across Microsoft, Google, and Apple / CalDAV targets when a source event disappears from a successfully loaded source calendar
- daemon-style recurring sync loop with runtime-status persistence
- initial Marvin-owned Microsoft subscription lifecycle with local renewal state and webhook receipt recording
- local scripted setup generation through `setup-marvin.ps1`

Not implemented or not yet proven:

- fully verified live customer-owned provider sync across all supported calendars
- recurrence-specific proof beyond the current general event path
- full provider webhook processing parity beyond the initial local Microsoft subscription receiver
- production-safe secret storage and encryption for final runtime deployments
- full production deployment and operations proof for Marvin's final always-on lifecycle

## Transition position of Keeper

`Paranoid Keeper` remains a reference and interim hosting track in this repo.
It is not Marvin's final product boundary.

The target architecture remains Marvin at the product, policy, auth, and sync-engine layers.
