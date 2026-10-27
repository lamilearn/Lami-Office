/**
 * Lami AI Office — Specification Oracle & Reference Model
 * Authoritative mathematical formulas, geometry models, and requirement models
 * derived strictly from ORIGINAL_REQUEST.md and PROJECT.md.
 */

const ORACLE = {
  // R1: 2D Orthogonal Grid Engine & Math
  GRID: {
    TILE_SIZE: 16,
    GRID_COLS: 64,
    GRID_ROWS: 36,
    CONTENT_W: 1024, // 64 * 16
    CONTENT_H: 576,  // 36 * 16
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

  // Reference Room Boundaries on 64x36 Orthogonal Grid
  // Hallway connects all rooms horizontally along rows 16 to 19.
  ROOM_DEFINITIONS: {
    boss: {
      id: 'boss',
      label: 'BOSS OFFICE',
      bounds: { x1: 2, y1: 2, x2: 18, y2: 15 },
      door: { x: 10, y: 15 },
      color: '#fff3db'
    },
    research: {
      id: 'research',
      label: 'RESEARCH LAB',
      bounds: { x1: 20, y1: 2, x2: 38, y2: 15 },
      door: { x: 29, y: 15 },
      color: '#e4f3fd'
    },
    server: {
      id: 'server',
      label: 'SERVER ROOM',
      bounds: { x1: 40, y1: 2, x2: 61, y2: 15 },
      door: { x: 50, y: 15 },
      color: '#eae8fd'
    },
    engineering: {
      id: 'engineering',
      alias: 'coding',
      label: 'ENGINEERING PIT',
      bounds: { x1: 2, y1: 20, x2: 22, y2: 33 },
      door: { x: 12, y: 20 },
      color: '#e5faed'
    },
    meeting: {
      id: 'meeting',
      label: 'MEETING ROOM',
      bounds: { x1: 24, y1: 20, x2: 42, y2: 33 },
      door: { x: 33, y: 20 },
      color: '#ffece0'
    },
    pantry: {
      id: 'pantry',
      label: 'PANTRY & LOUNGE',
      bounds: { x1: 44, y1: 20, x2: 61, y2: 33 },
      door: { x: 52, y: 20 },
      color: '#fff8d6'
    }
  },

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
  calculateViewport(winW, winH, drawerOpen = false, drawerWidth = 360) {
    const availW = drawerOpen ? Math.max(0, winW - drawerWidth) : winW;
    const availH = winH;

    const baseW = 1024;
    const baseH = 576;

    const scaleX = availW / baseW;
    const scaleY = availH / baseH;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = Math.floor((availW - baseW * scale) / 2);
    const offsetY = Math.floor((availH - baseH * scale) / 2);

    const letterboxX = offsetX > 0;
    const letterboxY = offsetY > 0;

    return {
      availW,
      availH,
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
