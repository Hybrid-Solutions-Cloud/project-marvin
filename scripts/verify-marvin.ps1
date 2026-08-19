#Requires -Version 7.0

[CmdletBinding()]
param(
  [switch]$SkipDocs,
  [switch]$SkipProviderSmokes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-NpmScript {
  param([string]$ScriptName)

  Write-Host "Running npm script: $ScriptName" -ForegroundColor Cyan
  npm run $ScriptName
  if ($LASTEXITCODE -ne 0) {
    throw "npm run $ScriptName failed."
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$mutableArtifactPaths = @(
  (Join-Path $root 'artifacts\marvin-engine\marvin-example.mappings.json')
)
$artifactSnapshots = @{}

foreach ($artifactPath in $mutableArtifactPaths) {
  $artifactSnapshots[$artifactPath] = if (Test-Path -LiteralPath $artifactPath) {
    [pscustomobject]@{ Existed = $true; Bytes = [IO.File]::ReadAllBytes($artifactPath) }
  } else {
    [pscustomobject]@{ Existed = $false; Bytes = $null }
  }
}

Push-Location $root
try {
  & "$PSScriptRoot\cleanup-marvin-smoke-artifacts.ps1"

  Invoke-NpmScript 'solutions:build'
  Invoke-NpmScript 'marvin:dry-run'
  Invoke-NpmScript 'marvin:apply-mock'
  Invoke-NpmScript 'marvin:smoke-bootstrap'
  Invoke-NpmScript 'marvin:smoke-install'
  Invoke-NpmScript 'marvin:smoke-runtime-latest'
  Invoke-NpmScript 'marvin:smoke-cli-latest'
  Invoke-NpmScript 'marvin:smoke-artifacts-latest'
  Invoke-NpmScript 'marvin:smoke-ui-surface'
  Invoke-NpmScript 'marvin:smoke-portal-build'
  Invoke-NpmScript 'marvin:smoke-portal-model'
  Invoke-NpmScript 'marvin:smoke-storage-security'
  Invoke-NpmScript 'marvin:smoke-backup-restore'
  Invoke-NpmScript 'marvin:smoke-api-contract'
  Invoke-NpmScript 'marvin:smoke-setup-gating'
  Invoke-NpmScript 'marvin:smoke-doctor'
  Invoke-NpmScript 'marvin:smoke-hosted'
  Invoke-NpmScript 'marvin:smoke-hosted-profile-switch'
  Invoke-NpmScript 'marvin:smoke-onboard-api'
  Invoke-NpmScript 'marvin:smoke-auth-gating'
  Invoke-NpmScript 'marvin:smoke-operator-journey'
  Invoke-NpmScript 'marvin:smoke-account-management'
  Invoke-NpmScript 'marvin:smoke-route-policy'
  Invoke-NpmScript 'marvin:smoke-calendar-policy-review'
  Invoke-NpmScript 'marvin:smoke-legacy-prefix-cleanup'
  Invoke-NpmScript 'marvin:smoke-connection-validation'
  Invoke-NpmScript 'marvin:smoke-batch-validation'
  Invoke-NpmScript 'marvin:smoke-entra-plan'
  Invoke-NpmScript 'marvin:smoke-google-app-plan'
  Invoke-NpmScript 'marvin:smoke-provider-plan-api'
  Invoke-NpmScript 'marvin:smoke-bureaucratic-flow-opt-in'
  Invoke-NpmScript 'marvin:smoke-runtime-track-split'
  Invoke-NpmScript 'marvin:smoke-runtime-webhook-wake'
  Invoke-NpmScript 'marvin:smoke-docs-commands'
  Invoke-NpmScript 'marvin:smoke-status-reporting'
  Invoke-NpmScript 'marvin:smoke-onboarding-guidance'
  Invoke-NpmScript 'marvin:smoke-live'
  Invoke-NpmScript 'marvin:smoke-delete-cleanup'
  Invoke-NpmScript 'marvin:smoke-microsoft-sync'
  Invoke-NpmScript 'marvin:smoke-caldav'
  Invoke-NpmScript 'marvin:smoke-onboard-caldav'
  Invoke-NpmScript 'marvin:smoke-apple-sync'
  Invoke-NpmScript 'marvin:smoke-live-readiness'
  Invoke-NpmScript 'marvin:smoke-subscriptions'
  Invoke-NpmScript 'marvin:smoke-microsoft-timezone'
  Invoke-NpmScript 'marvin:smoke-daemon'
  Invoke-NpmScript 'marvin:smoke-deploy-plan'

  if (-not $SkipProviderSmokes) {
    Invoke-NpmScript 'marvin:smoke-caldav-live'
  }

  if (-not $SkipDocs) {
    Invoke-NpmScript 'docs:build'
  }

  Write-Host 'Marvin local verification completed successfully.' -ForegroundColor Green
} finally {
  & "$PSScriptRoot\cleanup-marvin-smoke-artifacts.ps1"
  foreach ($artifactPath in $mutableArtifactPaths) {
    $snapshot = $artifactSnapshots[$artifactPath]
    if ($snapshot.Existed) {
      [IO.File]::WriteAllBytes($artifactPath, $snapshot.Bytes)
    } elseif (Test-Path -LiteralPath $artifactPath) {
      Remove-Item -LiteralPath $artifactPath -Force
    }
  }
  Pop-Location
}





