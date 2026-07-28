# Project Marvin

Project Marvin is a docs-first repo for researching and building automated calendar mirroring.

It is also, regrettably, themed after Marvin from *The Hitchhiker''s Guide to the Galaxy*.
So the repo is technically useful, emotionally exhausted, and structurally better organized than the calendars it is trying to fix.

## The problem

- A meeting added or accepted in one calendar should appear in the other calendars automatically.
- Mirrored events should preserve timing without leaking details where privacy matters.
- The automation should be set once and then left alone.
- The overall process should involve less pointless suffering than manual calendar duplication.

## Solution tracks

- `Paranoid Keeper`: the least foolish multi-provider path, based on `keeper.sh`
- `Bureaucratic Flow`: the Microsoft 365 proof-of-concept path, based on `MShekow/outlook-calendar-sync`
- `Google Hub Of Last Resort`: the Outlook + Google path, based on `OutlookGoogleCalendarSync`
- `Marvin Engine`: the first-party custom sync service skeleton for when ownership matters more than convenience

## Start here

1. Read the [research index](/research/).
2. Review the [architecture direction](/architecture).
3. Review the [solutions page](/solutions).
4. Review the [credits page](/credits).
5. Generate the concrete solution artifacts with `npm run solutions:build`.
