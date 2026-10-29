#!/usr/bin/env python3
"""Generate the office floorplan tilemap from web/js/config.js (single source of truth).

Reads LO.ROOMS / LO.HALLWAY / LO.doorways() straight out of config.js by running it
under Node, then writes a tilemap JSON with three layers:

  floor  - per-tile floor tileset name
  walls  - wall / partition / corner / doorway tiles
  decor  - sconces, windows, door thresholds, plaques

Only walkable tiles carry a floor tile; walls become solid and hide the floor.

Usage:
  python3 scripts/generate_tilemap.py           # write office.map.json
  python3 scripts/generate_tilemap.py --check   # fail if the committed map is stale
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "services" / "lami-office-react" / "web"
MAP_PATH = WEB / "assets" / "map" / "office.map.json"

ROOM_IDS = ["boss", "research", "server", "engineering", "meeting", "pantry"]

DUMP_SCRIPT = r"""
global.window = { location: { search: '' } };
require({config});
const LO = window.LO;
const rooms = {};
for (const id of {ids}) {
  const r = LO.ROOMS[id];
  rooms[id] = { bounds: [r.bounds.x1, r.bounds.y1, r.bounds.x2, r.bounds.y2], door: [r.door.x, r.door.y, r.door.side], floor1: r.floor1, floor2: r.floor2, wall: r.wall, wallDark: r.wallDark };
}
// Per-tile plan grid derived from the SAME predicates the runtime uses, so the
// committed map cannot drift from config.js collision. Chars: room initial,
// 'H' hallway, 'D' doorway, '.' none.
const LETTER = { boss: 'B', research: 'R', server: 'S', engineering: 'E', meeting: 'M', pantry: 'P' };
const doors = LO.doorways();
const doorSet = new Set();
for (const d of doors) for (const t of d.tiles) doorSet.add(t.x + ',' + t.y);
const plan = [];
for (let y = 0; y < LO.GRID_ROWS; y++) {
  let s = '';
  for (let x = 0; x < LO.GRID_COLS; x++) {
    const r = LO.roomAt(x, y);
    if (r) s += LETTER[r];
    else if (LO.hallwayAt(x, y)) s += 'H';
    else if (doorSet.has(x + ',' + y)) s += 'D';
    else s += '.';
  }
  plan.push(s);
}
process.stdout.write(JSON.stringify({
  cols: LO.GRID_COLS,
  rows: LO.GRID_ROWS,
  tileSize: LO.TILE_SIZE,
  building: LO.BUILDING,
  hallways: LO.HALLWAY_BANDS,
  entrance: LO.ENTRANCE,
  rooms,
  doors,
  plan
}));
"""


def load_config() -> dict:
    node = shutil.which("node")
    if not node:
        raise SystemExit("error: node is required to read config.js")
    config_js = WEB / "js" / "config.js"
    script = DUMP_SCRIPT.replace("{config}", json.dumps(str(config_js))).replace(
        "{ids}", json.dumps(ROOM_IDS)
    )
    out = subprocess.run([node, "-e", script], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def rle(rows):
    """Run-length encode a list of lists of strings -> [[value, run], ...]."""
    data = []
    for row in rows:
        for value in row:
            if data and data[-1][0] == value:
                data[-1][1] += 1
            else:
                data.append([value, 1])
    return data


def build_map(cfg: dict) -> dict:
    cols, rows = cfg["cols"], cfg["rows"]
    building = cfg["building"]
    rooms = cfg["rooms"]
    doors = cfg["doors"]
    plan = cfg["plan"]

    letter_to_room = {"B": "boss", "R": "research", "S": "server",
                      "E": "engineering", "M": "meeting", "P": "pantry"}

    door_tiles = {}
    for d in doors:
        for idx, t in enumerate(d["tiles"]):
            door_tiles[(t["x"], t["y"])] = (d["room"], idx, len(d["tiles"]))

    # ---- floors: driven directly by the config plan grid (no re-derivation) ----
    floor = [["floor_outside"] * cols for _ in range(rows)]
    for y in range(rows):
        row = plan[y]
        for x in range(cols):
            ch = row[x]
            on = (x + y) % 2 == 0
            suffix = "a" if on else "b"
            if ch in letter_to_room:
                floor[y][x] = f"floor_{letter_to_room[ch]}_{suffix}"
            elif ch in ("H", "D"):
                floor[y][x] = f"floor_hall_{suffix}"

    walls = [[None] * cols for _ in range(rows)]
    decor = [[None] * cols for _ in range(rows)]
    # Which room each wall tile belongs to. Every room has its own wall palette
    # in config.js; without this tag the whole building rendered in one colour.
    wall_room = [[None] * cols for _ in range(rows)]

    # ---- rooms: perimeter wall ring (one tile outside the walkable interior)
    for rid in ROOM_IDS:
        x1, y1, x2, y2 = rooms[rid]["bounds"]
        for x in range(x1 - 1, x2 + 2):
            _wall(walls, x, y1 - 1, rid, wall_room)
            _wall(walls, x, y2 + 1, rid, wall_room)
        for y in range(y1 - 1, y2 + 2):
            _wall(walls, x1 - 1, y, rid, wall_room)
            _wall(walls, x2 + 1, y, rid, wall_room)

    # ---- hallways: walkable tiles have no wall
    walkable = set()
    for band in cfg["hallways"]:
        for y in range(band["y1"], band["y2"] + 1):
            for x in range(band["x1"], band["x2"] + 1):
                walls[y][x] = None
                walkable.add((x, y))

    # ---- lobby patch (entrance mat)
    ent = cfg["entrance"]
    for y in range(ent["y"] - 1, ent["y"] + 2):
        for x in range(ent["x"], ent["x"] + 3):
            if 0 <= x < cols and 0 <= y < rows and walls[y][x] is None:
                floor[y][x] = "floor_lobby"
    if 0 <= ent["y"] < rows and 0 <= ent["x"] < cols:
        decor[ent["y"]][ent["x"]] = "lobby_mat"

    # ---- perimeter envelope closes the whole building except the street entrance
    for x in range(building["x1"], building["x2"] + 1):
        _wall(walls, x, building["y1"])
        _wall(walls, x, building["y2"])
    for y in range(building["y1"], building["y2"] + 1):
        _wall(walls, building["x1"], y)
        _wall(walls, building["x2"], y)
    # keep the already-open hallway cells open
    for (x, y) in walkable:
        walls[y][x] = None

    # ---- doorways punch through the wall ring
    for (x, y), (rid, idx, total) in door_tiles.items():
        if not (0 <= x < cols and 0 <= y < rows):
            continue
        walls[y][x] = "door_mid"
        floor[y][x] = "floor_hall_a" if (x + y) % 2 == 0 else "floor_hall_b"
        if idx == 0:
            decor[y][x] = "door_left"
        elif idx == total - 1:
            decor[y][x] = "door_right"
        else:
            decor[y][x] = "door_mid"

    # ---- wall variants (top caps, sides, corners, partition columns)
    for y in range(rows):
        for x in range(cols):
            if walls[y][x] is None or walls[y][x] == "door_mid":
                continue
            variant = _wall_variant(walls, x, y, cols, rows)
            rid = wall_room[y][x]
            # Room walls use the per-room palette; the shared perimeter keeps the
            # neutral base variant.
            walls[y][x] = f"{variant}_{rid}" if rid and variant != "wall_partition" else variant

    # ---- facade details: windows on every exterior wall the room faces
    for rid in ROOM_IDS:
        x1, y1, x2, y2 = rooms[rid]["bounds"]
        span = x2 - x1
        side = y2 - y1
        # North wall (rooms on the top row face the street)
        if y1 - 1 == building["y1"]:
            ny = y1 - 1
            for wx in (x1 + span // 4, x1 + (3 * span) // 4):
                _decor_on_wall(decor, walls, wx, ny, f"window_{rid}", cols, rows)
        # South wall (rooms on the bottom row face the garden)
        if y2 + 1 == building["y2"]:
            sy = y2 + 1
            for wx in (x1 + span // 4, x1 + (3 * span) // 4):
                _decor_on_wall(decor, walls, wx, sy, f"window_{rid}", cols, rows)
        # West / east exterior walls
        if x1 - 1 == building["x1"]:
            for wy in (y1 + side // 3, y1 + (2 * side) // 3):
                _decor_on_wall(decor, walls, x1 - 1, wy, f"window_{rid}", cols, rows)
        if x2 + 1 == building["x2"]:
            for wy in (y1 + side // 3, y1 + (2 * side) // 3):
                _decor_on_wall(decor, walls, x2 + 1, wy, f"window_{rid}", cols, rows)

    # ---- corner plants inside each room (never on furniture or a doorway)
    blocked = set()
    for rid in ROOM_IDS:
        x1, y1, x2, y2 = rooms[rid]["bounds"]
        for cx, cy in ((x1 + 1, y1 + 1), (x2 - 1, y1 + 1), (x1 + 1, y2 - 1), (x2 - 1, y2 - 1)):
            key = (cx, cy)
            if key in blocked:
                continue
            if 0 <= cx < cols and 0 <= cy < rows and walls[cy][cx] is None and decor[cy][cx] is None:
                decor[cy][cx] = "plant"
                blocked.add(key)
                blocked.add((cx + 1, cy))
                blocked.add((cx, cy + 1))

    # ---- vents inside the technical rooms
    for rid, vent_at in (("server", (0.5, 0.5)), ("engineering", (0.75, 0.5))):
        x1, y1, x2, y2 = rooms[rid]["bounds"]
        vx = int(x1 + (x2 - x1) * vent_at[0])
        vy = int(y1 + (y2 - y1) * vent_at[1])
        if 0 <= vx < cols and 0 <= vy < rows and walls[vy][vx] is None and decor[vy][vx] is None:
            decor[vy][vx] = "vent"

    # ---- awning over the street entrance
    est = cfg["entrance"]
    ax, ay = est["x"] - 1, est["y"]
    if 0 <= ax < cols and 0 <= ay < rows:
        decor[ay][ax] = "shop_awning"

    # ---- door thresholds + room plaques on the hallway side
    for d in doors:
        side = d["side"]
        for t in d["tiles"]:
            ty = t["y"] + (1 if side == "S" else -1)
            if 0 <= ty < rows and walls[ty][t["x"]] is None:
                decor[ty][t["x"]] = "door_threshold"
        # Room name plaque on the shared wall, beside the doorway
        _decor_on_wall(decor, walls, d["x"] - 2, d["y"], "sign_plaque", cols, rows)

    # ---- accent decor: rugs, wall clocks, posters and desk bins
    for rid, rug_at in (("meeting", (0.5, 0.62)), ("pantry", (0.35, 0.72))):
        x1, y1, x2, y2 = rooms[rid]["bounds"]
        rx = int(x1 + (x2 - x1) * rug_at[0])
        ry = int(y1 + (y2 - y1) * rug_at[1])
        if 0 <= rx < cols and 0 <= ry < rows and walls[ry][rx] is None and decor[ry][rx] is None:
            decor[ry][rx] = "rug"
    for rid, look in (("engineering", "poster"), ("meeting", "poster")):
        x1, y1, x2, y2 = rooms[rid]["bounds"]
        _decor_on_wall(decor, walls, x1 - 1, y1 + (y2 - y1) // 2, look, cols, rows)
    for d in doors:
        # wall clock on the hallway wall, on the far side of the doorway
        _decor_on_wall(decor, walls, d["x"] + 4, d["y"], "wall_clock", cols, rows)
    for rid in ("engineering", "research"):
        x1, y1, x2, y2 = rooms[rid]["bounds"]
        bx, by = x2 - 2, y2 - 1
        if 0 <= bx < cols and 0 <= by < rows and walls[by][bx] is None and decor[by][bx] is None:
            decor[by][bx] = "bin_small"

    # ---- sconces flanking each doorway on the shared wall row
    for d in doors:
        wy = d["y"]
        for wx in (d["x"] - 3, d["x"] + 5):
            _decor_on_wall(decor, walls, wx, wy, "sconce", cols, rows)

    return {
        "tileSize": cfg["tileSize"],
        "cols": cols,
        "rows": rows,
        "tileset": "assets/tiles/tileset.json",
        "legend": {"empty": None},
        "layers": [
            {"name": "floor", "encoding": "rle", "data": rle(floor)},
            {"name": "walls", "encoding": "rle", "data": rle(walls)},
            {"name": "decor", "encoding": "rle", "data": rle(decor)},
        ],
        "collision": {
            "source": "walls-layer",
            "note": "Any non-null walls tile is solid; floor tiles and doorways are walkable.",
        },
        "meta": {
            "building": building,
            "hallways": cfg["hallways"],
            "entrance": cfg["entrance"],
            "rooms": {
                rid: {
                    "bounds": rooms[rid]["bounds"],
                    "door": rooms[rid]["door"],
                }
                for rid in ROOM_IDS
            },
        },
    }


def _decor_on_wall(decor, walls, x, y, name, cols, rows):
    """Place a decoration only where a wall tile exists (never on floor/doors)."""
    if not (0 <= x < cols and 0 <= y < rows):
        return False
    if walls[y][x] is None or walls[y][x] == "door_mid":
        return False
    if decor[y][x] is not None:
        return False
    decor[y][x] = name
    return True


def _wall(walls, x, y, room=None, wall_room=None):
    if 0 <= y < len(walls) and 0 <= x < len(walls[0]):
        if walls[y][x] is None:
            walls[y][x] = "wall_face"
            if room is not None and wall_room is not None:
                wall_room[y][x] = room


def _wall_variant(walls, x, y, cols, rows):
    def solid(dx, dy):
        nx, ny = x + dx, y + dy
        if nx < 0 or ny < 0 or nx >= cols or ny >= rows:
            return True
        return walls[ny][nx] is not None

    up, down = solid(0, -1), solid(0, 1)
    left, right = solid(-1, 0), solid(1, 0)
    if not up and down:
        return "wall_top"
    if up and not down:
        return "wall_face"
    if not left and right:
        return "wall_side_l"
    if left and not right:
        return "wall_side_r"
    if up and down and left and right:
        return "wall_partition"
    return "wall_face"


def encoded_map(m: dict) -> str:
    return json.dumps(m, indent=1, ensure_ascii=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate the office floorplan tilemap")
    ap.add_argument("--check", action="store_true", help="verify office.map.json is up to date")
    args = ap.parse_args()

    text = encoded_map(build_map(load_config()))

    if args.check:
        current = MAP_PATH.read_text(encoding="utf-8") if MAP_PATH.exists() else ""
        if current != text:
            print("error: office.map.json is stale; run scripts/generate_tilemap.py", file=sys.stderr)
            return 1
        print("office.map.json up to date")
        return 0

    MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAP_PATH.write_text(text, encoding="utf-8")
    size = MAP_PATH.stat().st_size
    print(f"wrote {MAP_PATH.relative_to(ROOT)} ({size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
