# Marvin Onboarding UI

## Goal

The Marvin UI is the product-owned front door for the Marvin workspace account that owns the linked calendars, provider credentials, and automation state:

- creating the Marvin workspace account on first run and signing back in later
- adding, editing, and removing calendar accounts
- assigning per-source prefixes
- defining per-calendar inbound overrides for mirrored visibility, detail, location, and description
- defining private-by-default mirror policy
- allowing family-calendar detail overrides
- showing whether a provider is actually ready for sign-in
- preserving per-calendar inbound override state in Marvin's saved config and generated profile
- collecting provider app settings needed for live provider-linking
- surfacing Marvin-owned provider requirements such as redirect URIs, Microsoft delegated permissions, and copyable provider-plan helper commands
- keeping provider linking Marvin-native instead of exposing the older bridge-mode auth path in the operator UI
- collecting Apple / CalDAV server settings and app-password validation data
- persisting Apple / CalDAV app passwords per calendar account in Marvin's backend state
- launching provider sign-in only when Marvin has a live provider start path
- capturing Microsoft and Google authorization codes back into Marvin's local state
- surfacing connection state, token state, runtime state, and computed readiness next steps in the management console
- keeping first-run setup, returning-user sign-in, and ongoing account management inside the same Marvin browser surface
- keeping add, edit, remove, link, relink, and validation actions on one calendar-management list in the console instead of splitting them across duplicate cards
- supporting non-interactive pre-creation of the Marvin workspace account through `npm run marvin:create-operator` when deployment automation needs the account record before browser setup begins

## Current operator flow on July 29, 2026

1. Create the Marvin workspace account on first run, or sign in with it when you return to Marvin later.
2. Add calendars.
3. Edit or remove existing calendars when something changes.
4. Set mirror rules.
5. Apply optional per-calendar inbound overrides where a target calendar should behave differently from the global rule.
6. Save the generated Marvin workspace configuration and local `.marvin` state.
7. Open the management console after setup is saved.
8. Enter provider access settings in Marvin.
9. Use Marvin's Provider Access panel to refresh the Microsoft or Google setup plan when you need the exact helper command, redirect URI, start URL, or first setup step without leaving the product.
10. While adding or editing a calendar, Marvin now shows inline provider guidance so the operator knows whether Step 3 needs Microsoft or Google app settings, or whether Apple / CalDAV credentials are entered directly in the calendar form.
11. Connect each provider account from Marvin's single Calendars management list after Marvin setup has been saved.
12. Marvin now auto-refreshes local state for a short window after it opens Microsoft or Google provider sign-in.
13. Use `Refresh Marvin State` if you want an explicit manual reload or if the callback completed outside Marvin's polling window.
14. Review the Marvin Workspace card plus each calendar card's Setup saved, Access setup, Link status, and Last checked fields to confirm Marvin is actually ready.
15. For Apple / CalDAV accounts, Marvin validates credentials directly instead of redirecting to OAuth.
16. Start or stop the Marvin runtime and monitor its status from Marvin after setup has been saved.

## What the UI stores and shows

The current UI stores and shows:

- provider
- calendar role
- email
- edit state for existing calendars
- optional tenant ID
- source prefix
- inbound override state for calendars that need custom target behavior
- connection-state summary
- readiness summary with per-account next actions, recommended operator actions, ready-versus-action-required counts, batch validation, and automation-start readiness
- shorter operator-facing status labels so the calendar list reads like a product console instead of a raw state dump
- clearer card fields such as Setup saved, Access setup, Link status, Access token, and Apple password
- a clearer Step 3 flow that focuses on save settings, refresh provider setup plans, link accounts, validate access, and only then start automation
- a console layout where one Calendars list holds inventory, linking, relinking, validation, edit, and remove actions together
- token-state summary
- per-account token status and reason
- per-account auth-request, callback-received, linked-account, and last-validation timestamps or notes when Marvin has them
- whether Microsoft and Google client secrets are already stored locally
- whether the Apple / CalDAV app password is already stored locally
- the configured CalDAV server URL and username
- Marvin workspace summary state such as active account ID, timezone, sync window, and automation state
- automation process state such as whether the daemon is alive, its PID, and when it was started or stopped
- runtime status such as last run, last completion time, and last sync result when a daemon status file exists

## Provider linking behavior

Microsoft and Google sign-in starts from Marvin-owned endpoints:

- `/marvin-api/oauth/microsoft/start`
- `/marvin-api/oauth/google/start`

Those endpoints either:

- redirect to the real provider authorize URL when Marvin has the required client ID
- refuse the launch with a Marvin-rendered error page when the provider runtime is incomplete

That means Marvin no longer sends users into any legacy external login screen when a provider is not actually configured, and Marvin now blocks connect attempts earlier when access settings are still missing.

## Local state files

The onboarding flow currently persists:

- generated setup config under `.marvin/*.setup.json`
- provider app secrets under `.marvin/provider-secrets/*.secrets.json`
- connection state under `.marvin/connections/*.connections.json`
- token state under `.marvin/tokens/*.tokens.json`
- runtime status under `.marvin/runtime/*.runtime.json`

If callback-time token exchange cannot finish yet, Marvin records a pending or error token state instead of dropping the provider response.

## Current validation level

Local validation now proves all of the following:

- Marvin can save provider app settings through its own setup/config API
- Marvin now gates provider linking, validation, and runtime controls on saved Marvin setup instead of only checking the account ID field
- Marvin can generate the same local setup-state shape through `npm run marvin:setup`
- Marvin can redirect a Microsoft or Google account-link request to the real provider OAuth authorize URL without relying on shell environment variables
- Marvin can use the locally stored Microsoft or Google client secret during callback-time token exchange
- Marvin can persist a connected Microsoft token/connection record after a Marvin-owned OAuth callback instead of only storing a pending auth session
- Marvin can validate multiple Apple / CalDAV accounts independently when each account has its own stored app password
- Marvin can read daemon/runtime status back through `/marvin-api/runtime-status` for the management console
- Marvin can start and stop the local daemon process through Marvin-owned runtime control endpoints
- Marvin can serve the actual Marvin homepage and onboarding API correctly even when Marvin state is stored outside the repo root
- Marvin can keep the operator inside Marvin-owned setup and management flows instead of defaulting back to a legacy bridge login screen
- Marvin can add, edit, and remove managed calendar accounts through the same onboarding and management API surface
- Marvin can persist and reload edited source prefixes plus inbound override state through that same account-management flow
- Marvin can add and reload Apple / CalDAV account settings through the same account-management API surface
- Marvin can refresh its saved connection state back into the UI after an external OAuth callback
- Marvin can show provider-auth progress in the UI while the operator returns from Microsoft or Google sign-in
- Marvin can expose provider requirements back to the UI and to local setup scripts through Marvin-owned config and API state
- Marvin can show the saved Marvin workspace ID, timezone, sync window, automation state, and runtime controls inside the management console instead of relying only on bootstrap state
- Marvin now blocks the Start Automation action until every calendar is linked and validated, and surfaces that rule in both Step 3 and the management console
- Marvin can check live provider access from the same Calendars management list instead of relying only on stored names or pending token records
- Marvin can batch-check every saved calendar from one Marvin action and return a mixed linked/pending/invalid summary to the management console

Dummy client IDs or secrets still fail at the provider as expected, but the failure now happens at the provider authorize or token endpoint instead of earlier in Marvin. That proves Marvin is using the saved local provider settings. Marvin no longer advertises or depends on the older bridge-mode auth path in the current UI flow.

## What it still does not prove

The onboarding UI is materially better, but it does not prove full product completion.
The repo still does not yet guarantee:

- live multi-provider sync verification against real customer-owned calendars across all supported providers
- production deployment and operations proof for the full Marvin runtime lifecycle
- final production-safe secret handling for hosted Marvin runtimes

## Documentation rule

The docs should present Marvin UI as the real configuration surface, while stating clearly when a provider or runtime path is still only smoke-verified rather than production-proven.

## Apple / CalDAV behavior

Apple / CalDAV currently uses Marvin-side manual validation instead of OAuth.

That means:

- the operator enters CalDAV server URL, username, and app password in Marvin
- Marvin stores the app password only in local `.marvin/` state
- `Connect` on an Apple / CalDAV account triggers Marvin to validate those credentials against the configured CalDAV server
- a successful validation marks the calendar connected in Marvin

As of July 29, 2026, Marvin's onboarding API and browser UI can store and validate separate Apple / CalDAV app passwords per calendar account, and Marvin's live-engine smokes also cover CalDAV event read/write behavior through the first-party adapter.







