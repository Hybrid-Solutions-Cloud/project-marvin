$ErrorActionPreference = 'Stop'

Write-Host "Testing Paranoid Keeper"
& "$PSScriptRoot\..\solutions\paranoid-keeper\validate.ps1"

Write-Host "Testing Bureaucratic Flow"
& "$PSScriptRoot\..\solutions\bureaucratic-flow\test.ps1"

Write-Host "Testing Google Hub Of Last Resort"
& "$PSScriptRoot\..\solutions\google-hub\test.ps1"

Write-Host "Testing Marvin Engine"
& "$PSScriptRoot\..\solutions\marvin-engine\test.ps1"
