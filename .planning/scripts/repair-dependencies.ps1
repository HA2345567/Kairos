$workspace = [System.IO.Path]::GetFullPath('D:\Documents\Kairos')
foreach ($relative in @('node_modules', 'backend\node_modules', 'frontend\node_modules')) {
  $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $workspace $relative))
  $backupPath = $sourcePath + '.pre-repair'
  if (-not $sourcePath.StartsWith($workspace + '\') -or -not $backupPath.StartsWith($workspace + '\')) { throw 'Dependency path escaped the workspace' }
  if (Test-Path -LiteralPath $backupPath) { throw "Backup already exists: $backupPath" }
  if (Test-Path -LiteralPath $sourcePath) {
    Move-Item -LiteralPath $sourcePath -Destination $backupPath -ErrorAction Stop
    Write-Output "Preserved $relative in $relative.pre-repair"
  }
}
$env:BUN_INSTALL_CACHE_DIR = 'C:\Users\Harsh\.bun\install\cache'
bun install --backend copyfile
exit $LASTEXITCODE
