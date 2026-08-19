# Spike: Existing Open-Source Tools

## Summary

There are credible community examples, but they split into two categories:

- point solutions for a narrow provider pair
- broader sync engines that may already cover Outlook and Apple

## Candidate tools

### `MShekow/outlook-calendar-sync`

Use when:

- you want a Power Automate package for Outlook-to-Outlook

Pros:

- directly relevant
- concrete algorithm
- quick proof of concept

Cons:

- Outlook-focused
- Power Automate operational limits still apply

### `phw198/OutlookGoogleCalendarSync`

Use when:

- you want a mature example of calendar mapping, privacy controls, and bidirectional sync behavior

Pros:

- long-lived project
- proven sync concepts
- privacy and filtering features

Cons:

- Google-focused rather than Apple-focused
- desktop-tool operational model

## Recommendation

Keep `MShekow/outlook-calendar-sync` as an algorithm reference and fallback proof of concept for two Microsoft calendars.

Treat `OutlookGoogleCalendarSync` as a design reference, not the main base.
