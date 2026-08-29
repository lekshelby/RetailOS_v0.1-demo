$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $projectDir 'apps\api'
$logDir = Join-Path $env:LOCALAPPDATA 'RetailOS\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$appLog = Join-Path $logDir "retailos-server-$stamp.log"
$appErrorLog = Join-Path $logDir "retailos-server-$stamp.error.log"
$node = (Get-Command node.exe -ErrorAction Stop).Source
Set-Location $appDir
& $node 'dist\src\main.js' 1>> $appLog 2>> $appErrorLog
exit $LASTEXITCODE
