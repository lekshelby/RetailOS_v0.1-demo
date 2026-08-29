$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $env:LOCALAPPDATA 'RetailOS'
$logDir = Join-Path $runtimeDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$startupLog = Join-Path $logDir 'startup.log'

function Write-StartupLog([string]$message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message"
  $line | Tee-Object -FilePath $startupLog -Append
}

function Find-DockerCommand {
  $command = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\resources\bin\docker.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
  )
  $found = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($found) { return $found }
  foreach ($root in @((Join-Path $env:LOCALAPPDATA 'Programs\Docker'), (Join-Path $env:ProgramFiles 'Docker'))) {
    if (Test-Path -LiteralPath $root) {
      $found = Get-ChildItem -LiteralPath $root -Recurse -Filter docker.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
      if ($found) { return $found }
    }
  }
}

function Find-DockerDesktop([string]$dockerPath) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker Desktop.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
  )
  $folder = Split-Path -Parent $dockerPath
  for ($level = 0; $level -lt 5 -and $folder; $level += 1) {
    $candidates += Join-Path $folder 'Docker Desktop.exe'
    $parent = Split-Path -Parent $folder
    if ($parent -eq $folder) { break }
    $folder = $parent
  }
  return $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

$healthUri = 'http://127.0.0.1:31081/api/health'
try {
  $existingHealth = Invoke-RestMethod -Uri $healthUri -TimeoutSec 3
  if ($existingHealth.status -eq 'ok') { Write-StartupLog 'RetailOS is already healthy on port 31081.'; exit 0 }
} catch { }

$portOwner = Get-NetTCPConnection -LocalPort 31081 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portOwner) { throw "Port 31081 is occupied by process ID $($portOwner.OwningProcess), but RetailOS health did not respond. Do not start another copy; inspect $startupLog." }

Push-Location $projectDir
try {
  Write-StartupLog 'Starting RetailOS production startup check.'
  $docker = Find-DockerCommand
  if (-not $docker) { throw 'Docker Desktop command was not found for this Windows user.' }

  $desktop = Find-DockerDesktop $docker
  if ($desktop -and -not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    Write-StartupLog "Launching Docker Desktop from $desktop."
    Start-Process -FilePath $desktop -WindowStyle Hidden
  } elseif (-not $desktop) {
    Write-StartupLog "Docker Desktop launcher was not found beside $docker; waiting for an existing Docker engine."
  }

  $compose = @('compose', '--env-file', '.env.local', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml')
  $dockerDeadline = (Get-Date).AddMinutes(5)
  do {
    $engineVersion = & $docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -eq 0 -and $engineVersion) { break }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $dockerDeadline)
  if ($LASTEXITCODE -ne 0 -or -not $engineVersion) { throw 'Docker Desktop engine did not become ready within five minutes.' }
  Write-StartupLog "Docker engine is ready (server $engineVersion)."

  Write-StartupLog 'Starting RetailOS PostgreSQL container.'
  & $docker @compose up -d postgres
  if ($LASTEXITCODE -ne 0) { throw 'RetailOS PostgreSQL could not be started.' }
  $databaseDeadline = (Get-Date).AddMinutes(2)
  do {
    & $docker @compose exec -T postgres pg_isready -U retailos -d retailos *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $databaseDeadline)
  if ($LASTEXITCODE -ne 0) { throw 'RetailOS PostgreSQL did not become ready within two minutes.' }

  $pnpm = Join-Path $env:APPDATA 'npm\pnpm.cmd'
  if (-not (Test-Path -LiteralPath $pnpm)) { throw 'pnpm.cmd was not found in the current Windows user profile.' }
  Write-StartupLog 'Building RetailOS production server.'
  & $pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'RetailOS production build failed.' }

  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $appDir = Join-Path $projectDir 'apps\api'
  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
  $appLog = Join-Path $logDir "retailos-$stamp.log"
  $appErrorLog = Join-Path $logDir "retailos-$stamp.error.log"
  Write-StartupLog "Starting compiled RetailOS server; logs: $appLog"
  Start-Process -FilePath $node -ArgumentList @('dist\src\main.js') -WorkingDirectory $appDir -RedirectStandardOutput $appLog -RedirectStandardError $appErrorLog -WindowStyle Hidden

  $appDeadline = (Get-Date).AddSeconds(60)
  do {
    try {
      $health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 3
      if ($health.status -eq 'ok') { Write-StartupLog 'RetailOS is healthy on port 31081.'; exit 0 }
    } catch { }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $appDeadline)
  $lastError = if (Test-Path -LiteralPath $appErrorLog) { (Get-Content -LiteralPath $appErrorLog -Tail 20) -join "`n" } else { 'No application error log was created.' }
  throw "RetailOS did not become healthy within 60 seconds. Review $appErrorLog. Last output: $lastError"
} catch {
  Write-StartupLog "FAILED: $($_.Exception.Message)"
  throw
} finally {
  Pop-Location
}
