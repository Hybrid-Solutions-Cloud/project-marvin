# Spike: Power Automate

## Summary

Power Automate is a valid proof-of-concept path for Outlook and Microsoft 365 calendars, but it is not the best foundation for a long-lived multi-provider system that must also include Apple calendars and scripted deployment.

## Why it is relevant

The repo you called out, `MShekow/outlook-calendar-sync`, packages a real Power Automate flow for synchronizing two Outlook calendars.

Its core design is sound:

- scheduled synchronization
- blocker-event mirroring
- event-id tracking
- loop prevention with a subject prefix

That design can be generalized, even if Power Automate itself is not the final platform.

## What the published flow does well

- Handles two Outlook calendars with a scheduled sync.
- Uses source event identifiers to find corresponding mirror events.
- Avoids infinite loop behavior by skipping sync-marker events.
- Supports privacy reduction by hiding subject and body details.

## Known drawbacks

- Slow execution on larger event sets.
- Action-count limits and throttling.
- Low-code maintenance overhead.
- Weak story for scripted deployment and versioned infrastructure.
- Apple Calendar support is not a clean first-class path.

## Best use in Project Marvin

Use it as:

- a reference implementation for the sync algorithm
- a temporary fallback for Outlook-to-Outlook mirroring
- a way to validate privacy rules and blocker behavior with minimal code

Do not use it as:

- the final cross-provider architecture
- the main deployment target if you want scripted, repeatable setup

## Design takeaways to carry forward

- Scheduled reconciliation is simpler than raw event-trigger fanout.
- Mirror events need a stable mapping to their source.
- Loop prevention must be explicit.
- Privacy policy should be configurable per destination calendar.

## Spike outcome

Verdict: useful reference, not preferred final platform.
