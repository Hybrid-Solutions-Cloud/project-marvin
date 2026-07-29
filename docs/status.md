# Current Status

_This page is generated from Marvin's shared status model. Run `npm run marvin:render-status-doc` to refresh it manually._

As of **Wednesday, July 29, 2026**, Project Marvin is a serious local proof-of-product, not a fully proven production-finished product.

## Current coverage

The repo currently supports all of the following **locally**:

- bidirectional route planning across Microsoft 365, Outlook, Google, and optional Apple / CalDAV calendars
- private-by-default mirrored events
- family-calendar detail overrides
- automatic per-source prefixes such as `WORK:` and `FAMILY:`
- source-timezone preservation in mirror payloads
- Marvin-owned Microsoft and Google OAuth start/callback flow
- Marvin-owned Apple / CalDAV credential validation
- Marvin account creation, sign-in gating, and ongoing calendar management UI
- scriptable local install, bootstrap, verification, and Azure deployment-plan generation

## Requirement matrix

| Requirement | Repo truth on July 29, 2026 | Strongest local evidence | Remaining gap |
| --- | --- | --- | --- |
| Any connected calendar can originate a meeting or accepted invite. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-live-readiness`, `npm run marvin:smoke-subscriptions` | Not yet proven against real customer-owned live calendars. |
| Marvin mirrors that event to every other connected calendar. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-live-readiness`, `npm run marvin:smoke-subscriptions` | Not yet proven in a real always-on deployed runtime. |
| Mirrored events are private by default. | Partially proven locally | `npm run marvin:smoke-live` | Not yet proven against real tenant data and viewer permissions. |
| Selected target calendars, such as family calendars, can receive full detail instead. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-account-management` | Not yet proven in real customer calendars. |
| Every mirrored event carries the source calendar prefix. | Proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-account-management` | Not yet proven end-to-end in real tenant-backed writes. |
| Timezone behavior follows the source event instead of being hardcoded. | Proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-microsoft-timezone` | Not yet proven with real travel and provider edge cases. |
| Account setup must be simple and should validate whether the provider is actually ready. | Partially proven locally | `npm run marvin:smoke-ui-surface`, `npm run marvin:smoke-onboard-api`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-connection-validation` | Still not proven as finished production UX across real tenants and hosted runtime. |
| Ongoing management must allow adding, removing, and updating calendars and mirror policy. | Proven locally | `npm run marvin:smoke-account-management`, `npm run marvin:smoke-ui-surface` | Not yet proven in a real deployed multi-user environment. |
| Deployment must be scriptable. | Partially proven locally | `npm run marvin:smoke-deploy-plan`, `npm run marvin:azure:plan` | Full production deployment and operations proof is still missing. |
| Microsoft 365, Outlook, and Google are in scope. Apple / CalDAV remains optional. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-caldav-live`, `npm run marvin:smoke-outlook` | Real end-to-end customer proof across all providers is still missing. |

## Coverage summary

- Total requirements tracked: 10
- Proven locally: 3
- Partially proven locally: 7
- Missing: 0

## Biggest remaining gaps

Marvin still does **not** have strong proof of all of the following:

- real customer-owned live calendars syncing end to end across real tenants
- production-grade hosted secret handling and operational hardening
- fully proven always-on hosted runtime lifecycle
- fully zero-touch provider-app creation across every Microsoft and Google tenant

## Use the repo to verify status

If you want the repo to tell you what is true right now, use:

```powershell
npm run marvin:doctor
```

For the full JSON report, including requirement coverage and next gaps:

```powershell
node scripts/marvin-doctor.mjs --json
```

For the fuller written requirement audit, read:

- [Requirements](/requirements)
- [Getting Started](/getting-started)
- [Marvin Engine](/solutions/marvin-engine)
