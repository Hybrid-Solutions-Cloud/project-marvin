param(
  [string]$ProfileName = "marvin.local",
  [string]$Timezone = "America/New_York",
  [int]$SyncWindowDays = 45,
  [string]$WorkEmail,
  [string]$ContractEmail,
  [string]$GoogleEmail,
  [string]$AppleEmail,
  [string]$WorkTenantId = "11111111-1111-1111-1111-111111111111",
  [string]$ContractTenantId = "22222222-2222-2222-2222-222222222222",
  [string]$AutomationTenantId = "00000000-0000-0000-0000-000000000000",
  [string]$AutomationEnvironmentUrl = "https://org000000.crm.dynamics.com",
  [string]$MirrorMode = "busy",
  [switch]$IncludeApple,
  [switch]$NoPrompt,
  [switch]$RunGenerators
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$profilesDir = Join-Path $root 'profiles'

function Ask([string]$Prompt, [string]$Default = '') {
  if ($NoPrompt) {
    return $Default
  }

  if ($Default) {
    $value = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($value)) {
      return $Default
    }
    return $value
  }

  return Read-Host $Prompt
}

$ProfileName = Ask 'Profile name' $ProfileName
$Timezone = Ask 'Timezone' $Timezone
$windowInput = Ask 'Sync window days' $SyncWindowDays
$SyncWindowDays = [int]$windowInput
$AutomationTenantId = Ask 'Power Automate runtime tenant ID' $AutomationTenantId
$AutomationEnvironmentUrl = Ask 'Power Platform environment URL' $AutomationEnvironmentUrl
$WorkEmail = if ($WorkEmail) { $WorkEmail } else { Ask 'Work Microsoft 365 email' 'you@work.example.com' }
$WorkTenantId = Ask 'Work Microsoft 365 tenant ID' $WorkTenantId
$ContractEmail = if ($ContractEmail) { $ContractEmail } else { Ask 'Contract Microsoft 365 email' 'you@contract.example.com' }
$ContractTenantId = Ask 'Contract Microsoft 365 tenant ID' $ContractTenantId
$GoogleEmail = if ($GoogleEmail) { $GoogleEmail } else { Ask 'Google email (leave blank to skip Google track)' 'you@gmail.com' }

if (-not $IncludeApple -and -not $NoPrompt) {
  $appleAnswer = Ask 'Include Apple Calendar support? (y/N)' 'N'
  if ($appleAnswer -match '^(y|yes)$') {
    $IncludeApple = $true
  }
}

if ($IncludeApple) {
  $AppleEmail = if ($AppleEmail) { $AppleEmail } else { Ask 'Apple/iCloud email' 'you@icloud.com' }
}

$calendars = @(
  [ordered]@{ id = 'work_m365'; label = 'Work Microsoft 365'; provider = 'm365'; email = $WorkEmail; tenantId = $WorkTenantId },
  [ordered]@{ id = 'contract_m365'; label = 'Contract Microsoft 365'; provider = 'm365'; email = $ContractEmail; tenantId = $ContractTenantId }
)

if (-not [string]::IsNullOrWhiteSpace($GoogleEmail)) {
  $calendars += [ordered]@{ id = 'personal_google'; label = 'Personal Google'; provider = 'google'; email = $GoogleEmail }
}

if ($IncludeApple -and -not [string]::IsNullOrWhiteSpace($AppleEmail)) {
  $calendars += [ordered]@{ id = 'personal_apple'; label = 'Personal Apple'; provider = 'apple-caldav'; email = $AppleEmail; optional = $true }
}

function TargetIds([string]$SourceId) {
  return @($calendars | Where-Object { $_.id -ne $SourceId } | ForEach-Object { $_.id })
}

$routes = @()
foreach ($calendar in $calendars) {
  if ($calendar.id -eq 'personal_apple') {
    continue
  }

  $targets = TargetIds $calendar.id
  if ($targets.Count -gt 0) {
    $routes += [ordered]@{
      source = $calendar.id
      targets = $targets
      mirrorMode = $MirrorMode
      subjectPrefix = 'BUSY: '
    }
  }
}

$profile = [ordered]@{
  name = $ProfileName
  timezone = $Timezone
  syncWindowDays = $SyncWindowDays
  privacyDefaults = [ordered]@{
    mirrorMode = $MirrorMode
    visibility = 'private'
  }
  runtime = [ordered]@{
    powerAutomate = [ordered]@{
      automationTenantId = $AutomationTenantId
      environmentUrl = $AutomationEnvironmentUrl
      deploymentModel = 'graph-http-entra-id'
      graphAppDisplayName = 'Project Marvin Flow Runtime'
      supportedAccountTypes = 'AzureADMultipleOrgs'
    }
  }
  calendars = $calendars
  routes = $routes
}

$events = [ordered]@{
  events = @(
    [ordered]@{
      id = 'evt-work-1'
      calendarId = 'work_m365'
      subject = 'Example work meeting'
      start = '2026-07-29T10:00:00-04:00'
      end = '2026-07-29T11:00:00-04:00'
      location = 'Teams'
      status = 'confirmed'
    },
    [ordered]@{
      id = 'evt-contract-1'
      calendarId = 'contract_m365'
      subject = 'Example contract block'
      start = '2026-07-29T13:00:00-04:00'
      end = '2026-07-29T14:00:00-04:00'
      location = 'Remote'
      status = 'confirmed'
    }
  )
}

if ($GoogleEmail) {
  $events.events += [ordered]@{
    id = 'evt-google-1'
    calendarId = 'personal_google'
    subject = 'Example personal block'
    start = '2026-07-30T09:00:00-04:00'
    end = '2026-07-30T10:00:00-04:00'
    location = 'Errands'
    status = 'confirmed'
  }
}

$profilePath = Join-Path $profilesDir "$ProfileName.json"
$eventsPath = Join-Path $profilesDir "$ProfileName.events.json"
$profile | ConvertTo-Json -Depth 10 | Set-Content -Path $profilePath
$events | ConvertTo-Json -Depth 10 | Set-Content -Path $eventsPath

Write-Host "Created profile: $profilePath" -ForegroundColor Green
Write-Host "Created event fixture: $eventsPath" -ForegroundColor Green

if ($RunGenerators) {
  Push-Location $root
  try {
    npm run solutions:build -- $profilePath | Out-Host
    powershell -ExecutionPolicy Bypass -File .\solutions\paranoid-keeper\setup-env.ps1 -ProfilePath $profilePath | Out-Host
  } finally {
    Pop-Location
  }

  Write-Host "Generated local solution artifacts for $ProfileName." -ForegroundColor Green
}

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Review the generated profile, tenant IDs, and emails."
Write-Host "2. Run npm run solutions:build -- $profilePath if you did not use -RunGenerators."
Write-Host "3. Run npm run solutions:test for local validation."
Write-Host "4. Pick one solution track under solutions/."
