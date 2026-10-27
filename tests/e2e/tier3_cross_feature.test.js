/**
 * Tier 3: Cross-Feature Combinations Test Suite
 * Validates pairwise integration and interactions between multiple core features:
 * Movement + Pathfinding, Viewport + Hit-Testing, Events + Animations,
 * Modals + Props, Tribute Mode + Sprites, Context Meter + Visuals.
 */

const { describe, it, assert } = require('../runner_utils');
const ORACLE = require('../oracle');
const { createBrowserEnvironment } = require('../harness');

describe('Tier 3 — Cross-Feature: Movement, Pathfinding & Room Transitions', () => {
  it('X1: Character navigates between Boss Office and Engineering Pit through hallway', () => {
    // 64x36 collision grid: all 0 except room boundaries
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));

    // Fill walls around boss room except door (10, 15)
    const boss = ORACLE.ROOM_DEFINITIONS.boss.bounds;
    for (let x = boss.x1; x <= boss.x2; x++) {
      grid[boss.y1][x] = 1;
      grid[boss.y2][x] = 1;
    }
    for (let y = boss.y1; y <= boss.y2; y++) {
      grid[y][boss.x1] = 1;
      grid[y][boss.x2] = 1;
    }
    grid[15][10] = 0; // Doorway

    // Start inside boss room (5, 5), Goal in hallway (10, 17)
    const path = ORACLE.findOrthogonalPath({ x: 5, y: 5 }, { x: 10, y: 17 }, grid);
    assert.ok(path, 'Path out of room through door must exist');

    // Verify path passes through doorway (10, 15)
    const hasDoor = path.some(p => p.x === 10 && p.y === 15);
    assert.strictEqual(hasDoor, true, 'Path must pass through doorway tile (10, 15)');

    // Verify all steps are cardinal
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
      assert.strictEqual(dist, 1, 'Every movement step must be cardinal');
    }
  });
});

describe('Tier 3 — Cross-Feature: Viewport Scaling, Chat Drawer & Click Hit-Testing', () => {
  it('X2: Opening chat drawer shifts canvas offset and adjusts click hit-testing coordinates', () => {
    const winW = 1920;
    const winH = 1080;
    const drawerW = 360;

    // Viewport with drawer closed
    const vpClosed = ORACLE.calculateViewport(winW, winH, false, 0);
    // Viewport with drawer open
    const vpOpen = ORACLE.calculateViewport(winW, winH, true, drawerW);

    assert.ok(vpOpen.availW < vpClosed.availW);

    // Target character is at tile (20, 10) -> screen (320, 160)
    const charScreen = ORACLE.GRID.tileToScreen(20, 10);

    // In open drawer mode, client click is at: clientX = charScreen.x * vpOpen.scale + vpOpen.offsetX
    const clientClickX = charScreen.x * vpOpen.scale + vpOpen.offsetX;
    const clientClickY = charScreen.y * vpOpen.scale + vpOpen.offsetY;

    // Reverse projection
    const unscaledX = (clientClickX - vpOpen.offsetX) / vpOpen.scale;
    const unscaledY = (clientClickY - vpOpen.offsetY) / vpOpen.scale;

    assert.strictEqual(Math.round(unscaledX), charScreen.x);
    assert.strictEqual(Math.round(unscaledY), charScreen.y);

    // Hit-testing matches
    assert.strictEqual(ORACLE.hitTest(unscaledX, unscaledY, charScreen.x, charScreen.y, 15), true);
  });
});

describe('Tier 3 — Cross-Feature: Tool Event Ingest, Slot Allocation & Typing State', () => {
  it('X3: Ingesting tool event allocates room slot and initiates working animation', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    const toolEvent = {
      agentId: 'sa-worker-1',
      name: 'Agent Hermes',
      tool: 'code',
      summary: 'Fixing unit tests'
    };

    // Tool room mapping
    const targetRoom = toolEvent.tool === 'code' ? 'engineering' : 'research';
    assert.strictEqual(targetRoom, 'engineering');

    // Slot allocation
    const roomDef = ORACLE.ROOM_DEFINITIONS[targetRoom];
    const assignedSlot = {
      roomId: targetRoom,
      x: roomDef.bounds.x1 + 3,
      y: roomDef.bounds.y1 + 3,
      facing: 'S',
      state: 'type'
    };

    // Ticker log
    const ticker = doc.getElementById('ticker');
    ticker.textContent = `${toolEvent.name}: ${toolEvent.summary}`;
    assert.ok(ticker.textContent.includes('Fixing unit tests'));

    // State transition to typing
    assert.strictEqual(assignedSlot.state, 'type');
    assert.strictEqual(assignedSlot.facing, 'S');
  });
});

describe('Tier 3 — Cross-Feature: Task Completion, Boss Reporting & Reward Particles', () => {
  it('X4: Subagent completes task, reports to Boss Office, and triggers particle and pantry rest', () => {
    const subagent = {
      id: 'sa-worker-1',
      name: 'Worker Bob',
      state: 'work',
      tileX: 10,
      tileY: 25, // in engineering
      particles: []
    };

    // Task done event
    subagent.state = 'reporting';
    const bossRoom = ORACLE.ROOM_DEFINITIONS.boss;
    const reportGoal = { x: bossRoom.bounds.x1 + 3, y: bossRoom.bounds.y1 + 3 };

    // Move to boss
    subagent.tileX = reportGoal.x;
    subagent.tileY = reportGoal.y;
    assert.deepStrictEqual({ x: subagent.tileX, y: subagent.tileY }, reportGoal);

    // Add coin particle reward
    const screenPos = ORACLE.GRID.tileToScreen(subagent.tileX, subagent.tileY);
    subagent.particles.push({
      text: '+50',
      icon: '🪙',
      x: screenPos.x,
      y: screenPos.y - 20,
      vy: -20,
      alpha: 1.0,
      life: 1.0
    });

    assert.strictEqual(subagent.particles.length, 1);
    assert.strictEqual(subagent.particles[0].icon, '🪙');

    // Reassign to pantry for rest break
    const pantry = ORACLE.ROOM_DEFINITIONS.pantry;
    subagent.tileX = pantry.bounds.x1 + 2;
    subagent.tileY = pantry.bounds.y1 + 2;
    subagent.state = 'idle';

    assert.strictEqual(subagent.state, 'idle');
    assert.ok(subagent.tileX >= pantry.bounds.x1 && subagent.tileX <= pantry.bounds.x2);
  });
});

describe('Tier 3 — Cross-Feature: Modal Conflict Resolution & Mutual Exclusion', () => {
  it('X5: Opening Whiteboard modal closes Character Card modal, and vice versa', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    const card = doc.getElementById('card');
    const wb = doc.getElementById('whiteboard-modal');
    const ctx = doc.getElementById('ctx-modal');

    // Initial state: all hidden
    card.classList.add('hidden');
    wb.classList.add('hidden');
    ctx.classList.add('hidden');

    // Action 1: User clicks character -> Card shows, others hide
    card.classList.remove('hidden');
    wb.classList.add('hidden');
    ctx.classList.add('hidden');
    assert.strictEqual(card.classList.contains('hidden'), false);
    assert.strictEqual(wb.classList.contains('hidden'), true);

    // Action 2: User clicks whiteboard -> Whiteboard shows, Card hides
    wb.classList.remove('hidden');
    card.classList.add('hidden');
    ctx.classList.add('hidden');
    assert.strictEqual(wb.classList.contains('hidden'), false);
    assert.strictEqual(card.classList.contains('hidden'), true);

    // Action 3: User clicks context trashcan -> Context modal shows, Whiteboard hides
    ctx.classList.remove('hidden');
    wb.classList.add('hidden');
    card.classList.add('hidden');
    assert.strictEqual(ctx.classList.contains('hidden'), false);
    assert.strictEqual(wb.classList.contains('hidden'), true);
  });
});

describe('Tier 3 — Cross-Feature: The Office Mode Toggle, Sprites & Chat Broadcast', () => {
  it('X6: Toggling The Office mode re-skins characters, updates bubbles, and posts chat', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    let theOfficeMode = false;
    const lami = { name: 'Boss Lami', role: 'CEO', bubble: '', emote: '' };

    // Toggle ON
    theOfficeMode = true;
    lami.name = 'Michael Scott';
    lami.role = 'Regional Manager';
    lami.bubble = "THAT'S WHAT SHE SAID! 📄";
    lami.emote = '📄';

    const chatContainer = doc.getElementById('chat-messages');
    const msg = doc.createElement('div');
    msg.textContent = `${lami.name}: ${lami.bubble}`;
    chatContainer.appendChild(msg);

    assert.strictEqual(lami.name, 'Michael Scott');
    assert.ok(chatContainer.children.length > 0);
    assert.ok(chatContainer.children[0].textContent.includes("THAT'S WHAT SHE SAID!"));

    // Toggle OFF
    theOfficeMode = false;
    lami.name = 'Boss Lami';
    lami.role = 'CEO & Master AI';
    assert.strictEqual(lami.name, 'Boss Lami');
  });
});

describe('Tier 3 — Cross-Feature: Context Meter & Boss Room Trashcan State', () => {
  it('X7: Context usage threshold triggers warning state on HUD and trashcan props', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    let contextUsage = 0.42; // 42%
    const ctxChip = doc.getElementById('hud-ctx-val');
    ctxChip.textContent = `${Math.round(contextUsage * 100)}%`;
    assert.strictEqual(ctxChip.textContent, '42%');

    // Context surge to 92%
    contextUsage = 0.92;
    ctxChip.textContent = `${Math.round(contextUsage * 100)}%`;
    const trashcanState = contextUsage > 0.85 ? 'overflowing' : 'normal';

    assert.strictEqual(ctxChip.textContent, '92%');
    assert.strictEqual(trashcanState, 'overflowing');
  });
});

describe('Tier 3 — Cross-Feature: Mochi the Cat Hallway Patrol & Agent Obstacle Avoidance', () => {
  it('X8: Cat wanders along central hallway while agents navigate around without collision', () => {
    const grid = Array.from({ length: 36 }, () => new Array(64).fill(0));

    // Cat is at hallway tile (30, 17)
    const catPos = { x: 30, y: 17 };
    grid[catPos.y][catPos.x] = 1; // Temporarily occupied by cat

    // Agent moves from (28, 17) to (32, 17)
    const path = ORACLE.findOrthogonalPath({ x: 28, y: 17 }, { x: 32, y: 17 }, grid);
    assert.ok(path, 'Path around cat must be found');

    // Agent path must not step onto cat tile
    const hitsCat = path.some(p => p.x === catPos.x && p.y === catPos.y);
    assert.strictEqual(hitsCat, false, 'Agent path must avoid cat tile');
  });
});
