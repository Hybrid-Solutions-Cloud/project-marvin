# Deploy Keeper to Azure Container Apps

Azure Container Apps is the primary hosted deployment target for Keeper in Project Marvin.

This is the first-class path when you want:

- always-on container hosting
- scripted deployment
- persistent Keeper state
- Microsoft 365 plus Google support in one hosted runtime

## What this deployment does

The repo deployment script:

1. reads your local Keeper `.env`
2. creates or reuses an Azure resource group
3. creates an Azure Storage account and Azure Files share
4. creates or reuses an Azure Container Apps environment
5. links the Azure Files share into that environment
6. deploys `ghcr.io/ridafkih/keeper-standalone:2.9`
7. mounts persistent storage at `/var/lib/postgresql/data`
8. configures ingress on port `80`
9. pins the app to `minReplicas: 1` and `maxReplicas: 1`
10. updates `TRUSTED_ORIGINS` to the final Azure Container Apps FQDN

## Prerequisites

- Azure subscription with rights to create resource groups, storage accounts, and container apps
- Azure CLI installed
- `az login` completed
- local Keeper `.env` created from the repo
- Microsoft OAuth credentials in `.env`
- Google OAuth credentials in `.env` if you want Google destinations

## Prepare the local env file

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\setup-env.ps1
```

Then edit `solutions/paranoid-keeper/.env`.

Required values:

- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

Optional values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Deploy

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\deploy-azure-container-app.ps1 `
  -ResourceGroupName marvin-keeper-rg `
  -Location eastus `
  -EnvironmentName marvin-keeper-env `
  -AppName marvin-keeper
```

## Optional parameters

### Add extra trusted origins

Use this if you plan to put Keeper behind a custom domain later.

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\deploy-azure-container-app.ps1 `
  -ResourceGroupName marvin-keeper-rg `
  -Location eastus `
  -EnvironmentName marvin-keeper-env `
  -AppName marvin-keeper `
  -AdditionalTrustedOrigins "https://keeper.example.com"
```

### Use a specific subscription

```powershell
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\deploy-azure-container-app.ps1 `
  -SubscriptionId <subscription-guid> `
  -ResourceGroupName marvin-keeper-rg `
  -Location eastus `
  -EnvironmentName marvin-keeper-env `
  -AppName marvin-keeper
```

## After deployment

1. Open the returned `https://...azurecontainerapps.io` URL.
2. Sign in to Keeper.
3. Connect Microsoft 365 accounts.
4. Connect Google accounts if you need them.
5. Recreate the sync routes from `artifacts/solutions/<profile>/paranoid-keeper/sync-plan.md`.
6. Test create, update, and delete propagation with one calendar pair first.

## Operational notes

### Persistence

Keeper state is mounted on Azure Files.

That matters because the standalone Keeper image stores persistent state under `/var/lib/postgresql/data`.

### Availability

This deployment sets:

- `minReplicas: 1`
- `maxReplicas: 1`

That keeps one replica running continuously instead of scale-to-zero behavior.

### Secrets

The current script stores secrets in Azure Container Apps app secrets.

For stricter production controls, move those secrets into Azure Key Vault later and rotate them there.

### Custom domain

The first script pass deploys against the generated ACA FQDN.

If you later front it with a custom domain, redeploy with `-AdditionalTrustedOrigins` so Keeper accepts that origin.

## When to prefer Azure App Service instead

Use App Service only if:

- your organization already mandates App Service
- your operations team already standardizes on it
- you are willing to do extra work around container storage expectations

For Project Marvin, Azure Container Apps remains the better default.

## References

- [Azure Container Apps with `az containerapp up`](https://learn.microsoft.com/en-us/azure/container-apps/containerapp-up)
- [Azure Container Apps storage mounts](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts)
- [Azure Files mount tutorial for Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts-azure-files)
- [Azure Container Apps environment variables](https://learn.microsoft.com/en-us/azure/container-apps/environment-variables)
- [Azure Container Apps secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets)
