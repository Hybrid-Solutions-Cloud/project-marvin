# Roadmap

_Status: public, sanitized roadmap summary · Updated: August 19, 2026_

Azure DevOps is the authoritative Project Marvin planning system. This page is the public product view: it contains no personal deployment identity, private acceptance evidence, or promised delivery dates.

Project Marvin remains **Preview** until the `1.0.0` general availability gate passes. Sprint identifiers are planning targets, not automatic release dates; a release moves only when its acceptance evidence passes.

## Release train

| Release | Status | Planned sprint | Outcome | Tracking |
| --- | --- | --- | --- | --- |
| `0.1.0-preview.1` | Current public preview | `2026-Q3-S4` | Microsoft-first product foundation; remaining real-account Microsoft acceptance continues as a dependency | AB#7659 |
| `0.2.0-preview` | **In progress** | `2026-Q3-S4` | Complete Apple / CalDAV onboarding, synchronization, recovery, and real iCloud acceptance | AB#7660 |
| `0.3.0-preview` | Next | `2026-Q3-S5` | Complete Google OAuth, synchronization, watch recovery, and real three-provider acceptance | AB#7661 |
| `1.0.0-rc.1` | Planned before general availability | `2026-Q3-S6` through `2026-Q4-S1` | Add self-service updates, safe deletion propagation, platform-neutral state and scheduling, the portable runtime prerequisite, and declared-host validation | AB#7734, AB#7735, AB#7736, AB#7738, AB#7739 |
| `1.0.0` | General availability gate | `2026-Q4-S2` | Release only after every provider, update, deletion, state, recovery, security, and host-validation criterion passes | AB#7662 |
| Post-GA | Backlog | Unscheduled | Expand installation and hosting choices without delaying the first generally available release | AB#7737, AB#7740 |

## Completed

| Outcome | Result | Tracking |
| --- | --- | --- |
| Publish platform support and maturity contract | Defined **Supported**, **Tested**, **Experimental**, and **Planned**; published the evidence-linked [platform matrix](/platform-support); separated the portable OCI application from hosting adapters | AB#7741 |

## Now

| Outcome | Current intent | Tracking |
| --- | --- | --- |
| Deliver the Apple preview | Apple / CalDAV is the active provider release train; complete real iCloud discovery, synchronization, recovery, and acceptance | AB#7660 |
| Complete remaining Microsoft preview acceptance | Finish real-account acceptance and recovery evidence without publishing private tenant details | AB#7659 |
| Keep setup and operations documentation accurate | Maintain public setup, security, recovery, platform maturity, release, and change documentation | AB#7725 |

## Next

| Outcome | Dependency | Tracking |
| --- | --- | --- |
| Deliver the Google preview | Starts after the Apple release gate and completes real three-provider acceptance | AB#7661 |
| Complete the general availability readiness candidate | Packages self-updates, deletion, state abstraction, portable-runtime prerequisites, and host validation into the last Preview release | AB#7734, AB#7735, AB#7736, AB#7738, AB#7739 |
| Approve `1.0.0` general availability | Requires the Apple, Google, and readiness-candidate gates to pass; sprint placement does not waive acceptance criteria | AB#7662 |

## Later

| Outcome | Maturity goal | Tracking |
| --- | --- | --- |
| Deliver the Docker Compose reference installation | Establish the baseline self-hosted path for Linux Docker Engine and compatible desktop runtimes | AB#7737 |
| Prototype Cloudflare Containers | Move Cloudflare from **Planned** to no higher than **Experimental** until every support gate passes | AB#7740 |
| Add additional OCI hosting adapters | Evaluate Kubernetes, Amazon Web Services, Google Cloud, and other schedulers only after the general availability contract is stable | Future backlog |

Platform maturity is controlled by the [platform support contract](/platform-support), not by roadmap placement. A work item being planned, active, or completed does not by itself make a platform supported.
