# Deploy Keeper to Azure Container Apps

This page documents the **bridge-hosting reference** for Marvin plus Paranoid Keeper on Azure Container Apps.

It is useful when you need to study or compare an always-on hosted bridge pattern, but it is not the final Marvin product boundary.

## What this path is for

Use this document when you want:

- a scripted Azure deployment reference
- Marvin as the public front door
- a Keeper-style backend bridge behind Marvin
- an example of always-on hosted runtime shape on Azure

If you want the primary Paranoid Keeper product path first, read [Paranoid Keeper on Azure](/solutions/marvin-azure).

## What this deployment does

The repo deployment script:

1. reads your local bridge runtime configuration
2. creates or reuses the standards-based resource group
3. creates or reuses an Azure Container Registry for the Marvin image
4. builds the Marvin image from the local repo
5. deploys Log Analytics, PostgreSQL Flexible Server, Container Apps environment, and the hosted runtime through Bicep
6. runs `marvin-ui`, `keeper`, and `redis` in the same Container App
7. exposes Marvin on the public URL and keeps Keeper behind `/keeper`
8. pins the runtime to `minReplicas: 1` and `maxReplicas: 1`
9. updates auth and trusted-origin settings to the final Azure Container Apps URL

## Preferred repo flow

```powershell
npm install
npm run marvin:ui
```

Then open `localhost:4177`, complete the Marvin setup flow, and only use this page if you specifically want the older bridge-hosting pattern.

## Prerequisites

- Azure subscription with rights to create resource groups, Azure Container Registry, PostgreSQL Flexible Server, and Container Apps
- Azure CLI installed
- `az login` completed
- local bridge runtime configuration created from the repo
- Microsoft OAuth credentials if Microsoft calendars will participate
- Google OAuth credentials if Google calendars will participate

## Deploy from the repo

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\deploy-azure-container-app.ps1 `
  -SubscriptionId <subscription-guid> `
  -WorkloadName marvin `
  -Environment dev `
  -RegionShort wus3 `
  -Location westus3 `
  -Instance 01
```

That produces the standards-based names:

- `rg-marvin-dev-wus3-01`
- `law-marvin-dev-wus3-01`
- `psql-marvin-dev-wus3-01`
- `cae-marvin-dev-wus3-01`
- `ca-marvin-dev-wus3-01`
- `acrmarvindevwus301`

## What opens after deployment

The public URL opens **Marvin**, not Keeper.

From there:

1. sign in to Marvin
2. review the calendar profile and sync policy
3. continue provider authorization only if this bridge path is the one you intentionally chose
4. validate route behavior with a narrow test window first

## Operational notes

### Runtime layout

The hosted runtime is one Container App with three containers:

- `marvin-ui`
- `keeper`
- `redis`

Marvin is exposed publicly on port `3001`.
Keeper remains internal to the same app on port `3000` and is routed through Marvin under `/keeper`.

### Secrets

The deployment stores runtime secrets in Azure Container Apps secrets.
For stricter production controls, move those secrets into Azure Key Vault later and rotate them there.

### Availability

The deployment sets:

- `minReplicas: 1`
- `maxReplicas: 1`

That keeps the bridge runtime continuously available.
