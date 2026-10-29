/**
 * Tier 1 — Server-authoritative world.
 *
 * The office is simulated once in Python (`world.py`) and every visitor renders
 * the frames. These tests pin the two invariants that make that safe:
 *   1. the Python port agrees with the client engine (grid, routes, config), so
 *      the server cannot walk characters through walls;
 *   2. the browser never simulates while the server is authoritative, so the
 *      tabs cannot drift apart or double-print narration.
 */

const { describe, it, assert } = require('../runner_utils');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const WORLD_PY = path.join(REPO, 'services/lami-office-react/world.py');
const OFFICE_JS = path.join(REPO, 'services/lami-office-react/web/js/office.js');
const NET_JS = path.join(REPO, 'services/lami-office-react/web/js/net.js');
const PY = process.env.PYTHON || 'python3';

function havePython() {
  try {
    return spawnSync(PY, ['--version'], { encoding: 'utf8', timeout: 8000 }).status === 0;
  } catch (_) {
    return false;
  }
}
const HAVE_PY = havePython();

// Runs a small python program with world.py importable and returns its JSON.
function pyJson(script, timeout = 60000) {
  const res = spawnSync(PY, ['-c', script], {
    cwd: path.join(REPO, 'services/lami-office-react'),
    encoding: 'utf8',
    timeout
  });
  if (res.status !== 0) {
    throw new Error(`python failed:\n${(res.stderr || res.stdout || '').slice(-1200)}`);
  }
  const lines = (res.stdout || '').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

// The same collision grid, computed by the client code in a VM sandbox.
function jsGrid() {
  const vm = require('node:vm');
  const cfg = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/config.js'), 'utf8');
  const office = fs.readFileSync(OFFICE_JS, 'utf8');
  const sandbox = { window: {}, console, Math, URLSearchParams };
  sandbox.window.LO = {};
  vm.createContext(sandbox);
  vm.runInContext(cfg, sandbox);

  const sliceMethod = (src, name) => {
    const start = src.indexOf(`    ${name}(`);
    const open = src.indexOf('{', src.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (!depth) return src.slice(open + 1, i); }
    }
    throw new Error(`unbalanced ${name}`);
  };
  const ctx = {
    getFurnitureObstacles: () => new Function('LO', sliceMethod(office, 'getFurnitureObstacles'))
      .call({}, sandbox.window.LO)
  };
  return new Function('LO', sliceMethod(office, 'buildCollisionGrid')).call(ctx, sandbox.window.LO);
}

const ROUTES = [
  [2, 21, 34, 10], [2, 21, 42, 21], [14, 6, 14, 19], [14, 6, 70, 19], [34, 10, 14, 9],
  [70, 15, 7, 28], [41, 29, 76, 30], [64, 9, 4, 31], [63, 28, 52, 31], [20, 6, 14, 6],
  [77, 34, 8, 11], [52, 15, 32, 6], [61, 15, 67, 36], [14, 9, 42, 29], [23, 31, 66, 34],
  [2, 21, 83, 22], [49, 3, 2, 39], [76, 11, 35, 15], [8, 11, 64, 34], [14, 19, 14, 23]
];

// Walk cost in the same units A* uses: 1 per step, 0.6 per turn.
function routeCost(points) {
  let cost = 0;
  let prevDir = null;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const dir = dx === 0 ? (dy < 0 ? 0 : 1) : (dx > 0 ? 2 : 3);
    cost += Math.abs(dx) + Math.abs(dy);
    if (prevDir !== null && prevDir !== dir) cost += 0.6;
    prevDir = dir;
  }
  return cost;
}

describe('Feature 21: World parity between the server port and the client engine', () => {
  it('F21.1: world.py collision grid is identical to office.js', () => {
    if (!HAVE_PY) return;
    const py = pyJson(`
import json, world
print(json.dumps([list(r) for r in world.GRID]))
`);
    const js = jsGrid().map((row) => Array.from(row));
    assert.deepStrictEqual(py, js, 'a differing grid means the server would path through walls');
  }, { timeout: 60000 });

  it('F21.2: every A* route is valid, walkable and the same length as the client', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, world
grid = [list(r) for r in world.GRID]
pairs = ${JSON.stringify(ROUTES)}
res = []
for sx, sy, gx, gy in pairs:
    p = world.find_orthogonal_path({'x': sx, 'y': sy}, {'x': gx, 'y': gy}, grid)
    res.append([[n['x'], n['y']] for n in p] if p else None)
print(json.dumps(res))
`);
    const vm = require('node:vm');
    const cfg = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/config.js'), 'utf8');
    const sandbox = { window: {}, console, Math, URLSearchParams };
    sandbox.window.LO = {};
    vm.createContext(sandbox);
    vm.runInContext(cfg, sandbox);
    const grid = jsGrid();

    const jsRoutes = ROUTES.map(([sx, sy, gx, gy]) => {
      const p = sandbox.window.LO.findOrthogonalPath({ x: sx, y: sy }, { x: gx, y: gy }, grid);
      return p ? p.map((n) => [n.x, n.y]) : null;
    });

    let equal = 0;
    ROUTES.forEach((coords, i) => {
      const py = out[i];
      const js = jsRoutes[i];
      assert.ok(py, `server must find a route for ${coords.join(',')}`);
      assert.ok(js, `client must find a route for ${coords.join(',')}`);
      // Ends snap to the nearest walkable tile when a goal sits on furniture,
      // so compare against the snapped ends, not the raw request.
      assert.deepStrictEqual(grid[py[0][1]][py[0][0]], 0, 'the route must start on a walkable tile');
      assert.deepStrictEqual(grid[py[py.length - 1][1]][py[py.length - 1][0]], 0,
        'the route must end on a walkable tile');
      assert.strictEqual(Math.abs(py[0][0] - coords[0]) + Math.abs(py[0][1] - coords[1]) <= 8, true,
        'the start must not snap further than the search radius');
      assert.strictEqual(Math.abs(py[py.length - 1][0] - coords[2]) + Math.abs(py[py.length - 1][1] - coords[3]) <= 8, true,
        'the goal must not snap further than the search radius');
      // Every step must be an orthogonal hop across walkable tiles.
      for (let s = 1; s < py.length; s++) {
        const dx = Math.abs(py[s][0] - py[s - 1][0]);
        const dy = Math.abs(py[s][1] - py[s - 1][1]);
        assert.ok(dx + dy > 0, 'waypoints must advance');
        const mx = py[s - 1][0] + Math.sign(py[s][0] - py[s - 1][0]) * (dx ? 1 : 0);
        const my = py[s - 1][1] + Math.sign(py[s][1] - py[s - 1][1]) * (dy ? 1 : 0);
        assert.strictEqual(grid[my][mx], 0, `waypoint ${py[s]} crosses a solid tile`);
      }
      // Equal cost: ties may pick another corner, but never a longer walk.
      assert.ok(Math.abs(routeCost(py) - routeCost(js)) < 1e-9,
        `route cost differs for ${coords.join(',')}: py=${routeCost(py)} js=${routeCost(js)}`);
      if (JSON.stringify(py) === JSON.stringify(js)) equal++;
    });
    // Ties are decided by insertion order; the vast majority must be identical.
    assert.ok(equal >= ROUTES.length - 3, `only ${equal}/${ROUTES.length} routes match exactly`);
  }, { timeout: 60000 });

  it('F21.3: world.py stays in sync with config.js (rooms, slots, residents, routines, furniture)', () => {
    if (!HAVE_PY) return;
    const res = spawnSync(PY, [path.join(REPO, 'scripts/check_world_sync.py')], {
      encoding: 'utf8', timeout: 60000
    });
    assert.strictEqual(res.status, 0, `drift detected:\n${(res.stderr || '').slice(-1500)}`);
    assert.ok(/in sync/.test(res.stdout), 'the sync check must confirm the match');
  }, { timeout: 60000 });

  it('F21.4: every resident can reach its own desk and every routine spot', () => {
    if (!HAVE_PY) return;
    const bad = pyJson(`
import json, world
grid = [list(r) for r in world.GRID]
door = {'x': world.DOOR_COL, 'y': world.DOOR_ROW}
bad = []
for spec in world.RESIDENTS:
    slot = world.SLOTS[spec['room']][spec['slot']]
    if not world.find_orthogonal_path(door, {'x': slot['x'], 'y': slot['y']}, grid):
        bad.append([spec['id'], 'desk'])
for spec in world.RESIDENTS:
    for r in world.PERSONAL_ROUTINES.get(spec['id'], []) + world.ROOM_ROUTINES.get(spec['room'], []):
        if not world.find_orthogonal_path(door, {'x': r['col'], 'y': r['row']}, grid):
            bad.append([spec['id'], r['id']])
for r in world.LAMI_ROUTINES:
    if not world.find_orthogonal_path(door, {'x': r['col'], 'y': r['row']}, grid):
        bad.append(['lami', r['id']])
print(json.dumps(bad))
`);
    assert.deepStrictEqual(bad, [], `unreachable spots: ${JSON.stringify(bad)}`);
  }, { timeout: 60000 });
});

describe('Feature 22: The browser renders the server world instead of simulating it', () => {
  const officeSrc = () => fs.readFileSync(OFFICE_JS, 'utf8');
  const netSrc = () => fs.readFileSync(NET_JS, 'utf8');

  it('F22.1: update() stops simulating characters while the server is authoritative', () => {
    const src = officeSrc();
    const body = src.slice(src.indexOf('    update(dt) {'), src.indexOf('    updateSocials(dt) {'));
    const guardAt = body.indexOf('this.simulatedExternally');
    assert.ok(guardAt > -1, 'update() must check simulatedExternally');
    const lamiAt = body.indexOf('this.lami.update(dt, this)');
    assert.ok(guardAt < lamiAt, 'the guard must short-circuit before any character update');
    assert.ok(/applyWorldTargets\(dt\)/.test(body), 'live mode must ease toward server positions');
  });

  it('F22.2: a world frame is applied and interpolated, not teleported', () => {
    const src = officeSrc();
    const apply = src.slice(src.indexOf('    applyWorld(frame) {'), src.indexOf('    // ---- Loop ----'));
    assert.ok(/worldTargets\.set/.test(apply), 'applyWorld must record interpolation targets');
    assert.ok(/syncWorldAgents\(frame\)/.test(apply), 'applyWorld must rebuild sub-agents from the frame');
    const targets = src.slice(src.indexOf('    applyWorldTargets(dt) {'), src.indexOf('    // ---- Loop ----'));
    assert.ok(/char\.col \+= dc \* ease/.test(targets), 'positions must ease toward the target');
    assert.ok(/Math\.hypot\(dc, dr\) > 8/.test(targets), 'a jump (fresh page) must snap, not slide across the office');
  });

  it('F22.3: net.js enables live mode, loads /api/world and handles ticker/banner', () => {
    const src = netSrc();
    assert.ok(/simulatedExternally = true/.test(src), 'connecting must hand simulation to the server');
    assert.ok(/loadWorld\(\)/.test(src) && /\/api\/world/.test(src), 'the first paint must fetch /api/world');
    assert.ok(/case 'world':/.test(src), 'world frames must be dispatched');
    assert.ok(/case 'ticker':/.test(src), 'server-authored tickers must be shown');
    assert.ok(/case 'event_banner':/.test(src), 'server-authored banners must be shown');
    assert.ok(/simulatedExternally = false/.test(src), 'an offline stream must fall back to local simulation');
  });

  it('F22.4: server narration is not duplicated by the local event handlers', () => {
    const src = netSrc();
    const msgCase = src.slice(src.indexOf("case 'message':"), src.indexOf("case 'ticker':"));
    assert.ok(/appendChatMessage/.test(msgCase), 'the server message must be printed');
    assert.ok(!/setBubble/.test(msgCase), 'the client must not also animate the message locally');
  });

  it('F22.5: demo mode keeps the local simulation alive', () => {
    const demo = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/demo.js'), 'utf8');
    const start = demo.slice(demo.indexOf('    start() {'), demo.indexOf('    stop() {'));
    assert.ok(/simulatedExternally = false/.test(start), 'demo mode must own the simulation');
  });

  it('F22.6: the server broadcast has a private channel (not counted as history)', () => {
    const src = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    const block = src.slice(src.indexOf('    def publish_world(self, frame: dict):'),
      src.indexOf('    def _apply(self, ev: dict):'));
    assert.ok(/self\.subs/.test(block), 'world frames go straight to subscribers');
    assert.ok(!/self\.history\.append/.test(block), 'world frames must not pollute the event history');
    assert.ok(!/events_total/.test(block), 'world frames must not inflate the event counter');
    assert.ok(/sim_loop/.test(src), 'a simulation thread must run');
    assert.ok(/threading\.Thread\(target=sim_loop/.test(src), 'the simulation thread must be started');
  });
});

describe('Feature 23: The office narrates only what Hermes did', () => {
  it('F23.1: staff ambience produces no chat or banners on a quiet floor', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, world
sim = world.Sim(seed=11)
for _ in range(600):          # 60 s of simulated time
    sim.tick(0.1)
events = sim.drain_outbox()
print(json.dumps({
    "banners": sum(1 for e in events if e["type"] == "event_banner"),
    "messages": sum(1 for e in events if e["type"] == "message"),
}))
`);
    assert.strictEqual(out.banners, 0, 'invented office events must be off by default');
    assert.strictEqual(out.messages, 0, 'staff must not emit invented chat lines');
  }, { timeout: 90000 });

  it('F23.2: real Hermes events still narrate', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, world
sim = world.Sim(seed=12)
sim.handle_event({"type": "agent_spawn", "agentId": "sa-x", "task": "cek web"})
sim.handle_event({"type": "tool_start", "agentId": "sa-x", "tool": "web_search", "summary": "cari docs"})
events = sim.drain_outbox()
print(json.dumps({"messages": sum(1 for e in events if e["type"] == "message"),
                  "tickers": sum(1 for e in events if e["type"] == "ticker")}))
`);
    assert.ok(out.messages > 0, 'Hermes activity must be narrated');
    assert.ok(out.tickers > 0, 'Hermes activity must reach the ticker');
  }, { timeout: 60000 });

  it('F23.3: roster reconciliation is idempotent and follows tool changes', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, world
sim = world.Sim(seed=13)
roster = [{"id": "sa-a", "name": "Budi", "task": "cek", "tool": "web_search", "status": "working"}]
sim.sync_roster(roster, [])
sim.sync_roster(roster, [])
rooms_1 = {k: v.assigned_slot["roomId"] for k, v in sim.subagents.items()}
sim.sync_roster([{"id": "sa-a", "name": "Budi", "task": "cek", "tool": "terminal", "status": "working"}], [])
rooms_2 = {k: v.assigned_slot["roomId"] for k, v in sim.subagents.items()}
sim.sync_roster([], [])
reported = {k: bool(getattr(v, "reported", False)) for k, v in sim.subagents.items()}
print(json.dumps({
  "count_after_duplicate": len(rooms_1), "rooms_1": rooms_1, "rooms_2": rooms_2,
  "reported_when_gone": reported,
}))
`);
    assert.strictEqual(out.count_after_duplicate, 1, 'a duplicated roster entry must not clone the agent');
    assert.strictEqual(out.rooms_1['sa-a'], 'research');
    assert.strictEqual(out.rooms_2['sa-a'], 'engineering', 'a tool change must move the agent');
    assert.strictEqual(out.reported_when_gone['sa-a'], true, 'a vanished agent must be sent home');
  }, { timeout: 60000 });

  it('F23.4: online A2A peers join the roster in their real room', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, world
sim = world.Sim(seed=14)
sim.sync_roster([{"id": "sa-real", "name": "Budi", "task": "cek", "tool": "web_search", "status": "working"}],
                [{"id": "yuna", "name": "Yuna", "online": True, "room": "research", "skills": ["finance"]},
                 {"id": "kira", "name": "Kira", "online": False, "room": "server"}])
rooms = {k: v.assigned_slot["roomId"] for k, v in sim.subagents.items()}
kinds = {c["id"]: c["kind"] for c in sim.world_frame()["chars"] if c["id"] in ("sa-real", "peer-yuna")}
print(json.dumps({"rooms": rooms, "kinds": kinds}))
`);
    out.rooms = out.rooms || out;
    assert.strictEqual(out.rooms['peer-yuna'], 'research', 'an online peer must be on the floor');
    assert.strictEqual(out.rooms['peer-kira'], undefined, 'an offline peer must not be shown as present');
    // Regression: SubAgent.to_world() used to hardcode kind="sub", so A2A peers
    // were rendered as delegated workers instead of peers.
    assert.strictEqual(out.kinds['peer-yuna'], 'peer', 'an A2A peer must stay kind=peer in the frame');
    assert.strictEqual(out.kinds['sa-real'], 'sub', 'a delegated agent must stay kind=sub');
  }, { timeout: 60000 });

  it('F23.5: the status reports idle when nothing arrived, live when it did', () => {
    if (!HAVE_PY) return;
    const src = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    const fn = src.slice(src.indexOf('def world_status()'), src.indexOf('def sim_loop()'));
    assert.ok(/age > 300/.test(fn) && /"idle"/.test(fn), 'stale inactivity must read as idle');
    assert.ok(/age > 120/.test(fn), 'a slow feed must be distinguished from a live one');
    assert.ok(/events_handled/.test(fn), 'the status must prove events reached the simulation');
    assert.ok(/HUB\.agents/.test(fn), 'agents_active must come from the real roster');
  });
});

describe('Feature 24: Characters never freeze while walking', () => {
  it('F24.1: nobody keeps a path and state=walk while standing still', () => {
    if (!HAVE_PY) return;
    // Regression for the frozen office: the collision probe used the sign of the
    // velocity instead of the movement, so a body touching a wall face zeroed
    // both axes and then blocked itself forever. On staging this left 17 of 19
    // characters standing still with a full path and state="walk".
    const out = pyJson(`
import json, world

report = {}
for seed in (7, 99, 2024):
    sim = world.Sim(seed=seed)
    for _ in range(400):
        sim.tick(0.1)
    before = {c.id: (c.col, c.row) for c in sim.all_moving()}
    for _ in range(80):          # 8 seconds
        sim.tick(0.1)
    frozen = [
        c.id for c in sim.all_moving()
        if c.id in before
        and (c.col, c.row) == before[c.id]
        and c.state == "walk"
        and c.path
    ]
    report[seed] = frozen
print(json.dumps(report))
`);
    for (const [seed, frozen] of Object.entries(out)) {
      assert.deepStrictEqual(frozen, [],
        `seed ${seed}: characters froze mid-walk: ${JSON.stringify(frozen)}`);
    }
  }, { timeout: 180000 });

  it('F24.2: the waypoint is finished when the body cannot advance', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, world
sim = world.Sim(seed=5)
c = sim.residents[0]
# Park the body against a wall face with one waypoint left, exactly like the
# staging freeze: it has a path, state=walk, and cannot move.
c.col, c.row = 32.61, 9.999
c.path = [{"x": 34, "y": 10}]
c.path_goal = {"x": 34, "y": 10}
c.target_col, c.target_row = 34, 10
c.state = "walk"
c.vx = c.vy = 0.0
for _ in range(40):
    sim.tick(0.1)
moved = abs(c.col - 32.61) + abs(c.row - 9.999)
print(json.dumps({"moved": round(moved, 3), "path_left": len(c.path),
                  "walkable": world.is_walkable(c.col, c.row)}))
`);
    assert.ok(out.moved > 0.5, `a wall-pinned character must resume walking, moved ${out.moved}`);
    assert.strictEqual(out.walkable, true, 'it must never be left inside a solid tile');
  }, { timeout: 60000 });

  it('F24.3: the collision probe keys off movement, not the velocity sign', () => {
    const src = fs.readFileSync(WORLD_PY, 'utf8');
    const block = src.slice(src.indexOf('step_col0, step_row0'), src.indexOf('# Stuck recovery'));
    assert.ok(/step_x = next_col - self\.col/.test(block), 'the probe must use the actual delta');
    assert.ok(/if abs\(step_x\) > 1e-9/.test(block), 'a zero delta must not probe the tile behind');
    assert.ok(!/next_col \+ self\.radius\) if self\.vx > 0/.test(block),
      'the old velocity-sign probe froze characters against walls');
  });
});

describe('Feature 26: The client renders every simulated character', () => {
  const OFFICE = path.join(REPO, 'services/lami-office-react/web/js/office.js');

  it('F26.1: A2A peers are created from a world frame, not only sub-agents', () => {
    const src = fs.readFileSync(OFFICE, 'utf8');
    const block = src.slice(src.indexOf('    syncWorldAgents(frame) {'),
      src.indexOf('    applyWorld(frame) {'));
    assert.ok(/c\.kind !== 'sub' && c\.kind !== 'peer'/.test(block),
      'peers arrive in the frame and must be instantiated like sub-agents');
    assert.ok(/agent\.kind = c\.kind/.test(block),
      'the created agent must keep the peer kind for rendering');
    // Regression: filtering on kind === "sub" alone silently dropped every peer,
    // so their positions arrived but nothing was drawn on the floor.
    assert.ok(!/if \(c\.kind !== 'sub'\) continue;/.test(block),
      'peers must not be skipped');
  });

  it('F26.2: every char id in a frame resolves to a rendered character', () => {
    const src = fs.readFileSync(OFFICE, 'utf8');
    const findChar = src.slice(src.indexOf('    findChar(id) {'), src.indexOf('    syncWorldAgents(frame) {'));
    for (const kind of ['lami', 'mochi', 'delivery-rider']) {
      assert.ok(findChar.includes(`'${kind}'`), `findChar must resolve ${kind}`);
    }
    assert.ok(/this\.subagents\.has\(id\)/.test(findChar), 'sub-agents and peers live in subagents');
    assert.ok(/this\.residents\.find/.test(findChar), 'residents must resolve by id');
  });
});

describe('Feature 27: Agents never share a tile and keep their identity', () => {
  it('F27.1: two agents walking one route stay separated', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, math, world
sim = world.Sim(seed=1)
sim.sync_roster([], [{"id": "yuna", "name": "Yuna", "online": True, "room": "research", "skills": ["f"]},
                     {"id": "kira", "name": "Kira", "online": True, "room": "server", "skills": ["s"]}])
worst = 99.0
first = 0.0
for step in range(250):
    sim.tick(0.1)
    p = list(sim.subagents.values())
    d = math.hypot(p[0].col - p[1].col, p[0].row - p[1].row)
    if step == 0:
        first = d
    worst = min(worst, d)
print(json.dumps({"first": round(first, 2), "worst": round(worst, 2)}))
`);
    // Two bodies spawned in the same doorway must not stay stacked while they
    // walk the same corridor (they were pixel-identical for the whole route).
    assert.ok(out.first > 0.05, `agents started stacked (sep ${out.first})`);
    assert.ok(out.worst > 0.4, `agents overlapped during the walk (min sep ${out.worst})`);
  }, { timeout: 120000 });

  it('F27.2: peers survive a restart as peers, in their own seats', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, math, world
sim = world.Sim(seed=1)
sim.sync_roster([{"id": "sa-a", "name": "Budi", "task": "cek", "tool": "terminal", "status": "working"}],
                [{"id": "yuna", "name": "Yuna", "online": True, "room": "research", "skills": ["f"]}])
for _ in range(150):
    sim.tick(0.1)
snap = json.loads(json.dumps(sim.state_snapshot()))
before = {c.id: (c.col, c.row, getattr(c, "kind", "sub")) for c in sim.all_moving()
          if c.id in ("sa-a", "peer-yuna")}
sim2 = world.Sim(seed=2)
sim2.restore(snap)
after = {c.id: (c.col, c.row, getattr(c, "kind", "sub")) for c in sim2.all_moving()
         if c.id in before}
drift = {k: round(math.hypot(after[k][0] - before[k][0], after[k][1] - before[k][1]), 2)
         for k in before if k in after}
kinds = {k: after[k][2] for k in after}
print(json.dumps({"drift": drift, "kinds": kinds, "restored": sorted(after)}))
`);
    assert.deepStrictEqual(out.restored, ['peer-yuna', 'sa-a'], 'both agents must be restored');
    // Restoring used to rebuild peers as kind="sub" and park them on the entrance mat.
    assert.strictEqual(out.kinds['peer-yuna'], 'peer', 'an A2A peer must stay a peer after restart');
    assert.strictEqual(out.kinds['sa-a'], 'sub');
    for (const [id, d] of Object.entries(out.drift)) {
      assert.ok(d < 3, `${id} drifted ${d} tiles on restore`);
    }
  }, { timeout: 120000 });
});

describe('Feature 28: The spritesheet is never served stale', () => {
  const TILEMAP = path.join(REPO, 'services/lami-office-react/web/js/tilemap.js');
  const TILESET = path.join(REPO, 'services/lami-office-react/web/assets/tiles/tileset.json');
  const MAP = path.join(REPO, 'services/lami-office-react/web/assets/map/office.map.json');
  const CONFIG = path.join(REPO, 'services/lami-office-react/web/js/config.js');

  it('F28.1: the tileset image is requested with a version derived from the index', () => {
    const vm = require('node:vm');
    const env = require('../harness').createBrowserEnvironment();
    const asked = [];
    let imgSrc = null;

    env.window.fetch = (url) => {
      asked.push(url);
      const body = url.includes('tileset')
        ? fs.readFileSync(TILESET, 'utf8')
        : fs.readFileSync(MAP, 'utf8');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)) });
    };
    env.window.Image = class {
      set src(v) { imgSrc = v; this.width = 128; this.height = 192; setTimeout(() => this.onload && this.onload(), 0); }
      get src() { return imgSrc; }
    };
    env.window.OffscreenCanvas = undefined;

    const context = vm.createContext(env.window);
    vm.runInContext(fs.readFileSync(CONFIG, 'utf8'), context, { filename: 'config.js' });
    vm.runInContext(fs.readFileSync(TILEMAP, 'utf8'), context, { filename: 'tilemap.js' });

    const done = env.window.LO.Tilemap.load();
    return done.then(() => {
      // Regression: the spritesheet was loaded through <img> with no cache
      // escape hatch, so a proxy could serve the previous sheet next to the new
      // index. Because the per-room wall tiles live in cells that were empty in
      // the older sheet, every wall vanished in production.
      assert.ok(imgSrc && /\?v=[a-z0-9]+/.test(imgSrc),
        `the tileset image must be cache-busted, got ${imgSrc}`);
      assert.ok(imgSrc.indexOf('tileset.png') > -1, 'the version must be on the tileset image');
    });
  });

  it('F28.2: a changed index yields a different version', () => {
    const src = fs.readFileSync(TILEMAP, 'utf8');
    assert.ok(/function smallHash/.test(src), 'a stable hash is required');
    assert.ok(/function withVersion/.test(src), 'a version appender is required');
    assert.ok(/smallHash\(JSON\.stringify\(STATE\.index\)\)/.test(src),
      'the version must be derived from the tileset index');
  });
});
