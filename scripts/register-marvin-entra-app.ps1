#Requires -Version 7.0

[CmdletBinding()]
param(
  [string]$ProfileName = 'marvin.local',
  [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$SubscriptionId = '',
  [string]$MarvinBaseUrl = '',
  [string]$DisplayName = '',
  [ValidateSet('AzureADMyOrg','AzureADMultipleOrgs','AzureADandPersonalMicrosoftAccount','PersonalMicrosoftAccount')]
  [string]$SignInAudience = 'AzureADMultipleOrgs',
  [int]$SecretYears = 2,
  [string]$OutputPath = '',
  [switch]$GrantAdminConsent,
  [switch]$EmitOnly,
  [switch]$SkipMarvinStateUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

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

function Invoke-AzJson {
  param([string[]]$Args)
  $output = & az @Args
  if ($LASTEXITCODE -ne 0) {
    throw "az $($Args -join ' ') failed with exit code $LASTEXITCODE"
  }
  if (-not $output) {
    return $null
  }
  return $output | ConvertFrom-Json -Depth 100
}

$root = Resolve-Path $RootDir
$profileSlug = ($ProfileName -replace '[^a-zA-Z0-9._-]+', '-').ToLowerInvariant()
$setupPath = Join-Path $root ".marvin\$profileSlug.setup.json"
$providerSecretsPath = Join-Path $root ".marvin\provider-secrets\$profileSlug.secrets.json"
$providerAppStatePath = Join-Path $root ".marvin\provider-apps\$profileSlug.microsoft.json"
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
$redirectUri = "$MarvinBaseUrl/marvin-api/oauth/microsoft/callback"
if (-not $DisplayName) {
  $DisplayName = "Project Marvin $profileSlug Microsoft"
}

$userReadId = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
$calendarsReadWriteId = '1ec239c2-d7c9-4623-a91a-a9775856bb36'
$graphAppId = '00000003-0000-0000-c000-000000000000'

$plan = [ordered]@{
  profileName = $profileSlug
  marvinBaseUrl = $MarvinBaseUrl
  provider = 'microsoft'
  signInAudience = $SignInAudience
  displayName = $DisplayName
  redirectUri = $redirectUri
  graphResourceAppId = $graphAppId
  delegatedPermissions = @(
    [ordered]@{ name = 'User.Read'; id = $userReadId; type = 'Scope' },
    [ordered]@{ name = 'Calendars.ReadWrite'; id = $calendarsReadWriteId; type = 'Scope' }
  )
  oidcScopes = @('offline_access','openid','profile')
  commands = @(
    "az ad app create --display-name `"$DisplayName`" --web-redirect-uris `"$redirectUri`" --sign-in-audience $SignInAudience",
    "az ad app permission add --id <appId> --api $graphAppId --api-permissions $userReadId=Scope $calendarsReadWriteId=Scope",
    'az ad sp create --id <appId>',
    ("az ad app credential reset --id <appId> --years {0}" -f $SecretYears),
    $(if ($GrantAdminConsent) { 'az ad app permission admin-consent --id <appId>' } else { 'Admin consent is optional here but recommended if your tenant policy requires it.' })
  )
}

if ($EmitOnly) {
  if ($OutputPath) {
    Write-Json -Path $OutputPath -Value $plan
    Write-Host "Wrote Marvin Entra app-registration plan to $OutputPath" -ForegroundColor Green
  } else {
    $plan | ConvertTo-Json -Depth 100
  }
  return
}

Require-Command az
if ($SubscriptionId) {
  & az account set --subscription $SubscriptionId | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to set Azure subscription context.'
  }
}

$app = Invoke-AzJson -Args @('ad','app','create','--display-name',$DisplayName,'--web-redirect-uris',$redirectUri,'--sign-in-audience',$SignInAudience,'--query','{appId:appId,id:id,displayName:displayName}','--output','json')
& az ad app permission add --id $app.appId --api $graphAppId --api-permissions "$userReadId=Scope" "$calendarsReadWriteId=Scope" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to add Microsoft Graph delegated permissions.'
}
& az ad sp create --id $app.appId | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to create service principal for the Marvin app registration.'
}
if ($GrantAdminConsent) {
  & az ad app permission admin-consent --id $app.appId | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to grant admin consent.'
  }
}
$secret = Invoke-AzJson -Args @('ad','app','credential','reset','--id',$app.appId,'--years',[string]$SecretYears,'--output','json')
$tenantId = (& az account show --query tenantId --output tsv).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to read current tenant ID.'
}

$result = [ordered]@{
  profileName = $profileSlug
  provider = 'microsoft'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  displayName = $DisplayName
  marvinBaseUrl = $MarvinBaseUrl
  redirectUri = $redirectUri
  tenantId = $tenantId
  appId = [string]$app.appId
  objectId = [string]$app.id
  clientSecret = [string]$secret.password
  clientSecretYears = $SecretYears
  signInAudience = $SignInAudience
  graphResourceAppId = $graphAppId
  delegatedPermissions = $plan.delegatedPermissions
  oidcScopes = $plan.oidcScopes
  adminConsentRequested = [bool]$GrantAdminConsent
}

Write-Json -Path $providerAppStatePath -Value $result

if (-not $SkipMarvinStateUpdate) {
  if (-not $existingSecrets) {
    $existingSecrets = [ordered]@{
      microsoftClientSecret = ''
      googleClientSecret = ''
      caldavPassword = ''
      caldavPasswords = [ordered]@{}
    }
  }
  $existingSecrets.microsoftClientSecret = [string]$secret.password
  Write-Json -Path $providerSecretsPath -Value $existingSecrets

  if ($config) {
    if (-not $config.providerCredentials) {
      $config | Add-Member -MemberType NoteProperty -Name providerCredentials -Value ([ordered]@{})
    }
    $config.providerCredentials.microsoftClientId = [string]$app.appId
    if (-not $config.providerSecretStatus) {
      $config | Add-Member -MemberType NoteProperty -Name providerSecretStatus -Value ([ordered]@{})
    }
    $config.providerSecretStatus.microsoftClientSecretConfigured = $true
    if ($config.providerRequirements -and $config.providerRequirements.microsoft) {
      $config.providerRequirements.microsoft.clientIdConfigured = $true
    }
    $config.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    Write-Json -Path $setupPath -Value $config
  }

  if ($profile) {
    if (-not $profile.runtime) {
      $profile | Add-Member -MemberType NoteProperty -Name runtime -Value ([ordered]@{})
    }
    if (-not $profile.runtime.providerConnections) {
      $profile.runtime | Add-Member -MemberType NoteProperty -Name providerConnections -Value ([ordered]@{})
    }
    if (-not $profile.runtime.providerConnections.microsoft) {
      $profile.runtime.providerConnections | Add-Member -MemberType NoteProperty -Name microsoft -Value ([ordered]@{})
    }
    $profile.runtime.providerConnections.microsoft.clientId = [string]$app.appId
    $profile.runtime.providerConnections.microsoft.authMode = 'marvin-engine'
    $profile.runtime.providerConnections.microsoft.marvinBaseUrl = $MarvinBaseUrl
    $profile.runtime.providerConnections.microsoft.authorizePath = '/marvin-api/oauth/microsoft/start'
    Write-Json -Path $profilePath -Value $profile
  }
}

$result | ConvertTo-Json -Depth 100
