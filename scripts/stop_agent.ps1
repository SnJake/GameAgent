$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$escapedRoot = [regex]::Escape($root)

$targets = Get-CimInstance Win32_Process | Where-Object {
    $cmd = $_.CommandLine
    if (-not $cmd) {
        return $false
    }

    $isBackend = $cmd -match "uvicorn backend\.app\.main:app" -and $cmd -match $escapedRoot
    $isFrontend = $cmd -match "GameAgent\\frontend.*vite" `
        -or $cmd -match "npm.*run dev.*5173" `
        -or $cmd -match "vite --host 127\.0\.0\.1 --port 5173"

    return $isBackend -or $isFrontend
}

if (-not $targets) {
    Write-Host "No Arknights Agent processes found."
    exit 0
}

$targets | Select-Object ProcessId, Name, CommandLine | Format-Table -AutoSize
$targets | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopped Arknights Agent processes."
