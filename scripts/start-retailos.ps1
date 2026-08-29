$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
if (Get-NetTCPConnection -LocalPort 31081 -State Listen -ErrorAction SilentlyContinue) { exit 0 }
Push-Location $projectDir

function Find-DockerCommand {
  $command = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\resources\bin\docker.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
  )
  return $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

$docker = Find-DockerCommand
if (-not $docker) { throw 'Docker Desktop command was not found for this Windows user.' }
$desktopCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe'),
  (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
)
$desktop = $desktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($desktop -and -not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) { Start-Process -FilePath $desktop -WindowStyle Hidden }
$compose = @('compose', '--env-file', '.env.local', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml')
$deadline = (Get-Date).AddMinutes(5)
do {
  & $docker version *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop did not become ready within five minutes.' }

& $docker @compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw 'RetailOS PostgreSQL could not be started.' }
$pnpm = Join-Path $env:APPDATA 'npm\pnpm.cmd'
if (-not (Test-Path -LiteralPath $pnpm)) { throw 'pnpm.cmd was not found in the current Windows user profile.' }
Start-Process -FilePath $pnpm -ArgumentList 'start:dev' -WorkingDirectory $projectDir -WindowStyle Hidden
Pop-Location
