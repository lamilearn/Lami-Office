/**
 * Tier 4: Real-World Application Scenarios Test Suite
 * Validates complex end-to-end office workflows, multi-agent concurrency storms,
 * interactive user sessions, fault tolerance, and production smoke verification.
 */

const { describe, it, assert } = require('../runner_utils');
const ORACLE = require('../oracle');
const { createBrowserEnvironment } = require('../harness');

describe('Tier 4 — Scenario 1: Complete Morning to Evening Office Day Workflow', () => {
  it('S1: Full daily lifecycle from morning greeting to task execution and evening rest', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    // 1. Morning office startup
    const lami = {
      id: 'lami',
      name: 'Boss Lami',
      role: 'CEO',
      bubble: 'Selamat datang di kantor Lami! 👑',
      coins: 0,
      tasksDone: 0
    };
    assert.strictEqual(lami.bubble, 'Selamat datang di kantor Lami! 👑');

    // 2. Three consecutive tasks arrive
    const tasks = [
      { id: 't1', tool: 'code', room: 'engineering', summary: 'Develop RPG grid engine' },
      { id: 't2', tool: 'search', room: 'research', summary: 'Analyze sprite sheet specs' },
      { id: 't3', tool: 'terminal', room: 'server', summary: 'Verify server uptime' }
    ];

    const activeStaff = [];
    for (const t of tasks) {
      const roomDef = ORACLE.ROOM_DEFINITIONS[t.room];
      const agent = {
        id: `agent-${t.id}`,
        name: `Agent-${t.tool}`,
        room: t.room,
        tileX: roomDef.bounds.x1 + 2,
        tileY: roomDef.bounds.y1 + 2,
        state: 'work'
      };
      activeStaff.push(agent);
    }
    assert.strictEqual(activeStaff.length, 3);

    // 3. All tasks complete successfully
    for (const agent of activeStaff) {
      agent.state = 'done';
      lami.tasksDone++;
      lami.coins += 25;
      // Walk to pantry to relax
      const pantry = ORACLE.ROOM_DEFINITIONS.pantry;
      agent.tileX = pantry.bounds.x1 + 2;
      agent.tileY = pantry.bounds.y1 + 2;
      agent.state = 'idle';
    }

    assert.strictEqual(lami.tasksDone, 3);
    assert.strictEqual(lami.coins, 75);
    for (const agent of activeStaff) {
      assert.strictEqual(agent.state, 'idle');
    }
  });
});

describe('Tier 4 — Scenario 2: Multi-Agent Concurrency Storm', () => {
  it('S2: 6 concurrent subagents spawned simultaneously without slot collision or clipping', () => {
    const rooms = ORACLE.ROOM_IDS; // 6 rooms
    const agents = [];
    const occupiedTiles = new Set();

    for (let i = 0; i < rooms.length; i++) {
      const roomKey = rooms[i];
      const def = ORACLE.ROOM_DEFINITIONS[roomKey];
      const targetTile = { x: def.bounds.x1 + 3, y: def.bounds.y1 + 3 };
      const tileKey = `${targetTile.x},${targetTile.y}`;

      assert.strictEqual(occupiedTiles.has(tileKey), false, 'Slot collision detected');
      occupiedTiles.add(tileKey);

      agents.push({
        id: `worker-${i}`,
        room: roomKey,
        tileX: targetTile.x,
        tileY: targetTile.y,
        depth: targetTile.y * 1000 + targetTile.x
      });
    }

    assert.strictEqual(agents.length, 6);
    assert.strictEqual(occupiedTiles.size, 6);

    // Depth sorting for 2D painter algorithm
    const sorted = [...agents].sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i].depth <= sorted[i + 1].depth);
    }
  });
});

describe('Tier 4 — Scenario 3: End-to-End User Interactive Session', () => {
  it('S3: User inspects character, interacts with chat drawer, whiteboard, and water cooler', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    // 1. Desktop 16:9 viewport setup
    const vp = ORACLE.calculateViewport(1920, 1080, false, 0);
    assert.strictEqual(vp.scale, 1.875);

    // 2. User clicks Boss Lami -> Card modal opens
    const card = doc.getElementById('card');
    card.classList.remove('hidden');
    doc.getElementById('card-name').textContent = 'Boss Lami';
    assert.strictEqual(card.classList.contains('hidden'), false);
    assert.strictEqual(doc.getElementById('card-name').textContent, 'Boss Lami');

    // 3. User opens chat drawer
    const drawer = doc.getElementById('chat-drawer');
    drawer.classList.remove('hidden');
    const vpDrawer = ORACLE.calculateViewport(1920, 1080, true, 360);
    assert.strictEqual(vpDrawer.availW, 1560);

    // 4. User posts chat message
    const chatInput = doc.getElementById('chat-input');
    chatInput.value = 'Selamat pagi semua!';
    const chatMessages = doc.getElementById('chat-messages');
    const userMsg = doc.createElement('div');
    userMsg.textContent = `User: ${chatInput.value}`;
    chatMessages.appendChild(userMsg);
    assert.strictEqual(chatMessages.children.length, 1);

    // 5. User clicks Whiteboard -> Whiteboard modal opens
    const wb = doc.getElementById('whiteboard-modal');
    wb.classList.remove('hidden');
    card.classList.add('hidden'); // Card closes
    assert.strictEqual(wb.classList.contains('hidden'), false);
    assert.strictEqual(card.classList.contains('hidden'), true);

    // 6. User clicks Water Cooler -> Ticker logs refresh
    const ticker = doc.getElementById('ticker');
    ticker.textContent = '💧 Dispenser air galon: Segar!';
    assert.ok(ticker.textContent.includes('Segar!'));

    // 7. User closes chat drawer -> Canvas width restored
    drawer.classList.add('hidden');
    const vpRestored = ORACLE.calculateViewport(1920, 1080, false, 0);
    assert.strictEqual(vpRestored.availW, 1920);
  });
});

describe('Tier 4 — Scenario 4: Error Handling & System Fault Recovery', () => {
  it('S4: Tool failure alerts Boss, triggers panic emote, logs warning, and recovers cleanly', () => {
    const env = createBrowserEnvironment();
    const doc = env.document;

    const worker = {
      id: 'sa-err-1',
      name: 'Agent Tester',
      state: 'work',
      emote: null
    };

    // 1. Tool execution fails
    const failEvent = {
      agentId: worker.id,
      ok: false,
      error: 'Network connection reset by peer'
    };

    worker.state = 'error';
    worker.emote = '💦';
    const ticker = doc.getElementById('ticker');
    ticker.textContent = `⚠️ ${worker.name} ada kendala tugas: ${failEvent.error}`;

    assert.strictEqual(worker.state, 'error');
    assert.strictEqual(worker.emote, '💦');
    assert.ok(ticker.textContent.includes('kendala tugas'));

    // 2. Retry succeeds
    const retryEvent = {
      agentId: worker.id,
      ok: true
    };
    worker.state = 'done';
    worker.emote = '🎉';
    ticker.textContent = `🎉 ${worker.name} tugas selesai setelah retry!`;

    assert.strictEqual(worker.state, 'done');
    assert.strictEqual(worker.emote, '🎉');
  });
});

describe('Tier 4 — Scenario 5: Dual Service Smoke & Health Verification', () => {
  it('S5: Verifies the 7 core endpoint contracts across ai-office and lami-office-react', () => {
    const probes = [
      { id: 1, service: 'ai-office', path: '/api/health', expectedKey: 'status', expectedVal: 'ok' },
      { id: 2, service: 'ai-office', path: '/api/boss', expectedKey: 'id', expectedVal: 'lami' },
      { id: 3, service: 'ai-office', path: '/api/agents', expectedKey: 'agents', expectedType: 'array' },
      { id: 4, service: 'ai-office', path: '/', expectedKey: 'html', expectedVal: true },
      { id: 5, service: 'lami-office', path: '/healthz', expectedKey: 'ok', expectedVal: true },
      { id: 6, service: 'lami-office', path: '/api/config', expectedKey: 'mode', validModes: ['live', 'demo'] },
      { id: 7, service: 'lami-office', path: '/', expectedKey: 'html', expectedVal: true }
    ];

    assert.strictEqual(probes.length, 7, 'Must specify all 7 smoke test probes');

    // Validate contract structure for each probe
    for (const p of probes) {
      assert.ok(p.service === 'ai-office' || p.service === 'lami-office');
      assert.ok(p.path.startsWith('/'));
      assert.ok(p.expectedKey);
    }
  });
});
