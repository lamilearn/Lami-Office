#!/usr/bin/env python3
"""
Lami's AI Office - server-side world simulation.

The office is ONE world: every visitor renders the state produced here, so the
characters move together and the office keeps living with no browser open.

This module is a faithful port of the client engine:
  web/js/config.js   -> floorplan constants, A*, collision grid
  web/js/agents.js   -> Character kinematics, staff routines, Lami, sub-agents,
                        Mochi the cat, the delivery rider
  web/js/office.js   -> slot assignment, separation physics, social encounters,
                        random office events, spawn/tool/done handling

Purity rules (they make the port testable):
  - no I/O, no printing: narrative effects are queued in `Sim.outbox`
  - all randomness comes from the injected `random.Random`
  - `tick(dt)` is the only entry point that advances time

Stdlib only, like server.py.
"""
from __future__ import annotations

import math
import random
import re
import time

# --------------------------------------------------------------------------------------
# Floorplan (mirror of LO.ROOMS / LO.SLOTS / LO.HALLWAY in web/js/config.js)
# --------------------------------------------------------------------------------------
GRID_COLS = 88
GRID_ROWS = 50
TILE_SIZE = 16
CONTENT_W = GRID_COLS * TILE_SIZE
CONTENT_H = GRID_ROWS * TILE_SIZE

ROOMS = {
    "boss": {"bounds": {"x1": 2, "y1": 3, "x2": 27, "y2": 18},
             "door": {"x": 14, "y": 19, "side": "S"}, "label": "BOSS OFFICE"},
    "research": {"bounds": {"x1": 30, "y1": 3, "x2": 55, "y2": 18},
                 "door": {"x": 42, "y": 19, "side": "S"}, "label": "RESEARCH LAB"},
    "server": {"bounds": {"x1": 58, "y1": 3, "x2": 83, "y2": 18},
               "door": {"x": 70, "y": 19, "side": "S"}, "label": "SERVER ROOM"},
    "engineering": {"bounds": {"x1": 2, "y1": 24, "x2": 27, "y2": 39},
                    "door": {"x": 14, "y": 23, "side": "N"}, "label": "ENGINEERING PIT"},
    "meeting": {"bounds": {"x1": 30, "y1": 24, "x2": 55, "y2": 39},
                "door": {"x": 42, "y": 23, "side": "N"}, "label": "MEETING ROOM"},
    "pantry": {"bounds": {"x1": 58, "y1": 24, "x2": 83, "y2": 39},
               "door": {"x": 70, "y": 23, "side": "N"}, "label": "PANTRY & LOUNGE"},
}
ROOM_ORDER = ["boss", "research", "server", "engineering", "meeting", "pantry"]

HALLWAY = {"x1": 2, "y1": 20, "x2": 83, "y2": 22}
ENTRANCE_STUB = {"x1": 1, "y1": 21, "x2": 2, "y2": 21}
HALLWAY_BANDS = [HALLWAY, ENTRANCE_STUB]

DOOR_COL = 2
DOOR_ROW = 21

SLOTS = {
    "boss": [
        {"x": 14, "y": 9, "type": "stand", "facing": "N", "report": True},
        {"x": 8, "y": 11, "type": "sit", "facing": "E"},
        {"x": 20, "y": 11, "type": "sit", "facing": "W"},
    ],
    "research": [
        {"x": 34, "y": 10, "type": "desk", "facing": "N"},
        {"x": 42, "y": 10, "type": "desk", "facing": "N"},
        {"x": 50, "y": 10, "type": "desk", "facing": "N"},
        {"x": 35, "y": 15, "type": "stand", "facing": "E"},
        {"x": 52, "y": 15, "type": "stand", "facing": "W"},
    ],
    "server": [
        {"x": 70, "y": 15, "type": "desk", "facing": "N"},
        {"x": 64, "y": 9, "type": "stand", "facing": "N"},
        {"x": 70, "y": 9, "type": "stand", "facing": "N"},
        {"x": 76, "y": 9, "type": "stand", "facing": "N"},
    ],
    "engineering": [
        {"x": 7, "y": 28, "type": "desk", "facing": "N"},
        {"x": 12, "y": 28, "type": "desk", "facing": "N"},
        {"x": 7, "y": 33, "type": "desk", "facing": "N"},
        {"x": 12, "y": 33, "type": "desk", "facing": "N"},
        {"x": 18, "y": 31, "type": "desk", "facing": "N"},
        {"x": 23, "y": 31, "type": "desk", "facing": "N"},
    ],
    "meeting": [
        {"x": 41, "y": 29, "type": "sit", "facing": "S"},
        {"x": 44, "y": 29, "type": "sit", "facing": "S"},
        {"x": 47, "y": 29, "type": "sit", "facing": "S"},
        {"x": 41, "y": 33, "type": "sit", "facing": "N"},
        {"x": 44, "y": 33, "type": "sit", "facing": "N"},
        {"x": 47, "y": 33, "type": "sit", "facing": "N"},
    ],
    "pantry": [
        {"x": 63, "y": 28, "type": "stand", "facing": "N"},
        {"x": 64, "y": 34, "type": "sit", "facing": "S"},
        {"x": 66, "y": 34, "type": "sit", "facing": "S"},
        {"x": 73, "y": 29, "type": "stand", "facing": "N"},
        {"x": 77, "y": 34, "type": "stand", "facing": "W"},
    ],
}
SLOTS["coding"] = SLOTS["engineering"]

LAMI_SEAT = {"x": 14, "y": 6, "facing": "S"}

PROPS = {
    "trashcan": {"x": 20, "y": 6, "w": 1, "h": 1},
    "whiteboard": {"x": 32, "y": 24, "w": 5, "h": 2},
    "watercooler": {"x": 74, "y": 28, "w": 1, "h": 1},
}

RESIDENTS = [
    {"id": "res-rina", "name": "Rina", "role": "Kepala Riset", "room": "research", "slot": 0},
    {"id": "res-nadia", "name": "Nadia", "role": "Research Analyst", "room": "research", "slot": 1},
    {"id": "res-yoga", "name": "Yoga", "role": "Data Scientist", "room": "research", "slot": 2},
    {"id": "res-dodo", "name": "Dodo", "role": "Senior Coder", "room": "engineering", "slot": 0},
    {"id": "res-tono", "name": "Tono", "role": "Frontend Dev", "room": "engineering", "slot": 1},
    {"id": "res-citra", "name": "Citra", "role": "Backend Dev", "room": "engineering", "slot": 2},
    {"id": "res-sekar", "name": "Sekar", "role": "Sekretaris", "room": "meeting", "slot": 0},
    {"id": "res-wulan", "name": "Wulan", "role": "Product Planner", "room": "meeting", "slot": 1},
    {"id": "res-dimas", "name": "Dimas", "role": "Business Analyst", "room": "meeting", "slot": 2},
    {"id": "res-bima", "name": "Bima", "role": "Admin Server", "room": "server", "slot": 0},
    {"id": "res-eko", "name": "Eko", "role": "DevOps Engineer", "room": "server", "slot": 1},
    {"id": "res-intan", "name": "Intan", "role": "Site Reliability", "room": "server", "slot": 2},
    {"id": "res-kiki", "name": "Kiki", "role": "Office Manager", "room": "pantry", "slot": 0},
]

ROLE_BY_ROOM = {"research": "Researcher", "engineering": "Coder", "coding": "Coder",
                "meeting": "Planner", "server": "Ops", "pantry": "Santai", "boss": "Lapor Boss"}
DEFAULT_TOOL_BY_ROOM = {"research": "search", "coding": "code", "engineering": "code",
                        "meeting": "plan", "server": "terminal"}

# Furniture obstacles (mirror of Office.getFurnitureObstacles in web/js/office.js)
FURNITURE = [
    {"x": 11, "y": 7, "w": 7, "h": 1}, {"x": 4, "y": 5, "w": 1, "h": 1},
    {"x": 20, "y": 6, "w": 1, "h": 1}, {"x": 25, "y": 5, "w": 1, "h": 1},
    {"x": 8, "y": 6, "w": 1, "h": 1},
    {"x": 33, "y": 9, "w": 3, "h": 1}, {"x": 41, "y": 9, "w": 3, "h": 1},
    {"x": 49, "y": 9, "w": 3, "h": 1}, {"x": 33, "y": 15, "w": 2, "h": 1},
    {"x": 49, "y": 3, "w": 5, "h": 1}, {"x": 31, "y": 4, "w": 4, "h": 1},
    {"x": 63, "y": 6, "w": 3, "h": 2}, {"x": 69, "y": 6, "w": 3, "h": 2},
    {"x": 75, "y": 6, "w": 3, "h": 2}, {"x": 81, "y": 6, "w": 2, "h": 2},
    {"x": 66, "y": 14, "w": 6, "h": 1},
    {"x": 6, "y": 27, "w": 3, "h": 1}, {"x": 11, "y": 27, "w": 3, "h": 1},
    {"x": 6, "y": 32, "w": 3, "h": 1}, {"x": 11, "y": 32, "w": 3, "h": 1},
    {"x": 17, "y": 30, "w": 3, "h": 1}, {"x": 22, "y": 30, "w": 3, "h": 1},
    {"x": 16, "y": 27, "w": 1, "h": 1},
    {"x": 38, "y": 30, "w": 12, "h": 3}, {"x": 32, "y": 24, "w": 5, "h": 1},
    {"x": 60, "y": 27, "w": 6, "h": 1}, {"x": 74, "y": 28, "w": 1, "h": 1},
    {"x": 63, "y": 33, "w": 6, "h": 1}, {"x": 68, "y": 36, "w": 3, "h": 1},
    {"x": 78, "y": 33, "w": 3, "h": 2},
]

# Tool -> room mapping (mirror of LO.TOOL_ROOMS / LO.roomForTool)
TOOL_ROOMS = [
    (re.compile(r"^(web_|browser|search$|google|fetch|read_url|crawl|scrape|youtube|arxiv)", re.I), "research"),
    (re.compile(r"(search_web|web_search|web_extract|session_search|wiki)", re.I), "research"),
    (re.compile(r"^(delegate|todo|plan|clarify|memory|skill|cron|send_message|schedule)", re.I), "meeting"),
    (re.compile(r"(vision|image_gen|image|tts|text_to_speech|speech|llm|model|mixture|moa|inference|transcri)", re.I), "server"),
    (re.compile(r"(terminal|process|shell|bash|exec|code|write|patch|edit|read_file|file|git|npm|python)", re.I), "engineering"),
]
DEFAULT_ROOM = "engineering"


def room_for_tool(tool) -> str:
    if not tool:
        return DEFAULT_ROOM
    for rx, room in TOOL_ROOMS:
        if rx.search(str(tool)):
            return room
    return DEFAULT_ROOM


def nearest_walkable(x, y, grid, max_radius=8):
    """Mirror of LO.nearestWalkable: closest walkable tile in a growing ring."""
    if not grid:
        return None
    rows, cols = len(grid), len(grid[0])
    cx, cy = _js_round(x), _js_round(y)
    if 0 <= cx < cols and 0 <= cy < rows and grid[cy][cx] == 0:
        return {"x": cx, "y": cy}
    for r in range(1, max_radius + 1):
        best, best_dist = None, float("inf")
        for oy in range(-r, r + 1):
            for ox in range(-r, r + 1):
                if max(abs(ox), abs(oy)) != r:
                    continue
                nx, ny = cx + ox, cy + oy
                if nx < 0 or nx >= cols or ny < 0 or ny >= rows:
                    continue
                if grid[ny][nx] != 0:
                    continue
                d = math.hypot(ox, oy)
                if d < best_dist:
                    best_dist, best = d, {"x": nx, "y": ny}
        if best:
            return best
    return None


def compress_path(path):
    """Mirror of LO.compressPath: drop collinear waypoints."""
    if not path or len(path) <= 2:
        return path
    out = [path[0]]
    for i in range(1, len(path) - 1):
        a, b, c = path[i - 1], path[i], path[i + 1]
        if (b["x"] - a["x"]) != (c["x"] - b["x"]) or (b["y"] - a["y"]) != (c["y"] - b["y"]):
            out.append(b)
    out.append(path[-1])
    return out


DIRS = [(0, -1), (0, 1), (1, 0), (-1, 0)]  # N, S, E, W
TURN_COST = 0.6


def find_orthogonal_path(start, goal, grid):
    """Mirror of LO.findOrthogonalPath (A* on a 5-state grid, turn-penalised)."""
    if not grid:
        return None
    rows, cols = len(grid), len(grid[0])
    s = nearest_walkable(start["x"], start["y"], grid)
    g = nearest_walkable(goal["x"], goal["y"], grid)
    if not s or not g:
        return None
    if s["x"] == g["x"] and s["y"] == g["y"]:
        return [s]

    def state_key(x, y, d):
        return (y * cols + x) * 5 + d

    def heur(x, y):
        return abs(x - g["x"]) + abs(y - g["y"])

    g_score = {}
    came_from = {}
    closed = set()
    start_key = state_key(s["x"], s["y"], 4)
    g_score[start_key] = 0
    # The JS implementation keeps a plain array and picks the first node with the
    # lowest f (ties: lowest h), removing it with splice(). Order of insertion
    # therefore decides ties, so the Python port must use a list too - a heap
    # would produce a different (but equally short) route.
    open_list = [{"x": s["x"], "y": s["y"], "d": 4, "g": 0.0,
                  "f": float(heur(s["x"], s["y"])), "h": float(heur(s["x"], s["y"]))}]

    while open_list:
        best = 0
        for i in range(1, len(open_list)):
            if open_list[i]["f"] < open_list[best]["f"] or (
                open_list[i]["f"] == open_list[best]["f"] and open_list[i]["h"] < open_list[best]["h"]
            ):
                best = i
        cur = open_list.pop(best)
        cx, cy, cd = cur["x"], cur["y"], cur["d"]
        ck = state_key(cx, cy, cd)
        if ck in closed:
            continue
        closed.add(ck)

        if cx == g["x"] and cy == g["y"]:
            # Walk the came-from chain back to the start state (dir 4).
            path = []
            node = ck
            while node is not None:
                cell = node // 5
                path.append({"x": cell % cols, "y": cell // cols})
                node = came_from.get(node)
            path.reverse()
            unique = [p for i, p in enumerate(path)
                      if i == 0 or p["x"] != path[i - 1]["x"] or p["y"] != path[i - 1]["y"]]
            return compress_path(unique)

        for d, (dx, dy) in enumerate(DIRS):
            nx, ny = cx + dx, cy + dy
            if nx < 0 or nx >= cols or ny < 0 or ny >= rows:
                continue
            if grid[ny][nx] != 0:
                continue
            nk = state_key(nx, ny, d)
            if nk in closed:
                continue
            turn = TURN_COST if (cd != 4 and cd != d) else 0
            tentative = cur["g"] + 1 + turn
            if tentative < g_score.get(nk, float("inf")):
                g_score[nk] = tentative
                came_from[nk] = ck
                h = float(heur(nx, ny))
                open_list.append({"x": nx, "y": ny, "d": d, "g": tentative,
                                  "f": tentative + h, "h": h})
    return None


def build_collision_grid():
    """Mirror of Office.buildCollisionGrid: 1 = solid, 0 = walkable."""
    grid = [[1] * GRID_COLS for _ in range(GRID_ROWS)]

    def open_tile(x, y):
        if 0 <= x < GRID_COLS and 0 <= y < GRID_ROWS:
            grid[y][x] = 0

    for key in ROOM_ORDER:
        b = ROOMS[key]["bounds"]
        for y in range(b["y1"], b["y2"] + 1):
            for x in range(b["x1"], b["x2"] + 1):
                open_tile(x, y)

    for band in HALLWAY_BANDS:
        for y in range(band["y1"], band["y2"] + 1):
            for x in range(band["x1"], band["x2"] + 1):
                open_tile(x, y)

    for key in ROOM_ORDER:
        door = ROOMS[key]["door"]
        open_tile(door["x"], door["y"])
        open_tile(door["x"] + 1, door["y"])

    for obs in FURNITURE:
        for dy in range(obs["h"]):
            for dx in range(obs["w"]):
                x, y = obs["x"] + dx, obs["y"] + dy
                if 0 <= x < GRID_COLS and 0 <= y < GRID_ROWS:
                    grid[y][x] = 1

    for room_slots in SLOTS.values():
        for slot in room_slots:
            if 0 <= slot["x"] < GRID_COLS and 0 <= slot["y"] < GRID_ROWS:
                grid[slot["y"]][slot["x"]] = 0

    if 0 <= LAMI_SEAT["x"] < GRID_COLS and 0 <= LAMI_SEAT["y"] < GRID_ROWS:
        grid[LAMI_SEAT["y"]][LAMI_SEAT["x"]] = 0
    return grid


GRID = build_collision_grid()


def hash_string(value: str) -> int:
    """Mirror of LO.hashString (31-based, int32, absolute)."""
    h = 0
    for ch in str(value or ""):
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
        if h >= 0x80000000:
            h -= 0x100000000
    return abs(h)


def _js_round(value) -> int:
    """JS Math.round: .5 always rounds up (Python's round() is banker's)."""
    return int(math.floor(float(value) + 0.5))


def is_walkable(col, row) -> bool:
    x, y = math.floor(col), math.floor(row)
    if x < 0 or x >= GRID_COLS or y < 0 or y >= GRID_ROWS:
        return False
    return GRID[y][x] == 0


def room_at(col, row):
    for key in ["boss", "research", "server", "engineering", "meeting", "pantry"]:
        b = ROOMS[key]["bounds"]
        if b["x1"] <= col <= b["x2"] and b["y1"] <= row <= b["y2"]:
            return key
    return None


# --------------------------------------------------------------------------------------
# Routines (mirror of ResidentAgent.getPersonalRoutines + LO.ROOM_ROUTINES + Lami.getRoutines)
# --------------------------------------------------------------------------------------
ROOM_ROUTINES = {
    "research": [
        {"id": "room-corkboard", "name": "Cek Papan Riset", "col": 32, "row": 6, "facing": "N", "duration": 6,
         "startBubble": "Cek temuan tim di papan 📌", "arriveBubble": "Hipotesis baru tercatat rapi 💡", "arriveEmote": "💡",
         "leaveBubble": "Lanjut olah data 📊", "task": "Review Papan Riset"},
        {"id": "room-window", "name": "Istirahat Mata", "col": 54, "row": 17, "facing": "E", "duration": 6,
         "startBubble": "Lihat jendela sebentar 🌤️", "arriveBubble": "Mata seger, fokus lagi ✨", "arriveEmote": "✨",
         "leaveBubble": "Balik ke meja riset 🔍", "task": "Istirahat Sejenak"},
        {"id": "room-reading", "name": "Baca Referensi", "col": 32, "row": 17, "facing": "W", "duration": 7,
         "startBubble": "Buka jurnal referensi 📚", "arriveBubble": "Metode ini menarik! 🔍", "arriveEmote": "📚",
         "leaveBubble": "Diskusi ke kepala riset 🤝", "task": "Membaca Jurnal"},
    ],
    "engineering": [
        {"id": "room-mini-rig", "name": "Cek Build Runner", "col": 20, "row": 28, "facing": "N", "duration": 6,
         "startBubble": "Cek build runner lokal ⚙️", "arriveBubble": "Build hijau, test pass ✅", "arriveEmote": "⚙️",
         "leaveBubble": "Lanjut coding 💻", "task": "Inspeksi Build Runner"},
        {"id": "room-corner", "name": "Diskusi Arsitektur", "col": 24, "row": 37, "facing": "E", "duration": 6,
         "startBubble": "Diskusi skema arsitektur 📐", "arriveBubble": "Desain baru lebih rapi ⚡", "arriveEmote": "💡",
         "leaveBubble": "Implementasi sekarang 🚀", "task": "Diskusi Arsitektur"},
        {"id": "room-review", "name": "Code Review", "col": 4, "row": 31, "facing": "W", "duration": 6,
         "startBubble": "Review PR teman 👀", "arriveBubble": "Kode bersih, approve! 👍", "arriveEmote": "✅",
         "leaveBubble": "Balik ke terminal ⌨️", "task": "Code Review"},
    ],
    "meeting": [
        {"id": "room-whiteboard", "name": "Update Whiteboard", "col": 33, "row": 26, "facing": "N", "duration": 6,
         "startBubble": "Tulis agenda rapat 📝", "arriveBubble": "Agenda sinkron semua 🗓️", "arriveEmote": "📋",
         "leaveBubble": "Rapikan notulensi ✨", "task": "Update Papan Agenda"},
        {"id": "room-podium", "name": "Presentasi Progres", "col": 52, "row": 31, "facing": "W", "duration": 6,
         "startBubble": "Siapkan materi presentasi 📊", "arriveBubble": "Target kuartal on-track! 🎯", "arriveEmote": "📢",
         "leaveBubble": "Sesi tanya jawab kelar 🤝", "task": "Presentasi Progres"},
        {"id": "room-corner", "name": "Ngobrol Tim", "col": 53, "row": 37, "facing": "E", "duration": 6,
         "startBubble": "Ngobrol rencana minggu ini 💬", "arriveBubble": "Ide baru muncul! ✨", "arriveEmote": "💡",
         "leaveBubble": "Balik ke meja rapat 📋", "task": "Diskusi Tim"},
    ],
    "server": [
        {"id": "room-rack-a", "name": "Patroli Rack A", "col": 64, "row": 11, "facing": "N", "duration": 6,
         "startBubble": "Patroli suhu Rack A ❄️", "arriveBubble": "Suhu 17°C, optimal 🟢", "arriveEmote": "🖥️",
         "leaveBubble": "Cek Rack B 🚶", "task": "Inspeksi Rack A"},
        {"id": "room-rack-c", "name": "Patroli Rack C", "col": 76, "row": 11, "facing": "N", "duration": 6,
         "startBubble": "Cek traffic Rack C ⚡", "arriveBubble": "Throughput 10 Gbps 🚀", "arriveEmote": "⚡",
         "leaveBubble": "Jaringan prima 👍", "task": "Inspeksi Rack C"},
        {"id": "room-console", "name": "Cek Console", "col": 61, "row": 15, "facing": "W", "duration": 6,
         "startBubble": "Buka ops console 🖥️", "arriveBubble": "Semua service sehat ✅", "arriveEmote": "✅",
         "leaveBubble": "Balik ke terminal ⌨️", "task": "Monitoring Console"},
    ],
    "pantry": [
        {"id": "room-espresso", "name": "Racik Kopi", "col": 63, "row": 30, "facing": "N", "duration": 6,
         "startBubble": "Racik kopi buat tim ☕", "arriveBubble": "Espresso siap! ☕✨", "arriveEmote": "☕",
         "leaveBubble": "Antar ke meja tim 🚶", "task": "Racik Kopi"},
        {"id": "room-sofa", "name": "Rapikan Lounge", "col": 67, "row": 36, "facing": "N", "duration": 6,
         "startBubble": "Rapikan sofa lounge 🛋️", "arriveBubble": "Lounge nyaman lagi ✨", "arriveEmote": "✨",
         "leaveBubble": "Cek snack stock 🍪", "task": "Rapikan Lounge"},
        {"id": "room-center", "name": "Sapa Tim", "col": 76, "row": 30, "facing": "W", "duration": 6,
         "startBubble": "Sapa tim yang rehat 👋", "arriveBubble": "Semangat terus! 💪", "arriveEmote": "❤️",
         "leaveBubble": "Balik ke pantry ☕", "task": "Sapa Tim"},
    ],
}

PERSONAL_ROUTINES = {
    "res-rina": [
        {"id": "corkboard", "name": "Cek Papan Catatan", "col": 32, "row": 6, "facing": "N", "duration": 7,
         "startBubble": "Cek hipotesis di papan 📌", "arriveBubble": "Data riset sinkron semua 💡", "arriveEmote": "💡",
         "leaveBubble": "Lanjut analisis di meja 📚", "task": "Analisis Papan Catatan"},
        {"id": "stretch", "name": "Peregangan Jendela", "col": 54, "row": 17, "facing": "E", "duration": 6,
         "startBubble": "Peregangan badan dulu~ ✨", "arriveBubble": "Udara sejuk bikin fokus 🌿", "arriveEmote": "✨",
         "leaveBubble": "Badan seger kembali! 💪", "task": "Peregangan & Istirahat Mata"},
        {"id": "reading", "name": "Membaca Jurnal", "col": 33, "row": 17, "facing": "W", "duration": 7,
         "startBubble": "Buka referensi jurnal 📖", "arriveBubble": "Metode baru menarik banget 🔍", "arriveEmote": "📚",
         "leaveBubble": "Terapkan ke riset tim ✨", "task": "Membaca Jurnal Ilmiah"},
        {"id": "coffee_pantry", "name": "Ngopi di Pantry", "col": 62, "row": 30, "facing": "N", "duration": 8,
         "startBubble": "Turun ke pantry, ngopi dulu 🍵", "arriveBubble": "Racik matcha latte hangat 🍵✨", "arriveEmote": "☕",
         "leaveBubble": "Kembali ke Lab Riset! 🚀", "task": "Rehat Matcha di Pantry"},
        {"id": "consult_boss", "name": "Lapor Boss Lami", "col": 14, "row": 9, "facing": "N", "duration": 6.5,
         "startBubble": "Naik ke kantor Boss Lami 👑", "arriveBubble": "Lapor temuan riset, Boss! 📑", "arriveEmote": "✨",
         "leaveBubble": "Siap laksanakan arahan Boss! 👍", "task": "Konsultasi ke Boss Lami",
         "onArrive": "lami-cheer"},
    ],
    "res-dodo": [
        {"id": "server_mini", "name": "Cek Mini Server", "col": 20, "row": 28, "facing": "N", "duration": 7,
         "startBubble": "Cek build runner lokal ⚙️", "arriveBubble": "Build hijau, test pass 100%! 🟢", "arriveEmote": "⚙️",
         "leaveBubble": "Lanjut coding modul baru 💻", "task": "Inspeksi Build Runner"},
        {"id": "arch_board", "name": "Desain Skema", "col": 24, "row": 37, "facing": "E", "duration": 7,
         "startBubble": "Petakan skema arsitektur 📐", "arriveBubble": "Arsitektur baru lebih ngebut ⚡", "arriveEmote": "💡",
         "leaveBubble": "Implementasi ke kode! 🚀", "task": "Desain Skema Arsitektur"},
        {"id": "peer_review", "name": "Code Review Tim", "col": 4, "row": 31, "facing": "W", "duration": 6,
         "startBubble": "Cek PR kodingan teman 👀", "arriveBubble": "Kode bersih, approve merge! 👍", "arriveEmote": "✅",
         "leaveBubble": "Balik ke terminal ⌨️", "task": "Code Review Tim"},
        {"id": "pantry_snack", "name": "Cari Cemilan", "col": 77, "row": 32, "facing": "N", "duration": 8,
         "startBubble": "Turun cari cemilan koding 🍫", "arriveBubble": "Kopi hitam + biskuit mantap ☕", "arriveEmote": "☕",
         "leaveBubble": "Bahan bakar koding ready! ⚡", "task": "Ambil Kopi di Pantry"},
    ],
    "res-sekar": [
        {"id": "agenda_board", "name": "Update Whiteboard", "col": 33, "row": 26, "facing": "N", "duration": 7,
         "startBubble": "Tulis agenda rapat baru 📝", "arriveBubble": "Jadwal meeting sinkron semua 🗓️", "arriveEmote": "📋",
         "leaveBubble": "Rapikan notulensi rapat ✨", "task": "Update Papan Agenda"},
        {"id": "podium", "name": "Presentasi Progres", "col": 52, "row": 31, "facing": "W", "duration": 6.5,
         "startBubble": "Siapkan materi presentasi 📊", "arriveBubble": "Target kuartal ini on-track! 🎯", "arriveEmote": "📢",
         "leaveBubble": "Sesi tanya jawab kelar 🤝", "task": "Presentasi Progres Tim"},
        {"id": "report_boss", "name": "Lapor Boss Lami", "col": 14, "row": 9, "facing": "N", "duration": 6.5,
         "startBubble": "Bawa berkas ke Boss Lami 👑", "arriveBubble": "Ini jadwal evaluasi, Boss! 📑", "arriveEmote": "❤️",
         "leaveBubble": "Boss setuju, kembali ke 2F ✨", "task": "Lapor Dokumen ke Boss",
         "onArrive": "lami-thanks"},
        {"id": "lounge_relax", "name": "Santai di Sofa", "col": 67, "row": 36, "facing": "N", "duration": 8,
         "startBubble": "Turun santai di sofa lounge 🛋️", "arriveBubble": "Teh hangat + puk-puk Mochi 🐱☕", "arriveEmote": "☕",
         "leaveBubble": "Kembali segar berenergi! 🌸", "task": "Santai di Sofa Lounge",
         "onArrive": "cat-purr"},
    ],
    "res-bima": [
        {"id": "patrol_rack_a", "name": "Inspeksi Rack A", "col": 64, "row": 11, "facing": "N", "duration": 7,
         "startBubble": "Patroli suhu server Rack A ❄️", "arriveBubble": "Suhu 17°C, airflow optimal 🟢", "arriveEmote": "🖥️",
         "leaveBubble": "Lanjut cek Rack B 🚶", "task": "Inspeksi Suhu Server"},
        {"id": "patrol_rack_b", "name": "Inspeksi Rack B", "col": 70, "row": 11, "facing": "N", "duration": 7,
         "startBubble": "Cek traffic jaringan Rack B ⚡", "arriveBubble": "Throughput 10 Gbps ngebut pol! 🚀", "arriveEmote": "⚡",
         "leaveBubble": "Jaringan prima tanpa drop 👍", "task": "Monitoring Traffic Network"},
        {"id": "cables_patch", "name": "Cek Kabel Jaringan", "col": 76, "row": 11, "facing": "N", "duration": 6,
         "startBubble": "Cek kerapian kabel switch 🔧", "arriveBubble": "Kabel fiber optik rapi jali 👍", "arriveEmote": "🔧",
         "leaveBubble": "Balik ke terminal server 🖥️", "task": "Cek Pengkabelan Fiber"},
        {"id": "coffee_break", "name": "Ngopi ke Pantry", "col": 63, "row": 30, "facing": "N", "duration": 8,
         "startBubble": "Naik dari basement, ngopi ☕", "arriveBubble": "Hirup udara segar & kopi panas 🌿☕", "arriveEmote": "☕",
         "leaveBubble": "Server aman, kembali ke B1! 🖥️", "task": "Ngopi di 1F Pantry"},
    ],
}

LAMI_ROUTINES = [
    {"id": "window", "name": "Menatap Kota", "col": 24, "row": 5, "facing": "N", "duration": 7,
     "startBubble": "Lihat pemandangan kota dulu 🏙️", "arriveBubble": "Kota tampak indah dari atas ✨", "arriveEmote": "🌟",
     "leaveBubble": "Lanjut pantau target kantor 👑", "task": "Menatap Pemandangan Kota"},
    {"id": "bonsai", "name": "Merawat Bonsai", "col": 5, "row": 5, "facing": "W", "duration": 6,
     "startBubble": "Cek tanaman bonsai kantor 🌱", "arriveBubble": "Bonsai makin asri & subur 🌿", "arriveEmote": "🌿",
     "leaveBubble": "Kantor hijau bikin pikiran jernih ✨", "task": "Merawat Bonsai Kantor"},
    {"id": "balcony", "name": "Pantau Gedung", "col": 4, "row": 17, "facing": "W", "duration": 6.5,
     "startBubble": "Tinjau suasana kerja dari balkon 👑", "arriveBubble": "Semua divisi sangat produktif! 👍", "arriveEmote": "✨",
     "leaveBubble": "Lami Corp siap terbang tinggi 🚀", "task": "Memantau Operasional Gedung"},
    {"id": "pantry_visit", "name": "Sapa Tim di Pantry", "col": 76, "row": 30, "facing": "N", "duration": 8,
     "startBubble": "Turun ke Pantry sapa tim ☕", "arriveBubble": "Halo semuanya, ngopi bareng! ☕✨", "arriveEmote": "👑",
     "leaveBubble": "Semangat terus kerjanya! 💪", "task": "Menyapa Tim & Rehat di 1F",
     "onArrive": "cat-meow"},
]

RESIDENT_STAGGER = {"res-rina": (5, 4), "res-dodo": (12, 4), "res-sekar": (19, 4), "res-bima": (26, 4)}

IDLE_CHATS = {
    "boss": ["Target hari ini aman! 👑", "Ngopi dulu bentar ☕", "Semangat semuanya! 💪",
             "Kerjaan rapi, mantap 👍", "Kantor makin produktif ✨"],
    "research": ["Dapet data bagus nih 📚", "Lagi baca referensi 🔍", "Analisis tren kelar 💡",
                 "Risetnya menarik banget ✨"],
    "coding": ["Kodingan lancar jaya 💻", "Fix bug beres 👍", "Deploy aman tanpa error 🚀", "Kode bersih & rapi ✨"],
    "meeting": ["Diskusi seru banget 📋", "Roadmap sudah jelas 📝", "Bagi tugas beres 🤝"],
    "pantry": ["Ngopi dulu bentar ☕", "Donatnya enak banget 🍩", "Santai sejenak di sofa 🛋️", "Rehat dulu biar seger ✨"],
    "server": ["Server adem ayem 🖥️", "Lampu hijau semua 🟢", "Koneksi lancar pol ⚡"],
}

DIALOGUES = {
    "boss": [("Pagi Boss Lami! ✨", "Semangat kerjanya ya! 👍")],
    "meeting": [
        ("Bahas sprint goal minggu ini 🎯", "Siap, fitur utama udah on-track! 🚀"),
        ("Whiteboard-nya rame banget 📊", "Banyak ide keren nih! 💡"),
        ("Sprint review jam berapa ya? 📋", "Setelah lunch break nanti 👍"),
        ("Desain arsitektur baru udah fix 📐", "Mantap, gass koding! ✨"),
    ],
    "pantry": [
        ("Seduh kopi arabika dulu ☕", "Bagi gulanya dong kak! 🍵"),
        ("Kulkas ada cemilan baru 🍩", "Wah mantap buat nemenin koding! 🎉"),
        ("Istirahat sejenak mata lelah 😴", "Yuk jalan santai dikit biar seger 🚶"),
    ],
    "hall": [
        ("Halo Kak! Semangat ya! 👋", "Halo juga! Gass koding! 🚀"),
        ("Mau ke pantry nih ☕", "Nitip kopi hangat dong! 🍵"),
        ("PR-nya udah di-approve ya 👍", "Mantap, siap deploy! ✨"),
        ("Ada ide fitur baru nih 💡", "Bahas di meeting nanti! 📋"),
        ("Bentar lagi jam makan siang 🍕", "Wah martabak enak nih! 🎉"),
    ],
}


# --------------------------------------------------------------------------------------
# Characters
# --------------------------------------------------------------------------------------
class Character:
    """Mirror of agents.js Character: kinematics, path following, idle behaviour."""

    def __init__(self, sim, cid, name, role, col=DOOR_COL, row=DOOR_ROW):
        self.sim = sim
        self.id = cid
        self.name = name
        self.role = role
        self.floor = 0
        self.col = float(col)
        self.row = float(row)
        self.target_floor = 0
        self.target_col = col
        self.target_row = row
        self.facing = "S"
        self.state = "idle"
        self.speed = 2.4
        self.vx = 0.0
        self.vy = 0.0
        self.ax = 0.0
        self.ay = 0.0
        self.friction = 0.82
        self.max_speed = 2.4
        self.accel = 16.0
        self.radius = 0.36
        self.bounce_timer = 0.0
        self.squash_x = 1.0
        self.squash_y = 1.0
        self.frame = "idle"
        self.anim_timer = 0.0
        self.walk_step = False
        self.path = []
        self.path_goal = None
        self.emote = None
        self.emote_timer = 0.0
        self.bubble = None
        self.bubble_timer = 0.0
        self.carried_item = None
        self.idle_action_timer = sim.rng.random() * 5 + 3
        self.assigned_slot = None
        self.pause_timer = 0.0
        self.social_cooldown = sim.rng.random() * 8 + 4
        self.work_cycle_timer = sim.rng.random() * 4 + 2
        self.work_cycle_mode = "type"
        self.home_room = None
        # Wall-corner watchdog: time spent without any actual movement.
        self._stuck_time = 0.0

    # ---- narrative helpers ----
    def _chat(self, who, role, text, icon, color):
        self.sim.chat(who, role, text, icon, color)

    def set_emote(self, icon, duration=3.0):
        self.emote = icon
        self.emote_timer = duration

    def set_bubble(self, text, duration=4.0):
        if not text:
            self.bubble = None
            return
        self.bubble = text[:31] + "…" if len(text) > 32 else text
        self.bubble_timer = duration

    def get_depth(self):
        return self.row * 100 + self.col * 0.1

    def navigate_to(self, dest_col, dest_row):
        self.target_col = dest_col
        self.target_row = dest_row
        self.path_goal = {"x": dest_col, "y": dest_row}

        sx, sy = _js_round(self.col), _js_round(self.row)
        gx, gy = _js_round(dest_col), _js_round(dest_row)
        if sx == gx and sy == gy:
            self.col, self.row = float(dest_col), float(dest_row)
            self.path = []
            self.state = "walk"
            self.on_arrived()
            return

        p = find_orthogonal_path({"x": sx, "y": sy}, {"x": gx, "y": gy}, self.sim.grid)
        if p and len(p) > 1:
            self.path = [dict(node) for node in p[1:]]
            if self.state != "reporting":
                self.state = "walk"
            return

        # No reachable route: never clip through walls, complete in place.
        self.path = []
        self.state = "work"
        self.on_arrived()

    def update(self, dt):
        self.anim_timer += dt
        if self.emote_timer > 0:
            self.emote_timer -= dt
            if self.emote_timer <= 0:
                self.emote = None
        if self.bubble_timer > 0:
            self.bubble_timer -= dt
            if self.bubble_timer <= 0:
                self.bubble = None
        self.update_movement(dt)

    def update_movement(self, dt):
        self.floor = self.target_floor = 0

        if self.pause_timer > 0:
            self.pause_timer -= dt
            self.vx *= 0.5
            self.vy *= 0.5
            self.squash_x = self.squash_y = 1.0
            self.frame = "idle"
            return

        # Destination changed while walking (routine switch, new tool, ...).
        if self.path_goal and (self.path_goal["x"] != self.target_col or self.path_goal["y"] != self.target_row):
            self.navigate_to(self.target_col, self.target_row)
            if not self.path:
                return

        if self.path:
            if self.state != "reporting":
                self.state = "walk"
            node = self.path[0]
            dx = node["x"] - self.col
            dy = node["y"] - self.row
            dist = math.hypot(dx, dy)

            if abs(dx) >= abs(dy):
                if abs(dx) > 0.001:
                    self.facing = "E" if dx > 0 else "W"
            elif abs(dy) > 0.001:
                self.facing = "S" if dy > 0 else "N"

            # Seek & arrive: decelerate near the waypoint instead of snapping.
            arrive_threshold = 0.5
            target_speed = (max(0.6, self.max_speed * (dist / arrive_threshold))
                            if dist < arrive_threshold else self.max_speed)
            desired_vx = (dx / (dist or 1)) * target_speed
            desired_vy = (dy / (dist or 1)) * target_speed
            self.ax = (desired_vx - self.vx) * self.accel
            self.ay = (desired_vy - self.vy) * self.accel
            self.vx += self.ax * dt
            self.vy += self.ay * dt
            drag = math.pow(self.friction, dt * 60)
            self.vx *= drag
            self.vy *= drag

            cur_speed = math.hypot(self.vx, self.vy)
            if cur_speed > self.max_speed:
                self.vx = (self.vx / cur_speed) * self.max_speed
                self.vy = (self.vy / cur_speed) * self.max_speed

            # Circle-vs-AABB wall sliding against the collision grid.
            # The probe uses the sign of the *movement*, not of the velocity:
            # when velocity is 0 the else-branch would probe the tile behind and
            # a resting character could block itself forever.
            step_col0, step_row0 = self.col, self.row
            next_col = self.col + self.vx * dt
            next_row = self.row + self.vy * dt
            step_x = next_col - self.col
            step_y = next_row - self.row
            if abs(step_x) > 1e-9:
                col_check = next_col + self.radius if step_x > 0 else next_col - self.radius
                if not is_walkable(col_check, self.row):
                    self.vx = 0.0
                    next_col = self.col
            if abs(step_y) > 1e-9:
                row_check = next_row + self.radius if step_y > 0 else next_row - self.radius
                if not is_walkable(self.col, row_check):
                    self.vy = 0.0
                    next_row = self.row
            self.col = next_col
            self.row = next_row

            # Stuck recovery. Waypoints sit on tile centres, so a character
            # approaching one side-on drives into the wall face and the collision
            # probe zeroes both velocity components. It then keeps a path and
            # state=walk while standing still forever (a dead-looking office).
            # When no real movement happens toward the waypoint, finish that
            # waypoint instead of nudging coordinates: snapping alone left the
            # body pressed against the same edge and it froze again immediately.
            moved_now = math.hypot(self.col - step_col0, self.row - step_row0)
            if is_walkable(node["x"], node["y"]) and moved_now < 1e-4:
                self._stuck_time += dt
                if self._stuck_time > 0.25:
                    self.col = float(node["x"])
                    self.row = float(node["y"])
                    self.vx = self.vy = 0.0
                    self._stuck_time = 0.0
                    self._advance_waypoint(node)
                    return
            else:
                self._stuck_time = 0.0

            self.bounce_timer += dt * 14
            phase = math.sin(self.bounce_timer)
            if phase > 0.6:
                self.squash_x, self.squash_y = 0.94, 1.08
            elif phase < -0.3:
                self.squash_x, self.squash_y = 1.08, 0.92
            else:
                self.squash_x = self.squash_y = 1.0

            if self.anim_timer > 0.15:
                self.anim_timer = 0
                self.walk_step = not self.walk_step
            self.frame = "walk" if self.walk_step else "idle"

            remaining = math.hypot(node["x"] - self.col, node["y"] - self.row)
            if remaining <= math.hypot(self.vx * dt, self.vy * dt) or remaining < 0.14:
                self.col = float(node["x"])
                self.row = float(node["y"])
                self._advance_waypoint(node)
            return

        # Destination set without navigate_to.
        if math.hypot(self.target_col - self.col, self.target_row - self.row) > 0.2:
            self.navigate_to(self.target_col, self.target_row)
            return

        self.vx *= 0.5
        self.vy *= 0.5
        if math.hypot(self.vx, self.vy) < 0.05:
            self.vx = self.vy = 0.0
            self.col = float(self.target_col)
            self.row = float(self.target_row)
        self.squash_x = self.squash_y = 1.0
        self.bounce_timer = 0.0
        if self.state == "walk":
            self.on_arrived()
        self.update_idle_state(dt)

    def _advance_waypoint(self, node):
        """Pop the reached waypoint and finish the walk when it was the last."""
        if self.path and self.path[0] == node:
            self.path.pop(0)
        else:
            while self.path and self.path[0]["x"] == node["x"] and self.path[0]["y"] == node["y"]:
                self.path.pop(0)
        if not self.path:
            self.vx = self.vy = 0.0
            self.squash_x = self.squash_y = 1.0
            if _js_round(self.target_col) == node["x"] and _js_round(self.target_row) == node["y"]:
                self.col = float(self.target_col)
                self.row = float(self.target_row)
            else:
                self.target_col = self.col
                self.target_row = self.row
            self.path_goal = {"x": self.target_col, "y": self.target_row}
            if self.state in ("walk", "reporting"):
                self.on_arrived()

    def on_arrived(self):
        self.state = "work"
        self.frame = "idle"
        if self.assigned_slot and self.assigned_slot.get("facing"):
            self.facing = self.assigned_slot["facing"]

    def update_idle_state(self, dt):
        rng = self.sim.rng
        if self.state == "work":
            self.work_cycle_timer -= dt
            if self.work_cycle_timer <= 0:
                roll = rng.random()
                if roll < 0.60:
                    self.work_cycle_mode = "type"
                    self.work_cycle_timer = rng.random() * 5 + 3
                elif roll < 0.85:
                    self.work_cycle_mode = "think"
                    self.work_cycle_timer = rng.random() * 3 + 2
                    if rng.random() < 0.4 and not self.bubble:
                        self.set_emote(rng.choice(["💡", "💭", "⚙️", "📝", "⚡"]), 2.5)
                else:
                    self.work_cycle_mode = "drink"
                    self.work_cycle_timer = rng.random() * 2.5 + 2
                    if rng.random() < 0.5 and not self.bubble:
                        self.set_emote("☕", 2.0)
            if self.work_cycle_mode == "type":
                self.frame = "type" if rng.random() > 0.5 else "idle"
            elif self.work_cycle_mode == "think":
                self.frame = "blink" if rng.random() > 0.8 else "idle"
            elif self.work_cycle_mode == "drink":
                self.frame = "drink"
            else:
                self.frame = "idle"
            return

        self.idle_action_timer -= dt
        if self.idle_action_timer <= 0:
            self.idle_action_timer = rng.random() * 6 + 4
            roll = rng.random()
            if roll < 0.2:
                self.frame = "blink"
            elif roll < 0.5 and not self.bubble:
                room_key = self.assigned_slot["roomId"] if self.assigned_slot else (
                    "boss" if self.id == "lami" else "pantry")
                chats = IDLE_CHATS.get(room_key) or IDLE_CHATS["pantry"]
                if chats and rng.random() < 0.35:
                    self.set_bubble(rng.choice(chats), 3.5)
            else:
                self.frame = "idle"

    # ---- serialisation ----
    def narrate(self):
        return self.id == "lami" or isinstance(self, ResidentAgent)

    def to_world(self):
        data = {
            "id": self.id,
            "col": round(self.col, 2),
            "row": round(self.row, 2),
            "facing": self.facing,
            "state": self.state,
            "frame": self.frame,
            "bubble": self.bubble,
            "emote": self.emote,
            "carry": self.carried_item,
            "pause": round(self.pause_timer, 2) > 0,
        }
        if self.assigned_slot:
            data["slot"] = dict(self.assigned_slot)
        if self.path:
            data["path"] = [dict(n) for n in self.path]
        if self.path_goal:
            data["goal"] = dict(self.path_goal)
        return data

    def state_snapshot(self):
        """Everything needed to resume the exact same walk after a restart."""
        return {
            "col": round(self.col, 3),
            "row": round(self.row, 3),
            "targetCol": self.target_col,
            "targetRow": self.target_row,
            "facing": self.facing,
            "state": self.state,
            "path": [dict(n) for n in self.path],
            "goal": dict(self.path_goal) if self.path_goal else None,
            "slot": dict(self.assigned_slot) if self.assigned_slot else None,
            "bubble": self.bubble,
            "emote": self.emote,
            "carry": self.carried_item,
            "ts": time.time(),
        }

    def restore(self, snap):
        self.col = float(snap.get("col", self.col))
        self.row = float(snap.get("row", self.row))
        self.target_col = snap.get("targetCol", self.target_col)
        self.target_row = snap.get("targetRow", self.target_row)
        self.facing = snap.get("facing", self.facing)
        self.state = snap.get("state", self.state)
        self.path = [dict(n) for n in (snap.get("path") or [])]
        goal = snap.get("goal")
        self.path_goal = dict(goal) if goal else {"x": self.target_col, "y": self.target_row}
        self.bubble = snap.get("bubble")
        self.emote = snap.get("emote")
        self.carried_item = snap.get("carry")


class ResidentAgent(Character):
    """Mirror of agents.js ResidentAgent: desk / routine state machine."""

    def __init__(self, sim, spec, index):
        slot = SLOTS[spec["room"]][spec["slot"]]
        super().__init__(sim, spec["id"], spec["name"], spec["role"], slot["x"], slot["y"])
        self.home_room = spec["room"]
        self.home_slot_index = spec["slot"]
        self.home_slot = slot
        self.assigned_slot = {"roomId": spec["room"], "index": spec["slot"],
                              "type": slot["type"], "facing": slot["facing"]}
        self.facing = slot["facing"]
        self.task = "Bekerja di Meja"
        self.current_tool = DEFAULT_TOOL_BY_ROOM.get(spec["room"], "task")
        self.routine_state = "desk"
        self.current_routine = None
        stagger = RESIDENT_STAGGER.get(spec["id"])
        self.routine_timer = (sim.rng.random() * stagger[1] + stagger[0]) if stagger else (sim.rng.random() * 12 + 8)
        self.activity_duration = 0.0

    def get_routines(self):
        return PERSONAL_ROUTINES.get(self.id) or ROOM_ROUTINES.get(self.home_room) or []

    def update(self, dt):
        super().update(dt)
        if self.routine_state == "desk":
            self.routine_timer -= dt
            if self.routine_timer <= 0:
                routines = self.get_routines()
                if routines:
                    self.start_routine(self.sim.rng.choice(routines))
                else:
                    self.routine_timer = self.sim.rng.random() * 15 + 10
        elif self.routine_state == "in_activity":
            self.activity_duration -= dt
            if self.activity_duration <= 0:
                self.return_to_desk()

    def update_idle_state(self, dt):
        if self.routine_state == "in_activity" and self.current_routine:
            rid = self.current_routine["id"]
            if rid in ("coffee_pantry", "coffee_break", "lounge_relax", "room-espresso", "room-sofa"):
                self.frame = "drink"
                return
            if rid in ("server_mini", "patrol_rack_a", "patrol_rack_b", "cables_patch",
                       "agenda_board", "room-mini-rig", "room-rack-a", "room-rack-c", "room-console"):
                self.frame = "type" if self.sim.rng.random() > 0.5 else "idle"
                return
            self.frame = "blink" if self.sim.rng.random() > 0.85 else "idle"
            return
        super().update_idle_state(dt)

    def start_routine(self, routine):
        self.current_routine = routine
        self.routine_state = "moving_to_activity"
        self.target_floor = 0
        self.target_col = routine["col"]
        self.target_row = routine["row"]
        self.task = routine["name"]
        # Routine chatter is ambience, not Hermes activity: bubble only, never chat.
        if routine.get("startBubble"):
            self.set_bubble(routine["startBubble"], 3.5)

    def return_to_desk(self):
        if self.current_routine and self.current_routine.get("leaveBubble"):
            self.set_bubble(self.current_routine["leaveBubble"], 2.8)
        self.routine_state = "returning_to_desk"
        self.target_floor = 0
        self.target_col = self.home_slot["x"]
        self.target_row = self.home_slot["y"]
        self.task = "Kembali ke Meja"

    def on_arrived(self):
        if self.routine_state == "moving_to_activity" and self.current_routine:
            r = self.current_routine
            self.routine_state = "in_activity"
            self.state = "work"
            self.frame = "idle"
            self.facing = r.get("facing") or "S"
            self.activity_duration = r.get("duration") or 7
            self.task = r.get("task") or r.get("name")
            if r.get("arriveBubble"):
                self.set_bubble(r["arriveBubble"], 3.8)
            if r.get("arriveEmote"):
                self.set_emote(r["arriveEmote"], 3.0)
            self.sim.apply_on_arrive(r.get("onArrive"))
            return

        if self.routine_state == "returning_to_desk":
            self.routine_state = "desk"
            self.current_routine = None
            self.state = "work"
            self.frame = "idle"
            self.facing = self.home_slot.get("facing") or "S"
            self.task = "Bekerja di Meja"
            self.current_tool = DEFAULT_TOOL_BY_ROOM.get(self.home_room, "task")
            self.routine_timer = self.sim.rng.random() * 16 + 14
            return

        super().on_arrived()

    def interrupt_for_work(self, tool, summary):
        self.current_tool = tool
        self.task = summary or f"Mengerjakan {tool}"
        self.set_bubble(f"{self.sim.icon_for_tool(tool)} {summary or tool}", 4.0)
        if self.routine_state != "desk":
            self.return_to_desk()
        else:
            self.state = "work"
            self.frame = "type"

    def finish_work(self, ok=True):
        self.frame = "idle"
        if ok:
            self.set_emote("✅", 2.5)
            self.set_bubble("Beres! 👍", 2.5)
        else:
            self.set_emote("💦", 2.5)
            self.set_bubble("Ada kendala... ⚠️", 2.5)
        self.routine_timer = self.sim.rng.random() * 8 + 6

    def to_world(self):
        data = super().to_world()
        data.update({
            "kind": "resident",
            "name": self.name,
            "role": self.role,
            "task": self.task,
            "routineId": self.current_routine["id"] if self.current_routine else None,
            "routineState": self.routine_state,
            "tool": self.current_tool,
        })
        return data

    def state_snapshot(self):
        data = super().state_snapshot()
        data.update({
            "routineState": self.routine_state,
            "routineId": self.current_routine["id"] if self.current_routine else None,
            "routineTimer": round(self.routine_timer, 3),
            "activityDuration": round(self.activity_duration, 3),
            "task": self.task,
            "tool": self.current_tool,
        })
        return data

    def restore(self, snap):
        super().restore(snap)
        self.routine_state = snap.get("routineState", "desk")
        rid = snap.get("routineId")
        self.current_routine = next((r for r in self.get_routines() if r["id"] == rid), None) if rid else None
        if self.routine_state != "desk" and self.current_routine is None:
            self.routine_state = "desk"
        self.routine_timer = float(snap.get("routineTimer", self.routine_timer))
        self.activity_duration = float(snap.get("activityDuration", 0.0))
        self.task = snap.get("task", self.task)
        self.current_tool = snap.get("tool", self.current_tool)


class Lami(Character):
    """Mirror of agents.js Lami: boss patrol routines."""

    def __init__(self, sim):
        super().__init__(sim, "lami", "Boss Lami", "CEO & Master AI", LAMI_SEAT["x"], LAMI_SEAT["y"])
        self.home_seat = LAMI_SEAT
        self.facing = LAMI_SEAT["facing"]
        self.task = "CEO & Master AI"
        self.current_tool = "delegate"
        self.routine_state = "desk"
        self.current_routine = None
        self.routine_timer = sim.rng.random() * 10 + 16
        self.activity_duration = 0.0

    def get_routines(self):
        return LAMI_ROUTINES

    def update(self, dt):
        super().update(dt)
        if self.routine_state == "desk":
            self.routine_timer -= dt
            if self.routine_timer <= 0:
                self.start_routine(self.sim.rng.choice(self.get_routines()))
        elif self.routine_state == "in_activity":
            self.activity_duration -= dt
            if self.activity_duration <= 0:
                self.return_to_desk()

    def update_idle_state(self, dt):
        if self.routine_state == "in_activity" and self.current_routine:
            rid = self.current_routine["id"]
            if rid in ("pantry_visit",):
                self.frame = "drink"
                return
            self.frame = "blink" if self.sim.rng.random() > 0.85 else "idle"
            return
        super().update_idle_state(dt)

    def start_routine(self, routine):
        self.current_routine = routine
        self.routine_state = "moving_to_activity"
        self.target_floor = 0
        self.target_col = routine["col"]
        self.target_row = routine["row"]
        self.task = routine["name"]
        if routine.get("startBubble"):
            self.set_bubble(routine["startBubble"], 3.5)

    def return_to_desk(self):
        if self.current_routine and self.current_routine.get("leaveBubble"):
            self.set_bubble(self.current_routine["leaveBubble"], 2.8)
        self.routine_state = "returning_to_desk"
        self.target_floor = 0
        self.target_col = self.home_seat["x"]
        self.target_row = self.home_seat["y"]
        self.task = "CEO & Master AI"

    def on_arrived(self):
        if self.routine_state == "moving_to_activity" and self.current_routine:
            r = self.current_routine
            self.routine_state = "in_activity"
            self.state = "work"
            self.frame = "idle"
            self.facing = r.get("facing") or "SW"
            self.activity_duration = r.get("duration") or 7
            self.task = r.get("task") or r.get("name")
            if r.get("arriveBubble"):
                self.set_bubble(r["arriveBubble"], 3.5)
            if r.get("arriveEmote"):
                self.set_emote(r["arriveEmote"], 3.0)
            self.sim.apply_on_arrive(r.get("onArrive"))
            return

        if self.routine_state == "returning_to_desk":
            self.routine_state = "desk"
            self.current_routine = None
            self.state = "work"
            self.facing = self.home_seat.get("facing") or "SW"
            self.task = "CEO & Master AI"
            self.routine_timer = self.sim.rng.random() * 18 + 18
            return

        super().on_arrived()

    def cheer(self):
        self.set_emote("🎉", 3.5)
        self.set_bubble("Kerja bagus! Mantap 👍", 3.0)
        self.frame = "happy"

    def panic(self):
        self.set_emote("💦", 3.0)
        self.set_bubble("Waduh, ada error! 💦", 3.0)
        self.frame = "blink"

    def think(self):
        self.set_emote("💡", 4.0)
        self.set_bubble("Bentar, lagi mikir ide... 💡", 3.0)
        if self.routine_state != "desk":
            self.return_to_desk()

    def to_world(self):
        data = super().to_world()
        data.update({
            "kind": "lami",
            "name": self.name,
            "role": self.role,
            "task": self.task,
            "routineId": self.current_routine["id"] if self.current_routine else None,
            "routineState": self.routine_state,
            "tool": self.current_tool,
        })
        return data

    # Same routine/desk state machine as a resident, but without a home slot.
    def state_snapshot(self):
        data = Character.state_snapshot(self)
        data.update({
            "routineState": self.routine_state,
            "routineId": self.current_routine["id"] if self.current_routine else None,
            "routineTimer": round(self.routine_timer, 3),
            "activityDuration": round(self.activity_duration, 3),
            "task": self.task,
            "tool": self.current_tool,
        })
        return data

    def restore(self, snap):
        Character.restore(self, snap)
        self.routine_state = snap.get("routineState", "desk")
        rid = snap.get("routineId")
        self.current_routine = next((r for r in self.get_routines() if r["id"] == rid), None) if rid else None
        if self.routine_state != "desk" and self.current_routine is None:
            self.routine_state = "desk"
        self.routine_timer = float(snap.get("routineTimer", self.routine_timer))
        self.activity_duration = float(snap.get("activityDuration", 0.0))
        self.task = snap.get("task", self.task)
        self.current_tool = snap.get("tool", self.current_tool)


class SubAgent(Character):
    """Mirror of agents.js SubAgent: walks in, works, reports, rests in the pantry."""

    def __init__(self, sim, cid, name, task, room):
        super().__init__(sim, cid, name, "Sub-Agent", DOOR_COL, DOOR_ROW)
        self.task = task or "Tugas Baru"
        self.room = room
        self.current_tool = None
        self.current_summary = ""
        self.state = "spawn"
        self.role = ROLE_BY_ROOM.get(room, "Specialist")
        self.reported = False
        self.report_office = True
        # "sub" for Hermes-delegated agents, "peer" for A2A sidecars. The
        # renderer draws them differently, so it must survive serialisation.
        self.kind = "sub"
        self.set_emote("✨", 2.5)
        self.set_bubble("Siap tugas baru! 💼", 3.0)

    def on_arrived(self):
        if self.state == "reporting":
            self.state = "report_done"
            self.carried_item = "paper"
            self.facing = "N"
            if self.sim.lami:
                self.sim.lami.cheer()
            self.report_office = False
            spot_room = "pantry"
            self.sim.assign_to_slot(self, spot_room)
            self.state = "walk"
            self.set_bubble("Istirahat dulu di pantry ☕", 3.0)
            self.navigate_to(self.target_col, self.target_row)
            return

        self.state = "work"
        self.frame = "idle"
        if self.assigned_slot and self.assigned_slot.get("facing"):
            self.facing = self.assigned_slot["facing"]
        if not self.bubble:
            self.set_bubble("Mulai kerja... ⚡", 2.5)

    def start_work(self, tool, summary):
        self.current_tool = tool
        self.current_summary = summary
        self.set_bubble(f"{self.sim.icon_for_tool(tool)} {summary}", 5.0)
        if self.state == "work":
            self.frame = "type"

    def end_work(self, ok):
        if ok:
            self.set_emote("✅", 2.0)
            self.set_bubble("Tugas beres! ✅", 2.5)
        else:
            self.set_emote("💦", 3.0)
            self.set_bubble("Maaf, ada kendala 💦", 3.0)
        self.current_tool = None

    def report_to_lami(self):
        self.carried_item = "paper"
        self.target_floor = 0
        self.state = "reporting"
        self.set_bubble("Lapor Boss, selesai! 📄", 4.0)
        spot = (SLOTS["boss"] and SLOTS["boss"][0]) or {"x": 11, "y": 8}
        self.report_office = True
        self.navigate_to(spot["x"], spot["y"])

    def to_world(self):
        data = super().to_world()
        data.update({
            "kind": getattr(self, "kind", "sub"),
            "name": self.name,
            "role": self.role,
            "task": self.task,
            "room": self.room,
            "tool": self.current_tool,
            "summary": self.current_summary,
        })
        return data

    def state_snapshot(self):
        data = super().state_snapshot()
        data.update({"task": self.task, "room": self.room,
                     "tool": self.current_tool, "summary": self.current_summary})
        return data

    def restore(self, snap):
        super().restore(snap)
        self.task = snap.get("task", self.task)
        self.room = snap.get("room", self.room)
        self.current_tool = snap.get("tool")
        self.current_summary = snap.get("summary", "")


class DeliveryRider(Character):
    """Mirror of agents.js DeliveryRider: enters, waits, leaves, despawns."""

    def __init__(self, sim):
        super().__init__(sim, "delivery-rider", "Bang Kurir", "Kurir Martabak", DOOR_COL, DOOR_ROW)
        self.speed = 2.4
        self.carried_item = "paper"
        self.target_floor = 0
        self.target_col = 70
        self.target_row = 32
        self.state = "walk"
        self.phase = "entering"
        self.wait_timer = 0.0
        self.set_bubble("Permisi, paket martabak hangat! 🍕", 3.0)
        self.set_emote("🛵", 2.5)

    def update(self, dt):
        super().update(dt)
        if self.phase == "delivering":
            self.wait_timer -= dt
            if self.wait_timer <= 0:
                self.phase = "leaving"
                self.carried_item = None
                self.target_floor = 0
                self.target_col = DOOR_COL
                self.target_row = DOOR_ROW
                self.set_bubble("Selamat menikmati semuanya! 👋", 3.0)

    def on_arrived(self):
        if self.phase == "entering":
            self.phase = "delivering"
            self.wait_timer = 4.0
            self.facing = "N"
            self.set_emote("🍕", 3.5)
            self.set_bubble("Martabak manis spesial siap di pantry! 🍕✨", 4.0)
            self.sim.pizza_timer = 25.0
            for c in self.sim.all_moving():
                if math.hypot(c.col - 70, c.row - 32) < 6:
                    c.set_bubble("Wah mantap, makasih bang! 🎉", 3.0)
                    c.set_emote("❤️", 2.5)
            return
        if self.phase == "leaving":
            self.sim.delivery_rider = None

    def to_world(self):
        data = super().to_world()
        data.update({"kind": "rider", "name": self.name, "role": self.role, "phase": self.phase})
        return data


class MochiCat:
    """Mirror of agents.js MochiCat: wanders the pantry lounge, meows."""

    def __init__(self, sim):
        self.sim = sim
        self.floor = 0
        self.col = 72.0
        self.row = 36.0
        self.target_col = 72
        self.target_row = 36
        self.facing = "W"
        self.state = "sit"
        self.timer = sim.rng.random() * 5 + 3
        self.meow_timer = sim.rng.random() * 16 + 10
        self.bubble = None
        self.bubble_timer = 0.0

    def set_bubble(self, text, duration=3.0):
        self.bubble = text
        self.bubble_timer = duration

    def get_depth(self):
        return self.row * 100 + self.col * 0.1

    def update(self, dt):
        rng = self.sim.rng
        self.timer -= dt
        if self.timer <= 0:
            self.timer = rng.random() * 6 + 3
            roll = rng.random()
            if roll < 0.45:
                self.state = "walk"
                self.target_col = 70 + rng.random() * 8
                self.target_row = 30 + rng.random() * 8
                self.facing = "E" if self.target_col > self.col else "W"
            elif roll < 0.8:
                self.state = "sit"
            else:
                self.state = "idle"

        self.meow_timer -= dt
        if self.meow_timer <= 0:
            self.meow_timer = rng.random() * 18 + 12
            someone_near = any(
                math.hypot(c.col - self.col, c.row - self.row) < 1.6 for c in self.sim.all_moving()
            )
            if someone_near:
                self.set_bubble(rng.choice(["Purrr... 🐾", "Ngeong! ✨", "Suka dielus 🐱", "Mau cemilan 🐟"]), 3.0)
            else:
                self.set_bubble(rng.choice(["Meong~ 🐾", "Purrr... 💤", "Mau ikan 🐟", "Ngeong! ✨"]), 3.0)

        if self.bubble_timer > 0:
            self.bubble_timer -= dt
            if self.bubble_timer <= 0:
                self.bubble = None

        if self.state == "walk":
            dc, dr = self.target_col - self.col, self.target_row - self.row
            dist = math.hypot(dc, dr)
            if dist <= 0.1:
                self.col, self.row = float(self.target_col), float(self.target_row)
                self.state = "sit"
            else:
                step = min(1.2 * dt, dist)
                self.col += (dc / dist) * step
                self.row += (dr / dist) * step

    def to_world(self):
        return {
            "id": "mochi", "col": round(self.col, 2), "row": round(self.row, 2),
            "facing": self.facing, "state": self.state, "bubble": self.bubble,
        }

    def state_snapshot(self):
        return {"col": round(self.col, 3), "row": round(self.row, 3),
                "targetCol": self.target_col, "targetRow": self.target_row,
                "state": self.state, "facing": self.facing, "ts": time.time()}

    def restore(self, snap):
        self.col = float(snap.get("col", self.col))
        self.row = float(snap.get("row", self.row))
        self.target_col = snap.get("targetCol", self.target_col)
        self.target_row = snap.get("targetRow", self.target_row)
        self.state = snap.get("state", self.state)
        self.facing = snap.get("facing", self.facing)


# --------------------------------------------------------------------------------------
# The simulation
# --------------------------------------------------------------------------------------
class Sim:
    """Owns the office world. `tick(dt)` advances it; `outbox` holds narration."""

    TICK_HZ = 10
    MAX_AGENTS = 64
    STALE_AFTER_S = 8 * 3600

    def __init__(self, seed=None, random_events=False):
        self.rng = random.Random(time.time() if seed is None else seed)
        # The office is a Hermes dashboard: invented events (martabak delivery,
        # power flicker, coffee restock, printer jam) are OFF unless explicitly
        # requested, so nothing on screen is fiction by default.
        self.random_events = bool(random_events)
        self.events_handled = 0
        self.roster_seen = {}
        self.grid = GRID
        self.lami = Lami(self)
        self.cat = MochiCat(self)
        self.residents = [ResidentAgent(self, spec, i) for i, spec in enumerate(RESIDENTS)]
        self.subagents = {}
        self.delivery_rider = None
        self.slot_occupancy = {room: [None] * len(slots) for room, slots in SLOTS.items()}
        for res in self.residents:
            slot = res.assigned_slot
            self.slot_occupancy[slot["roomId"]][slot["index"]] = res

        self.pizza_timer = 0.0
        self.flicker_timer = 0.0
        self.random_event_timer = 45.0 + self.rng.random() * 20
        self.time_sec = 0.0
        self.outbox = []
        self.gone = set()          # agent ids explicitly removed (agent_done / reap)
        self.t0 = time.time()

    # ---- narrative helpers -------------------------------------------------------
    # `from_hermes=True` marks text that traces back to a real Hermes event. Staff
    # ambience (routine chatter, social dialogues, random events) is not narrated
    # at all, because a dashboard must not invent activity.
    def chat(self, who, role, text, icon="💬", color="#555", from_hermes=False):
        if not text or not (from_hermes or self.random_events):
            return
        self.outbox.append({"type": "message", "agentId": who, "text": text,
                            "who": who, "role": role, "icon": icon, "color": color})

    def ticker(self, icon, text):
        if not text:
            return
        self.outbox.append({"type": "ticker", "icon": icon, "text": text})

    def banner(self, icon, title, desc):
        if not self.random_events:
            return
        self.outbox.append({"type": "event_banner", "icon": icon, "title": title, "desc": desc})

    def apply_on_arrive(self, hook):
        if hook == "lami-cheer" and self.lami:
            self.lami.cheer()
        elif hook == "lami-thanks" and self.lami:
            self.lami.set_bubble("Terima kasih Sekar! ✨", 3.0)
            self.lami.set_emote("❤️", 2.5)
        elif hook == "cat-purr":
            self.cat.set_bubble("Purrr... 🐾", 3.0)
        elif hook == "cat-meow":
            self.cat.set_bubble("Meong Boss! 🐾", 3.0)

    @staticmethod
    def icon_for_tool(tool):
        icons = [
            (re.compile(r"(search|google|web)", re.I), "🔎"),
            (re.compile(r"(browser|navigate|click|url)", re.I), "🌐"),
            (re.compile(r"(terminal|shell|bash|process)", re.I), "⌨️"),
            (re.compile(r"(write|patch|edit)", re.I), "✏️"),
            (re.compile(r"(read|file)", re.I), "📄"),
            (re.compile(r"(code|exec|python)", re.I), "🧪"),
            (re.compile(r"(image|vision)", re.I), "🖼️"),
            (re.compile(r"(speech|tts|audio)", re.I), "🔊"),
            (re.compile(r"(delegate)", re.I), "📣"),
            (re.compile(r"(todo|plan)", re.I), "📝"),
            (re.compile(r"(memory|skill)", re.I), "🧠"),
            (re.compile(r"(message|send)", re.I), "💬"),
            (re.compile(r"(cron|schedule)", re.I), "⏰"),
        ]
        if not tool:
            return "💼"
        for rx, icon in icons:
            if rx.search(str(tool)):
                return icon
        return "🛠️"

    def all_moving(self):
        return [self.lami, *self.residents, *self.subagents.values()]

    # ---- slot management ---------------------------------------------------------
    def assign_to_slot(self, char, room_id):
        slots = SLOTS.get(room_id)
        occ = self.slot_occupancy.get(room_id)
        if not slots or occ is None:
            return
        start = hash_string(char.id) % len(slots)
        idx = -1
        for i in range(len(slots)):
            candidate = (start + i) % len(slots)
            if occ[candidate] is None:
                idx = candidate
                break
        if idx == -1:
            idx = next((i for i, c in enumerate(occ) if c is None), None)
        if idx is None:
            idx = self.rng.randrange(len(slots))

        prev = char.assigned_slot
        if prev and prev.get("roomId") in self.slot_occupancy:
            prev_occ = self.slot_occupancy[prev["roomId"]]
            if 0 <= prev["index"] < len(prev_occ):
                prev_occ[prev["index"]] = None

        occ[idx] = char
        slot_def = slots[idx]
        char.assigned_slot = {"roomId": room_id, "index": idx,
                              "type": slot_def["type"], "facing": slot_def["facing"]}
        char.floor = char.target_floor = 0
        char.target_col = slot_def["x"]
        char.target_row = slot_def["y"]
        if slot_def.get("facing"):
            char.facing = slot_def["facing"]

    def free_slot(self, char):
        slot = getattr(char, "assigned_slot", None)
        if slot and slot.get("roomId") in self.slot_occupancy:
            occ = self.slot_occupancy[slot["roomId"]]
            if 0 <= slot["index"] < len(occ):
                occ[slot["index"]] = None
        char.assigned_slot = None

    # ---- Hermes events -----------------------------------------------------------
    def spawn_subagent(self, agent_id, name, task, tool):
        if agent_id in self.subagents:
            return self.subagents[agent_id]
        self.gone.discard(agent_id)
        room = room_for_tool(tool)
        agent = SubAgent(self, agent_id, name or agent_id, task, room)
        self.subagents[agent_id] = agent
        self.assign_to_slot(agent, room)

        floor_label = ROOMS.get(room, {}).get("label", room)
        self.ticker("✨", f"Karyawan baru: <b>{agent.name}</b> join ke <i>{floor_label}</i>")
        self.chat("Sistem", "Kantor",
                  f"✨ Karyawan baru <b>{agent.name}</b> bergabung ke divisi <i>{floor_label}</i>",
                  "✨", "#1f9d5c", from_hermes=True)
        if self.lami:
            self.lami.set_emote("📢", 2.0)
            self.lami.set_bubble(f"Tolong bantu: {task or 'tugas baru'} ya! 📋", 3.5)
        return agent

    def on_tool_start(self, agent_id, tool, summary):
        target_room = room_for_tool(tool)
        if agent_id == "lami":
            if self.lami:
                self.lami.think()
                self.lami.set_bubble(f"Lagi {summary or tool}... ⚡", 3.5)
            res = next((r for r in self.residents if r.home_room == target_room), None)
            if res:
                res.interrupt_for_work(tool, summary or tool)
            self.ticker("🛠️", f"Boss Lami: <i>{tool}</i> ({summary or 'jalan'})")
            return

        agent = self.subagents.get(agent_id)
        if not agent:
            agent = self.spawn_subagent(agent_id, None, summary, tool)
        if not agent.assigned_slot or agent.assigned_slot.get("roomId") != target_room:
            self.assign_to_slot(agent, target_room)
        agent.start_work(tool, summary or tool)
        self.ticker("⚡", f"<b>{agent.name}</b>: {self.icon_for_tool(tool)} {summary or tool}")
        self.chat(agent.name, agent.role or "Staff",
                  f"{self.icon_for_tool(tool)} Menjalankan: <code>{summary or tool}</code>",
                  self.icon_for_tool(tool), "#3498db", from_hermes=True)

    def on_tool_end(self, agent_id, tool, ok):
        if agent_id == "lami":
            target_room = room_for_tool(tool)
            res = next((r for r in self.residents if r.home_room == target_room), None)
            if res:
                res.finish_work(ok)
            return
        agent = self.subagents.get(agent_id)
        if agent:
            agent.end_work(ok)

    def on_agent_status(self, agent_id, status):
        if agent_id != "lami" or not self.lami:
            return
        if status == "thinking":
            self.lami.think()
        elif status == "happy":
            self.lami.cheer()
        elif status == "error":
            self.lami.panic()

    def on_agent_done(self, agent_id, ok):
        agent = self.subagents.get(agent_id)
        if not agent:
            return
        if ok:
            agent.report_to_lami()
            self.ticker("🎉", f"<b>{agent.name}</b> selesai tugas! Lapor ke Boss Lami.")
            self.chat(agent.name, agent.role or "Staff",
                      "Lapor Boss Lami, tugas telah selesai dengan baik! 🎉", "✅", "#2ecc71",
                      from_hermes=True)
        else:
            agent.set_emote("💦", 3.0)
            if self.lami:
                self.lami.panic()
            self.ticker("⚠️", f"<b>{agent.name}</b> ada kendala tugas.")

    # ---- roster reconciliation (server owns who is on the floor) ----------------
    def sync_roster(self, agents, peers=None):
        """Make the floor match the real roster: HUB.agents + online A2A peers.

        Idempotent by construction: the roster is compared against the characters
        that exist, so a duplicated or replayed event cannot spawn a second body,
        and an event that never arrived is still corrected on the next tick.
        """
        live = {}
        for a in (agents or []):
            if not isinstance(a, dict):
                continue
            aid = str(a.get("id") or a.get("agentId") or "").strip()
            if not aid or aid == "lami":
                continue
            live[aid] = a
        for p in (peers or []):
            if not isinstance(p, dict) or not p.get("online"):
                continue
            pid = str(p.get("id") or "").strip()
            if not pid:
                continue
            live.setdefault(f"peer-{pid}", {
                "id": f"peer-{pid}",
                "name": p.get("name") or pid,
                "task": (p.get("skills") or ["A2A peer"])[0] if isinstance(p.get("skills"), list) and p.get("skills") else "A2A peer",
                "tool": None,
                "status": "idle",
                "peer_room": p.get("room"),
                "kind": "peer",
            })

        # 1. Remove sub-agents that are no longer in the real roster.
        for aid, agent in list(self.subagents.items()):
            if aid in live:
                continue
            # A finished agent walks out on its own; only force-remove when its
            # report has already been staged, otherwise let despawn_finished().
            if not getattr(agent, "reported", False):
                agent.report_to_lami()
                agent.reported = True
                agent.done_at = time.time()

        # 2. Add or update the ones that are.
        for aid, info in live.items():
            tool = info.get("tool")
            room = info.get("peer_room") or room_for_tool(tool)
            agent = self.subagents.get(aid)
            if agent is None:
                agent = self.spawn_subagent(aid, info.get("name"), info.get("task"), tool)
                agent.kind = info.get("kind") or "sub"
            if info.get("name"):
                agent.name = str(info["name"])[:40]
            if info.get("task"):
                agent.task = str(info["task"])[:80]
            if info.get("tool"):
                agent.start_work(info["tool"], info.get("summary") or info["tool"])
            current_room = (agent.assigned_slot or {}).get("roomId")
            if current_room != room and not getattr(agent, "reported", False):
                self.assign_to_slot(agent, room)
                agent.navigate_to(agent.target_col, agent.target_row)

        self.roster_seen = live

    def handle_event(self, ev):
        """Feed one ingested Hermes event into the world."""
        if not isinstance(ev, dict):
            return
        t = ev.get("type")
        aid = ev.get("agentId") or "lami"
        self.events_handled += 1
        if t == "agent_spawn":
            if aid != "lami":
                self.spawn_subagent(aid, ev.get("name"), ev.get("task"), ev.get("tool"))
        elif t == "tool_start":
            self.on_tool_start(aid, ev.get("tool"), ev.get("summary"))
        elif t == "tool_end":
            self.on_tool_end(aid, ev.get("tool"), ev.get("ok") is not False)
        elif t == "agent_status":
            self.on_agent_status(aid, ev.get("status"))
        elif t == "agent_done":
            self.on_agent_done(aid, ev.get("ok") is not False)

    # ---- random office events (mirror of Office.triggerRandomEvent) --------------
    def trigger_random_event(self, kind=None):
        kinds = ["pizza", "flicker", "coffee", "printer"]
        chosen = kind or self.rng.choice(kinds)

        if chosen == "pizza":
            if not self.delivery_rider:
                self.delivery_rider = DeliveryRider(self)
                self.banner("🍕", "TRAKTIR MARTABAK!", "Bang Kurir tiba di Pantry membawa martabak manis!")
                self.chat("Bang Kurir", "Kurir",
                          "Halo Lami Corp! Paket martabak manis hangat sudah sampai di Pantry ya 🍕🛵",
                          "🛵", "#e67e22")
                if self.lami:
                    self.lami.cheer()

        elif chosen == "flicker":
            self.flicker_timer = 0.9
            self.banner("⚡", "LISTRIK KEDIP!", "Genset darurat aktif, sistem backup server 100% terjaga!")
            self.chat("Bima", "Admin Server",
                      "Tenang semua! UPS & genset otomatis aktif, server aman sentosa 🖥️⚡", "⚡", "#3498db")
            bima = next((r for r in self.residents if r.id == "res-bima"), None)
            if bima:
                bima.set_bubble("Genset aman, server lancar! ⚡", 3.5)
                bima.set_emote("⚡", 3.0)

        elif chosen == "coffee":
            self.banner("☕", "RESTOCK KOPI PANTRY!", "Biji kopi gayo baru diseduh, mesin espresso mengepul!")
            self.chat("Sekar", "Sekretaris",
                      "Teman-teman, kopi gayo baru diseduh di Pantry! Rehat bentar yuk ☕✨", "☕", "#9c27b0")
            sekar = next((r for r in self.residents if r.id == "res-sekar"), None)
            if sekar:
                sekar.set_emote("☕", 3.0)

        else:
            self.banner("📄", "PRINTER JAM!", "Kertas laporan tersangkut di ruang meeting, segera diperbaiki!")
            self.chat("Dodo", "Senior Coder",
                      "Bentar guys, printer macet lagi... Udah gue beresin dan bersihin ya 🖨️👍", "🖨️", "#2e7d32")
            dodo = next((r for r in self.residents if r.id == "res-dodo"), None)
            if dodo:
                dodo.set_bubble("Paper jam beres diperbaiki 👍", 3.5)
                dodo.set_emote("📄", 3.0)

    # ---- separation & socials (mirror of Office.update) --------------------------
    def separate(self, dt):
        """Keep bodies from overlapping without ever undoing their walk.

        Two characters who want to walk in opposite directions past each other
        used to push each other back by more than they advanced, so both stayed
        pinned in place forever (observed on staging: 17 of 19 frozen). The push
        is now capped well below a walking step, only applied to bodies heading
        into each other, and never moves anyone through a wall.
        """
        living = [c for c in self.all_moving() if c.state != "spawn"]
        min_sep = 0.72
        # A walking body advances ~0.1 tile per 0.1 s tick; keep the nudge far
        # smaller so separation can never out-run the walk itself.
        max_push = 0.02
        for i, c1 in enumerate(living):
            for c2 in living[i + 1:]:
                dx, dy = c2.col - c1.col, c2.row - c1.row
                dist = math.hypot(dx, dy)
                if not (0.001 < dist < min_sep):
                    continue
                # Closing speed: if they are already walking apart, leave them be.
                approach = ((c2.col - c1.col) * (c2.vx - c1.vx)
                            + (c2.row - c1.row) * (c2.vy - c1.vy))
                if approach > 0:
                    continue
                overlap = (min_sep - dist) * 0.5
                push = min(max_push, overlap * dt * 4.5)
                nx, ny = dx / dist, dy / dist
                self._nudge(c1, -nx * push, -ny * push)
                self._nudge(c2, nx * push, ny * push)

    @staticmethod
    def _nudge(char, dx, dy):
        """Move by a small offset, refusing to enter a solid tile."""
        if abs(dx) > 1e-9 and is_walkable(char.col + dx, char.row):
            char.col += dx
        if abs(dy) > 1e-9 and is_walkable(char.col, char.row + dy):
            char.row += dy

    def update_socials(self, dt):
        rng = self.rng
        people = [c for c in self.all_moving() if c.state != "spawn"]
        for a in people:
            if a.social_cooldown > 0:
                a.social_cooldown -= dt

        for i, a in enumerate(people):
            if a.social_cooldown > 0 or a.pause_timer > 0 or a.state == "reporting":
                continue
            for b in people[i + 1:]:
                if b.social_cooldown > 0 or b.pause_timer > 0 or b.state == "reporting":
                    continue
                if math.hypot(a.col - b.col, a.row - b.row) >= 2.2:
                    continue

                a.pause_timer = b.pause_timer = 1.0
                a.social_cooldown = 20.0 + rng.random() * 8
                b.social_cooldown = 20.0 + rng.random() * 8

                dx, dy = b.col - a.col, b.row - a.row
                if abs(dx) >= abs(dy):
                    a.facing = "E" if dx > 0 else "W"
                    b.facing = "W" if dx > 0 else "E"
                else:
                    a.facing = "S" if dy > 0 else "N"
                    b.facing = "N" if dy > 0 else "S"

                # Encounters still make people stop and turn to each other (that is
                # readable body language), but the office never invents dialogue:
                # only a neutral acknowledgement emote is shown.
                is_boss = a.id == "lami" or b.id == "lami"
                if is_boss:
                    boss, worker = (a, b) if a.id == "lami" else (b, a)
                    worker.set_emote("👑", 2.0)
                    boss.set_emote("🌟", 2.0)
                else:
                    a.set_emote(rng.choice(["👋", "🙂", "💬"]), 2.0)
                    b.set_emote(rng.choice(["🙂", "👋", "💬"]), 2.0)
                break

    # ---- lifecycle ---------------------------------------------------------------
    def despawn_finished(self):
        """Send home sub-agents that reached the pantry after reporting."""
        for aid, agent in list(self.subagents.items()):
            if agent.reported:
                continue
            slot = agent.assigned_slot or {}
            if slot.get("roomId") == "pantry" and not agent.path:
                agent.reported = True
                agent.done_at = time.time()

        for aid, agent in list(self.subagents.items()):
            done_at = getattr(agent, "done_at", None)
            if done_at and time.time() - done_at > 1.5:
                self.free_slot(agent)
                self.subagents.pop(aid, None)
                self.gone.add(aid)

    def tick(self, dt):
        """Advance the world by dt seconds. Pops the narration outbox first."""
        dt = max(0.0, min(float(dt), 0.25))
        self.time_sec += dt

        if self.pizza_timer > 0:
            self.pizza_timer -= dt
        if self.flicker_timer > 0:
            self.flicker_timer -= dt

        if self.random_events:
            self.random_event_timer -= dt
            if self.random_event_timer <= 0:
                self.random_event_timer = 50.0 + self.rng.random() * 30
                self.trigger_random_event()

        if self.delivery_rider:
            self.delivery_rider.update(dt)

        self.lami.update(dt)
        self.cat.update(dt)
        for res in self.residents:
            res.update(dt)
        for agent in list(self.subagents.values()):
            agent.update(dt)

        self.separate(dt)
        self.update_socials(dt)
        self.despawn_finished()

    # ---- output ------------------------------------------------------------------
    def world_frame(self, status=None):
        chars = [self.lami.to_world()]
        chars.extend(res.to_world() for res in self.residents)
        chars.extend(agent.to_world() for agent in self.subagents.values())
        frame = {
            "type": "world",
            "t": round(time.time(), 3),
            "seq": round(self.time_sec, 3),
            "chars": chars,
            "cat": self.cat.to_world(),
            "roster": {
                "source": "hub",
                "agents": [
                    {
                        "id": aid,
                        "name": info.get("name") or aid,
                        "task": info.get("task") or "",
                        "tool": info.get("tool"),
                        "summary": info.get("summary") or "",
                        "status": info.get("status") or "working",
                        "kind": info.get("kind") or "sub",
                        "room": (self.subagents[aid].assigned_slot or {}).get("roomId")
                        if aid in self.subagents else None,
                    }
                    for aid, info in self.roster_seen.items()
                ],
            },
        }
        if status:
            frame["status"] = status
        if self.delivery_rider:
            frame["rider"] = self.delivery_rider.to_world()
        return frame

    def flags(self):
        return {
            "pizzaTimer": round(self.pizza_timer, 2),
            "flickerTimer": round(self.flicker_timer, 2),
            "chars": len(self.all_moving()),
        }

    def drain_outbox(self):
        events, self.outbox = self.outbox, []
        return events

    # ---- persistence -------------------------------------------------------------
    def state_snapshot(self):
        return {
            "ts": time.time(),
            "lami": self.lami.state_snapshot(),
            "residents": {r.id: r.state_snapshot() for r in self.residents},
            "cat": self.cat.state_snapshot(),
            "subagents": {aid: a.state_snapshot() for aid, a in self.subagents.items()},
            "pizzaTimer": round(self.pizza_timer, 2),
            "randomEventTimer": round(self.random_event_timer, 2),
        }

    def restore(self, snap):
        """Resume the world from a saved snapshot (server restart)."""
        if not isinstance(snap, dict):
            return
        cutoff = time.time() - self.STALE_AFTER_S
        fresh = float(snap.get("ts") or 0) >= cutoff

        if fresh:
            self._restore_char(self.lami, snap.get("lami"))
            for res in self.residents:
                self._restore_char(res, (snap.get("residents") or {}).get(res.id))
            self._restore_char(self.cat, snap.get("cat"))

        self.pizza_timer = float(snap.get("pizzaTimer") or 0.0)
        self.random_event_timer = float(snap.get("randomEventTimer") or 45.0)

        if not fresh:
            return
        for aid, data in (snap.get("subagents") or {}).items():
            if len(self.subagents) >= self.MAX_AGENTS:
                break
            room = data.get("room") or DEFAULT_ROOM
            agent = SubAgent(self, aid, aid, data.get("task"), room)
            agent.restore(data)
            self.subagents[aid] = agent
            slot = data.get("slot")
            if slot and slot.get("roomId") in self.slot_occupancy:
                occ = self.slot_occupancy[slot["roomId"]]
                if 0 <= slot["index"] < len(occ) and occ[slot["index"]] is None:
                    occ[slot["index"]] = agent
                    agent.assigned_slot = dict(slot)
            else:
                self.assign_to_slot(agent, room)

    @staticmethod
    def _restore_char(char, data):
        if not isinstance(data, dict):
            return
        if data.get("col") is None or data.get("row") is None:
            return
        # A saved tile may have become solid (furniture/config change): snap it
        # to the closest walkable tile instead of leaving someone inside a desk.
        if not is_walkable(data["col"], data["row"]):
            spot = nearest_walkable(data["col"], data["row"], GRID)
            if not spot:
                return
            data = dict(data, col=float(spot["x"]), row=float(spot["y"]))
        if data.get("path"):
            data["path"] = [n for n in data["path"]
                            if isinstance(n, dict) and is_walkable(n.get("x", -1), n.get("y", -1))]
        char.restore(data)


SIM = Sim()
