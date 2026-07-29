# Paranoid Keeper Sync Plan

Profile: marvin-example
Timezone: America/New_York
Sync window: 45 days

This remains the external runtime reference while Marvin Engine becomes the product-owned path.

## Route Summary

- Work Microsoft 365 -> Contract Microsoft 365, Personal Google, Family Google, Personal Apple (subject)
- Contract Microsoft 365 -> Work Microsoft 365, Personal Google, Family Google, Personal Apple (subject)
- Personal Google -> Work Microsoft 365, Contract Microsoft 365, Family Google, Personal Apple (subject)
- Family Google -> Work Microsoft 365, Contract Microsoft 365, Personal Google, Personal Apple (subject)

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
Source prefix: WORK: 
- Contract Microsoft 365: visibility=private, detailMode=subject, prefix=WORK: 
- Personal Google: visibility=private, detailMode=subject, prefix=WORK: 
- Family Google: visibility=default, detailMode=full, prefix=WORK: 
- Personal Apple: visibility=private, detailMode=subject, prefix=WORK: 

## Contract Microsoft 365

Source provider: m365
Source prefix: CONTRACT: 
- Work Microsoft 365: visibility=private, detailMode=subject, prefix=CONTRACT: 
- Personal Google: visibility=private, detailMode=subject, prefix=CONTRACT: 
- Family Google: visibility=default, detailMode=full, prefix=CONTRACT: 
- Personal Apple: visibility=private, detailMode=subject, prefix=CONTRACT: 

## Personal Google

Source provider: google
Source prefix: GOOGLE: 
- Work Microsoft 365: visibility=private, detailMode=subject, prefix=GOOGLE: 
- Contract Microsoft 365: visibility=private, detailMode=subject, prefix=GOOGLE: 
- Family Google: visibility=default, detailMode=full, prefix=GOOGLE: 
- Personal Apple: visibility=private, detailMode=subject, prefix=GOOGLE: 

## Family Google

Source provider: google
Source prefix: FAMILY: 
- Work Microsoft 365: visibility=private, detailMode=subject, prefix=FAMILY: 
- Contract Microsoft 365: visibility=private, detailMode=subject, prefix=FAMILY: 
- Personal Google: visibility=private, detailMode=subject, prefix=FAMILY: 
- Personal Apple: visibility=private, detailMode=subject, prefix=FAMILY: 
