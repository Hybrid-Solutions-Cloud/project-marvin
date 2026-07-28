param(
  [string]$ProfileName = "marvin-example"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$artifactDir = Join-Path $root "artifacts\solutions\$ProfileName\bureaucratic-flow"
$errors = @()

if (-not (Test-Path (Join-Path $artifactDir "flow-settings.json"))) {
  $errors += "Missing generated flow-settings.json"
}
if (-not (Test-Path (Join-Path $artifactDir "import-checklist.md"))) {
  $errors += "Missing generated import-checklist.md"
}
if (-not (Test-Path (Join-Path $PSScriptRoot "runtime.example.json"))) {
  $errors += "Missing runtime.example.json"
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Bureaucratic Flow validation passed." -ForegroundColor Green
