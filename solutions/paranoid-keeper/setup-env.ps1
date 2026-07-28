param(
  [string]$ProfilePath = "..\..\profiles\marvin.example.json"
)

if ([System.IO.Path]::IsPathRooted($ProfilePath)) {
  $resolvedProfilePath = Resolve-Path $ProfilePath
} else {
  $resolvedProfilePath = Resolve-Path (Join-Path $PSScriptRoot $ProfilePath)
}

$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
  Write-Host ".env already exists at $envPath"
  exit 0
}

$secretA = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
$secretB = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

@"
BETTER_AUTH_SECRET=$secretA
ENCRYPTION_KEY=$secretB
TRUSTED_ORIGINS=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
"@ | Set-Content -Path $envPath

Write-Host "Created $envPath"
Write-Host "Fill in provider OAuth values before starting Keeper."
Write-Host "Profile reference: $resolvedProfilePath"
