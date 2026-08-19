param(
  [string]$Version = "v2.12.0-beta",
  [string]$Destination = "$env:USERPROFILE\Apps\OGCS"
)

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Write-Host "Download the OGCS portable ZIP for $Version and extract it to $Destination."
Write-Host "Releases: https://github.com/phw198/outlookgooglecalendarsync/releases"
