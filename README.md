# Project Marvin

Project Marvin is a mildly resentful laboratory for solving calendar sprawl.

Like its namesake, it exists because the universe insists on being badly organized.
The repo now presents four solution tracks:

- `solutions/paranoid-keeper/`: Keeper-based multi-provider deployment
- `solutions/bureaucratic-flow/`: Power Automate and Outlook flow strategy
- `solutions/google-hub/`: OutlookGoogleCalendarSync with Google as the visibility hub
- `solutions/marvin-engine/`: first-party custom sync service skeleton

## Shared profile

- `profiles/marvin.example.json`

## Generate solution artifacts

```powershell
npm run solutions:build
```

## Run the first-party engine dry run

```powershell
npm run marvin:dry-run
```

## Tone

The repo speaks in the voice of Marvin: competent, tired, and unimpressed by unnecessary complexity.
Because apparently calendar synchronization needed a personality disorder as well.
