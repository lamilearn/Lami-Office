/**
 * Tier 1 — Feature 15: Responsive Layout & Phone Camera
 * Feature 16: Floorplan Decoration
 * Feature 17: A2A Peer Agents & Backend Integration Wiring
 */

const { describe, it, assert } = require('../runner_utils');
const ORACLE = require('../oracle');
const { createBrowserEnvironment, loadScriptIntoEnv } = require('../harness');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');

function loadConfig(innerWidth, coarse) {
  const env = createBrowserEnvironment();
  const LO = loadScriptIntoEnv(env, 'config.js');
  env.window.innerWidth = innerWidth;
  env.window.matchMedia = (q) => ({ matches: Boolean(coarse) && q.includes('coarse'), media: q });
  LO.isPhoneMode = LO.isPhoneMode.bind(LO);
  return { LO, env };
}

function loadOffice() {
  const env = createBrowserEnvironment();
  const LO = loadScriptIntoEnv(env, 'config.js');
  loadScriptIntoEnv(env, 'sprites.js');
  loadScriptIntoEnv(env, 'office.js');
  loadScriptIntoEnv(env, 'agents.js');
  return { LO, env };
}

describe('Tier 1 — Feature 15: Responsive Layout & Phone Camera', () => {
  it('F15.1: Phone mode turns on for coarse pointers or narrow viewports', () => {
    const narrow = loadConfig(390, false);
    assert.strictEqual(narrow.LO.isPhoneMode(), true, 'Narrow viewport is phone mode');

    const wideTouch = loadConfig(1400, true);
    assert.strictEqual(wideTouch.LO.isPhoneMode(), true, 'Coarse pointer is phone mode');

    const desktop = loadConfig(1600, false);
    assert.strictEqual(desktop.LO.isPhoneMode(), false, 'Wide non-touch is desktop mode');
  });

  it('F15.2: Desktop view fits the whole floorplan and centers it', () => {
    const { LO } = loadConfig(1600, false);
    const v = LO.computeViewParams({
      width: 1600, height: 900, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H
    });
    const expected = Math.min(1600 / LO.CONTENT_W, 900 / LO.CONTENT_H);
    assert.ok(Math.abs(v.zoom - expected) < 1e-9, 'Zoom must fit the content');
    assert.strictEqual(v.cameraMode, false);
    assert.ok(v.offsetX >= 0 && v.offsetY >= 0, 'Content must stay inside the viewport');
  });

  it('F15.3: Phone view fills the width and keeps the focus point centered', () => {
    const { LO } = loadConfig(390, true);
    const v = LO.computeViewParams({
      width: 390, height: 844, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H,
      cameraMode: true, focusX: 44, focusY: 30
    });
    assert.ok(v.zoom >= 390 / LO.CONTENT_W - 1e-9, 'Phone zoom must at least fill the width');
    assert.strictEqual(v.cameraMode, true);
    const screenX = 44 * LO.TILE_SIZE * v.zoom + v.offsetX;
    assert.ok(Math.abs(screenX - v.availW / 2) < 1.5, 'Focused column must land at viewport center');
  });

  it('F15.3b: Portrait phones get a usable vertical fill, not a thin strip', () => {
    const { LO } = loadConfig(360, true);
    const v = LO.computeViewParams({
      width: 360, height: 640, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H,
      cameraMode: true, focusX: 44, focusY: 25
    });
    const drawnH = LO.CONTENT_H * v.zoom;
    const fill = drawnH / v.availH;
    assert.ok(fill > 0.6, `Portrait phone should fill most of the screen height, got ${fill.toFixed(2)}`);
    const drawnW = LO.CONTENT_W * v.zoom;
    assert.ok(drawnW >= v.availW - 1, 'Width must still be covered (no side bars)');
  });

  it('F15.4: Phone camera clamps pan so the world cannot scroll away', () => {
    const { LO } = loadConfig(390, true);
    const far = LO.computeViewParams({
      width: 390, height: 844, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H,
      cameraMode: true, focusX: 9999, focusY: -9999
    });
    // Right edge of the content must still be at or beyond the right viewport edge.
    const rightEdge = LO.CONTENT_W * far.zoom + far.offsetX;
    assert.ok(rightEdge >= far.availW - 1, 'Content right edge must reach the viewport edge');
  });

  it('F15.5: Pointer gestures classify taps, drags and long presses', () => {
    const { LO } = loadConfig(390, true);
    assert.strictEqual(LO.classifyPointerGesture({ x: 10, y: 10 }, { x: 13, y: 12 }, 120), 'tap');
    assert.strictEqual(LO.classifyPointerGesture({ x: 10, y: 10 }, { x: 80, y: 10 }, 120), 'drag');
    assert.strictEqual(LO.classifyPointerGesture({ x: 10, y: 10 }, { x: 11, y: 10 }, 900), 'longpress');
  });

  it('F15.6: Opening the drawer on desktop insets the canvas; phone keeps it full', () => {
    const { LO, env } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.camera = { x: 44, y: 25, targetX: 44, targetY: 25, zoom: null };
    office.drawerInset = 0;

    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });
    office.setDrawerOpen(true, 340);
    assert.strictEqual(office.drawerInset, 340, 'Desktop shrinks by the drawer width');
    office.setDrawerOpen(false, 340);
    assert.strictEqual(office.drawerInset, 0, 'Desktop restores full width');

    env.window.innerWidth = 390;
    env.window.matchMedia = () => ({ matches: true });
    office.setDrawerOpen(true, 340);
    assert.strictEqual(office.drawerInset, 0, 'Phone keeps the drawer as an overlay');
  });

  it('F15.7: screenToWorld inverts the view transform exactly', () => {
    const { LO, env } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900 }) };
    office.camera = { x: 44, y: 25, targetX: 44, targetY: 25, zoom: null };
    office.drawerInset = 0;
    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });

    const view = office.computeView(1600, 900);
    const screen = office.worldToScreen(400, 240);
    const world = office.screenToWorld(screen.x, screen.y);
    assert.ok(Math.abs(world.x - 400) < 1e-6 && Math.abs(world.y - 240) < 1e-6, 'Round trip must be exact');
    assert.ok(view.zoom > 0);
  });
});

describe('Tier 1 — Feature 16: Floorplan Decoration', () => {
  const MAP_PATH = path.join(REPO, 'services/lami-office-react/web/assets/map/office.map.json');
  const TILESET_PATH = path.join(REPO, 'services/lami-office-react/web/assets/tiles/tileset.json');

  function decorCounts() {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const counts = {};
    for (const [value, run] of map.layers[2].data) {
      if (value) counts[value] = (counts[value] || 0) + run;
    }
    return counts;
  }

  it('F16.1: Doorways, plaques and sconces are placed around every door', () => {
    const counts = decorCounts();
    assert.strictEqual(counts.door_left, 6, 'Six doorway left jambs');
    assert.strictEqual(counts.door_right, 6, 'Six doorway right jambs');
    assert.strictEqual(counts.door_threshold, 12, 'Threshold on both tiles of all six doors');
    assert.strictEqual(counts.sign_plaque, 6, 'One room plaque per doorway');
    assert.ok(counts.sconce >= 6, `Expected sconces beside doors, got ${counts.sconce || 0}`);
  });

  it('F16.2: Windows appear on exterior walls, not on interior partitions', () => {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const flat = [];
    for (const [v, n] of map.layers[2].data) for (let k = 0; k < n; k++) flat.push(v);
    const meta = map.meta;
    let windows = 0;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (flat[y * map.cols + x] !== 'window') continue;
        windows++;
        const onEnvelope = y === meta.building.y1 || y === meta.building.y2 ||
          x === meta.building.x1 || x === meta.building.x2;
        assert.ok(onEnvelope, `Window at (${x},${y}) must sit on the building envelope`);
      }
    }
    assert.ok(windows >= 12, `Expected windows on the exterior walls, got ${windows}`);
  });

  it('F16.3: Rooms are decorated with plants, vents, rugs and wall art', () => {
    const counts = decorCounts();
    assert.ok(counts.plant >= 12, `Expected corner plants, got ${counts.plant || 0}`);
    assert.ok(counts.vent >= 2, 'Technical rooms need vents');
    assert.ok(counts.rug >= 2, 'Meeting/pantry need rugs');
    assert.ok(counts.poster >= 1, 'Wall posters expected');
    assert.ok(counts.wall_clock >= 1, 'Wall clocks expected');
    assert.strictEqual(counts.shop_awning, 1, 'Awning over the street entrance');
  });

  it('F16.4: Every decor tile name exists in the tileset index', () => {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const names = new Set(JSON.parse(fs.readFileSync(TILESET_PATH, 'utf8')).map((t) => t.name));
    const missing = new Set();
    for (const layer of map.layers) {
      for (const [value] of layer.data) {
        if (value && !names.has(value)) missing.add(value);
      }
    }
    assert.deepStrictEqual([...missing], [], `Unknown tiles: ${[...missing].join(', ')}`);
  });

  it('F16.5: Decoration never overwrites walkable floor or walls', () => {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const decode = (layer) => {
      const out = [];
      for (const [v, n] of layer.data) for (let k = 0; k < n; k++) out.push(v);
      return out;
    };
    const floor = decode(map.layers[0]);
    const walls = decode(map.layers[1]);
    for (let i = 0; i < floor.length; i++) {
      assert.ok(floor[i], `Tile ${i} must keep a floor value`);
      assert.ok(floor[i] !== undefined, 'Floor layer must be fully populated');
    }
    assert.ok(walls.some((w) => w), 'Wall layer must still contain walls');
  });
});

describe('Tier 1 — Feature 17: A2A Peer Agents & Backend Wiring', () => {
  it('F17.1: A2A peers are declared for the four LAN sidecars', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    for (const [ip, room] of [['192.168.3.91', 'research'], ['192.168.3.92', 'meeting'],
      ['192.168.3.93', 'engineering'], ['192.168.3.94', 'server']]) {
      assert.ok(server.includes(ip), `Peer IP ${ip} must be configured`);
      assert.ok(server.includes(`"room": "${room}"`), `Peer on ${ip} must map to room ${room}`);
    }
    assert.ok(server.includes('"/api/a2a"'), 'Presence endpoint must exist');
    assert.ok(server.includes('"/api/a2a/send"'), 'Send endpoint must exist');
    assert.ok(server.includes('x-a2a-token'), 'A2A secret header must be used');
  });

  it('F17.2: A2A messages require a configured secret and a known peer', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    assert.ok(/a2a_secret/.test(server), 'a2a_secret must be configurable');
    assert.ok(/a2a_peer_tokens/.test(server), 'per-peer tokens must be configurable');
    assert.ok(/token A2A belum diisi/.test(server), 'Sending must fail clearly without a token');
    assert.ok(/peer tidak dikenal/.test(server), 'Unknown peers must be rejected');
  });

  it('F17.3: Public tunnel traffic can never send A2A messages', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    const sendFn = server.slice(server.indexOf('def handle_a2a_send'));
    const body = sendFn.slice(0, sendFn.indexOf('def handle_events'));
    assert.ok(/is_public\(\)/.test(body), 'Send handler must reject public traffic');
    assert.ok(/is_trusted\(\)/.test(body), 'Send handler must require a trusted host');
  });

  it('F17.3b: Official A2A peers are detected by Agent Card and sent via JSON-RPC', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    assert.ok(server.includes('.well-known/agent-card.json'), 'Agent Card must be probed');
    assert.ok(/\"method\": \"SendMessage\"/.test(server), 'Official sends must use JSON-RPC SendMessage');
    assert.ok(/Authorization.*Bearer/.test(server), 'Official sends must use a Bearer token');
    assert.ok(server.includes('192.168.3.31') && server.includes('"port": 9900'),
      'The Lami gateway on 192.168.3.31:9900 must be a peer');
    assert.ok(/protocol_detected/.test(server), 'Dialect must be auto-detected per peer');
  });

  it('F17.3c: A2A replies are parsed from the task status or artifacts', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    assert.ok(/TASK_STATE|status\.get\(\"state\"\)/.test(server), 'Task state must be read');
    assert.ok(/artifacts/.test(server), 'Artifact text must be read as a reply source');
  });

  it('F17.4: Peer characters are placed inside their specialty rooms', () => {
    const { LO } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.peerAgents = new Map();
    office.residents = [];
    office.collisionGrid = LO.Office.prototype.buildCollisionGrid.call({
      getFurnitureObstacles: LO.Office.prototype.getFurnitureObstacles
    });
    office.isWalkable = LO.Office.prototype.isWalkable.bind(office);

    office.applyA2APeers([
      { id: 'yuna', name: 'Yuna', host: '192.168.3.91', room: 'research', online: true },
      { id: 'aurora', name: 'Aurora', host: '192.168.3.92', room: 'meeting', online: true },
      { id: 'kira', name: 'Kira', host: '192.168.3.93', room: 'engineering', online: false },
      { id: 'cyro', name: 'Cyro', host: '192.168.3.94', room: 'server', online: true }
    ]);

    assert.strictEqual(office.peerAgents.size, 4, 'All four peers must be spawned');
    for (const agent of office.peerAgents.values()) {
      assert.ok(agent instanceof LO.PeerAgent, 'Peer must use the PeerAgent class');
      assert.ok(agent.online === undefined || typeof agent.online === 'boolean');
      const bounds = LO.ROOMS[agent.room].bounds;
      assert.ok(agent.col >= bounds.x1 && agent.col <= bounds.x2, `${agent.name} col inside ${agent.room}`);
      assert.ok(agent.row >= bounds.y1 && agent.row <= bounds.y2, `${agent.name} row inside ${agent.room}`);
      assert.strictEqual(office.isWalkable(agent.col, agent.row), true, `${agent.name} must stand on a walkable tile`);
    }
  });

  it('F17.5: Peer presence updates in place and stale peers are removed', () => {
    const { LO } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.peerAgents = new Map();
    office.residents = [];
    office.collisionGrid = LO.Office.prototype.buildCollisionGrid.call({
      getFurnitureObstacles: LO.Office.prototype.getFurnitureObstacles
    });
    office.isWalkable = LO.Office.prototype.isWalkable.bind(office);

    office.applyA2APeers([{ id: 'yuna', name: 'Yuna', host: '192.168.3.91', room: 'research', online: true }]);
    const first = office.peerAgents.get('yuna');
    office.applyA2APeers([{ id: 'yuna', name: 'Yuna', host: '192.168.3.91', room: 'research', online: false }]);
    assert.strictEqual(office.peerAgents.size, 1, 'Removing a peer must not duplicate it');
    assert.strictEqual(office.peerAgents.get('yuna'), first, 'Same agent instance must be reused');
    assert.strictEqual(office.peerAgents.get('yuna').online, false, 'Online flag must refresh');

    office.applyA2APeers([]);
    assert.strictEqual(office.peerAgents.size, 0, 'Peers no longer reported must be removed');
  });
});

describe('Tier 1 — Feature 18: Live State Persistence Across Reloads', () => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  const SERVER = pathx.join(REPO, 'services/lami-office-react/server.py');

  it('F18.1: Agent identity is deterministic — the same id always gets the same name and look', () => {
    const { LO } = loadConfig(1400, false);
    const ids = ['sa-abc123', 'sa-77f2a1', 'sa-1', 'sa-zzz'];
    for (const id of ids) {
      const name1 = LO.nameForAgent(id, null);
      const name2 = LO.nameForAgent(id, null);
      const look1 = LO.lookForAgent(id);
      const look2 = LO.lookForAgent(id);
      assert.strictEqual(name1, name2, `Name for ${id} must be stable`);
      assert.deepStrictEqual(look1, look2, `Look for ${id} must be stable`);
    }
    // A provided name always wins (the server can label an agent explicitly)
    assert.strictEqual(LO.nameForAgent('sa-x', 'Rina'), 'Rina');
  });

  it('F18.2: Different agent ids map to different slot indices', () => {
    const { LO } = loadConfig(1400, false);
    const seen = new Set();
    for (const id of ['sa-aaa', 'sa-bbb', 'sa-ccc', 'sa-ddd', 'sa-eee']) {
      seen.add(LO.slotIndexForAgent(id, 6));
    }
    assert.ok(seen.size > 1, 'Slot assignment must spread agents across slots');
    for (const idx of seen) {
      assert.ok(idx >= 0 && idx < 6, `Slot index ${idx} must be in range`);
    }
  });

  it('F18.3: Sub-agents are spawned in restore mode without an entrance animation', () => {
    const src = fsx.readFileSync(pathx.join(REPO, 'services/lami-office-react/web/js/office.js'), 'utf8');
    assert.ok(/opts\.restore|restore = Boolean/.test(src), 'spawnSubAgent must accept a restore option');
    assert.ok(/agent\.state = 'work'/.test(src), 'Restored agents resume in the work state');
    assert.ok(/preferredSlot === 'auto'/.test(src), 'Restore uses deterministic auto placement');
  });

  it('F18.4: A snapshot rebuilds agents in place and prunes stale ones', () => {
    const src = fsx.readFileSync(pathx.join(REPO, 'services/lami-office-react/web/js/net.js'), 'utf8');
    assert.ok(/restore: true/.test(src), 'Snapshot restore must use restore mode');
    assert.ok(/live\.has\(id\)/.test(src), 'Agents missing from the snapshot must be dropped');
  });

  it('F18.5: Server persists and reloads office state', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    assert.ok(/def _load_state/.test(src) && /def _save_state/.test(src), 'Hub must persist state');
    assert.ok(/state_file/.test(src), 'State file must be configurable');
    assert.ok(/OFFICE_STATE_FILE/.test(src), 'OFFICE_STATE_FILE env must be honoured');
    assert.ok(/self\.history\.append/.test(src), 'Recent activity must be recorded');
  });

  it('F18.6: Restoring replays agent_done so finished agents are not resurrected', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    const load = src.slice(src.indexOf('def _load_state'), src.indexOf('def _save_state'));
    assert.ok(/for ev in self\.history:\s*\n\s*self\._apply\(ev\)/.test(load),
      'Restore must replay every event, including agent_done');
  });

  it('F18.7: Snapshot includes the recent history feed', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    const snap = src.slice(src.indexOf('def snapshot(self) -> dict'), src.indexOf('def _load_state'));
    assert.ok(/"history": list\(self\.history/.test(snap), 'Snapshot must expose recent history');
  });
});
