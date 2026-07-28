param(
  [string]$ProfilePath = "..\..\profiles\marvin.example.json",
  [string]$ProfileName = "marvin-example"
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$artifactDir = Join-Path $root "artifacts\solutions\$ProfileName\bureaucratic-flow"
$buildDir = Join-Path $PSScriptRoot "build\$ProfileName"

& "$PSScriptRoot\validate.ps1" -ProfileName $ProfileName
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& "$PSScriptRoot\build-solution.ps1" -ProfileName $ProfileName
& "$PSScriptRoot\provision-runtime.ps1" -ProfilePath $ProfilePath -OutputPath (Join-Path $buildDir 'runtime-plan.json')

Write-Host "Prepared automation-first Bureaucratic Flow deployment bundle at $buildDir"
Write-Host "Next automated deployment stage should import a solution-aware cloud flow using pac CLI and Graph-backed connection references."
Write-Host "Do not use the Office 365 Outlook connector for unattended deployment; it does not support service principal authentication."
