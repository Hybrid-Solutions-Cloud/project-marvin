# Paranoid Keeper on Azure

The first hosted deployment uses a single Azure Container App with `minReplicas: 1`.

## Resources

- Azure Container Registry for the image build
- Log Analytics workspace
- Storage account and Azure Files share for persistent state
- Container Apps environment
- One public Container App on port `4177`

The runtime has readiness and liveness checks against `/marvin-api/status`. Azure Files is mounted at `/data`, so workspace accounts, OAuth tokens, mappings, and subscription state survive restarts.

## Deploy

```powershell
npm run marvin:azure:plan
npm run marvin:azure:deploy -- `
  -SubscriptionId <subscription-guid> `
  -WorkloadName marvin `
  -Environment dev `
  -RegionShort wus3 `
  -Instance 01 `
  -Location westus3
```

No tenant IDs, subscription IDs, calendar credentials, or OAuth secrets belong in this public repository. Enter provider credentials in the hosted setup UI. The setup UI records its HTTPS browser origin as the provider callback base URL.

## After deploy

1. Open the returned HTTPS URL.
2. Create the Workspace Account.
3. Add accounts, link provider identities, and validate all calendars.
4. Paranoid Keeper starts automatically when validation succeeds.

See [Getting Started](/getting-started) for the provider-specific setup flow.