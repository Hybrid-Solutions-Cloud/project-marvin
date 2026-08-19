# Apple Calendar and CalDAV

_Status: implemented locally; real iCloud release validation pending · Tracking: AB#7660, AB#7700–AB#7708_

Project Marvin connects to Apple Calendar through CalDAV. Apple does not use the Microsoft or Google OAuth flow here: the operator supplies the Apple Account email and an app-specific password through the portal. The password is encrypted at rest, is never returned by the management API, and is never redisplayed.

## Connect an Apple account

1. In the Apple Account security settings, create an app-specific password for Project Marvin. See [Apple's app-specific password guidance](https://support.apple.com/102654).
2. In **Calendars**, choose **Apple Calendar**, enter the Apple Account email and app-specific password, and select **Add calendar**. Project Marvin uses `https://caldav.icloud.com/` as the service entry point; no CalDAV URL knowledge is required. Self-hosted operators can override that entry point for another compatible CalDAV service.
3. After the credential check succeeds, select **Discover calendars**. Project Marvin follows redirects, resolves the current-user principal, resolves the calendar home set, and lists VEVENT calendar collections.
4. Select one or more readable, writable calendars. Read-only collections are visible but cannot be selected as two-way targets.
5. Select **Check capabilities**. Readiness requires current authentication, successful discovery, read privilege, write privilege, and polling support. The check uses WebDAV properties and leaves no test event behind.

The discovery flow follows the `current-user-principal` and `calendar-home-set` model defined by [RFC 4791](https://datatracker.ietf.org/doc/html/rfc4791). A selected collection URL is stored as the provider calendar identifier; it is not inferred from the Apple email address. Authenticated discovery, polling, and write redirects are followed manually so authorization survives approved iCloud host changes; credentials are never forwarded to an unrelated hostname or through an HTTPS-to-HTTP downgrade.

## Synchronization behavior

- CalDAV `REPORT` responses are normalized into one source event per expanded VEVENT occurrence or exception.
- Resource ETags are stored in the opaque change cursor. Unchanged resources do not enter the write plan.
- Missing resources, cancelled occurrences, and occurrences removed from a changed resource become explicit tombstones. Provider deletion remains disabled unless the separate managed-mirror delete mode is deliberately enabled.
- All-day events retain date-only start and exclusive end dates.
- TZID wall-clock values are converted using IANA timezone rules, including daylight-saving transitions.
- Escaped commas, semicolons, newlines, and backslashes round-trip through ICS.
- New mirror resources use `If-None-Match: *`; updates use the previously returned ETag with `If-Match`. A 412 conflict stops the write and asks the operator to refresh instead of overwriting a remote change.
- Marvin writes its ownership marker into every mirror and excludes those resources from source planning, preventing loops.

The runtime records the last completed poll, the next poll time, the current delay, and consecutive failures. Successful polling returns to the configured interval. Failures use bounded exponential backoff up to one hour. RFC 6578 sync-token support can be added as a compatible optimization; the current release uses RFC-standard ETag change evidence without trusting absence caused by a failed request.

## Recovery

| Symptom | Meaning | Recovery |
| --- | --- | --- |
| Authentication failed | Apple rejected the email or app-specific password | Revoke the old password in Apple, create a replacement, and use **Replace password** |
| Principal discovery failed | The service entry point did not return a current-user principal | Verify the service address and credential, then rerun discovery |
| Calendar home discovery failed | The principal did not expose a calendar home | Confirm the account has iCloud Calendar enabled, then rerun discovery |
| No calendars discovered | Authentication worked but no VEVENT collections were returned | Confirm at least one calendar exists and is accessible |
| Calendar is read-only | The collection lacks WebDAV write privileges | Choose a writable collection or update sharing permissions |
| Selected calendar missing | The provider collection was removed or is no longer shared | Rerun discovery and select the current collection; existing calendar items are not deleted |
| Write conflict (HTTP 412) | The target resource changed after Marvin last read it | Refresh and retry after reviewing the remote change |

Replacing a credential or changing calendar selection does not require file editing. It preserves policy for provider identities that remain stable. The HCS validation procedure must not send any calendar event `DELETE` requests.

## Verification

```powershell
npm run marvin:smoke-caldav
npm run marvin:smoke-onboard-caldav
npm run marvin:smoke-caldav-live
npm run marvin:smoke-apple-sync
npm run marvin:smoke-live
```

The provider smokes use local CalDAV and Graph mocks. `marvin:smoke-apple-sync` covers redirects, staged discovery, collection selection metadata, read-only filtering, recurrence exceptions, all-day dates, a daylight-saving boundary, ETag incremental polling, explicit tombstones, conditional creates and updates, polling backoff, and zero DELETE requests.

Real iCloud discovery, bidirectional controlled-event validation, restart recovery, credential replacement, and the multi-day soak remain release gates that require an operator-owned Apple test account.
