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
  [Alias('WorkspacePassword')]
  [string]$MarvinOperatorPassword = '',
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
  [switch]$SkipVerify,
  [switch]$SkipUiReminder,
  [switch]$SkipNpmInstall,
  [switch]$SkipSmokeSetup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

Push-Location $root
try {
  $bootstrapArgs = New-Object 'System.Collections.Generic.List[string]'
  $bootstrapArgs.Add('-ExecutionPolicy')
  $bootstrapArgs.Add('Bypass')
  $bootstrapArgs.Add('-File')
  $bootstrapArgs.Add((Join-Path $PSScriptRoot 'bootstrap-marvin.ps1'))
  $bootstrapArgs.Add('-ProfileName')
  $bootstrapArgs.Add($ProfileName)
  $bootstrapArgs.Add('-Timezone')
  $bootstrapArgs.Add($Timezone)
  $bootstrapArgs.Add('-SyncWindowDays')
  $bootstrapArgs.Add([string]$SyncWindowDays)
  $bootstrapArgs.Add('-MarvinOperatorEmail')
  $bootstrapArgs.Add($MarvinOperatorEmail)
  $bootstrapArgs.Add('-MarvinOperatorDisplayName')
  $bootstrapArgs.Add($MarvinOperatorDisplayName)
  Add-OptionalArgument -List $bootstrapArgs -Name '-MarvinOperatorPassword' -Value $MarvinOperatorPassword
  $bootstrapArgs.Add('-WorkTenantId')
  $bootstrapArgs.Add($WorkTenantId)
  $bootstrapArgs.Add('-ContractTenantId')
  $bootstrapArgs.Add($ContractTenantId)
  $bootstrapArgs.Add('-AutomationTenantId')
  $bootstrapArgs.Add($AutomationTenantId)
  $bootstrapArgs.Add('-AutomationEnvironmentUrl')
  $bootstrapArgs.Add($AutomationEnvironmentUrl)
  $bootstrapArgs.Add('-MirrorMode')
  $bootstrapArgs.Add($MirrorMode)

  Add-OptionalArgument -List $bootstrapArgs -Name '-MarvinUrl' -Value $MarvinUrl
  Add-OptionalArgument -List $bootstrapArgs -Name '-WorkEmail' -Value $WorkEmail
  Add-OptionalArgument -List $bootstrapArgs -Name '-ContractEmail' -Value $ContractEmail
  Add-OptionalArgument -List $bootstrapArgs -Name '-GoogleEmail' -Value $GoogleEmail
  Add-OptionalArgument -List $bootstrapArgs -Name '-FamilyEmail' -Value $FamilyEmail
  Add-OptionalArgument -List $bootstrapArgs -Name '-AppleEmail' -Value $AppleEmail
  Add-OptionalArgument -List $bootstrapArgs -Name '-AppleCalDavServerUrl' -Value $AppleCalDavServerUrl
  Add-OptionalArgument -List $bootstrapArgs -Name '-AppleCalDavUsername' -Value $AppleCalDavUsername
  Add-OptionalArgument -List $bootstrapArgs -Name '-AppleCalDavAppPassword' -Value $AppleCalDavAppPassword
  Add-OptionalArgument -List $bootstrapArgs -Name '-MicrosoftClientId' -Value $MicrosoftClientId
  Add-OptionalArgument -List $bootstrapArgs -Name '-MicrosoftClientSecret' -Value $MicrosoftClientSecret
  Add-OptionalArgument -List $bootstrapArgs -Name '-GoogleClientId' -Value $GoogleClientId
  Add-OptionalArgument -List $bootstrapArgs -Name '-GoogleClientSecret' -Value $GoogleClientSecret

  if ($IncludeApple) {
    $bootstrapArgs.Add('-IncludeApple')
  }
  if ($NoPrompt) {
    $bootstrapArgs.Add('-NoPrompt')
  }
  if ($SkipNpmInstall) {
    $bootstrapArgs.Add('-SkipNpmInstall')
  }
  if ($SkipSmokeSetup) {
    $bootstrapArgs.Add('-SkipSmokeSetup')
  }

  Write-Host 'Installing and bootstrapping Project Marvin...' -ForegroundColor Cyan
  & pwsh @bootstrapArgs
  if ($LASTEXITCODE -ne 0) {
    throw 'bootstrap-marvin.ps1 failed during Marvin install.'
  }

  if (-not $SkipVerify) {
    Write-Host 'Running Marvin doctor...' -ForegroundColor Cyan
    node .\scripts\marvin-doctor.mjs
    if ($LASTEXITCODE -ne 0) {
      throw 'marvin-doctor.mjs failed during Marvin install.'
    }
  }

  Write-Host ''
  Write-Host 'Marvin install completed.' -ForegroundColor Green
  Write-Host 'Next steps:' -ForegroundColor Cyan
  if (-not [string]::IsNullOrWhiteSpace($MarvinOperatorPassword)) {
    Write-Host '1. Run npm run marvin:ui'
    Write-Host '2. Sign in with the Marvin workspace account created by this install run.'
    Write-Host '3. Use the staged Marvin flow: open Calendars, save Marvin setup, continue to Link Accounts, link each calendar, and run Check Access until Link status shows ready.'
    Write-Host '4. Review the Marvin Workspace card and each calendar card before Paranoid Keeper starts automatically after validation.'
    Write-Host '5. Run npm run marvin:doctor whenever you want a repo-level health check and next verification guidance.'
    Write-Host '6. Run npm run marvin:smoke-operator-journey for one Marvin-owned setup/auth/validation/runtime check.'
    Write-Host '7. Paranoid Keeper starts automatically after all calendar links validate.'
    Write-Host '8. Run npm run marvin:verify-local for the broader local verification pass.'
  } else {
    Write-Host '1. Run npm run marvin:ui'
    Write-Host '2. Create the Marvin workspace account, finish the Marvin Account and Calendars stages, and save Marvin setup.'
    Write-Host '3. Continue to Link Accounts, link each calendar, and run Check Access until Link status shows ready.'
    Write-Host '4. Review the Marvin Workspace card and each calendar card before Paranoid Keeper starts automatically after validation.'
    Write-Host '5. Run npm run marvin:doctor whenever you want a repo-level health check and next verification guidance.'
    Write-Host '6. Run npm run marvin:smoke-operator-journey for one Marvin-owned setup/auth/validation/runtime check.'
    Write-Host '7. Paranoid Keeper starts automatically after all calendar links validate.'
    Write-Host '8. Run npm run marvin:verify-local for the broader local verification pass.'
  }

  if (-not $SkipUiReminder) {
    Write-Host ''
    Write-Host 'Marvin UI reminder: npm run marvin:ui' -ForegroundColor Yellow
  }
} finally {
  Pop-Location
}
