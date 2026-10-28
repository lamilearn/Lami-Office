/* Lami's AI Office — 2D Top-Down / RPG Configuration & Geometry (Pokemon / Zelda GBA Style) */
(function () {
  const LO = (window.LO = window.LO || {});

  // ---- 2D Top-Down Orthogonal World Dimensions (Desktop Base) ----
  LO.TILE_SIZE = 16;   // 16x16 pixel tiles
  LO.GRID_COLS = 88;   // 88 tiles wide (1408 px)
  LO.GRID_ROWS = 50;   // 50 tiles high (800 px)
  LO.CONTENT_W = LO.GRID_COLS * LO.TILE_SIZE; // 1408 px
  LO.CONTENT_H = LO.GRID_ROWS * LO.TILE_SIZE; // 800 px

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

  // ---- Themed 2D Office Rooms (Single Contiguous Floorplan / Architect Plan) ----
  // Bounds are the walkable INTERIOR. Rooms are sealed by shared partition
  // walls (1-2 tiles): vertical walls between side-by-side rooms and a wall row
  // above/below the central hallway, each pierced only by a 2-tile doorway.
  //   2x3 layout: top row boss | research | server over the central hallway,
  //   bottom row engineering | meeting | pantry beneath it.
  LO.ROOMS = {
    boss: {
      id: 'boss',
      name: 'Boss Office',
      label: 'BOSS OFFICE',
      short: 'BOSS',
      icon: '👑',
      bounds: { x1: 2, y1: 3, x2: 27, y2: 18 },
      door: { x: 14, y: 19, side: 'S' },
      floor1: '#fcedd7',
      floor2: '#f7dfbe',
      wall: '#b5834f',
      wallDark: '#875824',
      trim: '#6a431a',
      carpet: { x1: 5, y1: 6, x2: 24, y2: 15, color: '#9333ea', border: '#c084fc' }
    },
    research: {
      id: 'research',
      name: 'Research Lab',
      label: 'RESEARCH LAB',
      short: 'LAB',
      icon: '🔍',
      bounds: { x1: 30, y1: 3, x2: 55, y2: 18 },
      door: { x: 42, y: 19, side: 'S' },
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
      bounds: { x1: 58, y1: 3, x2: 83, y2: 18 },
      door: { x: 70, y: 19, side: 'S' },
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
      bounds: { x1: 2, y1: 24, x2: 27, y2: 39 },
      door: { x: 14, y: 23, side: 'N' },
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
      bounds: { x1: 30, y1: 24, x2: 55, y2: 39 },
      door: { x: 42, y: 23, side: 'N' },
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
      bounds: { x1: 58, y1: 24, x2: 83, y2: 39 },
      door: { x: 70, y: 23, side: 'N' },
      floor1: '#fff9d6',
      floor2: '#fef1b8',
      wall: '#b89d3b',
      wallDark: '#877020',
      trim: '#614f11'
    }
  };

  // Backward compatibility alias: coding -> engineering
  LO.ROOMS.coding = LO.ROOMS.engineering;

  // ---- Building Envelope (single floor slab, perimeter walls) ----
  LO.BUILDING = { x1: 1, y1: 2, x2: 84, y2: 40 };

  // ---- Central hallway: one band between the two room rows, with a west
  //      entrance stub that opens onto the street. ----
  LO.HALLWAY = {
    bounds: { x1: 2, y1: 20, x2: 83, y2: 22 },
    floor1: '#f1f3f5',
    floor2: '#e9ecef',
    wall: '#868e96'
  };
  LO.ENTRANCE_STUB = { x1: 1, y1: 21, x2: 2, y2: 21 };
  LO.HALLWAY_BANDS = [LO.HALLWAY.bounds, LO.ENTRANCE_STUB];

  LO.ENTRANCE = { x: 2, y: 21, facing: 'E' };
  LO.DOOR_COL = 2;
  LO.DOOR_ROW = 21;
  LO.LIFT_COL = 1;
  LO.LIFT_ROW = 21;
  LO.LIFT_WAIT_COL = 2;
  LO.LIFT_WAIT_ROW = 21;

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
      { x: 14, y: 9,  col: 14, row: 9,  type: 'stand', facing: 'N', report: true }, // visitor report spot
      { x: 8,  y: 11, col: 8,  row: 11, type: 'sit',   facing: 'E' },                // guest chair left
      { x: 20, y: 11, col: 20, row: 11, type: 'sit',   facing: 'W' }                 // guest chair right
    ],
    research: [
      { x: 34, y: 10, col: 34, row: 10, type: 'desk',  facing: 'N' }, // Rina (Kepala Riset)
      { x: 42, y: 10, col: 42, row: 10, type: 'desk',  facing: 'N' }, // Researcher 2
      { x: 50, y: 10, col: 50, row: 10, type: 'desk',  facing: 'N' }, // Researcher 3
      { x: 35, y: 15, col: 35, row: 15, type: 'stand', facing: 'E' }, // Microscope inspection
      { x: 52, y: 15, col: 52, row: 15, type: 'stand', facing: 'W' }  // Research corkboard
    ],
    server: [
      { x: 70, y: 15, col: 70, row: 15, type: 'desk',  facing: 'N' }, // Bima (Admin Server)
      { x: 64, y: 9,  col: 64, row: 9,  type: 'stand', facing: 'N' }, // Rack cluster A
      { x: 70, y: 9,  col: 70, row: 9,  type: 'stand', facing: 'N' }, // Rack cluster B
      { x: 76, y: 9,  col: 76, row: 9,  type: 'stand', facing: 'N' }  // Rack cluster C
    ],
    engineering: [
      { x: 7,  y: 28, col: 7,  row: 28, type: 'desk',  facing: 'N' }, // Dodo (Senior Coder)
      { x: 12, y: 28, col: 12, row: 28, type: 'desk',  facing: 'N' }, // Developer 2
      { x: 7,  y: 33, col: 7,  row: 33, type: 'desk',  facing: 'N' }, // Developer 3
      { x: 12, y: 33, col: 12, row: 33, type: 'desk',  facing: 'N' }, // Developer 4
      { x: 18, y: 31, col: 18, row: 31, type: 'desk',  facing: 'N' }, // Developer 5
      { x: 23, y: 31, col: 23, row: 31, type: 'desk',  facing: 'N' }  // Developer 6
    ],
    meeting: [
      { x: 41, y: 29, col: 41, row: 29, type: 'sit',   facing: 'S' }, // Sekar (Sekretaris)
      { x: 44, y: 29, col: 44, row: 29, type: 'sit',   facing: 'S' }, // Attendee 2
      { x: 47, y: 29, col: 47, row: 29, type: 'sit',   facing: 'S' }, // Attendee 3
      { x: 41, y: 33, col: 41, row: 33, type: 'sit',   facing: 'N' }, // Attendee 4
      { x: 44, y: 33, col: 44, row: 33, type: 'sit',   facing: 'N' }, // Attendee 5
      { x: 47, y: 33, col: 47, row: 33, type: 'sit',   facing: 'N' }  // Attendee 6
    ],
    pantry: [
      { x: 63, y: 28, col: 63, row: 28, type: 'stand', facing: 'N' }, // Espresso / coffee bar
      { x: 64, y: 34, col: 64, row: 34, type: 'sit',   facing: 'S' }, // Teal sofa seat 1
      { x: 66, y: 34, col: 66, row: 34, type: 'sit',   facing: 'S' }, // Teal sofa seat 2
      { x: 73, y: 29, col: 73, row: 29, type: 'stand', facing: 'N' }, // Water cooler dispenser
      { x: 77, y: 34, col: 77, row: 34, type: 'stand', facing: 'W' }  // Snack vending machine
    ]
  };

  // Backward compatibility alias for coding slots
  LO.SLOTS.coding = LO.SLOTS.engineering;

  // Boss Lami's Seat (behind executive desk in Boss Office, facing South)
  LO.LAMI_SEAT = {
    x: 14,
    y: 6,
    col: 14,
    row: 6,
    floor: 0,
    facing: 'S'
  };

  // Interactive Props (2D World Coordinates)
  LO.PROPS = {
    trashcan: { id: 'trashcan', x: 20, y: 6, col: 20, row: 6, w: 1, h: 1, floor: 0, room: 'boss', name: 'Context Window Trashcan' },
    whiteboard: { id: 'whiteboard', x: 32, y: 24, col: 32, row: 24, w: 5, h: 2, floor: 3, room: 'meeting', name: 'Multi-Mode Whiteboard' },
    watercooler: { id: 'watercooler', x: 74, y: 28, col: 74, row: 28, w: 1, h: 1, floor: 4, room: 'pantry', name: 'Water Cooler Dispenser' }
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
    // Research Lab
    { id: 'res-rina',   name: 'Rina',   role: 'Kepala Riset',      room: 'research',    slot: 0, look: { hair: 5, skin: 0, cloth: 1, long: true,  glasses: true } },
    { id: 'res-nadia',  name: 'Nadia',  role: 'Research Analyst',  room: 'research',    slot: 1, look: { hair: 2, skin: 1, cloth: 4, long: true,  glasses: false } },
    { id: 'res-yoga',   name: 'Yoga',   role: 'Data Scientist',    room: 'research',    slot: 2, look: { hair: 6, skin: 2, cloth: 3, long: false, glasses: true } },
    // Engineering Pit
    { id: 'res-dodo',   name: 'Dodo',   role: 'Senior Coder',      room: 'engineering', slot: 0, look: { hair: 0, skin: 2, cloth: 2, long: false, glasses: false } },
    { id: 'res-tono',   name: 'Tono',   role: 'Frontend Dev',      room: 'engineering', slot: 1, look: { hair: 3, skin: 0, cloth: 0, long: false, glasses: false } },
    { id: 'res-citra',  name: 'Citra',  role: 'Backend Dev',       room: 'engineering', slot: 2, look: { hair: 4, skin: 3, cloth: 5, long: true,  glasses: true } },
    // Meeting Room
    { id: 'res-sekar',  name: 'Sekar',  role: 'Sekretaris',        room: 'meeting',     slot: 0, look: { hair: 3, skin: 1, cloth: 0, long: true,  glasses: false } },
    { id: 'res-wulan',  name: 'Wulan',  role: 'Product Planner',   room: 'meeting',     slot: 1, look: { hair: 1, skin: 2, cloth: 1, long: true,  glasses: false } },
    { id: 'res-dimas',  name: 'Dimas',  role: 'Business Analyst',  room: 'meeting',     slot: 2, look: { hair: 7, skin: 0, cloth: 3, long: false, glasses: true } },
    // Server Room
    { id: 'res-bima',   name: 'Bima',   role: 'Admin Server',      room: 'server',      slot: 0, look: { hair: 1, skin: 3, cloth: 5, long: false, glasses: true } },
    { id: 'res-eko',    name: 'Eko',    role: 'DevOps Engineer',   room: 'server',      slot: 1, look: { hair: 0, skin: 1, cloth: 2, long: false, glasses: false } },
    { id: 'res-intan',  name: 'Intan',  role: 'Site Reliability',  room: 'server',      slot: 2, look: { hair: 6, skin: 2, cloth: 0, long: true,  glasses: true } },
    // Pantry / Lounge
    { id: 'res-kiki',   name: 'Kiki',   role: 'Office Manager',    room: 'pantry',      slot: 0, look: { hair: 2, skin: 3, cloth: 4, long: false, glasses: false } },
  ];

  // ---- Shared room routines (used by staff without a personal script) ----
  LO.ROOM_ROUTINES = {
    research: [
      { id: 'room-corkboard', name: 'Cek Papan Riset', floor: 0, col: 32, row: 6, facing: 'N', duration: 6,
        startBubble: 'Cek temuan tim di papan 📌', arriveBubble: 'Hipotesis baru tercatat rapi 💡', arriveEmote: '💡',
        leaveBubble: 'Lanjut olah data 📊', task: 'Review Papan Riset' },
      { id: 'room-window', name: 'Istirahat Mata', floor: 0, col: 54, row: 17, facing: 'E', duration: 6,
        startBubble: 'Lihat jendela sebentar 🌤️', arriveBubble: 'Mata seger, fokus lagi ✨', arriveEmote: '✨',
        leaveBubble: 'Balik ke meja riset 🔍', task: 'Istirahat Sejenak' },
      { id: 'room-reading', name: 'Baca Referensi', floor: 0, col: 32, row: 17, facing: 'W', duration: 7,
        startBubble: 'Buka jurnal referensi 📚', arriveBubble: 'Metode ini menarik! 🔍', arriveEmote: '📚',
        leaveBubble: 'Diskusi ke kepala riset 🤝', task: 'Membaca Jurnal' }
    ],
    engineering: [
      { id: 'room-mini-rig', name: 'Cek Build Runner', floor: 0, col: 20, row: 28, facing: 'N', duration: 6,
        startBubble: 'Cek build runner lokal ⚙️', arriveBubble: 'Build hijau, test pass ✅', arriveEmote: '⚙️',
        leaveBubble: 'Lanjut coding 💻', task: 'Inspeksi Build Runner' },
      { id: 'room-corner', name: 'Diskusi Arsitektur', floor: 0, col: 24, row: 37, facing: 'E', duration: 6,
        startBubble: 'Diskusi skema arsitektur 📐', arriveBubble: 'Desain baru lebih rapi ⚡', arriveEmote: '💡',
        leaveBubble: 'Implementasi sekarang 🚀', task: 'Diskusi Arsitektur' },
      { id: 'room-review', name: 'Code Review', floor: 0, col: 4, row: 31, facing: 'W', duration: 6,
        startBubble: 'Review PR teman 👀', arriveBubble: 'Kode bersih, approve! 👍', arriveEmote: '✅',
        leaveBubble: 'Balik ke terminal ⌨️', task: 'Code Review' }
    ],
    meeting: [
      { id: 'room-whiteboard', name: 'Update Whiteboard', floor: 0, col: 33, row: 26, facing: 'N', duration: 6,
        startBubble: 'Tulis agenda rapat 📝', arriveBubble: 'Agenda sinkron semua 🗓️', arriveEmote: '📋',
        leaveBubble: 'Rapikan notulensi ✨', task: 'Update Papan Agenda' },
      { id: 'room-podium', name: 'Presentasi Progres', floor: 0, col: 52, row: 31, facing: 'W', duration: 6,
        startBubble: 'Siapkan materi presentasi 📊', arriveBubble: 'Target kuartal on-track! 🎯', arriveEmote: '📢',
        leaveBubble: 'Sesi tanya jawab kelar 🤝', task: 'Presentasi Progres' },
      { id: 'room-corner', name: 'Ngobrol Tim', floor: 0, col: 53, row: 37, facing: 'E', duration: 6,
        startBubble: 'Ngobrol rencana minggu ini 💬', arriveBubble: 'Ide baru muncul! ✨', arriveEmote: '💡',
        leaveBubble: 'Balik ke meja rapat 📋', task: 'Diskusi Tim' }
    ],
    server: [
      { id: 'room-rack-a', name: 'Patroli Rack A', floor: 0, col: 64, row: 11, facing: 'N', duration: 6,
        startBubble: 'Patroli suhu Rack A ❄️', arriveBubble: 'Suhu 17°C, optimal 🟢', arriveEmote: '🖥️',
        leaveBubble: 'Cek Rack B 🚶', task: 'Inspeksi Rack A' },
      { id: 'room-rack-c', name: 'Patroli Rack C', floor: 0, col: 76, row: 11, facing: 'N', duration: 6,
        startBubble: 'Cek traffic Rack C ⚡', arriveBubble: 'Throughput 10 Gbps 🚀', arriveEmote: '⚡',
        leaveBubble: 'Jaringan prima 👍', task: 'Inspeksi Rack C' },
      { id: 'room-console', name: 'Cek Console', floor: 0, col: 61, row: 15, facing: 'W', duration: 6,
        startBubble: 'Buka ops console 🖥️', arriveBubble: 'Semua service sehat ✅', arriveEmote: '✅',
        leaveBubble: 'Balik ke terminal ⌨️', task: 'Monitoring Console' }
    ],
    pantry: [
      { id: 'room-espresso', name: 'Racik Kopi', floor: 0, col: 63, row: 30, facing: 'N', duration: 6,
        startBubble: 'Racik kopi buat tim ☕', arriveBubble: 'Espresso siap! ☕✨', arriveEmote: '☕',
        leaveBubble: 'Antar ke meja tim 🚶', task: 'Racik Kopi' },
      { id: 'room-sofa', name: 'Rapikan Lounge', floor: 0, col: 67, row: 36, facing: 'N', duration: 6,
        startBubble: 'Rapikan sofa lounge 🛋️', arriveBubble: 'Lounge nyaman lagi ✨', arriveEmote: '✨',
        leaveBubble: 'Cek snack stock 🍪', task: 'Rapikan Lounge' },
      { id: 'room-center', name: 'Sapa Tim', floor: 0, col: 76, row: 30, facing: 'W', duration: 6,
        startBubble: 'Sapa tim yang rehat 👋', arriveBubble: 'Semangat terus! 💪', arriveEmote: '❤️',
        leaveBubble: 'Balik ke pantry ☕', task: 'Sapa Tim' }
    ]
  };

  LO.NAMES = ['Budi', 'Sari', 'Joko', 'Wulan', 'Tono', 'Putri', 'Agus', 'Mega', 'Rudi', 'Intan', 'Bayu', 'Dewi',
    'Fajar', 'Nina', 'Gilang', 'Ayu', 'Eko', 'Lala', 'Raka', 'Citra', 'Dimas', 'Tika', 'Yoga', 'Kiki'];
  LO.ROLE_BY_ROOM = { research: 'Researcher', engineering: 'Coder', coding: 'Coder', meeting: 'Planner', server: 'Ops', pantry: 'Santai', boss: 'Lapor Boss' };

  // ---- Floorplan Helpers (single source of truth for walls, doors & rooms) ----
  // Walkable room interior as configured in LO.ROOMS.
  LO.roomInterior = function (roomId) {
    const room = LO.ROOMS[roomId];
    return room && room.bounds ? room.bounds : null;
  };

  // Returns the room whose configured interior contains the tile, or null.
  LO.roomAt = function (col, row) {
    for (const key of ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry']) {
      const b = LO.roomInterior(key);
      if (b && col >= b.x1 && col <= b.x2 && row >= b.y1 && row <= b.y2) return key;
    }
    return null;
  };

  // Hallway band (north / south / lobby) containing the tile, or null.
  LO.hallwayAt = function (col, row) {
    for (const band of LO.HALLWAY_BANDS) {
      if (band && col >= band.x1 && col <= band.x2 && row >= band.y1 && row <= band.y2) return band;
    }
    return null;
  };

  // Doorways as 2-tile openings anchored on the configured door tile.
  LO.doorways = function () {
    const out = [];
    for (const key of ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry']) {
      const room = LO.ROOMS[key];
      if (!room || !room.door) continue;
      out.push({
        room: key,
        x: room.door.x,
        y: room.door.y,
        width: 2,
        side: room.door.side || 'S',
        tiles: [
          { x: room.door.x, y: room.door.y },
          { x: room.door.x + 1, y: room.door.y }
        ]
      });
    }
    return out;
  };

  // A tile is walkable when it is inside a room interior, a hallway band or a doorway.
  LO.isFloorTile = function (col, row) {
    if (LO.roomAt(col, row)) return true;
    if (LO.hallwayAt(col, row)) return true;
    for (const d of LO.doorways()) {
      for (const t of d.tiles) if (t.x === col && t.y === row) return true;
    }
    return false;
  };

  // ---- Responsive Breakpoints & Phone Camera Mode ----
  // Phones (and touch-first devices) get a pan/zoom camera; desktop/tablet
  // stays fit-all. Detection is automatic: coarse pointer OR narrow viewport.
  LO.BREAKPOINTS = {
    phoneMaxWidth: 900,   // viewport width below which camera mode turns on
    compactMaxWidth: 768  // HUD/card compact layout
  };
  LO.PHONE_ZOOM_MIN = 0.6;   // relative to the base phone zoom
  LO.PHONE_ZOOM_MAX = 3.0;
  LO.PHONE_HEIGHT_FILL = 0.72; // portrait screens must fill ~72% of the height
  LO.CAMERA_LERP = 8;        // per-second easing toward the focus target
  LO.CAMERA_DEADZONE = 0.35; // tiles; ignore tiny focus shifts

  // True when the device should use the pan/zoom camera instead of fit-all.
  LO.isPhoneMode = function (env) {
    const scope = env || (typeof window !== 'undefined' ? window : null);
    if (!scope) return false;
    try {
      if (typeof scope.matchMedia === 'function' &&
          scope.matchMedia('(pointer: coarse)').matches) {
        return true;
      }
    } catch (e) { /* matchMedia unavailable */ }
    const width = scope.innerWidth || scope.innerWidth === 0 ? scope.innerWidth : (LO.CONTENT_W || 1408);
    return width < LO.BREAKPOINTS.phoneMaxWidth;
  };

  // Pure view-model math shared by the renderer, hit-testing and the tests.
  // Inputs are CSS pixels. Returns zoom plus the top-left content offset.
  LO.computeViewParams = function (args) {
    const w = Math.max(0, args.width || 0);
    const h = Math.max(0, args.height || 0);
    const contentW = args.contentW || LO.CONTENT_W;
    const contentH = args.contentH || LO.CONTENT_H;
    const inset = args.drawerInset || 0;

    if (w <= 0 || h <= 0) {
      return { zoom: 1, offsetX: 0, offsetY: 0, availW: w, availH: h, cameraMode: false };
    }

    const availW = Math.max(1, w - inset);
    const availH = h;

    if (args.cameraMode) {
      // Phone camera: never render the floorplan as a thin strip. Fill the width,
      // but on tall/portrait screens also guarantee a usable vertical fill.
      const fill = availW / contentW;
      const fillByHeight = (availH / contentH) * (LO.PHONE_HEIGHT_FILL || 0.72);
      const base = Math.max(fill, fillByHeight);
      const floor = base * (LO.PHONE_ZOOM_MIN || 0.6);
      const ceil = base * (LO.PHONE_ZOOM_MAX || 3);
      const zoom = Math.min(ceil, Math.max(floor, args.zoom || base));
      const focusX = (args.focusX || 0) * (LO.TILE_SIZE || 16);
      const focusY = (args.focusY || 0) * (LO.TILE_SIZE || 16);
      const visibleW = availW / zoom;
      const visibleH = availH / zoom;
      // Keep the camera inside the world; when the world is smaller than the
      // viewport on an axis, center it on that axis instead.
      const camX = contentW <= visibleW
        ? contentW / 2
        : Math.min(contentW - visibleW / 2, Math.max(visibleW / 2, focusX));
      const camY = contentH <= visibleH
        ? contentH / 2
        : Math.min(contentH - visibleH / 2, Math.max(visibleH / 2, focusY));
      const offsetX = Math.round((availW / 2) - camX * zoom);
      const offsetY = Math.round((availH / 2) - camY * zoom);
      return { zoom, offsetX, offsetY, availW, availH, cameraMode: true };
    }

    const zoom = Math.min(availW / contentW, availH / contentH);
    const offsetX = Math.floor((availW - contentW * zoom) / 2);
    const offsetY = Math.floor((availH - contentH * zoom) / 2);
    return { zoom, offsetX, offsetY, availW, availH, cameraMode: false };
  };

  // Classify a pointer sequence as a tap (select) or a drag (camera pan).
  LO.classifyPointerGesture = function (start, end, elapsedMs) {
    const maxDistance = LO.TAP_MAX_DISTANCE || 8;
    const maxDuration = LO.TAP_MAX_DURATION_MS || 300;
    if (!start || !end) return 'cancel';
    const dx = (end.x || 0) - (start.x || 0);
    const dy = (end.y || 0) - (start.y || 0);
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > maxDistance) return 'drag';
    if ((elapsedMs || 0) > maxDuration) return 'longpress';
    return 'tap';
  };
  LO.TAP_MAX_DISTANCE = 8;
  LO.TAP_MAX_DURATION_MS = 300;

  LO.params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
})();
