# Current Status

_This page is generated from Marvin's shared status model. Run `npm run marvin:render-status-doc` to refresh it manually._

As of **Thursday, July 30, 2026**, Project Marvin is a serious local proof-of-product, not a fully proven production-finished product.

## Current coverage

The repo currently supports all of the following **locally**:

- bidirectional route planning across Microsoft 365, Outlook, Google, and optional Apple / CalDAV calendars
- private-by-default mirrored events
- family-calendar detail overrides
- automatic per-source prefixes such as `WORK:` and `FAMILY:`
- source-timezone preservation in mirror payloads
- Marvin-owned Microsoft and Google OAuth start/callback flow
- Marvin-owned Apple / CalDAV credential validation
- Marvin account creation, staged onboarding, sign-in gating, and ongoing calendar management UI
- scriptable local install, bootstrap, verification, and Azure deployment-plan generation
- generated doctor/status reporting tied to the shared requirement model

## Requirement matrix

| Requirement | Repo truth on 2026-07-30 | Strongest local evidence | Remaining gap |
| --- | --- | --- | --- |
| Any connected calendar can originate a meeting or accepted invite. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-live-readiness`, `npm run marvin:smoke-subscriptions`, `npm run marvin:smoke-runtime-webhook-wake` | Not yet proven against real customer-owned live calendars. |
| Marvin mirrors that event to every other connected calendar. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-live-readiness`, `npm run marvin:smoke-subscriptions`, `npm run marvin:smoke-runtime-webhook-wake` | Not yet proven in a real always-on deployed runtime. |
| Mirrored events are private by default. | Partially proven locally | `npm run marvin:smoke-live` | Not yet proven against real tenant data and viewer permissions. |
| Selected target calendars, such as family calendars, can receive full detail instead. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-account-management` | Not yet proven in real customer calendars. |
| Every mirrored event carries the source calendar prefix. | Proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-account-management` | Not yet proven end-to-end in real tenant-backed writes. |
| Timezone behavior follows the source event instead of being hardcoded. | Proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-microsoft-timezone` | Not yet proven with real travel and provider edge cases. |
| Real provider authentication and connected-account validation must work before Marvin treats a calendar as ready. | Partially proven locally | `npm run marvin:smoke-onboard-api`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-connection-validation`, `npm run marvin:smoke-auth-gating` | Still not proven across real hosted runtimes and real customer-owned provider tenants. |
| Simple onboarding and ongoing account-management UI must exist for Marvin operators. | Partially proven locally | `npm run marvin:smoke-ui-surface`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-onboarding-guidance` | Still not proven as a finished production UX across real tenants and hosted runtime. |
| Ongoing management must allow adding, removing, and updating calendars and mirror policy. | Proven locally | `npm run marvin:smoke-account-management`, `npm run marvin:smoke-ui-surface` | Not yet proven in a real deployed multi-user environment. |
| Installer, bootstrap, verification, and deployment flows must be scriptable. | Partially proven locally | `npm run marvin:smoke-install`, `npm run marvin:smoke-bootstrap`, `npm run marvin:smoke-docs-commands`, `npm run marvin:smoke-deploy-plan` | Full production deployment and operations proof is still missing. |
| Microsoft 365, Outlook, and Google are in scope. Apple / CalDAV remains optional. | Partially proven locally | `npm run marvin:smoke-live`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-caldav-live`, `npm run marvin:smoke-outlook` | Real end-to-end customer proof across all providers is still missing. |
| Repository documentation must reflect the true architecture, implementation status, setup, deployment, and testing process. | Partially proven locally | `npm run marvin:smoke-docs-commands`, `npm run marvin:smoke-status-reporting`, `npm run docs:build` | Docs render and status wiring are proven locally, but they still describe a locally proven product rather than a fully completed production deployment. |

## Coverage summary

- Total requirements tracked: 12
- Proven locally: 3
- Partially proven locally: 9
- Missing: 0

## Biggest remaining gaps

Marvin still does **not** have strong proof of all of the following:

- real customer-owned live calendars syncing end to end across real tenants
- production-grade hosted secret handling and operational hardening
- fully proven always-on hosted runtime lifecycle
- fully zero-touch provider-app creation across every Microsoft and Google tenant
- a final documentation set that proves completed production deployment rather than a strong local proof

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
