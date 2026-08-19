# Portal Information Architecture

_Status: implementation baseline · Tracking: AB#7664, AB#7665_

## Portal objective

The portal must answer four questions without requiring logs or configuration files:

1. Is Project Marvin healthy?
2. Which calendars are ready, and which need action?
3. What information is copied to each destination?
4. What should the operator do next?

## Primary navigation

| Surface | Operator question | Initial capability |
| --- | --- | --- |
| Dashboard | Is everything working? | Readiness summary, runtime state, calendar status, next actions |
| Calendars | What is connected? | Add, authorize, reconnect, manage privacy, and remove calendars |
| Sync Rules | What will each target receive? | Private/busy/subject/trusted-detail policy and preview |
| Activity | What happened? | Recent runs and created/updated/skipped/failed summaries |
| Diagnostics | Why is something not ready? | Provider, token, subscription, polling, and runtime evidence |
| Settings | How is this workspace configured? | Timezone, sync window, workspace identity, and deployment information |

The first portal-foundation slice implements all six locations as evidence-driven views. Operations remain limited to APIs already supported by the backend; later stories add runtime controls, richer policy editing, calendar discovery, and guided recovery.

## Calendar lifecycle

| State | Meaning | Expected action |
| --- | --- | --- |
| Setup required | Provider application or required account data is missing | Finish provider setup |
| Authorizing | Provider sign-in was started and callback is pending | Complete sign-in |
| Verifying | Credentials exist but live capability checks are incomplete | Check access |
| Ready | Required identity, credential, and capability evidence is valid | None |
| Syncing | A ready calendar is participating in an active run | Wait or view Activity |
| Expired | Saved authorization can no longer be used | Reconnect |
| Failed | Provider or runtime operation ended with a non-retryable error | Review Diagnostics |

Lifecycle state must come from backend evidence. The browser must not infer Ready from the presence of an account email.

## First-run journey

1. The unauthenticated screen explains that workspace sign-in and calendar authorization are separate.
2. Microsoft Entra sign-in binds or verifies the workspace owner.
3. An empty Dashboard explains that at least two calendars are required.
4. The operator opens Calendars and adds the first Microsoft account.
5. External provider consent returns to the portal and live validation begins.
6. The operator selects provider calendars when discovery is implemented.
7. The operator reviews target privacy and a synchronization preview.
8. The portal enables automation only when at least two calendars are Ready.

Progress must survive refresh, external redirects, and supported service restarts.

## Returning-operator journey

The Dashboard is the default surface. It prioritizes action-required calendars and runtime failures above healthy status. Every problem links to either an immediate operation or a Diagnostics explanation. Successful state remains concise.

## Interaction and accessibility rules

- Navigation and primary actions must work by keyboard and touch.
- Current navigation uses `aria-current` and status changes use an `aria-live` region.
- Color supplements text labels and never carries status by itself.
- Destructive or provider-writing operations require explicit language and appropriate confirmation.
- Secret values are never returned to or rendered by the portal.
- Mobile layouts keep status and next actions ahead of secondary diagnostics.

## Responsive layout

- Wide screens use a persistent product sidebar and content workspace.
- Narrow screens collapse navigation into a horizontally scrollable control row.
- Cards become a single column before labels or actions become cramped.
- Tables are avoided for essential mobile actions; diagnostic tables may scroll horizontally.
