param(
  [string]$ProfileName = "marvin-example"
)

& "$PSScriptRoot\validate.ps1" -ProfileName $ProfileName
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& "$PSScriptRoot\build-solution.ps1" -ProfileName $ProfileName
Write-Host "Next manual test sequence:"
Write-Host "1. Create the two Office 365 Outlook connections in Power Automate"
Write-Host "2. Import or rebuild the MShekow flow package"
Write-Host "3. Apply settings from the generated flow-settings.json"
Write-Host "4. Run a 1-day test window first"
