# Management API Contract

_Status: supported portal contract · Tracking: AB#7666_

The Project Marvin portal uses the same-origin `/marvin-api` management API. With the exception of bootstrap, authentication callbacks, and provider webhooks, every operation requires an authenticated workspace session.

## Response envelopes

Successful JSON operations return an object with `ok: true` and operation-specific fields. Callers must ignore additional fields so the contract can be extended compatibly.

Errors use one stable envelope:

```json
{
  "ok": false,
  "code": "VALIDATION_ERROR",
  "error": "Missing required fields: profileName",
  "action": "Complete the required fields and try again.",
  "retryable": false
}
```

`code` is machine-readable. `error` and `action` are safe operator-facing text. `retryable` indicates whether repeating the same operation without changing input may succeed. Authentication failures additionally return `requiresLogin: true`.

## Portal operations

| Method and path | Authentication | Request | Successful response |
| --- | --- | --- | --- |
| `GET /marvin-api/bootstrap` | No | None | Deployment, authentication, operator, and current redacted configuration state |
| `GET /marvin-api/auth/entra/start` | No | None | Redirect to Microsoft Entra |
| `GET /marvin-api/auth/entra/callback` | No | Entra callback query | Bound session cookie and redirect to the portal |
| `POST /marvin-api/auth/dev` | Loopback development only | Empty object | Local development session; always unavailable in hosted mode |
| `POST /marvin-api/logout` | Optional | Empty object | Cleared session cookie |
| `GET /marvin-api/config?profileName=` | Yes | Profile query | Redacted effective configuration and readiness evidence |
| `POST /marvin-api/save-config` | Yes | Workspace configuration | Persisted redacted configuration |
| `POST /marvin-api/account-upsert` | Yes | `profileName`, `account`, optional configuration fields | Updated redacted configuration |
| `POST /marvin-api/account-remove` | Yes | `profileName`, `accountId` | Updated configuration; this operation does not delete provider events |
| `GET /marvin-api/connections?profileName=` | Yes | Profile query | Connection and redacted token-status evidence |
| `POST /marvin-api/connection-begin` | Yes | `profileName`, `calendarId` | Provider launch URL or validation result |
| `POST /marvin-api/connection-update` | Yes | Connection state update | Updated redacted configuration |
| `POST /marvin-api/microsoft/discover` | Yes | `profileName`, `calendarId` | Verified Graph identity and discovered calendar metadata |
| `POST /marvin-api/microsoft/confirm-identity` | Yes | `profileName`, `calendarId`, `confirmed: true` | Explicit mismatch confirmation and updated configuration |
| `POST /marvin-api/microsoft/select-calendars` | Yes | `profileName`, `calendarId`, writable `providerCalendarIds` | Stable provider-calendar selections and updated configuration |
| `POST /marvin-api/microsoft/capabilities` | Yes | `profileName`, `calendarId` | Separate non-mutating read, write, refresh, and subscription results |
| `POST /marvin-api/apple/discover` | Yes | `profileName`, `calendarId` | CalDAV principal, calendar home, and collection discovery metadata |
| `POST /marvin-api/apple/select-calendars` | Yes | `profileName`, `calendarId`, writable `providerCalendarIds` | Stable Apple collection selections and updated configuration |
| `POST /marvin-api/apple/capabilities` | Yes | `profileName`, `calendarId` | Non-mutating authentication, discovery, read, write, and polling evidence |
| `POST /marvin-api/connection-validate` | Yes | `profileName`, `calendarId` | Live capability result and configuration |
| `POST /marvin-api/connection-validate-all` | Yes | `profileName` | Per-calendar validation results and summary |
| `GET /marvin-api/provider-requirements?profileName=` | Yes | Profile query | Required provider deployment configuration |
| `GET /marvin-api/provider-plan?profileName=&provider=` | Yes | Profile and provider query | Safe registration plan without secret values |
| `POST /marvin-api/provider-config` | Yes | Provider public configuration and secret inputs | Redacted effective configuration |
| `GET /marvin-api/runtime-status?profileName=` | Yes | Profile query | Runtime process, activity, and subscription evidence |
| `POST /marvin-api/runtime-start` | Yes | `profileName` | Runtime process and configuration; rejected until readiness passes |
| `POST /marvin-api/runtime-stop` | Yes | `profileName` | Idempotent stopped runtime evidence |
| `POST /marvin-api/runtime-retry` | Yes | `profileName` | Queued idempotent reconciliation for the most recent failed calendars |
| `GET /api/health/live` | No | None | Minimal process liveness without workspace metadata |
| `GET /api/health/ready` | No | None | Redacted ready, setup-required, attention, or degraded state |
| `GET /marvin-api/health` | Yes | None | Redacted runtime, poll, token, subscription, and alert metrics |
| `POST /marvin-api/deploy` | Yes, local only | Deployment inputs | Deployment result; hosted self-deployment is forbidden |

Health `ready` indicates that the management service can safely accept traffic. Use `state` and the redacted provider metrics to assess calendar operations: `attention` with `PROVIDER_AUTH_REQUIRED` means the portal and runtime are available but one or more configured calendars still needs authorization, calendar selection, or capability validation. Only `state: ready` means every configured calendar currently has the required provider evidence.

OAuth calendar callbacks are provider-facing browser routes under `/marvin-api/oauth/{provider}`. Microsoft and Google webhook routes are unauthenticated provider callbacks and validate provider-specific notification material before queuing work.

## Stable error codes

| Code | Meaning | Retry behavior |
| --- | --- | --- |
| `AUTH_REQUIRED` | No valid workspace session | Sign in, then retry |
| `FORBIDDEN` | Authenticated operation or path is not allowed | Do not retry unchanged |
| `NOT_FOUND` | Profile, calendar, connection, or route does not exist | Refresh or select an existing resource |
| `VALIDATION_ERROR` | Required or formatted input is invalid | Correct input, then retry |
| `READINESS_REQUIRED` | Runtime prerequisites are incomplete | Complete the returned readiness actions |
| `UNSUPPORTED_OPERATION` | Provider or operation is outside the supported contract | Do not retry unchanged |
| `CONFLICT` | Current state conflicts with the command | Refresh evidence before deciding whether to retry |
| `PROVIDER_UNAVAILABLE` | A provider returned a transient failure | Retry with backoff |
| `INTERNAL_ERROR` | Unexpected server failure | Retry once, then use Diagnostics |

## Compatibility rules

- Existing fields are not renamed or removed without a versioned migration.
- Secret values are accepted only in request bodies and are never returned.
- New optional response fields are backward-compatible.
- Calendar removal is configuration-only; provider event deletion is a separate engine-owned operation and is never implied by this API.
