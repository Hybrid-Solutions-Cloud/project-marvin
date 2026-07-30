# Paranoid Keeper

Paranoid Keeper is the always-on calendar synchronization runtime. It is not a Keeper.sh login wrapper.

## What it does

- Reads connected Microsoft 365, Outlook, Google, and Apple / CalDAV calendars.
- Treats every connected calendar as a source.
- Mirrors each event to every other calendar with a source prefix.
- Defaults every copy to private while preserving full details.
- Applies per-target overrides for family or trusted calendars.
- Preserves source timezone behavior.
- Stores mappings and embeds provider markers to prevent loops.
- Updates existing copies and deletes stale copies.

## Where it runs

- Azure Container Apps is the first supported hosted path.
- Docker Compose on an always-on host is viable for self-hosting.
- Docker Desktop is useful for local setup only, not a reliable always-on host.

After the UI validates all accounts, the runtime starts automatically. Microsoft and Google webhooks wake it early; Apple / CalDAV uses the configured poll interval.

See [Getting Started](/getting-started) and [Azure deployment](/solutions/marvin-azure).