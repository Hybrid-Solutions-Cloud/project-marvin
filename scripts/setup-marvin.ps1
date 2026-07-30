param(
  [Alias('WorkspaceId')]
  [string]$ProfileName = "marvin.local",
  [string]$Timezone = "America/New_York",
  [int]$SyncWindowDays = 45,
  [Alias('WorkspaceEmail')]
  [string]$MarvinOperatorEmail = "marvin@example.com",
  [string]$WorkEmail,
  [string]$ContractEmail,
  [string]$GoogleEmail,
  [string]$FamilyEmail,
  [string]$AppleEmail,
  [string]$AppleCalDavServerUrl = "",
  [string]$AppleCalDavUsername = "",
  [string]$AppleCalDavAppPassword = "",
  [string]$WorkTenantId = "11111111-1111-1111-1111-111111111111",
  [string]$ContractTenantId = "22222222-2222-2222-2222-222222222222",
  [string]$AutomationTenantId = "",
  [string]$AutomationEnvironmentUrl = "",
  [string]$MirrorMode = "full",
  [string]$MarvinUrl = "",
  [string]$MicrosoftClientId = "",
  [string]$MicrosoftClientSecret = "",
  [string]$GoogleClientId = "",
  [string]$GoogleClientSecret = "",
  [switch]$IncludeApple,
  [switch]$IncludeBureaucraticFlow,
  [switch]$NoPrompt,
  [switch]$RunGenerators
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$profilesDir = Join-Path $root 'profiles'
$stateDir = Join-Path $root '.marvin'
$providerSecretsDir = Join-Path $stateDir 'provider-secrets'
$connectionsDir = Join-Path $stateDir 'connections'
$tokensDir = Join-Path $stateDir 'tokens'

if ([string]::IsNullOrWhiteSpace($MarvinUrl)) {
  $localMarvinPort = if ([string]::IsNullOrWhiteSpace($env:MARVIN_UI_PORT)) { '4177' } else { [string]$env:MARVIN_UI_PORT }
  $MarvinUrl = "http://127.0.0.1:$localMarvinPort"
}

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

function Sanitize-ProfileName([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return 'marvin.local'
  }

  return ([string]$Value).ToLowerInvariant() -replace '[^a-z0-9._-]+', '-'
}

function Write-Json([string]$Path, $Value) {
  $directory = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $json = $Value | ConvertTo-Json -Depth 12
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function New-TargetConfig([string]$TargetId, [bool]$FamilyVisible = $false, [string]$Prefix = 'BUSY: ') {
  if ($FamilyVisible) {
    return [ordered]@{
      calendarId = $TargetId
      visibility = 'default'
      detailMode = 'full'
      subjectPrefix = $Prefix
      copyLocation = $true
      copyDescription = $true
    }
  }

  return [ordered]@{
    calendarId = $TargetId
    visibility = 'private'
    detailMode = $MirrorMode
    subjectPrefix = $Prefix
    copyLocation = $true
    copyDescription = $true
  }
}

foreach ($directory in @($profilesDir, $stateDir, $providerSecretsDir, $connectionsDir, $tokensDir)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$ProfileName = Ask 'Workspace ID' $ProfileName
$ProfileSlug = Sanitize-ProfileName $ProfileName
$Timezone = Ask 'Timezone' $Timezone
$windowInput = Ask 'Sync window days' $SyncWindowDays
$SyncWindowDays = [int]$windowInput
$MarvinOperatorEmail = Ask 'Marvin account email' $MarvinOperatorEmail
if ($IncludeBureaucraticFlow) {
  $AutomationTenantId = Ask 'Bureaucratic Flow runtime tenant ID' $AutomationTenantId
  $AutomationEnvironmentUrl = Ask 'Bureaucratic Flow Power Platform environment URL' $AutomationEnvironmentUrl
}
$MarvinUrl = Ask 'Marvin base URL' $MarvinUrl
$MicrosoftClientId = Ask 'Microsoft client ID (optional)' $MicrosoftClientId
$MicrosoftClientSecret = Ask 'Microsoft client secret (optional)' $MicrosoftClientSecret
$GoogleClientId = Ask 'Google client ID (optional)' $GoogleClientId
$GoogleClientSecret = Ask 'Google client secret (optional)' $GoogleClientSecret
$WorkEmail = if ($WorkEmail) { $WorkEmail } else { Ask 'Work Microsoft 365 email' 'you@work.example.com' }
$WorkTenantId = Ask 'Work Microsoft 365 tenant ID' $WorkTenantId
$ContractEmail = if ($ContractEmail) { $ContractEmail } else { Ask 'Contract Microsoft 365 email' 'you@contract.example.com' }
$ContractTenantId = Ask 'Contract Microsoft 365 tenant ID' $ContractTenantId
$GoogleEmail = if ($GoogleEmail) { $GoogleEmail } else { Ask 'Personal Google email (leave blank to skip)' 'you@gmail.com' }
$FamilyEmail = if ($FamilyEmail) { $FamilyEmail } else { Ask 'Family calendar email (leave blank to skip)' 'family@gmail.com' }

if (-not $IncludeApple -and -not $NoPrompt) {
  $appleAnswer = Ask 'Include Apple Calendar support? (y/N)' 'N'
  if ($appleAnswer -match '^(y|yes)$') {
    $IncludeApple = $true
  }
}

if ($IncludeApple) {
  $AppleEmail = if ($AppleEmail) { $AppleEmail } else { Ask 'Apple/iCloud email' 'you@icloud.com' }
  $AppleCalDavServerUrl = Ask 'Apple / CalDAV server URL' $AppleCalDavServerUrl
  if ([string]::IsNullOrWhiteSpace($AppleCalDavUsername)) {
    $AppleCalDavUsername = $AppleEmail
  }
  $AppleCalDavUsername = Ask 'Apple / CalDAV username' $AppleCalDavUsername
  $AppleCalDavAppPassword = Ask 'Apple / CalDAV app password' $AppleCalDavAppPassword
}

$calendars = @(
  [ordered]@{ id = 'work_m365'; label = 'Work Microsoft 365'; provider = 'm365'; email = $WorkEmail; tenantId = $WorkTenantId; scope = 'work'; sourcePrefix = 'WORK: '; connectionStatus = 'pending' },
  [ordered]@{ id = 'contract_m365'; label = 'Contract Microsoft 365'; provider = 'm365'; email = $ContractEmail; tenantId = $ContractTenantId; scope = 'contract'; sourcePrefix = 'CONTRACT: '; connectionStatus = 'pending' }
)

if (-not [string]::IsNullOrWhiteSpace($GoogleEmail)) {
  $calendars += [ordered]@{ id = 'personal_google'; label = 'Personal Google'; provider = 'google'; email = $GoogleEmail; scope = 'personal'; sourcePrefix = 'GOOGLE: '; connectionStatus = 'pending' }
}

if (-not [string]::IsNullOrWhiteSpace($FamilyEmail)) {
  $calendars += [ordered]@{ id = 'family_google'; label = 'Family Google'; provider = 'google'; email = $FamilyEmail; scope = 'family'; sourcePrefix = 'FAMILY: '; connectionStatus = 'pending' }
}

if ($IncludeApple -and -not [string]::IsNullOrWhiteSpace($AppleEmail)) {
  $calendars += [ordered]@{
    id = 'personal_apple'
    label = 'Personal Apple'
    provider = 'apple-caldav'
    email = $AppleEmail
    scope = 'personal'
    optional = $true
    sourcePrefix = 'APPLE: '
    connectionStatus = 'pending'
    caldavServerUrl = $AppleCalDavServerUrl
    caldavUsername = $AppleCalDavUsername
  }
}

$routes = @()
foreach ($calendar in $calendars) {
  $targets = @()
  foreach ($target in $calendars | Where-Object { $_.id -ne $calendar.id }) {
    $targets += New-TargetConfig -TargetId $target.id -FamilyVisible:$false -Prefix $calendar.sourcePrefix
  }

  if ($targets.Count -gt 0) {
    $routes += [ordered]@{
      source = $calendar.id
      mirrorMode = $MirrorMode
      subjectPrefix = $calendar.sourcePrefix
      targets = $targets
    }
  }
}

$providerConnections = [ordered]@{
  microsoft = [ordered]@{
    provider = 'm365'
    authMode = 'marvin-engine'
    clientId = $MicrosoftClientId
    tenantMode = 'multi-tenant'
    marvinBaseUrl = $MarvinUrl
    authorizePath = '/marvin-api/oauth/microsoft/start'
  }
  google = [ordered]@{
    provider = 'google'
    authMode = 'marvin-engine'
    clientId = $GoogleClientId
    marvinBaseUrl = $MarvinUrl
    authorizePath = '/marvin-api/oauth/google/start'
  }
  caldav = [ordered]@{
    provider = 'apple-caldav'
    authMode = 'manual-caldav'
    marvinBaseUrl = $MarvinUrl
    authorizePath = ''
    serverUrl = ''
    username = ''
  }
}

$deployment = [ordered]@{
  subscriptionId = ''
  workloadName = 'marvin'
  environment = 'dev'
  regionShort = 'wus3'
  location = 'westus3'
  instance = '01'
  marvinUrl = $MarvinUrl
}

$runtime = [ordered]@{
  deployment = $deployment
  providerConnections = $providerConnections
}

if ($IncludeBureaucraticFlow -or -not [string]::IsNullOrWhiteSpace($AutomationTenantId) -or -not [string]::IsNullOrWhiteSpace($AutomationEnvironmentUrl)) {
  $runtime.powerAutomate = [ordered]@{
    automationTenantId = $AutomationTenantId
    environmentUrl = $AutomationEnvironmentUrl
    deploymentModel = 'graph-http-entra-id'
    graphAppDisplayName = 'Project Marvin Flow Runtime'
    supportedAccountTypes = 'AzureADMultipleOrgs'
  }
}

$profile = [ordered]@{
  name = $ProfileSlug
  timezone = $Timezone
  syncWindowDays = $SyncWindowDays
  privacyDefaults = [ordered]@{
    mirrorMode = $MirrorMode
    visibility = 'private'
    subjectPrefix = 'SRC: '
    copyLocation = $true
    copyDescription = $true
    preserveOriginalTimezone = $true
  }
  runtime = $runtime
  calendars = $calendars
  routes = $routes
}

$events = [ordered]@{
  events = @(
    [ordered]@{
      id = 'evt-work-1'
      calendarId = 'work_m365'
      subject = 'Example work meeting'
      description = 'Quarterly planning and staffing review.'
      start = '2026-07-29T10:00:00-04:00'
      end = '2026-07-29T11:00:00-04:00'
      timezone = $Timezone
      location = 'Teams'
      status = 'confirmed'
    },
    [ordered]@{
      id = 'evt-contract-1'
      calendarId = 'contract_m365'
      subject = 'Example contract block'
      description = 'Client delivery review.'
      start = '2026-07-29T13:00:00-04:00'
      end = '2026-07-29T14:00:00-04:00'
      timezone = $Timezone
      location = 'Remote'
      status = 'confirmed'
    }
  )
}

if (-not [string]::IsNullOrWhiteSpace($GoogleEmail)) {
  $events.events += [ordered]@{
    id = 'evt-google-1'
    calendarId = 'personal_google'
    subject = 'Example personal block'
    description = 'Doctor appointment.'
    start = '2026-07-30T09:00:00-04:00'
    end = '2026-07-30T10:00:00-04:00'
    timezone = $Timezone
    location = 'Errands'
    status = 'confirmed'
  }
}

if ($IncludeApple -and -not [string]::IsNullOrWhiteSpace($AppleEmail)) {
  $events.events += [ordered]@{
    id = 'evt-apple-1'
    calendarId = 'personal_apple'
    subject = 'Example Apple block'
    description = 'Private calendar hold.'
    start = '2026-07-30T15:00:00-04:00'
    end = '2026-07-30T16:00:00-04:00'
    timezone = $Timezone
    location = 'Personal'
    status = 'confirmed'
  }
}

$providerSecrets = [ordered]@{
  microsoftClientSecret = $MicrosoftClientSecret
  googleClientSecret = $GoogleClientSecret
  caldavPassword = ''
  caldavPasswords = [ordered]@{}
}

if ($IncludeApple -and -not [string]::IsNullOrWhiteSpace($AppleCalDavAppPassword)) {
  $providerSecrets.caldavPasswords.personal_apple = $AppleCalDavAppPassword
}

$providerSecretStatus = [ordered]@{
  microsoftClientSecretConfigured = -not [string]::IsNullOrWhiteSpace($MicrosoftClientSecret)
  googleClientSecretConfigured = -not [string]::IsNullOrWhiteSpace($GoogleClientSecret)
  caldavPasswordConfigured = ($providerSecrets.caldavPasswords.Count -gt 0)
  caldavPasswordsConfigured = [ordered]@{}
}

foreach ($calendar in $calendars | Where-Object { $_.provider -eq 'apple-caldav' }) {
  $providerSecretStatus.caldavPasswordsConfigured[$calendar.id] = [bool]$providerSecrets.caldavPasswords[$calendar.id]
}

$providerRequirements = [ordered]@{
  marvinBaseUrl = $MarvinUrl
  microsoft = [ordered]@{
    required = [bool](@($calendars | Where-Object { $_.provider -eq 'm365' -or $_.provider -eq 'outlook' }).Count -gt 0)
    clientIdConfigured = -not [string]::IsNullOrWhiteSpace($MicrosoftClientId)
    signInAudience = 'AzureADMultipleOrgs'
    suggestedDisplayName = "Project Marvin $ProfileSlug Microsoft"
    startUrl = $(if ([string]::IsNullOrWhiteSpace($MarvinUrl)) { '' } else { "$MarvinUrl/marvin-api/oauth/microsoft/start" })
    redirectUri = $(if ([string]::IsNullOrWhiteSpace($MarvinUrl)) { '' } else { "$MarvinUrl/marvin-api/oauth/microsoft/callback" })
    graphResourceAppId = '00000003-0000-0000-c000-000000000000'
    delegatedPermissions = @(
      [ordered]@{ name = 'User.Read'; id = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'; type = 'Scope' },
      [ordered]@{ name = 'Calendars.ReadWrite'; id = '1ec239c2-d7c9-4623-a91a-a9775856bb36'; type = 'Scope' }
    )
    oidcScopes = @('offline_access','openid','profile')
  }
  google = [ordered]@{
    required = [bool](@($calendars | Where-Object { $_.provider -eq 'google' }).Count -gt 0)
    clientIdConfigured = -not [string]::IsNullOrWhiteSpace($GoogleClientId)
    suggestedDisplayName = "Project Marvin $ProfileSlug Google"
    startUrl = $(if ([string]::IsNullOrWhiteSpace($MarvinUrl)) { '' } else { "$MarvinUrl/marvin-api/oauth/google/start" })
    redirectUri = $(if ([string]::IsNullOrWhiteSpace($MarvinUrl)) { '' } else { "$MarvinUrl/marvin-api/oauth/google/callback" })
    scopes = @('openid','email','profile','https://www.googleapis.com/auth/calendar')
  }
}

$connectionRecords = @()
foreach ($calendar in $calendars) {
  $connectionRecords += [ordered]@{
    calendarId = $calendar.id
    provider = $calendar.provider
    email = $calendar.email
    status = 'pending'
    connectedAt = ''
    lastValidatedAt = ''
    accountRef = ''
    authSession = $null
  }
}

$connectionSummaryCalendars = @()
foreach ($calendar in $calendars) {
  $providerKey = if ($calendar.provider -eq 'google') { 'google' } elseif ($calendar.provider -eq 'apple-caldav') { 'caldav' } else { 'microsoft' }
  $runtimeConfig = $providerConnections[$providerKey]
  $providerLabel = if ($calendar.provider -eq 'google') { 'Google Calendar' } elseif ($calendar.provider -eq 'apple-caldav') { 'Apple / CalDAV' } else { 'Microsoft 365 / Outlook' }
  $authUrl = ''
  $connectorMode = $runtimeConfig.authMode
  $connectorReady = $true
  $reason = ''
  $supportsRealtime = $calendar.provider -ne 'apple-caldav'

  if ($calendar.provider -eq 'apple-caldav') {
    $connectorReady = (-not [string]::IsNullOrWhiteSpace($calendar.caldavServerUrl)) -and (-not [string]::IsNullOrWhiteSpace($calendar.caldavUsername)) -and [bool]$providerSecrets.caldavPasswords[$calendar.id]
    if ($connectorReady) {
      $reason = 'Apple / CalDAV credentials are stored in Marvin.'
    } else {
      $reason = 'Enter Apple / CalDAV server URL, username, and app password.'
    }
  } else {
    $hasClientId = -not [string]::IsNullOrWhiteSpace($runtimeConfig.clientId)
    $connectorReady = $hasClientId
    if ($hasClientId -and -not [string]::IsNullOrWhiteSpace($MarvinUrl)) {
      $authUrl = "$MarvinUrl$($runtimeConfig.authorizePath)"
    }
    if ($hasClientId) {
      $reason = 'Provider auth can be started directly through Marvin.'
    } else {
      $reason = 'Set the provider client ID in Marvin before connecting this calendar.'
    }
  }

  $connectionSummaryCalendars += [ordered]@{
    calendarId = $calendar.id
    label = $calendar.label
    provider = $calendar.provider
    providerLabel = $providerLabel
    connectorMode = $connectorMode
    connectorReady = $connectorReady
    supportsRealtime = $supportsRealtime
    authUrl = $authUrl
    marvinBaseUrl = $runtimeConfig.marvinBaseUrl
    missingRequired = @()
    missingRecommended = @()
    status = 'pending'
    reason = $reason
  }
}

$setupAccounts = @()
foreach ($calendar in $calendars) {
  $summary = $connectionSummaryCalendars | Where-Object { $_.calendarId -eq $calendar.id } | Select-Object -First 1
  $setupAccounts += [ordered]@{
    id = $calendar.id
    label = $calendar.label
    provider = $calendar.provider
    email = $calendar.email
    tenantId = $(if ($calendar.tenantId) { $calendar.tenantId } else { '' })
    scope = $calendar.scope
    sourcePrefix = $calendar.sourcePrefix
    connectionStatus = 'pending'
    connectedAt = ''
    connectionReason = $summary.reason
    connectorReady = $summary.connectorReady
    connectorMode = $summary.connectorMode
    authUrl = $summary.authUrl
    supportsRealtime = $summary.supportsRealtime
    lastValidatedAt = ''
    accountRef = ''
    tokenStatus = 'missing'
    tokenReason = ''
    tokenExpiresAt = ''
    caldavServerUrl = $(if ($calendar.caldavServerUrl) { $calendar.caldavServerUrl } else { '' })
    caldavUsername = $(if ($calendar.caldavUsername) { $calendar.caldavUsername } else { '' })
    caldavPasswordConfigured = $(if ($calendar.provider -eq 'apple-caldav') { [bool]$providerSecrets.caldavPasswords[$calendar.id] } else { $false })
  }
}

$setupConfig = [ordered]@{
  marvinOperator = $MarvinOperatorEmail
  profileName = $profile.name
  updatedAt = [DateTime]::UtcNow.ToString('o')
  accounts = $setupAccounts
  preferences = [ordered]@{}
  runtime = $profile.runtime
  deployment = $deployment
  providerCredentials = [ordered]@{
    microsoftClientId = $MicrosoftClientId
    googleClientId = $GoogleClientId
  }
  providerConnections = $providerConnections
  providerSecretStatus = $providerSecretStatus
  providerRequirements = $providerRequirements
  connectionSummary = [ordered]@{
    calendars = $connectionSummaryCalendars
    summary = [ordered]@{
      total = $calendars.Count
      connected = 0
      pending = $calendars.Count
      invalid = 0
      connectorNotReady = @($connectionSummaryCalendars | Where-Object { -not $_.connectorReady }).Count
    }
    readyForLiveSync = ($connectionSummaryCalendars.Count -gt 0) -and (@($connectionSummaryCalendars | Where-Object { $_.connectorReady }).Count -eq $connectionSummaryCalendars.Count)
    providerRuntime = $providerConnections
  }
  connectionState = [ordered]@{ records = $connectionRecords }
  tokenSummary = [ordered]@{ total = $calendars.Count; usable = 0; pending = 0; expired = 0; error = 0; missing = $calendars.Count }
  tokenState = [ordered]@{ records = @() }
}

$profilePath = Join-Path $profilesDir "$ProfileSlug.json"
$eventsPath = Join-Path $profilesDir "$ProfileSlug.events.json"
$setupPath = Join-Path $stateDir "$ProfileSlug.setup.json"
$providerSecretsPath = Join-Path $providerSecretsDir "$ProfileSlug.secrets.json"
$connectionsPath = Join-Path $connectionsDir "$ProfileSlug.connections.json"
$latestPath = Join-Path $stateDir 'latest.json'

Write-Json -Path $profilePath -Value $profile
Write-Json -Path $eventsPath -Value $events
Write-Json -Path $setupPath -Value $setupConfig
Write-Json -Path $providerSecretsPath -Value $providerSecrets
Write-Json -Path $connectionsPath -Value ([ordered]@{ records = $connectionRecords })
Write-Json -Path $latestPath -Value ([ordered]@{ operatorEmail = $MarvinOperatorEmail; profileName = $profile.name })

Write-Host "Created profile: $profilePath" -ForegroundColor Green
Write-Host "Created event fixture: $eventsPath" -ForegroundColor Green
Write-Host "Created setup state: $setupPath" -ForegroundColor Green
Write-Host "Created provider secrets: $providerSecretsPath" -ForegroundColor Green
Write-Host "Created connection state: $connectionsPath" -ForegroundColor Green

if ($RunGenerators) {
  Push-Location $root
  try {
    npm run solutions:build -- $profilePath | Out-Host
  } finally {
    Pop-Location
  }

  Write-Host "Generated local solution artifacts for $ProfileSlug." -ForegroundColor Green
}

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run npm run marvin:ui if Paranoid Keeper is not already open."
Write-Host "2. If you need provider-app setup details first, run pwsh -ExecutionPolicy Bypass -File .\scripts\register-marvin-entra-app.ps1 -ProfileName $ProfileSlug -EmitOnly and/or pwsh -ExecutionPolicy Bypass -File .\scripts\register-marvin-google-app.ps1 -ProfileName $ProfileSlug -MarvinBaseUrl $MarvinUrl -EmitOnly."
Write-Host "3. Historical reference generation is opt-in and is not part of the Paranoid Keeper install path."
Write-Host "4. Use Paranoid Keeper: add calendars, link accounts, and run Check Access until every calendar is ready."
Write-Host "5. Review the Paranoid Keeper account card and each calendar card before Paranoid Keeper starts automatically after validation."
Write-Host "6. Run npm run marvin:doctor for a repo-level health check and next verification guidance."
Write-Host "7. Run npm run marvin:smoke-operator-journey for one Paranoid Keeper setup/auth/validation/runtime check."
Write-Host "8. Run npm run marvin:dry-run to inspect mirror planning from the saved profile."
Write-Host "9. Run npm run marvin:verify-local for the current broader local Paranoid Keeper verification flow."
