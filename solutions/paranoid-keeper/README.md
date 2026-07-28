# Paranoid Keeper

This is the lead external solution for Project Marvin.

It is based on `keeper.sh` and gives the broadest provider coverage with the least embarrassing long-term architecture.

## Why this path matters

- Microsoft 365 and Outlook support
- Google support
- optional Apple Calendar or CalDAV support
- self-hosted deployment path
- better long-term control than low-code flows

## Local commands

```powershell
./setup-env.ps1
./validate.ps1
./start.ps1
./status.ps1
./test.ps1
```

## Test readiness

This track is ready to test once you provide OAuth credentials in `.env` and have Docker available.

## Files

- `compose.yaml`
- `.env.example`
- `setup-env.ps1`
- `validate.ps1`
- `start.ps1`
- `stop.ps1`
- `status.ps1`
- `test.ps1`
