# Bureaucratic Flow

This solution track is the Power Automate path for Project Marvin, but it is now explicitly automation-first and Graph-backed.

It is no longer modeled as a hand-built Outlook connector flow.
That would fail the deployment requirement and is the wrong fit for multi-tenant automation.

## Deployment model

- Power Automate runtime can live in a separate automation tenant.
- Calendar access happens through Microsoft Graph.
- The deployment target should use solution-aware cloud flows, connection references, and scripted import.
- The standard Office 365 Outlook connector is not the automation baseline because it does not support service principal authentication.

## Commands

```powershell
./validate.ps1
./build-solution.ps1
./provision-runtime.ps1
./deploy.ps1
./test.ps1
```

## What this gives you

- generated route settings
- a local solution-build staging folder
- an automation runtime plan for a separate Power Platform tenant
- a deployment path that assumes `pac` CLI and Graph-backed connections rather than hand editing flows

## Artifacts

Generated artifacts land under:

- `artifacts/solutions/<profile>/bureaucratic-flow/`
