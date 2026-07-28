# Bureaucratic Flow

## Summary

Bureaucratic Flow is the Power Automate path based on `MShekow/outlook-calendar-sync`.
This is the most reasonable solution when the problem is mainly Microsoft 365 talking to Microsoft 365.

## Design

### Problem fit

Use this solution when:

- most calendars are Microsoft 365 or Outlook
- you already live in Power Automate
- you want a low-code proof of concept before committing to a custom engine

### Architecture

Components:

- local Marvin profile
- generated flow settings JSON
- generated import checklist
- Power Automate flow package or reconstructed flow
- Office 365 Outlook connections in the tenant

### Data flow

1. Marvin onboarding collects calendar inventory and routes.
2. Marvin generator filters the profile to M365-compatible routes.
3. Generated settings are used to parameterize the flow.
4. Power Automate runs scheduled synchronization.

## Implementation

### Repo files

- `solutions/bureaucratic-flow/build-solution.ps1`
- `solutions/bureaucratic-flow/validate.ps1`
- `solutions/bureaucratic-flow/test.ps1`
- `solutions/bureaucratic-flow/connections.example.json`
- `artifacts/solutions/<profile>/bureaucratic-flow/flow-settings.json`

### Environment requirements

- Microsoft tenant access
- Power Automate access
- Office 365 Outlook connectors for each participating account

### Validation model

The repo validation checks only generated local artifacts.
Tenant validation still occurs in Power Automate itself.

## How To Use

### Fast path

```powershell
npm install
npm run marvin:onboard
powershell -ExecutionPolicy Bypass -File .\solutions\bureaucratic-flow\test.ps1
```

### Then do this

1. Open the generated `flow-settings.json`.
2. Open the generated import checklist.
3. Create the required Outlook connector instances.
4. Import or rebuild the upstream flow in Power Automate.
5. Apply the generated route settings.
6. Test with a narrow 1 day window.

## Testing plan

### First pilot

- work M365 event mirrors to contract M365
- contract M365 event mirrors to work M365
- blocker details remain private
- loop prevention works

## Risks

- low-code maintenance fatigue
- flow action limits and throttling
- no elegant Apple path
- tenant-bound configuration rather than self-hosted portability

## Recommendation

Use this when the requirement is M365-first and speed matters more than elegance.
