# Google Hub Of Last Resort

## Summary

Google Hub Of Last Resort is the OGCS-based path using `OutlookGoogleCalendarSync`.
It is the fallback strategy when you accept Google Calendar as the bridge between Outlook calendars.

## Design

### Problem fit

Use this solution when:

- you are willing to let Google be the central availability hub
- you are comfortable with a desktop-managed sync tool
- you want a practical fallback rather than a clean platform story

### Architecture

Components:

- local Marvin profile
- generated OGCS XML settings
- generated OGCS runbook
- local OGCS desktop runtime
- manual provider sign-in inside OGCS

### Data flow

1. Marvin onboarding collects the calendar inventory.
2. Marvin generator creates OGCS XML from the profile.
3. The rendered settings file is copied into the OGCS runtime folder.
4. The operator signs into Outlook and Google inside OGCS.
5. OGCS performs the synchronization through the Google hub.

## Implementation

### Repo files

- `solutions/google-hub/install-ogcs.ps1`
- `solutions/google-hub/render-settings.ps1`
- `solutions/google-hub/validate.ps1`
- `solutions/google-hub/test.ps1`
- `artifacts/solutions/<profile>/google-hub/settings.template.xml`

### Environment requirements

- OGCS installed locally
- Google account available as central hub
- Outlook account sign-in in OGCS

### Validation model

The repo validation checks only the generated local files.
Provider authentication and live testing occur in the OGCS desktop UI.

## How To Use

### Fast path

```powershell
npm install
npm run marvin:onboard
powershell -ExecutionPolicy Bypass -File .\solutions\google-hub\test.ps1
powershell -ExecutionPolicy Bypass -File .\solutions\google-hub\render-settings.ps1
```

### Then do this

1. Install OGCS.
2. Render the generated XML into the OGCS config location.
3. Open OGCS.
4. Sign in to Outlook and Google.
5. Map the Outlook calendars to the Google hub.
6. Test with a limited date window.

## Testing plan

### First pilot

- create event in work Outlook calendar
- verify it appears as expected in the Google hub
- verify other Outlook path reflects it through the hub
- validate privacy settings on mirrored entries

## Risks

- desktop runtime dependence
- Google becomes a structural dependency
- Apple remains outside the main path
- operational behavior depends on OGCS client state

## Recommendation

Use this only if the Google hub compromise is acceptable.
