# Paranoid Keeper

## Summary

Paranoid Keeper is the primary backend sync engine for Project Marvin.

The operator-facing product is Marvin. Keeper runs underneath it as the hosted synchronization engine for the main Azure path.

## Automation status

This path meets the automation requirement when it is deployed to an always-on host.

- `Docker Desktop`: no, convenience only
- `Docker Compose on always-on Linux host`: yes
- `Azure Container Apps`: yes, recommended
- `Cloudflare Containers`: still secondary for this repo

## Problem fit

Use this solution when:

- you need multi-M365 mirroring with private blockers
- Google may also need to participate
- you want an always-on hosted runtime
- you want a scripted deployment path

## Architecture

Components:

- local Marvin onboarding UI
- shared Marvin profile
- generated Keeper sync plan
- hosted Marvin front door
- Keeper backend engine
- PostgreSQL and Redis for the hosted runtime

## Data flow

1. Marvin onboarding collects account inventory and routes.
2. Marvin generates Keeper-specific artifacts.
3. Azure deploys the hosted Marvin runtime.
4. The operator lands on Marvin first.
5. Marvin routes provider linking into the backend Keeper path.
6. Keeper executes synchronization continuously.

## Recommended deployment target

Use **Azure Container Apps** first.

Start here:

- [Keeper Hosting Matrix](/solutions/paranoid-keeper-hosting)
- [Deploy Keeper to Azure Container Apps](/solutions/paranoid-keeper-azure)
- [Cloudflare Evaluation](/solutions/paranoid-keeper-cloudflare)

## Fast path

```powershell
npm install
npm run marvin:ui
```

Then:

1. Create the Marvin operator account.
2. Save the shared Marvin profile.
3. Deploy the hosted runtime.
4. Open the hosted Marvin URL.
5. Use the Marvin flow to continue into provider linking.

## What still requires provider-authorized action

This repo now scripts the onboarding artifacts and hosted runtime deployment.

These steps still remain provider-authorized:

- Microsoft OAuth app registration and consent
- Google OAuth app registration and consent if used
- first-time provider authorization in the backend engine
- final route confirmation against the generated sync plan

## Recommendation

If you need one automated hosted path now, use Marvin on Azure Container Apps with Paranoid Keeper underneath it.
