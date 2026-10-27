# 🏢 PROMPT UNTUK HERMES — "LAMI'S AI OFFICE"

> Copy semua isi di bawah garis ini, lalu paste ke Hermes.

---

## ROLE & GOAL

Kamu adalah Hermes, dan di project ini nama kamu **Lami** — Boss dari sebuah kantor AI.
Tugasmu: bangun **web app visualisasi "AI Office"** di folder `d:\Hermes\AI-Office`, di mana
setiap kerjaan yang kamu jalankan (task, tool call, sub-agent / `delegate_task`) muncul sebagai
**karakter chibi pixel art yang bergerak di dalam gedung kantor secara real-time**.

Tujuan akhirnya: tampilan yang lucu, hidup, dan "TikTok-able" — enak direkam layar dan bikin orang
bilang *"anjir lucu banget AI-nya kerja beneran"*.

---

## 🎨 ART STYLE — "Happy Mall Story" vibes

- **Tampilan side-view cut-away building** (gedung dipotong, kelihatan isi tiap lantai), bertingkat ke atas.
- **Chibi pixel art**: kepala besar, badan kecil, outline gelap tipis, 2–4 frame animasi jalan.
- Warna **cerah, pastel, hangat** (krem, peach, mint, baby blue, kuning lembut). Hindari warna kusam.
- Background langit dengan **siklus siang–sore–malam** mengikuti jam lokal (lampu kantor nyala saat malam).
- Elemen "game sim" khas: **speech bubble**, **emote di atas kepala** (💡❗💦💤❤️), **koin/bintang pop-up**
  saat task selesai, angka melayang (+1 Task!), sedikit bounce/squash animation.
- Font pixel (mis. "Press Start 2P" / "Pixelify Sans" dari Google Fonts) untuk UI.
- Rendering pixel harus tajam: `image-rendering: pixelated`, scale integer (2x/3x/4x).

---

## 🏗️ LAYOUT GEDUNG (dari atas ke bawah)

| Lantai | Ruangan | Fungsi |
|---|---|---|
| 🏆 Top Floor | **Ruang Boss Lami** | Lami duduk di meja besar, kursi putar, jendela kota. Tempat sub-agent lapor hasil. |
| 4F | **Research Lab** | Agent yang lagi web search / baca URL / browsing. Ada rak buku & globe. |
| 3F | **Coding Room** | Agent yang nulis/edit file, run terminal. Monitor hijau, keyboard mengetik. |
| 2F | **Meeting Room** | Saat Lami lagi planning / bagi tugas ke banyak sub-agent sekaligus (whiteboard). |
| 1F | **Pantry / Lounge** | Agent idle nongkrong, minum kopi, main HP, tidur 💤. |
| B1 | **Server Room** | Visual API call / model inference, lampu server kedip-kedip, kipas muter. |
| — | **Lift** | Jalur sub-agent masuk/keluar & pindah lantai (animasi pintu buka-tutup). |

Ruangan dibuat **modular & data-driven** (config JSON) supaya gampang tambah lantai baru nanti.

---

## 👥 KARAKTER

### Lami (Boss) — selalu ada
- Desain unik & paling menonjol: (silakan kamu desain, tapi buat ikonik — mis. jas, mahkota kecil / sayap kecil ala Hermes di sepatu atau topi).
- State: `idle` (minum kopi, lihat jendela), `thinking` (💡 berkedip), `delegating` (nunjuk, keluar bubble "Tolong kerjain ini ya!"),
  `reviewing` (baca dokumen dari sub-agent), `happy` (lompat kecil + koin keluar saat semua task selesai), `error` (💦 panik lucu).

### Sub-Agent (Karyawan) — muncul dinamis
- Setiap sub-agent / delegated task = 1 karakter baru dengan **warna rambut/baju random** + **nama lucu auto-generate** (mis. "Budi-Research", "Sari-Coder").
- **Lifecycle animasi:**
  1. **Spawn** → keluar dari lift di lantai dasar, ada efek "✨ New Hire!"
  2. **Jalan ke ruangan** sesuai jenis kerjaan (search → Research Lab, edit file → Coding Room, dst.)
  3. **Kerja** → animasi sesuai ruangan, bubble menampilkan **ringkasan tool/aksi yang sedang jalan** (dipotong max ~30 karakter)
  4. **Pindah ruangan** otomatis kalau jenis tool berubah
  5. **Selesai** → bawa map/dokumen, naik lift ke Ruang Boss, kasih ke Lami → koin pop-up "+1 ✅"
  6. **Gagal** → asap kecil / 💦, jalan lesu ke Lami, bubble "Maaf boss, error…"
  7. **Despawn** → istirahat di Pantry sebentar, lalu pulang lewat lift (atau tetap idle kalau masih dibutuhkan)
- Pathfinding sederhana: jalan horizontal di lantai + lift untuk vertikal. Karakter tidak boleh tumpang tindih total (beri slot meja).

---

## 🔌 KONEKSI KE AKTIVITAS ASLI HERMES (bagian paling penting)

Visualisasi harus **mengikuti kerjaan yang benar-benar berjalan**, bukan cuma animasi palsu.

1. **Investigasi dulu** cara terbaik menangkap aktivitasmu sendiri di setup ini. Cek opsi seperti:
   - file log / session history Hermes (mis. di folder home `.hermes`),
   - hooks / plugin / callback event yang tersedia,
   - output gateway / API kalau ada.
   Pilih yang paling reliable & real-time, lalu **jelaskan pilihanmu ke saya sebelum implement**.
2. Buat **backend bridge kecil** (Node.js atau Python) yang membaca event tersebut lalu mengirim
   ke frontend via **WebSocket** dengan format event standar, contoh:

```json
{ "type": "agent_spawn",  "agentId": "a1", "parentId": "lami", "task": "Riset tren TikTok", "ts": 0 }
{ "type": "tool_start",   "agentId": "a1", "tool": "web_search", "summary": "cari 'ai office viral'" }
{ "type": "tool_end",     "agentId": "a1", "tool": "web_search", "ok": true }
{ "type": "agent_status", "agentId": "lami", "status": "thinking" }
{ "type": "agent_done",   "agentId": "a1", "ok": true, "result": "Ringkasan singkat..." }
```

3. Buat **mapping tool → ruangan** di file config (mis. `web_search`/`browse` → Research Lab,
   `write_file`/`terminal` → Coding Room, `delegate_task` → Meeting Room, LLM call → Server Room).
   Tool yang tidak dikenal → default ke Coding Room.
4. Event dari Lami sendiri (tanpa sub-agent) tetap divisualkan lewat state Lami.

---

## 🎬 FITUR KHUSUS BUAT KONTEN TIKTOK

- **Demo Mode** (`?demo=1`): generate event palsu yang realistis (3–6 sub-agent, berbagai tool) supaya bisa rekam konten kapan saja.
- **Vertical Mode 9:16** (`?vertical=1`): layout gedung pas untuk layar HP / rekaman TikTok.
- **Activity Ticker** di bawah layar: log berjalan ala game ("Sari-Coder selesai edit `index.js` +1 ⭐").
- **HUD atas**: jam, jumlah task selesai hari ini, "koin" (total task sukses), jumlah karyawan aktif.
- **Klik karakter** → popup kartu info (nama, task, tool sekarang, durasi kerja).
- Sound effect kecil 8-bit (opsional, bisa di-mute): ding lift, koin, ketik keyboard.
- Smooth 60fps, tidak ada layar kosong — kalau idle, karyawan tetap "hidup" (ngobrol, minum kopi).

---

## 🛠️ TECH STACK & STRUKTUR

- Frontend: **Vite + Vanilla JS + PixiJS** (atau Canvas 2D murni kalau lebih simpel). CSS vanilla.
- Backend bridge: Node.js + `ws` (atau Python + `websockets`, pilih yang paling cocok dengan setup Hermes).
- Asset: buat **sprite pixel art sendiri** (spritesheet PNG atau digambar prosedural via kode).
  Jangan pakai placeholder kotak polos. Ukuran tile dasar 16×16 / 32×32, karakter ±24×32 px.
- Struktur saran:

```
AI-Office/
├─ bridge/          # pembaca event Hermes + WebSocket server
├─ web/
│  ├─ src/
│  │  ├─ engine/    # game loop, renderer, pathfinding
│  │  ├─ entities/  # Lami, SubAgent, Lift
│  │  ├─ rooms/     # definisi ruangan
│  │  ├─ ui/        # HUD, ticker, popup
│  │  └─ demo/      # generator event palsu
│  └─ assets/       # sprite, font, sfx
├─ config/          # rooms.json, tool-map.json
├─ deploy/          # config cloudflared + script start
└─ README.md        # cara jalanin
```

---

## 🌐 DEPLOY: CLOUDFLARE TUNNEL → `office.fatihrumi.id`

Kantor Lami harus bisa dibuka dari mana saja lewat **https://office.fatihrumi.id** pakai **Cloudflare Tunnel (`cloudflared`)**,
tanpa buka port di router. Domain `fatihrumi.id` sudah ada di akun Cloudflare saya.

**Arsitektur:**
- **Satu port lokal saja** (mis. `localhost:8787`): server bridge sekaligus menyajikan hasil build frontend (`web/dist`)
  **dan** WebSocket di path `/ws`. Jadi cukup satu ingress di tunnel.
- Frontend konek ke WebSocket pakai URL relatif ke origin:
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`. Jangan hardcode `localhost`.
- Tambahkan **auto-reconnect** WebSocket (exponential backoff) + heartbeat ping/pong tiap ~25 detik, supaya koneksi
  tidak diputus Cloudflare saat idle.

**Setup tunnel (named tunnel, bukan quick tunnel):**
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
    service: http://localhost:8787
  - service: http_status:404
```

**Yang harus kamu siapkan:**
- Script `deploy/start` (`.ps1` untuk Windows) yang build frontend, jalankan server, lalu jalankan tunnel. Cukup 1 perintah.
- Opsi pasang `cloudflared` sebagai **Windows service** supaya otomatis nyala saat PC boot (jelaskan langkahnya, jangan eksekusi tanpa izin).
- Panduan lengkap di `README.md` (install cloudflared, login, create tunnel, route DNS, run).

**🔒 Keamanan (wajib, karena ini publik):**
- **Mode publik = read-only.** Halaman cuma menampilkan animasi, tidak boleh ada endpoint untuk mengirim perintah ke Hermes.
- **Sanitasi event** sebelum dikirim ke browser: sembunyikan path lengkap, isi file, API key/token, env var, email,
  dan argumen tool yang sensitif. Cukup kirim nama tool + ringkasan pendek yang aman. Buat daftar sensor ini bisa diatur di config.
- Sediakan opsi **`PUBLIC_MODE=demo`**: domain publik cuma menampilkan Demo Mode (event palsu), sedangkan aktivitas asli
  hanya tampil di localhost. Aman buat dipamerin.
- Sarankan (opsional) pakai **Cloudflare Access** (Zero Trust) kalau saya mau aktivitas asli cuma bisa dilihat saya sendiri.
- Server lokal cukup listen di `127.0.0.1`, jangan `0.0.0.0`.

---

## 📋 CARA KERJA YANG SAYA MAU

Kerjakan **bertahap**, dan setiap fase selesai tunjukkan hasilnya ke saya:

1. **Fase 1 — Plan**: jelaskan cara kamu menangkap event aktivitas Hermes + rancangan arsitektur. Tunggu ACC saya.
2. **Fase 2 — Visual statis**: gedung, ruangan, Lami di ruangannya, style pixel sudah sesuai Happy Mall Story.
3. **Fase 3 — Animasi & Demo Mode**: sub-agent spawn, jalan, naik lift, kerja, lapor ke Lami.
4. **Fase 4 — Koneksi real**: bridge WebSocket tersambung ke aktivitas Hermes asli.
5. **Fase 5 — Polish TikTok**: vertical mode, HUD, ticker, SFX, siklus siang-malam.
6. **Fase 6 — Go Live**: Cloudflare Tunnel aktif, `https://office.fatihrumi.id` bisa dibuka dari HP, WebSocket stabil, sanitasi event jalan.

Aturan:
- Jangan mengubah konfigurasi inti Hermes tanpa izin saya.
- Jangan ubah setting DNS/Cloudflare lain selain subdomain `office.fatihrumi.id`.
- Jangan pernah commit/menampilkan file credentials tunnel (`*.json` di `.cloudflared`). Masukkan ke `.gitignore`.
- Sertakan `README.md` berisi cara install & run (1–2 perintah saja kalau bisa).
- Kalau ada yang ambigu, tanya dulu, jangan asumsi.

Ayo mulai dari **Fase 1**, Lami! 🚀
