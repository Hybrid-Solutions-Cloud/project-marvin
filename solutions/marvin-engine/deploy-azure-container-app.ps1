#Requires -Version 7.0

[CmdletBinding()]
param(
  [string]$SubscriptionId,
  [string]$WorkloadName = 'marvin',
  [ValidateSet('dev','stg','prd')]
  [string]$Environment = 'dev',
  [string]$RegionShort = 'wus3',
  [string]$Instance = '01',
  [string]$Location = 'westus3',
  [string]$ProjectName = 'project-marvin',
  [string]$CostCenter = 'hcs-internal',
  [string]$Owner = 'project-marvin',
  [int]$RuntimeIntervalSeconds = 300,
  [int]$RuntimeWindowDays = 45,
  [ValidatePattern('^https://')]
  [string]$PublicBaseUrl = '',
  [string]$DataProtectionKey = '',
  [string]$BackupProtectionKey = '',
  [switch]$RotateEntraCredentials,
  [switch]$EmitPlanOnly
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

function New-AlphaNumericLower {
  param([string]$Value)
  return (($Value -replace '[^a-zA-Z0-9]', '').ToLowerInvariant())
}

function New-StorageAccountName {
  param([string]$Workload,[string]$EnvironmentName,[string]$Region,[string]$InstanceId)
  $base = 'st' + (New-AlphaNumericLower "$Workload$EnvironmentName$Region$InstanceId")
  if ($base.Length -gt 24) {
    return $base.Substring(0, 24)
  }
  return $base
}

function New-AcrName {
  param([string]$Workload,[string]$EnvironmentName,[string]$Region,[string]$InstanceId)
  $base = 'acr' + (New-AlphaNumericLower "$Workload$EnvironmentName$Region$InstanceId")
  if ($base.Length -gt 50) {
    return $base.Substring(0, 50)
  }
  return $base
}

function New-DeploymentPlan {
  param(
    [string]$Subscription,
    [string]$ResourceGroup,
    [string]$Registry,
    [string]$EnvironmentName,
    [string]$AppName,
    [string]$WorkspaceName,
    [string]$StorageAccount,
    [string]$ShareName,
    [string]$StorageLink,
    [string]$Template,
    [string]$ResolvedLocation,
    [string]$ResolvedWorkload,
    [string]$ResolvedEnvironment,
    [string]$ResolvedRegionShort,
    [string]$ResolvedInstance,
    [string]$ResolvedPublicBaseUrl,
    [int]$IntervalSeconds,
    [int]$WindowDays
  )

  return [ordered]@{
    mode = 'azure-container-apps'
    subscriptionId = $Subscription
    location = $ResolvedLocation
    naming = [ordered]@{
      workloadName = $ResolvedWorkload
      environment = $ResolvedEnvironment
      regionShort = $ResolvedRegionShort
      instance = $ResolvedInstance
    }
    resources = [ordered]@{
      resourceGroup = $ResourceGroup
      containerRegistry = $Registry
      logAnalyticsWorkspace = $WorkspaceName
      storageAccount = $StorageAccount
      fileShare = $ShareName
      storageLink = $StorageLink
      containerAppsEnvironment = $EnvironmentName
      marvinContainerApp = $AppName
    }
    runtime = [ordered]@{
      syncIntervalSeconds = $IntervalSeconds
      syncWindowDays = $WindowDays
      uiPort = 4177
      hostedMode = $true
      autoStart = $true
      providerDeleteMode = 'disabled'
      stateMountPath = '/data'
      publicBaseUrl = $ResolvedPublicBaseUrl
    }
    files = [ordered]@{
      dockerfile = 'Dockerfile.marvin'
      bicepTemplate = $Template
      deployScript = 'solutions/marvin-engine/deploy-azure-container-app.ps1'
    }
    nextCommand = "npm run marvin:azure:deploy -- -SubscriptionId <subscription-guid> -WorkloadName $ResolvedWorkload -Environment $ResolvedEnvironment -RegionShort $ResolvedRegionShort -Instance $ResolvedInstance -Location $ResolvedLocation$(if ($ResolvedPublicBaseUrl) { " -PublicBaseUrl $ResolvedPublicBaseUrl" })"
  }
}

$resourceGroupName = "rg-$WorkloadName-$Environment-$RegionShort-$Instance"
$containerAppEnvironmentName = "cae-$WorkloadName-$Environment-$RegionShort-$Instance"
$marvinAppName = "ca-$WorkloadName-$Environment-$RegionShort-$Instance"
$logAnalyticsWorkspaceName = "law-$WorkloadName-$Environment-$RegionShort-$Instance"
$storageAccountName = New-StorageAccountName -Workload $WorkloadName -EnvironmentName $Environment -Region $RegionShort -InstanceId $Instance
$registryName = New-AcrName -Workload $WorkloadName -EnvironmentName $Environment -Region $RegionShort -InstanceId $Instance
$fileShareName = 'marvinstate'
$storageLinkName = 'marvinstate'
$entraAppDisplayName = 'Project Marvin Portal'
$microsoftCalendarAppDisplayName = 'Project Marvin'
$legacyEntraAppDisplayName = "app-$WorkloadName-$Environment-$RegionShort-$Instance"
$legacyMicrosoftCalendarAppDisplayName = "app-$WorkloadName-$Environment-$RegionShort-$Instance-calendar"
$PublicBaseUrl = $PublicBaseUrl.TrimEnd('/')
$templatePath = Resolve-Path (Join-Path $PSScriptRoot '..\..\infra\marvin-azure.bicep')
$plan = New-DeploymentPlan -Subscription $SubscriptionId -ResourceGroup $resourceGroupName -Registry $registryName -EnvironmentName $containerAppEnvironmentName -AppName $marvinAppName -WorkspaceName $logAnalyticsWorkspaceName -StorageAccount $storageAccountName -ShareName $fileShareName -StorageLink $storageLinkName -Template $templatePath.Path -ResolvedLocation $Location -ResolvedWorkload $WorkloadName -ResolvedEnvironment $Environment -ResolvedRegionShort $RegionShort -ResolvedInstance $Instance -ResolvedPublicBaseUrl $PublicBaseUrl -IntervalSeconds $RuntimeIntervalSeconds -WindowDays $RuntimeWindowDays

if ($EmitPlanOnly) {
  $plan | ConvertTo-Json -Depth 8
  return
}

Require-Command az

if ($SubscriptionId) {
  az account set --subscription $SubscriptionId | Out-Null
  Assert-Success 'Setting Azure subscription context'
}

az group create --name $resourceGroupName --location $Location --tags Owner=$Owner Project=$ProjectName Environment=$Environment CostCenter=$CostCenter ManagedBy=bicep --output none
Assert-Success 'Creating resource group'

if ([string]::IsNullOrWhiteSpace($DataProtectionKey)) {
  $existingAppId = az containerapp show --name $marvinAppName --resource-group $resourceGroupName --query id --output tsv 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($existingAppId)) {
    $DataProtectionKey = az containerapp secret list --name $marvinAppName --resource-group $resourceGroupName --show-values --query "[?name=='data-protection-key'].value | [0]" --output tsv
    if ($LASTEXITCODE -ne 0) { $DataProtectionKey = '' }
  }
  if ([string]::IsNullOrWhiteSpace($DataProtectionKey)) {
    $DataProtectionKey = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  }
}

if ([string]::IsNullOrWhiteSpace($BackupProtectionKey)) {
  $existingBackupAppId = az containerapp show --name $marvinAppName --resource-group $resourceGroupName --query id --output tsv 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($existingBackupAppId)) {
    $BackupProtectionKey = az containerapp secret list --name $marvinAppName --resource-group $resourceGroupName --show-values --query "[?name=='backup-protection-key'].value | [0]" --output tsv
    if ($LASTEXITCODE -ne 0) { $BackupProtectionKey = '' }
  }
  if ([string]::IsNullOrWhiteSpace($BackupProtectionKey)) {
    $BackupProtectionKey = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  }
}

# Preserve existing identity configuration during the preliminary Bicep pass.
# Otherwise an update can remove secret references before the reuse check runs.
$existingMarvinFqdn = az containerapp show --name $marvinAppName --resource-group $resourceGroupName --query properties.configuration.ingress.fqdn --output tsv 2>$null
if ($LASTEXITCODE -ne 0) { $existingMarvinFqdn = '' }
$preflightTenantId = az account show --query tenantId --output tsv
Assert-Success 'Reading preflight Microsoft Entra tenant context'
$preflightEntraClientId = az containerapp show --name $marvinAppName --resource-group $resourceGroupName --query "properties.template.containers[0].env[?name=='MARVIN_ENTRA_CLIENT_ID'].value | [0]" --output tsv 2>$null
if ($LASTEXITCODE -ne 0) { $preflightEntraClientId = '' }
if ([string]::IsNullOrWhiteSpace($preflightEntraClientId)) {
  $preflightEntraClientId = az ad app list --display-name $legacyEntraAppDisplayName --query "[0].appId" --output tsv
  Assert-Success 'Looking up legacy preflight portal application registration'
}
$preflightCalendarClientId = az containerapp show --name $marvinAppName --resource-group $resourceGroupName --query "properties.template.containers[0].env[?name=='MICROSOFT_CLIENT_ID'].value | [0]" --output tsv 2>$null
if ($LASTEXITCODE -ne 0) { $preflightCalendarClientId = '' }
if ([string]::IsNullOrWhiteSpace($preflightCalendarClientId)) {
  $preflightCalendarClientId = az ad app list --display-name $legacyMicrosoftCalendarAppDisplayName --query "[0].appId" --output tsv
  Assert-Success 'Looking up legacy preflight calendar application registration'
}
$preflightEntraClientSecret = ''
$preflightCalendarClientSecret = ''
if (-not [string]::IsNullOrWhiteSpace($existingMarvinFqdn)) {
  $preflightEntraClientSecret = az containerapp secret list --name $marvinAppName --resource-group $resourceGroupName --show-values --query "[?name=='entra-client-secret'].value | [0]" --output tsv 2>$null
  if ($LASTEXITCODE -ne 0) { $preflightEntraClientSecret = '' }
  $preflightCalendarClientSecret = az containerapp secret list --name $marvinAppName --resource-group $resourceGroupName --show-values --query "[?name=='microsoft-calendar-client-secret'].value | [0]" --output tsv 2>$null
  if ($LASTEXITCODE -ne 0) { $preflightCalendarClientSecret = '' }
}
$preflightMarvinUrl = if ($PublicBaseUrl) { $PublicBaseUrl } elseif ([string]::IsNullOrWhiteSpace($existingMarvinFqdn)) { '' } else { "https://$existingMarvinFqdn" }
$preflightEntraRedirectUri = if ($preflightMarvinUrl) { "$preflightMarvinUrl/marvin-api/auth/entra/callback" } else { '' }
$preflightCalendarRedirectUri = if ($preflightMarvinUrl) { "$preflightMarvinUrl/marvin-api/oauth/microsoft/callback" } else { '' }

az acr create --resource-group $resourceGroupName --name $registryName --sku Basic --admin-enabled true --location $Location --tags Owner=$Owner Project=$ProjectName Environment=$Environment CostCenter=$CostCenter ManagedBy=script --output none
Assert-Success 'Creating Azure Container Registry'

$marvinImageTag = 'marvin-hosted-' + ([guid]::NewGuid().Guid.Substring(0, 8))
az acr build --registry $registryName --image "marvin-hosted:$marvinImageTag" --file Dockerfile.marvin .
Assert-Success 'Building Marvin hosted image'

$registryLoginServer = az acr show --name $registryName --query loginServer --output tsv
Assert-Success 'Reading registry login server'
$registryUsername = az acr credential show --name $registryName --query username --output tsv
Assert-Success 'Reading registry username'
$registryPassword = az acr credential show --name $registryName --query passwords[0].value --output tsv
Assert-Success 'Reading registry password'
$containerImage = "$registryLoginServer/marvin-hosted:$marvinImageTag"

$templatePath = Resolve-Path (Join-Path $PSScriptRoot '..\..\infra\marvin-azure.bicep')
$deploymentName = 'marvin-' + ([guid]::NewGuid().Guid.Substring(0, 8))

$deploymentJson = az deployment group create `
  --name $deploymentName `
  --resource-group $resourceGroupName `
  --template-file $templatePath `
  --parameters `
    location=$Location `
    workloadName=$WorkloadName `
    environment=$Environment `
    regionShort=$RegionShort `
    instance=$Instance `
    logAnalyticsWorkspaceName=$logAnalyticsWorkspaceName `
    storageAccountName=$storageAccountName `
    fileShareName=$fileShareName `
    storageLinkName=$storageLinkName `
    containerAppEnvironmentName=$containerAppEnvironmentName `
    marvinAppName=$marvinAppName `
    containerImage=$containerImage `
    registryServer=$registryLoginServer `
    registryUsername=$registryUsername `
    registryPassword=$registryPassword `
    dataProtectionKey=$DataProtectionKey `
    backupProtectionKey=$BackupProtectionKey `
    runtimeIntervalSeconds=$RuntimeIntervalSeconds `
    runtimeWindowDays=$RuntimeWindowDays `
    entraTenantId=$preflightTenantId `
    entraClientId=$preflightEntraClientId `
    entraClientSecret=$preflightEntraClientSecret `
    entraRedirectUri=$preflightEntraRedirectUri `
    microsoftCalendarClientId=$preflightCalendarClientId `
    microsoftCalendarClientSecret=$preflightCalendarClientSecret `
  --query properties.outputs `
  --output json
Assert-Success 'Bicep deployment'

$outputs = $deploymentJson | ConvertFrom-Json
$azureMarvinUrl = $outputs.marvinUrl.value
$marvinUrl = if ($PublicBaseUrl) { $PublicBaseUrl } else { $azureMarvinUrl }

$entraTenantId = az account show --query tenantId --output tsv
Assert-Success 'Reading Microsoft Entra tenant context'
$entraRedirectUri = "$marvinUrl/marvin-api/auth/entra/callback"
$entraClientId = $preflightEntraClientId
if ([string]::IsNullOrWhiteSpace($entraClientId)) {
  $entraClientId = az ad app list --display-name $legacyEntraAppDisplayName --query "[0].appId" --output tsv
  Assert-Success 'Looking up legacy Microsoft Entra application registration'
}
$entraAppCreated = $false
if ([string]::IsNullOrWhiteSpace($entraClientId)) {
  $entraClientId = az ad app create --display-name $entraAppDisplayName --sign-in-audience AzureADMyOrg --web-redirect-uris $entraRedirectUri --query appId --output tsv
  Assert-Success 'Creating Microsoft Entra application registration'
  $entraAppCreated = $true
} else {
  az ad app update --id $entraClientId --display-name $entraAppDisplayName --sign-in-audience AzureADMyOrg --web-redirect-uris $entraRedirectUri --output none
  Assert-Success 'Updating Microsoft Entra application name and redirect URI'
}
$entraClientSecret = ''
if (-not $entraAppCreated -and -not $RotateEntraCredentials) {
  $entraClientSecret = az containerapp secret list --name $marvinAppName --resource-group $resourceGroupName --show-values --query "[?name=='entra-client-secret'].value | [0]" --output tsv 2>$null
  if ($LASTEXITCODE -ne 0) { $entraClientSecret = '' }
}
if ($entraAppCreated -or $RotateEntraCredentials -or [string]::IsNullOrWhiteSpace($entraClientSecret)) {
  $entraClientSecret = az ad app credential reset --id $entraClientId --append --display-name 'project-marvin-container-app' --years 1 --query password --output tsv
  Assert-Success 'Creating Microsoft Entra application credential'
}

$microsoftCalendarRedirectUri = "$marvinUrl/marvin-api/oauth/microsoft/callback"
$microsoftCalendarClientId = $preflightCalendarClientId
if ([string]::IsNullOrWhiteSpace($microsoftCalendarClientId)) {
  $microsoftCalendarClientId = az ad app list --display-name $legacyMicrosoftCalendarAppDisplayName --query "[0].appId" --output tsv
  Assert-Success 'Looking up legacy Microsoft Graph calendar application registration'
}
$microsoftCalendarAppCreated = $false
if ([string]::IsNullOrWhiteSpace($microsoftCalendarClientId)) {
  $microsoftCalendarClientId = az ad app create --display-name $microsoftCalendarAppDisplayName --sign-in-audience AzureADandPersonalMicrosoftAccount --web-redirect-uris $microsoftCalendarRedirectUri --query appId --output tsv
  Assert-Success 'Creating Microsoft Graph calendar application registration'
  $microsoftCalendarAppCreated = $true
} else {
  az ad app update --id $microsoftCalendarClientId --display-name $microsoftCalendarAppDisplayName --sign-in-audience AzureADandPersonalMicrosoftAccount --web-redirect-uris $microsoftCalendarRedirectUri --output none
  Assert-Success 'Updating Microsoft Graph calendar application name and redirect URI'
}
$calendarPermissionIds = @(az ad app show --id $microsoftCalendarClientId --query "requiredResourceAccess[?resourceAppId=='00000003-0000-0000-c000-000000000000'].resourceAccess[].id" --output tsv)
Assert-Success 'Reading Microsoft Graph calendar delegated permissions'
$missingCalendarPermissions = @()
if ($calendarPermissionIds -notcontains 'e1fe6dd8-ba31-4d61-89e7-88639da4683d') { $missingCalendarPermissions += 'e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope' }
if ($calendarPermissionIds -notcontains '1ec239c2-d7c9-4623-a91a-a9775856bb36') { $missingCalendarPermissions += '1ec239c2-d7c9-4623-a91a-a9775856bb36=Scope' }
if ($missingCalendarPermissions.Count -gt 0) {
  az ad app permission add --id $microsoftCalendarClientId --api 00000003-0000-0000-c000-000000000000 --api-permissions $missingCalendarPermissions --output none
  Assert-Success 'Adding missing Microsoft Graph calendar delegated permissions'
}
$microsoftCalendarClientSecret = ''
if (-not $microsoftCalendarAppCreated -and -not $RotateEntraCredentials) {
  $microsoftCalendarClientSecret = az containerapp secret list --name $marvinAppName --resource-group $resourceGroupName --show-values --query "[?name=='microsoft-calendar-client-secret'].value | [0]" --output tsv 2>$null
  if ($LASTEXITCODE -ne 0) { $microsoftCalendarClientSecret = '' }
}
if ($microsoftCalendarAppCreated -or $RotateEntraCredentials -or [string]::IsNullOrWhiteSpace($microsoftCalendarClientSecret)) {
  $microsoftCalendarClientSecret = az ad app credential reset --id $microsoftCalendarClientId --append --display-name 'project-marvin-calendar-runtime' --years 1 --query password --output tsv
  Assert-Success 'Creating Microsoft Graph calendar application credential'
}

$deploymentName = 'marvin-entra-' + ([guid]::NewGuid().Guid.Substring(0, 8))
$deploymentJson = az deployment group create `
  --name $deploymentName `
  --resource-group $resourceGroupName `
  --template-file $templatePath `
  --parameters `
    location=$Location `
    workloadName=$WorkloadName `
    environment=$Environment `
    regionShort=$RegionShort `
    instance=$Instance `
    logAnalyticsWorkspaceName=$logAnalyticsWorkspaceName `
    storageAccountName=$storageAccountName `
    fileShareName=$fileShareName `
    storageLinkName=$storageLinkName `
    containerAppEnvironmentName=$containerAppEnvironmentName `
    marvinAppName=$marvinAppName `
    containerImage=$containerImage `
    registryServer=$registryLoginServer `
    registryUsername=$registryUsername `
    registryPassword=$registryPassword `
    runtimeIntervalSeconds=$RuntimeIntervalSeconds `
    runtimeWindowDays=$RuntimeWindowDays `
    entraTenantId=$entraTenantId `
    entraClientId=$entraClientId `
    entraClientSecret=$entraClientSecret `
    entraRedirectUri=$entraRedirectUri `
    microsoftCalendarClientId=$microsoftCalendarClientId `
    microsoftCalendarClientSecret=$microsoftCalendarClientSecret `
    dataProtectionKey=$DataProtectionKey `
    backupProtectionKey=$BackupProtectionKey `
  --query properties.outputs `
  --output json
Assert-Success 'Entra-enabled Bicep deployment'
$outputs = $deploymentJson | ConvertFrom-Json
$marvinUrl = $outputs.marvinUrl.value

Write-Host 'Hosted Marvin runtime deployed successfully'
Write-Host "URL: $marvinUrl"
Write-Host "Resource group: $resourceGroupName"
Write-Host "Container registry: $registryName"
Write-Host "Container Apps environment: $containerAppEnvironmentName"
Write-Host "Marvin app: $marvinAppName"
Write-Host "Storage account: $storageAccountName"
Write-Host "File share: $fileShareName"
