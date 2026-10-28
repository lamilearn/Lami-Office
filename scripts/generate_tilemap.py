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
process.stdout.write(JSON.stringify({
  cols: LO.GRID_COLS,
  rows: LO.GRID_ROWS,
  tileSize: LO.TILE_SIZE,
  building: LO.BUILDING,
  hallways: LO.HALLWAY_BANDS,
  entrance: LO.ENTRANCE,
  rooms,
  doors: LO.doorways()
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

    door_tiles = {}
    for d in doors:
        for idx, t in enumerate(d["tiles"]):
            door_tiles[(t["x"], t["y"])] = (d["room"], idx, len(d["tiles"]))

    floor = [["floor_outside"] * cols for _ in range(rows)]
    walls = [[None] * cols for _ in range(rows)]
    decor = [[None] * cols for _ in range(rows)]

    def inside_building(x, y):
        return building["x1"] <= x <= building["x2"] and building["y1"] <= y <= building["y2"]

    # ---- rooms: interior floor + perimeter walls
    for rid in ROOM_IDS:
        info = rooms[rid]
        x1, y1, x2, y2 = info["bounds"]
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                on = ((x + y) % 2 == 0)
                floor[y][x] = f"floor_{rid}_a" if on else f"floor_{rid}_b"

        # perimeter ring (one tile outside the interior)
        for x in range(x1 - 1, x2 + 2):
            for y in (y1 - 1, y2 + 1):
                _wall(walls, x, y)
        for y in range(y1 - 1, y2 + 2):
            for x in (x1 - 1, x2 + 1):
                _wall(walls, x, y)

    # ---- hallways
    walkable = set()
    for band in cfg["hallways"]:
        for y in range(band["y1"], band["y2"] + 1):
            for x in range(band["x1"], band["x2"] + 1):
                floor[y][x] = "floor_hall_a" if (x + y) % 2 == 0 else "floor_hall_b"
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
            walls[y][x] = _wall_variant(walls, x, y, cols, rows)

    # ---- facade details for the top rooms' north walls
    for rid in ("boss", "research", "server"):
        info = rooms[rid]
        x1, _, x2, y1 = info["bounds"]
        ny = y1 - 1
        span = x2 - x1
        for wx in (x1 + span // 4, x1 + (3 * span) // 4):
            if 0 <= wx < cols and 0 <= ny < rows and walls[ny][wx] is not None:
                decor[ny][wx] = "window"

    # ---- door thresholds + room plaques on the hallway side
    for d in doors:
        side = d["side"]
        for t in d["tiles"]:
            ty = t["y"] + (1 if side == "S" else -1)
            if 0 <= ty < rows and walls[ty][t["x"]] is None:
                decor[ty][t["x"]] = "door_threshold"
        px = d["x"] + 1
        py = d["y"] + (2 if side == "S" else -2)
        if 0 <= px < cols and 0 <= py < rows and walls[py][px] is None:
            decor[py][px] = "sign_plaque"

    # ---- sconces on partition columns inside the hallways
    for y in range(rows):
        for x in range(cols):
            if walls[y][x] == "wall_partition":
                above = walls[y - 1][x] if y > 0 else None
                below = walls[y + 1][x] if y + 1 < rows else None
                if above and below is None:
                    decor[y][x] = "sconce"

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


def _wall(walls, x, y):
    if 0 <= y < len(walls) and 0 <= x < len(walls[0]):
        if walls[y][x] is None:
            walls[y][x] = "wall_face"


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
