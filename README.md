# Project Marvin

Project Marvin is a mildly resentful product path for solving calendar sprawl.

Like its namesake, it exists because the universe insists on being badly organized.
The primary repo path is Marvin itself: one onboarding flow, one management console, and one automated multi-calendar sync runtime.

Reference material for `Paranoid Keeper`, `Bureaucratic Flow`, and `Google Hub Of Last Resort` still exists in this repo, but those are no longer the main place a new user should start.

## Fast start

Fresh clone path:

```powershell
npm run marvin:install
npm run marvin:ui
```

Or pass your first-run setup values directly into the installer:

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

The install flow bootstraps Marvin from a fresh clone, runs the local setup generator, and then leaves the repo ready for the Marvin UI. The normal Marvin install and bootstrap path no longer asks for a Keeper bridge URL. After setup, `npm run marvin:doctor` gives you a repo-level health report showing setup, provider, connection, runtime, and next verification-path gaps.

If dependencies are already installed and you only want to scaffold Marvin locally:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\bootstrap-marvin.ps1 -SkipNpmInstall
```

## Hosted Azure

If you want one hosted Marvin runtime on Azure Container Apps, review the computed resource names and runtime shape first:

```powershell
npm run marvin:azure:plan -- -SubscriptionId <subscription-guid> -WorkloadName marvin -Environment dev -RegionShort wus3 -Instance 01 -Location westus3
```

Then run the actual deployment:

```powershell
npm run marvin:azure:deploy -- -SubscriptionId <subscription-guid> -WorkloadName marvin -Environment dev -RegionShort wus3 -Instance 01 -Location westus3
```

## Shared profile system

- Example profile: `profiles/marvin.example.json`
- Example events: `profiles/marvin.example.events.json`
- Schema: `profiles/marvin.schema.json`
- Local onboarding script: `scripts/setup-marvin.ps1`
- Local bootstrap entrypoint: `scripts/bootstrap-marvin.ps1`

## Other commands

```powershell
npm run solutions:build
npm run marvin:dry-run
npm run marvin:apply-mock
npm run marvin:source-live:dry-run
npm run marvin:source-live:apply-live
npm run marvin:smoke-bootstrap
npm run marvin:smoke-install
npm run marvin:smoke-runtime-latest
npm run marvin:smoke-cli-latest
npm run marvin:smoke-artifacts-latest
npm run marvin:smoke-ui-surface
npm run marvin:smoke-doctor
npm run marvin:smoke-onboard-api
npm run marvin:smoke-operator-journey
npm run marvin:smoke-account-management
npm run marvin:smoke-connection-validation
npm run marvin:smoke-entra-plan
npm run marvin:smoke-live
npm run marvin:smoke-daemon
npm run marvin:smoke-deploy-plan
npm run marvin:azure:plan -- -SubscriptionId <subscription-guid> -WorkloadName marvin -Environment dev -RegionShort wus3 -Instance 01 -Location westus3
npm run marvin:verify-local
npm run docs:build
```

`npm run marvin:verify-local` now covers the fresh-clone install path, saved-Marvin-account generation, runtime/CLI/artifact flows, the Marvin browser surface, doctor guidance, the onboarding API, callback-time OAuth token exchange against a local mock provider, the fuller Marvin operator journey, persisted connection/token state, account-management behavior, connection-refresh/validation behavior, the Entra app-registration plan path, and Marvin's local privacy/prefix/timezone sync-behavior checks.

## Tone

The repo speaks in the voice of Marvin: competent, tired, and unimpressed by unnecessary complexity.
Because apparently calendar synchronization needed a personality disorder as well.


