/* Lami's AI Office — Isometric 2.5D Configuration & Geometry (Happy Mall Story Style) */
(function () {
  const LO = (window.LO = window.LO || {});

  // ---- Isometric Projection Geometry (2:1 classic isometric ratio) ----
  LO.ISO_TILE_W = 26;   // tile width in pixels
  LO.ISO_TILE_H = 13;   // tile height in pixels (2:1 ratio)
  LO.GRID_COLS = 8;     // col axis goes Down-Right (SE)
  LO.GRID_ROWS = 5;     // row axis goes Down-Left (SW)
  LO.FLOOR_DY = 82;     // vertical distance between stacked floors (spacious, no overlap)
  LO.ROOF_OFFSET = 60;  // top margin for roof banner & sky (leaves room for HUD & sign)
  LO.NF = 6;            // number of floors

  LO.CONTENT_W = 380;
  LO.CONTENT_H = LO.ROOF_OFFSET + (LO.NF - 1) * LO.FLOOR_DY + (LO.GRID_COLS + LO.GRID_ROWS) * (LO.ISO_TILE_H / 2) + 90;

  // Center X for isometric origin
  LO.ORIGIN_X = 190;

  // Calculate Screen (X, Y) from Isometric (col, row, floor)
  LO.isoToScreen = function (col, row, floor) {
    const ox = LO.ORIGIN_X;
    const oy = LO.ROOF_OFFSET + floor * LO.FLOOR_DY;
    const sx = ox + (col - row) * (LO.ISO_TILE_W / 2);
    const sy = oy + (col + row) * (LO.ISO_TILE_H / 2);
    return { x: sx, y: sy };
  };

  // Convert Screen (X, Y) to approximate Isometric (col, row) on a given floor
  LO.screenToIso = function (sx, sy, floor) {
    const ox = LO.ORIGIN_X;
    const oy = LO.ROOF_OFFSET + floor * LO.FLOOR_DY;
    const dx = sx - ox;
    const dy = sy - oy;
    const col = (dy / (LO.ISO_TILE_H / 2) + dx / (LO.ISO_TILE_W / 2)) / 2;
    const row = (dy / (LO.ISO_TILE_H / 2) - dx / (LO.ISO_TILE_W / 2)) / 2;
    return { col, row };
  };

  // ---- Floors (Top Floor to Basement) ----
  LO.FLOORS = [
    {
      id: 'boss',
      label: 'BOSS LAMI',
      short: 'R',
      icon: '👑',
      tile1: '#fff3db',
      tile2: '#fedfad',
      wallL: '#e2ba86',
      wallR: '#cfa26d',
      trim: '#ba854d'
    },
    {
      id: 'research',
      label: 'RESEARCH LAB',
      short: '4F',
      icon: '🔍',
      tile1: '#e4f3fd',
      tile2: '#cce6fa',
      wallL: '#9ac5e8',
      wallR: '#81b2da',
      trim: '#6197c3'
    },
    {
      id: 'coding',
      label: 'CODING ROOM',
      short: '3F',
      icon: '💻',
      tile1: '#e5faed',
      tile2: '#c9f3d7',
      wallL: '#8cd7a8',
      wallR: '#73c391',
      trim: '#4ca76d'
    },
    {
      id: 'meeting',
      label: 'MEETING ROOM',
      short: '2F',
      icon: '📋',
      tile1: '#ffece0',
      tile2: '#fed8c2',
      wallL: '#f0ad88',
      wallR: '#dd946b',
      trim: '#c47447'
    },
    {
      id: 'pantry',
      label: 'PANTRY & LOUNGE',
      short: '1F',
      icon: '☕',
      tile1: '#fff8d6',
      tile2: '#fef0b3',
      wallL: '#ebd07c',
      wallR: '#d8ba60',
      trim: '#bc9c3e'
    },
    {
      id: 'server',
      label: 'SERVER ROOM',
      short: 'B1',
      icon: '🖥️',
      tile1: '#ebe7fa',
      tile2: '#d8d1f5',
      wallL: '#aba1de',
      wallR: '#968acb',
      trim: '#7a6db3'
    },
  ];

  LO.FLOOR_INDEX = Object.fromEntries(LO.FLOORS.map((f, i) => [f.id, i]));
  LO.GROUND = LO.FLOOR_INDEX.pantry;

  // ---- Isometric Elevator Position (West Corner at col: 0, row: 3) ----
  LO.LIFT_COL = 0.5;
  LO.LIFT_ROW = 3.5;
  LO.LIFT_WAIT_COL = 1.6;
  LO.LIFT_WAIT_ROW = 3.2;

  // Entrance door on Ground Floor (Pantry) at East corner (col: 7, row: 1)
  LO.DOOR_COL = 6.8;
  LO.DOOR_ROW = 1.2;

  // ---- Isometric Desk & Stand Slots (col, row, type, facing: 'SE' | 'SW' | 'NE' | 'NW') ----
  LO.SLOTS = {
    boss: [
      { col: 3.5, row: 3.2, type: 'stand', facing: 'NE', report: true }, // visitor report spot
      { col: 2.2, row: 3.0, type: 'stand', facing: 'NE', report: true },
      { col: 5.5, row: 2.5, type: 'stand', facing: 'SW' }
    ],
    research: [
      { col: 2.5, row: 1.5, type: 'desk', facing: 'SE' },
      { col: 4.5, row: 1.5, type: 'desk', facing: 'SE' },
      { col: 6.0, row: 2.2, type: 'desk', facing: 'SW' },
      { col: 2.0, row: 3.0, type: 'stand', facing: 'NE' },
      { col: 5.0, row: 3.2, type: 'stand', facing: 'NW' }
    ],
    coding: [
      { col: 2.2, row: 1.6, type: 'desk', facing: 'SE' },
      { col: 4.2, row: 1.6, type: 'desk', facing: 'SE' },
      { col: 2.5, row: 3.2, type: 'desk', facing: 'SE' },
      { col: 4.8, row: 3.2, type: 'desk', facing: 'SE' },
      { col: 6.2, row: 2.0, type: 'stand', facing: 'SW' },
      { col: 6.0, row: 3.5, type: 'stand', facing: 'NW' }
    ],
    meeting: [
      { col: 3.0, row: 2.0, type: 'sit', facing: 'SE' },
      { col: 4.5, row: 2.0, type: 'sit', facing: 'SW' },
      { col: 3.0, row: 3.0, type: 'sit', facing: 'NE' },
      { col: 4.5, row: 3.0, type: 'sit', facing: 'NW' },
      { col: 6.0, row: 1.8, type: 'stand', facing: 'SW' },
      { col: 1.8, row: 2.2, type: 'stand', facing: 'SE' }
    ],
    pantry: [
      { col: 3.5, row: 2.0, type: 'sit', facing: 'SE' },  // sofa
      { col: 4.5, row: 2.0, type: 'sit', facing: 'SW' },
      { col: 2.0, row: 1.5, type: 'stand', facing: 'SE' }, // coffee bar
      { col: 5.5, row: 3.0, type: 'stand', facing: 'NW' },
      { col: 3.2, row: 3.5, type: 'stand', facing: 'NE' }
    ],
    server: [
      { col: 5.0, row: 3.0, type: 'desk', facing: 'NW' }, // terminal desk
      { col: 3.0, row: 2.2, type: 'stand', facing: 'SE' },
      { col: 4.5, row: 1.8, type: 'stand', facing: 'SW' },
      { col: 2.0, row: 3.2, type: 'stand', facing: 'NE' }
    ],
  };

  // Boss Lami's seat (behind desk facing visitor)
  LO.LAMI_SEAT = { col: 4.5, row: 2.2, floor: 0, facing: 'SW' };

  // ---- Tool -> Room Mapping ----
  LO.TOOL_ROOMS = [
    [/^(web_|browser|search$|google|fetch|read_url|crawl|scrape|youtube|arxiv)/i, 'research'],
    [/(search_web|web_search|web_extract|session_search|wiki)/i, 'research'],
    [/^(delegate|todo|plan|clarify|memory|skill|cron|send_message|schedule)/i, 'meeting'],
    [/(vision|image_gen|image|tts|text_to_speech|speech|llm|model|mixture|moa|inference|transcri)/i, 'server'],
    [/(terminal|process|shell|bash|exec|code|write|patch|edit|read_file|file|git|npm|python)/i, 'coding'],
  ];
  LO.DEFAULT_ROOM = 'coding';

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

  // ---- Resident Staff (Isometric 2.5D) ----
  LO.RESIDENTS = [
    { id: 'res-rina',  name: 'Rina',  role: 'Kepala Riset',   room: 'research', slot: 0, look: { hair: 5, skin: 0, cloth: 1, long: true, glasses: true } },
    { id: 'res-dodo',  name: 'Dodo',  role: 'Senior Coder',   room: 'coding',   slot: 0, look: { hair: 0, skin: 2, cloth: 2, long: false, glasses: false } },
    { id: 'res-sekar', name: 'Sekar', role: 'Sekretaris',     room: 'meeting',  slot: 0, look: { hair: 3, skin: 1, cloth: 0, long: true, glasses: false } },
    { id: 'res-bima',  name: 'Bima',  role: 'Admin Server',   room: 'server',   slot: 0, look: { hair: 1, skin: 3, cloth: 5, long: false, glasses: true } },
  ];

  LO.NAMES = ['Budi', 'Sari', 'Joko', 'Wulan', 'Tono', 'Putri', 'Agus', 'Mega', 'Rudi', 'Intan', 'Bayu', 'Dewi',
    'Fajar', 'Nina', 'Gilang', 'Ayu', 'Eko', 'Lala', 'Raka', 'Citra', 'Dimas', 'Tika', 'Yoga', 'Kiki'];
  LO.ROLE_BY_ROOM = { research: 'Researcher', coding: 'Coder', meeting: 'Planner', server: 'Ops', pantry: 'Santai', boss: 'Lapor Boss' };

  LO.params = new URLSearchParams(location.search);
})();
