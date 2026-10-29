# Project: 2D Top-Down / RPG Office Suite

## Architecture
A complete 2D Top-Down / RPG pixel art office (Pokemon / Zelda GBA / RPG Maker aesthetic) replacing the legacy 2.5D isometric stacked-floor rendering.
- **Engine Type**: Orthogonal 2D tile grid engine (16x16 pixel tiles, 88x50 grid = 1408x800 base resolution).
- **Floorplan Layout**: A single enclosed floor (architect-plan style): 6 themed rooms sealed by shared partition walls and a central hallway, each room pierced by a 2-tile doorway. Rooms never float apart with open gaps.
  1. Boss Office (`boss`)
  2. Research Lab (`research`)
  3. Server Room (`server`)
  4. Engineering Pit (`engineering`, alias `coding`)
  5. Meeting Room (`meeting`)
  6. Pantry & Lounge (`pantry`)
  Top row (boss | research | server) and bottom row (engineering | meeting | pantry), split by one central hallway band with a west entrance lobby.
- **Wall/Floor Rendering**: A committed tilemap (`assets/map/office.map.json`) + tileset spritesheet (`assets/tiles/tileset.png`) rendered by `js/tilemap.js`, generated from `config.js` by `scripts/generate_tilemap.py` / `scripts/generate_tileset.py`. Wall faces are extruded; wall tops & doorway frames are drawn after characters so rooms read as enclosed boxes while collision stays 1 tile.
- **Agent System**: 4 cardinal movement directions (South/Front, North/Back, East/Right, West/Left) with 3/4-frame step cycles, orthogonal A* pathfinding avoiding collision obstacles, and canvas-rendered speech bubbles / inspect modals.
- **Viewport & UI**: Responsive desktop scaling with side chat drawer width dynamic subtraction, avoiding HUD overlap.
- **Simulasi Terpusat (server-authoritative)**: The office is ONE shared world simulated by `services/lami-office-react/world.py` inside `server.py`, not by each browser tab. The simulation thread (`sim_loop`) ticks at 10 Hz, broadcasts a `world` frame over SSE at ~5 Hz (only when something changed, plus a 5 s idle refresh), and the browser only renders and interpolates those frames. Consequences: every visitor sees the same characters in the same places, the office keeps living while nobody is watching, and a browser refresh no longer resets anyone to their desk because positions live in the server state file.
- **Environment**: Branch `dev` on local repo `/home/fatih/Vault/Ecobytes/Project/Lami/ai-office`, remote GitHub repo `git@github.com:lamilearn/Lami-Office.git`, and live staging deployment at `http://192.168.3.33:13579`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Orthogonal Grid & Math | `tileToScreen` & `screenToTile` (16x16 tiles, 1408x800 base). | M1 | ORIGINAL_REQUEST §R1 |
| 2 | 6 Themed Office Rooms | Single-floor plan: Boss Office, Research Lab, Engineering Pit, Meeting Room, Server Room, Pantry/Lounge. | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Shared-Wall Partitions, Doors & Floors | Rooms sealed by 1-2 tile shared partition walls and a central hallway; 2-tile doorways only openings. | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Office Furniture & Props | Desks, dual monitors, server racks with blinking LEDs, whiteboard, water cooler, espresso bar, sofa. | M1 | ORIGINAL_REQUEST §R1 |
| 5 | 4-Directional Cardinal Sprites | Pixel art sprites for South, North, East, West for all agents. | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Animated Step Cycles | 3/4-frame walking step cycle for 2D character movement. | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Orthogonal Grid Pathfinding | BFS/A* pathfinding between desks, meeting tables, pantry avoiding obstacles. | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Speech Bubbles & Emotes | Canvas-rendered speech bubbles, status indicators, floating particles. | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Click-to-Inspect Character Card | Click hit-testing triggering `#card` modal with agent stats. | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Interactive Props Modals | Click hit-testing for Context Trashcan, Multi-Mode Whiteboard, Water Cooler. | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Desktop-First Viewport & Scaling | Responsive scaling with dynamic chat drawer subtraction. | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Syntax & Smoke Verification | `node -c` JavaScript syntax check and 7-point smoke test. | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Git Dev Branch & Staging Sync | Push changes to branch `dev` and deploy/verify on staging. | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Tilemap Floorplan & Collision Consistency | Committed tilemap JSON + tileset PNG stay in lock-step with config collision. | M4 | Dual Track Acceptance |
| 15 | Responsive Layout & Phone Camera | Desktop fits the whole plan; phones get a pan/zoom camera (fill-width, auto-focus, drag/pinch/double-tap) and desktop canvas shrinks beside the chat drawer. | M5 | ORIGINAL_REQUEST §Responsive |
| 16 | Floorplan Decoration | Windows, sconces, plants, vents, rugs, wall clocks, posters, bins and entrance awning placed by the tilemap generator. | M5 | ORIGINAL_REQUEST §Decor |
| 17 | A2A Peer Agents | Four Hermes A2A sidecars on the LAN (192.168.3.91–94) shown in their specialty rooms with live presence and optional message sending. | M5 | ORIGINAL_REQUEST §A2A |
| 18 | Live State Persistence | Agents keep their identity/position across reloads; office state survives server restarts via a persisted JSON feed. | M6 | ORIGINAL_REQUEST §Realtime |
| 19 | E2E Test Suite Pass (Tiers 1-4) | Comprehensive opaque-box test suite passing 100% of requirements. | M6 | Dual Track Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 2D World & Room Architecture | Orthogonal 2D grid engine, sealed single-floor plan, shared walls, furniture & props | None | DONE |
| M2 | 4-Directional Agents & Interaction | 4-way sprites, walking step cycles, orthogonal pathfinding, speech bubbles, character card | M1 | DONE |
| M3 | Viewport Layout & Staging Sync | Desktop responsive fit, drawer adjustment, smoke test, git push `dev`, staging sync | M2 | DONE |
| M4 | Tilemap, E2E Pass & Hardening | Committed tilemap/tileset, 100% E2E pass, adversarial hardening | M3 | DONE |
| M5 | Responsive, Decoration & A2A Peers | Phone camera mode, drawer-aware desktop canvas, floorplan decoration, A2A peer agents on the LAN | M4 | DONE |
| M6 | Live State Persistence | Deterministic agent identity, in-place snapshot restore, persisted Hub state across restarts | M5 | DONE |

---

## Interface Contracts

### `config.js` ↔ `world.js` / `office.js`
- `LO.TILE_SIZE = 16`
- `LO.GRID_COLS = 88`
- `LO.GRID_ROWS = 50`
- `LO.CONTENT_W = 1408`
- `LO.CONTENT_H = 800`
- `LO.tileToScreen(x, y)`: returns `{ x: number, y: number }`
- `LO.screenToTile(sx, sy)`: returns `{ tileX: number, tileY: number }`
- `LO.BUILDING = { x1, y1, x2, y2 }`: perimeter envelope of the single floor.
- `LO.ROOMS`: Dictionary keyed by room ID (`boss`, `research`, `server`, `engineering`, `meeting`, `pantry`, alias `coding`) with walkable interior `bounds { x1, y1, x2, y2 }`, `door { x, y, side }` (side `'S'`/`'N'`), and colors.
- `LO.HALLWAY.bounds` / `LO.HALLWAY_BANDS`: central hallway band + entrance stub.
- `LO.SLOTS`: Dictionary mapping room IDs to arrays of `{ x, y, type, facing }`; facing is `'S' | 'N' | 'E' | 'W'`.
- `LO.doorways()`: `[{ room, x, y, width: 2, side, tiles: [{x,y},{x,y}] }]`.
- `LO.roomAt(col, row)` / `LO.hallwayAt(col, row)` / `LO.isFloorTile(col, row)` / `LO.roomInterior(id)`: floorplan queries shared by collision, tilemap generator and tests.

### `tilemap.js` ↔ `world.js` / `office.js`
- `LO.Tilemap.load({ tileset, map, image })`: Promise; fetches tileset index + map + spritesheet, then bakes the static layers into offscreen canvases.
- `LO.Tilemap.isReady()` / `map`: load state and decoded map.
- `LO.Tilemap.drawGround(ctx)`: floors + set-back wall faces (below characters) — single blit once baked.
- `LO.Tilemap.drawWallOverlay(ctx)`: wall tops, doorway frames & decor (above characters) — single blit once baked.
- `LO.World.renderOverlay(ctx)`: called by `office.js` after characters to paint the wall overlay.

### `config.js` ↔ responsive layout (Feature 15)
- `LO.BREAKPOINTS = { phoneMaxWidth: 900, compactMaxWidth: 768 }`
- `LO.isPhoneMode(env?)`: `true` when the pointer is coarse or the viewport is narrower than `phoneMaxWidth`.
- `LO.computeViewParams({ width, height, contentW, contentH, drawerInset, cameraMode, zoom, focusX, focusY })` → `{ zoom, offsetX, offsetY, availW, availH, cameraMode }` (CSS px; `focusX/focusY` in tiles).
- `LO.classifyPointerGesture(start, end, elapsedMs)` → `'tap' | 'drag' | 'longpress' | 'cancel'`.
- `LO.PHONE_ZOOM_MIN / PHONE_ZOOM_MAX / CAMERA_LERP / CAMERA_DEADZONE`.
- `Office.computeView(w?, h?)`, `Office.screenToWorld(clientX, clientY)`, `Office.worldToScreen(x, y)`.
- `Office.setDrawerOpen(open, widthPx)`: desktop insets the canvas by the drawer width; phones keep it as an overlay.
- `Office.focusAgent(agentOrId)` / `Office.focusBoss()` / `Office.resetCamera()` / `Office.setCameraZoom(z)`.
- `Office.isPhoneMode()`: `true` for `?vertical=1` or `LO.isPhoneMode()`.

### `server.py` ↔ A2A peers (Feature 17)
- `GET /api/a2a` → `{ peers: [{ id, name, host, port, room, icon, color, online, hostname, latency_ms, error, endpoint, protocol, skills, card_url }], online, total, can_send }`.
- `POST /api/a2a/send` `{ peer, text, intent? }` → `{ ok, status, peer, response? }`. Local/LAN only; public tunnel traffic is rejected.
- Peer roster defaults live in `DEFAULT_CONFIG["a2a_peers"]`, overridable with `A2A_PEERS` (JSON).
- `A2A_SECRET`: shared secret sent as `x-a2a-token` to legacy sidecars. Empty = presence only.
- `A2A_PEER_TOKENS`: per-peer credentials (`id:token,…` or JSON). Used as `Authorization: Bearer` for official A2A peers.
- `A2A_REPLY_TIMEOUT`: seconds to await an official A2A task reply (default 120).
- Dialects: `protocol` per peer is `a2a` | `custom` | `auto` (default). `auto` probes `/.well-known/agent-card.json` first, then `/health`. Official sends use JSON-RPC `SendMessage`; the task state and artifact text come back as `state`/`reply`.
- `A2A_POLL_INTERVAL`: seconds between `/health` probes (default 10).

### Backend ↔ Hermes ingest
- `GET /events` (SSE): sanitized office events + snapshots. A snapshot carries
  `agents` (current work), `stats` and `history` (recent feed) so a new or
  reconnected page renders the live floor instead of an empty room.
- `Hub._load_state()` / `Hub._save_state()`: persist `{day, stats, events_total, history}`
  to `OFFICE_STATE_FILE` (default `/data/office-state.json`) and replay the feed
  on boot. Replay includes `agent_done` so finished agents are not resurrected.
- Frontend identity helpers: `LO.hashString`, `LO.nameForAgent(id, provided)`,
  `LO.lookForAgent(id)`, `LO.slotIndexForAgent(id, slotCount)` — deterministic,
  so reloading never renames or reskins an agent.
- `POST /api/event` (JSON): ingest; allowed from localhost/LAN (`trusted_networks`) or with `X-Office-Token` matching `INGEST_TOKEN`.
- `services/lami-office-react/deploy/hermes_bridge.py`: tails Hermes `state.db` on another host and POSTs events. `--probe` prints parsed events, `--verify` checks db + endpoint + ingest auth.

### `sprites.js` ↔ `agents.js`
- `LO.getCharacterSprites(look)`: returns directional keys `S`/`N`/`E`/`W` (aliases `down/up/right/left`, `SE->S`, `SW->W`, `NE->E`, `NW->N`).

### `agents.js` ↔ `office.js`
- `Character.getDepth()`, `Character.render(ctx, scale)`, `Office.collisionGrid[y][x]` (0 = walkable, 1 = obstacle).

---

## Interface Contracts

### Dashboard Hermes (aturan kejujuran)
Kantor adalah representasi visual aktivitas Hermes, bukan simulasi fiksi.

- **Roster milik server.** Agen yang tampil = `HUB.agents` (dari ingest Hermes) + peer A2A yang
  `online`. Klien **tidak** lagi membuat agen dari event/snapshot di mode live; server
  merekonsiliasi roster tiap tick (`Sim.sync_roster`), sehingga idempoten (event ganda tidak
  membuat dua tubuh, event yang hilang tetap dikoreksi).
- **Tidak ada narasi karangan.** Staf latar boleh bergerak, tapi tidak memancarkan chat/bubble
  karangan; event acak (martabak, listrik kedip, kopi, printer) **mati secara default**
  (`OFFICE_RANDOM_EVENTS` untuk menyalakan). Hanya aktivitas yang berasal dari Hermes yang
  menjadi `message`/`ticker`.
- **Status jujur.** `world.status` = `live` (event < 120 s), `slow` (< 300 s), atau `idle`.
  HUD menampilkan ini, jadi kantor tidak pernah mengaku LIVE saat Hermes diam.
- `GET /api/roster` memaparkan roster + status yang sama dengan frame (untuk monitoring).

### Simulasi terpusat (server-authoritative world)
| Endpoint / frame | Shape | Notes |
|---|---|---|
| `GET /api/world` | `{t, seq, chars[], cat, rider?, flags, roster, status}` | Full snapshot for a fresh page or a reconnect. Public, read-only, like `/api/agents`. |
| `GET /api/roster` | `{roster, status, generated_at}` | Real agent roster (HUB + A2A) and honest status. |
| SSE `world` | `{type:"world", t, seq, chars[], cat, rider?}` | Broadcast ~5 Hz to every `/events` subscriber. Stream-only: never stored in `history`, never counted in `events_total`. |
| `char` | `{id, col, row, facing, state, frame, bubble, emote, carry, slot?, path?, goal?, kind?, name?, role?, task?, routineState?, tool?, summary?}` | `col`/`row` are sub-tile floats rounded to 2 decimals. `kind` is `lami`, `resident`, `sub`, or `rider`. |
| SSE `ticker` | `{type:"ticker", icon, text}` | Narrated by the server (spawn, tool start, completion). |
| SSE `event_banner` | `{type:"event_banner", icon, title, desc}` | Random office events (martabak, power flicker, coffee, printer jam). |

Rules:
- The browser must NOT simulate characters while `office.simulatedExternally` is true; it calls `applyWorld(frame)` and eases toward the target (`applyWorldTargets`).
- Local simulation is the fallback only: `?demo=1`, or an unavailable/failed SSE stream. Demo mode sets `simulatedExternally = false`.
- Narration (`message`, `ticker`, `event_banner`) is authored once by the server, so the client prints it verbatim instead of also reacting to it.
- `world.py` mirrors the floorplan from `web/js/config.js`; `scripts/check_world_sync.py` fails the suite when they drift, and `tests/e2e/tier1_world_authority.test.js` asserts the collision grid and A* routes stay equivalent.
- Positions are persisted in `OFFICE_STATE_FILE` under the `world` key every ~5 s; on boot `Sim.restore()` resumes the exact walk (remaining `path` included). Entries older than the staleness window or standing on a now-solid tile fall back safely.

## Deployment (production)

Production is a **pure mirror of `master`**; nobody merges or edits code there.

| Step | Command |
|---|---|
| 1. Gate | staging verified (suite + smoke) |
| 2. Release | `git checkout master && git merge --no-ff dev && git tag -a vX.Y.Z && git push origin master vX.Y.Z` |
| 3. Deploy | `bash scripts/deploy_prod.sh` (fast-forwards `origin/master`, refuses a dirty checkout, rebuilds, waits for `/healthz`) |

Server-side layout on `rumi@192.168.3.33:/home/rumi/projects/office-suite`:

- **Tracked and identical to `master`**: everything, including `.env.production` (with the A2A
  secrets left empty).
- **Untracked, never committed** (listed in `.git/info/exclude`):
  - `.env.production.secrets` — real `A2A_SECRET` / `A2A_PEER_TOKENS`
  - `docker-compose.override.yml` — `container_name: lami-office-prod`
  - `.env.production.runtime`, `*.bak-*` — local leftovers

Compose is always invoked with both env files:
`docker compose --env-file .env.production --env-file .env.production.secrets up -d --build`.

Staging follows the same pattern with `.env.development` + `.env.development.secrets`, deployed by
`bash scripts/deploy_staging.sh` (fast-forward of `dev`, refuses drift, then asserts
`/api/a2a` reports `can_send: true`).

### A2A credentials
| Peer | Auth | Where it lives |
|---|---|---|
| `lami` (`.31:9900`, official A2A) | `Authorization: Bearer <A2A_BEARER_TOKEN>` | `~/.hermes/.env` on `.31`; mirrored into `A2A_PEER_TOKENS` |
| `yuna`/`aurora`/`kira`/`cyro` (`.91–.94:8000`) | `x-a2a-token: <mesh secret>` | `SECRET` in `~/a2a-mesh/a2a_daemon.py` |

`A2A_SECRET` is the shared mesh secret and `A2A_PEER_TOKENS` maps peer ids to their own token
(JSON object or `id:token,...`); a per-peer token wins, the shared secret is the fallback. Without
either, `/api/a2a` reports `can_send: false` and `/api/a2a/send` returns 503 — the peers still show
as online because presence probing does not need a token.

`scripts/push_to_github.sh` no longer pushes `master` unless `ALLOW_MASTER_PUSH=1`, so the
staging gate cannot be bypassed by accident.

### Cache-busting
`index.html` references every css/js with a content hash (`?v=<sha8>`), and the spritesheet is
requested with a version derived from `tileset.json`. The server sends `no-cache` without an
ETag and the CDN rewrites that to a long TTL, so without the hashes a deploy could pair a new
index with a stale spritesheet (which is what once made every wall disappear).
Run `npm run assets:stamp` after editing any `web/js`/`web/css` file; `npm run assets:check`
fails when a hash is stale.

## Code & Asset Layout
- Target Repository: `/home/fatih/Vault/Ecobytes/Project/Lami/ai-office`
- Active Branch: `dev`
- Frontend Scripts: `services/lami-office-react/web/js/`
  - `config.js`: Grid constants, dimensions, building/rooms/hallway, plan helpers, projection math.
  - `sprites.js`: Pixel art sprite generation and directional step cycles.
  - `tilemap.js`: Tilemap + tileset loader and layered renderer.
  - `world.js`: scene composition — sky header, tilemap draw, carpets, furniture, ambient light, procedural fallback.
  - `agents.js`: Character base class, resident staff, Boss Lami, SubAgents, MochiCat, DeliveryRider.
  - `office.js`: Render loop, collision grid, viewport scaling, click handling, `applyWorld()` interpolation (live mode).
  - `ui.js`: DOM UI overlays, character cards, whiteboard modal, context modal.
- Frontend Assets: `services/lami-office-react/web/assets/`
  - `tiles/tileset.png` + `tiles/tileset.json`: 16x16 spritesheet + index.
  - `map/office.map.json`: RLE floor/walls/decor layers + meta derived from `config.js`.
- Server Simulation: `services/lami-office-react/world.py` (stdlib only) — floorplan data, A*, collision grid, character kinematics, staff/boss routines, sub-agents, Mochi, delivery rider, socials, random events. Parity guard: `scripts/check_world_sync.py`.
- Per-room wall palette: each room's `wall`/`wallDark` in `config.js` is baked into its own tileset variants (`wall_face_<room>`, `wall_top_<room>`, `wall_side_l_<room>`, `wall_side_r_<room>`, `window_<room>`). `generate_tilemap.py` tags every wall and window with its room id, and `web/js/tilemap.js` resolves the matching variant, so every room is visually distinct. The shared building perimeter keeps the neutral `wall_face`/`wall_top`.
- Asset Generators (stdlib Python): `scripts/generate_tileset.py`, `scripts/generate_tilemap.py` (both support `--check`).
- Smoke Tests: `scripts/smoke_test.sh`
