# Project Marvin

Project Marvin is the repository and documentation home for **Paranoid Keeper**: an always-on calendar mirroring application.

## What Paranoid Keeper does

- Connects Microsoft 365, Outlook.com, Google Calendar, and optional Apple / CalDAV calendars.
- Treats every connected calendar as a source and mirrors each event to every other calendar.
- Copies subject, location, description, and the source event timezone.
- Prefixes every mirrored subject with its source account prefix, such as `WORK: ` or `FAMILY: `.
- Makes copied events private by default. Trusted family targets can override visibility and detail rules.
- Marks its own copies and stores mappings, so copied events never loop back into the mesh.
- Runs continuously after setup. Microsoft and Google webhooks wake it early; Apple / CalDAV polls on the configured interval.

## Start Here

```powershell
npm run marvin:install
npm run marvin:ui
```

Open `http://127.0.0.1:4177`, create the Paranoid Keeper workspace account, add calendars, link them, and check access. The runtime starts automatically after every account validates.

For Azure Container Apps, use the same application through the [Azure deployment guide](/solutions/marvin-azure).

## Current Evidence

The repository contains the working sync engine, provider adapters, OAuth and CalDAV validation paths, first-run and management UI, installer, and Azure Container Apps Bicep deployment. Local smoke coverage verifies the product flows. A real production test still requires the operator's actual provider accounts and consent, which cannot be represented in this public repository.

## Read Next

- [Getting Started](/getting-started)
- [Architecture](/architecture)
- [Paranoid Keeper](/solutions/paranoid-keeper)
- [Azure deployment](/solutions/marvin-azure)
- [Requirements](/requirements)
- [Credits](/credits)