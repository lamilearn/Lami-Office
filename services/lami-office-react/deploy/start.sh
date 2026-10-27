#!/usr/bin/env bash
# ========================================================
#   🏢 Lami's AI Office - Linux Startup Script (Port 8090)
# ========================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo -e "\033[1;35m========================================\033[0m"
echo -e "\033[1;36m   🏢 MEMULAI LAMI'S AI OFFICE (8090)   \033[0m"
echo -e "\033[1;35m========================================\033[0m"

# 1. Cek Python 3
if ! command -v python3 &> /dev/null; then
    echo -e "\033[1;31m[ERROR] python3 tidak ditemukan. Silakan install Python 3 (misal: sudo apt install python3)\033[0m"
    exit 1
fi

# 2. Cek apakah port 8090 sudah berjalan
if ss -tuln | grep -q ":8090 "; then
    echo -e "\033[1;32m[INFO] Server sudah berjalan di port 8090.\033[0m"
else
    echo -e "\033[1;33m[INFO] Menjalankan server bridge Python di background...\033[0m"
    nohup python3 server.py > server.log 2>&1 &
    sleep 1
    echo -e "\033[1;32m[INFO] Server aktif! Log tersimpan di server.log.\033[0m"
fi

echo -e "\n\033[1;36m[AKSES LOKAL] Buka di browser: http://localhost:8090\033[0m"
echo -e "\033[1;35m[TIKTOK 9:16] Mode rekaman:     http://localhost:8090/?vertical=1\033[0m"
echo -e "\033[1;33m[DEMO MODE]   Mode simulasi:    http://localhost:8090/?demo=1\033[0m"

# 3. Cek Cloudflare Tunnel jika ada
if command -v cloudflared &> /dev/null; then
    echo -e "\n\033[0;37m[TUNNEL] Jalankan untuk go-live publik:\033[0m"
    echo -e "  cloudflared tunnel run lami-office"
    echo -e "  URL: \033[1;32mhttps://office.fatihrumi.id\033[0m\n"
else
    echo -e "\n\033[0;37m[TUNNEL] cloudflared belum terinstall di Linux.\033[0m"
    echo -e "Install via: curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo ... atau package manager distro Anda.\n"
fi
