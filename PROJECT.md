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
| 18 | E2E Test Suite Pass (Tiers 1-4) | Comprehensive opaque-box test suite passing 100% of requirements. | M5 | Dual Track Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 2D World & Room Architecture | Orthogonal 2D grid engine, sealed single-floor plan, shared walls, furniture & props | None | DONE |
| M2 | 4-Directional Agents & Interaction | 4-way sprites, walking step cycles, orthogonal pathfinding, speech bubbles, character card | M1 | DONE |
| M3 | Viewport Layout & Staging Sync | Desktop responsive fit, drawer adjustment, smoke test, git push `dev`, staging sync | M2 | DONE |
| M4 | Tilemap, E2E Pass & Hardening | Committed tilemap/tileset, 100% E2E pass, adversarial hardening | M3 | DONE |
| M5 | Responsive, Decoration & A2A Peers | Phone camera mode, drawer-aware desktop canvas, floorplan decoration, A2A peer agents on the LAN | M4 | DONE |

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
- `GET /api/a2a` → `{ peers: [{ id, name, host, port, room, icon, color, online, hostname, latency_ms, error, endpoint }], online, total, can_send }`.
- `POST /api/a2a/send` `{ peer, text, intent? }` → `{ ok, status, peer, response? }`. Local/LAN only; public tunnel traffic is rejected.
- Peer roster defaults live in `DEFAULT_CONFIG["a2a_peers"]`, overridable with `A2A_PEERS` (JSON).
- `A2A_SECRET`: shared secret sent as `x-a2a-token` to each sidecar. Empty = presence only.
- `A2A_POLL_INTERVAL`: seconds between `/health` probes (default 10).

### Backend ↔ Hermes ingest
- `GET /events` (SSE): sanitized office events + snapshots.
- `POST /api/event` (JSON): ingest; allowed from localhost/LAN (`trusted_networks`) or with `X-Office-Token` matching `INGEST_TOKEN`.
- `services/lami-office-react/deploy/hermes_bridge.py`: tails Hermes `state.db` on another host and POSTs events. `--probe` prints parsed events, `--verify` checks db + endpoint + ingest auth.

### `sprites.js` ↔ `agents.js`
- `LO.getCharacterSprites(look)`: returns directional keys `S`/`N`/`E`/`W` (aliases `down/up/right/left`, `SE->S`, `SW->W`, `NE->E`, `NW->N`).

### `agents.js` ↔ `office.js`
- `Character.getDepth()`, `Character.render(ctx, scale)`, `Office.collisionGrid[y][x]` (0 = walkable, 1 = obstacle).

---

## Code & Asset Layout
- Target Repository: `/home/fatih/Vault/Ecobytes/Project/Lami/ai-office`
- Active Branch: `dev`
- Frontend Scripts: `services/lami-office-react/web/js/`
  - `config.js`: Grid constants, dimensions, building/rooms/hallway, plan helpers, projection math.
  - `sprites.js`: Pixel art sprite generation and directional step cycles.
  - `tilemap.js`: Tilemap + tileset loader and layered renderer.
  - `world.js`: scene composition — sky header, tilemap draw, carpets, furniture, ambient light, procedural fallback.
  - `agents.js`: Character base class, resident staff, Boss Lami, SubAgents, MochiCat, DeliveryRider.
  - `office.js`: Game simulation loop, collision grid, viewport scaling, click handling.
  - `ui.js`: DOM UI overlays, character cards, whiteboard modal, context modal.
- Frontend Assets: `services/lami-office-react/web/assets/`
  - `tiles/tileset.png` + `tiles/tileset.json`: 16x16 spritesheet + index.
  - `map/office.map.json`: RLE floor/walls/decor layers + meta derived from `config.js`.
- Asset Generators (stdlib Python): `scripts/generate_tileset.py`, `scripts/generate_tilemap.py` (both support `--check`).
- Smoke Tests: `scripts/smoke_test.sh`
