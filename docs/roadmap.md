# Roadmap

_Status: public, sanitized roadmap summary · Updated: August 19, 2026_

Azure DevOps is the authoritative Project Marvin planning system. This page is the public product view: it contains no personal deployment identity, private acceptance evidence, or promised delivery dates.

## Completed

| Outcome | Result | Tracking |
| --- | --- | --- |
| Publish platform support and maturity contract | Defined **Supported**, **Tested**, **Experimental**, and **Planned**; published the evidence-linked [platform matrix](/platform-support); separated the portable OCI application from hosting adapters | AB#7741 |

## Now

| Outcome | Current intent | Tracking |
| --- | --- | --- |
| Complete the Microsoft-first release gate | Finish real-account acceptance, recovery, and release review without publishing private tenant evidence | AB#7659 |
| Keep setup and operations documentation accurate | Maintain public setup, security, recovery, platform maturity, release, and change documentation | AB#7725 |

## Next

| Outcome | Dependency | Tracking |
| --- | --- | --- |
| Deliver Apple Calendar integration | Follows the Microsoft release gate and requires real iCloud acceptance before promotion | AB#7660 |
| Deliver Google Calendar integration | Follows the Apple release gate | AB#7661 |

## Later

| Outcome | Maturity goal | Tracking |
| --- | --- | --- |
| Define self-service updates | Version discovery, integrity, backup, migration, validation, and rollback without an AI operator | AB#7735 |
| Define the portable OCI runtime contract | One released application image with provider-neutral runtime and conformance boundaries | AB#7736 |
| Deliver the Docker Compose reference installation | Establish the baseline self-hosted path for Linux Docker Engine and compatible desktop runtimes | AB#7737 |
| Verify supported host operating systems | Add Windows, Ubuntu, and macOS evidence and remove host-specific assumptions | AB#7738 |
| Abstract state and scheduled execution | Make durable state, locking, and bounded execution available to hosting adapters | AB#7739 |
| Prototype Cloudflare Containers | Move Cloudflare from **Planned** to no higher than **Experimental** until every support gate passes | AB#7740 |
| Propagate source deletions safely | Preserve default delete-disabled behavior until provider tombstones and Marvin ownership prove a safe cleanup | AB#7734 |

Platform maturity is controlled by the [platform support contract](/platform-support), not by roadmap placement. A work item being planned, active, or completed does not by itself make a platform supported.
