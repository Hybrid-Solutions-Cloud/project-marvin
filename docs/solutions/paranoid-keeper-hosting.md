# Keeper Hosting Matrix

Project Marvin can package Keeper for several runtime patterns, but they are not equivalent.

## Deployment options

| Option | Automated after setup | Good fit | Status in this repo |
| --- | --- | --- | --- |
| Docker Desktop | No | local testing only | documented |
| Docker Compose on always-on Linux host | Yes | simple self-hosting on VM, NAS, or mini PC | documented |
| Azure Container Apps | Yes | best Azure-first hosted path | implemented first |
| Azure App Service for Containers | Maybe | acceptable if you already standardize on App Service | documented as secondary |
| Cloudflare Containers | Not cleanly for Keeper as-is | research only | documented as not primary |
| AWS ECS/Fargate | Yes | future option | not yet implemented |
| Google Cloud Run | Maybe | future option | not yet implemented |

## How to think about them

### Docker Desktop

Use this for initial smoke tests only.

Do not treat it as the real answer for unattended sync because:

- your workstation can sleep or reboot
- Docker Desktop can stop
- this is still a user-managed local runtime

### Docker Compose on always-on host

This is the simplest real self-hosting model.

Good examples:

- small Linux VM
- home server or NAS
- always-on Intel NUC or mini PC

This is valid if you want low cost and direct control.

### Azure Container Apps

This is the recommended Project Marvin hosted path.

Why it fits Keeper well:

- the app is packaged as a container already
- you can force always-on behavior with `minReplicas: 1`
- Azure Files can persist the Keeper data directory
- deployment can be scripted with Azure CLI
- ingress and revisions are built in

### Azure App Service for Containers

This can run a custom container, but it is not the first choice here.

Why it is secondary:

- Keeper needs persistent internal state
- Azure Container Apps maps more naturally to container lifecycle and volume mounting for this workload
- the repo implementation work is better spent on ACA first

### Cloudflare Containers

Cloudflare Containers are promising, but not the clean answer for Keeper right now.

Current Cloudflare architecture is request-routed through Workers and Durable Objects, with container lifecycle tied to that model. That is a different operational shape than a straightforward always-on sync daemon with mounted state.

For Project Marvin, that means Cloudflare is a research path, not a production-ready Keeper deployment target today.

## Recommendation

If you want the fewest surprises:

1. Use Azure Container Apps.
2. Use Docker Compose on an always-on Linux host if you want cheaper self-hosting.
3. Do not choose Cloudflare for Keeper until the repo grows a dedicated Cloudflare-native adaptation layer.

## Next pages

- [Paranoid Keeper](/solutions/paranoid-keeper)
- [Deploy Keeper to Azure Container Apps](/solutions/paranoid-keeper-azure)
- [Cloudflare Evaluation](/solutions/paranoid-keeper-cloudflare)
