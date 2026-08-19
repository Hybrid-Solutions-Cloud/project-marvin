# Microsoft Calendar Connection

_Status: Microsoft connection implementation · Tracking: AB#7657, AB#7675–AB#7682_

Project Marvin uses two separate Microsoft application registrations:

- The **portal application** is single-tenant (`AzureADMyOrg`) and controls who can administer the deployed workspace.
- The **calendar application** supports organizational and personal Microsoft accounts (`AzureADandPersonalMicrosoftAccount`) and authorizes access to each connected calendar owner.

Keeping these registrations separate prevents a calendar consent from granting portal administration and allows the calendar application to support accounts outside the portal owner's tenant.

## Required delegated permissions

The calendar application requests only these Microsoft Graph delegated permissions:

| Permission | ID | Purpose | Microsoft default admin-consent requirement |
| --- | --- | --- | --- |
| `User.Read` | `e1fe6dd8-ba31-4d61-89e7-88639da4683d` | Verify the signed-in Microsoft identity through `/me` | No |
| `Calendars.ReadWrite` | `1ec239c2-d7c9-4623-a91a-a9775856bb36` | Discover writable calendars and create, read, update, or delete events as the authorized user | No |

The OAuth request also uses the Microsoft identity platform scopes `openid`, `profile`, and `offline_access`. These are separate from Microsoft Graph delegated permissions. `offline_access` requests a refresh token so the hosted runtime can continue after the interactive session ends; issuance and continued validity remain subject to Microsoft policy, expiration, and revocation. Project Marvin does not request Microsoft Graph application permissions.

Microsoft documents `Calendars.ReadWrite` as the delegated permission for a signed-in app to create, read, update, and delete events in user calendars. Project Marvin's deletion safeguards are an application control, not a reduction of the permission Microsoft grants. Tenant policy can still require administrator approval even when Microsoft's permission table does not mark the delegated permission as admin-consent-required. See the [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) and [Graph permission best practices](https://learn.microsoft.com/en-us/graph/best-practices-graph-permission).

## Registration and rotation

Preview the exact registration plan without changing Azure:

```powershell
pwsh -File .\scripts\register-marvin-entra-app.ps1 `
  -ProfileName <profile> `
  -MarvinBaseUrl https://<your-hostname> `
  -EmitOnly
```

Apply it by removing `-EmitOnly`. The script reuses an application with the same display name, updates its audience and redirect URI, adds only missing permissions, and creates the service principal only when missing. It creates a credential for a new application but does not rotate an existing credential unless `-RotateCredential` is supplied.

Generated secrets are piped directly into the encrypted provider-secret store. The command output and `.marvin/provider-apps` state contain only the application ID, credential key ID, validity dates, and secret reference—not the secret value. Hosted deployment follows the same reuse rule; pass `-RotateEntraCredentials` to rotate both portal and calendar credentials deliberately.

The callback URI must match exactly:

```text
https://<your-hostname>/marvin-api/oauth/microsoft/callback
```

The calendar registration uses `AzureADandPersonalMicrosoftAccount`, which Microsoft defines as organizational accounts from any Entra directory plus personal Microsoft accounts. See [supported account types](https://learn.microsoft.com/en-us/entra/identity-platform/howto-modify-supported-accounts).

## Operator journey

1. Add a Microsoft 365 or Outlook.com account in **Calendars**.
2. Complete the Microsoft account picker and consent page.
3. Project Marvin validates the single-use OAuth state transaction, redeems the code with PKCE, encrypts the resulting token material, and verifies the identity through Microsoft Graph `/me`.
4. If Microsoft's verified email differs from the requested email, explicitly confirm the displayed identity or reconnect with a different account.
5. Select one or more calendars returned by `/me/calendars`. Read-only calendars are displayed but cannot be selected because every configured calendar can be a mirror target.
6. Run the capability check. A calendar becomes Ready only after separate read, write, refresh, and hosted HTTPS subscription checks pass.
7. Review privacy and preview behavior before starting synchronization.

The capability check does not create, update, or delete an event. It reads calendar metadata and at most one event identifier, evaluates `canEdit`, confirms refresh prerequisites, and confirms that a hosted HTTPS webhook URL can be used.

## OAuth safety behavior

- Authorization code flow uses PKCE with `S256` and a cryptographically random state value. Microsoft recommends PKCE and state validation for the authorization-code flow; see [Microsoft identity platform authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
- An authorization transaction expires after ten minutes and is consumed once. Expired, replayed, provider-mismatched, or unknown state is rejected.
- Authorization codes are exchanged immediately and are never persisted.
- Access tokens, refresh tokens, provider secrets, and the PKCE verifier are encrypted at rest and never returned by the management API.
- Reauthorization preserves non-secret calendar selection and privacy policy. Removing an account discards its local token and subscription records and does not delete source events.

## Consent and Conditional Access recovery

| Portal symptom | Likely cause | Operator action |
| --- | --- | --- |
| **Need admin approval**, `AADSTS65001`, or risky-app approval | Tenant user consent is disabled, assignment is required, or tenant risk policy requires an administrator | Coordinate the tenant-specific review privately with that organization's administrator; after approval, add or reconnect the account and complete Microsoft sign-in |
| `AADSTS53000` or `AADSTS53001` | Device compliance or join requirement | Use a compliant/joined device or ask the tenant administrator to review the policy scope |
| `AADSTS53002` or `AADSTS53003` | Application/client blocked by Conditional Access | Record the timestamp, request ID, correlation ID, user, and application; review the failed event in Entra **Monitoring & health > Sign-in logs > Conditional Access** |
| Identity differs from the requested email | The account picker selected another active Microsoft session, alias, or guest identity | Confirm the verified identity only when intentional; otherwise select **Use another account** |
| Refresh is unavailable or revoked | Consent was revoked, refresh token expired, or the client credential changed | Select **Reconnect**; policy and selected-calendar metadata remain intact |
| Selected calendar is missing or read-only | Calendar was removed, sharing changed, or Graph reports `canEdit: false` | Refresh discovery and choose a writable calendar or correct its Microsoft permissions |

Microsoft recommends diagnosing Conditional Access failures from the matching Entra sign-in event and applied policy rather than depending on error text alone. See [Conditional Access sign-in troubleshooting](https://learn.microsoft.com/en-us/entra/identity/conditional-access/troubleshoot-conditional-access) and [consent troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/troubleshoot-consent-issues).

Do not paste client secrets, tokens, authorization codes, or calendar content into logs or support tickets. Safe evidence includes timestamps, application/client ID, tenant ID, correlation/request IDs, permission names, capability booleans, and redacted provider error codes.
