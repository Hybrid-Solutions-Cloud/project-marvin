# Marvin Engine

## Summary

Marvin Engine is the first-party service path in this repo.
It is the long-term ownership strategy and the place where a real product UI and backend should eventually converge.

## Design

### Problem fit

Use this solution when:

- you want one product-owned path
- you want the GUI onboarding idea to become real
- you want consistent auth, policy, mapping, and observability under one codebase

### Architecture

Current components:

- shared profile loader
- source event fixtures
- planner
- privacy policy builder
- file-backed mapping store
- adapter boundaries for Graph, Google, and CalDAV
- dry-run mode
- mock apply mode

Future components:

- live provider OAuth handlers
- token storage
- real provider read and write methods
- scheduler
- webhook receiver
- UI frontend

### Data flow

1. Marvin onboarding collects profile data.
2. Marvin Engine loads profile and source events.
3. Planner creates source-to-target operations.
4. Policy engine converts source events into private mirror payloads.
5. Adapter layer writes to real providers.
6. Mapping store tracks source and target event IDs.

## Implementation

### Repo files

- `solutions/marvin-engine/src/cli.mjs`
- `solutions/marvin-engine/src/core/planner.mjs`
- `solutions/marvin-engine/src/core/policy.mjs`
- `solutions/marvin-engine/src/core/sync-engine.mjs`
- `solutions/marvin-engine/src/adapters/*.mjs`

### Current runtime behavior

The engine currently supports:

- dry-run planning
- mock apply output
- deterministic mapping generation

It does not yet support live provider writes.

## How To Use

### Fast path

```powershell
npm install
npm run marvin:dry-run
npm run marvin:apply-mock
powershell -ExecutionPolicy Bypass -File .\solutions\marvin-engine\test.ps1
```

### What to inspect

- generated operations in dry-run output
- mapping file under `artifacts/marvin-engine/`
- source profile and event fixture files

## Testing plan

### Current prototype test

- validate route planning logic
- validate payload privacy behavior
- validate target mapping generation
- validate cross-provider operation planning

### Future live test

- connect one M365 account first
- implement and validate Graph write path
- add Google and CalDAV only after M365 baseline is stable

## Recommendation

This is the solution to invest in if you want a real Marvin product.
