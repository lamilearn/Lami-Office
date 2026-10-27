/* Lami's AI Office — 2D Top-Down / RPG Configuration & Geometry (Pokemon / Zelda GBA Style) */
(function () {
  const LO = (window.LO = window.LO || {});

  // ---- 2D Top-Down Orthogonal World Dimensions (16:9 Desktop Base) ----
  LO.TILE_SIZE = 16;   // 16x16 pixel tiles
  LO.GRID_COLS = 64;   // 64 tiles wide (1024 px)
  LO.GRID_ROWS = 36;   // 36 tiles high (576 px)
  LO.CONTENT_W = LO.GRID_COLS * LO.TILE_SIZE; // 1024 px
  LO.CONTENT_H = LO.GRID_ROWS * LO.TILE_SIZE; // 576 px

  // Backward-compatibility geometric aliases
  LO.ISO_TILE_W = LO.TILE_SIZE;
  LO.ISO_TILE_H = LO.TILE_SIZE;
  LO.FLOOR_DY = 0;
  LO.ROOF_OFFSET = 24;
  LO.ORIGIN_X = Math.floor(LO.CONTENT_W / 2);
  LO.NF = 6;

  // ---- 2D Orthogonal Grid Projection Math ----
  LO.tileToScreen = function (tileX, tileY) {
    return {
      x: tileX * LO.TILE_SIZE,
      y: tileY * LO.TILE_SIZE
    };
  };

  LO.screenToTile = function (screenX, screenY) {
    const tx = Math.floor(screenX / LO.TILE_SIZE);
    const ty = Math.floor(screenY / LO.TILE_SIZE);
    const clampedX = Math.max(0, Math.min(LO.GRID_COLS - 1, tx));
    const clampedY = Math.max(0, Math.min(LO.GRID_ROWS - 1, ty));
    return {
      tileX: clampedX,
      tileY: clampedY,
      col: clampedX,
      row: clampedY
    };
  };

  // Legacy isometric wrappers forwarding to 2D orthogonal grid math for zero breakage
  LO.isoToScreen = function (col, row, floor) {
    return LO.tileToScreen(col, row);
  };

  LO.screenToIso = function (sx, sy, floor) {
    const t = LO.screenToTile(sx, sy);
    return {
      col: t.col,
      row: t.row,
      tileX: t.tileX,
      tileY: t.tileY
    };
  };

  // ---- 2D Orthogonal Pathfinding (A* / Manhattan heuristic) ----
  // Returns the nearest walkable tile to (x, y) or null when none exists.
  LO.nearestWalkable = function (x, y, collisionGrid, maxRadius = 8) {
    if (!collisionGrid) return null;
    const rows = collisionGrid.length;
    const cols = collisionGrid[0].length;
    const cx = Math.round(x);
    const cy = Math.round(y);
    if (cx >= 0 && cx < cols && cy >= 0 && cy < rows && collisionGrid[cy][cx] === 0) {
      return { x: cx, y: cy };
    }
    for (let r = 1; r <= maxRadius; r++) {
      let best = null;
      let bestDist = Infinity;
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          if (collisionGrid[ny][nx] !== 0) continue;
          const d = Math.hypot(ox, oy);
          if (d < bestDist) { bestDist = d; best = { x: nx, y: ny }; }
        }
      }
      if (best) return best;
    }
    return null;
  };

  // Collapse collinear waypoints so a walk is a few straight runs instead of
  // one tiny hop per tile (prevents the "stuttering robot" look).
  LO.compressPath = function (path) {
    if (!path || path.length <= 2) return path;
    const out = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1];
      const b = path[i];
      const c = path[i + 1];
      const inDx = b.x - a.x, inDy = b.y - a.y;
      const outDx = c.x - b.x, outDy = c.y - b.y;
      if (inDx !== outDx || inDy !== outDy) out.push(b);
    }
    out.push(path[path.length - 1]);
    return out;
  };

  LO.findOrthogonalPath = function (start, goal, collisionGrid) {
    if (!collisionGrid) return null;
    const rows = collisionGrid.length;
    const cols = collisionGrid[0].length;

    // Snap both ends to the closest walkable tile (never path through a wall).
    const s = LO.nearestWalkable(start.x, start.y, collisionGrid);
    const g = LO.nearestWalkable(goal.x, goal.y, collisionGrid);
    if (!s || !g) return null;
    if (s.x === g.x && s.y === g.y) return [s];

    const DIRS = [
      { dx: 0, dy: -1 }, // N
      { dx: 0, dy: 1 },  // S
      { dx: 1, dy: 0 },  // E
      { dx: -1, dy: 0 }  // W
    ];
    const TURN_COST = 0.6; // strongly prefer long straight runs over stair-steps
    const stateKey = (x, y, d) => ((y * cols + x) * 5) + d; // 5th slot = start state
    const heur = (x, y) => Math.abs(x - g.x) + Math.abs(y - g.y);
    const total = rows * cols * 5;
    const gScore = new Float32Array(total).fill(Infinity);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);

    // dir 4 = "no previous direction" (start state)
    const startKey = stateKey(s.x, s.y, 4);
    gScore[startKey] = 0;
    const open = [{ x: s.x, y: s.y, d: 4, g: 0, f: heur(s.x, s.y), h: heur(s.x, s.y) }];

    while (open.length > 0) {
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[best].f ||
            (open[i].f === open[best].f && open[i].h < open[best].h)) best = i;
      }
      const cur = open.splice(best, 1)[0];
      const ck = stateKey(cur.x, cur.y, cur.d);
      if (closed[ck]) continue;
      closed[ck] = 1;

      if (cur.x === g.x && cur.y === g.y) {
        const path = [];
        let node = ck;
        while (node !== -1) {
          const cell = Math.floor(node / 5);
          path.push({ x: cell % cols, y: Math.floor(cell / cols) });
          node = cameFrom[node];
        }
        path.reverse();
        // Drop duplicate coordinates created by the direction dimension.
        const unique = path.filter((p, i) => i === 0 || p.x !== path[i - 1].x || p.y !== path[i - 1].y);
        return LO.compressPath(unique);
      }

      for (let d = 0; d < 4; d++) {
        const nx = cur.x + DIRS[d].dx;
        const ny = cur.y + DIRS[d].dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (collisionGrid[ny][nx] !== 0) continue;
        const nk = stateKey(nx, ny, d);
        if (closed[nk]) continue;
        const turn = (cur.d !== 4 && cur.d !== d) ? TURN_COST : 0;
        const tentative = cur.g + 1 + turn;
        if (tentative < gScore[nk]) {
          gScore[nk] = tentative;
          cameFrom[nk] = ck;
          const h = heur(nx, ny);
          open.push({ x: nx, y: ny, d, g: tentative, f: tentative + h, h });
        }
      }
    }

    return null;
  };

  // ---- Themed 2D Office Rooms (Contiguous Single Floorplan) ----
  LO.ROOMS = {
    boss: {
      id: 'boss',
      name: 'Boss Office',
      label: 'BOSS OFFICE',
      short: 'BOSS',
      icon: '👑',
      bounds: { x1: 2, y1: 2, x2: 19, y2: 14 },
      door: { x: 10, y: 14 },
      floor1: '#fcedd7',
      floor2: '#f7dfbe',
      wall: '#b5834f',
      wallDark: '#875824',
      trim: '#6a431a',
      carpet: { x1: 5, y1: 5, x2: 16, y2: 11, color: '#9333ea', border: '#c084fc' }
    },
    research: {
      id: 'research',
      name: 'Research Lab',
      label: 'RESEARCH LAB',
      short: 'LAB',
      icon: '🔍',
      bounds: { x1: 21, y1: 2, x2: 39, y2: 14 },
      door: { x: 30, y: 14 },
      floor1: '#e1f0fc',
      floor2: '#cee4f8',
      wall: '#609ac5',
      wallDark: '#3c729c',
      trim: '#285577'
    },
    server: {
      id: 'server',
      name: 'Server Room',
      label: 'SERVER ROOM',
      short: 'SRV',
      icon: '🖥️',
      bounds: { x1: 41, y1: 2, x2: 58, y2: 14 },
      door: { x: 49, y: 14 },
      floor1: '#262238',
      floor2: '#1d192c',
      wall: '#5c5478',
      wallDark: '#3f3856',
      trim: '#2c263e'
    },
    engineering: {
      id: 'engineering',
      name: 'Engineering Pit',
      label: 'ENGINEERING PIT',
      short: 'ENG',
      icon: '💻',
      bounds: { x1: 2, y1: 19, x2: 21, y2: 32 },
      door: { x: 11, y: 19 },
      floor1: '#e6f7ec',
      floor2: '#d1f0db',
      wall: '#4f9b6c',
      wallDark: '#2f6d46',
      trim: '#1e4b2e'
    },
    meeting: {
      id: 'meeting',
      name: 'Meeting Room',
      label: 'MEETING ROOM',
      short: 'MEET',
      icon: '📋',
      bounds: { x1: 23, y1: 19, x2: 39, y2: 32 },
      door: { x: 31, y: 19 },
      floor1: '#fff0e5',
      floor2: '#fde0cf',
      wall: '#b56d43',
      wallDark: '#884824',
      trim: '#623114'
    },
    pantry: {
      id: 'pantry',
      name: 'Pantry / Lounge',
      label: 'PANTRY & LOUNGE',
      short: 'LOUNGE',
      icon: '☕',
      bounds: { x1: 41, y1: 19, x2: 58, y2: 32 },
      door: { x: 49, y: 19 },
      floor1: '#fff9d6',
      floor2: '#fef1b8',
      wall: '#b89d3b',
      wallDark: '#877020',
      trim: '#614f11'
    }
  };

  // Backward compatibility alias: coding -> engineering
  LO.ROOMS.coding = LO.ROOMS.engineering;

  // Central Hallway & Main Entrance
  LO.HALLWAY = {
    bounds: { x1: 0, y1: 15, x2: 63, y2: 18 },
    floor1: '#f1f3f5',
    floor2: '#e9ecef',
    wall: '#868e96'
  };
  LO.ENTRANCE = { x: 1, y: 16, facing: 'E' };
  LO.DOOR_COL = 1;
  LO.DOOR_ROW = 16;
  LO.LIFT_COL = 0;
  LO.LIFT_ROW = 16;
  LO.LIFT_WAIT_COL = 1;
  LO.LIFT_WAIT_ROW = 16;

  // Legacy Floors array & index for backward compatibility with UI/HUD
  LO.FLOORS = [
    LO.ROOMS.boss,
    LO.ROOMS.research,
    LO.ROOMS.engineering,
    LO.ROOMS.meeting,
    LO.ROOMS.pantry,
    LO.ROOMS.server
  ];

  LO.FLOOR_INDEX = {
    boss: 0,
    research: 1,
    engineering: 2,
    coding: 2,
    meeting: 3,
    pantry: 4,
    server: 5
  };
  LO.GROUND = 4; // Pantry / Lounge floor index

  // ---- 2D Workstation & Activity Slots (x, y, col, row, type, facing) ----
  // Facing: 'S' (Down/Front) | 'N' (Up/Back) | 'E' (Right) | 'W' (Left)
  LO.SLOTS = {
    boss: [
      { x: 11, y: 8,  col: 11, row: 8,  type: 'stand', facing: 'N', report: true }, // visitor report spot
      { x: 7,  y: 9,  col: 7,  row: 9,  type: 'sit',   facing: 'E' },                // guest chair left
      { x: 15, y: 9,  col: 15, row: 9,  type: 'sit',   facing: 'W' }                 // guest chair right
    ],
    research: [
      { x: 24, y: 8,  col: 24, row: 8,  type: 'desk',  facing: 'N' }, // Rina (Kepala Riset)
      { x: 29, y: 8,  col: 29, row: 8,  type: 'desk',  facing: 'N' }, // Researcher 2
      { x: 34, y: 8,  col: 34, row: 8,  type: 'desk',  facing: 'N' }, // Researcher 3
      { x: 25, y: 12, col: 25, row: 12, type: 'stand', facing: 'E' }, // Microscope inspection
      { x: 35, y: 12, col: 35, row: 12, type: 'stand', facing: 'W' }  // Research corkboard
    ],
    server: [
      { x: 48, y: 11, col: 48, row: 11, type: 'desk',  facing: 'N' }, // Bima (Admin Server)
      { x: 44, y: 6,  col: 44, row: 6,  type: 'stand', facing: 'N' }, // Rack cluster A
      { x: 48, y: 6,  col: 48, row: 6,  type: 'stand', facing: 'N' }, // Rack cluster B
      { x: 52, y: 6,  col: 52, row: 6,  type: 'stand', facing: 'N' }  // Rack cluster C
    ],
    engineering: [
      { x: 6,  y: 22, col: 6,  row: 22, type: 'desk',  facing: 'S' }, // Dodo (Senior Coder)
      { x: 10, y: 22, col: 10, row: 22, type: 'desk',  facing: 'S' }, // Developer 2
      { x: 6,  y: 26, col: 6,  row: 26, type: 'desk',  facing: 'S' }, // Developer 3
      { x: 10, y: 26, col: 10, row: 26, type: 'desk',  facing: 'S' }, // Developer 4
      { x: 15, y: 24, col: 15, row: 24, type: 'desk',  facing: 'S' }, // Developer 5
      { x: 19, y: 24, col: 19, row: 24, type: 'desk',  facing: 'S' }  // Developer 6
    ],
    meeting: [
      { x: 29, y: 23, col: 29, row: 23, type: 'sit',   facing: 'S' }, // Sekar (Sekretaris)
      { x: 31, y: 23, col: 31, row: 23, type: 'sit',   facing: 'S' }, // Attendee 2
      { x: 33, y: 23, col: 33, row: 23, type: 'sit',   facing: 'S' }, // Attendee 3
      { x: 29, y: 27, col: 29, row: 27, type: 'sit',   facing: 'N' }, // Attendee 4
      { x: 31, y: 27, col: 31, row: 27, type: 'sit',   facing: 'N' }, // Attendee 5
      { x: 33, y: 27, col: 33, row: 27, type: 'sit',   facing: 'N' }  // Attendee 6
    ],
    pantry: [
      { x: 44, y: 24, col: 44, row: 24, type: 'stand', facing: 'N' }, // Espresso / coffee bar
      { x: 47, y: 28, col: 47, row: 28, type: 'sit',   facing: 'S' }, // Teal sofa seat 1
      { x: 49, y: 28, col: 49, row: 28, type: 'sit',   facing: 'S' }, // Teal sofa seat 2
      { x: 51, y: 24, col: 51, row: 24, type: 'stand', facing: 'N' }, // Water cooler dispenser
      { x: 55, y: 28, col: 55, row: 28, type: 'stand', facing: 'W' }  // Snack vending machine
    ]
  };

  // Backward compatibility alias for coding slots
  LO.SLOTS.coding = LO.SLOTS.engineering;

  // Boss Lami's Seat (Behind executive desk in Boss Office, facing South towards visitor)
  LO.LAMI_SEAT = {
    x: 11,
    y: 5,
    col: 11,
    row: 5,
    floor: 0,
    facing: 'S'
  };

  // Interactive Props (2D World Coordinates)
  LO.PROPS = {
    trashcan: { id: 'trashcan', x: 14, y: 5, col: 14, row: 5, w: 1, h: 1, floor: 0, room: 'boss', name: 'Context Window Trashcan' },
    whiteboard: { id: 'whiteboard', x: 25, y: 19, col: 25, row: 19, w: 4, h: 2, floor: 3, room: 'meeting', name: 'Multi-Mode Whiteboard' },
    watercooler: { id: 'watercooler', x: 51, y: 23, col: 51, row: 23, w: 1, h: 1, floor: 4, room: 'pantry', name: 'Water Cooler Dispenser' }
  };
  LO.PROPS.waterCooler = LO.PROPS.watercooler;

  // ---- Tool -> Room Mapping ----
  LO.TOOL_ROOMS = [
    [/^(web_|browser|search$|google|fetch|read_url|crawl|scrape|youtube|arxiv)/i, 'research'],
    [/(search_web|web_search|web_extract|session_search|wiki)/i, 'research'],
    [/^(delegate|todo|plan|clarify|memory|skill|cron|send_message|schedule)/i, 'meeting'],
    [/(vision|image_gen|image|tts|text_to_speech|speech|llm|model|mixture|moa|inference|transcri)/i, 'server'],
    [/(terminal|process|shell|bash|exec|code|write|patch|edit|read_file|file|git|npm|python)/i, 'engineering'],
  ];
  LO.DEFAULT_ROOM = 'engineering';

  LO.TOOL_ICONS = [
    [/(search|google|web)/i, '🔎'], [/(browser|navigate|click|url)/i, '🌐'], [/(terminal|shell|bash|process)/i, '⌨️'],
    [/(write|patch|edit)/i, '✏️'], [/(read|file)/i, '📄'], [/(code|exec|python)/i, '🧪'], [/(image|vision)/i, '🖼️'],
    [/(speech|tts|audio)/i, '🔊'], [/(delegate)/i, '📣'], [/(todo|plan)/i, '📝'], [/(memory|skill)/i, '🧠'],
    [/(message|send)/i, '💬'], [/(cron|schedule)/i, '⏰'],
  ];

  LO.roomForTool = function (tool) {
    if (!tool) return LO.DEFAULT_ROOM;
    if (LO.toolRoomOverrides && LO.toolRoomOverrides[tool]) return LO.toolRoomOverrides[tool];
    for (const [rx, room] of LO.TOOL_ROOMS) if (rx.test(tool)) return room;
    return LO.DEFAULT_ROOM;
  };

  LO.iconForTool = function (tool) {
    if (!tool) return '💼';
    for (const [rx, icon] of LO.TOOL_ICONS) if (rx.test(tool)) return icon;
    return '🛠️';
  };

  // ---- Resident Staff (2D Top-Down Assignments) ----
  LO.RESIDENTS = [
    { id: 'res-rina',  name: 'Rina',  role: 'Kepala Riset',   room: 'research',    slot: 0, look: { hair: 5, skin: 0, cloth: 1, long: true, glasses: true } },
    { id: 'res-dodo',  name: 'Dodo',  role: 'Senior Coder',   room: 'engineering', slot: 0, look: { hair: 0, skin: 2, cloth: 2, long: false, glasses: false } },
    { id: 'res-sekar', name: 'Sekar', role: 'Sekretaris',     room: 'meeting',     slot: 0, look: { hair: 3, skin: 1, cloth: 0, long: true, glasses: false } },
    { id: 'res-bima',  name: 'Bima',  role: 'Admin Server',   room: 'server',      slot: 0, look: { hair: 1, skin: 3, cloth: 5, long: false, glasses: true } },
  ];

  LO.NAMES = ['Budi', 'Sari', 'Joko', 'Wulan', 'Tono', 'Putri', 'Agus', 'Mega', 'Rudi', 'Intan', 'Bayu', 'Dewi',
    'Fajar', 'Nina', 'Gilang', 'Ayu', 'Eko', 'Lala', 'Raka', 'Citra', 'Dimas', 'Tika', 'Yoga', 'Kiki'];
  LO.ROLE_BY_ROOM = { research: 'Researcher', engineering: 'Coder', coding: 'Coder', meeting: 'Planner', server: 'Ops', pantry: 'Santai', boss: 'Lapor Boss' };

  LO.params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
})();
