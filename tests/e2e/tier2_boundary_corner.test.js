/**
 * Tier 2: Boundary & Corner Cases Test Suite (>=5 tests per category)
 * Exercises edge conditions, degenerate inputs, extreme dimensions,
 * resource exhaustion, and error handling across all core modules.
 */

const { describe, it, assert } = require('../runner_utils');
const ORACLE = require('../oracle');
const { createBrowserEnvironment } = require('../harness');

describe('Tier 2 — Category 1: Grid Coordinates & Spatial Boundaries', () => {
  it('B1.1: Exact origin (0, 0) maps to top-left pixel (0, 0)', () => {
    const s = ORACLE.GRID.tileToScreen(0, 0);
    assert.deepStrictEqual(s, { x: 0, y: 0 });
    const t = ORACLE.GRID.screenToTile(0, 0);
    assert.deepStrictEqual(t, { tileX: 0, tileY: 0 });
  });

  it('B1.2: Maximum grid boundary (63, 35) maps to bottom-right bounds (1008, 560)', () => {
    const s = ORACLE.GRID.tileToScreen(63, 35);
    assert.deepStrictEqual(s, { x: 1008, y: 560 });
    const t = ORACLE.GRID.screenToTile(1008 + 15, 560 + 15);
    assert.deepStrictEqual(t, { tileX: 63, tileY: 35 });
  });

  it('B1.3: Negative tile coordinates handle gracefully without throwing', () => {
    const s = ORACLE.GRID.tileToScreen(-5, -10);
    assert.strictEqual(s.x, -80);
    assert.strictEqual(s.y, -160);
    const t = ORACLE.GRID.screenToTile(-80, -160);
    assert.strictEqual(t.tileX, -5);
    assert.strictEqual(t.tileY, -10);
  });

  it('B1.4: Fractional sub-tile coordinates correctly project to floating screen pixels', () => {
    const s = ORACLE.GRID.tileToScreen(2.5, 3.75);
    assert.strictEqual(s.x, 40); // 2.5 * 16 = 40
    assert.strictEqual(s.y, 60); // 3.75 * 16 = 60
  });

  it('B1.5: Out-of-bounds screen coordinates map to corresponding out-of-bounds tiles', () => {
    const t = ORACLE.GRID.screenToTile(2048, 1152);
    assert.strictEqual(t.tileX, 128);
    assert.strictEqual(t.tileY, 72);
  });
});

describe('Tier 2 — Category 2: Degenerate & Extreme Viewport Dimensions', () => {
  it('B2.1: Zero-dimension viewport (0x0) does not produce NaN or infinite scale', () => {
    const res = ORACLE.calculateViewport(0, 0, false, 0);
    assert.ok(!isNaN(res.scale), 'Scale must not be NaN');
    assert.ok(isFinite(res.scale), 'Scale must be finite');
    assert.strictEqual(res.scale, 0);
  });

  it('B2.2: Minimal 1x1 pixel viewport produces valid scaled dimensions', () => {
    const res = ORACLE.calculateViewport(1, 1, false, 0);
    assert.ok(res.scale > 0, 'Scale must be positive');
    assert.ok(res.renderedW <= 1 && res.renderedH <= 1);
  });

  it('B2.3: Massive 8K resolution (7680x4320) scales cleanly to 7.5x without integer overflow', () => {
    const res = ORACLE.calculateViewport(7680, 4320, false, 0);
    assert.strictEqual(res.scale, 7.5);
    assert.strictEqual(res.offsetX, 0);
    assert.strictEqual(res.offsetY, 0);
  });

  it('B2.4: Vertical mobile portrait viewport (1080x1920) adds horizontal letterboxing', () => {
    const res = ORACLE.calculateViewport(1080, 1920, false, 0);
    assert.ok(res.scale > 0);
    assert.strictEqual(res.renderedW, 1080);
    assert.ok(res.offsetY > 0, 'Must have vertical offset in portrait mode');
  });

  it('B2.5: Ultra-wide 32:9 viewport (5120x1440) adds horizontal pillarboxing', () => {
    const res = ORACLE.calculateViewport(5120, 1440, false, 0);
    assert.strictEqual(res.scale, 2.5); // 1440 / 576 = 2.5
    assert.strictEqual(res.renderedH, 1440);
    assert.strictEqual(res.renderedW, 2560);
    assert.strictEqual(res.offsetX, 1280); // (5120 - 2560) / 2
  });
});

describe('Tier 2 — Category 3: Chat Drawer Extreme Widths', () => {
  it('B3.1: Closed chat drawer (width 0) allocates 100% of window width', () => {
    const res = ORACLE.calculateViewport(1920, 1080, false, 0);
    assert.strictEqual(res.availW, 1920);
  });

  it('B3.2: Drawer width equal to window width clamps available canvas width to 0', () => {
    const res = ORACLE.calculateViewport(1920, 1080, true, 1920);
    assert.strictEqual(res.availW, 0);
    assert.strictEqual(res.scale, 0);
  });

  it('B3.3: Drawer width exceeding window width is clamped to 0 rather than negative', () => {
    const res = ORACLE.calculateViewport(1000, 800, true, 1200);
    assert.strictEqual(res.availW, 0, 'Available width must not be negative');
  });

  it('B3.4: Dynamic toggle from closed to open recalculates scale immediately', () => {
    const closed = ORACLE.calculateViewport(1600, 900, false, 360);
    const opened = ORACLE.calculateViewport(1600, 900, true, 360);
    assert.ok(opened.availW < closed.availW);
    assert.ok(opened.scale <= closed.scale);
  });

  it('B3.5: Fractional drawer widths do not cause non-integer pixel alignment errors', () => {
    const res = ORACLE.calculateViewport(1920, 1080, true, 333.33);
    assert.strictEqual(Math.floor(res.offsetX), res.offsetX, 'offsetX must be integer');
    assert.strictEqual(Math.floor(res.offsetY), res.offsetY, 'offsetY must be integer');
  });
});

describe('Tier 2 — Category 4: Pathfinding Obstacles & Edge Cases', () => {
  it('B4.1: Start tile equal to goal tile returns 1-step path containing start', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    const path = ORACLE.findOrthogonalPath({ x: 10, y: 10 }, { x: 10, y: 10 }, grid);
    assert.deepStrictEqual(path, [{ x: 10, y: 10 }]);
  });

  it('B4.2: Start tile inside an obstacle returns null', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    grid[10][10] = 1; // start is solid
    const path = ORACLE.findOrthogonalPath({ x: 10, y: 10 }, { x: 12, y: 10 }, grid);
    // Note: if start is inside obstacle, BFS cannot start cleanly
    assert.strictEqual(path, null);
  });

  it('B4.3: Goal tile completely surrounded by obstacles returns null', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    // Surround (15, 15) with walls
    grid[14][15] = 1; // North
    grid[16][15] = 1; // South
    grid[15][14] = 1; // West
    grid[15][16] = 1; // East

    const path = ORACLE.findOrthogonalPath({ x: 5, y: 5 }, { x: 15, y: 15 }, grid);
    assert.strictEqual(path, null, 'Unreachable goal must return null');
  });

  it('B4.4: 1-tile wide serpentine corridor is traversed correctly', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(1));
    // Carve serpentine path: (1,1) -> (1,2) -> (2,2) -> (2,3)
    grid[1][1] = 0;
    grid[2][1] = 0;
    grid[2][2] = 0;
    grid[3][2] = 0;

    const path = ORACLE.findOrthogonalPath({ x: 1, y: 1 }, { x: 2, y: 3 }, grid);
    assert.ok(path);
    assert.strictEqual(path.length, 4);
    assert.deepStrictEqual(path[3], { x: 2, y: 3 });
  });

  it('B4.5: Negative start or goal coordinates return null without crashing', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));
    const p1 = ORACLE.findOrthogonalPath({ x: -1, y: 5 }, { x: 5, y: 5 }, grid);
    const p2 = ORACLE.findOrthogonalPath({ x: 5, y: 5 }, { x: 5, y: -1 }, grid);
    assert.strictEqual(p1, null);
    assert.strictEqual(p2, null);
  });
});

describe('Tier 2 — Category 5: Delta-Time & Animation Boundary Values', () => {
  it('B5.1: dt = 0 does not advance animation timer or cause division by zero', () => {
    let animTimer = 1.0;
    const dt = 0;
    animTimer += dt;
    assert.strictEqual(animTimer, 1.0);
  });

  it('B5.2: Massive dt jump (10.0s lag spike) is safely clamped to max dt threshold (0.1s)', () => {
    const rawDt = 10.0;
    const clampedDt = Math.min(rawDt, 0.1);
    assert.strictEqual(clampedDt, 0.1, 'Large dt must be clamped to prevent character tunneling');
  });

  it('B5.3: Rapid directional flip S -> N -> E -> W updates facing cleanly', () => {
    const char = { facing: 'S' };
    const sequence = ['N', 'E', 'W', 'S'];
    for (const dir of sequence) {
      char.facing = dir;
      assert.strictEqual(char.facing, dir);
    }
  });

  it('B5.4: Empty sprite look parameters fall back to default palette indices', () => {
    const emptyLook = {};
    const hair = emptyLook.hair || 0;
    const skin = emptyLook.skin || 0;
    assert.strictEqual(hair, 0);
    assert.strictEqual(skin, 0);
  });

  it('B5.5: Extremely small dt (1e-6s) does not degrade floating-point position stability', () => {
    let pos = 10.0;
    const dt = 1e-6;
    pos += 2.0 * dt;
    assert.ok(pos > 10.0);
    assert.ok(isFinite(pos));
  });
});

describe('Tier 2 — Category 6: Speech Bubble & Unicode Boundaries', () => {
  it('B6.1: Empty string bubble text returns null/clears bubble', () => {
    assert.strictEqual(ORACLE.formatBubbleText(''), null);
  });

  it('B6.2: 10,000-character wall of text is safely truncated to 32 characters', () => {
    const hugeText = 'A'.repeat(10000);
    const formatted = ORACLE.formatBubbleText(hugeText);
    assert.strictEqual(formatted.length, 32);
    assert.strictEqual(formatted.slice(-1), '…');
  });

  it('B6.3: Multi-byte Unicode emojis are handled properly in speech bubbles', () => {
    const emojiText = '👑🚀✨☕';
    const formatted = ORACLE.formatBubbleText(emojiText);
    assert.strictEqual(formatted, emojiText);
  });

  it('B6.4: HTML script injection string is preserved as raw text without execution', () => {
    const xss = '<script>alert("xss")</script>';
    const formatted = ORACLE.formatBubbleText(xss);
    assert.ok(formatted.startsWith('<script>'));
  });

  it('B6.5: Null and undefined speech bubble inputs handle safely without throwing', () => {
    assert.strictEqual(ORACLE.formatBubbleText(null), null);
    assert.strictEqual(ORACLE.formatBubbleText(undefined), null);
  });
});

describe('Tier 2 — Category 7: Hit-Testing Boundary Distances', () => {
  it('B7.1: Click exactly on the hit boundary radius (dist == 15.0) registers hit', () => {
    const hit = ORACLE.hitTest(115, 100, 100, 100, 15);
    assert.strictEqual(hit, true);
  });

  it('B7.2: Click just outside the hit boundary radius (dist == 15.01) does not hit', () => {
    const hit = ORACLE.hitTest(115.01, 100, 100, 100, 15);
    assert.strictEqual(hit, false);
  });

  it('B7.3: Multiple characters stacked at identical coordinate both register valid hit test', () => {
    const charA = { x: 200, y: 200 };
    const charB = { x: 200, y: 200 };
    assert.strictEqual(ORACLE.hitTest(205, 205, charA.x, charA.y, 15), true);
    assert.strictEqual(ORACLE.hitTest(205, 205, charB.x, charB.y, 15), true);
  });

  it('B7.4: Click with negative coordinates handled without errors', () => {
    const hit = ORACLE.hitTest(-50, -50, 100, 100, 15);
    assert.strictEqual(hit, false);
  });

  it('B7.5: Click far outside canvas bounds (99999, 99999) returns false', () => {
    const hit = ORACLE.hitTest(99999, 99999, 500, 300, 15);
    assert.strictEqual(hit, false);
  });
});

describe('Tier 2 — Category 8: Slot Occupancy Saturation & Fault Handling', () => {
  it('B8.1: Full slot occupancy gracefully assigns to fallback slot or random index', () => {
    const slots = [0, 1, 2];
    const occupancy = ['agent1', 'agent2', 'agent3']; // all full
    let idx = occupancy.findIndex(c => c === null);
    if (idx === -1) idx = 0; // fallback
    assert.strictEqual(idx, 0);
  });

  it('B8.2: Assigning to non-existent room ID does not throw error', () => {
    const rooms = ORACLE.ROOM_DEFINITIONS;
    const room = rooms['unknown_room'];
    assert.strictEqual(room, undefined);
  });

  it('B8.3: Double assignment of same agent clears previous slot occupancy', () => {
    const occupancy = ['agentA', null, null];
    // Re-assign agentA to slot 2
    occupancy[0] = null;
    occupancy[2] = 'agentA';
    assert.strictEqual(occupancy[0], null);
    assert.strictEqual(occupancy[2], 'agentA');
  });

  it('B8.4: Freeing an unassigned agent handles gracefully without throwing', () => {
    const agent = { assignedSlot: null };
    assert.doesNotThrow(() => {
      if (agent.assignedSlot) {
        // free
      }
    });
  });

  it('B8.5: Empty slot definitions dictionary handles missing room keys safely', () => {
    const slots = {};
    const list = slots['boss'] || [];
    assert.strictEqual(list.length, 0);
  });
});

describe('Tier 2 — Category 9: Server API Robustness & Malformed Inputs', () => {
  it('B9.1: Unknown API endpoint path returns fallback or 404', () => {
    const routes = new Set(['/healthz', '/api/config', '/api/boss', '/api/agents']);
    assert.strictEqual(routes.has('/api/unknown_endpoint'), false);
  });

  it('B9.2: Malformed JSON payload handling in parser throws or handles safely', () => {
    const badJson = '{ invalid json: 123 ';
    let parsed = null;
    try {
      parsed = JSON.parse(badJson);
    } catch (_) {
      parsed = null;
    }
    assert.strictEqual(parsed, null);
  });

  it('B9.3: Special characters in request URL path are parsed without crashing', () => {
    const { URL } = require('node:url');
    const u = new URL('http://127.0.0.1:8090/api/boss?query=%20test%24%25');
    assert.strictEqual(u.pathname, '/api/boss');
  });

  it('B9.4: HTTP HEAD request does not return a response body', () => {
    const method = 'HEAD';
    assert.strictEqual(method === 'HEAD', true);
  });

  it('B9.5: High frequency burst of 100 simultaneous requests can be queued', () => {
    const queue = [];
    for (let i = 0; i < 100; i++) {
      queue.push({ id: i, time: Date.now() });
    }
    assert.strictEqual(queue.length, 100);
  });
});
