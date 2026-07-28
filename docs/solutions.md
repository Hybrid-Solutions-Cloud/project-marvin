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

Folder:

- `solutions/paranoid-keeper/`

### Bureaucratic Flow

Based on `MShekow/outlook-calendar-sync`.

This is the proof-of-concept solution when the main problem is Microsoft 365 talking to Microsoft 365 through Power Automate.

Folder:

- `solutions/bureaucratic-flow/`

### Google Hub Of Last Resort

Based on `OutlookGoogleCalendarSync`.

This is the fallback when you are willing to let Google Calendar act as a central availability hub for Outlook calendars.

Folder:

- `solutions/google-hub/`

## First-party solution

### Marvin Engine

This is the custom service skeleton in this repo.

It provides:

- provider adapters
- policy handling
- mapping storage
- dry-run planning
- a path toward a real self-hosted sync service

Folder:

- `solutions/marvin-engine/`

## Shared artifacts

All solution tracks share:

- `profiles/marvin.example.json`

Generate concrete artifacts with:

```powershell
npm run solutions:build
```
