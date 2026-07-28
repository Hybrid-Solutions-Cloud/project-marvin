# Marvin Engine

This is the first-party custom sync service skeleton for Project Marvin.

It does not claim to solve everything yet. It does provide a coherent local foundation:

- profile loading
- route planning
- privacy policy application
- adapter boundaries for Microsoft Graph, Google Calendar, and CalDAV
- file-backed mapping storage
- dry-run execution

## Run the dry run

```powershell
npm run marvin:dry-run
```

## Intended direction

- implement provider auth and API calls
- persist real source-to-target mappings
- add scheduled reconciliation and webhook processing
- turn dry-run planning into actual event synchronization
