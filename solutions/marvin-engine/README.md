# Marvin Engine

This is the first-party custom sync service prototype for Project Marvin.

It is still a mock-backed implementation, but it now does more than stare into the void:

- profile loading
- source event loading from fixtures
- route planning
- privacy policy application
- adapter boundaries for Microsoft Graph, Google Calendar, and CalDAV
- file-backed mapping storage
- dry-run execution
- mock apply mode that writes deterministic mappings

## Commands

```powershell
npm run marvin:dry-run
powershell -ExecutionPolicy Bypass -File .\solutions\marvin-engine\test.ps1
```

## Current limitation

Adapters are still stubs. The engine is ready for local testing of planning and mapping behavior, not live provider writes yet.
