#Requires -Version 7.0

[CmdletBinding()]
param(
  [string]$SubscriptionId,
  [string]$WorkloadName = 'marvin',
  [ValidateSet('dev','stg','prd')]
  [string]$Environment = 'dev',
  [string]$RegionShort = 'eus',
  [string]$Instance = '01',
  [string]$Location = 'eastus',
  [string]$ProjectName = 'project-marvin',
  [string]$CostCenter = 'hcs-internal',
  [string]$Owner = 'project-marvin',
  [string]$EnvFilePath = '.env',
  [string]$Image = 'ghcr.io/ridafkih/keeper-services:2.9',
  [string]$AdditionalTrustedOrigins = '',
  [string]$PostgresAdminUser = 'keeperadmin',
  [string]$PostgresAdminPassword,
  [switch]$UsePlaceholderProviderSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Assert-Success {
  param([string]$Action)
  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE"
  }
}

function Get-EnvMap {
  param([string]$Path)
  $map = @{}
  foreach ($line in Get-Content $Path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith('#')) { continue }
    $parts = $line -split '=', 2
    if ($parts.Count -ne 2) { continue }
    $map[$parts[0].Trim()] = $parts[1].Trim()
  }
  return $map
}

function Require-Value {
  param([hashtable]$Map,[string]$Name)
  if (-not $Map.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Map[$Name])) {
    throw "Missing required value in env file: $Name"
  }
}

function New-RegistryName {
  param([string]$Workload,[string]$EnvironmentName,[string]$Region,[string]$InstanceId)
  return ("acr{0}{1}{2}{3}" -f $Workload, $EnvironmentName, $Region, $InstanceId).ToLowerInvariant()
}

Require-Command az

$resolvedEnvFilePath = if ([System.IO.Path]::IsPathRooted($EnvFilePath)) { Resolve-Path $EnvFilePath } else { Resolve-Path (Join-Path $PSScriptRoot $EnvFilePath) }
$envMap = Get-EnvMap -Path $resolvedEnvFilePath
Require-Value -Map $envMap -Name 'BETTER_AUTH_SECRET'
Require-Value -Map $envMap -Name 'ENCRYPTION_KEY'

if ($UsePlaceholderProviderSecrets) {
  if (-not $envMap.ContainsKey('MICROSOFT_CLIENT_ID') -or [string]::IsNullOrWhiteSpace($envMap['MICROSOFT_CLIENT_ID'])) { $envMap['MICROSOFT_CLIENT_ID'] = 'placeholder-client-id' }
  if (-not $envMap.ContainsKey('MICROSOFT_CLIENT_SECRET') -or [string]::IsNullOrWhiteSpace($envMap['MICROSOFT_CLIENT_SECRET'])) { $envMap['MICROSOFT_CLIENT_SECRET'] = 'placeholder-client-secret' }
} else {
  Require-Value -Map $envMap -Name 'MICROSOFT_CLIENT_ID'
  Require-Value -Map $envMap -Name 'MICROSOFT_CLIENT_SECRET'
}
if (-not $envMap.ContainsKey('GOOGLE_CLIENT_ID')) { $envMap['GOOGLE_CLIENT_ID'] = '' }
if (-not $envMap.ContainsKey('GOOGLE_CLIENT_SECRET')) { $envMap['GOOGLE_CLIENT_SECRET'] = '' }

$resourceGroupName = "rg-$WorkloadName-$Environment-$RegionShort-$Instance"
$containerAppEnvironmentName = "cae-$WorkloadName-$Environment-$RegionShort-$Instance"
$marvinAppName = "ca-$WorkloadName-$Environment-$RegionShort-$Instance"
$keeperAppName = "ca-keeper-$Environment-$RegionShort-$Instance"
$logAnalyticsWorkspaceName = "law-$WorkloadName-$Environment-$RegionShort-$Instance"
$postgresServerName = "psql-$WorkloadName-$Environment-$RegionShort-$Instance"
$registryName = New-RegistryName -Workload $WorkloadName -EnvironmentName $Environment -Region $RegionShort -InstanceId $Instance

if ([string]::IsNullOrWhiteSpace($PostgresAdminPassword)) {
  $PostgresAdminPassword = [Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 })) + '!Aa1'
}

if ($SubscriptionId) {
  az account set --subscription $SubscriptionId | Out-Null
  Assert-Success 'Setting Azure subscription context'
}

az group create --name $resourceGroupName --location $Location --tags Owner=$Owner Project=$ProjectName Environment=$Environment CostCenter=$CostCenter ManagedBy=bicep --output none
Assert-Success 'Creating resource group'

az acr create --resource-group $resourceGroupName --name $registryName --sku Basic --admin-enabled true --location $Location --tags Owner=$Owner Project=$ProjectName Environment=$Environment CostCenter=$CostCenter ManagedBy=script --output none
Assert-Success 'Creating Azure Container Registry'

$marvinImageTag = 'marvin-ui-' + ([guid]::NewGuid().Guid.Substring(0, 8))
az acr build --registry $registryName --image "marvin-ui:$marvinImageTag" --file operator-ui/Dockerfile .
Assert-Success 'Building Marvin UI image'

$registryLoginServer = az acr show --name $registryName --query loginServer --output tsv
Assert-Success 'Reading registry login server'
$registryUsername = az acr credential show --name $registryName --query username --output tsv
Assert-Success 'Reading registry username'
$registryPassword = az acr credential show --name $registryName --query passwords[0].value --output tsv
Assert-Success 'Reading registry password'
$marvinUiImage = "$registryLoginServer/marvin-ui:$marvinImageTag"

$trustedOrigins = @('https://placeholder.invalid')
if (-not [string]::IsNullOrWhiteSpace($AdditionalTrustedOrigins)) {
  $trustedOrigins += $AdditionalTrustedOrigins.Split(',', [System.StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim() }
}
$trustedOriginsValue = ($trustedOrigins | Select-Object -Unique) -join ','
$templatePath = Resolve-Path (Join-Path $PSScriptRoot '..\..\infra\keeper-azure.bicep')
$deploymentName = 'keeper-' + ([guid]::NewGuid().Guid.Substring(0, 8))

$deploymentJson = az deployment group create `
  --name $deploymentName `
  --resource-group $resourceGroupName `
  --template-file $templatePath `
  --parameters `
    location=$Location `
    environment=$Environment `
    projectName=$ProjectName `
    costCenter=$CostCenter `
    owner=$Owner `
    managedBy=bicep `
    containerAppEnvironmentName=$containerAppEnvironmentName `
    marvinAppName=$marvinAppName `
    keeperAppName=$keeperAppName `
    logAnalyticsWorkspaceName=$logAnalyticsWorkspaceName `
    postgresServerName=$postgresServerName `
    postgresAdminUser=$PostgresAdminUser `
    postgresAdminPassword=$PostgresAdminPassword `
    containerImage=$Image `
    marvinUiImage=$marvinUiImage `
    registryServer=$registryLoginServer `
    registryUsername=$registryUsername `
    registryPassword=$registryPassword `
    betterAuthSecret=$($envMap['BETTER_AUTH_SECRET']) `
    encryptionKey=$($envMap['ENCRYPTION_KEY']) `
    microsoftClientId=$($envMap['MICROSOFT_CLIENT_ID']) `
    microsoftClientSecret=$($envMap['MICROSOFT_CLIENT_SECRET']) `
    googleClientId=$($envMap['GOOGLE_CLIENT_ID']) `
    googleClientSecret=$($envMap['GOOGLE_CLIENT_SECRET']) `
    trustedOrigins=$trustedOriginsValue `
    betterAuthUrl='https://placeholder.invalid' `
  --query properties.outputs `
  --output json
Assert-Success 'Bicep deployment'

$outputs = $deploymentJson | ConvertFrom-Json
$marvinUrl = $outputs.marvinUrl.value
$keeperUrl = $outputs.keeperUrl.value
$finalTrustedOrigins = (($trustedOrigins + $marvinUrl + $keeperUrl) | Select-Object -Unique) -join ','

az containerapp update --name $keeperAppName --resource-group $resourceGroupName --container-name keeper --set-env-vars BETTER_AUTH_URL=$keeperUrl TRUSTED_ORIGINS=$finalTrustedOrigins --output none
Assert-Success 'Updating Keeper auth URL and trusted origins'

Write-Host 'Hosted Marvin runtime deployed successfully'
Write-Host "URL: $marvinUrl"
Write-Host "KEEPER_URL: $keeperUrl"
Write-Host "Resource group: $resourceGroupName"
Write-Host "Container registry: $registryName"
Write-Host "Container Apps environment: $containerAppEnvironmentName"
Write-Host "Marvin app: $marvinAppName"
Write-Host "Keeper app: $keeperAppName"
Write-Host "PostgreSQL host: $($outputs.postgresHost.value)"
Write-Host "PostgreSQL admin user: $($outputs.postgresAdminUser.value)"
