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
      stateMountPath = '/data'
    }
    files = [ordered]@{
      dockerfile = 'Dockerfile.marvin'
      bicepTemplate = $Template
      deployScript = 'solutions/marvin-engine/deploy-azure-container-app.ps1'
    }
    nextCommand = "npm run marvin:azure:deploy -- -SubscriptionId <subscription-guid> -WorkloadName $ResolvedWorkload -Environment $ResolvedEnvironment -RegionShort $ResolvedRegionShort -Instance $ResolvedInstance -Location $ResolvedLocation"
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
$templatePath = Resolve-Path (Join-Path $PSScriptRoot '..\..\infra\marvin-azure.bicep')
$plan = New-DeploymentPlan -Subscription $SubscriptionId -ResourceGroup $resourceGroupName -Registry $registryName -EnvironmentName $containerAppEnvironmentName -AppName $marvinAppName -WorkspaceName $logAnalyticsWorkspaceName -StorageAccount $storageAccountName -ShareName $fileShareName -StorageLink $storageLinkName -Template $templatePath.Path -ResolvedLocation $Location -ResolvedWorkload $WorkloadName -ResolvedEnvironment $Environment -ResolvedRegionShort $RegionShort -ResolvedInstance $Instance -IntervalSeconds $RuntimeIntervalSeconds -WindowDays $RuntimeWindowDays

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
    runtimeIntervalSeconds=$RuntimeIntervalSeconds `
    runtimeWindowDays=$RuntimeWindowDays `
    tags="{\"Owner\":\"$Owner\",\"Project\":\"$ProjectName\",\"Environment\":\"$Environment\",\"CostCenter\":\"$CostCenter\"}" `
  --query properties.outputs `
  --output json
Assert-Success 'Bicep deployment'

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