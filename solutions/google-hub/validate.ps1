param(
  [string]$ProfileName = "marvin-example"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$template = Join-Path $root "artifacts\solutions\$ProfileName\google-hub\settings.template.xml"
$runbook = Join-Path $root "artifacts\solutions\$ProfileName\google-hub\runbook.md"
$errors = @()

if (-not (Test-Path $template)) {
  $errors += "Missing OGCS settings template."
}
if (-not (Test-Path $runbook)) {
  $errors += "Missing OGCS runbook."
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Google Hub validation passed." -ForegroundColor Green
