[CmdletBinding()]
param([switch]$VerifyNow)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [System.Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principalCheck.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator PowerShell is required to install RetailOS scheduled tasks. Close this window, then open PowerShell with Run as administrator and run the same command again.'
}
$runAsUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $runAsUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew

if (-not (Test-Path -LiteralPath $powershell)) { throw 'Windows PowerShell was not found.' }
foreach ($file in 'backup-retailos.ps1', 'start-retailos.ps1') {
  if (-not (Test-Path -LiteralPath (Join-Path $scriptDir $file))) { throw "Required script is missing: $file" }
}

$backupAction = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptDir\backup-retailos.ps1`""
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 9:00PM
Register-ScheduledTask -TaskName 'RetailOS-Daily-Backup' -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $settings -Description "Creates a verified local and OneDrive PostgreSQL backup for RetailOS at 9 PM while $runAsUser is signed in." -Force | Out-Null

$startAction = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptDir\start-retailos.ps1`""
$startTrigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName 'RetailOS-Start-At-Logon' -Action $startAction -Trigger $startTrigger -Principal $principal -Settings $settings -Description "Starts Docker Desktop and RetailOS after $runAsUser signs in, then confirms the RetailOS health endpoint." -Force | Out-Null

Get-ScheduledTask -TaskName 'RetailOS-Daily-Backup', 'RetailOS-Start-At-Logon' |
  Select-Object TaskName, State, @{ Name = 'RunAs'; Expression = { $runAsUser } }

if ($VerifyNow) {
  Write-Output 'Starting the RetailOS logon task now and waiting for its health check.'
  Start-ScheduledTask -TaskName 'RetailOS-Start-At-Logon'
  $deadline = (Get-Date).AddMinutes(8)
  $nextProgress = Get-Date
  do {
    try {
      $health = Invoke-RestMethod 'http://127.0.0.1:31081/api/health' -TimeoutSec 3
      if ($health.status -eq 'ok') { Write-Output 'RetailOS scheduled startup verification passed.'; exit 0 }
    } catch { }
    if ((Get-Date) -ge $nextProgress) {
      Write-Output "Still waiting for RetailOS startup at $(Get-Date -Format 'HH:mm:ss')..."
      $nextProgress = (Get-Date).AddSeconds(15)
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  $logFile = Join-Path $env:LOCALAPPDATA 'RetailOS\logs\startup.log'
  $log = if (Test-Path -LiteralPath $logFile) { (Get-Content -LiteralPath $logFile -Tail 40) -join "`n" } else { 'No startup log was created.' }
  throw "RetailOS scheduled startup did not become healthy within eight minutes. Startup log: $log"
}
