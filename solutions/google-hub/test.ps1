param(
  [string]$ProfileName = "marvin-example"
)

& "$PSScriptRoot\validate.ps1" -ProfileName $ProfileName
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Next manual test sequence:"
Write-Host "1. Install OGCS using ./install-ogcs.ps1"
Write-Host "2. Render the generated XML with ./render-settings.ps1"
Write-Host "3. Open OGCS and map the Outlook calendars to the Google hub"
Write-Host "4. Run a limited date-window test first"
