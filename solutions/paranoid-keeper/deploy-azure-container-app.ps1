param(
  [string]$SubscriptionId,
  [string]$ResourceGroupName = "marvin-keeper-rg",
  [string]$Location = "eastus",
  [string]$EnvironmentName = "marvin-keeper-env",
  [string]$AppName = "marvin-keeper",
  [string]$StorageAccountName,
  [string]$FileShareName = "keeper-data",
  [string]$StorageMountName = "keeperdata",
  [string]$EnvFilePath = ".env",
  [string]$Image = "ghcr.io/ridafkih/keeper-standalone:2.9",
  [string]$AdditionalTrustedOrigins = ""
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Get-EnvMap {
  param([string]$Path)

  $map = @{}
  foreach ($line in Get-Content $Path) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    if ($line.TrimStart().StartsWith("#")) {
      continue
    }

    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
      continue
    }

    $map[$parts[0].Trim()] = $parts[1].Trim()
  }

  return $map
}

function Require-Value {
  param(
    [hashtable]$Map,
    [string]$Name
  )

  if (-not $Map.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Map[$Name])) {
    throw "Missing required value in env file: $Name"
  }
}

function New-RandomStorageAccountName {
  $suffix = -join ((48..57) + (97..122) | Get-Random -Count 10 | ForEach-Object { [char]$_ })
  return "marvin$suffix"
}

function Escape-YamlSingleQuoted {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  return $Value.Replace("'", "''")
}

Require-Command az

$resolvedEnvFilePath = if ([System.IO.Path]::IsPathRooted($EnvFilePath)) {
  Resolve-Path $EnvFilePath
} else {
  Resolve-Path (Join-Path $PSScriptRoot $EnvFilePath)
}

$envMap = Get-EnvMap -Path $resolvedEnvFilePath

Require-Value -Map $envMap -Name "BETTER_AUTH_SECRET"
Require-Value -Map $envMap -Name "ENCRYPTION_KEY"
Require-Value -Map $envMap -Name "MICROSOFT_CLIENT_ID"
Require-Value -Map $envMap -Name "MICROSOFT_CLIENT_SECRET"

if ([string]::IsNullOrWhiteSpace($StorageAccountName)) {
  $StorageAccountName = New-RandomStorageAccountName
}

if ($SubscriptionId) {
  az account set --subscription $SubscriptionId | Out-Null
}

az extension add --name containerapp --upgrade --only-show-errors | Out-Null

Write-Host "Creating or updating resource group $ResourceGroupName"
az group create --name $ResourceGroupName --location $Location --output none

Write-Host "Creating storage account $StorageAccountName"
az storage account create --name $StorageAccountName --resource-group $ResourceGroupName --location $Location --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --output none

Write-Host "Creating Azure Files share $FileShareName"
az storage share-rm create --resource-group $ResourceGroupName --storage-account $StorageAccountName --name $FileShareName --quota 10 --enabled-protocol SMB --output none

$storageAccountKey = az storage account keys list --resource-group $ResourceGroupName --account-name $StorageAccountName --query "[0].value" -o tsv

Write-Host "Creating or updating Container Apps environment $EnvironmentName"
$envExists = $true
try {
  az containerapp env show --name $EnvironmentName --resource-group $ResourceGroupName --output none
} catch {
  $envExists = $false
}

if (-not $envExists) {
  az containerapp env create --name $EnvironmentName --resource-group $ResourceGroupName --location $Location --output none
}

Write-Host "Linking Azure Files share into the Container Apps environment"
az containerapp env storage set --name $EnvironmentName --resource-group $ResourceGroupName --storage-name $StorageMountName --storage-type AzureFile --azure-file-account-name $StorageAccountName --azure-file-account-key $storageAccountKey --azure-file-share-name $FileShareName --access-mode ReadWrite --output none

$environmentId = az containerapp env show --name $EnvironmentName --resource-group $ResourceGroupName --query id -o tsv

$secretLines = @(
  "      - name: better-auth-secret",
  "        value: '$(Escape-YamlSingleQuoted $envMap['BETTER_AUTH_SECRET'])'",
  "      - name: encryption-key",
  "        value: '$(Escape-YamlSingleQuoted $envMap['ENCRYPTION_KEY'])'",
  "      - name: microsoft-client-id",
  "        value: '$(Escape-YamlSingleQuoted $envMap['MICROSOFT_CLIENT_ID'])'",
  "      - name: microsoft-client-secret",
  "        value: '$(Escape-YamlSingleQuoted $envMap['MICROSOFT_CLIENT_SECRET'])'"
)

$envLines = @(
  "        - name: BETTER_AUTH_SECRET",
  "          secretRef: better-auth-secret",
  "        - name: ENCRYPTION_KEY",
  "          secretRef: encryption-key",
  "        - name: MICROSOFT_CLIENT_ID",
  "          secretRef: microsoft-client-id",
  "        - name: MICROSOFT_CLIENT_SECRET",
  "          secretRef: microsoft-client-secret",
  "        - name: TRUSTED_ORIGINS",
  "          value: 'https://placeholder.invalid'"
)

if ($envMap.ContainsKey('GOOGLE_CLIENT_ID') -and -not [string]::IsNullOrWhiteSpace($envMap['GOOGLE_CLIENT_ID'])) {
  $secretLines += "      - name: google-client-id"
  $secretLines += "        value: '$(Escape-YamlSingleQuoted $envMap['GOOGLE_CLIENT_ID'])'"
  $envLines += "        - name: GOOGLE_CLIENT_ID"
  $envLines += "          secretRef: google-client-id"
}

if ($envMap.ContainsKey('GOOGLE_CLIENT_SECRET') -and -not [string]::IsNullOrWhiteSpace($envMap['GOOGLE_CLIENT_SECRET'])) {
  $secretLines += "      - name: google-client-secret"
  $secretLines += "        value: '$(Escape-YamlSingleQuoted $envMap['GOOGLE_CLIENT_SECRET'])'"
  $envLines += "        - name: GOOGLE_CLIENT_SECRET"
  $envLines += "          secretRef: google-client-secret"
}

$yamlLines = @(
  "location: $Location",
  "properties:",
  "  managedEnvironmentId: $environmentId",
  "  configuration:",
  "    ingress:",
  "      external: true",
  "      targetPort: 80",
  "      transport: auto",
  "    secrets:"
)
$yamlLines += $secretLines
$yamlLines += @(
  "  template:",
  "    containers:",
  "      - name: keeper",
  "        image: $Image",
  "        env:"
)
$yamlLines += $envLines
$yamlLines += @(
  "        resources:",
  "          cpu: 0.5",
  "          memory: 1Gi",
  "        volumeMounts:",
  "          - volumeName: keeper-data",
  "            mountPath: /var/lib/postgresql/data",
  "    scale:",
  "      minReplicas: 1",
  "      maxReplicas: 1",
  "    volumes:",
  "      - name: keeper-data",
  "        storageType: AzureFile",
  "        storageName: $StorageMountName"
)

$tempYaml = Join-Path $env:TEMP "$AppName-containerapp.yaml"
$yamlLines | Set-Content -Path $tempYaml

Write-Host "Deploying Keeper to Azure Container Apps"
$containerAppExists = $true
try {
  az containerapp show --name $AppName --resource-group $ResourceGroupName --output none
} catch {
  $containerAppExists = $false
}

if ($containerAppExists) {
  az containerapp update --name $AppName --resource-group $ResourceGroupName --yaml $tempYaml --output none
} else {
  az containerapp create --name $AppName --resource-group $ResourceGroupName --environment $EnvironmentName --yaml $tempYaml --output none
}

$fqdn = az containerapp show --name $AppName --resource-group $ResourceGroupName --query properties.configuration.ingress.fqdn -o tsv
$trustedOrigins = @("https://$fqdn")

if (-not [string]::IsNullOrWhiteSpace($AdditionalTrustedOrigins)) {
  $trustedOrigins += $AdditionalTrustedOrigins.Split(",", [System.StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim() }
}

$trustedOriginsValue = ($trustedOrigins | Select-Object -Unique) -join ","

Write-Host "Updating TRUSTED_ORIGINS to $trustedOriginsValue"
az containerapp update --name $AppName --resource-group $ResourceGroupName --set-env-vars TRUSTED_ORIGINS=$trustedOriginsValue --output none

Write-Host "Keeper deployed successfully"
Write-Host "URL: https://$fqdn"
Write-Host "Resource group: $ResourceGroupName"
Write-Host "Container Apps environment: $EnvironmentName"
Write-Host "Storage account: $StorageAccountName"
Write-Host "File share: $FileShareName"
