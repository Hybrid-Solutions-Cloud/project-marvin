# Current Status

_This page is generated from Marvin's shared status model. Run `npm run marvin:render-status-doc` to refresh it manually._

As of **Wednesday, August 19, 2026**, Project Marvin is **Preview** software. Its local behavior, Azure deployment-plan contract, health endpoints, persistence contracts, and provider mocks are verified by automated tests. Platform maturity is tracked separately so a passing component test is not mistaken for production support. This public status page intentionally excludes all private deployment identities, URLs, resources, and acceptance evidence.

## Current coverage

The open-source repository currently demonstrates:

- bidirectional route planning across Microsoft 365, Outlook, Apple / CalDAV, and Google calendars
- private-by-default mirrored events
- family-calendar detail overrides
- automatic per-source prefixes such as `WORK:` and `FAMILY:`
- source-timezone preservation in mirror payloads
- Marvin-owned Microsoft and Google OAuth start/callback flow
- Marvin-owned Apple / CalDAV credential validation
- Microsoft Entra workspace bootstrap, staged onboarding, sign-in gating, and ongoing calendar management UI
- scriptable local install, bootstrap, verification, and Azure deployment-plan generation
- generated doctor/status reporting tied to the shared requirement model
- an Experimental Azure Container Apps reference adapter with configurable public origin and redacted liveness/readiness endpoints
- durable profile/account state across application restarts

These capabilities do not make a hosting target Supported. See [Platform Support](/platform-support) for the evidence and promotion contract.

Apple / CalDAV is the active provider release train. Google follows Apple, then the general availability release candidate adds self-service updates, safe deletion propagation, platform-neutral state and scheduling, the portable runtime prerequisite, and declared-host validation. See the [Roadmap](/roadmap) for the complete release sequence.

## Requirement matrix

| Requirement | Evidence status on 2026-08-19 | Strongest automated evidence | Remaining gap |
| --- | --- | --- | --- |
| An event created or accepted in any connected calendar mirrors to every other connected calendar. | Partially proven | `npm run marvin:smoke-live`, `npm run marvin:smoke-live-readiness`, `npm run marvin:smoke-subscriptions`, `npm run marvin:smoke-runtime-webhook-wake` | Not yet proven against real customer-owned live calendars. |
| Marvin mirrors that event to every other connected calendar. | Partially proven | `npm run marvin:smoke-live`, `npm run marvin:smoke-live-readiness`, `npm run marvin:smoke-subscriptions`, `npm run marvin:smoke-runtime-webhook-wake` | Real always-on operation and cross-tenant provider writes require environment-specific acceptance testing outside this public repository. |
| Mirrored events are private by default. | Partially proven | `npm run marvin:smoke-live` | Not yet proven against real tenant data and viewer permissions. |
| Selected target calendars, such as family calendars, can receive full detail instead. | Partially proven | `npm run marvin:smoke-live`, `npm run marvin:smoke-account-management` | Not yet proven in real customer calendars. |
| Every mirrored event carries the source calendar prefix. | Proven by automated contract | `npm run marvin:smoke-live`, `npm run marvin:smoke-account-management` | Not yet proven end-to-end in real tenant-backed writes. |
| Timezone behavior follows the source event instead of being hardcoded. | Proven by automated contract | `npm run marvin:smoke-live`, `npm run marvin:smoke-microsoft-timezone` | Not yet proven with real travel and provider edge cases. |
| Real provider authentication and connected-account validation must work before Marvin treats a calendar as ready. | Partially proven | `npm run marvin:smoke-onboard-api`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-connection-validation`, `npm run marvin:smoke-auth-gating` | Hosted authentication and persistence contracts are automated; real external-tenant authorization still requires private administrator approval and acceptance testing. |
| Simple onboarding and ongoing account-management UI must exist for Marvin operators. | Partially proven | `npm run marvin:smoke-ui-surface`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-onboarding-guidance` | Still not proven as a finished production UX across real tenants and hosted runtime. |
| Ongoing management must allow adding, removing, and updating calendars and mirror policy. | Proven by automated contract | `npm run marvin:smoke-account-management`, `npm run marvin:smoke-ui-surface` | Not yet proven in a real deployed multi-user environment. |
| Installer, bootstrap, verification, and deployment flows must be scriptable. | Partially proven | `npm run marvin:smoke-install`, `npm run marvin:smoke-bootstrap`, `npm run marvin:smoke-docs-commands`, `npm run marvin:smoke-deploy-plan` | The deployment plan and contracts are automated; each operator must privately verify DNS, TLS, health, persistence, and recovery in their own environment. |
| Provider delivery follows Microsoft first, Apple / CalDAV second, and Google third. | Partially proven | `npm run marvin:smoke-live`, `npm run marvin:smoke-operator-journey`, `npm run marvin:smoke-outlook`, `npm run marvin:smoke-caldav-live` | Real end-to-end customer proof across all providers is still missing. |
| Repository documentation must reflect the true architecture, implementation status, setup, deployment, and testing process. | Partially proven | `npm run marvin:smoke-docs-commands`, `npm run marvin:smoke-status-reporting`, `npm run docs:build` | The public architecture, maturity matrix, roadmap, release record, and operations guidance are covered; platform promotion still depends on future public conformance evidence, while private deployment identities and acceptance results remain excluded. |

## Coverage summary

- Total requirements tracked: 12
- Proven locally: 3
- Partially proven locally: 9
- Missing: 0

## Biggest remaining gaps

Marvin still does **not** have strong proof of all of the following:

- real customer-owned live calendars syncing end to end across real tenants
- completed production acceptance, recovery exercises, and independent security review
- fully zero-touch provider-app creation across every Microsoft and Google tenant
- environment-specific provider authorization and real-account acceptance testing
- a published immutable OCI release and complete cross-platform container conformance evidence
- a Supported hosted deployment adapter with public backup, update, rollback, and recovery proof

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
- [Platform Support](/platform-support)
- [Roadmap](/roadmap)
- [Releases](/releases)
- [Marvin Engine](/solutions/marvin-engine)
