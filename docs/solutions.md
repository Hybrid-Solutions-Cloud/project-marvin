# Solutions

## One onboarding flow

Every solution now starts from one source of truth:

- generated profile JSON
- generated event fixture JSON
- solution-specific rendered artifacts

Run this first from a fresh clone:

```powershell
npm install
npm run marvin:onboard
npm run solutions:test
```

That gives an operator a local profile, generated artifacts, a Keeper `.env` placeholder, and a validated starting point.

## Repo Persona

This repo speaks in the voice of Marvin:

- dry
- pessimistic
- technically competent
- unimpressed by needless complexity

The point is not random novelty. The point is to make tedious infrastructure work feel deliberate.

## External-tool solutions

### Paranoid Keeper

Based on `keeper.sh`.

This is the lead external solution because it supports multi-provider automation, can grow into optional Apple Calendar support, and is self-hostable.

Commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\validate.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\test.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\start.ps1
```

What still requires operator input:

- real OAuth client IDs and secrets
- real account sign-in inside Keeper

### Bureaucratic Flow

Based on `MShekow/outlook-calendar-sync`.

This is the proof-of-concept solution when the main problem is Microsoft 365 talking to Microsoft 365 through Power Automate.

Commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\bureaucratic-flow\test.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\bureaucratic-flow\build-solution.ps1
```

What still requires operator input:

- real Outlook connector binding in Power Automate
- actual flow import or rebuild in your tenant

### Google Hub Of Last Resort

Based on `OutlookGoogleCalendarSync`.

This is the fallback when you are willing to let Google Calendar act as a central availability hub for Outlook calendars.

Commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\google-hub\test.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\google-hub\render-settings.ps1
```

What still requires operator input:

- real Outlook and Google sign-in in OGCS
- OGCS desktop runtime installed locally

## First-party solution

### Marvin Engine

This is the custom service prototype in this repo.

It provides:

- provider adapters
- policy handling
- mapping storage
- dry-run planning
- mock apply mode for deterministic local testing

Commands:

```powershell
npm run marvin:dry-run
npm run marvin:apply-mock
powershell -ExecutionPolicy Bypass -File .\solutions\marvin-engine\test.ps1
```

Current limitation:

- live provider adapters are still stubs, so this is prototype-ready rather than production-live

## Shared input

All solution tracks share:

- `profiles/marvin.example.json`
- `profiles/marvin.example.events.json`
- generated local profiles from `scripts/setup-marvin.ps1`

Run the whole local test pass with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all-solutions.ps1
```
