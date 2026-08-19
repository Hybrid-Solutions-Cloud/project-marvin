# Project Marvin on Azure

_Status: Experimental reference adapter · Tracking: AB#7735, AB#7736_

The Azure reference adapter deploys a single Azure Container App with `minReplicas: 1`. It is not a requirement of the Project Marvin application and is not yet a Supported target under the [platform maturity contract](/platform-support).

## Resources

- Azure Container Registry for the image build
- Log Analytics workspace
- Storage account and Azure Files share for persistent state
- Container Apps environment
- One public Container App on port `4177`

The runtime has readiness and liveness checks against `/marvin-api/status`. Azure Files is mounted at `/data`, so workspace identity, encrypted OAuth tokens, mappings, and subscription state survive restarts. `MARVIN_DATA_PROTECTION_KEY` is stored as a Container App secret and must remain stable across upgrades.

## Deploy

For an experimental evaluation, first deploy without a custom public origin so Azure creates the Container App and generated HTTPS hostname:

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

Next, point your DNS record at the generated `azurecontainerapps.io` hostname and bind the custom hostname to the Container App with a valid certificate. After HTTPS works, redeploy with the authoritative origin:

```powershell
npm run marvin:azure:deploy -- `
  -SubscriptionId <subscription-guid> `
  -WorkloadName marvin `
  -Environment dev `
  -RegionShort wus3 `
  -Instance 01 `
  -Location westus3 `
  -PublicBaseUrl https://<your-hostname>
```

`PublicBaseUrl` makes that custom HTTPS origin authoritative for portal sign-in, provider OAuth callbacks, webhook URLs, and deployment output. Verify both the Entra portal callback and Microsoft calendar callback after the final deployment.

No credentials, OAuth secrets, tokens, or customer calendar data belong in this public repository. Tenant and subscription identifiers used in public operational examples must be intentional and non-secret. Enter provider credentials in the hosted setup UI. The setup UI records its HTTPS browser origin as the provider callback base URL.

## After deploy

1. Open the returned HTTPS URL.
2. Select **Continue with Microsoft** to bind or verify the workspace owner.
3. Add Microsoft accounts, complete provider authorization, and verify at least two calendars are Ready.
4. Review Sync Rules and use the Dashboard runtime control. The hosted process starts with a saved profile; only connected and validated calendars are eligible for provider work.

If a Microsoft organization blocks user consent, coordinate the tenant-specific review privately with its administrator. See [Getting Started](/getting-started) for the provider-specific setup flow.

Do not promote this adapter to Supported based on a successful deployment alone. Public conformance, persistence, security, backup, update, rollback, and recovery evidence must satisfy the [platform promotion rules](/platform-support#promotion-rules).
