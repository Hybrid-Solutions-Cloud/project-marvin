# Paranoid Keeper
## Status
Paranoid Keeper is a **bridge reference**, not Project Marvin's final product boundary.
Marvin remains the operator-facing product, onboarding surface, account-management surface, policy layer, and long-term sync-runtime target.
Keeper stays documented here because it influenced the repo design and can still help as an interim hosted engine pattern.
## What it is good for
Use this page when you need to study or compare:
- an always-on hosted sync bridge shape
- multi-account Microsoft and Google runtime concerns
- one possible Azure Container Apps hosting pattern
- migration ideas while Marvin's own hosted runtime keeps maturing
## Automation status
This reference path is only automated **after** it has already been deployed onto an always-on host.
- Docker Desktop: no, local convenience only
- Docker Compose on always-on Linux: yes
- Azure Container Apps: yes, best documented bridge-hosting pattern here
- Cloudflare Containers: research only
## Important limitation
This is **not** the preferred starting point for a new repo user.
If you want the current Project Marvin path, start with:
- [Getting Started](/getting-started)
- [Marvin Engine](/solutions/marvin-engine)
- [Marvin on Azure](/solutions/marvin-azure)
- [Onboarding UI](/operator/onboarding-ui)
## Architecture summary
Reference components:
- Marvin onboarding and management UI
- shared Marvin profile and saved account state
- generated bridge artifacts
- hosted Marvin front door
- Keeper-based bridge runtime
- external state services such as PostgreSQL and Redis
## What remains provider-authorized
Even in this reference pattern, provider-owned actions still remain outside repo automation:
- Microsoft OAuth app registration and consent
- Google OAuth app registration and consent if Google calendars are used
- first-time provider authorization against the hosted bridge
- live route validation against real customer calendars
## Recommendation
Treat this as a bridge and comparison track.
If you are evaluating what to run next, prefer the Marvin-owned runtime and deployment guides first, then consult this page only if you specifically need the older Keeper-style hosting model.
