#!/usr/bin/env python3
"""Generate the 16x16 pixel-art tileset spritesheet for the Lami AI Office floorplan.

Pure standard library (zlib + struct), so it runs anywhere the server runs.
Outputs:
  services/lami-office-react/web/assets/tiles/tileset.png
and validates that tileset.json references every drawn tile.

Usage:
  python3 scripts/generate_tileset.py
  python3 scripts/generate_tileset.py --check     # verify PNG matches the generators
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TILE_DIR = ROOT / "services" / "lami-office-react" / "web" / "assets" / "tiles"
INDEX_PATH = TILE_DIR / "tileset.json"
PNG_PATH = TILE_DIR / "tileset.png"

T = 16
COLS = 8
ROWS = 12

# ---------------------------------------------------------------- colour helpers
TRANSPARENT = (0, 0, 0, 0)


def hexc(value: str, alpha: int = 255):
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def mix(a, b, t: float):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3)) + (255,)


def shade(color, t: float):
    """Darken (t<0) or lighten (t>0) a colour."""
    if t < 0:
        return mix(color, (0, 0, 0, 255), -t)
    return mix(color, (255, 255, 255, 255), t)


class Tile:
    """Minimal pixel canvas for one 16x16 tile."""

    def __init__(self):
        self.px = [[TRANSPARENT for _ in range(T)] for _ in range(T)]

    def set(self, x, y, color):
        if 0 <= x < T and 0 <= y < T:
            self.px[y][x] = color

    def rect(self, x, y, w, h, color):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, color)

    def hline(self, y, x1, x2, color):
        for x in range(x1, x2 + 1):
            self.set(x, y, color)

    def vline(self, x, y1, y2, color):
        for y in range(y1, y2 + 1):
            self.set(x, y, color)


def checker(base, alt, size=8):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    for y in range(0, T, size):
        for x in range(0, T, size):
            if ((x // size) + (y // size)) % 2 == 1:
                tile.rect(x, y, size, size, alt)
    # faint grout lines
    grout = shade(base, -0.10)
    tile.hline(0, 0, T - 1, grout)
    tile.vline(0, 0, T - 1, grout)
    return tile


def planked(base, seam, light):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    for row, y in enumerate(range(0, T, 4)):
        tile.hline(y + 3, 0, T - 1, seam)
        offset = 0 if row % 2 == 0 else 4
        for x in range(offset, T, 8):
            tile.vline(x, y, y + 2, seam)
        tile.hline(y, 0, T - 1, light)
    return tile


def floor_boss(base, alt):
    tile = planked(base, shade(base, -0.22), shade(base, 0.08))
    return tile


def floor_lab(base, alt):
    tile = checker(base, alt, 8)
    grid = shade(base, -0.16)
    tile.hline(8, 0, T - 1, grid)
    tile.vline(8, 0, T - 1, grid)
    return tile


def floor_server(base, alt):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    vent = shade(base, 0.10)
    dark = shade(base, -0.35)
    for y in range(1, T, 3):
        tile.hline(y, 1, T - 2, vent)
        tile.hline(y + 1, 1, T - 2, dark)
    tile.rect(0, 0, 1, T, dark)
    tile.rect(T - 1, 0, 1, T, dark)
    return tile


def floor_carpet(base, alt):
    tile = checker(base, alt, 4)
    tile.hline(0, 0, T - 1, shade(base, -0.12))
    return tile


def floor_marble(base, alt):
    tile = checker(base, alt, 8)
    sheen = shade(base, 0.22)
    for i in range(3, 12):
        tile.set(i, 15 - i, sheen)
        tile.set(i + 1, 15 - i, sheen)
    return tile


def floor_hall(base, alt):
    tile = checker(base, alt, 8)
    tile.rect(0, 14, T, 2, shade(base, -0.12))
    return tile


def floor_lobby(base):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    accent = shade(base, -0.18)
    tile.rect(3, 3, 10, 10, accent)
    tile.rect(5, 5, 6, 6, shade(base, 0.2))
    tile.hline(0, 0, T - 1, shade(base, -0.3))
    tile.vline(0, 0, T - 1, shade(base, -0.3))
    return tile


def floor_outside(base):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    grass = shade(base, 0.18)
    dark = shade(base, -0.2)
    for x, y in ((2, 3), (9, 2), (5, 7), (12, 9), (3, 12), (8, 13), (14, 5)):
        tile.set(x, y, grass)
        tile.set(x, y + 1, dark)
    return tile


def wall_face(base, mortar):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    for course, y in enumerate(range(0, T, 4)):
        tile.hline(y + 3, 0, T - 1, mortar)
        offset = 0 if course % 2 == 0 else 4
        for x in range(offset, T, 8):
            tile.vline(x, y, y + 2, mortar)
    tile.hline(0, 0, T - 1, shade(base, 0.18))
    return tile


def wall_top(base):
    tile = Tile()
    tile.rect(0, 0, T, T, shade(base, 0.28))
    tile.rect(0, 10, T, 6, shade(base, 0.12))
    tile.hline(1, 0, T - 1, shade(base, 0.5))
    tile.hline(15, 0, T - 1, shade(base, -0.25))
    return tile


def wall_side(base, flip=False):
    tile = wall_face(base, shade(base, -0.35))
    cap = shade(base, 0.3) if not flip else shade(base, 0.05)
    band = list(range(0, 3)) if not flip else list(range(T - 3, T))
    for y in band:
        for x in range(T):
            tile.set(x, y, cap)
    return tile


def wall_trim(base):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    tile.hline(2, 0, T - 1, shade(base, 0.35))
    tile.hline(3, 0, T - 1, shade(base, 0.15))
    tile.hline(10, 0, T - 1, shade(base, -0.3))
    tile.rect(1, 4, T - 2, 6, shade(base, 0.05))
    return tile


def wall_partition(base):
    tile = wall_face(base, shade(base, -0.4))
    tile.vline(0, 0, T - 1, shade(base, 0.2))
    tile.vline(T - 1, 0, T - 1, shade(base, -0.2))
    return tile


def baseboard(base):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    tile.hline(1, 0, T - 1, shade(base, 0.4))
    tile.rect(0, 4, T, 12, shade(base, -0.15))
    tile.hline(15, 0, T - 1, shade(base, -0.5))
    return tile


def window_tile(theme):
    tile = wall_face(theme, shade(theme, -0.35))
    frame = hexc("#ba854d")
    glass = hexc("#88c8f7")
    night = hexc("#181730")
    tile.rect(2, 2, 12, 11, frame)
    tile.rect(3, 3, 10, 9, night)
    tile.rect(4, 9, 10, 3, glass)
    tile.vline(8, 3, 11, frame)
    return tile


def door_post(base, flip=False):
    tile = Tile()
    tile.rect(0, 0, T, T, base)
    post_x = T - 4 if flip else 0
    tile.rect(post_x, 0, 4, T, shade(base, -0.25))
    tile.rect(post_x, 2, 4, 2, hexc("#261b2e"))
    tile.hline(0, 0, T - 1, shade(base, 0.4))
    return tile


def door_mid(base):
    tile = Tile()
    tile.rect(0, 0, T, T, shade(base, 0.55))
    tile.rect(0, 0, T, 2, shade(base, 0.35))
    tile.rect(0, T - 2, T, 2, shade(base, 0.2))
    return tile


def door_threshold(gold):
    tile = Tile()
    tile.rect(0, 0, T, T, gold)
    tile.rect(0, 3, T, 4, shade(gold, -0.35))
    tile.hline(4, 0, T - 1, shade(gold, 0.45))
    tile.hline(9, 0, T - 1, shade(gold, -0.2))
    return tile


def sign_plaque(base):
    tile = Tile()
    tile.rect(1, 4, 14, 8, hexc("#fffaf0"))
    tile.hline(4, 1, 14, shade(base, -0.5))
    tile.hline(11, 1, 14, shade(base, -0.5))
    tile.vline(1, 4, 11, shade(base, -0.5))
    tile.vline(14, 4, 11, shade(base, -0.5))
    tile.rect(4, 7, 8, 2, shade(base, -0.3))
    return tile


def sconce():
    tile = Tile()
    tile.rect(6, 5, 4, 3, hexc("#54381e"))
    tile.rect(7, 2, 2, 3, hexc("#ffcf40"))
    glow = hexc("#ffd250", 0x66)
    tile.rect(6, 1, 4, 1, glow)
    return tile


def vent(base):
    tile = Tile()
    tile.rect(2, 2, 12, 12, shade(base, -0.2))
    for y in range(4, 13, 2):
        tile.hline(y, 3, 12, shade(base, 0.35))
    return tile


def plant():
    tile = Tile()
    tile.rect(6, 11, 4, 4, hexc("#c0392b"))
    tile.rect(5, 10, 6, 2, hexc("#e05a4b"))
    green = hexc("#27ae60")
    dark = hexc("#1e8449")
    tile.rect(5, 3, 6, 7, green)
    tile.rect(4, 5, 8, 3, green)
    tile.vline(8, 2, 9, dark)
    return tile


def awning():
    tile = Tile()
    for i, x in enumerate(range(0, T, 4)):
        color = hexc("#d64545") if i % 2 == 0 else hexc("#f5f1e6")
        tile.rect(x, 0, 4, 6, color)
    tile.rect(0, 6, T, 1, hexc("#8c2f2f"))
    tile.rect(0, 7, T, 9, shade(hexc("#8c5d3b"), 0.05))
    return tile


def lobby_mat():
    tile = Tile()
    tile.rect(1, 1, 14, 14, hexc("#2f6d46"))
    tile.rect(3, 3, 10, 10, hexc("#3f8f5c"))
    tile.hline(8, 3, 12, hexc("#a7f3d0"))
    return tile


def rug():
    tile = Tile()
    tile.rect(1, 1, 14, 14, hexc("#c084fc"))
    tile.rect(3, 3, 10, 10, hexc("#e9d5ff"))
    tile.rect(5, 5, 6, 6, hexc("#9333ea"))
    tile.hline(1, 1, 14, hexc("#7e22ce"))
    tile.hline(14, 1, 14, hexc("#7e22ce"))
    return tile


def wall_clock():
    tile = Tile()
    tile.rect(3, 3, 10, 10, hexc("#f5f1e6"))
    tile.rect(4, 4, 8, 8, hexc("#fdfcf7"))
    for x, y in ((3, 3), (12, 3), (3, 12), (12, 12)):
        tile.set(x, y, hexc("#8c5d3b"))
    tile.vline(8, 5, 8, hexc("#3a2838"))
    tile.hline(8, 8, 11, hexc("#c0392b"))
    return tile


def poster():
    tile = Tile()
    tile.rect(2, 2, 12, 13, hexc("#fdfcf7"))
    tile.rect(2, 2, 12, 3, hexc("#3b82f6"))
    tile.rect(4, 7, 8, 2, hexc("#f59e0b"))
    tile.rect(4, 10, 5, 2, hexc("#94a3b8"))
    tile.rect(2, 14, 12, 1, hexc("#8c5d3b"))
    return tile


def bin_small():
    tile = Tile()
    tile.rect(4, 5, 8, 9, hexc("#95a5a6"))
    tile.rect(3, 3, 10, 2, hexc("#7f8c8d"))
    tile.vline(6, 7, 12, hexc("#6b7a7a"))
    tile.vline(9, 7, 12, hexc("#6b7a7a"))
    tile.hline(14, 4, 11, hexc("#576574"))
    return tile


# ---------------------------------------------------------------- palette
BOSS = hexc("#b5834f")
RESEARCH = hexc("#609ac5")
SERVER = hexc("#5c5478")
ENGINEERING = hexc("#4f9b6c")
MEETING = hexc("#b56d43")
PANTRY = hexc("#b89d3b")
OAK = hexc("#5a3d28")
GOLD = hexc("#d4af37")

ROOM_PALETTE = {
    "boss": BOSS,
    "research": RESEARCH,
    "server": SERVER,
    "engineering": ENGINEERING,
    "meeting": MEETING,
    "pantry": PANTRY,
}


TILES = {
    "floor_boss_a": lambda: floor_boss(hexc("#fcedd7"), hexc("#f7dfbe")),
    "floor_boss_b": lambda: floor_boss(hexc("#f7dfbe"), hexc("#fcedd7")),
    "floor_research_a": lambda: floor_lab(hexc("#e1f0fc"), hexc("#cee4f8")),
    "floor_research_b": lambda: floor_lab(hexc("#cee4f8"), hexc("#e1f0fc")),
    "floor_server_a": lambda: floor_server(hexc("#262238"), hexc("#1d192c")),
    "floor_server_b": lambda: floor_server(hexc("#1d192c"), hexc("#262238")),
    "floor_engineering_a": lambda: floor_carpet(hexc("#e6f7ec"), hexc("#d1f0db")),
    "floor_engineering_b": lambda: floor_carpet(hexc("#d1f0db"), hexc("#e6f7ec")),
    "floor_meeting_a": lambda: floor_marble(hexc("#fff0e5"), hexc("#fde0cf")),
    "floor_meeting_b": lambda: floor_marble(hexc("#fde0cf"), hexc("#fff0e5")),
    "floor_pantry_a": lambda: checker(hexc("#fff9d6"), hexc("#fef1b8"), 8),
    "floor_pantry_b": lambda: checker(hexc("#fef1b8"), hexc("#fff9d6"), 8),
    "floor_hall_a": lambda: floor_hall(hexc("#f1f3f5"), hexc("#e9ecef")),
    "floor_hall_b": lambda: floor_hall(hexc("#e9ecef"), hexc("#f1f3f5")),
    "floor_lobby": lambda: floor_lobby(hexc("#e9ecef")),
    "floor_outside": lambda: floor_outside(hexc("#2b3b2f")),
    # Default (hallway / perimeter) wall, kept for tiles outside a room.
    "wall_face": lambda: wall_face(BOSS, shade(BOSS, -0.35)),
    "wall_top": lambda: wall_top(BOSS),
    "wall_side_l": lambda: wall_side(BOSS, flip=False),
    "wall_side_r": lambda: wall_side(BOSS, flip=True),
    # Per-room wall variants. Every room has its own palette in config.js, and
    # the tilemap tags each wall tile with its room id; without these the whole
    # building rendered in the boss-office oak and all rooms looked identical.
    **{
        f"wall_face_{rid}": (lambda base: lambda: wall_face(base, shade(base, -0.35)))(base)
        for rid, base in ((r, ROOM_PALETTE[r]) for r in ROOM_PALETTE)
    },
    **{
        f"wall_top_{rid}": (lambda base: lambda: wall_top(base))(base)
        for rid, base in ((r, ROOM_PALETTE[r]) for r in ROOM_PALETTE)
    },
    **{
        f"wall_side_l_{rid}": (lambda base: lambda: wall_side(base, flip=False))(base)
        for rid, base in ((r, ROOM_PALETTE[r]) for r in ROOM_PALETTE)
    },
    **{
        f"wall_side_r_{rid}": (lambda base: lambda: wall_side(base, flip=True))(base)
        for rid, base in ((r, ROOM_PALETTE[r]) for r in ROOM_PALETTE)
    },
    # Windows are set into the wall, so they must share the room's palette too.
    **{
        f"window_{rid}": (lambda base: lambda: window_tile(base))(base)
        for rid, base in ((r, ROOM_PALETTE[r]) for r in ROOM_PALETTE)
    },
    "wall_trim": lambda: wall_trim(OAK),
    "wall_partition": lambda: wall_partition(hexc("#4a3b32")),
    "baseboard": lambda: baseboard(OAK),
    "window": lambda: window_tile(BOSS),
    "door_left": lambda: door_post(OAK, flip=False),
    "door_mid": lambda: door_mid(OAK),
    "door_right": lambda: door_post(OAK, flip=True),
    "door_threshold": lambda: door_threshold(GOLD),
    "sign_plaque": lambda: sign_plaque(OAK),
    "sconce": sconce,
    "vent": lambda: vent(hexc("#868e96")),
    "plant": plant,
    "shop_awning": awning,
    "lobby_mat": lobby_mat,
    "rug": rug,
    "wall_clock": wall_clock,
    "poster": poster,
    "bin_small": bin_small,
}

# ---------------------------------------------------------------- PNG writer
def write_png(path: Path, pixels, width: int, height: int):
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            raw.extend(pixels[y][x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    return png


def render_sheet():
    width, height = COLS * T, ROWS * T
    canvas = [[TRANSPARENT for _ in range(width)] for _ in range(height)]
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    missing = []
    for entry in index:
        name = entry["name"]
        maker = TILES.get(name)
        if maker is None:
            missing.append(name)
            continue
        tile = maker()
        ox, oy = entry["col"] * T, entry["row"] * T
        for y in range(T):
            for x in range(T):
                canvas[oy + y][ox + x] = tile.px[y][x]
    unsheeted = sorted(set(TILES) - {e["name"] for e in index})
    return canvas, width, height, missing, unsheeted


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate the office tileset spritesheet")
    ap.add_argument("--check", action="store_true", help="verify the committed PNG is up to date")
    args = ap.parse_args()

    canvas, width, height, missing, unsheeted = render_sheet()
    if missing:
        print(f"error: tileset.json references unknown tiles: {', '.join(missing)}", file=sys.stderr)
        return 1
    if unsheeted:
        print(f"error: generators without a tileset.json entry: {', '.join(unsheeted)}", file=sys.stderr)
        return 1

    if args.check:
        expected = write_png(PNG_PATH.with_suffix(".check.png"), canvas, width, height)
        actual = PNG_PATH.read_bytes() if PNG_PATH.exists() else b""
        PNG_PATH.with_suffix(".check.png").unlink(missing_ok=True)
        if expected != actual:
            print("error: tileset.png is stale; run scripts/generate_tileset.py", file=sys.stderr)
            return 1
        print(f"tileset.png up to date ({width}x{height}px, {len(TILES)} tiles)")
        return 0

    write_png(PNG_PATH, canvas, width, height)
    print(f"wrote {PNG_PATH.relative_to(ROOT)} ({width}x{height}px, {len(TILES)} tiles)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
