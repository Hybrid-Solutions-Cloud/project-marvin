# Paranoid Keeper Sync Plan

Profile: marvin-example
Timezone: America/New_York
Sync window: 45 days

Yes, this is the least ridiculous external option.

## Route Summary

- Work Microsoft 365 -> Contract Microsoft 365, Personal Google, Personal Apple (busy)
- Contract Microsoft 365 -> Work Microsoft 365, Personal Google, Personal Apple (busy)
- Personal Google -> Work Microsoft 365, Contract Microsoft 365 (busy)

## Provider Coverage

- Microsoft 365 and Outlook: supported via Microsoft OAuth
- Google: supported via Google OAuth
- Apple Calendar: optional via iCloud or CalDAV setup

## Test Sequence

1. Create the local .env with solutions/paranoid-keeper/setup-env.ps1
2. Validate prerequisites with solutions/paranoid-keeper/validate.ps1
3. Start the stack with solutions/paranoid-keeper/start.ps1
4. Configure provider connections in Keeper UI
5. Apply the routes listed below

## Detailed Route Notes

## Work Microsoft 365

Source provider: m365
Mirror mode: busy
Targets: Contract Microsoft 365, Personal Google, Personal Apple
Subject prefix: BUSY: 

## Contract Microsoft 365

Source provider: m365
Mirror mode: busy
Targets: Work Microsoft 365, Personal Google, Personal Apple
Subject prefix: BUSY: 

## Personal Google

Source provider: google
Mirror mode: busy
Targets: Work Microsoft 365, Contract Microsoft 365
Subject prefix: BUSY: 
