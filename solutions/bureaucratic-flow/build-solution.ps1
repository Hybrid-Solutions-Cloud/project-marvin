param(
  [string]$ProfileName = "marvin-example"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$artifactDir = Join-Path $root "artifacts\solutions\$ProfileName\bureaucratic-flow"
$templateDir = Join-Path $PSScriptRoot "template"
$outputDir = Join-Path $PSScriptRoot "build\$ProfileName"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Copy-Item -Recurse -Force "$templateDir\*" $outputDir -ErrorAction SilentlyContinue
Copy-Item -Force "$artifactDir\flow-settings.json" $outputDir
Copy-Item -Force "$artifactDir\import-checklist.md" $outputDir
Copy-Item -Force (Join-Path $PSScriptRoot "connections.example.json") $outputDir

Write-Host "Prepared Bureaucratic Flow test bundle at $outputDir"
Write-Host "If pac CLI is installed, pack the source with: pac solution pack --zipfile <zip> --folder $outputDir"
