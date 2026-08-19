# Releases

_Status: public release record · Updated: August 19, 2026_

## Current release state

Project Marvin is **Preview** software. The repository declares version `0.1.0-preview.1`; there is no generally available or production-support release yet. The current `main` branch is a development baseline for evaluation and testing.

Current platform maturity is summarized in the [platform support matrix](/platform-support):

- Windows source verification is **Tested** within its documented scope.
- The raw Linux OCI image and Azure Container Apps adapter are **Experimental**.
- Docker Compose, Docker Desktop host validation, Cloudflare Containers, and additional OCI schedulers are **Planned**.
- No hosted target is currently labeled **Supported** by the public project.

## Planned release sequence

| Version | Channel | Primary outcome | Azure DevOps planning target |
| --- | --- | --- | --- |
| `0.2.0-preview` | Preview | Apple / CalDAV release gate | `2026-Q3-S4` |
| `0.3.0-preview` | Preview | Google and real three-provider release gate | `2026-Q3-S5` |
| `1.0.0-rc.1` | Preview release candidate | Self-service updates, safe deletion, platform-neutral state and scheduling, portable runtime prerequisite, and host validation | `2026-Q3-S6` through `2026-Q4-S1` |
| `1.0.0` | General availability | Final acceptance of every provider and operational gate | `2026-Q4-S2` |

These are sequencing targets, not promised dates. A release stays in Preview or moves to the next sprint when its acceptance evidence is incomplete.

## General availability definition

Project Marvin reaches general availability only when all of the following are true:

- Microsoft, Apple, and Google real-account release gates pass;
- deployed instances can discover, validate, apply, and roll back updates without an AI operator;
- source deletions propagate only with provider tombstones, Marvin ownership evidence, and fail-closed safeguards;
- persistent state, locking, and scheduled execution are independent of a single hosting adapter;
- the portable runtime prerequisite and declared Windows, Linux, and macOS host checks pass; and
- backup, restore, migration, recovery, security, and operator documentation pass final acceptance.

The portable Open Container Initiative contract is included because state abstraction and host validation already depend on it. Docker Compose, Cloudflare Containers, and additional hosting adapters remain post-GA unless they become necessary to satisfy a declared host gate.

See the [roadmap](/roadmap) for work-item sequencing and the [platform support matrix](/platform-support) for evidence-based maturity labels.

## Preview baseline 0.1.0-preview.1 — August 19, 2026

This Preview baseline established the public Project Marvin repository, documentation site, portal and runtime contracts, provider adapters, test suite, Azure reference deployment automation, and the separation between public product material and private installations.

It is not generally available and is not a production-support declaration. Environment-specific provider authorization and acceptance results remain private to each installation.

Detailed documentation changes are recorded in the [repository changelog](https://github.com/Hybrid-Solutions-Cloud/project-marvin/blob/main/CHANGELOG.md).
