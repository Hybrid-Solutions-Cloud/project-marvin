# Microsoft Synchronization

_Status: Microsoft sync implementation · Tracking: AB#7658, AB#7683–AB#7693_

Project Marvin treats Microsoft Graph identifiers and change cursors as durable provider state. It creates or updates only its own mirror events, never copies attendees into a mirror, and does not infer deletion merely because an event is absent from a query result.

## Synchronization flow

1. The runtime reads each selected Microsoft calendar by its stable Graph calendar ID.
2. The first read uses `calendarView/delta` for the configured time window and stores the returned opaque `@odata.deltaLink`.
3. Later reads send that exact delta link back to Graph. Changed events enter the planner; explicit `@removed` or cancelled records become tombstones.
4. Series masters, occurrences, exceptions, all-day state, original start, source timezone, iCalendar UID, change key, and last-modified metadata are normalized before planning.
5. The planner creates privacy-filtered mirror payloads. Attendees, response requests, online-meeting settings, and organizer state are never copied, so an accepted meeting cannot send a second invitation.
6. A SHA-256 hash of each target payload is stored with the Marvin-owned mapping. An identical payload is reported as `unchanged` without a Graph write.
7. New Graph events receive a deterministic `transactionId`. Updates use the previously stored immutable target event ID.
8. Graph throttling and transient 502, 503, and 504 responses are retried with `Retry-After` support and bounded exponential delay.

Microsoft documents delta tokens as opaque, stateful URLs scoped to a calendar view; callers must preserve and replay the returned link rather than reconstruct it. See [Get incremental changes to events in a calendar view](https://learn.microsoft.com/en-us/graph/delta-query-events). Project Marvin also requests [immutable Outlook item IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id) so moving an item does not invalidate its mapping.

## Delete safety

Provider event deletion is disabled by default:

```text
MARVIN_PROVIDER_DELETE_MODE=disabled
```

A target can qualify for cleanup only when all of these conditions are true:

- Graph supplied an explicit tombstone for the source event.
- The source calendar completed a successful authenticated change read.
- The mapping is marked as managed by Project Marvin.
- The mapping identifies the exact target calendar and immutable target event ID.
- `MARVIN_PROVIDER_DELETE_MODE` was deliberately set to `managed-mirrors-only`.

An empty page, expired token, permission failure, missing calendar, network error, or an event falling outside the sync window cannot trigger deletion. Removing an account from the portal removes local configuration, token, and subscription state only; it does not delete calendar events.

The HCS Azure validation procedure must leave deletion mode disabled. Live validation may read calendars, renew subscriptions, and create or update controlled mirror events only when the operator has approved those writes. It must never issue a calendar event `DELETE` request under the current authorization.

The Azure Container Apps template sets `MARVIN_PROVIDER_DELETE_MODE=disabled` explicitly. A deployment validation must fail closed when that value is missing or different; enabling managed-mirror deletion is a separate production decision and is not part of the Microsoft, Apple, or Google release tests.

## Webhooks and recovery

- Microsoft validation tokens are returned to Graph but only their SHA-256 hash is retained in diagnostic state.
- Notifications are accepted only when both `subscriptionId` and constant-time-checked `clientState` match a stored subscription.
- Raw notification data, client state, event content, and validation tokens are not persisted in diagnostic samples.
- `subscriptionRemoved` and `reauthorizationRequired` lifecycle events mark the subscription for recovery.
- A renewal that receives Graph 404 or 410 recreates the subscription with a POST.
- Webhooks request an early runtime wake; delta query remains the source of truth for the actual changes.

See Microsoft's guidance for [change notification lifecycle events](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events) and [Graph throttling](https://learn.microsoft.com/en-us/graph/throttling).

## Local verification

```powershell
npm run marvin:smoke-microsoft-sync
npm run marvin:smoke-delete-cleanup
npm run marvin:smoke-subscriptions
npm run marvin:smoke-live
```

These tests use local provider mocks. The delete cleanup smoke deliberately enables deletion only inside the mocked process, proves that explicit tombstones are required, and proves the default mode sends no delete requests.

In the HCS deployment, record only counts, calendar IDs, provider error classes, and timestamps. Do not persist event subjects, descriptions, attendees, bodies, access tokens, refresh tokens, validation tokens, client state, or provider payloads in runtime diagnostics. Delta cursors advance only for source calendars whose target writes completed without error; failed sources are retried from their previous cursor.
