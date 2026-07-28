# Azure Deployment Plan

## 1. Summary

Deploy `Paranoid Keeper` to Azure Container Apps as an always-on hosted service for Project Marvin.

This plan intentionally avoids committing any real tenant identifiers, subscription identifiers, secrets, domains, or account-specific values because this repository is public.

## 2. Status

Ready for Validation

## 3. Deployment Goal

- Host Keeper in Azure Container Apps
- Keep one replica always running
- Persist Keeper state on Azure Files
- Configure public ingress for the Keeper UI
- Inject provider secrets at deployment time only
- Keep all Azure context selection outside committed repo files

## 4. Scope

### In scope

- Azure resource group creation or reuse
- Azure Storage account and Azure Files share creation
- Azure Container Apps environment creation or reuse
- Azure Container App deployment using Bicep plus a runtime-only PowerShell wrapper
- Local validation of docs and deployment assets
- Runtime-only selection of tenant and subscription

### Out of scope

- Committing any real Azure tenant or subscription identifiers
- Committing OAuth client secrets
- Automating third-party provider consent flows inside Microsoft 365 or Google
- Production backup and monitoring setup beyond the first hosted pilot

## 5. Architecture

### Runtime

- Azure Container Apps
- Single app container using `ghcr.io/ridafkih/keeper-standalone:2.9`
- `minReplicas: 1`
- `maxReplicas: 1`

### State

- Azure Files share mounted to `/var/lib/postgresql/data`

### Secrets

- Keeper secrets supplied from the local `.env` file at deploy time
- No secrets stored in committed repo files

## 6. Inputs Required Before Live Sync Testing

### Required for deployment

- Azure CLI authenticated to the intended subscription
- Local Keeper `.env` file present

### Required for live Microsoft 365 testing

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

### Optional for Google testing

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## 7. Execution Plan

1. Confirm the target Azure subscription at runtime.
2. Validate the Bicep template, wrapper script, and docs locally.
3. Deploy Keeper infrastructure to Azure Container Apps using Bicep with runtime parameters only.
4. Verify the Azure Container App endpoint is reachable.
5. If Microsoft OAuth credentials are present, sign into Keeper and test a live calendar connection.
6. If credentials are missing, use placeholder provider secrets only for infrastructure smoke testing and report the remaining blocker.

## 8. Validation Steps

- `npm run docs:build`
- Bicep build validation for `infra/keeper-azure.bicep`
- PowerShell parse validation for `solutions/paranoid-keeper/deploy-azure-container-app.ps1`
- Azure CLI context check
- Keeper endpoint reachability check after deployment

## 9. Validation Proof

Pending

## 10. Risks

- Missing provider OAuth credentials prevent live sync testing
- Azure CLI may be pointed at the wrong subscription if not confirmed before deployment
- Keeper still requires first-time provider sign-in and route setup in its UI

## 11. Approval Gate

User explicitly approved the Azure deployment path and requested Bicep-based deployment.
