# Getting Started

## Start here

If you cloned the repo and want the shortest path to a working Marvin instance, do this first:

```powershell
npm run marvin:install
npm run marvin:ui
```

Then follow the one supported first-run path inside Marvin:

1. Create or review the Marvin admin sign-in.
2. Set the Marvin workspace ID, timezone, and sync window.
3. Add every calendar Marvin should manage.
4. Confirm or edit the source prefix for each calendar.
5. Choose the private-by-default mirror rules and any family-calendar overrides.
6. Add optional per-calendar inbound overrides when a specific target calendar should receive different visibility or detail behavior.
7. Save Marvin setup.
8. Enter the Microsoft and Google calendar access settings Marvin needs for the calendars you actually added.
9. Authenticate each calendar from Marvin's Connected Calendars area. Marvin will auto-refresh local auth state for a short window after it opens provider sign-in.
10. Refresh Marvin state manually if needed, then validate live access.
11. Review the Marvin Admin card to confirm the saved account name, internal account ID, timezone, sync window, and automation state.
12. Start Marvin automation.
13. Return to the management console later to add, edit, reconnect, or remove calendars.

## What works today

As of July 29, 2026, the repo supports:

- Marvin-branded first-run setup UI and management console
- Marvin admin summary inside the management console for active account ID, timezone, sync window, and automation state
- scripted local setup generation through `npm run marvin:setup`
- calendar inventory with provider, role, email, tenant ID, and source prefix
- private-by-default mirror policy generation
- per-calendar inbound override generation for visibility, detail, location, and description
- account-management proof for adding, editing, reloading, and removing calendars through Marvin APIs, including updated source prefixes and per-target overrides
- family-calendar detail overrides in the generated profile
- bidirectional route generation between every configured calendar pair
- timezone-preserving mirror payload planning
- local live-engine proof for privacy defaults, family overrides, prefixes, and per-source timezone preservation across Microsoft, Google, and Apple / CalDAV adapter writes
- focused Microsoft timezone normalization proof for Graph events that arrive as local wall time plus provider timezone metadata
- provider readiness assessment for Microsoft, Google, and Apple / CalDAV`r`n- recommended per-calendar Marvin actions in the management console so setup does not depend on guessing whether to connect, edit, or validate next`r`n- one-click batch validation across all saved calendars from Marvin
- Marvin-owned Microsoft and Google OAuth start and callback endpoints
- Marvin-side Apple / CalDAV validation using server URL, username, and app password
- per-calendar Apple / CalDAV app-password storage in Marvin's onboarding API and profile/config pipeline
- Apple / CalDAV account-management proof through the same Marvin account add/edit/reload flow used by Microsoft, Outlook, and Google accounts
- local provider app configuration stored under `.marvin/provider-secrets/*.secrets.json`
- local connection-state persistence under `.marvin/connections/*.connections.json`
- local token-state persistence under `.marvin/tokens/*.tokens.json`
- local daemon/runtime status persistence under `.marvin/runtime/*.runtime.json`
- on-demand Microsoft and Google token refresh during live runtime operations when local client secrets exist
- live Microsoft, Google, and Apple / CalDAV adapter smoke coverage
- stale-mirror cleanup for previously synced target events when the source event disappears from a successfully loaded source calendar
- a daemon-style local runtime entrypoint for recurring sync cycles
- runtime process control from Marvin and from scripts
- loop prevention by skipping Marvin-managed mirrored target events during provider source loading

## What is still incomplete

The repo still does not prove final product completion.
These gaps still exist:

- fully verified end-to-end live sync against real customer-owned Microsoft, Google, and Apple / CalDAV accounts
- production-grade encryption and secret-management hardening for local state
- fully verified zero-touch provider app creation for every Microsoft or Google tenant
- production deployment and operations proof for Marvin's final always-on runtime lifecycle

## First local run

```powershell
npm run marvin:install
```

That install path handles dependencies, runs Marvin's bootstrap/setup verification, scaffolds Marvin's account configuration and local state, and then leaves the repo ready for the Marvin setup UI. The primary Marvin install and bootstrap path does not prompt for a Keeper bridge URL. The installer can also accept the same first-run account inputs that the lower-level bootstrap/setup scripts accept. The primary scripts now expose `-WorkspaceId` and `-WorkspaceEmail` aliases for the older parameter names.

If you want the install flow without the full local verification pass:

```powershell
npm run marvin:install -SkipVerify
```

If you want a fully scripted first run instead of answering prompts in the UI, call the installer directly with your account inputs:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\install-marvin.ps1 `
  -WorkspaceId marvin-home `
  -WorkspaceEmail you@example.com `
  -NoPrompt `
  -WorkEmail you@work.example.com `
  -ContractEmail you@contract.example.com `
  -GoogleEmail you@gmail.com `
  -FamilyEmail family@gmail.com
```

If dependencies are already installed, you can skip that step and run the bootstrap script directly:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap-marvin.ps1 -SkipNpmInstall
```

The lower-level setup-only command is still available when you intentionally want just the profile/state generator:

```powershell
npm run marvin:setup
```

## Provider apps and account linking

Marvin owns the provider sign-in start URLs for Microsoft and Google.
If a provider client ID is missing, Marvin marks that calendar as `Connector Not Ready` and does not send the user into an external dead-end flow.

Recommended local flow:

1. Start Marvin at `http://localhost:4177` unless you overrode `MARVIN_UI_PORT`.
2. Open the management console.
3. Enter Microsoft and/or Google client IDs and client secrets in Marvin's Calendar Access section.
   If you want Marvin to generate the Microsoft app-registration plan for you first, run `pwsh -ExecutionPolicy Bypass -File .\scripts\register-marvin-entra-app.ps1 -ProfileName <profile> -EmitOnly`.
   If you want Marvin to generate the Google app-registration plan first, run `pwsh -ExecutionPolicy Bypass -File .\scripts\register-marvin-google-app.ps1 -ProfileName <profile> -EmitOnly`.
4. If you use Apple / CalDAV, enter the CalDAV server URL, username, and app password when you add that Apple calendar account.
5. Save Marvin setup.
6. Open Marvin's Connected Calendars area only after Marvin setup has been saved, authenticate each provider, let Marvin auto-refresh the returned auth state, and then use `Refresh Marvin State` manually if needed before running `Validate Access`.
7. Check the Marvin Admin card in the console to confirm Marvin saved the correct account details, internal account ID, timezone, sync window, and hosted or local automation state.
8. If an existing calendar needs changes, use Marvin's edit flow from the calendar list instead of rebuilding the Marvin account configuration by hand.

The provider client secrets are stored only in Marvin's local `.marvin/` state, not in tracked repo files.
Google still requires the actual OAuth client to be created in Google Cloud Console, but Marvin now generates the exact redirect URI, scope list, console links, and can persist the returned client ID and secret into Marvin state once you have them.

Environment variables are still accepted as a fallback, but they are no longer the only local path:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Apple / CalDAV does not use Marvin-owned OAuth today.
Marvin validates CalDAV credentials directly against the configured server URL.

## Hosted Azure run

If you want Marvin hosted on Azure Container Apps instead of only running locally, review the dry-run deployment plan first:

```powershell
npm run marvin:azure:plan -- 
  -SubscriptionId <subscription-guid> 
  -WorkloadName marvin 
  -Environment dev 
  -RegionShort wus3 
  -Instance 01 
  -Location westus3
```

Then run the actual deployment:

```powershell
npm run marvin:azure:deploy -- 
  -SubscriptionId <subscription-guid> 
  -WorkloadName marvin 
  -Environment dev 
  -RegionShort wus3 
  -Instance 01 
  -Location westus3
``` 

Then open the deployed Marvin URL, create the Marvin account, add calendars, configure provider apps, authenticate the calendars from Marvin, refresh Marvin state, validate access, and then start automation.

See [Marvin on Azure](/solutions/marvin-azure).

## Automated runtime

To run Marvin as a recurring local sync daemon:

```powershell
npm run marvin:daemon
```

That entrypoint runs recurring source-live and apply-live cycles, skips Marvin-managed mirrored target events during source loading, removes stale mirrored targets when their source events disappear from successfully loaded calendars, writes status to `.marvin/runtime/*.runtime.json`, and follows the latest saved Marvin profile automatically when you do not pass `--profile`.

The management console can read that runtime state through Marvin's local runtime-status API and now start or stop the local daemon process from Marvin itself, but only after Marvin setup has been saved.

You can also control the local daemon from scripts:

```powershell
npm run marvin:runtime:start
npm run marvin:runtime:status
npm run marvin:runtime:stop
```

Those commands now resolve the active Marvin profile from `.marvin/latest.json` unless you explicitly pass `--profile`.

## Verification path

Once setup is saved, verify the generated profile and runtime behavior:

Fast path:

```powershell
npm run marvin:verify-local
```

That runs the current saved-state planning, mock-apply, bootstrap, runtime, CLI, artifact, and local sync-behavior verification flow from Marvin state.

The planning, mock-apply, live CLI, and artifact-generation commands now resolve the active Marvin profile from `.marvin/latest.json` unless you explicitly pass overrides.

```powershell
npm run marvin:dry-run
npm run marvin:apply-mock
npm run marvin:source-live:dry-run
npm run marvin:source-live:apply-live
npm run marvin:smoke-live
npm run marvin:smoke-microsoft-timezone
npm run marvin:smoke-daemon
npm run marvin:smoke-deploy-plan
npm run marvin:smoke-caldav
npm run marvin:smoke-onboard-caldav
npm run marvin:smoke-caldav-live
npm run marvin:smoke-delete-cleanup
npm run marvin:smoke-doctor
npm run marvin:smoke-onboard-api
npm run marvin:smoke-operator-journey
npm run marvin:smoke-account-management
npm run marvin:smoke-connection-validation
npm run marvin:smoke-entra-plan
npm run marvin:smoke-google-app-plan
npm run marvin:smoke-bootstrap
npm run marvin:smoke-install
npm run marvin:smoke-runtime-latest
npm run marvin:smoke-cli-latest
npm run marvin:smoke-artifacts-latest
```

Inspect:

- `profiles/*.json`
- `profiles/*.events.json`
- `artifacts/marvin-engine/*.mappings.json`
- `.marvin/*.setup.json`
- `.marvin/provider-secrets/*.secrets.json`
- `.marvin/connections/*.connections.json`
- `.marvin/tokens/*.tokens.json`
- `.marvin/runtime/*.runtime.json`

`npm run marvin:smoke-onboard-api` now verifies that a Marvin-owned Microsoft OAuth callback can exchange an authorization code against a local mock token endpoint, persist a connected token/connection record for the management console, and feed the auth-state details the UI uses during provider linking.

`npm run marvin:smoke-doctor` now verifies that Marvin's repo-level health report exposes the local verification commands, hosted deployment plan, and next-step guidance from the saved Marvin account state.

`npm run marvin:smoke-operator-journey` now verifies a fuller local operator path: create the Marvin account, save Microsoft/Google/Apple accounts, keep Google pending until auth, validate Apple / CalDAV directly, complete Microsoft callback auth, and start then stop the Marvin runtime.`r`n`r`n`npm run marvin:smoke-batch-validation` now verifies Marvin's one-shot calendar validation sweep: a connected Microsoft calendar, a connected Apple / CalDAV calendar, and a still-pending Google calendar are all summarized back through Marvin's own batch validation API.

## Where to read next

If the goal is the actual Marvin product, continue with:

- [Requirements](/requirements)
- [Architecture](/architecture)
- [Marvin Engine](/solutions/marvin-engine)
- [Marvin on Azure](/solutions/marvin-azure)
- [Onboarding UI](/operator/onboarding-ui)

If you need the reference and comparison tracks:

- [Solutions](/solutions)
- [Paranoid Keeper](/solutions/paranoid-keeper)
- [Bureaucratic Flow](/solutions/bureaucratic-flow)
- [Credits](/credits)







