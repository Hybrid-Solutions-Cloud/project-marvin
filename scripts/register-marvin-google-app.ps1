#Requires -Version 7.0

[CmdletBinding()]
param(
  [string]$ProfileName = 'marvin.local',
  [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$MarvinBaseUrl = '',
  [string]$GoogleClientId = '',
  [string]$GoogleClientSecret = '',
  [string]$OutputPath = '',
  [switch]$EmitOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-Json {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $null
  }
  return Get-Content $Path -Raw | ConvertFrom-Json -Depth 100
}

function Write-Json {
  param([string]$Path,[object]$Value)
  $dir = Split-Path -Parent $Path
  if ($dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $json = $Value | ConvertTo-Json -Depth 100
  Set-Content -Path $Path -Value ($json + "`n")
}

function Set-ObjectValue {
  param(
    [object]$Container,
    [string]$Name,
    [object]$Value
  )

  if ($Container -is [System.Collections.IDictionary]) {
    $Container[$Name] = $Value
    return
  }

  if (-not $Container.PSObject.Properties[$Name]) {
    $Container | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    return
  }

  $Container.$Name = $Value
}

$root = Resolve-Path $RootDir
$profileSlug = ($ProfileName -replace '[^a-zA-Z0-9._-]+', '-').ToLowerInvariant()
$setupPath = Join-Path $root ".marvin\$profileSlug.setup.json"
$providerSecretsPath = Join-Path $root ".marvin\provider-secrets\$profileSlug.secrets.json"
$providerAppStatePath = Join-Path $root ".marvin\provider-apps\$profileSlug.google.json"
$profilePath = Join-Path $root "profiles\$profileSlug.json"
$config = Read-Json $setupPath
$existingSecrets = Read-Json $providerSecretsPath
$profile = Read-Json $profilePath

if (-not $MarvinBaseUrl) {
  $MarvinBaseUrl = [string]($config.providerRequirements.marvinBaseUrl)
}
if (-not $MarvinBaseUrl -and $config.deployment.marvinUrl) {
  $MarvinBaseUrl = [string]$config.deployment.marvinUrl
}
if (-not $MarvinBaseUrl) {
  throw 'MarvinBaseUrl is required. Supply -MarvinBaseUrl or use a Marvin setup state that already contains provider requirements.'
}

$MarvinBaseUrl = $MarvinBaseUrl.TrimEnd('/')
$redirectUri = "$MarvinBaseUrl/marvin-api/oauth/google/callback"

$plan = [ordered]@{
  profileName = $profileSlug
  marvinBaseUrl = $MarvinBaseUrl
  provider = 'google'
  creationMode = 'console-only'
  reason = 'Google OAuth clients for Workspace and Calendar integrations still require creation in Google Cloud Console; Marvin can generate the exact plan and persist the returned client credentials into local Marvin state.'
  redirectUri = $redirectUri
  authorizePath = '/marvin-api/oauth/google/start'
  oauthScopes = @(
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/calendar'
  )
  consoleUrls = [ordered]@{
    oauthClients = 'https://console.cloud.google.com/auth/clients'
    audience = 'https://console.cloud.google.com/auth/audience'
    credentials = 'https://console.cloud.google.com/apis/credentials'
  }
  manualSteps = @(
    'Open Google Cloud Console and select or create the project Marvin should use for Google Calendar access.',
    'Configure the OAuth consent screen for the chosen project if it is not already configured.',
    "Create a Web application OAuth client and add the redirect URI `"$redirectUri`".",
    'Copy the Google client ID and client secret.',
    "Run this script again with -GoogleClientId and -GoogleClientSecret to persist the credentials into Marvin's local state."
  )
}

if ($EmitOnly -or [string]::IsNullOrWhiteSpace($GoogleClientId) -or [string]::IsNullOrWhiteSpace($GoogleClientSecret)) {
  if ($OutputPath) {
    Write-Json -Path $OutputPath -Value $plan
    Write-Host "Wrote Marvin Google app-registration plan to $OutputPath" -ForegroundColor Green
  } else {
    $plan | ConvertTo-Json -Depth 100
  }
  return
}

$result = [ordered]@{
  profileName = $profileSlug
  provider = 'google'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  creationMode = 'console-only'
  marvinBaseUrl = $MarvinBaseUrl
  redirectUri = $redirectUri
  clientId = $GoogleClientId
  clientSecretStored = $true
  authorizePath = '/marvin-api/oauth/google/start'
  oauthScopes = $plan.oauthScopes
}

Write-Json -Path $providerAppStatePath -Value $result

if (-not $existingSecrets) {
  $existingSecrets = [ordered]@{
    microsoftClientSecret = ''
    googleClientSecret = ''
    caldavPassword = ''
    caldavPasswords = [ordered]@{}
  }
}
$existingSecrets.googleClientSecret = $GoogleClientSecret
Write-Json -Path $providerSecretsPath -Value $existingSecrets

if ($config) {
  if (-not $config.PSObject.Properties['providerCredentials']) {
    $config | Add-Member -MemberType NoteProperty -Name providerCredentials -Value ([ordered]@{})
  }
  Set-ObjectValue -Container $config.providerCredentials -Name 'googleClientId' -Value $GoogleClientId
  if (-not $config.PSObject.Properties['providerSecretStatus']) {
    $config | Add-Member -MemberType NoteProperty -Name providerSecretStatus -Value ([ordered]@{})
  }
  Set-ObjectValue -Container $config.providerSecretStatus -Name 'googleClientSecretConfigured' -Value $true
  if ($config.PSObject.Properties['providerRequirements'] -and $config.providerRequirements.PSObject.Properties['google']) {
    Set-ObjectValue -Container $config.providerRequirements.google -Name 'clientIdConfigured' -Value $true
  }
  Set-ObjectValue -Container $config -Name 'updatedAt' -Value ((Get-Date).ToUniversalTime().ToString('o'))
  Write-Json -Path $setupPath -Value $config
}

if ($profile) {
  if (-not $profile.PSObject.Properties['runtime']) {
    $profile | Add-Member -MemberType NoteProperty -Name runtime -Value ([ordered]@{})
  }
  if (-not $profile.runtime.PSObject.Properties['providerConnections']) {
    $profile.runtime | Add-Member -MemberType NoteProperty -Name providerConnections -Value ([ordered]@{})
  }
  if (-not $profile.runtime.providerConnections.PSObject.Properties['google']) {
    $profile.runtime.providerConnections | Add-Member -MemberType NoteProperty -Name google -Value ([ordered]@{})
  }
  if (-not $profile.runtime.providerConnections.google.PSObject.Properties['clientId']) {
    $profile.runtime.providerConnections.google | Add-Member -MemberType NoteProperty -Name clientId -Value ''
  }
  if (-not $profile.runtime.providerConnections.google.PSObject.Properties['authMode']) {
    $profile.runtime.providerConnections.google | Add-Member -MemberType NoteProperty -Name authMode -Value ''
  }
  if (-not $profile.runtime.providerConnections.google.PSObject.Properties['marvinBaseUrl']) {
    $profile.runtime.providerConnections.google | Add-Member -MemberType NoteProperty -Name marvinBaseUrl -Value ''
  }
  if (-not $profile.runtime.providerConnections.google.PSObject.Properties['authorizePath']) {
    $profile.runtime.providerConnections.google | Add-Member -MemberType NoteProperty -Name authorizePath -Value ''
  }
  $profile.runtime.providerConnections.google.clientId = $GoogleClientId
  $profile.runtime.providerConnections.google.authMode = 'marvin-engine'
  $profile.runtime.providerConnections.google.marvinBaseUrl = $MarvinBaseUrl
  $profile.runtime.providerConnections.google.authorizePath = '/marvin-api/oauth/google/start'
  Write-Json -Path $profilePath -Value $profile
}

$result | ConvertTo-Json -Depth 100
