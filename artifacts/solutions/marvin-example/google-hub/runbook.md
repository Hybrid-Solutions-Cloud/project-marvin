# Google Hub Of Last Resort Runbook

Profile: marvin-example

This is the compromise option. One introduces Google as an availability hub because direct elegance was apparently unavailable.

## Outlook <-> Google Pairs

- Work Microsoft 365 <-> Personal Google
- Contract Microsoft 365 <-> Personal Google

## Test Sequence

1. Validate generated inputs with solutions/google-hub/validate.ps1
2. Install OGCS with solutions/google-hub/install-ogcs.ps1
3. Render the XML with solutions/google-hub/render-settings.ps1
4. Open OGCS and bind Outlook calendars to the Google hub
5. Start with a limited date window

## Notes

- This is not the strongest fit for direct multi-M365 mirroring.
- It is useful when you want one Google visibility hub and are comfortable running a desktop sync tool.
- Apple Calendar is not directly covered by this solution.
