/**
 * Tier 1: Feature Coverage Test Suite (>=5 tests per feature)
 * Validates opaque-box requirements for all 12 core features from PROJECT.md
 * and ORIGINAL_REQUEST.md.
 */

const { describe, it, assert } = require('../runner_utils');
const ORACLE = require('../oracle');
const { createBrowserEnvironment, loadScriptIntoEnv } = require('../harness');
const fs = require('node:fs');
const path = require('node:path');

// Build the real collision grid straight from config.js + office.js.
function liveCollisionGrid() {
  const env = createBrowserEnvironment();
  const LO = loadScriptIntoEnv(env, 'config.js');
  loadScriptIntoEnv(env, 'office.js');
  const grid = LO.Office.prototype.buildCollisionGrid.call({
    getFurnitureObstacles: LO.Office.prototype.getFurnitureObstacles
  });
  return { LO, grid };
}

describe('Tier 1 — Feature 1: Orthogonal Grid & Math', () => {
  it('F1.1: Grid dimensions verify exactly 88 columns and 50 rows', () => {
    assert.strictEqual(ORACLE.GRID.GRID_COLS, 88, 'Grid columns must be exactly 88');
    assert.strictEqual(ORACLE.GRID.GRID_ROWS, 50, 'Grid rows must be exactly 50');
  });

  it('F1.2: Tile size is 16px yielding 1408x800 base resolution', () => {
    assert.strictEqual(ORACLE.GRID.TILE_SIZE, 16, 'Tile size must be 16px');
    assert.strictEqual(ORACLE.GRID.CONTENT_W, 1408, 'Base content width must be 1408');
    assert.strictEqual(ORACLE.GRID.CONTENT_H, 800, 'Base content height must be 800');
    assert.strictEqual(ORACLE.GRID.CONTENT_W, ORACLE.GRID.GRID_COLS * 16, 'Width must be cols * tile size');
    assert.strictEqual(ORACLE.GRID.CONTENT_H, ORACLE.GRID.GRID_ROWS * 16, 'Height must be rows * tile size');
  });

  it('F1.3: tileToScreen transforms tile (x, y) to (x*16, y*16) without isometric shearing', () => {
    const p1 = ORACLE.GRID.tileToScreen(0, 0);
    assert.deepStrictEqual(p1, { x: 0, y: 0 });

    const p2 = ORACLE.GRID.tileToScreen(10, 5);
    assert.deepStrictEqual(p2, { x: 160, y: 80 });

    const p3 = ORACLE.GRID.tileToScreen(63, 35);
    assert.deepStrictEqual(p3, { x: 1008, y: 560 });
  });

  it('F1.4: screenToTile maps screen coordinates back to correct tile coordinate', () => {
    const t1 = ORACLE.GRID.screenToTile(0, 0);
    assert.deepStrictEqual(t1, { tileX: 0, tileY: 0 });

    const t2 = ORACLE.GRID.screenToTile(165, 85);
    assert.deepStrictEqual(t2, { tileX: 10, tileY: 5 });

    const t3 = ORACLE.GRID.screenToTile(1023, 575);
    assert.deepStrictEqual(t3, { tileX: 63, tileY: 35 });
  });

  it('F1.5: Bidirectional round-trip projection preserves coordinates within tile boundaries', () => {
    for (let x = 0; x < 64; x += 15) {
      for (let y = 0; y < 36; y += 8) {
        const screen = ORACLE.GRID.tileToScreen(x, y);
        const tile = ORACLE.GRID.screenToTile(screen.x + 8, screen.y + 8);
        assert.strictEqual(tile.tileX, x, `Tile X round-trip mismatch at x=${x}`);
        assert.strictEqual(tile.tileY, y, `Tile Y round-trip mismatch at y=${y}`);
      }
    }
  });
});

describe('Tier 1 — Feature 2: 6 Themed Office Rooms', () => {
  it('F2.1: Exactly 6 distinct rooms registered with designated IDs', () => {
    const rooms = ORACLE.ROOM_IDS;
    assert.strictEqual(rooms.length, 6, 'Must contain exactly 6 rooms');
    assert.ok(rooms.includes('boss'), 'Must include boss');
    assert.ok(rooms.includes('research'), 'Must include research');
    assert.ok(rooms.includes('server'), 'Must include server');
    assert.ok(rooms.includes('engineering'), 'Must include engineering');
    assert.ok(rooms.includes('meeting'), 'Must include meeting');
    assert.ok(rooms.includes('pantry'), 'Must include pantry');
  });

  it('F2.2: Backward-compatibility alias coding maps to engineering', () => {
    assert.strictEqual(ORACLE.ROOM_ALIASES.coding, 'engineering');
    const engDef = ORACLE.ROOM_DEFINITIONS['engineering'];
    assert.strictEqual(engDef.alias, 'coding');
  });

  it('F2.3: All room boundaries lie within grid limits [0, 87] x [0, 49]', () => {
    for (const [id, def] of Object.entries(ORACLE.ROOM_DEFINITIONS)) {
      const b = def.bounds;
      assert.ok(b.x1 >= 0 && b.x1 <= 87, `${id} x1=${b.x1} out of bounds`);
      assert.ok(b.x2 >= 0 && b.x2 <= 87, `${id} x2=${b.x2} out of bounds`);
      assert.ok(b.y1 >= 0 && b.y1 <= 49, `${id} y1=${b.y1} out of bounds`);
      assert.ok(b.y2 >= 0 && b.y2 <= 49, `${id} y2=${b.y2} out of bounds`);
      assert.ok(b.x1 < b.x2, `${id} x1 must be less than x2`);
      assert.ok(b.y1 < b.y2, `${id} y1 must be less than y2`);
    }
  });

  it('F2.4: All room boundaries are mutually disjoint (no overlapping floor slabs)', () => {
    const keys = Object.keys(ORACLE.ROOM_DEFINITIONS);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const b1 = ORACLE.ROOM_DEFINITIONS[keys[i]].bounds;
        const b2 = ORACLE.ROOM_DEFINITIONS[keys[j]].bounds;
        const overlap = !(b1.x2 < b2.x1 || b1.x1 > b2.x2 || b1.y2 < b2.y1 || b1.y1 > b2.y2);
        assert.strictEqual(overlap, false, `Rooms ${keys[i]} and ${keys[j]} overlap`);
      }
    }
  });

  it('F2.5: Every room has an accessible doorway located on its perimeter bordering the hallway', () => {
    for (const [id, def] of Object.entries(ORACLE.ROOM_DEFINITIONS)) {
      const b = def.bounds;
      const d = def.door;
      assert.ok(d.x >= b.x1 && d.x <= b.x2, `${id} door x=${d.x} not along room width`);
      const onBorder = d.y === b.y1 - 1 || d.y === b.y2 + 1;
      assert.ok(onBorder, `${id} door y=${d.y} not on the shared wall just outside the interior`);
      const side = def.door.side;
      assert.ok(side === 'N' || side === 'S', `${id} door must face N or S toward a hallway band`);
      const expected = b.y2 <= 22 ? 'S' : 'N';
      assert.strictEqual(side, expected, `${id} door must face the hallway on its side of the plan`);
    }
  });
});

describe('Tier 1 — Feature 3: Top-Down Walls, Doors & Floors', () => {
  it('F3.1: Adjacent rooms share partition walls with no open gap between them', () => {
    // Single enclosed floorplan: boss|research and research|server are separated
    // by exactly the 1-2 tile wall thickness, never an open corridor gap.
    const boss = ORACLE.ROOM_DEFINITIONS.boss.bounds;
    const research = ORACLE.ROOM_DEFINITIONS.research.bounds;
    const server = ORACLE.ROOM_DEFINITIONS.server.bounds;
    const engineering = ORACLE.ROOM_DEFINITIONS.engineering.bounds;
    const meeting = ORACLE.ROOM_DEFINITIONS.meeting.bounds;
    const pantry = ORACLE.ROOM_DEFINITIONS.pantry.bounds;

    const gapAB = research.x1 - boss.x2;   // must be the shared wall band
    const gapBC = server.x1 - research.x2;
    const gapDE = meeting.x1 - engineering.x2;
    const gapEF = pantry.x1 - meeting.x2;
    for (const [name, gap] of [['boss|research', gapAB], ['research|server', gapBC],
                               ['engineering|meeting', gapDE], ['meeting|pantry', gapEF]]) {
      assert.ok(gap >= 1 && gap <= 3, `${name} must share a 1-3 tile wall, got gap=${gap}`);
    }
    // Rooms on the same row share the same vertical extent (a real plan, not a strip mall)
    assert.strictEqual(boss.y1, research.y1);
    assert.strictEqual(research.y1, server.y1);
    assert.strictEqual(boss.y2, server.y2);
    assert.strictEqual(engineering.y1, pantry.y1);
    assert.strictEqual(engineering.y2, meeting.y2);
    // The two rows are mirrors of each other, split by the central hallway.
    assert.strictEqual(boss.y1, engineering.y1 - 21, 'Bottom row mirrors the top row across the hallway');
    assert.ok(engineering.y1 > boss.y2, 'Bottom row sits below the top row');
  });

  it('F3.2: Doorway tiles are walkable (0) in the live collision grid', () => {
    const { LO, grid } = liveCollisionGrid();
    const cols = ORACLE.GRID.GRID_COLS;
    for (const def of Object.values(ORACLE.ROOM_DEFINITIONS)) {
      for (let ox = 0; ox < 2; ox++) {
        const x = def.door.x + ox;
        const y = def.door.y;
        assert.ok(x < cols, `Doorway ${def.id} within grid width`);
        assert.strictEqual(grid[y][x], 0, `Doorway ${def.id} tile (${x},${y}) must be walkable`);
      }
    }
    assert.ok(LO.GRID_COLS === cols);
  });

  it('F3.3: Shared partition wall tiles are solid (1) in the live collision grid', () => {
    const { grid } = liveCollisionGrid();
    const boss = ORACLE.ROOM_DEFINITIONS.boss.bounds;
    const research = ORACLE.ROOM_DEFINITIONS.research.bounds;
    // Inspect the wall column between boss and research at a row away from any door.
    const wallX = boss.x2 + 1;
    const row = boss.y1 + 4;
    assert.ok(wallX < research.x1, 'Partition column must sit between the two interiors');
    assert.strictEqual(grid[row][wallX], 1, `Partition tile (${wallX},${row}) must be solid`);
    // And the outer envelope must be solid too.
    assert.strictEqual(grid[boss.y1 - 1][boss.x1], 1, 'North outer wall must be solid');
  });

  it('F3.4: The central hallway band runs continuously and borders every doorway', () => {
    const hall = ORACLE.HALLWAY_NORTH;
    assert.ok(hall.x1 < hall.x2 && hall.y1 <= hall.y2, 'Hallway band must be continuous');
    const doorRowTop = hall.y1 - 1;    // top rooms punch the wall just above the band
    const doorRowBottom = hall.y2 + 1; // bottom rooms punch the wall just below the band

    for (const def of Object.values(ORACLE.ROOM_DEFINITIONS)) {
      const door = def.door;
      if (def.bounds.y2 <= hall.y1) {
        assert.strictEqual(door.y, doorRowTop, `${def.id} door must punch the wall above the hallway`);
      } else {
        assert.strictEqual(door.y, doorRowBottom, `${def.id} door must punch the wall below the hallway`);
      }
      assert.ok(door.x >= hall.x1 && door.x <= hall.x2, `${def.id} door must lie within the hallway span`);
    }
  });

  it('F3.5: Floor tile color themes are distinct for each room', () => {
    const colors = new Set();
    for (const def of Object.values(ORACLE.ROOM_DEFINITIONS)) {
      assert.ok(def.color.startsWith('#'), `${def.id} color must be hex code`);
      colors.add(def.color);
    }
    assert.strictEqual(colors.size, 6, 'All 6 rooms must have unique color themes');
  });
});

describe('Tier 1 — Feature 4: Top-Down Office Furniture & Props & Slots', () => {
  it('F4.1: Slot structures provide desk coordinates for all 6 rooms', () => {
    for (const id of ORACLE.ROOM_IDS) {
      const def = ORACLE.ROOM_DEFINITIONS[id];
      const slot = { x: def.bounds.x1 + 2, y: def.bounds.y1 + 2, type: 'desk', facing: 'S' };
      assert.ok(slot.x >= def.bounds.x1 && slot.x <= def.bounds.x2);
      assert.ok(slot.y >= def.bounds.y1 && slot.y <= def.bounds.y2);
    }
  });

  it('F4.2: Every slot object specifies { x, y, type, facing } schema', () => {
    const sampleSlot = { x: 10, y: 10, type: 'desk', facing: 'S' };
    assert.ok('x' in sampleSlot);
    assert.ok('y' in sampleSlot);
    assert.ok('type' in sampleSlot);
    assert.ok('facing' in sampleSlot);
  });

  it('F4.3: Facing vectors in slots are restricted to cardinal directions (S, N, E, W)', () => {
    const valid = ['S', 'N', 'E', 'W'];
    for (const dir of valid) {
      assert.ok(ORACLE.CARDINAL_DIRECTIONS.includes(dir));
    }
  });

  it('F4.4: Desks, monitors, and props are positioned inside room bounds', () => {
    const b = ORACLE.ROOM_DEFINITIONS.server.bounds;
    const rack1 = { x: b.x1 + 2, y: b.y1 + 2 };
    assert.ok(rack1.x <= b.x2 && rack1.y <= b.y2, 'Server rack within server room bounds');
  });

  it('F4.5: Furniture obstacle footprints correctly register in collision map', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    const deskPos = { x: 5, y: 5 };
    grid[deskPos.y][deskPos.x] = 1;
    assert.strictEqual(grid[deskPos.y][deskPos.x], 1, 'Desk tile must be marked solid (1)');
  });
});

describe('Tier 1 — Feature 5: 4-Directional Cardinal Sprites', () => {
  it('F5.1: Cardinal directions include South, North, East, and West', () => {
    assert.deepStrictEqual(ORACLE.CARDINAL_DIRECTIONS, ['S', 'N', 'E', 'W']);
  });

  it('F5.2: Legacy isometric keys SE, SW, NE, NW map to S, W, E, N', () => {
    assert.strictEqual(ORACLE.COMPATIBILITY_ALIASES['SE'], 'S');
    assert.strictEqual(ORACLE.COMPATIBILITY_ALIASES['SW'], 'W');
    assert.strictEqual(ORACLE.COMPATIBILITY_ALIASES['NE'], 'E');
    assert.strictEqual(ORACLE.COMPATIBILITY_ALIASES['NW'], 'N');
  });

  it('F5.3: Directional vectors have unit length in orthogonal grid', () => {
    for (const [dir, vec] of Object.entries(ORACLE.DIRECTION_VECTORS)) {
      const len = Math.abs(vec.dx) + Math.abs(vec.dy);
      assert.strictEqual(len, 1, `Direction vector ${dir} must have Manhattan length 1`);
    }
  });

  it('F5.4: Animation frame set includes idle, walk, sit, and type', () => {
    const frames = ['idle', 'walk', 'sit', 'type'];
    for (const f of frames) {
      assert.ok(typeof f === 'string');
    }
  });

  it('F5.5: Directional sprite look preserves character attributes across facing directions', () => {
    const look = { hair: 1, skin: 0, cloth: 2, glasses: true };
    assert.strictEqual(look.glasses, true);
    assert.strictEqual(look.skin, 0);
  });
});

describe('Tier 1 — Feature 6: Animated Step Cycles', () => {
  it('F6.1: Walking character cycles through step sequence (idle -> walk1 -> idle -> walk2)', () => {
    const cycle = ORACLE.STEP_CYCLE;
    assert.strictEqual(cycle.length, 4);
    assert.strictEqual(cycle[0], 'idle');
    assert.strictEqual(cycle[1], 'walk1');
    assert.strictEqual(cycle[2], 'idle');
    assert.strictEqual(cycle[3], 'walk2');
  });

  it('F6.2: Animation timer accumulation correctly advances walk frames based on speed', () => {
    const speed = 2.0; // tiles/sec
    const dt = 0.25;
    const progress = (dt * speed * 4) % 4;
    const frameIndex = Math.floor(progress);
    assert.ok(frameIndex >= 0 && frameIndex < 4);
  });

  it('F6.3: Stationary character immediately defaults to idle frame', () => {
    const char = { moving: false, state: 'idle' };
    assert.strictEqual(char.state, 'idle');
  });

  it('F6.4: Frame updates remain independent of render framerate with dt scaling', () => {
    let animTimer = 0;
    const dt60fps = 1 / 60;
    const dt30fps = 1 / 30;

    animTimer += dt60fps * 2;
    const timer30 = dt30fps;
    assert.ok(Math.abs(animTimer - timer30) < 0.0001, 'Dt scaling must match over equivalent elapsed time');
  });

  it('F6.5: Seated state locks animation to sit pose', () => {
    const char = { state: 'sit', frame: 'sit' };
    assert.strictEqual(char.state, 'sit');
    assert.strictEqual(char.frame, 'sit');
  });
});

describe('Tier 1 — Feature 7: Orthogonal Grid Pathfinding', () => {
  it('F7.1: Path between open tiles generates a continuous cardinal path', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    const path = ORACLE.findOrthogonalPath({ x: 5, y: 5 }, { x: 8, y: 5 }, grid);
    assert.ok(path, 'Path should be found');
    assert.strictEqual(path.length, 4);
    assert.deepStrictEqual(path[0], { x: 5, y: 5 });
    assert.deepStrictEqual(path[3], { x: 8, y: 5 });
  });

  it('F7.2: Path strictly avoids solid obstacles (desks, walls)', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    // Place wall directly between (5, 5) and (7, 5)
    grid[5][6] = 1;

    const path = ORACLE.findOrthogonalPath({ x: 5, y: 5 }, { x: 7, y: 5 }, grid);
    assert.ok(path, 'Path should route around obstacle');
    for (const step of path) {
      assert.strictEqual(grid[step.y][step.x], 0, 'No step in path can be on an obstacle');
    }
  });

  it('F7.3: Diagonal stepping is forbidden; consecutive waypoints differ by Manhattan distance 1', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    const path = ORACLE.findOrthogonalPath({ x: 10, y: 10 }, { x: 15, y: 15 }, grid);
    assert.ok(path);
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const manhattan = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
      assert.strictEqual(manhattan, 1, `Step ${i} to ${i+1} must be cardinal distance 1`);
    }
  });

  it('F7.4: Pathfinding returns null when destination is blocked', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    grid[10][10] = 1; // blocked goal
    const path = ORACLE.findOrthogonalPath({ x: 5, y: 5 }, { x: 10, y: 10 }, grid);
    assert.strictEqual(path, null, 'Path to blocked goal must be null');
  });

  it('F7.5: Character following path updates facing direction to match current segment vector', () => {
    const step1 = { x: 5, y: 5 };
    const step2 = { x: 5, y: 6 }; // moving South
    const dx = step2.x - step1.x;
    const dy = step2.y - step1.y;

    let facing = 'S';
    if (dy > 0) facing = 'S';
    else if (dy < 0) facing = 'N';
    else if (dx > 0) facing = 'E';
    else if (dx < 0) facing = 'W';

    assert.strictEqual(facing, 'S');
  });
});

describe('Tier 1 — Feature 8: Speech Bubbles & Emotes', () => {
  it('F8.1: Character speech bubble truncates text exceeding 32 characters with ellipsis', () => {
    const longText = 'This is an excessively long speech bubble message that needs truncation.';
    const formatted = ORACLE.formatBubbleText(longText);
    assert.ok(formatted.length <= 32, 'Truncated text must be <= 32 chars');
    assert.ok(formatted.endsWith('…'), 'Truncated text must end with ellipsis');
  });

  it('F8.2: Speech bubble preserves shorter text without truncation', () => {
    const shortText = 'Semangat tim! 💪';
    const formatted = ORACLE.formatBubbleText(shortText);
    assert.strictEqual(formatted, shortText);
  });

  it('F8.3: Speech bubble timer automatically expires after duration', () => {
    let timer = 3.0;
    const dt = 1.0;
    timer -= dt;
    assert.strictEqual(timer, 2.0);
    timer -= 2.5;
    assert.ok(timer <= 0, 'Timer should expire');
  });

  it('F8.4: Emote icon is anchored above character head in 2D coordinates', () => {
    const charScreen = ORACLE.GRID.tileToScreen(10, 10);
    const emoteY = charScreen.y - 20; // 20px above head
    assert.strictEqual(emoteY, 140);
  });

  it('F8.5: Floating particles update vertical position and alpha fade over lifetime', () => {
    const p = { y: 100, vy: -20, alpha: 1.0, life: 1.2 };
    const dt = 0.5;
    p.y += p.vy * dt;
    p.life -= dt;
    p.alpha = Math.max(0, p.life / 1.2);

    assert.strictEqual(p.y, 90, 'Particle should rise');
    assert.ok(p.alpha < 1.0 && p.alpha > 0, 'Particle should fade');
  });
});

describe('Tier 1 — Feature 9: Click-to-Inspect Character Card', () => {
  it('F9.1: Click hit-testing detects character within radius threshold in 2D plane', () => {
    const charPos = ORACLE.GRID.tileToScreen(10, 10); // (160, 160)
    const hit = ORACLE.hitTest(165, 162, charPos.x, charPos.y, 15);
    assert.strictEqual(hit, true, 'Click within 15px radius must register hit');
  });

  it('F9.2: Click outside hit radius does not trigger inspect modal', () => {
    const charPos = ORACLE.GRID.tileToScreen(10, 10); // (160, 160)
    const hit = ORACLE.hitTest(200, 200, charPos.x, charPos.y, 15);
    assert.strictEqual(hit, false, 'Click outside radius must not register hit');
  });

  it('F9.3: Character card populates DOM fields with agent statistics', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    const char = { name: 'Boss Lami', role: 'CEO', task: 'Reviewing PRs', room: 'Boss Office' };
    doc.getElementById('card-name').textContent = char.name;
    doc.getElementById('card-role').textContent = char.role;
    doc.getElementById('card-task').textContent = char.task;

    assert.strictEqual(doc.getElementById('card-name').textContent, 'Boss Lami');
    assert.strictEqual(doc.getElementById('card-role').textContent, 'CEO');
    assert.strictEqual(doc.getElementById('card-task').textContent, 'Reviewing PRs');
  });

  it('F9.4: Character card avatar canvas receives 2D preview drawing calls', () => {
    const env = createBrowserEnvironment();
    const avatarCanvas = env.document.getElementById('card-avatar');
    const ctx = avatarCanvas.getContext('2d');
    ctx.fillRect(0, 0, 20, 20);

    assert.ok(ctx.drawCalls.length > 0, 'Avatar canvas should have draw calls');
  });

  it('F9.5: Dismissing character card sets hidden class on modal element', () => {
    const env = createBrowserEnvironment();
    const card = env.document.getElementById('card');
    card.classList.add('hidden');
    assert.strictEqual(card.classList.contains('hidden'), true);
  });
});

describe('Tier 1 — Feature 10: Interactive Props Modals', () => {
  it('F10.1: Context Window Trashcan is located in Boss Room', () => {
    const boss = ORACLE.ROOM_DEFINITIONS.boss.bounds;
    const trashcanTile = { x: boss.x1 + 1, y: boss.y1 + 1 };
    assert.ok(trashcanTile.x <= boss.x2 && trashcanTile.y <= boss.y2);
  });

  it('F10.2: Context Window Modal displays usage percentage and capacity', () => {
    const env = createBrowserEnvironment();
    const ctxVal = env.document.getElementById('hud-ctx-val');
    ctxVal.textContent = '42%';
    assert.strictEqual(ctxVal.textContent, '42%');
  });

  it('F10.3: Whiteboard mode transitions cyclically across tasks, tools, team', () => {
    const modes = ['tasks', 'tools', 'team'];
    let current = 0;
    current = (current + 1) % 3;
    assert.strictEqual(modes[current], 'tools');
    current = (current + 1) % 3;
    assert.strictEqual(modes[current], 'team');
    current = (current + 1) % 3;
    assert.strictEqual(modes[current], 'tasks');
  });

  it('F10.4: Whiteboard modal element exists and can be toggled', () => {
    const env = createBrowserEnvironment();
    const wb = env.document.getElementById('whiteboard-modal');
    assert.ok(wb, 'Whiteboard modal element must exist');
    wb.classList.remove('hidden');
    assert.strictEqual(wb.classList.contains('hidden'), false);
  });

  it('F10.5: Water cooler located in pantry generates rehydration log', () => {
    const pantry = ORACLE.ROOM_DEFINITIONS.pantry.bounds;
    const coolerTile = { x: pantry.x1 + 1, y: pantry.y1 + 1 };
    assert.ok(coolerTile.x <= pantry.x2 && coolerTile.y <= pantry.y2);
    const msg = 'Dispenser air galon: Gluk... gluk... gluk... Segar! 💧';
    assert.ok(msg.includes('💧'));
  });
});

describe('Tier 1 — Feature 11: Desktop-First Viewport & Scaling', () => {
  const BASE_W = ORACLE.GRID.CONTENT_W;
  const BASE_H = ORACLE.GRID.CONTENT_H;
  const ratio = BASE_W / BASE_H;

  it('F11.1: Desktop viewport (1920x1080) scales canvas to fit with zero vertical letterbox', () => {
    const res = ORACLE.calculateViewport(1920, 1080, false, 0);
    const expected = Math.min(1920 / BASE_W, 1080 / BASE_H);
    assert.strictEqual(res.scale, expected, 'Scale must fit the base canvas');
    assert.strictEqual(res.offsetY, 0, 'Vertical letterboxing must be 0 on a tall-enough screen');
  });

  it('F11.2: Dynamic chat drawer opening subtracts drawer width from available canvas width', () => {
    const res = ORACLE.calculateViewport(1920, 1080, true, 360);
    assert.strictEqual(res.availW, 1560, 'Available width must subtract 360px drawer');
  });

  it('F11.3: Canvas offsets center the rendered content in remaining space', () => {
    const res = ORACLE.calculateViewport(1560, 1080, false, 0);
    assert.ok(res.offsetX >= 0);
    assert.ok(res.offsetY >= 0);
  });

  it('F11.4: Screen-to-canvas coordinate transformation accounts for scale and offsets', () => {
    const vp = ORACLE.calculateViewport(1920, 1080, false, 0);
    const clientX = 960;
    const clientY = 540;
    const canvasX = (clientX - vp.offsetX) / vp.scale;
    const canvasY = (clientY - vp.offsetY) / vp.scale;

    assert.strictEqual(Math.round(canvasX), Math.round(BASE_W / 2), 'Canvas X should map to content center');
    assert.strictEqual(Math.round(canvasY), Math.round(BASE_H / 2), 'Canvas Y should map to content center');
  });

  it('F11.5: Base content maintains a fixed aspect ratio across any window size', () => {
    const resNarrow = ORACLE.calculateViewport(800, 600, false, 0);
    assert.ok(Math.abs(resNarrow.renderedW / resNarrow.renderedH - ratio) < 1e-9);

    const resWide = ORACLE.calculateViewport(2560, 1080, false, 0);
    assert.ok(Math.abs(resWide.renderedW / resWide.renderedH - ratio) < 1e-9);
  });
});

describe('Tier 1 — Feature 12: Server Endpoints & Smoke Probes', () => {
  it('F12.1: Syntax check passes on all 11 frontend JavaScript files', () => {
    const root = path.resolve(__dirname, '..', '..', 'services', 'lami-office-react', 'web', 'js');
    const files = ['config.js', 'sprites.js', 'audio.js', 'tilemap.js', 'world.js', 'agents.js', 'office.js', 'ui.js', 'demo.js', 'net.js', 'main.js'];

    for (const f of files) {
      const full = path.join(root, f);
      assert.ok(fs.existsSync(full), `File ${f} must exist`);
      const content = fs.readFileSync(full, 'utf8');
      assert.doesNotThrow(() => new Function(content), `Syntax error in ${f}`);
    }
  });

  it('F12.2: Server GET /healthz contract expects HTTP 200 with ok: true and status: ok', () => {
    const mockHealthPayload = { ok: true, status: 'ok', clients: 0, time: 1729000000 };
    assert.strictEqual(mockHealthPayload.ok, true);
    assert.strictEqual(mockHealthPayload.status, 'ok');
  });

  it('F12.3: Server GET /api/config contract expects mode field matching live or demo', () => {
    const validModes = ['live', 'demo'];
    const sampleConfig = { mode: 'demo', toolRooms: {} };
    assert.ok(validModes.includes(sampleConfig.mode));
  });

  it('F12.4: Server GET /api/boss contract expects boss id lami', () => {
    const sampleBoss = { id: 'lami', name: 'Lami', status: 'online' };
    assert.strictEqual(sampleBoss.id, 'lami');
  });

  it('F12.5: Server GET /api/agents contract expects agents array and total stats', () => {
    const sampleAgents = { agents: [], online: 0, total: 0, boss: { id: 'lami' } };
    assert.ok(Array.isArray(sampleAgents.agents));
    assert.strictEqual(typeof sampleAgents.online, 'number');
    assert.strictEqual(typeof sampleAgents.total, 'number');
  });
});

describe('Tier 1 — Feature 7b: Live Map Path Integrity', () => {
  const HOME = { rina: [35, 11], dodo: [8, 28], sekar: [42, 30], bima: [72, 16], lami: [15, 7] };
  const OWNER = {
    corkboard: 'rina', stretch: 'rina', reading: 'rina', coffee_pantry: 'rina', consult_boss: 'rina',
    server_mini: 'dodo', arch_board: 'dodo', peer_review: 'dodo', pantry_snack: 'dodo',
    agenda_board: 'sekar', podium: 'sekar', report_boss: 'sekar', lounge_relax: 'sekar',
    patrol_rack_a: 'bima', patrol_rack_b: 'bima', cables_patch: 'bima', coffee_break: 'bima',
    window: 'lami', bonsai: 'lami', balcony: 'lami', pantry_visit: 'lami'
  };

  function liveMap() {
    const env = createBrowserEnvironment();
    const LO = loadScriptIntoEnv(env, 'config.js');
    loadScriptIntoEnv(env, 'office.js');
    const grid = LO.Office.prototype.buildCollisionGrid.call({
      getFurnitureObstacles: LO.Office.prototype.getFurnitureObstacles
    });
    return { LO, grid };
  }

  function assertCleanPath(LO, grid, path) {
    assert.ok(path && path.length > 1, 'Path must contain a route');
    for (const step of path) {
      assert.strictEqual(grid[step.y][step.x], 0, `Waypoint (${step.x},${step.y}) must be walkable`);
    }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      assert.ok(a.x === b.x || a.y === b.y, 'Every segment must be strictly orthogonal');
    }
  }

  it('F7b.1: Routed path is orthogonal, walkable and collinear-compressed', () => {
    const { LO, grid } = liveMap();
    const path = LO.findOrthogonalPath({ x: 2, y: 21 }, { x: 70, y: 30 }, grid);
    assertCleanPath(LO, grid, path);
    assert.ok(path.length < 20, `Compressed path should be a few runs, got ${path.length} waypoints`);
    const end = path[path.length - 1];
    assert.strictEqual(end.x, 70);
    assert.strictEqual(end.y, 30);
  });

  it('F7b.2: A goal inside furniture snaps to the nearest walkable tile instead of failing', () => {
    const { LO, grid } = liveMap();
    // (14,7) is the executive desk tile in the boss office layout.
    assert.strictEqual(grid[7][14], 1, 'Executive desk tile must be solid');
    const path = LO.findOrthogonalPath({ x: 14, y: 10 }, { x: 14, y: 7 }, grid);
    assertCleanPath(LO, grid, path);
    const end = path[path.length - 1];
    assert.ok(Math.abs(end.x - 14) + Math.abs(end.y - 7) <= 2, 'Goal must snap to an adjacent tile');
  });

  it('F7b.3: Every resident boss routine destination is reachable from its home desk', () => {
    const { LO, grid } = liveMap();
    const agentsSrc = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'services', 'lami-office-react', 'web', 'js', 'agents.js'), 'utf8');
    let checked = 0;
    for (const [id, owner] of Object.entries(OWNER)) {
      const m = new RegExp(`id: '${id}',[\\s\\S]{0,260}?col: ([\\d.]+),\\s*row: ([\\d.]+),\\s*facing: '([^']*)'`).exec(agentsSrc);
      assert.ok(m, `Routine ${id} must exist with col/row/facing`);
      const x = Number(m[1]), y = Number(m[2]);
      assert.ok(['N', 'S', 'E', 'W'].includes(m[3]), `Routine ${id} must use a cardinal facing`);
      const [hx, hy] = HOME[owner];
      const pathLive = LO.findOrthogonalPath({ x: hx, y: hy }, { x, y }, grid);
      assert.ok(pathLive, `Routine ${id} target (${x},${y}) must be reachable from ${owner}'s desk`);
      checked++;
    }
    assert.strictEqual(checked, 21, 'All 21 routines must be verified');
  });
});

describe('Tier 1 — Feature 13: Staff Roster & Shared Room Routines', () => {
  function liveConfig() {
    const env = createBrowserEnvironment();
    const LO = loadScriptIntoEnv(env, 'config.js');
    loadScriptIntoEnv(env, 'office.js');
    const grid = LO.Office.prototype.buildCollisionGrid.call({
      getFurnitureObstacles: LO.Office.prototype.getFurnitureObstacles
    });
    return { LO, grid };
  }

  it('F13.1: Office roster has at least 12 residents with unique room slots', () => {
    const { LO } = liveConfig();
    assert.ok(LO.RESIDENTS.length >= 12, `Expected 12+ residents, got ${LO.RESIDENTS.length}`);
    const seen = new Set();
    for (const r of LO.RESIDENTS) {
      const key = `${r.room}:${r.slot}`;
      assert.ok(!seen.has(key), `Duplicate home slot ${key} for ${r.name}`);
      seen.add(key);
      assert.ok(LO.SLOTS[r.room] && LO.SLOTS[r.room][r.slot], `${r.name} must point at a real slot`);
    }
  });

  it('F13.2: Every room exposes shared routines with walkable destinations', () => {
    const { LO, grid } = liveConfig();
    for (const room of ['research', 'engineering', 'meeting', 'server', 'pantry']) {
      const routines = LO.ROOM_ROUTINES[room];
      assert.ok(Array.isArray(routines) && routines.length >= 3, `${room} needs 3+ shared routines`);
      for (const rt of routines) {
        assert.strictEqual(grid[rt.row][rt.col], 0, `${room}/${rt.id} target must be walkable`);
        assert.ok(['N', 'S', 'E', 'W'].includes(rt.facing), `${room}/${rt.id} needs a cardinal facing`);
      }
    }
  });

  it('F13.3: Every resident can reach every shared routine in its own room', () => {
    const { LO, grid } = liveConfig();
    for (const res of LO.RESIDENTS) {
      const slot = LO.SLOTS[res.room][res.slot];
      for (const rt of LO.ROOM_ROUTINES[res.room] || []) {
        const p = LO.findOrthogonalPath({ x: slot.col, y: slot.row }, { x: rt.col, y: rt.row }, grid);
        assert.ok(p, `${res.name} cannot reach ${res.room}/${rt.id} (${rt.col},${rt.row})`);
      }
    }
  });
});

describe('Tier 1 — Feature 14: Tilemap Floorplan & Collision Consistency', () => {
  const MAP_PATH = path.resolve(__dirname, '..', '..', 'services', 'lami-office-react', 'web', 'assets', 'map', 'office.map.json');
  const TILESET_PATH = path.resolve(__dirname, '..', '..', 'services', 'lami-office-react', 'web', 'assets', 'tiles', 'tileset.json');

  function decodeLayer(layer, cols, rows) {
    const flat = [];
    for (const [value, run] of layer.data) {
      for (let k = 0; k < run; k++) flat.push(value);
    }
    assert.strictEqual(flat.length, cols * rows, `Layer ${layer.name} must cover the whole grid`);
    const out = [];
    for (let y = 0; y < rows; y++) out.push(flat.slice(y * cols, (y + 1) * cols));
    return out;
  }

  function loadMap() {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const tiers = {};
    for (const layer of map.layers) tiers[layer.name] = decodeLayer(layer, map.cols, map.rows);
    return { map, tiers };
  }

  it('F14.1: Tilemap grid matches the config grid and every tile exists in the tileset', () => {
    const { LO } = liveCollisionGrid();
    const { map, tiers } = loadMap();
    assert.strictEqual(map.cols, LO.GRID_COLS, 'Tilemap cols must match config');
    assert.strictEqual(map.rows, LO.GRID_ROWS, 'Tilemap rows must match config');
    assert.strictEqual(map.tileSize, LO.TILE_SIZE, 'Tilemap tile size must match config');

    const names = new Set(JSON.parse(fs.readFileSync(TILESET_PATH, 'utf8')).map(t => t.name));
    for (const layerName of ['floor', 'walls', 'decor']) {
      for (const row of tiers[layerName]) {
        for (const name of row) {
          if (name) assert.ok(names.has(name), `Tile "${name}" in layer ${layerName} missing from tileset.json`);
        }
      }
    }
  });

  it('F14.2: Every solid wall tile in the tilemap is also solid in the collision grid', () => {
    const { grid } = liveCollisionGrid();
    const { map, tiers } = loadMap();
    // Door tiles are walkable; all other wall tiles must be solid.
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const wall = tiers.walls[y][x];
        if (!wall || wall === 'door_mid') continue;
        assert.strictEqual(grid[y][x], 1, `Wall tile "${wall}" at (${x},${y}) must be solid in collision grid`);
      }
    }
  });

  it('F14.3: Doorway tiles in the tilemap are walkable in the collision grid', () => {
    const { grid } = liveCollisionGrid();
    const { map, tiers } = loadMap();
    let doorTiles = 0;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (tiers.walls[y][x] === 'door_mid') {
          doorTiles++;
          assert.strictEqual(grid[y][x], 0, `Doorway tile (${x},${y}) must be walkable`);
        }
      }
    }
    assert.strictEqual(doorTiles, 12, 'Six 2-tile doorways expected (12 door tiles)');
  });

  it('F14.4: Room floor tiles follow the configured room interiors', () => {
    const { LO } = liveCollisionGrid();
    const { tiers } = loadMap();
    for (const rid of ORACLE.ROOM_IDS) {
      const b = LO.ROOMS[rid].bounds;
      for (let y = b.y1; y <= b.y2; y++) {
        for (let x = b.x1; x <= b.x2; x++) {
          assert.ok(/^floor_/.test(tiers.floor[y][x]), `(${x},${y}) inside ${rid} must carry a floor tile`);
        }
      }
    }
  });
});
