# Changelog

Oldest first within each release. Versions follow `vMAJOR.MINOR.PATCH` tags.

## v2.7.1

Cleanup. No behaviour changes; e2e stayed at 378/378 throughout.

- `server.py`: 17 segment separators, so a 2,087-line file can be navigated.
  Splitting it into modules was evaluated and rejected: 11 assertions grep
  specific blocks out of that file, and moving a block makes the test assert
  against a different file, which loses coverage rather than gaining structure.
- Delete 15 dead exports left over from the isometric rewrite: `ISO_TILE_W/H`,
  `FLOOR_DY`, `ROOF_OFFSET`, `ORIGIN_X`, `NF`, `screenToIso`, the four `LIFT_*`
  constants, `PALETTE`, `getCoinSprite`, `isFloorTile`, `LO.currentOffice`.
- Keep `LO.isoToScreen`: `agents.js` calls it 5× for character positioning.

## v2.7.0

Repo restructure plus the public chat channels.

- Flatten `services/lami-office-react/*` to the repo root. With one service left,
  `services/` was a folder that meant nothing; build context is now `.`.
- Split `deploy/` by host: `agent/` (bridge, metrics, hook — runs on `.31` and
  `.91-.94`) vs `office/` (tunnel config — runs on `.33`).
- Split `scripts/`: `assets/` (generators and guards) vs `ops/` (deploy, smoke).
- Chat drawer split into `lami-saya` (DM with Lami) and `kantor` (staff feed).
  One DOM list filtered by `data-ch`, so switching channels clones nothing.
- `docker-compose.yml` forwards `CHAT_*`; without it `chat_ask_url` was empty in
  the container and `/api/chat` fell back to raw A2A, which the gateway rejects.
- Untrack `.env.development.secrets`; fix `.gitignore` rule order (the negation
  lines were being overridden, which is how the secrets file kept coming back).
- Delete `services/ai-office/` (no compose built it), `PROMPT*.md`,
  `TEST_READY.md`, `SERVICE.md` — the last described an isometric 6-floor office
  that no longer existed.
- `smoke_test.sh` rewritten for the single service, six probes, https on 443.

## v2.6.0

- Per-room door access control with server-owned locks.
- Public web chat to Lami via the `lami-ask` shim, with per-IP rate limits, a
  daily budget, and the visitor's text tagged as untrusted.
- Fall back to `SendStreamingMessage` when a task completes without text.
- Stop movement waypoint snaps from crossing walls.

## v2.5.0

- 2D animated sliding doors with server-owned state.
- Furniture aligned to walls, pod rows and seat slots.
- Server-authoritative world: one shared office simulated at 10 Hz, broadcast
  over SSE, with positions persisted across restarts.
- Responsive layout: phone pan/zoom camera, drawer-aware desktop canvas.
- A2A peer agents on the LAN shown in their specialty rooms.
- Five-tier E2E harness (later consolidated to four tiers).
