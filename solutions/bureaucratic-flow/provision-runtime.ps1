param(
  [string]$ProfilePath = "..\..\profiles\marvin.example.json",
  [string]$OutputPath = ".\build\runtime-plan.json"
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$resolvedProfilePath = if ([System.IO.Path]::IsPathRooted($ProfilePath)) { Resolve-Path $ProfilePath } else { Resolve-Path (Join-Path $PSScriptRoot $ProfilePath) }
$profile = Get-Content $resolvedProfilePath | ConvertFrom-Json

$runtime = [ordered]@{
  automationTenantId = $profile.runtime.powerAutomate.automationTenantId
  environmentUrl = $profile.runtime.powerAutomate.environmentUrl
  deploymentModel = 'graph-http-entra-id'
  graphAppDisplayName = $profile.runtime.powerAutomate.graphAppDisplayName
  supportedAccountTypes = 'AzureADMultipleOrgs'
  requiredGraphPermissions = @('Calendars.ReadWrite')
  targetMicrosoftTenants = @($profile.calendars | Where-Object { $_.provider -eq 'm365' -or $_.provider -eq 'outlook' } | ForEach-Object { $_.tenantId } | Select-Object -Unique)
  deploymentCommands = @(
    'pac auth create --environment <environment-url>',
    'pac solution import --path <solution-zip> --environment <environment-url>',
    'Create HTTP with Microsoft Entra ID or custom Graph connector connections in the automation tenant',
    'Grant admin consent for the multitenant Graph app in each target calendar tenant'
  )
}

New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) | Out-Null
$runtime | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputPath
Write-Host "Wrote runtime plan to $OutputPath"
