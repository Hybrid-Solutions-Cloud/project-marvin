# Solutions

## Start Here

If you are here as an operator, this is the shortest path:

1. Run `npm install`
2. Run `npm run marvin:onboard`
3. Run `npm run solutions:test`
4. Choose **one** solution below

If you do not know which one to choose, start with:

- [Paranoid Keeper](/solutions/paranoid-keeper)

## Automation reality check

Not every path in this repo satisfies the same level of automation.

| Solution | Fully unattended after setup | Best fit |
| --- | --- | --- |
| Paranoid Keeper on always-on host | Yes | Microsoft 365 plus Google and future Apple/CalDAV |
| Bureaucratic Flow | Yes | Microsoft 365 across one or more tenants |
| Google Hub Of Last Resort | No | desktop fallback only |
| Marvin Engine | No | prototype path |

## Important clarification

`Marvin Engine` is **not** the installer for the other solutions.

Instead:

- `Paranoid Keeper` is the cross-provider hosted service path
- `Bureaucratic Flow` is the Power Automate path
- `Google Hub Of Last Resort` is the desktop fallback path
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

## Recommended solution guides

### Paranoid Keeper

Use this if you need one automated hosted service across Microsoft 365 and Google.

- [Paranoid Keeper](/solutions/paranoid-keeper)
- [Keeper Hosting Matrix](/solutions/paranoid-keeper-hosting)
- [Deploy Keeper to Azure Container Apps](/solutions/paranoid-keeper-azure)

### Bureaucratic Flow

Use this if you specifically want Power Automate and Microsoft 365.

- [Bureaucratic Flow](/solutions/bureaucratic-flow)

### Google Hub Of Last Resort

This remains documented, but it does **not** satisfy the fully unattended requirement.

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
