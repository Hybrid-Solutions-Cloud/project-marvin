# Getting Started

## Start here

If you cloned the repo and want the shortest path to a working Marvin instance, do this first:

```powershell
npm run marvin:install
npm run marvin:ui
```

If you want the Marvin workspace account created before you open the browser UI, run this once:

```powershell
npm run marvin:create-operator -- --email you@example.com --display-name "Project Marvin" --password "use-a-real-password"
```

Then follow the one supported first-run path inside Marvin:

1. Create the Marvin workspace account on first run, or sign in with it when you return later.
2. Set the Marvin workspace ID, timezone, and sync window.
3. Add every calendar Marvin should manage.
4. Confirm or edit the source prefix for each calendar.
5. Choose the private-by-default mirror rules and any family-calendar overrides.
6. Add optional per-calendar inbound overrides when a specific target calendar should receive different visibility or detail behavior.
7. Save Marvin setup.
8. Save the Microsoft and Google provider settings Marvin needs for the calendars you actually added.
9. Link each real calendar account from Marvin's Calendars list in the management console. Marvin will auto-refresh local auth state for a short window after it opens provider sign-in.
10. Refresh Marvin state manually if needed, then validate live access. Use each calendar card's Access setup, Link status, and Last checked fields to see what Marvin still needs.
11. Review the Marvin Workspace card to confirm the saved workspace account name, workspace ID, timezone, sync window, and automation state.
12. Start Marvin automation only after Marvin shows every calendar as linked and validated. You can do that from Step 3 or from the management console.
13. Return to the management console later to add calendars, edit or remove them, reconnect accounts, run access checks, adjust privacy rules, or change prefixes.

## What works today

As of July 29, 2026, the repo supports:

- Marvin-branded first-run setup UI and management console
- Marvin workspace summary inside the management console for active account ID, timezone, sync window, and automation state
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
- provider readiness assessment for Microsoft, Google, and Apple / CalDAV
- live runtime gating that refuses provider calls when a calendar is marked connected but Marvin still lacks validated token or credential material
- recommended per-calendar Marvin actions in the management console so setup does not depend on guessing whether to connect, edit, or validate next
- clearer per-calendar status fields such as Setup saved, Access setup, Link status, Access token, and Apple password
- one-click batch validation across all saved calendars from Marvin
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

After install or bootstrap completes, Marvin's scripts now point you back to the exact browser flow: open the Calendars list, finish Access setup, link each calendar, run `Check Access`, and wait for Link status to show ready before you start automation.

If you want the install flow without the full local verification pass:

```powershell
npm run marvin:install -SkipVerify
```

If you only want the Marvin workspace account pre-created before a later UI session or hosted deployment, use:

```powershell
npm run marvin:create-operator -- --email you@example.com --display-name "Project Marvin" --password "use-a-real-password"
```

That writes the Marvin operator record into local `.marvin/` state without inventing calendars yet.


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

The lower-level setup-only command is still available when you intentionally want just the profile/state generator. By default it now follows the Marvin Engine path and does not stop to ask Bureaucratic Flow / Power Platform questions unless you intentionally pass `-IncludeBureaucraticFlow`. Its printed next steps still point back to the same Marvin browser flow: open the Calendars list, finish Access setup, link calendars, run `Check Access`, and only then start automation:



```powershell
npm run marvin:setup
```

## Provider apps and account linking

Marvin owns the provider sign-in start URLs for Microsoft and Google.
If a provider client ID is missing, Marvin marks that calendar as `Connector Not Ready` and does not send the user into an external dead-end flow.

Recommended local flow:

1. Start Marvin at `http://localhost:4177` unless you overrode `MARVIN_UI_PORT`.
2. Open the management console.
3. Enter Microsoft and/or Google client IDs and client secrets in Marvin's Provider Access section. Use the redirect URIs shown in Marvin when you create the provider apps in Microsoft Entra ID or Google Cloud Console.
4. If you use Apple / CalDAV, enter the CalDAV server URL, username, and app password when you add that Apple calendar account.
5. Save Marvin setup.
6. Open Marvin's Calendars list only after Marvin setup has been saved, link each provider account, let Marvin auto-refresh the returned auth state, and then use `Refresh Marvin State` manually if needed before running `Check Access`.
7. Check the Marvin Workspace card in the console to confirm Marvin saved the correct workspace-account details, workspace ID, timezone, sync window, and hosted or local automation state.
8. If an existing calendar needs changes, use Marvin's edit flow from the calendar list instead of rebuilding the Marvin account configuration by hand.
9. Read the Access setup, Link status, and Access token lines on each calendar card before assuming a connection is ready.

The provider client secrets are stored only in Marvin's local `.marvin/` state, not in tracked repo files.
Google still requires the actual OAuth client to be created in Google Cloud Console, but Marvin can emit the exact callback URL, scopes, and follow-up command through `register-marvin-google-app.ps1`, then persist the returned client ID and secret into Marvin state once you have them.

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

Then open the deployed Marvin URL, sign in with the Marvin account you created during install or bootstrap, add calendars, configure provider apps, authenticate the calendars from Marvin, refresh Marvin state, check access, and start automation only after Marvin marks the workspace ready.

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

As of July 29, 2026, that full local verification path is green in this repo. It runs the current saved-state planning, mock-apply, bootstrap, operator creation, auth gating, runtime, CLI, artifact, documentation-command, onboarding-guidance, and local sync-behavior verification flow from Marvin state.

The planning, mock-apply, live CLI, and artifact-generation commands now resolve the active Marvin profile from `.marvin/latest.json` unless you explicitly pass overrides.

```powershell
npm run marvin:dry-run
npm run marvin:apply-mock
npm run marvin:source-live:dry-run
npm run marvin:source-live:apply-live
npm run marvin:smoke-live
npm run marvin:smoke-live-readiness
npm run marvin:smoke-microsoft-timezone
npm run marvin:smoke-daemon
npm run marvin:smoke-deploy-plan
npm run marvin:smoke-caldav
npm run marvin:smoke-onboard-caldav
npm run marvin:smoke-caldav-live
npm run marvin:smoke-delete-cleanup
npm run marvin:smoke-doctor
npm run marvin:smoke-onboard-api
npm run marvin:smoke-auth-gating
npm run marvin:smoke-operator-journey
npm run marvin:smoke-account-management
npm run marvin:smoke-connection-validation
npm run marvin:smoke-entra-plan
npm run marvin:smoke-google-app-plan
npm run marvin:smoke-bootstrap
npm run marvin:smoke-install
npm run marvin:smoke-create-operator
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

`npm run marvin:smoke-doctor` now verifies that Marvin's repo-level health report exposes the local verification commands, the non-interactive operator-creation path, the hosted deployment plan, both configured-state and zero-state next-step guidance, and the requirement-coverage summary tied to `docs/requirements.md`.

`npm run marvin:smoke-operator-journey` now verifies a fuller local operator path: create the Marvin account, save Microsoft/Google/Apple accounts, keep Google pending until auth, validate Apple / CalDAV directly, complete Microsoft callback auth, and start then stop the Marvin runtime.

`npm run marvin:smoke-batch-validation` now verifies Marvin's one-shot calendar validation sweep: a connected Microsoft calendar, a connected Apple / CalDAV calendar, and a still-pending Google calendar are all summarized back through Marvin's own batch validation API.

`npm run marvin:smoke-docs-commands` now verifies that Marvin's published docs only reference real npm scripts, real `node scripts/*` entrypoints, and real `pwsh -File .\scripts\*` paths that exist in the repo.


`npm run marvin:smoke-status-reporting` now verifies that Marvin's shared requirement-coverage model, the doctor report, the generated status page, and the evidence commands named in that model stay aligned instead of drifting apart.

`npm run marvin:smoke-onboarding-guidance` now verifies that Marvin's install, bootstrap, and setup scripts still print the same core browser-first next-step guidance instead of drifting apart over time.

`npm run marvin:smoke-bureaucratic-flow-opt-in` now verifies the opposite side of the track split: when you explicitly choose the Bureaucratic Flow reference path, Marvin still emits the expected `runtime.powerAutomate` metadata instead of dropping that track entirely.

`npm run marvin:smoke-runtime-track-split` now verifies the whole split in one place: the default example and default generated Marvin profiles omit Bureaucratic Flow runtime metadata, while the explicit Bureaucratic Flow opt-in path still emits it.

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









