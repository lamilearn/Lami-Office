# 🏢 PROMPT UNTUK LAMI (HERMES): DEPLOY & JALANKAN AI OFFICE (PORT 8090)

> Copy seluruh isi prompt di bawah garis ini, lalu kirim ke Lami (Hermes) bersama dengan file arsip `lami-office-linux.tar.gz`.

---

## 👑 PESAN UNTUK LAMI (BOSS AI OFFICE)

Halo Lami! Seluruh codebase **Lami's AI Office** sudah selesai dibangun dan dikemas rapi di dalam arsip **`lami-office-linux.tar.gz`**.

Tugasmu sekarang adalah **meng-ekstrak, memeriksa, dan menjalankan project ini di environment kamu pada Port 8090**, lalu menyambungkannya ke aktivitas kerjamu sendiri secara real-time.

---

## 📦 ISI PROJECT DALAM ARSIP (`lami-office-linux.tar.gz`)

Di dalam arsip ini sudah terdapat sistem lengkap tanpa perlu install library luar (`pip install` tidak diperlukan, 100% Python Standard Library):

```
AI-Office/
├── server.py                   # Bridge Server (HTTP Web + SSE /events di Port 8090)
├── config.json                 # Konfigurasi port, sensor privasi, mapping tool Hermes
├── README.md                   # Dokumentasi lengkap
├── deploy/
│   ├── start.sh                # Script startup Linux (nohup background + log)
│   ├── start.ps1               # Script startup Windows PowerShell
│   ├── lami-office.service     # Systemd service untuk Linux daemon otomatis
│   ├── cloudflared-config.yml  # Config Named Tunnel ke office.fatihrumi.id
│   └── hermes_hook.py          # Helper CLI & Python module untuk push event langsung dari Hermes
└── web/
    ├── index.html              # Layout HTML (Canvas, HUD, Ticker, Info Card, Modals)
    ├── css/style.css           # Styling retro pastel Happy Mall Story + TikTok 9:16 + Modals
    └── js/
        ├── config.js           # Geometri gedung cutaway, 6 lantai, slot meja
        ├── sprites.js          # Sprite pixel art prosedural (Lami bersayap, sub-agent, Mochi, The Office)
        ├── audio.js            # Synthesizer audio 8-bit (Web Audio API)
        ├── world.js            # Siklus langit, ubin checkerboard, Whiteboard, Trashcan, Pantry cooler
        ├── agents.js           # Karakter Lami, SubAgent dinamis, rutin karyawan, balon chat
        ├── office.js           # Mesin simulasi lift otomatis, prop hit testing, game loop 60 FPS
        ├── ui.js               # HUD clock, counter tugas/koin, activity ticker, modals, slash commands
        ├── demo.js             # Generator demo realistis untuk rekaman TikTok
        ├── net.js              # Client SSE /events dengan auto-reconnect
        └── main.js             # Bootstrap aplikasi
```

---

## 💬 FITUR UTAMA YANG SUDAH TERPASANG

1. **Balon Chat 100% Bahasa Indonesia:**
   - Boss Lami: *"Tolong bantu: [tugas] ya! 📋"*, *"Bentar, lagi mikir ide... 💡"*, *"Kerja bagus! Mantap 👍"*
   - Sub-Agent: *"Siap tugas baru! 💼"*, *"Mulai kerja... ⚡"*, *"Tugas beres! ✅"*, *"Lapor Boss, selesai! 📄"*
   - Obrolan santai ruangan (Pantry: *"Ngopi dulu bentar ☕"*, Coding: *"Kodingan lancar jaya 💻"*, dll.)
   - Kucing Mochi: *"Meong~ 🐾"*, *"Purrr... 💤"*
2. **Gaya Visual Isometric 2.5D Penuh (Happy Mall Story Asli):**
   - Sudut pandang miring 3/4 isometrik (2:1 diamond grid) persis gameplay Happy Mall Story buatan Happy Labs.
   - 6 lantai platform bertingkat dengan ubin pastel kotak-kotak (checkerboard).
   - Furniture 3D isometrik: meja eksekutif Boss Lami, meja lab riset, cubicle coding, meja bundar meeting, sofa lounge pantry, dan rak server bertingkat.
   - Lift kaca isometrik otomatis di sudut barat yang mengantar karyawan antar lantai.
   - Karakter chibi bergerak secara diagonal dengan animasi jalan membal lucu, mengetik, duduk santai (`sit`), dan minum kopi (`drink`).
   - Pencahayaan malam (Night Lighting) dengan kolam cahaya radial hangat di atas ubin lantai.
3. **Karyawan Tetap & Boss Lami Bergerak Aktif:**
   - **Rina (Kepala Riset - 4F)**: Riset data, cek papan hipotesis (corkboard), peregangan di jendela, konsultasi ke Boss Lami di Roof, ngopi matcha di Pantry.
   - **Dodo (Senior Coder - 3F)**: Coding modul, cek mini server runner, gambar skema arsitektur mikro, ambil camilan di Pantry.
   - **Sekar (Sekretaris - 2F)**: Catat notulensi, update agenda rapat di whiteboard, presentasi progres di podium, santai di sofa Pantry.
   - **Bima (Admin Server - B1)**: Monitoring mainframe, patroli lorong server cek suhu Rack A & traffic Rack B, cek kabel fiber optik, rehat kopi di Pantry.
   - **Boss Lami (Roof)**: Pimpin kantor, tatap panorama kota dari jendela lengkung, rawat bonsai kantor, tinjau balkon gedung, sapa tim di Pantry.
   - **Mochi si Kucing (Pantry)**: Merespons saat ada staf mampir dengan purr atau meong manis!
4. **Fitur Spesial (Referensi Claude-Office / W17ant):**
   - 🗑️ **Context Window Trashcan (Ruang Boss Lami)**: Tong sampah terisi kertas kusut seiring pemakaian token/konteks LLM, meluber jika $> 70\%$, interaktif dengan modal gauge token.
   - 📋 **Multi-Mode Whiteboard (Ruang Meeting 2F)**: Papan tulis interaktif berganti mode Tasks (sticky notes), Tools (diagram bar tools), dan Team (struktur tim).
   - 💧 **Pantry Props (1F)**: Water cooler dispenser bergelembung naik, microwave hangat, rehidrasi staf.
   - 📄 **The Office Tribute Mode**: Ketik `/the-office` untuk mengubah kantor menjadi Dunder Mifflin Scranton (Michael Scott, Dwight Schrute, Jim, Pam, Angela)!
   - **Panel Chat Slack/Discord (`#general-kantor`)**: Obrolan live staf, update status tool, dan slash command (`/status`, `/agents`, `/whiteboard`, `/context`, `/the-office`, `/event`, `/time`, `/clear`, `/help`).
   - **Kejadian Acak Kantor (Random Events)**:
     - 🍕 *Traktir Martabak*: Bang Kurir datang ke Pantry 1F membawa martabak manis hangat!
     - ⚡ *Listrik Kedip*: Layar berkedip sejenak, genset darurat aktif, Bima memastikan server aman.
     - ☕ *Restock Kopi*: Mesin espresso mengepulkan uap tebal, stok kopi baru datang.
     - 📄 *Printer Macet*: Kertas nyangkut di printer, Dodo/Sekar membersihkannya.
   - **Pengatur Suasana Langit di HUD**: Tombol toggle instan `☀️ Siang`, `🌇 Sore`, `🌙 Malam`, atau `🔄 Auto (Sesuai Jam)`.
5. **Fitur Rekaman TikTok:**
   - Mode Vertikal 9:16 (`?vertical=1`)
   - Mode Demo Simulasi (`?demo=1`)
   - Efek suara 8-bit retro (keyboard, lift chime, koin emas)
6. **Keamanan & Privasi Data:**
   - Web publik bersifat **Read-Only**.
   - Server otomatis menyensor file path sistem, secret token, API key, dan email sebelum dikirim ke browser.

---

## 🛠️ LANGKAH-LANGKAH YANG HARUS KAMU LAKUKAN

### Langkah 1: Ekstrak Arsip
Ekstrak arsip di direktori kerjamu:
```bash
tar -xzvf lami-office-linux.tar.gz
cd AI-Office
```

### Langkah 2: Cek Konfigurasi Sumber Data Hermes
Buka dan periksa [config.json](file:///d:/Hermes/AI-Office/config.json):
- Pastikan `"port": 8090`.
- Periksa `"hermes_home": "~/.hermes"`, `"sqlite_path"`, dan `"sessions_glob"`. Sesuaikan dengan lokasi penyimpanan sesi Hermes kamu jika berbeda.
- Kamu bisa menjalankan probe untuk mengecek sumber data dengan perintah:
  ```bash
  python3 server.py --probe
  ```

### Langkah 3: Jalankan Server di Port 8090
**Di OS Linux:**
```bash
chmod +x deploy/start.sh
./deploy/start.sh
```
*(Atau pasang via systemd menggunakan `deploy/lami-office.service`)*

**Di OS Windows:**
```powershell
.\deploy\start.ps1
```

Verifikasi bahwa web bisa diakses di:
- `http://localhost:8090`
- `http://localhost:8090/?vertical=1` (Mode TikTok)
- `http://localhost:8090/?demo=1` (Mode Demo)

### Langkah 4: Hubungkan ke Cloudflare Tunnel (`office.fatihrumi.id`)
1. Pastikan subdomain `office.fatihrumi.id` sudah diarahkan ke tunnel `lami-office`:
   ```bash
   cloudflared tunnel route dns lami-office office.fatihrumi.id
   ```
2. Pastikan file konfigurasi tunnel mengarah ke `http://localhost:8090`.
3. Jalankan tunnel:
   ```bash
   cloudflared tunnel run lami-office
   ```
4. Verifikasi bahwa **`https://office.fatihrumi.id`** sudah bisa diakses secara online dari browser / smartphone.

### Langkah 5: Kirim Event Aktivitas Real-Time ke AI Office
AI Office dapat menerima setiap aksi tool yang kamu jalankan:
- **Otomatis (Watcher):** Jika kamu menyimpan riwayat sesi di SQLite (`~/.hermes/state.db`) atau JSON (`~/.hermes/sessions/`), server membacanya secara otomatis.
- **Direct Hook (Sangat Disarankan):** Kamu juga bisa menggunakan script `deploy/hermes_hook.py` untuk memberi tahu kantor saat kamu sedang menjalankan perintah:
  ```bash
  # Saat kamu mulai berpikir / memanggil tool:
  python3 deploy/hermes_hook.py tool_start --agent-id lami --tool code --summary "Refactoring file server"

  # Saat tool selesai dieksekusi:
  python3 deploy/hermes_hook.py tool_end --agent-id lami --tool code --ok

  # Saat kamu mendelegasikan tugas ke sub-agent:
  python3 deploy/hermes_hook.py spawn --agent-id sa1 --name "Budi" --task "Riset API eksternal"
  python3 deploy/hermes_hook.py done --agent-id sa1 --ok
  ```
  Atau panggil dari skrip Python:
  ```python
  from deploy.hermes_hook import OfficeHook
  office = OfficeHook("http://localhost:8090")
  office.tool_start("lami", tool="code", summary="Editing file")
  ```

### Langkah 6: Laporan Hasil
Setelah selesai, berikan laporan konfirmasi ke saya:
1. Status server di port 8090 (apakah sudah aktif dan normal).
2. Status koneksi data real Hermes (apakah sub-agent muncul saat kamu menjalankan task).
3. Status domain publik `https://office.fatihrumi.id`.

Selamat bertugas, Boss Lami! 🚀👑

