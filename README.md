# Project Marvin

Project Marvin is a mildly resentful laboratory for solving calendar sprawl.

Like its namesake, it exists because the universe insists on being badly organized.
The repo presents four solution tracks:

- `solutions/paranoid-keeper/`: Keeper-based multi-provider deployment
- `solutions/bureaucratic-flow/`: Power Automate and Outlook flow strategy
- `solutions/google-hub/`: OutlookGoogleCalendarSync with Google as the visibility hub
- `solutions/marvin-engine/`: first-party custom sync service prototype

## Fast start

Fresh clone path:

```powershell
npm install
npm run marvin:onboard
npm run solutions:test
```

That onboarding flow creates a local profile, generates per-solution artifacts, and prepares the Keeper `.env` placeholder file.

## Shared profile system

- Example profile: `profiles/marvin.example.json`
- Example events: `profiles/marvin.example.events.json`
- Schema: `profiles/marvin.schema.json`
- Local onboarding script: `scripts/setup-marvin.ps1`

## Other commands

```powershell
npm run solutions:build
npm run marvin:dry-run
npm run marvin:apply-mock
npm run docs:build
```

## Tone

The repo speaks in the voice of Marvin: competent, tired, and unimpressed by unnecessary complexity.
Because apparently calendar synchronization needed a personality disorder as well.
