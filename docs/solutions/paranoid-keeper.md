# Paranoid Keeper

## Summary

Paranoid Keeper is the lead external solution for Project Marvin.
It is based on `keeper.sh` and is the best fit when you want broad provider support with the least painful long-term operating model.

## Design

### Problem fit

Use this solution when:

- you need Microsoft 365 and Google together
- Apple or CalDAV support is still in scope
- you want a self-hosted runtime rather than a desktop tool or tenant-only flow

### Architecture

Components:

- local Marvin profile
- generated Keeper sync plan
- Keeper container runtime
- OAuth provider connections inside Keeper
- operator-driven route configuration in Keeper UI

### Data flow

1. Marvin onboarding collects calendar inventory and routes.
2. Marvin generator writes Keeper-specific artifacts.
3. Keeper runs locally through Docker.
4. Operator binds provider accounts in Keeper.
5. Keeper executes the real synchronization.

## Implementation

### Repo files

- `solutions/paranoid-keeper/compose.yaml`
- `solutions/paranoid-keeper/setup-env.ps1`
- `solutions/paranoid-keeper/validate.ps1`
- `solutions/paranoid-keeper/test.ps1`
- `artifacts/solutions/<profile>/paranoid-keeper/sync-plan.md`

### Environment requirements

- Docker Desktop or compatible Docker runtime
- OAuth client IDs and secrets for Microsoft and optionally Google
- network access to provider endpoints

### Validation model

The repo validation checks:

- profile readability
- compose file presence
- optional Docker presence warning or strict failure
- local `.env` readiness

## How To Use

### Fast path

```powershell
npm install
npm run marvin:onboard
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\test.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\start.ps1
```

### Then do this

1. Fill in real OAuth values in `solutions/paranoid-keeper/.env`.
2. Start the stack.
3. Open the Keeper UI.
4. Connect Microsoft and Google accounts.
5. Recreate the route plan from the generated sync plan.
6. Test with a 1 to 3 day date window.

## Testing plan

### First pilot

- create one meeting in work calendar
- verify blocker event appears in contract and Google targets
- modify the time
- verify the update propagates
- delete the meeting
- verify the mirrored blocker is removed

## Risks

- OAuth registration complexity
- provider-specific recurrence behavior
- operator route configuration still occurs inside Keeper UI rather than fully from Marvin

## Recommendation

If you want a real pilot first, start here.
