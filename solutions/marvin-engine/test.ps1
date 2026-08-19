param(
  [string]$ProfilePath = "..\..\profiles\marvin.example.json",
  [string]$EventsPath = "..\..\profiles\marvin.example.events.json"
)

$resolvedProfilePath = Resolve-Path (Join-Path $PSScriptRoot $ProfilePath)
$resolvedEventsPath = Resolve-Path (Join-Path $PSScriptRoot $EventsPath)

node "$PSScriptRoot\src\cli.mjs" --profile $resolvedProfilePath --events $resolvedEventsPath --dry-run
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

node "$PSScriptRoot\src\cli.mjs" --profile $resolvedProfilePath --events $resolvedEventsPath --apply-mock
