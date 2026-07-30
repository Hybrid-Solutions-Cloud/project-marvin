# Getting Started

Paranoid Keeper is the calendar-sync product in the Project Marvin repository. It mirrors every connected calendar to every other connected calendar after one setup flow.

## Start locally

```powershell
npm run marvin:install
npm run marvin:ui
```

Open `http://127.0.0.1:4177`.

## First-run flow

1. Create one Workspace Account for the deployment.
2. Add each Microsoft 365, Outlook, Google, or Apple / CalDAV calendar.
3. Give each calendar a source prefix, such as `WORK: ` or `FAMILY: `.
4. Add Microsoft or Google OAuth app credentials only for providers you use. Add an Apple CalDAV URL and app password per Apple calendar.
5. Link every provider account and run **Check All Calendars**.
6. When every calendar validates, Paranoid Keeper starts its background runtime automatically.

No solution picker and no manual sync command are needed after setup.

## Default behavior

- Every connected calendar is a source and mirrors to every other connected calendar.
- Copies retain subject, location, description, and source timezone.
- Copies are `private` by default.
- The source prefix is prepended to the copied subject.
- A family target can be changed to normal visibility and different detail rules in **Privacy Rules** or on that target calendar.
- Managed mirrors are marked so they are never re-ingested and looped back.

## Hosted Azure path

```powershell
npm run marvin:azure:plan
npm run marvin:azure:deploy -- `
  -SubscriptionId <subscription-guid> `
  -WorkloadName marvin `
  -Environment dev `
  -RegionShort wus3 `
  -Instance 01 `
  -Location westus3
```

The deployment creates one always-on Container App, Azure Files state, Log Analytics, and a build registry. Open the resulting HTTPS URL and complete the same first-run flow. The browser URL is persisted as the OAuth callback base URL.

## Provider notes

- Microsoft 365 and Outlook use Microsoft Graph OAuth, subscriptions, and webhook wake-ups.
- Google uses Google OAuth, event watches, and webhook wake-ups.
- Apple / CalDAV uses its server URL and app password. It is synchronized by the always-on poll interval because generic CalDAV has no universal webhook protocol.

## Verification

```powershell
npm run marvin:smoke-live
npm run marvin:smoke-onboard-api
npm run marvin:smoke-ui-surface
npm run marvin:smoke-subscriptions
npm run marvin:smoke-runtime-webhook-wake
npm run docs:build
```

See [Architecture](/architecture), [Paranoid Keeper](/solutions/paranoid-keeper), and [Azure deployment](/solutions/marvin-azure).