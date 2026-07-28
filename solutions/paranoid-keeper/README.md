# Paranoid Keeper

This is the lead cross-provider automated solution for Project Marvin.

It is based on `keeper.sh` and gives the broadest provider coverage without relying on a desktop sync client.

## Why this path matters

- Microsoft 365 and Outlook support
- Google Calendar support
- optional Apple Calendar or CalDAV support later
- self-hosted deployment path
- better long-term control than low-code flows

## The real runtime model

Keeper only satisfies the Project Marvin automation requirement when it runs on an always-on host.

That means:

- `Docker Desktop` is for local testing only
- `Docker Compose` on an always-on Linux host is valid
- `Azure Container Apps` is the repo's primary hosted deployment target

## Recommended docs

- `docs/solutions/paranoid-keeper.md`
- `docs/solutions/paranoid-keeper-hosting.md`
- `docs/solutions/paranoid-keeper-azure.md`
- `docs/solutions/paranoid-keeper-cloudflare.md`

## Local commands

```powershell
./setup-env.ps1
./validate.ps1
./test.ps1
./start.ps1
./status.ps1
```

## Azure deployment command

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-azure-container-app.ps1 `
  -ResourceGroupName marvin-keeper-rg `
  -Location eastus `
  -EnvironmentName marvin-keeper-env `
  -AppName marvin-keeper
```

## Files

- `compose.yaml`
- `.env.example`
- `setup-env.ps1`
- `deploy-azure-container-app.ps1`
- `validate.ps1`
- `start.ps1`
- `stop.ps1`
- `status.ps1`
- `test.ps1`
