# Bureaucratic Flow

## Summary

Bureaucratic Flow is the Power Automate path for Project Marvin.
It is now explicitly designed for scripted deployment and cross-tenant runtime separation.

## Critical design decision

This track does **not** treat the `Office 365 Outlook` connector as the primary automation surface.
That connector is inappropriate for unattended deployment because it does not support service principal authentication.

The automation-first model instead assumes:

- a Power Platform environment in an automation tenant
- solution-aware cloud flows
- connection references
- Microsoft Graph-backed calls through HTTP with Microsoft Entra ID or a custom Graph connector
- multitenant app registration and consent in each target calendar tenant

## Problem fit

Use this solution when:

- you need Power Automate for governance or platform reasons
- you need the runtime to live in a tenant separate from the target calendar tenants
- the calendars being synchronized are primarily Microsoft 365 calendars

## Architecture

### Runtime tenant

The flow itself runs in one Power Platform environment that can belong to a separate automation tenant.

### Target calendar tenants

The calendars can live in one or more unrelated Microsoft 365 tenants.

### Identity model

The automation tenant hosts:

- the solution-aware cloud flow
- connection references
- the Graph-backed connector configuration
- the multitenant application registration metadata used by the runtime

Each target calendar tenant must:

- create or accept a service principal for the multitenant app
- grant the required Graph calendar consent

## Deployment model

### Scripted path

1. Generate Marvin profile and artifacts. If you want the lower-level setup generator to ask for Bureaucratic Flow runtime values interactively, run `npm run marvin:setup` through `scripts/setup-marvin.ps1` with `-IncludeBureaucraticFlow`.
2. Build the Power Automate staging bundle.
3. Generate the automation runtime plan.
4. Import the solution through `pac solution import`.
5. Bind Graph-backed connection references.
6. Grant multitenant app consent in each calendar tenant.

The repo now also carries an explicit opt-in proof command for this reference path: `npm run marvin:smoke-bureaucratic-flow-opt-in`.

### Repo files

- `solutions/bureaucratic-flow/build-solution.ps1`
- `solutions/bureaucratic-flow/provision-runtime.ps1`
- `solutions/bureaucratic-flow/deploy.ps1`
- `solutions/bureaucratic-flow/runtime.example.json`

## How To Use

### Fast path

```powershell
npm install
npm run marvin:onboard
powershell -ExecutionPolicy Bypass -File .\solutions\bureaucratic-flow\test.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\bureaucratic-flow\deploy.ps1 -ProfilePath .\profiles\marvin.local.json -ProfileName marvin.local
```

### What the scripts do

- `build-solution.ps1`: prepares the local bundle
- `provision-runtime.ps1`: creates a runtime plan for the automation tenant
- `deploy.ps1`: ties the two together and prepares for `pac`-based import

## Multi-tenant support

Yes, this design is meant to support multiple unrelated Microsoft 365 tenants.

The important condition is that the automation runtime tenant is separate from the calendar tenants only at the orchestration layer.
The Graph application still needs admin consent in each tenant whose calendars it touches.

## Risks

- multitenant app consent across separate customer or work tenants
- Power Platform environment governance and licensing
- more complex connection and ALM model than a local app

## Recommendation

This is the correct Power Automate architecture if you insist on automation-first deployment and separate runtime tenancy.
