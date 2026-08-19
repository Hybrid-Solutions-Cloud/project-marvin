#Requires -Version 7.0

[CmdletBinding()]
param(
  [string]$ProfileName = 'marvin.local',
  [string]$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$SubscriptionId = '',
  [string]$MarvinBaseUrl = '',
  [string]$DisplayName = '',
  [ValidateSet('AzureADMyOrg','AzureADMultipleOrgs','AzureADandPersonalMicrosoftAccount','PersonalMicrosoftAccount')]
  [string]$SignInAudience = 'AzureADandPersonalMicrosoftAccount',
  [int]$SecretYears = 2,
  [string]$OutputPath = '',
  [switch]$GrantAdminConsent,
  [switch]$RotateCredential,
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
$providerAppStatePath = Join-Path $root ".marvin\provider-apps\$profileSlug.microsoft.json"
$profilePath = Join-Path $root "profiles\$profileSlug.json"
$config = Read-Json $setupPath
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
  credential = [ordered]@{
    encryptedStore = ".marvin/provider-secrets/$profileSlug.secrets.json"
    rotateRequested = [bool]$RotateCredential
    lifetimeYears = $SecretYears
  }
  commands = @(
    "az ad app list --display-name `"$DisplayName`"; az ad app create only when no matching app exists",
    "az ad app update --id <appId> --web-redirect-uris `"$redirectUri`" --sign-in-audience $SignInAudience",
    "az ad app permission add --id <appId> --api $graphAppId --api-permissions <only-missing-delegated-permissions>",
    'az ad sp create --id <appId> (only when missing)',
    $(if ($RotateCredential) { "az ad app credential reset --id <appId> --append --years $SecretYears (secret piped directly to encrypted Marvin storage)" } else { 'Create a credential only for a new app; reuse the encrypted credential for an existing app.' }),
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
Require-Command node
if ($SubscriptionId) {
  & az account set --subscription $SubscriptionId | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to set Azure subscription context.'
  }
}

$app = Invoke-AzJson -Args @('ad','app','list','--display-name',$DisplayName,'--query','[0].{appId:appId,id:id,displayName:displayName,signInAudience:signInAudience,requiredResourceAccess:requiredResourceAccess}','--output','json')
$created = $false
if (-not $app -or [string]::IsNullOrWhiteSpace([string]$app.appId)) {
  $app = Invoke-AzJson -Args @('ad','app','create','--display-name',$DisplayName,'--web-redirect-uris',$redirectUri,'--sign-in-audience',$SignInAudience,'--query','{appId:appId,id:id,displayName:displayName,signInAudience:signInAudience,requiredResourceAccess:requiredResourceAccess}','--output','json')
  $created = $true
} else {
  & az ad app update --id $app.appId --web-redirect-uris $redirectUri --sign-in-audience $SignInAudience --output none
  if ($LASTEXITCODE -ne 0) { throw 'Failed to update the existing Microsoft application registration.' }
}

$existingPermissionIds = @($app.requiredResourceAccess | Where-Object { $_.resourceAppId -eq $graphAppId } | ForEach-Object { $_.resourceAccess } | ForEach-Object { [string]$_.id })
$missingPermissions = @()
if ($existingPermissionIds -notcontains $userReadId) { $missingPermissions += "$userReadId=Scope" }
if ($existingPermissionIds -notcontains $calendarsReadWriteId) { $missingPermissions += "$calendarsReadWriteId=Scope" }
if ($missingPermissions.Count -gt 0) {
  & az ad app permission add --id $app.appId --api $graphAppId --api-permissions $missingPermissions | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to add missing Microsoft Graph delegated permissions.' }
}
$servicePrincipalId = (& az ad sp list --filter "appId eq '$($app.appId)'" --query '[0].id' --output tsv).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Failed to query the service principal for the Marvin app registration.' }
if ([string]::IsNullOrWhiteSpace($servicePrincipalId)) {
  $servicePrincipalId = (& az ad sp create --id $app.appId --query id --output tsv).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create service principal for the Marvin app registration.' }
}
if ($GrantAdminConsent) {
  & az ad app permission admin-consent --id $app.appId | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to grant admin consent.'
  }
}
$secret = $null
if ($created -or $RotateCredential) {
  $secret = Invoke-AzJson -Args @('ad','app','credential','reset','--id',$app.appId,'--append','--display-name','project-marvin-calendar-runtime','--years',[string]$SecretYears,'--output','json')
  $secretInput = @{ microsoftClientSecret = [string]$secret.password } | ConvertTo-Json -Compress
  $secretInput | & node (Join-Path $root 'scripts\store-marvin-provider-secrets.mjs') --root $root --profile $profileSlug --merge | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to save the Microsoft client secret in encrypted Marvin storage.' }
}
$tenantId = (& az account show --query tenantId --output tsv).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to read current tenant ID.'
}

$result = [ordered]@{
  profileName = $profileSlug
  provider = 'microsoft'
  updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  appCreated = $created
  displayName = $DisplayName
  marvinBaseUrl = $MarvinBaseUrl
  redirectUri = $redirectUri
  tenantId = $tenantId
  appId = [string]$app.appId
  objectId = [string]$app.id
  credential = [ordered]@{
    rotated = [bool]($created -or $RotateCredential)
    keyId = if ($secret) { [string]$secret.keyId } else { '' }
    startDateTime = if ($secret) { [string]$secret.startDateTime } else { '' }
    endDateTime = if ($secret) { [string]$secret.endDateTime } else { '' }
    lifetimeYears = $SecretYears
    secretReference = ".marvin/provider-secrets/$profileSlug.secrets.json#microsoftClientSecret"
  }
  signInAudience = $SignInAudience
  graphResourceAppId = $graphAppId
  delegatedPermissions = $plan.delegatedPermissions
  oidcScopes = $plan.oidcScopes
  adminConsentRequested = [bool]$GrantAdminConsent
}

Write-Json -Path $providerAppStatePath -Value $result

if (-not $SkipMarvinStateUpdate) {
  if ($config) {
    if (-not $config.providerCredentials) {
      $config | Add-Member -MemberType NoteProperty -Name providerCredentials -Value ([ordered]@{})
    }
    $config.providerCredentials.microsoftClientId = [string]$app.appId
    if (-not $config.providerSecretStatus) {
      $config | Add-Member -MemberType NoteProperty -Name providerSecretStatus -Value ([ordered]@{})
    }
    if ($created -or $RotateCredential) { $config.providerSecretStatus.microsoftClientSecretConfigured = $true }
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
