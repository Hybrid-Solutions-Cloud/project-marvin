# Project Marvin

Project Marvin is a docs-first repo for researching and building an automated calendar mirroring system.

The immediate problem is straightforward:

- A meeting added or accepted in one calendar should appear in the other calendars automatically.
- Mirrored events should preserve the timing and enough context to be useful.
- Mirrored events should be marked private or reduced to blocker-level detail where privacy requires it.
- The setup should be durable, scriptable, and maintainable without ongoing manual babysitting.

## What is in this repo

- VitePress-based documentation under `docs/`
- GitHub Pages deployment workflow
- Research spikes comparing Power Automate, custom Graph plus CalDAV automation, and existing open-source tools

## Current recommendation

The leading implementation direction is a small self-hosted sync service that:

1. Reads Microsoft 365 and Outlook calendars through Microsoft Graph.
2. Reads and writes Apple calendars through CalDAV.
3. Mirrors events into target calendars as private blocker events.
4. Stores source-to-target event mappings so updates and deletes stay consistent.
5. Runs from a deployable service with scripted configuration and monitoring.

That gives better long-term control than Power Automate and better privacy guarantees than consumer SaaS sync tools.

## Next steps

1. Pick a target architecture from the research docs.
2. Decide whether to start from an existing open-source sync project or build a narrow custom service.
3. Add deployment code for the chosen approach.
4. Add secrets handling and environment bootstrapping.

See [Research](/research/) for the current spikes.
