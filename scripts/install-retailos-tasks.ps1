$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

$backupAction = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptDir\backup-retailos.ps1`""
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 9:00PM
Register-ScheduledTask -TaskName 'RetailOS-Daily-Backup' -Action $backupAction -Trigger $backupTrigger -Principal $principal -Description 'Creates a local PostgreSQL SQL backup for RetailOS every day at 9 PM while Lek is signed in.' -Force | Out-Null

$startAction = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptDir\start-retailos.ps1`""
$startTrigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName 'RetailOS-Start-At-Logon' -Action $startAction -Trigger $startTrigger -Principal $principal -Description 'Starts RetailOS after Lek signs in, once Docker Desktop is ready.' -Force | Out-Null

Get-ScheduledTask -TaskName 'RetailOS-Daily-Backup', 'RetailOS-Start-At-Logon' | Select-Object TaskName, State
