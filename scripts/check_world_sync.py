#!/usr/bin/env python3
"""
Guard against world.py drifting away from the client's config.js / office.js.

The server owns the simulation, but the floorplan data still lives in the web
client (config.js) and the furniture obstacle list in office.js. If someone edits
one without the other, characters would path through walls. This script compares
the two sides and exits non-zero on any difference.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_JS = ROOT / "services" / "lami-office-react" / "web" / "js"
CONFIG_JS = WEB_JS / "config.js"
OFFICE_JS = WEB_JS / "office.js"

SNAPSHOT_SCRIPT = r"""
const fs = require('fs');
const vm = require('vm');
const cfg = fs.readFileSync(process.env.WORLD_CONFIG_JS, 'utf8');
const sandbox = { window: {}, console, Math, URLSearchParams };
sandbox.window.LO = {};
vm.createContext(sandbox);
vm.runInContext(cfg, sandbox);
const LO = sandbox.window.LO;
const out = {
  gridCols: LO.GRID_COLS, gridRows: LO.GRID_ROWS, tileSize: LO.TILE_SIZE,
  doorCol: LO.DOOR_COL, doorRow: LO.DOOR_ROW,
  lamiSeat: LO.LAMI_SEAT,
  rooms: Object.fromEntries(Object.entries(LO.ROOMS)
    .filter(([k]) => k !== 'coding')
    .map(([k, r]) => [k, { bounds: r.bounds, door: r.door }])),
  slots: Object.fromEntries(Object.entries(LO.SLOTS)
    .filter(([k]) => k !== 'coding')
    .map(([k, list]) => [k, list.map(s => [s.x, s.y, s.type, s.facing])])),
  hallwayBands: LO.HALLWAY_BANDS.map(b => [b.x1, b.y1, b.x2, b.y2]),
  residents: LO.RESIDENTS.map(r => [r.id, r.room, r.slot]),
  decorProps: (LO.DECOR_PROPS || []).map(p => [p.room, p.kind, p.x, p.y, p.w || 1, p.h || 1, !!p.solid]),
  roomRoutines: Object.fromEntries(Object.entries(LO.ROOM_ROUTINES)
    .map(([room, list]) => [room, list.map(r => [r.id, r.col, r.row, r.duration])])),
};
console.log(JSON.stringify(out));
"""


def load_js_snapshot() -> dict:
    import os
    env = dict(os.environ, WORLD_CONFIG_JS=str(CONFIG_JS))
    res = subprocess.run(
        ["node", "-e", SNAPSHOT_SCRIPT],
        capture_output=True, text=True, timeout=60, env=env,
    )
    if res.returncode != 0:
        raise SystemExit(f"could not read {CONFIG_JS.name}:\n{res.stderr[-1500:]}")
    return json.loads(res.stdout.strip().splitlines()[-1])


def slice_method(src: str, name: str) -> str:
    """Return the body of a method by matching braces from its signature."""
    start = src.index(f"    {name}(")
    open_brace = src.index("{", src.index(")", start))
    depth = 0
    for i in range(open_brace, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[open_brace + 1:i]
    raise SystemExit(f"unbalanced braces while reading {name}()")


def load_furniture_from_office_js() -> list:
    """Read the obstacle list straight out of office.js (no JS runtime needed)."""
    src = OFFICE_JS.read_text(encoding="utf-8")
    body = slice_method(src, "getFurnitureObstacles")
    obstacles = []
    for m in re.finditer(r"\{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*w:\s*(-?\d+),\s*h:\s*(-?\d+)", body):
        obstacles.append([int(g) for g in m.groups()])
    if not obstacles:
        raise SystemExit("no furniture obstacles found in office.js")
    return obstacles


def compare() -> list[str]:
    sys.path.insert(0, str(ROOT / "services" / "lami-office-react"))
    import world  # noqa: E402

    snap = load_js_snapshot()
    problems: list[str] = []

    def check(label, js_value, py_value):
        if js_value != py_value:
            problems.append(f"{label}: config.js={js_value!r} world.py={py_value!r}")

    check("GRID_COLS", snap["gridCols"], world.GRID_COLS)
    check("GRID_ROWS", snap["gridRows"], world.GRID_ROWS)
    check("TILE_SIZE", snap["tileSize"], world.TILE_SIZE)
    check("DOOR_COL", snap["doorCol"], world.DOOR_COL)
    check("DOOR_ROW", snap["doorRow"], world.DOOR_ROW)

    seat = snap["lamiSeat"]
    check("LAMI_SEAT", [seat["x"], seat["y"], seat["facing"]],
          [world.LAMI_SEAT["x"], world.LAMI_SEAT["y"], world.LAMI_SEAT["facing"]])

    for room, data in snap["rooms"].items():
        b = data["bounds"]
        py = world.ROOMS.get(room)
        if not py:
            problems.append(f"room {room} missing from world.py")
            continue
        check(f"room {room} bounds", [b["x1"], b["y1"], b["x2"], b["y2"]],
              [py["bounds"]["x1"], py["bounds"]["y1"], py["bounds"]["x2"], py["bounds"]["y2"]])
        d = data["door"]
        check(f"room {room} door", [d["x"], d["y"], d["side"]],
              [py["door"]["x"], py["door"]["y"], py["door"]["side"]])

    for room, slots in snap["slots"].items():
        py_slots = [[s["x"], s["y"], s["type"], s["facing"]] for s in world.SLOTS.get(room, [])]
        check(f"slots {room}", slots, py_slots)

    bands = [[b["x1"], b["y1"], b["x2"], b["y2"]] for b in world.HALLWAY_BANDS]
    check("HALLWAY_BANDS", snap["hallwayBands"], bands)

    check("RESIDENTS", [list(r) for r in snap["residents"]],
          [[r["id"], r["room"], r["slot"]] for r in world.RESIDENTS])

    for room, routines in snap["roomRoutines"].items():
        py_routines = [[r["id"], r["col"], r["row"], r["duration"]]
                       for r in world.ROOM_ROUTINES.get(room, [])]
        check(f"routines {room}", routines, py_routines)

    py_furniture = [[o["x"], o["y"], o["w"], o["h"]] for o in world.FURNITURE]
    check("furniture obstacles", load_furniture_from_office_js(), py_furniture)

    # Props added via LO.DECOR_PROPS are obstacles too, so both sides must agree.
    py_decor = [[p["room"], p["kind"], p["x"], p["y"], p.get("w", 1), p.get("h", 1),
                 bool(p.get("solid"))] for p in world.DECOR_PROPS]
    check("decor props", snap["decorProps"], py_decor)

    # Aliases the client relies on must exist server-side too.
    if world.SLOTS.get("coding") is not world.SLOTS.get("engineering"):
        problems.append("world.py SLOTS['coding'] must alias SLOTS['engineering']")
    return problems


def main() -> int:
    problems = compare()
    if problems:
        print("world.py is out of sync with web/js/config.js:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("world.py is in sync with config.js (rooms, slots, residents, routines, furniture)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
