$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$taskName = 'RetailOS-Server'
$port = 31081

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator PowerShell is required. This deployment stops and restarts only the RetailOS-Server scheduled task.'
}

Write-Output 'Stopping the RetailOS server task...'
Stop-ScheduledTask -TaskName $taskName
$deadline = (Get-Date).AddSeconds(45)
do {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if ($listener) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  $commandLine = [string]$process.CommandLine
  $isRetailOsServer = $process.Name -ieq 'node.exe' -and $commandLine -match '(?i)(?:^|\s)["'']?dist[\\/]src[\\/]main\.js(?:["'']?|\s|$)'
  if (-not $isRetailOsServer) {
    throw "Port $port remains owned by process ID $($listener.OwningProcess) ($($process.Name)). Its command line did not identify it as RetailOS, so it was not terminated."
  }
  Write-Output "Stopping the confirmed RetailOS server process (PID $($listener.OwningProcess))..."
  Stop-Process -Id $listener.OwningProcess -Force
  $deadline = (Get-Date).AddSeconds(15)
  do {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { break }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  if ($listener) { throw "The confirmed RetailOS server process did not release port $port." }
}

Write-Output 'Applying migrations, building, and starting RetailOS...'
Set-Location $projectDir
& (Join-Path $PSScriptRoot 'start-retailos.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'RetailOS deployment completed and the health check passed.'
