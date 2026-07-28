# Project Marvin

Project Marvin is a mildly resentful laboratory for solving calendar sprawl.

Like its namesake, it exists because the universe insists on being badly organized.
The repo now presents four solution tracks:

- `solutions/paranoid-keeper/`: Keeper-based multi-provider deployment
- `solutions/bureaucratic-flow/`: Power Automate and Outlook flow strategy
- `solutions/google-hub/`: OutlookGoogleCalendarSync with Google as the visibility hub
- `solutions/marvin-engine/`: first-party custom sync service prototype

## Shared profile and fixtures

- `profiles/marvin.example.json`
- `profiles/marvin.example.events.json`

## Generate solution artifacts

```powershell
npm run solutions:build
```

## Run all local tests

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all-solutions.ps1
```

## Run the first-party engine dry run

```powershell
npm run marvin:dry-run
```

## Tone

The repo speaks in the voice of Marvin: competent, tired, and unimpressed by unnecessary complexity.
Because apparently calendar synchronization needed a personality disorder as well.
