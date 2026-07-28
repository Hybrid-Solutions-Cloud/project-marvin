# Solutions

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

Test commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\validate.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\test.ps1
```

### Bureaucratic Flow

Based on `MShekow/outlook-calendar-sync`.

This is the proof-of-concept solution when the main problem is Microsoft 365 talking to Microsoft 365 through Power Automate.

Test commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\bureaucratic-flow\test.ps1
```

### Google Hub Of Last Resort

Based on `OutlookGoogleCalendarSync`.

This is the fallback when you are willing to let Google Calendar act as a central availability hub for Outlook calendars.

Test commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\google-hub\test.ps1
```

## First-party solution

### Marvin Engine

This is the custom service prototype in this repo.

It provides:

- provider adapters
- policy handling
- mapping storage
- dry-run planning
- mock apply mode for deterministic local testing

Test commands:

```powershell
npm run marvin:dry-run
powershell -ExecutionPolicy Bypass -File .\solutions\marvin-engine\test.ps1
```

## Shared input

All solution tracks share:

- `profiles/marvin.example.json`
- `profiles/marvin.example.events.json`

Generate concrete artifacts with:

```powershell
npm run solutions:build
```

Run the whole local test pass with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all-solutions.ps1
```
