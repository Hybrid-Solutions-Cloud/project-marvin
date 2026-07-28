# Bureaucratic Flow Import Checklist

Profile: marvin-example

This is the pragmatic Microsoft-only route. Slow, visual, and irritating, but still usable.

## Eligible Calendars

- Work Microsoft 365 (you@work.example.com)
- Contract Microsoft 365 (you@contract.example.com)

## Eligible Routes

- None in this profile.

## Test Sequence

1. Validate local generated inputs with solutions/bureaucratic-flow/validate.ps1
2. Build the staging bundle with solutions/bureaucratic-flow/build-solution.ps1
3. Create Office 365 Outlook connections in Power Automate
4. Import or rebuild the MShekow flow package
5. Apply the settings from flow-settings.json
6. Run a 1-day test window before increasing to 45 days
