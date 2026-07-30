# Architecture

## Product boundary

Project Marvin is the repository and theme. Paranoid Keeper is the deployed calendar-sync product.

## Runtime flow

```text
Provider event -> webhook or poll -> Paranoid Keeper daemon
  -> source normalization -> full mesh planner -> target policy
  -> Microsoft Graph / Google Calendar / CalDAV write -> mapping store
```

The mapping store records source and target identities. Provider markers on generated copies stop those events from becoming sources again.

## Mirror policy

Each source event is routed to every other connected calendar. Per-target policy controls visibility and detail.

| Setting | Default | Family override |
| --- | --- | --- |
| Subject | `<PREFIX><SUBJECT>` | Same, unless changed |
| Location | Copied | Copied, unless changed |
| Description | Copied | Copied, unless changed |
| Visibility | Private | Private by default; may be changed to normal |
| Timezone | Source timezone | Source timezone |

## Provider automation

- Microsoft Graph and Google subscriptions request an early daemon wake on changes; the daemon also renews those subscriptions.
- Apple / CalDAV is polled by the always-running daemon.
- Token refresh, connection validation, stale mirror deletion, and update/upsert handling are owned by the runtime.

## State

Profiles, provider credentials, tokens, mappings, subscription state, and runtime status are persisted beneath `.marvin/` locally or the Azure Files `/data` mount when hosted.