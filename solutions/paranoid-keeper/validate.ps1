param(
  [string]$ProfilePath = "..\..\profiles\marvin.example.json",
  [switch]$StrictPrereqs
)

$resolvedProfilePath = Resolve-Path (Join-Path $PSScriptRoot $ProfilePath)
$errors = @()
$warnings = @()
$envPath = Join-Path $PSScriptRoot ".env"
$composePath = Join-Path $PSScriptRoot "compose.yaml"

if (-not (Test-Path $composePath)) {
  $errors += "compose.yaml is missing."
}

if (-not (Test-Path $envPath)) {
  $warnings += ".env is missing. Run ./setup-env.ps1 first."
}

try {
  $null = Get-Command docker -ErrorAction Stop
} catch {
  if ($StrictPrereqs) {
    $errors += "Docker is not installed or not on PATH."
  } else {
    $warnings += "Docker is not installed or not on PATH."
  }
}

try {
  $profile = Get-Content $resolvedProfilePath | ConvertFrom-Json
  $providers = $profile.calendars.provider
  if ($providers -notcontains 'm365') {
    $errors += "Profile does not include any Microsoft 365 calendars."
  }
} catch {
  $errors += "Unable to read profile at $resolvedProfilePath"
}

$warnings | ForEach-Object { Write-Host "WARN: $_" -ForegroundColor Yellow }

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Paranoid Keeper validation passed." -ForegroundColor Green
