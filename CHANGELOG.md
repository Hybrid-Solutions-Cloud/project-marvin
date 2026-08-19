# Changelog

All notable public Project Marvin changes are recorded here. This file contains product and repository changes only; private deployment identities and acceptance evidence are excluded.

## Unreleased

### Added

- Platform maturity definitions and an evidence-linked support matrix under AB#7741.
- A public Now/Next/Later roadmap that separates provider delivery from deployment portability.
- A public release-status document that distinguishes the development baseline from a supported production release.
- Roadmap coverage for versioned OCI delivery, Docker Compose, cross-platform verification, platform-neutral state and scheduling, Cloudflare Containers, and self-service updates.

### Changed

- Classified the current baseline as `0.1.0-preview.1` and reserved `1.0.0` for general availability.
- Sequenced the Apple Preview, Google Preview, general availability release candidate, and final general availability gate against standard Azure DevOps sprints.
- Defined self-service updates, safe deletion propagation, platform-neutral state and scheduling, the portable runtime prerequisite, and host validation as pre-GA requirements; Docker Compose and additional cloud adapters remain post-GA.
- Defined the Linux OCI image as the Project Marvin portability boundary and Azure as an experimental reference adapter rather than an application requirement.
- Classified Cloudflare Containers as Planned until a prototype exists and limited any prototype to Experimental until all support gates pass.
- Removed private environment-validation history and unsupported production-support wording from public operations guidance.

## 0.1.0-preview.1 — 2026-08-19

### Added

- Public Project Marvin source baseline with the management portal, synchronization runtime, provider adapters, security controls, automated tests, and VitePress documentation.
- Azure Container Apps reference deployment automation with generic, placeholder-only examples.

### Security

- Established the boundary that personal deployment domains, tenant and subscription identifiers, account emails, credentials, tokens, resource names, and private acceptance evidence do not belong in the public repository.
