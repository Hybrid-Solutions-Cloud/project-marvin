# Paranoid Keeper

## Summary

Paranoid Keeper is the cross-provider automated path for Project Marvin.
It is based on `keeper.sh` and is the best fit when you need Microsoft 365 and Google together, with optional Apple or CalDAV later.

The important constraint is operational, not functional:

- `Keeper` is only truly hands-off if it runs on an always-on host.
- Running it on your laptop with Docker Desktop is a convenience path, not the real deployment model.
- For this repo, the primary hosted target is **Azure Container Apps**.

## Automation status

`Keeper` meets the automation requirement only when deployed to a persistent container runtime.

- `Docker Desktop`: no, this is local convenience only
- `Docker Compose on always-on Linux host`: yes
- `Azure Container Apps`: yes, recommended
- `Cloudflare Containers`: not currently recommended for Keeper as-is

## Problem fit

Use this solution when:

- you need Microsoft 365 and Google together
- Apple or CalDAV may matter later
- you want one always-on hosted service instead of desktop sync clients
- you want a deployment story that can be scripted

## Architecture

Components:

- local Marvin profile
- generated Keeper sync plan
- Keeper container runtime
- persistent data volume for Keeper state
- OAuth provider connections inside Keeper
- hosted web UI for operator sign-in and route setup

## Data flow

1. Marvin onboarding collects calendar inventory and routes.
2. Marvin generator writes Keeper-specific artifacts.
3. Keeper is deployed to an always-on container host.
4. Operator signs into Keeper and binds provider accounts.
5. Keeper executes synchronization continuously.

## Recommended deployment target

Use **Azure Container Apps** first.

Why:

- always-on container hosting with `minReplicas: 1`
- simple public ingress
- Azure Files mount for persistent Keeper data
- clean fit for a single self-hosted web workload
- close to your own preferred Azure operating model

Start here:

- [Keeper Hosting Matrix](/solutions/paranoid-keeper-hosting)
- [Deploy Keeper to Azure Container Apps](/solutions/paranoid-keeper-azure)
- [Cloudflare Evaluation](/solutions/paranoid-keeper-cloudflare)

## Repo files

- `solutions/paranoid-keeper/compose.yaml`
- `solutions/paranoid-keeper/setup-env.ps1`
- `solutions/paranoid-keeper/deploy-azure-container-app.ps1`
- `solutions/paranoid-keeper/validate.ps1`
- `solutions/paranoid-keeper/test.ps1`
- `artifacts/solutions/<profile>/paranoid-keeper/sync-plan.md`

## Fast path

```powershell
npm install
npm run marvin:onboard
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\test.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\setup-env.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\deploy-azure-container-app.ps1
```

## What still requires operator action

This repo can script the runtime deployment.

It cannot fully automate these provider-authorized steps away:

- Microsoft OAuth app registration and consent
- Google OAuth app registration and consent
- first-time Keeper account/provider binding in the Keeper UI
- mapping the final sync routes in Keeper based on the generated Marvin sync plan

Those are normal identity-bound steps, not local-manual runtime steps.

## Risks

- provider OAuth registration complexity
- provider-specific recurrence behavior
- route configuration still occurs inside Keeper UI rather than fully from Marvin
- hosted runtime still needs backup, update, and monitoring policy

## Recommendation

If you need one automated cross-provider runtime, use Keeper on Azure Container Apps.
