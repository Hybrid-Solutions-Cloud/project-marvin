# ADR 0001: Durable Single-Replica State

_Status: accepted · Tracking: AB#7671, AB#7672_

## Decision

Project Marvin uses versioned JSON state on one durable filesystem mounted by exactly one active runtime replica. Local development uses the repository-local `.marvin` directory. Azure Container Apps mounts one Azure Files share at `/data` and is fixed at `minReplicas: 1` and `maxReplicas: 1`.

Token and provider-secret files use AES-256-GCM authenticated encryption. Local development creates a permission-restricted data-protection key under `.marvin/keys`. Hosted mode refuses credential access unless `MARVIN_DATA_PROTECTION_KEY` is supplied from the deployment secret store.

All runtime state writes use a same-directory temporary file, flush it, and atomically rename it over the previous version. Each state document records `_schemaVersion`; the runtime rejects versions newer than it understands.

## Why this design

- Reliability: atomic replacement prevents an interrupted write from corrupting the last valid document.
- Operating cost: Azure Files and one Container App replica match the initial single-workspace product without adding a database service.
- Consistency: one writer avoids distributed locking and split-brain mapping updates.
- Security: provider credentials are not readable from persisted JSON or portal responses.
- Portability: the engine uses the same storage interface locally and in Azure.

## Constraints

- Scaling above one active replica is unsupported until state moves to a transactional database or distributed locking is implemented.
- The data-protection key must be backed up separately from encrypted state and preserved during deployment upgrades.
- Filesystem snapshots or Azure Files backup provide point-in-time recovery; copying live files individually is not a consistent backup procedure.
- Schema migrations must be forward-only, tested from the oldest supported version, and performed before the runtime begins provider work.

## Rejected alternatives

- In-memory state: loses sessions, mappings, subscriptions, and activity on restart.
- Plain JSON secrets: exposes refresh tokens and app passwords in the mounted share.
- Multiple writable replicas on Azure Files: requires coordination that the current product does not provide.
- A managed database in the first release: stronger scaling characteristics but unnecessary cost and operational complexity for one workspace.

## Recovery

Restore the Azure Files snapshot and its matching data-protection key, deploy the same or a migration-compatible application version, validate state schemas, run Diagnostics, and only then resume synchronization.
