# Deploy Keeper to Azure Container Apps

Azure Container Apps is the primary hosted deployment target for the Marvin plus Paranoid Keeper runtime.

This is the first-class path when you want:

- always-on container hosting
- scripted deployment
- Marvin as the public front door
- Paranoid Keeper as the backend sync engine
- Microsoft 365 with optional Google support in one hosted runtime

## What this deployment does

The repo deployment script:

1. reads your local Keeper `.env`
2. creates or reuses the standards-based resource group
3. creates or reuses an Azure Container Registry for the Marvin UI image
4. builds the Marvin UI image from the local repo
5. deploys Log Analytics, PostgreSQL Flexible Server, Container Apps environment, and the hosted runtime through Bicep
6. runs `marvin-ui`, `keeper`, and `redis` in the same Container App
7. exposes Marvin on the public URL and keeps Keeper behind `/keeper`
8. pins the runtime to `minReplicas: 1` and `maxReplicas: 1`
9. updates `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` to the final Azure Container Apps URL

## Preferred repo flow

```powershell
npm install
npm run marvin:ui
```

Then open `http://localhost:4177`, create the Marvin operator account, save the profile, and deploy the hosted runtime.

## Prerequisites

- Azure subscription with rights to create resource groups, Azure Container Registry, PostgreSQL Flexible Server, and Container Apps
- Azure CLI installed
- `az login` completed
- local Keeper `.env` created from the repo
- Microsoft OAuth credentials in `.env`
- Google OAuth credentials in `.env` if you want Google destinations

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

1. create or reuse the Marvin operator account
2. review the calendar profile and sync plan
3. continue into provider linking through the embedded Keeper path
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

That keeps the runtime continuously available.
