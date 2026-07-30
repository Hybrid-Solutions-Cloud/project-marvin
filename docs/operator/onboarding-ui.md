# Paranoid Keeper Onboarding

Paranoid Keeper has one browser surface for both first-run setup and ongoing calendar management. Project Marvin is the repository name; it is not a second account, product, or setup choice.

## First Run

1. Open Paranoid Keeper.
2. Create the Paranoid Keeper workspace account for this deployment.
3. Add every calendar account and give each a source prefix.
4. Choose a calendar type: Microsoft 365, Outlook, Google Calendar, or Apple / CalDAV.
5. Link Microsoft and Google accounts through OAuth. For Apple / CalDAV, enter the CalDAV server URL, username, and app password.
6. Select **Check All Calendars**. A connection must authenticate and validate before it joins the sync mesh.
7. Review default privacy settings. Mirrors are private and copy full details by default. Change trusted family targets to normal visibility only where desired.
8. When every account validates, Paranoid Keeper starts its always-on runtime automatically.

## Management Console

Return to the same application at any time to add, edit, relink, validate, or remove calendars. The console shows connection state, latest sync status, and the effective per-target privacy policy. There is no deployment picker, solution picker, or legacy Keeper login page.

## Provider Requirements

Microsoft and Google OAuth require a provider application client ID and secret. The console shows the exact redirect URL for the deployment. Apple Calendar uses the Apple CalDAV endpoint and an app-specific password, not OAuth.

The public repository never stores provider secrets, calendars, tenants, or subscription identifiers. Hosted deployments persist runtime state in their configured private state store.

## Automation

Microsoft Graph subscriptions and Google event watches notify Paranoid Keeper of changes; the daemon wakes early for those notifications and renews subscriptions. Apple / CalDAV has no general webhook protocol, so it is checked at the configured interval. The same mirror rules apply regardless of the source calendar.