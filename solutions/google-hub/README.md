# Google Hub Of Last Resort

This solution track is based on `OutlookGoogleCalendarSync`.

It introduces Google Calendar as the central availability hub between Outlook calendars.
That is not elegant, but neither is the problem.

## Commands

```powershell
./install-ogcs.ps1
./validate.ps1
./render-settings.ps1
./test.ps1
```

## What this gives you

- generated OGCS settings XML
- a render script to place the XML where OGCS expects it
- validation and test guidance

## Artifacts

Generated artifacts land under:

- `artifacts/solutions/<profile>/google-hub/`
