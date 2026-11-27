# 🏢 PROMPT UNTUK HERMES: IMPROVE "LAMI'S AI OFFICE"

> Copy semua isi di bawah garis ini, lalu paste ke Hermes.

---

## KONTEKS

Lami, kamu **sudah bikin AI Office** dan sekarang jalan di **port `8090`** (pindah port karena bentrok).
Jadi ini **bukan build dari 0**. Tugasmu sekarang adalah **meng-improve project yang sudah ada** supaya:
1. Tampilannya bergaya **Happy Mall Story** (lucu, hidup, "TikTok-able"),
2. Karakter sub-agent **bergerak mengikuti kerjaan yang benar-benar berjalan**,
3. Bisa dibuka publik lewat **Cloudflare Tunnel → `https://office.fatihrumi.id`**.

**Prinsip utama:**
- **Pertahankan yang sudah jalan.** Jangan hapus atau tulis ulang semuanya. Refactor bertahap.
- **Port tetap `8090`.** Jangan ganti port lagi tanpa izin saya.
- Setiap perubahan besar: jelaskan dulu apa yang diubah & kenapa.

---

## 🔍 LANGKAH 0: AUDIT DULU (wajib sebelum ngoding)

Cek project AI Office yang sudah kamu buat, lalu kasih saya **laporan singkat**:
- Lokasi folder project & struktur filenya.
- Tech stack yang dipakai (frontend, backend, library).
- Cara jalanin sekarang (perintah start, port 8090, proses apa saja yang hidup).
- Fitur yang **sudah ada** vs **belum ada**, dibandingkan dengan target di bawah. Buat dalam bentuk tabel:

| Fitur | Status (✅ ada / 🟡 sebagian / ❌ belum) | Catatan |
|---|---|---|

- Sumber event aktivitas Hermes yang dipakai sekarang (kalau sudah ada), dan seberapa real-time.
- Masalah / bug / hal yang kurang rapi yang kamu temukan.

Setelah itu **usulkan rencana improve** (urutan prioritas) dan **tunggu ACC saya**.

---

## 🎯 TARGET HASIL AKHIR

### 🎨 Art Style: "Happy Mall Story" vibes
- **Gedung dilihat dari samping dengan dinding depan "dibuka"**, jadi isi tiap lantai kelihatan. Gedungnya bertingkat ke atas.
- **Chibi pixel art**: kepala besar, badan kecil, outline gelap tipis, 2–4 frame animasi jalan.
- Warna **cerah, pastel, hangat** (krem, peach, mint, baby blue, kuning lembut). Hindari warna kusam.
- Langit dengan **siklus siang–sore–malam** mengikuti jam lokal. Lampu kantor nyala saat malam.
- Elemen game sim: **speech bubble**, **emote** (💡❗💦💤❤️), **koin/bintang pop-up**, angka melayang (+1 Task!), animasi bounce/squash.
- Font pixel ("Press Start 2P" / "Pixelify Sans").
- Pixel tajam: `image-rendering: pixelated`, scale integer (2x/3x/4x).
- Kalau visual yang sekarang belum sesuai, **upgrade bertahap** (mis. ganti sprite & palet dulu, baru layout).

### 🏗️ Layout Gedung
| Lantai | Ruangan | Fungsi |
|---|---|---|
| 🏆 Top | **Ruang Boss Lami** | Lami di meja besar, tempat sub-agent lapor hasil |
| 4F | **Research Lab** | web search / baca URL / browsing |
| 3F | **Coding Room** | edit file, run terminal |
| 2F | **Meeting Room** | planning / bagi tugas ke banyak sub-agent |
| 1F | **Pantry / Lounge** | agent idle: ngopi, main HP, tidur 💤 |
| B1 | **Server Room** | API call / model inference, lampu server kedip |
| — | **Lift** | jalur sub-agent masuk/keluar & pindah lantai |

Ruangan dibuat **modular & data-driven** (config JSON) supaya gampang tambah lantai.
Kalau ruangan yang sekarang sudah ada tapi beda, **sesuaikan/map**, jangan dibuang.

### 👥 Karakter

**Lami (Boss), selalu ada**
- Desain ikonik & paling menonjol (mis. jas + sayap kecil ala Hermes di topi/sepatu).
- State:
  - `idle`: ngopi, lihat jendela
  - `thinking`: 💡
  - `delegating`: nunjuk, bubble "Tolong kerjain ini ya!"
  - `reviewing`: baca dokumen
  - `happy`: lompat + koin
  - `error`: 💦 panik lucu

**Sub-Agent (Karyawan), muncul dinamis**
- 1 sub-agent / delegated task = 1 karakter. Warna rambut/baju random, nama lucu auto-generate ("Budi-Research", "Sari-Coder").
- **Lifecycle:**
  1. **Spawn**: keluar dari lift, efek "✨ New Hire!"
  2. **Jalan ke ruangan** sesuai jenis kerjaan
  3. **Kerja**: animasi sesuai ruangan, bubble berisi ringkasan tool yang lagi jalan (max ~30 karakter)
  4. **Pindah ruangan** kalau jenis tool berubah
  5. **Selesai**: bawa dokumen naik lift ke Lami → koin "+1 ✅"
  6. **Gagal**: asap / 💦, jalan lesu ke Lami, bubble "Maaf boss, error…"
  7. **Despawn**: istirahat di Pantry, lalu pulang lewat lift
- Pathfinding sederhana: jalan horizontal di lantai, lift untuk naik-turun. Karakter tidak boleh tumpang tindih (pakai slot meja).

---

## 🔌 KONEKSI KE AKTIVITAS ASLI (paling penting)

Visualisasi harus **mengikuti kerjaan yang benar-benar berjalan**, bukan cuma animasi palsu.

- Kalau sumber event sekarang **sudah real-time & reliable** → pertahankan, cukup rapikan formatnya.
- Kalau belum → cari cara terbaik (log / session history di `.hermes`, hooks / plugin / callback, gateway / API). **Jelaskan pilihanmu sebelum implement.**
- Samakan format event yang dikirim lewat WebSocket ke frontend jadi seperti ini (boleh pakai adapter kalau format lama beda):

```json
{ "type": "agent_spawn",  "agentId": "a1", "parentId": "lami", "task": "Riset tren TikTok", "ts": 0 }
{ "type": "tool_start",   "agentId": "a1", "tool": "web_search", "summary": "cari 'ai office viral'" }
{ "type": "tool_end",     "agentId": "a1", "tool": "web_search", "ok": true }
{ "type": "agent_status", "agentId": "lami", "status": "thinking" }
{ "type": "agent_done",   "agentId": "a1", "ok": true, "result": "Ringkasan singkat..." }
```

- **Mapping tool → ruangan** di file config:
  - search/browse → Research Lab
  - write_file/terminal → Coding Room
  - delegate_task → Meeting Room
  - LLM call → Server Room
  - tool tidak dikenal → Coding Room
- Aktivitas Lami sendiri (tanpa sub-agent) tetap divisualkan lewat state Lami.

---

## 🎬 FITUR KHUSUS TIKTOK
- **Demo Mode** (`?demo=1`): event palsu realistis (3–6 sub-agent), buat rekam konten kapan saja.
- **Vertical Mode 9:16** (`?vertical=1`).
- **Activity Ticker** di bawah layar: log berjalan ala game ("Sari-Coder selesai edit `index.js` +1 ⭐").
- **Panel info di atas layar**: jam, task selesai hari ini, koin, jumlah karyawan aktif.
- **Klik karakter** → kartu info (nama, task, tool, durasi).
- SFX 8-bit opsional (ding lift, koin, ketik keyboard), bisa di-mute.
- 60fps. Saat idle, karyawan tetap "hidup" (ngobrol, minum kopi).

---

## 🌐 GO LIVE: CLOUDFLARE TUNNEL → `office.fatihrumi.id`

Domain `fatihrumi.id` sudah ada di akun Cloudflare saya. Arahkan subdomain **`office`** ke app di **port 8090**.

**Arsitektur:**
- **Satu port saja: `8090`.** Server menyajikan frontend (hasil build) **dan** WebSocket di path `/ws` dari port yang sama.
  Kalau sekarang frontend & WebSocket masih beda port, **gabungkan** ke 8090.
- Frontend konek ke WebSocket pakai alamat yang mengikuti origin, jangan hardcode `localhost`:
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
- **Auto-reconnect** WebSocket (exponential backoff) + heartbeat ping/pong tiap ~25 detik supaya tidak diputus Cloudflare saat idle.
- Server listen di `127.0.0.1:8090`, bukan `0.0.0.0`.

**Setup tunnel (named tunnel):**
```bash
cloudflared tunnel login
cloudflared tunnel create lami-office
cloudflared tunnel route dns lami-office office.fatihrumi.id
cloudflared tunnel run lami-office
```

Contoh `deploy/cloudflared-config.yml`:
```yaml
tunnel: lami-office
credentials-file: C:\Users\<USER>\.cloudflared\<TUNNEL_ID>.json
ingress:
  - hostname: office.fatihrumi.id
    service: http://localhost:8090
  - service: http_status:404
```

**Yang perlu disiapkan:**
- Script `deploy/start.ps1`: build frontend → jalankan server di 8090 → jalankan tunnel. Cukup 1 perintah.
- Opsi pasang `cloudflared` sebagai **Windows service** (jelaskan langkahnya, jangan eksekusi tanpa izin).
- Update `README.md` dengan panduan tunnel.

**🔒 Keamanan (wajib, karena publik):**
- **Read-only.** Tidak boleh ada endpoint untuk mengirim perintah ke Hermes dari web.
- **Sensor event** sebelum dikirim ke browser: path lengkap, isi file, API key/token, env var, email, argumen tool sensitif.
  Daftar sensor bisa diatur di config.
- Opsi **`PUBLIC_MODE=demo`**: domain publik cuma menampilkan Demo Mode, aktivitas asli hanya tampil di localhost.
- Sarankan (opsional) **Cloudflare Access** kalau aktivitas asli mau bisa dilihat dari luar tapi cuma oleh saya.

---

## 📋 CARA KERJA YANG SAYA MAU

Kerjakan **bertahap**, tunjukkan hasil tiap fase:

0. **Audit**: laporan kondisi project sekarang + tabel gap + rencana improve. **Tunggu ACC saya.**
1. **Rapikan fondasi**: gabungkan frontend + WebSocket ke port 8090, format event standar, config ruangan & mapping tool.
2. **Upgrade visual**: style Happy Mall Story (sprite chibi, palet pastel, layout gedung, Lami).
3. **Animasi & Demo Mode**: spawn, jalan, lift, kerja, lapor ke Lami.
4. **Koneksi real**: pastikan karakter benar-benar mengikuti aktivitas Hermes asli.
5. **Polish TikTok**: vertical mode, HUD, ticker, SFX, siang-malam.
6. **Go Live**: tunnel aktif, `https://office.fatihrumi.id` bisa dibuka dari HP, WebSocket stabil, sensor event jalan.

Aturan:
- **Improve, bukan rewrite.** Kalau memang ada bagian yang harus ditulis ulang, jelaskan alasannya dulu.
- Backup / commit dulu sebelum perubahan besar supaya bisa rollback.
- Port tetap **8090**.
- Jangan ubah konfigurasi inti Hermes tanpa izin saya.
- Jangan ubah setting DNS/Cloudflare lain selain subdomain `office.fatihrumi.id`.
- Jangan pernah commit/menampilkan file credentials tunnel (`*.json` di `.cloudflared`). Masukkan ke `.gitignore`.
- Kalau ada yang ambigu, tanya dulu.

Ayo mulai dari **Langkah 0: Audit**, Lami! 🚀
