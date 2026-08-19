# Project Marvin

Project Marvin is a mildly resentful product path for solving calendar sprawl.

Published documentation: https://labs.hybridsolutions.cloud/project-marvin/

Like its namesake, it exists because the universe insists on being badly organized.
**Project Marvin** is the supported calendar synchronization application: one onboarding flow, one management portal, and one **Marvin Engine** synchronization runtime. Bureaucratic Flow, Google Hub Of Last Resort, and older solution tracks are references only.

## Fast start

Fresh clone path:

```powershell
npm run marvin:install
$env:MARVIN_DEV_AUTH_ENABLED='true'
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

Open `http://127.0.0.1:4177` and select **Local development sign-in**. This endpoint is loopback-only and is disabled whenever hosted mode is enabled. Hosted deployments use Microsoft Entra.

The install flow bootstraps Project Marvin from a fresh clone and leaves the repository ready for the portal. After setup, `npm run marvin:doctor` reports setup, provider, connection, runtime, and verification gaps.

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

Bind and validate your custom DNS name and TLS certificate, then redeploy with `-PublicBaseUrl https://<your-hostname>`. That final origin becomes authoritative for portal sign-in, provider callbacks, and webhooks.

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
npm run marvin:azure:plan -- -SubscriptionId <subscription-guid> -WorkloadName marvin -Environment dev -RegionShort wus3 -Instance 01 -Location westus3 -PublicBaseUrl https://<your-hostname>
npm run marvin:verify-local
npm run docs:build
```

`npm run marvin:verify-local` covers installation, the deterministic portal build, authentication and management API contracts, encrypted credential storage, runtime and provider flows, callback-time OAuth token exchange against local mock providers, account management, connection validation, privacy, loop prevention, prefixes, timezones, Microsoft delta and recurrence contracts, explicit-tombstone delete safety, subscriptions, webhooks, and documentation.

## Tone

The repo speaks in the voice of Marvin: competent, tired, and unimpressed by unnecessary complexity.
Because apparently calendar synchronization needed a personality disorder as well.


