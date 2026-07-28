param(
  [string]$ProfilePath = "..\..\profiles\marvin.example.json"
)

if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) {
  & "$PSScriptRoot\setup-env.ps1" -ProfilePath $ProfilePath | Out-Null
}

& "$PSScriptRoot\validate.ps1" -ProfilePath $ProfilePath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Suggested next manual test sequence:"
Write-Host "1. Fill OAuth values in .env"
Write-Host "2. Run ./start.ps1"
Write-Host "3. Open http://localhost:8080"
Write-Host "4. Add Microsoft and Google connections"
Write-Host "5. Configure routes from artifacts/solutions/marvin-example/paranoid-keeper/sync-plan.md"
