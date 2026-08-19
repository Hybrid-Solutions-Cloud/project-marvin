# Azure Deployment Plan

## 1. Summary

Prepare the Project Marvin runtime for Azure Container Apps.

## 2. Status

In progress under the active user-approved build goal.

## 3. Architecture

- One Azure Container App, kept at one replica for always-on synchronization.
- One Azure Container Apps environment with Log Analytics.
- One Storage account and Azure Files share mounted at `/data` for profiles, OAuth tokens, mappings, runtime status, and subscription state.
- One Azure Container Registry built by the deployment script from `Dockerfile.marvin`.
- Public HTTPS ingress on port `4177` for the initial setup and management UI, OAuth callbacks, and Microsoft/Google webhook endpoints.

## 4. Runtime Behavior

- First-run setup creates the workspace account and links Microsoft 365/Outlook, Google Calendar, and Apple/CalDAV calendars.
- The browser origin is persisted as the OAuth callback base URL; no localhost callback is used after Azure deployment.
- Successful validation of every configured account automatically starts the Project Marvin daemon.
- Microsoft and Google wake the daemon through provider webhooks; Apple/CalDAV is polled by the always-on daemon.

## 5. Security and Public-Repo Rules

- No subscription IDs, tenant IDs, domains, OAuth client secrets, or calendar credentials are committed.
- Provider credentials are entered during setup and persisted only in the mounted runtime state.
- Registry credentials are passed as secure deployment parameters and are not written to source files.

## 6. Required Runtime Inputs

- Azure CLI authenticated to the intended subscription.
- Deployment-time subscription, location, workload, environment, region short name, and instance supplied as command parameters.
- Microsoft and Google OAuth application credentials supplied in the hosted UI before those providers can authenticate.
- Apple app password and CalDAV URL supplied per Apple calendar in the hosted UI.

## 7. Planned Validation

- `node --check scripts/marvin-onboard-server.mjs`
- `node --check operator-ui/public/app.js`
- `npm run marvin:smoke-live`
- `npm run marvin:smoke-onboard-api`
- `npm run marvin:smoke-ui-surface`
- `az bicep build --file infra/marvin-azure.bicep`
- PowerShell syntax/plan validation for `solutions/marvin-engine/deploy-azure-container-app.ps1`

## 8. Deployment Command

`npm run marvin:azure:deploy -- -SubscriptionId <subscription-guid> -WorkloadName <workload> -Environment <dev|stg|prd> -RegionShort <region-short> -Instance <nn> -Location <azure-region>`

## 9. Risks

- Provider administrator consent and OAuth credentials are external to the deployment and cannot be fabricated by the installer.
- Apple/CalDAV does not offer a universal webhook protocol, so it uses the running daemon poll interval.
- A live Azure deployment requires a currently available Container Apps environment region and the intended subscription context.
