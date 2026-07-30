# Paranoid Keeper Sync Plan

Profile: marvin-example
Timezone: America/New_York
Sync window: 45 days

Historical reference artifact only. Paranoid Keeper is the product path.

## Route Summary

- Work Microsoft 365 -> Contract Microsoft 365, Personal Google, Family Google, Personal Apple (full)
- Contract Microsoft 365 -> Work Microsoft 365, Personal Google, Family Google, Personal Apple (full)
- Personal Google -> Work Microsoft 365, Contract Microsoft 365, Family Google, Personal Apple (full)
- Family Google -> Work Microsoft 365, Contract Microsoft 365, Personal Google, Personal Apple (full)

## Provider Coverage

- Microsoft 365 and Outlook: marvin-engine
- Google: marvin-engine
- Apple Calendar: manual-caldav

## Policy Coverage

- private-by-default mirrored events
- per-target visibility overrides
- automatic per-source prefixes
- preserve original event timezone

## Detailed Route Notes

## Work Microsoft 365

Source provider: m365
Source prefix: "WORK: "
- Contract Microsoft 365: visibility=private, detailMode=full, prefix="WORK: "
- Personal Google: visibility=private, detailMode=full, prefix="WORK: "
- Family Google: visibility=default, detailMode=full, prefix="WORK: "
- Personal Apple: visibility=private, detailMode=full, prefix="WORK: "

## Contract Microsoft 365

Source provider: m365
Source prefix: "CONTRACT: "
- Work Microsoft 365: visibility=private, detailMode=full, prefix="CONTRACT: "
- Personal Google: visibility=private, detailMode=full, prefix="CONTRACT: "
- Family Google: visibility=default, detailMode=full, prefix="CONTRACT: "
- Personal Apple: visibility=private, detailMode=full, prefix="CONTRACT: "

## Personal Google

Source provider: google
Source prefix: "GOOGLE: "
- Work Microsoft 365: visibility=private, detailMode=full, prefix="GOOGLE: "
- Contract Microsoft 365: visibility=private, detailMode=full, prefix="GOOGLE: "
- Family Google: visibility=default, detailMode=full, prefix="GOOGLE: "
- Personal Apple: visibility=private, detailMode=full, prefix="GOOGLE: "

## Family Google

Source provider: google
Source prefix: "FAMILY: "
- Work Microsoft 365: visibility=private, detailMode=full, prefix="FAMILY: "
- Contract Microsoft 365: visibility=private, detailMode=full, prefix="FAMILY: "
- Personal Google: visibility=private, detailMode=full, prefix="FAMILY: "
- Personal Apple: visibility=private, detailMode=full, prefix="FAMILY: "
