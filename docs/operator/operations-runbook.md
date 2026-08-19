# Runbook: Project Marvin Operations and Recovery

**Owner:** Project Marvin deployment operator | **Frequency:** Daily checks and as needed
**Last Updated:** 2026-08-19

## Purpose

Operate, diagnose, back up, restore, upgrade, and recover an installation using the **Experimental** Azure Container Apps reference adapter. This runbook is not evidence that Azure or any private installation is Supported. See [Platform support](/platform-support) for the authoritative maturity label. This runbook never authorizes provider calendar deletion. Keep `MARVIN_PROVIDER_DELETE_MODE=disabled` throughout every procedure.

## Prerequisites

- [ ] Azure CLI authenticated to the target subscription
- [ ] Contributor access to the target Project Marvin resource group
- [ ] Repository checkout at the release commit being operated
- [ ] ADO change or incident record for restore, rotation, or production-affecting recovery
- [ ] Operator sign-in to the Project Marvin portal

## Procedure

### Step 1: Check liveness and readiness

```powershell
$subscriptionId = '<subscription-guid>'
$resourceGroup = '<resource-group>'
$containerApp = '<container-app-name>'
$storageAccount = '<storage-account-name>'
$storageShare = '<storage-share-name>'
$marvinUrl = 'https://<your-hostname>'
Invoke-RestMethod "$marvinUrl/api/health/live"
Invoke-RestMethod "$marvinUrl/api/health/ready"
```

**Expected result:** Liveness returns HTTP 200. Readiness returns `ready`, `attention`, or `setup-required`; `degraded` returns HTTP 503 with a redacted alert code.
**If it fails:** Check the active revision and replica before changing state.

```powershell
az account set --subscription $subscriptionId
az containerapp revision list --name $containerApp --resource-group $resourceGroup --query "[?properties.active].{name:name,state:properties.runningState,replicas:properties.replicas}" -o table
```

### Step 2: Confirm delete safety and secret references

```powershell
az containerapp show --name $containerApp --resource-group $resourceGroup --query "properties.template.containers[0].env[?name=='MARVIN_PROVIDER_DELETE_MODE'].value" -o tsv
az containerapp secret list --name $containerApp --resource-group $resourceGroup --query "[].name" -o tsv
```

**Expected result:** Delete mode is `disabled`. Secret names include `entra-client-secret`, `microsoft-calendar-client-secret`, `data-protection-key`, and `backup-protection-key`.
**If it fails:** Stop. Do not run provider validation. Redeploy the last approved commit with the documented Azure reference script.

### Step 3: Check runtime evidence

Sign in to the portal, open **Diagnostics**, and inspect runtime state, consecutive failures, next poll, token counts, subscriptions, and alerts. Use **Activity > Retry and reconcile** only after the provider or configuration problem is corrected.

**Expected result:** The requested reconciliation is queued and the next runtime cycle retries idempotently. A poison operation is retained as failure evidence while unrelated calendars continue.
**If it fails:** Preserve the correlation ID shown by the API, the timestamp, provider, calendar ID, and error class. Never copy event bodies or credentials into ADO.

### Step 4: Verify an automatic backup

Automatic encrypted backups run every 24 hours and retain 14 days under `.marvin/backups` on the mounted Azure Files share.

```powershell
$storageKey = az storage account keys list --resource-group $resourceGroup --account-name $storageAccount --query '[0].value' -o tsv
az storage file list --account-name $storageAccount --account-key $storageKey --share-name $storageShare --path '.marvin/backups' --query "[?ends_with(name, '.marvinbackup')].{name:name,size:properties.contentLength,lastModified:properties.lastModified}" -o table
```

**Expected result:** A recent `automatic-*.marvinbackup` file exists and has a nonzero size.
**If it fails:** Check Container App logs for the structured `state.backup` event. Do not print the backup passphrase or secret values.

### Step 5: Create and verify an operator backup locally

```powershell
$backupPath = Join-Path ([IO.Path]::GetTempPath()) 'marvin-prechange.marvinbackup'
$env:MARVIN_BACKUP_PASSPHRASE = Read-Host 'Backup passphrase' -AsSecureString | ConvertFrom-SecureString -AsPlainText
node scripts/marvin-state-tool.mjs backup --root . --output $backupPath
node scripts/marvin-state-tool.mjs verify --input $backupPath
Remove-Item Env:MARVIN_BACKUP_PASSPHRASE
```

**Expected result:** Backup and verification report `ok: true`; the backup is an AES-256-GCM envelope and contains no plaintext credentials.
**If it fails:** Do not begin the change. Correct the passphrase, path, or state-integrity issue first.

### Step 6: Validate a restore in isolation

```powershell
$backupPath = Join-Path ([IO.Path]::GetTempPath()) 'marvin-prechange.marvinbackup'
$restoreRoot = Join-Path ([IO.Path]::GetTempPath()) 'marvin-restore-validation'
$repoRoot = (Resolve-Path .).Path
New-Item -ItemType Directory -Path $restoreRoot -Force | Out-Null
$env:MARVIN_BACKUP_PASSPHRASE = Read-Host 'Backup passphrase' -AsSecureString | ConvertFrom-SecureString -AsPlainText
node scripts/marvin-state-tool.mjs restore --input $backupPath --target-root $restoreRoot
Push-Location $restoreRoot
node "$repoRoot\scripts\marvin-doctor.mjs"
Pop-Location
Remove-Item Env:MARVIN_BACKUP_PASSPHRASE
```

**Expected result:** Integrity checks pass before writing; profiles, configuration, mappings, subscriptions, and encrypted credential stores are restored; runtime PID/status files are excluded.
**If it fails:** Keep the live deployment unchanged. Record the backup creation time, tool version, and safe error text in ADO.

### Step 7: Deploy or upgrade

```powershell
pwsh -NoProfile -File .\scripts\verify-marvin.ps1 -SkipProviderSmokes
npm run marvin:azure:deploy -- -SubscriptionId $subscriptionId -WorkloadName marvin -Environment dev -RegionShort wus3 -Instance 01 -Location westus3 -PublicBaseUrl $marvinUrl
```

**Expected result:** Tests pass, Bicep deploys a new healthy revision, existing protected secrets are reused, and stored schema versions are accepted or migrated with a sibling `.migration-backup` safety copy.
**If it fails:** Keep traffic on the last healthy revision. Unknown future schemas fail closed; do not edit `_schemaVersion` manually.

### Step 8: Reauthorize or rotate provider access

- Microsoft or Google: use **Reconnect** in the portal after application credential rotation or provider revocation.
- Apple: revoke the old app-specific password in Apple, create a replacement, and use **Replace password**, then rerun discovery and capabilities.
- Entra application credentials: deploy with `-RotateEntraCredentials` only inside an approved change. Verify portal sign-in and Microsoft OAuth before revoking the prior credential.
- Backup protection: create a new encrypted backup with the new escrowed key before expiring backups protected by the old key.

**Expected result:** New access works before old access is revoked. Values never appear in command output, logs, or ADO.
**If it fails:** Retain the old credential, restore the last healthy revision/configuration, and escalate.

## Verification

- [ ] `/api/health/live` is HTTP 200
- [ ] `/api/health/ready` is not `degraded`
- [ ] Portal sign-in works
- [ ] Runtime completes a reconciliation with no unexpected failures
- [ ] `MARVIN_PROVIDER_DELETE_MODE` is `disabled`
- [ ] Automatic encrypted backup is recent and verifies in isolation
- [ ] No secret value or event content was written to logs or ADO

## Troubleshooting

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `SYNC_STOPPED` | Daemon exited or was manually stopped | Inspect the active revision and runtime state; correct auth/state errors, then start the runtime |
| `REPEATED_FAILURE` | Provider or one operation failed at least three consecutive cycles | Correct provider access, then use **Retry and reconcile** |
| `SYNC_STALE` | No completed run within three poll intervals | Inspect replica health and daemon process evidence |
| Backup authentication failed | Wrong passphrase or corrupt backup | Try the escrowed passphrase; validate another retained backup; do not overwrite live state |
| Restore refuses existing files | Target is not isolated | Choose an empty target; use `--allow-overwrite` only with an approved restore and safety-copy review |
| Schema newer than runtime | Rollback image cannot read upgraded state | Redeploy the compatible/newer image; do not downgrade the schema marker |
| Apple collection missing | Calendar removed or sharing changed | Rerun discovery and select a current writable collection |

## Rollback

Route traffic to the prior healthy Container App revision and verify liveness/readiness. Do not roll back persisted state to an older schema unless the isolated restore validation has passed. If a restore must overwrite files, `marvin-state-tool` creates `.marvin/restore-safety/<timestamp>` copies first. Provider items are never deleted as part of rollback.

## Escalation

| Situation | Contact | Method |
| --- | --- | --- |
| Critical/high security issue or suspected credential exposure | Deployment security owner | Private incident channel; rotate the affected credential |
| Repeated provider failure after reauthorization | Project Marvin owner | ADO work item with correlation ID, timestamp, provider, and safe error class |
| Backup/restore integrity failure | Deployment platform owner | Stop recovery, retain artifacts, and open an incident |
| Calendar deletion observed | Project Marvin owner and HCS security | Stop runtime immediately and preserve logs/state; do not attempt cleanup |

## History

| Date | Run By | Notes |
| --- | --- | --- |
| 2026-08-19 | Project maintainers | Reclassified Azure as an Experimental reference adapter, removed private environment evidence, and made temporary-path examples portable |
