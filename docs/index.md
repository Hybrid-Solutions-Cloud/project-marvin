# Project Marvin
<div class="marvin-hero-logo">
  <img src="/logo-large.svg" alt="Project Marvin logo">
</div>
Project Marvin is the repo's primary product path: one Marvin-managed setup flow, one account-management surface, and one automated sync runtime for multi-calendar mirroring.
## What Marvin does
- syncs meetings bidirectionally across connected Microsoft 365, Outlook, Google, and optional Apple / CalDAV calendars
- mirrors events automatically after setup when the Marvin runtime is running
- keeps mirrored events private by default on other calendars
- allows per-target visibility overrides, especially for family calendars
- stamps mirrored events with source prefixes like WORK: or CONTRACT:
- preserves source timezone behavior in mirrored events
- gives the operator one setup and management surface
## Start here
Fresh clone path:
`powershell
npm run marvin:install
`
If you are cloning the repo and want the real Marvin path, begin with:
- [Getting Started](/getting-started)
- [Requirements](/requirements)
- [Architecture](/architecture)
- [Marvin Engine](/solutions/marvin-engine)
- [Marvin on Azure](/solutions/marvin-azure)
## Current truth on July 29, 2026
Implemented now:
- Marvin-branded onboarding and management UI
- per-calendar account inventory, prefixes, privacy defaults, and family overrides
- Marvin-owned Microsoft and Google OAuth start/callback flow
- Marvin-owned Apple / CalDAV validation flow with per-account app passwords
- live Microsoft, Google, and Apple / CalDAV adapter smoke coverage
- local recurring sync daemon with runtime status and start/stop controls
- local setup state, token state, provider-secret state, and mapping state under .marvin/
Still not proven complete:
- real tenant-to-tenant production sync against customer-owned providers
- production-grade encryption and secret-management hardening for local state
- first-party Azure Container Apps deployment path now scripted in-repo, including a dry-run plan command
- long-term hosted deployment and operations proof for the final Marvin runtime
- fully verified zero-touch provider app creation for every Microsoft and Google tenant
## Repo structure
### Marvin
This is the product boundary the repo is converging on.
- [Marvin Engine](/solutions/marvin-engine)
- [Marvin on Azure](/solutions/marvin-azure)
- [Onboarding UI](/operator/onboarding-ui)
### Reference tracks
These remain documented for comparison, credits, and bridge-hosting context. They are intentionally secondary to Marvin in both the docs and the runtime UX.
- [Paranoid Keeper Bridge Reference](/solutions/paranoid-keeper)
- [Bureaucratic Flow Reference](/solutions/bureaucratic-flow)
- [Google Hub Legacy Reference](/solutions/google-hub)
- [Credits](/credits)
## Product direction
The repo should continue converging on:
1. Marvin-owned onboarding and account management.
2. Marvin-owned provider auth and token lifecycle.
3. Marvin-owned live sync runtime across Microsoft, Google, and Apple / CalDAV.
4. Marvin-owned always-on deployment automation.
5. Honest docs that match the code and tests.
