# 🏢 Lami's AI Office — Kantor AI Pixel Live

Visualisasi kantor AI bergaya game **Happy Mall Story** (pixel art pastel, cutaway building) di mana Boss Lami (Hermes) dan karyawan sub-agent bekerja secara **real-time** mengikuti aktivitas AI sesungguhnya.

---

## 🚀 Cara Menjalankan

### 1. Jalankan Server (Port 8090)
**Di Windows (PowerShell):**
```powershell
.\deploy\start.ps1
```

**Di Linux (Ubuntu/Debian/dll):**
```bash
chmod +x deploy/start.sh
./deploy/start.sh
```

Atau manual lewat Python:
```bash
python3 server.py
```
> Server menggunakan **Python Standard Library murni**, tidak perlu install library pihak ketiga (`pip install`).

**Jalankan sebagai Service Background di Linux (Systemd):**
```bash
sudo cp deploy/lami-office.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lami-office
```

Buka di browser:
- **Tampilan Standar:** [http://localhost:8090](http://localhost:8090)
- **Mode Vertikal TikTok (9:16):** [http://localhost:8090/?vertical=1](http://localhost:8090/?vertical=1)
- **Demo Mode (Simulasi):** [http://localhost:8090/?demo=1](http://localhost:8090/?demo=1)

---

## 🎨 Fitur Utama
1. **Style Happy Mall Story & Claude-Office (Isometric 2.5D Pixel Art):**
   - Sudut pandang miring 3/4 isometrik (2:1 diamond grid) persis gameplay Happy Mall Story buatan Happy Labs.
   - 6 lantai platform bertingkat dengan ubin pastel kotak-kotak (checkerboard).
   - Pencahayaan malam (Night Lighting) dengan kolam cahaya radial hangat di setiap lantai.
   - Furniture 3D isometrik: meja eksekutif Boss Lami, meja lab riset, cubicle coding, meja konferensi meeting, sofa lounge pantry, dan rak server bertingkat.
   - Lift kaca isometrik otomatis di sudut barat yang mengantar karyawan & sub-agent antar lantai.
   - Karakter chibi bergerak secara diagonal dengan animasi jalan membal lucu, mengetik, duduk santai (`sit`), dan minum kopi (`drink`).
   - Siklus langit dinamis (siang, sore, malam) mengikuti jam lokal PC atau tombol manual ☀️/🌇/🌙.

2. **Prop Interaktif & Fitur Baru (Referensi Claude-Office & Happy Mall Story):**
   - 🗑️ **Context Window Trashcan (Ruang Boss Lami)**:
     - Tong sampah metal 3D isometrik yang visualnya terisi tumpukan kertas kusut bertambah seiring penggunaan token/konteks LLM.
     - Meluber ke lantai jika pemakaian di atas 70%.
     - Klik tong sampah untuk membuka modal statistik pemakaian token & estimasi batas konteks.
   - 📋 **Multi-Mode Whiteboard (Ruang Meeting 2F)**:
     - Papan tulis interaktif di dinding utara dengan 3 mode view bergantian:
       1. **Tasks**: Sticky notes warna-warni & checklist kemajuan kerja.
       2. **Tools**: Visual diagram batang persentase tools (Terminal, Browser, Planning, Inference).
       3. **Team**: Bagan struktur organisasi hierarki Lami Corp.
     - Klik papan tulis untuk berganti mode dan membuka modal detail Whiteboard.
   - 💧 **Pantry & Break Area Props (1F)**:
     - Dispenser air galon (water cooler) dengan gelembung air naik animasi.
     - Microwave oven dengan lampu timer hangat dan cangkir kopi mengepul.
   - 📄 **The Office / Scranton Dunder Mifflin Tribute Mode (Easter Egg)**:
     - Ketik slash command `/the-office` di drawer Slack chat untuk menyulap kantor menjadi Dunder Mifflin Scranton Branch!
     - Boss Lami berubah menjadi Michael Scott, Dodo menjadi Dwight Schrute, Bima menjadi Jim Halpert, Sekar menjadi Pam Beesly, dan Rina menjadi Angela Martin!
     - Spanduk atap otomatis berganti menjadi `📄 DUNDER MIFFLIN`.

3. **Slack-Style Chat Drawer & Slash Commands:**
   - Tombol 💬 di pojok kanan atas membuka chat internal kantor.
   - Dukungan Slash Commands:
     - `/status`: Cek kesehatan kantor, jumlah staf, dan saldo koin 📊
     - `/agents`: Daftar posisi dan pekerjaan seluruh staf di gedung 👥
     - `/whiteboard [tasks|tools|team]`: Buka modal whiteboard 2F 📋
     - `/context [0-100]`: Pantau & simulasikan kapasitas context window 🗑️
     - `/the-office`: Aktifkan Easter Egg mode Scranton Dunder Mifflin 📄
     - `/event [pizza|flicker|coffee|printer]`: Trigger event kantor acak 🍕⚡☕📄
     - `/time [day|sunset|night|auto]`: Ganti suasana pencahayaan kantor ☀️🌙
     - `/clear`: Bersihkan riwayat percakapan 🧹

4. **Fitur Konten TikTok:**
   - **Mode 9:16**: Format pas untuk rekaman layar smartphone (`/?vertical=1`).
   - **HUD & Ticker**: Catatan aktivitas berjalan ala game sim retro.
   - **Sound FX 8-Bit Web Audio**: Suara ketikan keyboard, lift chime, koin emas, pop, error tanpa file audio eksternal.
   - **Klik Karyawan**: Muncul kartu profil berisi tugas yang sedang dikerjakan.

---

## 🌐 Setup Cloudflare Tunnel (`office.fatihrumi.id`)

1. Login Cloudflare Tunnel:
   ```bash
   cloudflared tunnel login
   ```
2. Buat tunnel bernama `lami-office`:
   ```bash
   cloudflared tunnel create lami-office
   ```
3. Arahkan subdomain DNS:
   ```bash
   cloudflared tunnel route dns lami-office office.fatihrumi.id
   ```
4. Salin `<TUNNEL_ID>` dari file `.cloudflared/<TUNNEL_ID>.json` ke file [deploy/cloudflared-config.yml](file:///d:/Hermes/AI-Office/deploy/cloudflared-config.yml).
5. Jalankan tunnel:
   ```bash
   cloudflared tunnel --config deploy/cloudflared-config.yml run lami-office
   ```
Kantor sekarang bisa diakses publik dari mana saja di: **`https://office.fatihrumi.id`**

---

## 🤖 Integrasi Hermes Agent di VPS

AI Office ini dirancang khusus agar mudah tersambung dengan **Hermes Agent** di VPS melalui dua cara:

### Cara 1: Auto-Watcher (Zero-Code)
Server otomatis memantau file state atau sesi percakapan Hermes:
- Jika Hermes menyimpan state di SQLite: sesuaikan `"sqlite_path": "{hermes_home}/state.db"` di `config.json`.
- Jika Hermes menyimpan file sesi JSON: sesuaikan `"sessions_glob": "{hermes_home}/sessions/**/*.json*"` di `config.json`.
- Jalankan probe untuk memeriksa deteksi:
  ```bash
  python3 server.py --probe
  ```

### Cara 2: Direct Hook via `deploy/hermes_hook.py` (Praktis & Real-Time)
Hermes agent dapat mengirim aktivitas langsung ke AI Office menggunakan helper script `deploy/hermes_hook.py`:

**Dari skrip Python Hermes:**
```python
from deploy.hermes_hook import OfficeHook

hook = OfficeHook("http://127.0.0.1:8090")

# Saat Hermes memanggil tool
hook.tool_start(agent_id="lami", tool="code", summary="Edit auth controller")

# Saat tool selesai
hook.tool_end(agent_id="lami", tool="code", ok=True)

# Saat men-spawn sub-agent baru
hook.spawn_agent(agent_id="sa1", name="Budi", task="Riset API TikTok")
hook.tool_start(agent_id="sa1", tool="search", summary="Browsing API docs")
hook.agent_done(agent_id="sa1", ok=True, result="Riset selesai")
```

**Dari terminal / bash script:**
```bash
python3 deploy/hermes_hook.py tool_start --tool terminal --summary "Migrasi database"
python3 deploy/hermes_hook.py tool_end --tool terminal --ok
python3 deploy/hermes_hook.py status --status thinking
```

---

## 🔒 Keamanan & Sensor Data
- Web publik bersifat **Read-Only** (hanya melihat simulasi, tidak dapat mengirim eksekusi ke sistem).
- Server otomatis menyensor file path asli, secret token, API key, dan email sebelum dikirim ke browser.
- Mode publik dapat disetel ke `demo` di [config.json](file:///d:/Hermes/AI-Office/config.json) jika ingin pengunjung luar hanya melihat simulasi aman.

