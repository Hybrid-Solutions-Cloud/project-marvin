# Deploy Marvin to Azure Container Apps

## Summary

This is the first-party hosted deployment path for Project Marvin as of Wednesday, July 29, 2026.

Use this path if you want:

- one always-on hosted Marvin runtime
- scripted Azure deployment
- persistent Marvin state across restarts
- a public Marvin UI URL for account setup and account management

## What this deployment creates

The Marvin Azure deployment script now does all of the following:

1. creates or updates the target resource group
2. creates an Azure Container Registry
3. builds `Dockerfile.marvin` into a hosted Marvin image through `az acr build`
4. deploys Log Analytics, a storage account, an Azure Files share, a Container Apps environment, and one Marvin container app through `infra/marvin-azure.bicep`
5. mounts persistent Marvin state at `/data`
6. runs Marvin in hosted mode with runtime auto-start enabled

## Current runtime shape

The hosted Marvin container runs:

- the Marvin onboarding and management UI
- the Marvin onboarding API
- the Marvin hosted bootstrap watcher
- the Marvin sync daemon after a profile is created and saved

State is written under the mounted `/data` volume rather than the container filesystem.

## Command

Review the naming and resource plan first without touching Azure:

```powershell
npm run marvin:azure:plan -- `
  -SubscriptionId <subscription-guid> `
  -WorkloadName marvin `
  -Environment dev `
  -RegionShort wus3 `
  -Instance 01 `
  -Location westus3
```

Then run the actual deployment:

```powershell
npm run marvin:azure:deploy -- `
  -SubscriptionId <subscription-guid> `
  -WorkloadName marvin `
  -Environment dev `
  -RegionShort wus3 `
  -Instance 01 `
  -Location westus3
```

The same script can be called directly. Add `-EmitPlanOnly` if you only want the computed resource names, runtime settings, and next deploy command:

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\marvin-engine\deploy-azure-container-app.ps1 `
  -SubscriptionId <subscription-guid> `
  -WorkloadName marvin `
  -Environment dev `
  -RegionShort wus3 `
  -Instance 01 `
  -Location westus3
```

## What happens after deployment

Open the returned Marvin URL and then:

Before deploying to Azure, the easiest local prereq path remains:

```powershell
npm run marvin:install
```

That gives you the same local Marvin account configuration and state shape the hosted UI expects. If you want the local bootstrap to be fully scripted, call `scripts/install-marvin.ps1` directly with `-NoPrompt` and your initial account inputs before deploying.


1. create the Marvin account
2. add calendar accounts
3. generate or create the Microsoft provider app with `pwsh -ExecutionPolicy Bypass -File .\scripts\register-marvin-entra-app.ps1 -ProfileName <profile> -MarvinBaseUrl <deployed-url>` if you want a scripted Entra path
4. enter provider app settings for Microsoft and Google
5. authenticate calendars from Marvin, refresh Marvin state, and validate access
6. confirm the runtime status in Marvin

Once the Marvin account exists, hosted Marvin auto-starts the runtime for the latest saved account.

## Files used

- `Dockerfile.marvin`
- `infra/marvin-azure.bicep`
- `solutions/marvin-engine/deploy-azure-container-app.ps1`
- `scripts/marvin-hosted.mjs`
- `scripts/marvin-onboard-server.mjs`
- `solutions/marvin-engine/src/util/runtime-process.mjs`
- `solutions/marvin-engine/src/daemon.mjs`

## Validation completed on July 29, 2026

The repo currently proves all of the following locally:

- the hosted Marvin bootstrap path starts successfully
- the hosted UI answers `/marvin-api/bootstrap`
- hosted Marvin auto-starts the runtime when `.marvin/latest.json` points at a saved Marvin account
- hosted Marvin stops the stale runtime and switches to the new latest saved account when `.marvin/latest.json` changes
- hosted Marvin stops the active runtime when the latest saved account disappears or its profile file is removed
- hosted Marvin writes runtime process and runtime status records
- hosted Marvin can stop cleanly enough for repeated smoke validation on Windows
- Marvin can emit an Azure deployment plan locally without requiring `az login` or a live Azure write
- `az bicep build --file infra/marvin-azure.bicep` succeeds

Relevant checks:

```powershell
npm run marvin:smoke-hosted
npm run marvin:smoke-bootstrap
npm run marvin:smoke-entra-plan
npm run marvin:smoke-deploy-plan
az bicep build --file .\infra\marvin-azure.bicep
```

## What is still not proven

This hosted path is materially more real now, but it still does not prove:

- real provider linking and sync validation against customer-owned Microsoft, Google, and Apple calendars from an Azure-hosted Marvin instance
- production-grade secret rotation and encryption hardening for hosted Marvin state
- final production monitoring and incident-response posture