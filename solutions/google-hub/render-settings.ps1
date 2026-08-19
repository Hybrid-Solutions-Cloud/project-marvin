param(
  [string]$ProfileName = "marvin-example",
  [string]$Destination = "$env:USERPROFILE\Apps\OGCS\settings.xml"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$template = Join-Path $root "artifacts\solutions\$ProfileName\google-hub\settings.template.xml"
New-Item -ItemType Directory -Force -Path (Split-Path $Destination) | Out-Null
Copy-Item -Force $template $Destination
Write-Host "Copied OGCS settings template to $Destination"
