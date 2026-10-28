# Project: 2D Top-Down / RPG Office Suite

## Architecture
A complete 2D Top-Down / RPG pixel art office (Pokemon / Zelda GBA / RPG Maker aesthetic) replacing the legacy 2.5D isometric stacked-floor rendering.
- **Engine Type**: Orthogonal 2D tile grid engine (16x16 pixel tiles, 64x36 grid = 1024x576 base resolution, 16:9 desktop-first aspect ratio).
- **Floorplan Layout**: Single horizontal contiguous office containing 6 themed rooms:
  1. Boss Office (`boss`)
  2. Research Lab (`research`)
  3. Server Room (`server`)
  4. Engineering Pit (`engineering`, alias `coding`)
  5. Meeting Room (`meeting`)
  6. Pantry & Lounge (`pantry`)
  All interconnected via a central hallway and navigable doorways.
- **Agent System**: 4 cardinal movement directions (South/Front, North/Back, East/Right, West/Left) with 3/4-frame step cycles, orthogonal BFS/A* pathfinding avoiding collision obstacles, and canvas-rendered speech bubbles / inspect modals.
- **Viewport & UI**: Responsive desktop scaling with side chat drawer width dynamic subtraction, avoiding letterboxing and HUD overlap.
- **Environment**: Branch `dev` on local repo `/home/fatih/Vault/Ecobytes/Project/Lami/ai-office`, remote GitHub repo `git@github.com:lamilearn/Lami-Office.git`, and live staging deployment at `http://192.168.3.33:13579`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Orthogonal Grid & Math | Replace `isoToScreen` & `screenToIso` with `tileToScreen` & `screenToTile` (16x16 tiles, 1024x576 base 16:9). | M1 | ORIGINAL_REQUEST §R1 |
| 2 | 6 Themed Office Rooms | Spacious floorplan: Boss Office, Research Lab, Engineering Pit, Meeting Room, Server Room, Pantry/Lounge. | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Top-Down Walls, Doors & Floors | Orthogonal front/side walls, doorway transitions, clean room partitions without visual skewing or overlap. | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Top-Down Office Furniture & Props | Desks, dual monitors, server racks with blinking LEDs, whiteboard, water cooler, espresso bar, sofa. | M1 | ORIGINAL_REQUEST §R1 |
| 5 | 4-Directional Cardinal Sprites | Pixel art sprites for South (front), North (back), East (right), West (left) for all agents (Lami, Residents, Hermes, Cat, Rider). | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Animated Step Cycles | 3/4-frame walking step cycle (left foot, neutral stand, right foot, neutral stand) for 2D character movement. | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Orthogonal Grid Pathfinding | Smooth BFS/A* pathfinding between desks, meeting tables, and pantry avoiding obstacle clipping. | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Speech Bubbles & Emotes | Canvas-rendered speech bubbles, status indicators, and floating particles anchored to 2D character coordinates. | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Click-to-Inspect Character Card | Click hit-testing triggering `#card` modal with agent stats, task info, and avatar preview. | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Interactive Props Modals | Click hit-testing for Context Trashcan, Multi-Mode Whiteboard, and Water Cooler in the 2D plane. | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Desktop-First Viewport & Scaling | 16:9 responsive scaling with dynamic chat drawer subtraction preventing vertical letterboxing and HUD overlap. | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Syntax & Smoke Verification | `node -c` JavaScript syntax check and 7-point smoke test execution across services. | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Git Dev Branch & Staging Sync | Push changes to branch `dev` and deploy/verify on local staging `http://192.168.3.33:13579`. | M3 | ORIGINAL_REQUEST §R3 |
| 14 | E2E Test Suite Pass (Tiers 1-4) | Comprehensive opaque-box test suite passing 100% of requirements. | M4 | Dual Track Acceptance |
| 15 | Adversarial Coverage Hardening (Tier 5) | White-box adversarial testing and edge-case validation. | M4 | Dual Track Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 2D World & Room Architecture | Orthogonal 2D grid engine, 6 themed rooms, floor tiles, walls, doors, furniture & props | None | IN_PROGRESS |
| M2 | 4-Directional Agents & Interaction | 4-way sprites, walking step cycles, orthogonal pathfinding, speech bubbles, character card | M1 | PLANNED |
| M3 | Viewport Layout & Staging Sync | Desktop responsive fit, drawer adjustment, smoke test, git push `dev`, staging sync at 13579 | M2 | PLANNED |
| M4 | Final Milestone: E2E Pass & Hardening | Pass 100% of E2E test suite (Tiers 1-4) and complete Tier 5 adversarial hardening | M3 | PLANNED |

---

## Interface Contracts

### `config.js` ↔ `world.js` / `office.js`
- `LO.TILE_SIZE = 16`
- `LO.GRID_COLS = 64`
- `LO.GRID_ROWS = 36`
- `LO.CONTENT_W = 1024`
- `LO.CONTENT_H = 576`
- `LO.tileToScreen(x, y)`: returns `{ x: number, y: number }`
- `LO.screenToTile(sx, sy)`: returns `{ tileX: number, tileY: number }`
- `LO.ROOMS`: Dictionary keyed by room ID (`boss`, `research`, `server`, `engineering`, `meeting`, `pantry`, with alias `coding`) containing bounds `{ x1, y1, x2, y2 }`, door `{ x, y }`, and colors.
- `LO.SLOTS`: Dictionary mapping room IDs to arrays of slot objects `{ x, y, type, facing }` where facing is `'S' | 'N' | 'E' | 'W'`.

### `sprites.js` ↔ `agents.js`
- `LO.getCharacterSprites(look)`: returns object with directional keys:
  - `S` (or `down`): `{ idle, walk1, walk2, sit, type }`
  - `N` (or `up`): `{ idle, walk1, walk2, sit, type }`
  - `E` (or `right`): `{ idle, walk1, walk2, sit, type }`
  - `W` (or `left`): `{ idle, walk1, walk2, sit, type }`
  - With backward-compatibility aliases: `SE -> S`, `SW -> W`, `NE -> E`, `NW -> N`.

### `agents.js` ↔ `office.js`
- `Character.getDepth()`: returns Y-coordinate depth (`this.y` or `this.row * 1000 + this.col`) for canvas sorting.
- `Character.render(ctx, scale)`: renders shadow, sprite, speech bubble, emote, and particles.
- `Office.collisionGrid[y][x]`: 2D binary grid (`0` = walkable, `1` = obstacle) used for pathfinding.

---

## Code Layout
- Target Repository: `/home/fatih/Vault/Ecobytes/Project/Lami/ai-office`
- Active Branch: `dev`
- Frontend Scripts: `services/lami-office-react/web/js/`
  - `config.js`: Grid constants, dimensions, rooms, slots, projection math.
  - `sprites.js`: Pixel art sprite generation and directional step cycles.
  - `world.js`: 2D tile map, room partitions, furniture, interactive props.
  - `agents.js`: Character base class, resident staff, Boss Lami, SubAgents, MochiCat, DeliveryRider.
  - `office.js`: Game simulation loop, viewport scaling, click input handling.
  - `ui.js`: DOM UI overlays, character cards, whiteboard modal, context modal.
- Stylesheets: `services/lami-office-react/web/css/style.css`
- Smoke Tests: `scripts/smoke_test.sh`
