# Lami AI Office Suite

Unified workspace & monorepo containing services for **AI Office** and **Lami Office**.

## Structure

```
.
├── .dockerignore
├── .gitignore
├── .env.example
├── .env.production
├── .env.development
├── docker-compose.yml
├── scripts/
│   ├── smoke_test.sh        # Probes all 7 health endpoints
│   ├── push_to_github.sh    # Push master and dev branches to GitHub
│   ├── generate_tileset.py  # Builds web/assets/tiles/tileset.png (+ --check)
│   └── generate_tilemap.py  # Builds web/assets/map/office.map.json from config.js (+ --check)
└── services/
    ├── ai-office/           # Python FastAPI app running on port 8088 (office.fatihrumi.id)
    └── lami-office-react/   # Interactive office app running on port 8090 (office.fatihrumi.id)
```

## Floorplan & Assets

The office is one **single enclosed floor** (architect-plan style): six themed
rooms sealed by shared partition walls around a central hallway, each pierced by
a 2-tile doorway. It renders from a committed tilemap + tileset:

- `services/lami-office-react/web/assets/tiles/tileset.png` + `tileset.json`
- `services/lami-office-react/web/assets/map/office.map.json`

Both are generated from `web/js/config.js` (the single source of truth) and
committed. Regenerate or verify them with:

```bash
npm run assets          # rebuild tileset.png + office.map.json
npm run assets:check    # fail if committed assets drift from config.js
```

The renderer (`web/js/tilemap.js`) falls back to the procedural floorplan in
`web/js/world.js` if the assets cannot be fetched.

## Branching Strategy

- **`master`**: Production release and stable baseline branch.
- **`dev`**: Active development branch. All feature work and staging tests happen here.

## Environment Profiles

- **Production (`.env.production`)**:
  - Ports: 8088 (`ai-office`), 8090 (`lami-office-react`)
  - Project name: `office-prod`
  - Mode: `live`
- **Development / Staging (`.env.development`)**:
  - Ports: 18088 (`ai-office`), 13579 (`lami-office-react`)
  - Project name: `office-dev`
  - Mode: `demo`

## Getting Started

To run services with Docker Compose:

```bash
# Production environment (standard ports 8088/8090)
docker compose --env-file .env.production up -d --build

# Development environment (isolated ports 18088/13579)
docker compose --env-file .env.development up -d --build
```

## A2A Peer Agents (LAN)

Four Hermes **A2A sidecars** are shown in their specialty rooms:

| Agent | Host | Room |
|---|---|---|
| Yuna 🔬 | `192.168.3.91:8000` | Research Lab |
| Aurora 📐 | `192.168.3.92:8000` | Meeting Room |
| Kira ⚙️ | `192.168.3.93:8000` | Engineering Pit |
| Cyro 🛰️ | `192.168.3.94:8000` | Server Room |

Presence comes from each sidecar's `GET /health` (polled every `A2A_POLL_INTERVAL`
seconds); the office sidebar chip `🔗` opens a panel with status, latency and a
message box.

Sending messages needs the shared secret the sidecars expect in `x-a2a-token`:

```bash
# .env.development / .env.production
A2A_SECRET=<shared-secret>
```

Leave it empty to keep presence-only mode. Endpoints:

```bash
curl -s http://127.0.0.1:13579/api/a2a | jq      # roster + presence + can_send
curl -s -X POST http://127.0.0.1:13579/api/a2a/send \
  -H 'Content-Type: application/json' \
  -d '{"peer":"yuna","text":"Status riset hari ini?"}' | jq
```

`POST /api/a2a/send` is accepted only from localhost/trusted LAN hosts and is
always rejected for traffic arriving through the Cloudflare tunnel.

Check the Hermes bridge wiring on the agent host:

```bash
python3 deploy/hermes_bridge.py --endpoint http://192.168.3.33:13579 --verify
```

## Responsive Layout

- **Desktop / tablet**: the whole floorplan is fit to the viewport. Opening the
  chat drawer shrinks the canvas so the office re-centers beside it.
- **Phones** (`(pointer: coarse)` or viewport `< 900px`): a pan/zoom camera fills
  the screen width, auto-focuses the active agent, and supports drag-to-pan,
  pinch-zoom and double-tap-to-reset. On-screen buttons: `⤢` fit, `👑` focus boss,
  `＋ / －` zoom. Safe-area insets keep the HUD and panels clear of notches.

## Smoke Testing

To verify service health across all 7 endpoints:

```bash
# Test local instance
./scripts/smoke_test.sh 127.0.0.1 8088 8090

# Test remote host
./scripts/smoke_test.sh 192.168.3.33 8088 8090
```

## Automated Tests

```bash
npm test              # full E2E suite (Tiers 1–4)
npm run assets:check  # verify committed tileset/tilemap match config.js
```

## Hermes Integration (Cross-Host)

The container can watch a Hermes home only when that home is on the same host
(`/home/rumi/.hermes` mounted read-only). When Hermes runs on another machine
(e.g. `192.168.3.31`), run the bundled bridge **on the Hermes host**:

```bash
# 1. On the office host: pick a shared secret and start the stack
export INGEST_TOKEN="$(openssl rand -hex 16)"
docker compose --env-file .env.development up -d --build

# 2. On the Hermes host (stdlib only, no install):
python3 deploy/hermes_bridge.py \
  --endpoint http://192.168.3.33:13579 \
  --token "$INGEST_TOKEN" \
  --boss-session <main-session-id>
```

What the bridge does: tails `~/.hermes/state.db` read-only, turns tool calls
into `tool_start` / `tool_end` / `agent_spawn` / `message` / `agent_done`
events and POSTs them to `/api/event` with `X-Office-Token`.

Useful flags: `--probe` (show parsed events, send nothing), `--once`,
`--include-cron`, `--dry-run`, `--poll 1.0`, `--timeout 90`.

Check wiring at any time:

```bash
curl -s http://127.0.0.1:13579/api/integration | jq
```

`watcher.stale: true` means the mounted Hermes home has no fresh activity and
the cross-host bridge (or `POST /api/event`) is the active path.

To keep the bridge running on the Hermes host, copy
`services/lami-office-react/deploy/hermes-bridge.service` to
`~/.config/systemd/user/hermes-bridge.service`, adjust the paths/token, then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now hermes-bridge
```
