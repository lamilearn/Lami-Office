# Script Startup Lami's AI Office (Windows PowerShell)
# Port: 8090

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   🏢 MEMULAI LAMI'S AI OFFICE (8090)   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Magenta

# 1. Cari executable Python
$pythonExe = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonExe = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonExe = "py"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonExe = "python3"
}

if (-not $pythonExe) {
    Write-Host "[ERROR] Python belum terdeteksi di PATH." -ForegroundColor Red
    Write-Host "Pastikan Python 3 sudah terinstall." -ForegroundColor Yellow
    exit 1
}

# 2. Cek apakah server sudah running di port 8090
$conn = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[INFO] Server sudah berjalan di port 8090 (PID: $($conn.OwningProcess))." -ForegroundColor Green
} else {
    Write-Host "[INFO] Menjalankan server bridge Python..." -ForegroundColor Yellow
    Start-Process -FilePath $pythonExe -ArgumentList "server.py" -WorkingDirectory $rootDir
    Start-Sleep -Seconds 2
}

# 3. Tampilkan opsi Tunnel
Write-Host "`n[AKSES LOKAL] Buka di browser: http://localhost:8090" -ForegroundColor Cyan
Write-Host "[TIKTOK 9:16] Mode rekaman:     http://localhost:8090/?vertical=1" -ForegroundColor Magenta
Write-Host "[DEMO MODE]   Mode simulasi:    http://localhost:8090/?demo=1" -ForegroundColor Yellow

if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    Write-Host "`n[TUNNEL] Jalankan perintah ini untuk go-live publik:" -ForegroundColor Gray
    Write-Host "  cloudflared tunnel run lami-office" -ForegroundColor White
    Write-Host "  URL: https://office.fatihrumi.id`n" -ForegroundColor Green
} else {
    Write-Host "`n[TUNNEL] cloudflared belum terinstall. Install via: winget install Cloudflare.cloudflared" -ForegroundColor Gray
}

# Buka browser
Start-Process "http://localhost:8090"
