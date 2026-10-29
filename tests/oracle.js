/**
 * Lami AI Office — Specification Oracle & Reference Model
 * Authoritative mathematical formulas, geometry models, and requirement models
 * derived strictly from ORIGINAL_REQUEST.md and PROJECT.md.
 */

const ORACLE = {
  // R1: 2D Orthogonal Grid Engine & Math
  GRID: {
    TILE_SIZE: 16,
    GRID_COLS: 88,
    GRID_ROWS: 50,
    CONTENT_W: 1408, // 88 * 16
    CONTENT_H: 800,  // 50 * 16
    ASPECT_RATIO: 16 / 9,

    tileToScreen(x, y) {
      return {
        x: Math.round(x * 16),
        y: Math.round(y * 16)
      };
    },

    screenToTile(sx, sy) {
      return {
        tileX: Math.floor(sx / 16),
        tileY: Math.floor(sy / 16)
      };
    }
  },

  // R1: 6 Themed Office Rooms Specification
  ROOM_IDS: ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry'],
  ROOM_ALIASES: { coding: 'engineering' },

  // Reference Room Boundaries on the 88x50 orthogonal grid.
  // Single enclosed floorplan: 2x3 rooms sealed by shared partition walls and a
  // central hallway band, each room pierced by a 2-tile doorway on the hallway wall.
  ROOM_DEFINITIONS: {
    boss: {
      id: 'boss',
      label: 'BOSS OFFICE',
      bounds: { x1: 2, y1: 3, x2: 27, y2: 18 },
      door: { x: 14, y: 19, side: 'S' },
      color: '#fcedd7'
    },
    research: {
      id: 'research',
      label: 'RESEARCH LAB',
      bounds: { x1: 30, y1: 3, x2: 55, y2: 18 },
      door: { x: 42, y: 19, side: 'S' },
      color: '#e1f0fc'
    },
    server: {
      id: 'server',
      label: 'SERVER ROOM',
      bounds: { x1: 58, y1: 3, x2: 83, y2: 18 },
      door: { x: 70, y: 19, side: 'S' },
      color: '#262238'
    },
    engineering: {
      id: 'engineering',
      alias: 'coding',
      label: 'ENGINEERING PIT',
      bounds: { x1: 2, y1: 24, x2: 27, y2: 39 },
      door: { x: 14, y: 23, side: 'N' },
      color: '#e6f7ec'
    },
    meeting: {
      id: 'meeting',
      label: 'MEETING ROOM',
      bounds: { x1: 30, y1: 24, x2: 55, y2: 39 },
      door: { x: 42, y: 23, side: 'N' },
      color: '#fff0e5'
    },
    pantry: {
      id: 'pantry',
      label: 'PANTRY & LOUNGE',
      bounds: { x1: 58, y1: 24, x2: 83, y2: 39 },
      door: { x: 70, y: 23, side: 'N' },
      color: '#fff9d6'
    }
  },

  // Reference building envelope and the single central hallway band.
  BUILDING: { x1: 1, y1: 2, x2: 84, y2: 40 },
  HALLWAY_BANDS: [
    { name: 'central', x1: 2, y1: 20, x2: 83, y2: 22 },
    { name: 'entrance', x1: 1, y1: 21, x2: 2, y2: 21 }
  ],
  HALLWAY_NORTH: { x1: 2, y1: 20, x2: 83, y2: 22 },
  HALLWAY_SOUTH: { x1: 2, y1: 20, x2: 83, y2: 22 },

  // R2: 4-Directional Cardinal Movement Vectors
  CARDINAL_DIRECTIONS: ['S', 'N', 'E', 'W'],
  DIRECTION_VECTORS: {
    S: { dx: 0, dy: 1, name: 'South / Down' },
    N: { dx: 0, dy: -1, name: 'North / Up' },
    E: { dx: 1, dy: 0, name: 'East / Right' },
    W: { dx: -1, dy: 0, name: 'West / Left' }
  },
  COMPATIBILITY_ALIASES: {
    SE: 'S',
    SW: 'W',
    NE: 'E',
    NW: 'N',
    down: 'S',
    up: 'N',
    right: 'E',
    left: 'W'
  },

  // R2: Animated Step Cycles
  STEP_CYCLE: ['idle', 'walk1', 'idle', 'walk2'],

  // R2: Orthogonal Pathfinding Reference (BFS)
  findOrthogonalPath(start, goal, collisionGrid) {
    const rows = collisionGrid.length;
    const cols = collisionGrid[0].length;

    // Bounds check
    if (start.x < 0 || start.x >= cols || start.y < 0 || start.y >= rows) return null;
    if (goal.x < 0 || goal.x >= cols || goal.y < 0 || goal.y >= rows) return null;

    // If start or goal is an obstacle
    if (collisionGrid[start.y][start.x] === 1) return null;
    if (collisionGrid[goal.y][goal.x] === 1) return null;
    if (start.x === goal.x && start.y === goal.y) return [{ x: start.x, y: start.y }];

    const queue = [{ x: start.x, y: start.y, path: [{ x: start.x, y: start.y }] }];
    const visited = new Set();
    visited.add(`${start.x},${start.y}`);

    const dirs = [
      { dx: 0, dy: 1 },  // S
      { dx: 0, dy: -1 }, // N
      { dx: 1, dy: 0 },  // E
      { dx: -1, dy: 0 }  // W
    ];

    while (queue.length > 0) {
      const { x, y, path } = queue.shift();

      if (x === goal.x && y === goal.y) {
        return path;
      }

      for (const d of dirs) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        const key = `${nx},${ny}`;

        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows &&
            collisionGrid[ny][nx] === 0 && !visited.has(key)) {
          visited.add(key);
          queue.push({
            x: nx,
            y: ny,
            path: [...path, { x: nx, y: ny }]
          });
        }
      }
    }

    return null; // unreachable
  },

  // R3: Desktop 16:9 Viewport & Dynamic Chat Drawer Math
  // `topInset` mirrors --stage-top-gap: the reserved band under the HUD. The
  // content is fitted into the height that remains and pushed below the band.
  calculateViewport(winW, winH, drawerOpen = false, drawerWidth = 360, topInset = 0) {
    const availW = drawerOpen ? Math.max(0, winW - drawerWidth) : winW;
    const inset = Math.max(0, Math.min(topInset, winH));
    const availH = Math.max(1, winH - inset);

    const baseW = 1408;
    const baseH = 800;

    const scaleX = availW / baseW;
    const scaleY = availH / baseH;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = Math.floor((availW - baseW * scale) / 2);
    const offsetY = Math.floor(inset + (availH - baseH * scale) / 2);

    const letterboxX = offsetX > 0;
    const letterboxY = offsetY > inset;

    return {
      availW,
      availH,
      topInset: inset,
      scale,
      offsetX,
      offsetY,
      letterboxX,
      letterboxY,
      renderedW: baseW * scale,
      renderedH: baseH * scale
    };
  },

  // Click Hit-Testing Math (in 2D unskewed plane)
  hitTest(clickX, clickY, targetX, targetY, radius = 15) {
    const dist = Math.hypot(clickX - targetX, clickY - targetY);
    return dist <= radius;
  },

  // Speech Bubble Truncation
  formatBubbleText(text) {
    if (!text) return null;
    return text.length > 32 ? text.substring(0, 31) + '…' : text;
  }
};

module.exports = ORACLE;
