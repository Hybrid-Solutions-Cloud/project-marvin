#Requires -Version 7.0

[CmdletBinding()]
param(
  [Alias('WorkspaceId')]
  [string]$ProfileName = 'marvin.local',
  [string]$Timezone = 'America/New_York',
  [int]$SyncWindowDays = 45,
  [Alias('WorkspaceEmail')]
  [string]$MarvinOperatorEmail = 'marvin@example.com',
  [string]$MarvinOperatorDisplayName = 'Marvin Operator',
  [string]$WorkEmail,
  [string]$ContractEmail,
  [string]$GoogleEmail,
  [string]$FamilyEmail,
  [string]$AppleEmail,
  [string]$AppleCalDavServerUrl = '',
  [string]$AppleCalDavUsername = '',
  [string]$AppleCalDavAppPassword = '',
  [string]$WorkTenantId = '11111111-1111-1111-1111-111111111111',
  [string]$ContractTenantId = '22222222-2222-2222-2222-222222222222',
  [string]$AutomationTenantId = '',
  [string]$AutomationEnvironmentUrl = '',
  [string]$MirrorMode = 'full',
  [string]$MarvinUrl = '',
  [string]$MicrosoftClientId = '',
  [string]$MicrosoftClientSecret = '',
  [string]$GoogleClientId = '',
  [string]$GoogleClientSecret = '',
  [switch]$IncludeApple,
  [switch]$NoPrompt,
  [switch]$SkipNpmInstall,
  [switch]$SkipSmokeSetup,
  [switch]$RunGenerators
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Invoke-Step {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Bootstrap step failed: $FilePath"
  }
}

function Add-OptionalArgument {
  param(
    [System.Collections.Generic.List[string]]$List,
    [string]$Name,
    [string]$Value
  )

  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    $List.Add($Name)
    $List.Add($Value)
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')

if ([string]::IsNullOrWhiteSpace($MarvinUrl)) {
  $localMarvinPort = if ([string]::IsNullOrWhiteSpace($env:MARVIN_UI_PORT)) { '4177' } else { [string]$env:MARVIN_UI_PORT }
  $MarvinUrl = "http://127.0.0.1:$localMarvinPort"
}

Require-Command node
Require-Command npm
Require-Command pwsh

Push-Location $root
try {
  if (-not $SkipNpmInstall) {
    Write-Host 'Installing npm dependencies for Project Marvin...' -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw 'npm install failed during Marvin bootstrap.'
    }
  } else {
    Write-Host 'Skipping npm install because -SkipNpmInstall was supplied.' -ForegroundColor Yellow
  }

  if (-not $SkipSmokeSetup) {
    Write-Host 'Running Project Marvin setup smoke before bootstrapping...' -ForegroundColor Cyan
    npm run marvin:smoke-setup
    if ($LASTEXITCODE -ne 0) {
      throw 'marvin:smoke-setup failed during Marvin bootstrap.'
    }
  } else {
    Write-Host 'Skipping setup smoke because -SkipSmokeSetup was supplied.' -ForegroundColor Yellow
  }

  $setupArgs = New-Object 'System.Collections.Generic.List[string]'
  $setupArgs.Add('-ExecutionPolicy')
  $setupArgs.Add('Bypass')
  $setupArgs.Add('-File')
  $setupArgs.Add((Join-Path $root 'scripts\setup-marvin.ps1'))
  $setupArgs.Add('-ProfileName')
  $setupArgs.Add($ProfileName)
  $setupArgs.Add('-Timezone')
  $setupArgs.Add($Timezone)
  $setupArgs.Add('-SyncWindowDays')
  $setupArgs.Add([string]$SyncWindowDays)
  $setupArgs.Add('-MarvinOperatorEmail')
  $setupArgs.Add($MarvinOperatorEmail)
  $setupArgs.Add('-WorkTenantId')
  $setupArgs.Add($WorkTenantId)
  $setupArgs.Add('-ContractTenantId')
  $setupArgs.Add($ContractTenantId)
  $setupArgs.Add('-AutomationTenantId')
  $setupArgs.Add($AutomationTenantId)
  $setupArgs.Add('-AutomationEnvironmentUrl')
  $setupArgs.Add($AutomationEnvironmentUrl)
  $setupArgs.Add('-MirrorMode')
  $setupArgs.Add($MirrorMode)
  $setupArgs.Add('-MarvinUrl')
  $setupArgs.Add($MarvinUrl)
  $setupArgs.Add('-MicrosoftClientId')
  $setupArgs.Add($MicrosoftClientId)
  $setupArgs.Add('-MicrosoftClientSecret')
  $setupArgs.Add($MicrosoftClientSecret)
  $setupArgs.Add('-GoogleClientId')
  $setupArgs.Add($GoogleClientId)
  $setupArgs.Add('-GoogleClientSecret')
  $setupArgs.Add($GoogleClientSecret)

  Add-OptionalArgument -List $setupArgs -Name '-WorkEmail' -Value $WorkEmail
  Add-OptionalArgument -List $setupArgs -Name '-ContractEmail' -Value $ContractEmail
  Add-OptionalArgument -List $setupArgs -Name '-GoogleEmail' -Value $GoogleEmail
  Add-OptionalArgument -List $setupArgs -Name '-FamilyEmail' -Value $FamilyEmail
  Add-OptionalArgument -List $setupArgs -Name '-AppleEmail' -Value $AppleEmail
  Add-OptionalArgument -List $setupArgs -Name '-AppleCalDavServerUrl' -Value $AppleCalDavServerUrl
  Add-OptionalArgument -List $setupArgs -Name '-AppleCalDavUsername' -Value $AppleCalDavUsername
  Add-OptionalArgument -List $setupArgs -Name '-AppleCalDavAppPassword' -Value $AppleCalDavAppPassword

  if ($IncludeApple) {
    $setupArgs.Add('-IncludeApple')
  }
  if ($NoPrompt) {
    $setupArgs.Add('-NoPrompt')
  }

  if ($RunGenerators) {
    $setupArgs.Add('-RunGenerators')
  }

  Write-Host 'Running Project Marvin setup...' -ForegroundColor Cyan
  & pwsh @setupArgs
  if ($LASTEXITCODE -ne 0) {
    throw 'setup-marvin.ps1 failed during Marvin bootstrap.'
  }

  Write-Host ''
  Write-Host 'Bootstrap complete.' -ForegroundColor Green
  Write-Host 'Next steps:' -ForegroundColor Cyan
  Write-Host '1. For local development, set MARVIN_DEV_AUTH_ENABLED=true and run npm run marvin:ui.'
  Write-Host '2. Select Local development sign-in. Hosted deployments use Continue with Microsoft instead.'
  Write-Host '3. Add Microsoft calendars and complete provider authorization until every calendar is Ready.'
  Write-Host '4. Review privacy rules, then start synchronization from the Dashboard.'
  Write-Host '5. Run npm run marvin:doctor for a repo-level health check and next verification guidance.'
  Write-Host '6. Run npm run marvin:verify-local for the complete local verification flow.'
} finally {
  Pop-Location
}
