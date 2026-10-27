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
│   └── push_to_github.sh    # Push master and dev branches to GitHub
└── services/
    ├── ai-office/           # Python FastAPI app running on port 8088 (office.fatihrumi.id)
    └── lami-office-react/   # Interactive office app running on port 8090 (lami.fatihrumi.id)
```

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

## Smoke Testing

To verify service health across all 7 endpoints:

```bash
# Test local instance
./scripts/smoke_test.sh 127.0.0.1 8088 8090

# Test remote host
./scripts/smoke_test.sh 192.168.3.33 8088 8090
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
