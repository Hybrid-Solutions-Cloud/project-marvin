# Solutions

## Start Here

If you are here as an operator, this is the shortest path:

1. Run `npm install`
2. Run `npm run marvin:onboard`
3. Run `npm run solutions:test`
4. Choose **one** solution below

If you do not know which one to choose, start with:

- [Paranoid Keeper](/solutions/paranoid-keeper)

## Important clarification

`Marvin Engine` is **not** the installer for the other three solutions.

Instead:

- `Paranoid Keeper` is a Keeper-based external solution
- `Bureaucratic Flow` is a Power Automate external solution
- `Google Hub Of Last Resort` is an OGCS external solution
- `Marvin Engine` is the repo's own custom engine path

## One onboarding flow

Every solution starts from one source of truth:

- generated profile JSON
- generated event fixture JSON
- solution-specific rendered artifacts

Run this first from a fresh clone:

```powershell
npm install
npm run marvin:onboard
npm run solutions:test
```

## GUI direction

The long-term product direction is documented here:

- [Onboarding UI Architecture](/operator/onboarding-ui)

## Solution guides

### Paranoid Keeper

Use this first if you want the most practical pilot path.

- [Paranoid Keeper](/solutions/paranoid-keeper)

### Bureaucratic Flow

Use this if you specifically want Power Automate and Microsoft 365.

- [Bureaucratic Flow](/solutions/bureaucratic-flow)

### Google Hub Of Last Resort

Use this only if the Google bridge model is acceptable.

- [Google Hub Of Last Resort](/solutions/google-hub)

### Marvin Engine

Use this if you want the repo's custom engine path and understand that it is still prototype-oriented for live integrations.

- [Marvin Engine](/solutions/marvin-engine)

## Shared input

All solution tracks share:

- `profiles/marvin.example.json`
- `profiles/marvin.example.events.json`
- generated local profiles from `scripts/setup-marvin.ps1`

Run the whole local test pass with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all-solutions.ps1
```
