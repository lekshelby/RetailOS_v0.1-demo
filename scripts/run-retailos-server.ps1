$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $projectDir 'apps\api'
$runtimeDir = Join-Path $env:LOCALAPPDATA 'RetailOS'
$logDir = Join-Path $env:LOCALAPPDATA 'RetailOS\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$supervisorLog = Join-Path $logDir 'supervisor.log'
$pidFile = Join-Path $runtimeDir 'server.pid'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$git = Get-Command git.exe -ErrorAction SilentlyContinue
$gitCandidates = @(
  'C:\Program Files\Git\cmd\git.exe'
  'C:\Program Files\Git\bin\git.exe'
)
$githubDesktopRoot = Join-Path $env:LOCALAPPDATA 'GitHubDesktop'
if (Test-Path -LiteralPath $githubDesktopRoot) {
  $gitCandidates += Get-ChildItem -LiteralPath $githubDesktopRoot -Directory -Filter 'app-*' |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'resources\app\git\cmd\git.exe' }
}
$gitPath = if ($git) {
  if ($git.Path) { $git.Path } else { $git.Source }
} else {
  $gitCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
function Write-SupervisorLog([string]$message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message"
  Add-Content -LiteralPath $supervisorLog -Value $line -Encoding UTF8
}

$entryPoint = Join-Path $appDir 'dist\src\main.js'
if (-not (Test-Path -LiteralPath $entryPoint)) {
  Write-SupervisorLog "FAILED: compiled entry point is missing: $entryPoint"
  throw "RetailOS compiled entry point is missing: $entryPoint"
}

# Process-level values deliberately override .env so every supervised instance
# is reachable from this PC and other devices on the local network.
$env:HOST = '0.0.0.0'
$env:PORT = '31081'
$restartDelaySeconds = 3

Write-SupervisorLog "Supervisor started (PID $PID); source=$projectDir; node=$node; binding=$($env:HOST):$($env:PORT)."
while ($true) {
  if ($gitPath) {
    $env:RETAILOS_BUILD_COMMIT = ((& $gitPath -C $projectDir rev-parse --short HEAD 2>$null) | Out-String).Trim()
  }
  $distDir = Join-Path $appDir 'dist'
  $newestArtifact = Get-ChildItem -LiteralPath $distDir -Recurse -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($newestArtifact) { $env:RETAILOS_BUILD_COMPILED_AT = $newestArtifact.LastWriteTimeUtc.ToString('o') }

  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
  $appLog = Join-Path $logDir "retailos-server-$stamp.log"
  $appErrorLog = Join-Path $logDir "retailos-server-$stamp.error.log"
  $startedAt = Get-Date
  Write-SupervisorLog "Starting RetailOS; commit=$($env:RETAILOS_BUILD_COMMIT); stdout=$appLog; stderr=$appErrorLog."

  try {
    $process = Start-Process -FilePath $node -ArgumentList @('dist\src\main.js') -WorkingDirectory $appDir -RedirectStandardOutput $appLog -RedirectStandardError $appErrorLog -WindowStyle Hidden -PassThru
    [System.IO.File]::WriteAllText($pidFile, [string]$process.Id)
    Write-SupervisorLog "RetailOS process started (PID $($process.Id))."
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    $uptime = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
    Write-SupervisorLog "RetailOS process PID $($process.Id) exited with code $exitCode after $uptime seconds; restarting in $restartDelaySeconds seconds."
  } catch {
    Write-SupervisorLog "FAILED to run RetailOS: $($_.Exception.Message); retrying in $restartDelaySeconds seconds."
  } finally {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds $restartDelaySeconds
  if (((Get-Date) - $startedAt).TotalMinutes -lt 1) {
    $restartDelaySeconds = [math]::Min(60, $restartDelaySeconds * 2)
  } else {
    $restartDelaySeconds = 3
  }
}
