$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $env:USERPROFILE 'Documents\RetailOS Backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
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
$compose = @('compose', '--env-file', '.env.local', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml')
& $docker @compose up -d postgres | Out-Null
$containerId = (& $docker @compose ps -q postgres).Trim()
if (-not $containerId) { throw 'RetailOS PostgreSQL container is not running.' }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$insideFile = "/tmp/retailos-$stamp.sql"
$backupFile = Join-Path $backupDir "retailos-$stamp.sql"
$partialFile = "$backupFile.partial"
try {
  $dumpCommand = 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > ' + $insideFile
  & $docker exec $containerId sh -lc $dumpCommand
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL backup command failed.' }
  & $docker cp "${containerId}:$insideFile" $partialFile
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $partialFile) -or (Get-Item -LiteralPath $partialFile).Length -eq 0) { throw 'Backup file was not created correctly.' }
  $header = (Get-Content -LiteralPath $partialFile -TotalCount 5) -join "`n"
  if ($header -notmatch 'PostgreSQL database dump') { throw 'Backup file did not contain a PostgreSQL SQL dump header.' }
  Move-Item -LiteralPath $partialFile -Destination $backupFile
  Write-Output "RetailOS backup created: $backupFile"
} finally {
  & $docker exec $containerId rm -f $insideFile 2>$null
  if (Test-Path -LiteralPath $partialFile) { Remove-Item -LiteralPath $partialFile -Force }
  Pop-Location
}
