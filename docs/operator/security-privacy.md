# Security and Privacy

Project Marvin is a single-operator calendar synchronization product. It minimizes retained calendar content, encrypts credentials, validates provider callbacks, and defaults every generated mirror to private unless an operator explicitly marks a destination trusted.

## Minimum provider access

- Microsoft: delegated `User.Read` and `Calendars.ReadWrite`, plus OIDC identity and `offline_access` scopes. No application-wide calendar permission is requested.
- Google: user-delegated Calendar access plus OIDC identity scopes. The product does not use a service account to access unrelated users.
- Apple: one operator-supplied app-specific password for CalDAV collections selected in the portal.

## Retained data

| Data | Purpose | Storage |
| --- | --- | --- |
| Account email, provider, selected calendar ID, labels, policy | Identify routes and explain configuration | Profile/configuration state |
| Source and target event IDs, payload hash, timezone, policy metadata | Idempotency, update targeting, and explicit tombstones | Mapping state |
| OAuth access/refresh tokens and provider client secrets | Provider access | AES-256-GCM encrypted stores |
| Apple app-specific password | CalDAV access | AES-256-GCM encrypted provider-secret store |
| Runtime counts, timestamps, provider/calendar IDs, safe error classes, correlation/run IDs | Diagnostics and recovery | Compact runtime status history |
| Webhook subscription IDs, hashed validation evidence, lifecycle status | Notification renewal and validation | Subscription state |

Event subjects, descriptions, locations, attendees, bodies, authorization codes, raw webhook payloads, access tokens, refresh tokens, client secrets, app-specific passwords, validation tokens, and webhook client state are not retained in operational logs. Source event content exists in memory only while policy constructs the destination mirror. Compact runtime history removes raw source events.

## Threat controls

| Surface | Control |
| --- | --- |
| Portal sign-in | Microsoft Entra identity, bound operator account, secure same-site session cookie, hosted dev-auth disabled |
| OAuth callback | Random state, PKCE, expiry, one-time connection state, exact redirect URI |
| Webhooks | Microsoft subscription/client-state constant-time validation; Google channel token/resource validation; delta/poll remains source of truth |
| API authorization | Same-origin authenticated management routes; public routes limited to bootstrap/auth callbacks/webhooks and redacted health |
| Input and filesystem | One MiB JSON limit, normalized API errors, allowlisted static root, traversal checks, atomic writes |
| Credential storage | Required hosted data-protection key, AES-256-GCM envelopes, no secret response fields |
| Backup | Independent AES-256-GCM envelope using an escrowed passphrase, SHA-256 per-file integrity, 14-day retention |
| Calendar writes | Deterministic mapping, ownership markers, conditional CalDAV writes, no copied attendees or invitation behavior |
| Calendar deletion | Disabled by default and in HCS Azure; only explicit tombstones for Marvin-managed mirrors can ever qualify when separately enabled |
| Logs and metrics | UUID correlation/run IDs, route names without query strings, counts/timestamps/status only, credential redaction |

## Data deletion and account removal

Removing an account from the portal removes its local configuration, per-account Apple credential, token, and subscription references. It does not delete source or mirror items from any provider. Backup retention may retain encrypted prior state for up to 14 days. Provider-side credentials should also be revoked at Microsoft, Google, or Apple when access is no longer required.

## Review status

Automated tests cover session gating, hosted dev-auth rejection, OAuth state/PKCE, API error contracts, path containment, encrypted storage, migration rejection, backup confidentiality/integrity, webhook validation, privacy policy, loop prevention, idempotency, and default delete-disabled behavior. No critical or high finding is currently known. Real-provider acceptance and an independent user/security review remain required before final release approval.
