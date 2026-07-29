#Requires -Version 7.0

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$profileRoot = Join-Path $root 'profiles'
$solutionRoot = Join-Path $root 'artifacts\solutions'

$profilePatterns = @(
  'marvin-api-test*.json',
  'marvin-api-test*.events.json',
  'marvin-auth-test*.json',
  'marvin-auth-test*.events.json',
  'marvin-callback*.json',
  'marvin-callback*.events.json',
  'marvin-no-client*.json',
  'marvin-no-client*.events.json',
  'marvin-provider-setup*.json',
  'marvin-provider-setup*.events.json',
  'marvin-setup-check*.json',
  'marvin-setup-check*.events.json',
  'marvin-token-test*.json',
  'marvin-token-test*.events.json',
  'marvin-ui-test*.json',
  'marvin-ui-test*.events.json',
  'marvin-ui-token-test*.json',
  'marvin-ui-token-test*.events.json',
  'marvin-with-client*.json',
  'marvin-with-client*.events.json'
)

$solutionPatterns = @(
  'marvin-api-smoke*',
  'marvin-api-test*',
  'marvin-auth-test*',
  'marvin-callback*',
  'marvin-manage-smoke*',
  'marvin-no-client*',
  'marvin-provider-setup*',
  'marvin-token-test*',
  'marvin-ui-test*',
  'marvin-ui-token-test*',
  'marvin-with-client*'
)

foreach ($pattern in $profilePatterns) {
  Get-ChildItem -Path $profileRoot -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
  }
}

foreach ($pattern in $solutionPatterns) {
  Get-ChildItem -Path $solutionRoot -Filter $pattern -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }
}

Write-Host 'Marvin smoke artifacts cleaned.' -ForegroundColor Green
