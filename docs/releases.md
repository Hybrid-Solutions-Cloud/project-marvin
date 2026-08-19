# Releases

_Status: public release record · Updated: August 19, 2026_

## Current release state

The repository declares version `0.1.0`, but there is no tagged production release yet. The current `main` branch is a development baseline for review and testing.

Current platform maturity is summarized in the [platform support matrix](/platform-support):

- Windows source verification is **Tested** within its documented scope.
- The raw Linux OCI image and Azure Container Apps adapter are **Experimental**.
- Docker Compose, Docker Desktop host validation, Cloudflare Containers, and additional OCI schedulers are **Planned**.
- No hosted target is currently labeled **Supported** by the public project.

## Unreleased

The next release work includes:

- complete real-account Microsoft acceptance before Apple becomes the next provider gate;
- publish immutable, versioned OCI images with integrity and compatibility metadata;
- prove platform-neutral persistence, backup, update, migration, health validation, and rollback;
- deliver and test the Docker Compose reference installation; and
- promote deployment adapters only when the evidence requirements in the platform matrix pass.

See the [roadmap](/roadmap) for sequencing. AB#7735 tracks the release-update mechanism and AB#7736 tracks the portable runtime contract.

## Development baseline 0.1.0 — August 19, 2026

This baseline established the public Project Marvin repository, documentation site, portal and runtime contracts, provider adapters, test suite, Azure reference deployment automation, and the separation between public product material and private installations.

It is not a production-support declaration. Environment-specific provider authorization and acceptance results remain private to each installation.

Detailed documentation changes are recorded in the [repository changelog](https://github.com/Hybrid-Solutions-Cloud/project-marvin/blob/main/CHANGELOG.md).
