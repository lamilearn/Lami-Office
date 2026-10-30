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

describe('Feature 29: A page load never looks like a position reset', () => {
  const OFFICE = path.join(REPO, 'services/lami-office-react/web/js/office.js');

  it('F29.1: the first world frame snaps everybody to the server position', () => {
    const src = fs.readFileSync(OFFICE, 'utf8');
    const block = src.slice(src.indexOf('    applyWorld(frame) {'),
      src.indexOf('    applyWorldTargets(dt) {'));
    // Regression: the snap condition was `worldTargets.size === 1`, which is
    // false for a normal 20-character frame, so a refresh eased every body from
    // its spawn tile (desks / doorway) and looked like the office reset itself.
    assert.ok(/const firstFrame = !this\.worldPlaced/.test(block),
      'applyWorld must know whether this is the first frame');
    assert.ok(/if \(firstFrame \|\| char\.col === undefined\)/.test(block),
      'the first frame must place characters directly');
    assert.ok(!/worldTargets\.size === 1/.test(block),
      'the old size-based snap check must not come back');
    assert.ok(/this\.worldPlaced = true/.test(block), 'the flag must be set after the first frame');
  });

  it('F29.2: later frames ease instead of snapping', () => {
    const src = fs.readFileSync(OFFICE, 'utf8');
    const targets = src.slice(src.indexOf('    applyWorldTargets(dt) {'),
      src.indexOf('    // ---- Loop ----'));
    assert.ok(/char\.col \+= dc \* ease/.test(targets), 'later frames must interpolate');
    assert.ok(/Math\.hypot\(dc, dr\) > 8/.test(targets), 'a genuine jump still snaps');
  });
});

describe('Feature 30: Production stays a clean mirror of master', () => {
  const REPO_ROOT = REPO;
  const DEPLOY = path.join(REPO_ROOT, 'scripts/deploy_prod.sh');
  const STAMP = path.join(REPO_ROOT, 'scripts/stamp_assets.py');

  it('F30.1: the deploy script pulls and refuses a dirty checkout', () => {
    const src = fs.readFileSync(DEPLOY, 'utf8');
    assert.ok(/git pull --ff-only origin master/.test(src), 'deploy must fast-forward from master');
    assert.ok(!/git merge/.test(src), 'deploy must never merge on the server');
    assert.ok(!/git commit/.test(src), 'deploy must never commit on the server');
    assert.ok(/untracked-files=no/.test(src), 'drift check must look at tracked files');
    assert.ok(/prod must stay a clean mirror/.test(src), 'the rule must be stated in the failure');
    assert.ok(/\.env\.production\.secrets/.test(src), 'secrets are supplied from an ignored file');
  });

  it('F30.2: index.html asset URLs carry content hashes and stay current', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'services/lami-office-react/web/index.html'), 'utf8');
    const links = [...html.matchAll(/(?:href|src)="([^"?]+\.(?:css|js))\?v=([0-9a-f]{8})"/g)];
    assert.ok(links.length >= 10, `expected the css/js bundle to be versioned, found ${links.length}`);
    // Every version must match the file, otherwise a deploy serves a mismatch.
    const { execFileSync } = require('node:child_process');
    execFileSync(process.env.PYTHON || 'python3', [STAMP, '--check'], { stdio: 'pipe' });
  });

  it('F30.3: no script pushes master without an explicit opt-in', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/push_to_github.sh'), 'utf8');
    // The script used to push master AND dev, silently bypassing the staging gate.
    assert.ok(/ALLOW_MASTER_PUSH/.test(src), 'master pushes must be gated behind a flag');
    const gated = src.slice(src.indexOf('ALLOW_MASTER_PUSH'), src.indexOf('Pushing development branch'));
    assert.ok(/push -u "\$\{REMOTE_NAME\}" master/.test(gated),
      'the master push must live inside the opt-in branch');
    assert.ok(/Skipping 'master'/.test(src), 'the default path must skip master and say so');
  });
});

describe('Feature 32: Doorways read as openings', () => {
  const TILESET_GEN = path.join(REPO, 'scripts/generate_tileset.py');

  it('F32.1: jamb tiles are posts, not a solid slab across the doorway', () => {
    const src = fs.readFileSync(TILESET_GEN, 'utf8');
    const fn = src.slice(src.indexOf('def door_post('), src.indexOf('def door_mid('));
    // Regression: door_post filled the whole 16x16 tile with oak, so every
    // doorway looked like a closed dark panel instead of an opening.
    assert.ok(!/tile\.rect\(0, 0, T, T/.test(fn),
      'the jamb must not paint the full tile');
    assert.ok(/tile\.rect\(post_x, 0, 4, T/.test(fn), 'only the post is drawn');
  });

  it('F32.2: the doorway floor is a warm wooden sill', () => {
    const src = fs.readFileSync(TILESET_GEN, 'utf8');
    const fn = src.slice(src.indexOf('def door_mid('), src.indexOf('def sign_plaque('));
    assert.ok(/shade\(OAK/.test(fn), 'the sill must use the oak palette, not a pale panel');
    assert.ok(!/shade\(base, 0\.55\)/.test(fn), 'the old pale panel look must be gone');
  });

  it('F32.3: no threshold mat is laid across the hallway', () => {
    const tilemapGen = fs.readFileSync(path.join(REPO, 'scripts/generate_tilemap.py'), 'utf8');
    assert.ok(!/door_threshold/.test(tilemapGen), 'the generator must not place threshold mats');
    const index = JSON.parse(fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/assets/tiles/tileset.json'), 'utf8'));
    assert.ok(!index.some((t) => t.name === 'door_threshold'), 'the tile is retired');
    const tm = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/tilemap.js'), 'utf8');
    assert.ok(!/'door_threshold'/.test(tm), 'the renderer no longer needs to special-case it');
  });
});

describe('Feature 33: A2A credentials are wired end to end', () => {
  const STAGING_DEPLOY = path.join(REPO, 'scripts/deploy_staging.sh');
  const PROD_DEPLOY = path.join(REPO, 'scripts/deploy_prod.sh');
  const SERVER = path.join(REPO, 'services/lami-office-react/server.py');

  it('F33.1: staging is deployed with the untracked secrets file', () => {
    const src = fs.readFileSync(STAGING_DEPLOY, 'utf8');
    // Credentials are never committed, so a deploy that forgets the second env
    // file silently ships an office that cannot message any peer (can_send:false).
    assert.ok(/--env-file \.env\.development/.test(src), 'the profile env must be passed');
    assert.ok(/--env-file \.env\.development\.secrets/.test(src),
      'the secrets env must also be passed');
    assert.ok(/can_send/.test(src), 'the deploy must verify that sending is enabled');
    assert.ok(/git pull --ff-only/.test(src), 'staging must fast-forward, never merge');
  });

  it('F33.2: production is deployed with its own secrets file', () => {
    const src = fs.readFileSync(PROD_DEPLOY, 'utf8');
    assert.ok(/--env-file \.env\.production --env-file \.env\.production\.secrets/.test(src));
    assert.ok(!/git merge/.test(src) && !/git commit/.test(src));
  });

  it('F33.3: can_send reflects real credentials, and per-peer tokens win', () => {
    const src = fs.readFileSync(SERVER, 'utf8');
    assert.ok(/"can_send": bool\(str\(CFG\.get\("a2a_secret"\) or ""\) or CFG\.get\("a2a_peer_tokens"\)\)/.test(src),
      'can_send must require a secret or per-peer tokens');
    const tokenFor = src.slice(src.indexOf('def token_for(self, peer'), src.indexOf('def send(self, peer_id'));
    assert.ok(/tokens\.get\(peer\.id\)/.test(tokenFor), 'a per-peer token must take precedence');
    assert.ok(/return str\(CFG\.get\("a2a_secret"\)/.test(tokenFor),
      'the shared mesh secret is the fallback');
    // The official A2A peer authenticates with a Bearer token, the sidecars with
    // the x-a2a-token header; both must be sent.
    assert.ok(/add_header\("Authorization", f"Bearer \{token\}"\)/.test(src));
    assert.ok(/add_header\("x-a2a-token", token\)/.test(src));
  });

  it('F33.4: no credential is committed to the repo', () => {
    const tracked = [
      '.env.development', '.env.production', 'services/lami-office-react/server.py',
      'scripts/deploy_staging.sh', 'scripts/deploy_prod.sh'
    ];
    for (const rel of tracked) {
      const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
      assert.ok(!/a2a_secret_mesh_ebi/.test(text), `${rel} must not contain the mesh secret`);
      assert.ok(!/A2A_BEARER_TOKEN\s*=\s*\S/.test(text), `${rel} must not contain a bearer token`);
    }
  });
});

describe('Feature 34: Server Room shows real agent VM resources', () => {
  const AGENT = path.join(REPO, 'services/lami-office-react/deploy/metrics_agent.py');
  const WORLD = path.join(REPO, 'services/lami-office-react/web/js/world.js');
  const NET = path.join(REPO, 'services/lami-office-react/web/js/net.js');

  it('F34.1: the metrics agent reports real CPU/RAM/disk from this host', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import json, sys
sys.path.insert(0, 'deploy')
import metrics_agent as m
d = m.metrics()
print(json.dumps({
  "agent": d["agent"], "has_cpu": isinstance(d["cpu"].get("percent"), float),
  "cores": d["cpu"]["cores"], "has_mem": d["mem"]["total_mb"] > 0,
  "mem_pct": d["mem"]["percent"], "has_disk": d["disk"]["total_gb"] > 0,
  "uptime": d["uptime_s"] > 0,
}))
`);
    assert.ok(out.has_cpu, 'CPU percent must be measured');
    assert.ok(out.cores >= 1, 'core count must be real');
    assert.ok(out.has_mem && out.mem_pct >= 0, 'memory must be read from /proc/meminfo');
    assert.ok(out.has_disk && out.uptime, 'disk and uptime must be real');
  }, { timeout: 60000 });

  it('F34.2: the office parses peer metrics into /api/resources', async () => {
    if (!HAVE_PY) return;
    const H = require('../http_helpers');
    const stub = await H.startMetricsStub({ agent: 'yuna', cpu: 42.5, mem: 32.3 });
    const srv = await H.startServer({
      env: {
        A2A_PEERS: JSON.stringify([
          { id: 'yuna', name: 'Yuna', host: '127.0.0.1', port: stub.port, metrics_port: stub.port, room: 'research' }
        ]),
        A2A_POLL_INTERVAL: '1'
      }
    });
    try {
      await H.sleep(1800);
      const res = await srv.get('/api/resources');
      assert.strictEqual(res.status, 200);
      const yuna = res.json.agents.find((a) => a.id === 'yuna');
      assert.ok(yuna, 'the agent must be listed');
      assert.strictEqual(yuna.has_metrics, true);
      assert.strictEqual(yuna.cpu_percent, 42.5);
      assert.strictEqual(yuna.mem_percent, 32.3);
      assert.strictEqual(yuna.mem_total_mb, 3819);
      // And it is exposed on the peer too, for the A2A panel.
      const a2a = await srv.get('/api/a2a');
      assert.strictEqual(a2a.json.peers[0].metrics.cpu_percent, 42.5);
    } finally {
      await srv.stop();
      await stub.stop();
    }
  }, { timeout: 60000 });

  it('F34.3: an agent that does not report metrics is never given fake numbers', async () => {
    if (!HAVE_PY) return;
    const H = require('../http_helpers');
    const stub = await H.startMetricsStub({ agent: 'kira', fail: true });
    const srv = await H.startServer({
      env: {
        A2A_PEERS: JSON.stringify([
          { id: 'kira', name: 'Kira', host: '127.0.0.1', port: stub.port, metrics_port: stub.port, room: 'server' }
        ]),
        A2A_POLL_INTERVAL: '1'
      }
    });
    try {
      await H.sleep(1800);
      const res = await srv.get('/api/resources');
      const kira = res.json.agents.find((a) => a.id === 'kira');
      assert.strictEqual(kira.has_metrics, false, 'no endpoint means no metrics');
      assert.strictEqual(kira.cpu_percent, null, 'CPU must be null, not invented');
      assert.strictEqual(kira.mem_percent, null);
    } finally {
      await srv.stop();
      await stub.stop();
    }
  }, { timeout: 60000 });

  it('F34.4: the room shows one rack at a time; the card lists them all', () => {
    const src = fs.readFileSync(WORLD, 'utf8');
    assert.ok(/renderVmMonitor\(ctx, ts\)/.test(src), 'the server room must expose a monitor pass');
    assert.ok(!/drawVmOverview/.test(src), 'the in-world overview must be gone');
    assert.ok(/'--'/.test(src), 'a missing gauge must show a dash, not a number');

    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    harness.loadScriptIntoEnv(env, 'world.js');
    env.window.LO = LO;
    const agents = [
      { id: 'lami', name: 'Lami', icon: 'L', color: '#c084fc', online: true, has_metrics: true, cpu_percent: 54.5, mem_percent: 64.4 },
      { id: 'cyro', name: 'Cyro', icon: 'C', color: '#a78bfa', online: false, has_metrics: false }
    ];
    // Hovering the second rack must report that rack's owner only.
    env.window.LO.office = {
      vmResources: { agents },
      hoveredRack: () => 1,
      vmPinnedRack: -1,
      vmPanelVisible: () => true
    };
    const world = new LO.World();
    const ctx = env.document.createElement('canvas').getContext('2d');
    world.renderVmMonitor(ctx, 16);
    const texts = ctx.drawCalls.filter((c) => c.type === 'fillText').map((c) => c.text);
    assert.ok(texts.some((t) => /Cyro/.test(t)), 'the hovered rack must be shown');
    assert.ok(!texts.some((t) => /Lami/.test(t)), 'other agents must not be drawn on the floor');
    assert.strictEqual(texts.filter((t) => t === '--').length, 3, 'CPU, RAM and DISK dash when nothing is measured');
  });

  it('F34.5: the client polls /api/resources and the deploy ships the agent', () => {
    const net = fs.readFileSync(NET, 'utf8');
    assert.ok(/syncResources\(\)/.test(net), 'the client must poll resources');
    assert.ok(/fetch\('\/api\/resources'\)/.test(net));
    const installer = fs.readFileSync(path.join(REPO, 'services/lami-office-react/deploy/install_metrics_agent.sh'), 'utf8');
    assert.ok(/lami-metrics/.test(installer) && /\/metrics/.test(installer), 'the installer must verify the endpoint');
    const service = fs.readFileSync(path.join(REPO, 'services/lami-office-react/deploy/lami-metrics.service'), 'utf8');
    assert.ok(/METRICS_PORT/.test(service) && /AGENT_ID/.test(service));
  });
});

describe('Feature 35: The Server Room shows one rack per agent', () => {
  const WORLD = path.join(REPO, 'services/lami-office-react/web/js/world.js');
  const OFFICE = path.join(REPO, 'services/lami-office-react/web/js/office.js');
  const CONFIG = path.join(REPO, 'services/lami-office-react/web/js/config.js');

  function buildOffice() {
    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    harness.loadScriptIntoEnv(env, 'world.js');
    harness.loadScriptIntoEnv(env, 'office.js');
    env.window.LO = LO;
    LO.audio = new Proxy({}, { get: () => () => {} });
    harness.loadScriptIntoEnv(env, 'agents.js');
    LO.ui = { updateStaffCount() {}, addTicker() {}, appendChatMessage() {}, triggerEventBanner() {},
      setStatus() {}, recordDone() {}, setOfficeStatus() {}, setRoster() {} };
    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });
    const office = new LO.Office(env.document.createElement('canvas'));
    office.canvas = { clientWidth: 1600, clientHeight: 900,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }) };
    office.simulatedExternally = true;
    office.world = new LO.World();
    office.vmResources = { agents: [
      { id: 'lami', name: 'Lami', icon: 'L', color: '#c084fc', online: true, has_metrics: true, cpu_percent: 50, mem_percent: 40 },
      { id: 'yuna', name: 'Yuna', icon: 'Y', color: '#60a5fa', online: true, has_metrics: true, cpu_percent: 2, mem_percent: 21 },
      { id: 'aurora', name: 'Aurora', icon: 'A', color: '#f472b6', online: true, has_metrics: true, cpu_percent: 3, mem_percent: 35 },
      { id: 'kira', name: 'Kira', icon: 'K', color: '#34d399', online: true, has_metrics: false },
      { id: 'cyro', name: 'Cyro', icon: 'C', color: '#a78bfa', online: false, has_metrics: false }
    ] };
    return { office, LO, env };
  }

  it('F35.1: there is one rack per agent, defined once in config', () => {
    const harness = require('../harness');
    const LO = harness.loadScriptIntoEnv(harness.createBrowserEnvironment(), 'config.js');
    assert.strictEqual(LO.VM_RACKS.length, 5, 'five racks for the five real agents');
    const seen = new Set();
    for (const r of LO.VM_RACKS) {
      assert.ok(r.w > 0 && r.h > 0, 'each rack needs a size');
      const key = `${r.x},${r.y}`;
      assert.ok(!seen.has(key), 'racks must not overlap');
      seen.add(key);
      // Inside the server room interior (x 58..83, y 3..18).
      assert.ok(r.x >= 58 && r.x + r.w <= 84, 'rack must sit inside the room');
      assert.ok(r.y >= 3 && r.y + r.h <= 18, 'rack must sit inside the room');
    }
    assert.ok(!/VM_INFO_CHIP/.test(fs.readFileSync(CONFIG, 'utf8')), 'the old floor chip must be gone');
  });

  it('F35.2: hovering a rack selects that rack only', () => {
    const { office, LO } = buildOffice();
    assert.strictEqual(office.hoveredRack(), -1, 'nothing hovered initially');
    const rack = LO.VM_RACKS[2];
    office.hoverTile = { x: (rack.x + 0.5) * LO.TILE_SIZE, y: (rack.y + 0.5) * LO.TILE_SIZE };
    assert.strictEqual(office.hoveredRack(), 2);
    assert.strictEqual(office.vmPanelVisible(), true);

    // Off the racks the panel goes away again.
    office.hoverTile = { x: 62 * LO.TILE_SIZE, y: 15 * LO.TILE_SIZE };
    assert.strictEqual(office.hoveredRack(), -1);
    assert.strictEqual(office.vmPanelVisible(), false);
  });

  it('F35.3: a rack panel shows only its owner, and dashes missing metrics', () => {
    const { office, LO } = buildOffice();
    const rack = LO.VM_RACKS[0];
    office.hoverTile = { x: (rack.x + 0.5) * LO.TILE_SIZE, y: (rack.y + 0.5) * LO.TILE_SIZE };
    let ctx = office.world._ctxFor ? null : null;
    const canvas = office.world && null;
    // Render through the office so the monitor pass runs after the characters.
    office.ctx.drawCalls.length = 0;
    office.world.renderVmMonitor(office.ctx, LO.TILE_SIZE);
    const names = office.ctx.drawCalls.filter(c => c.type === 'fillText').map(c => c.text);
    assert.ok(names.some(t => /Lami/.test(t)), 'the hovered rack\'s owner must be shown');
    assert.ok(names.includes('ONLINE'), 'its live status must be shown');
    assert.ok(!names.some(t => /Yuna/.test(t)), 'other agents must not appear in a single-rack panel');

    // A rack whose agent reports nothing must show dashes, never numbers.
    office.hoverTile = { x: (LO.VM_RACKS[3].x + 0.5) * LO.TILE_SIZE, y: (LO.VM_RACKS[3].y + 0.5) * LO.TILE_SIZE };
    office.ctx.drawCalls.length = 0;
    office.world.renderVmMonitor(office.ctx, LO.TILE_SIZE);
    const dashes = office.ctx.drawCalls.filter(c => c.type === 'fillText' && c.text === '--').length;
    assert.strictEqual(dashes, 3, 'CPU, RAM and DISK all show a dash when nothing is measured');
  });

  it('F35.4: the HUD chip opens a card and never draws on the floor', () => {
    const { office } = buildOffice();
    assert.strictEqual(office.vmPanelVisible(), false, 'nothing on the floor by default');
    // Even with data available the floor stays clean: the overview is a card.
    office.ctx.drawCalls.length = 0;
    office.world.renderVmMonitor(office.ctx, 16);
    const texts = office.ctx.drawCalls.filter((c) => c.type === 'fillText').map((c) => c.text);
    assert.ok(!texts.includes('VM RESOURCES'), 'the floor must not host the overview');
    assert.ok(!texts.some((t) => /Yuna/.test(t)), 'no agent list on the floor');
    assert.ok(!texts.some((t) => /Lami/.test(t)));

    const ui = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/ui.js'), 'utf8');
    assert.ok(/showVmModal\(\)/.test(ui), 'the chip must open a modal card');
    assert.ok(/renderVmList/.test(ui), 'the card must render one row per agent');
    assert.ok(!/vmPanelPinned/.test(ui), 'the chip must not pin an in-world panel');
  });

  it('F35.5: the HUD owns the VM INFO affordance and the client feeds it', () => {
    const html = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/index.html'), 'utf8');
    assert.ok(/id="hud-vm-chip"/.test(html), 'the chip must live in the HUD');
    assert.ok(/VM INFO/.test(html), 'the chip must be labelled VM INFO');
    assert.ok(/id="vm-modal"/.test(html) && /id="vm-list"/.test(html), 'the card must exist in the DOM');
    const ui = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/ui.js'), 'utf8');
    assert.ok(/showVmModal\(\)/.test(ui), 'the chip must open the VM card');
    assert.ok(/setVmStatus/.test(ui), 'the chip must reflect how many agents report');
    const net = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/net.js'), 'utf8');
    assert.ok(/LO\.ui\.setVmStatus/.test(net), 'the poller must feed the chip');
    const world = fs.readFileSync(WORLD, 'utf8');
    assert.ok(!/drawVmMonitorHint/.test(world), 'the old floor hint must be gone');
  });

  function LO_TILE() { return 16; }
});

describe('Feature 36: Characters are occluded by props, not drawn over them', () => {
  const OFFICE = path.join(REPO, 'services/lami-office-react/web/js/office.js');
  const AGENTS = path.join(REPO, 'services/lami-office-react/web/js/agents.js');
  const WORLD = path.join(REPO, 'services/lami-office-react/web/js/world.js');

  function buildOffice() {
    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    harness.loadScriptIntoEnv(env, 'world.js');
    harness.loadScriptIntoEnv(env, 'office.js');
    env.window.LO = LO;
    LO.audio = new Proxy({}, { get: () => () => {} });
    harness.loadScriptIntoEnv(env, 'agents.js');
    LO.ui = { updateStaffCount() {}, addTicker() {}, appendChatMessage() {}, triggerEventBanner() {},
      setStatus() {}, recordDone() {}, setOfficeStatus() {}, setRoster() {} };
    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });
    const office = new LO.Office(env.document.createElement('canvas'));
    office.canvas = { clientWidth: 1600, clientHeight: 900,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }) };
    office.simulatedExternally = true;
    office.world = new LO.World();
    return { office, LO, env };
  }

  it('F36.1: the scene is rendered offscreen and blitted in depth order', () => {
    const { office, LO } = buildOffice();
    const scene = office.sceneCanvas();
    assert.ok(scene && scene.canvas, 'an offscreen scene canvas must exist');
    assert.strictEqual(scene.canvas.height, LO.CONTENT_H + LO.SCENE_TOP_PAD);

    // Record when each band is blitted and when each character body is drawn.
    const timeline = [];
    for (const c of office.residents) {
      const orig = c.render.bind(c);
      c.render = (ctx, opts) => { timeline.push({ y: (c.row || 0) * LO.TILE_SIZE, kind: 'char' }); return orig(ctx, opts); };
    }
    office.ctx.drawCalls.length = 0;
    office.render();
    const sceneBands = office.ctx.drawCalls
      .filter((c) => c.type === 'drawImage' && c.args && c.args.length >= 8 && c.image === scene.canvas)
      .map((c) => ({ y: c.args[5], kind: 'band' }));

    const all = [...sceneBands, ...timeline].sort((a, b) => a.y - b.y);
    assert.ok(sceneBands.length > 0, 'the scene must be blitted in bands');
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i].y >= all[i - 1].y - 0.001, 'bands and characters must interleave by depth');
    }
  });

  it('F36.2: bodies and speech are separate passes', () => {
    const src = fs.readFileSync(AGENTS, 'utf8');
    const render = src.slice(src.indexOf('    render(ctx, opts) {'), src.indexOf('    renderText(ctx, pos, hopY) {'));
    assert.ok(/if \(opts && opts.skipText\) return;/.test(render), 'the body pass must be skippable');
    const text = src.slice(src.indexOf('    renderText(ctx, pos, hopY) {'), src.indexOf('    renderEmote(ctx, x, py) {'));
    assert.ok(/renderEmote/.test(text) && /renderBubble/.test(text), 'speech must live in renderText');
    const office = fs.readFileSync(OFFICE, 'utf8');
    assert.ok(/renderText\(this\.ctx\)/.test(office), 'the office must draw speech after the bands');
    assert.ok(/skipText: true/.test(office), 'bodies inside the bands must skip speech');
  });

  it('F36.3: the VM monitor floats above the crowd', () => {
    const world = fs.readFileSync(WORLD, 'utf8');
    assert.ok(/renderVmMonitor\(ctx, ts\)/.test(world), 'the monitor must have its own pass');
    const room = world.slice(world.indexOf('    drawServerRoom(ctx, ts, theme) {'), world.indexOf('    drawEngineeringPit('));
    assert.ok(!/drawVmMonitor\(ctx, ts\)/.test(room),
      'the monitor must not be drawn with the furniture, or characters walk over it');
    const office = fs.readFileSync(OFFICE, 'utf8');
    const afterBands = office.slice(office.indexOf('// 5. Speech bubbles'), office.indexOf('this.ctx.restore()'));
    assert.ok(/renderVmMonitor/.test(afterBands), 'the monitor must be drawn after the characters');
  });

  it('F36.4: a fallback keeps working without an offscreen canvas', () => {
    const src = fs.readFileSync(OFFICE, 'utf8');
    assert.ok(/if \(!this\.renderBanded\(allChars\)\)/.test(src), 'the banded path must be optional');
    const fallback = src.slice(src.indexOf('if (!this.renderBanded(allChars)) {'), src.indexOf('// 5. Speech bubbles'));
    assert.ok(/this\.world\.render\(this\.ctx\)/.test(fallback), 'the flat order must remain as a fallback');
  });
});

describe('Feature 37: Mouse zoom and drag panning', () => {
  const CONFIG = path.join(REPO, 'services/lami-office-react/web/js/config.js');
  const OFFICE = path.join(REPO, 'services/lami-office-react/web/js/office.js');

  it('F37.1: with no explicit zoom the view reproduces the default fit', () => {
    const harness = require('../harness');
    const LO = harness.loadScriptIntoEnv(harness.createBrowserEnvironment(), 'config.js');
    const v = LO.computeViewParams({ width: 1600, height: 838, topInset: 78 });
    const contain = Math.min(1600 / LO.CONTENT_W, 760 / LO.CONTENT_H);
    assert.ok(v.zoom >= contain - 1e-9 && v.zoom <= contain * LO.DESKTOP_ZOOM_CAP + 1e-9,
      'the default must stay the capped focus fit');
    assert.ok(typeof v.minZoom === 'number' && typeof v.maxZoom === 'number', 'a zoom range must be exposed');
    assert.ok(Math.abs(v.minZoom - v.zoom) < 1e-9,
      'zoom-out must stop at the default fitted size, never smaller');
    assert.ok(v.maxZoom > v.zoom, 'zooming in must be possible');
  });

  it('F37.2: zooming keeps the content under the cursor pinned', () => {
    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    harness.loadScriptIntoEnv(env, 'world.js');
    harness.loadScriptIntoEnv(env, 'office.js');
    env.window.LO = LO;
    LO.audio = new Proxy({}, { get: () => () => {} });
    harness.loadScriptIntoEnv(env, 'agents.js');
    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });

    const office = new LO.Office(env.document.createElement('canvas'));
    office.canvas = { clientWidth: 1600, clientHeight: 760,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 760 }) };
    office.computeView();
    const cx = 900, cy = 500;
    const before = office.screenToWorld(cx, cy);
    office.zoomAt(office.view.zoom * 2, cx, cy);
    const after = office.screenToWorld(cx, cy);
    const drift = Math.hypot(after.x - before.x, after.y - before.y);
    assert.ok(drift < 1.5, `the tile under the cursor must stay put, drifted ${drift.toFixed(2)}px`);
    assert.ok(office.view.zoom > 1, 'zooming in must increase the scale');
  });

  it('F37.3: zoom is clamped to the configured range', () => {
    const harness = require('../harness');
    const LO = harness.loadScriptIntoEnv(harness.createBrowserEnvironment(), 'config.js');
    const base = LO.computeViewParams({ width: 1600, height: 838, topInset: 78 });
    const tooFar = LO.computeViewParams({ width: 1600, height: 838, topInset: 78, zoom: base.zoom * 100 });
    const tooNear = LO.computeViewParams({ width: 1600, height: 838, topInset: 78, zoom: 0.0001 });
    assert.ok(Math.abs(tooFar.zoom - base.maxZoom) < 1e-9, 'zoom-in must stop at maxZoom');
    assert.ok(Math.abs(tooNear.zoom - base.minZoom) < 1e-9, 'zoom-out must stop at minZoom');
    // Regression: 0.5x of the contain fit was allowed, which shrank the office
    // well below its normal size and just added empty margin.
    assert.ok(Math.abs(base.minZoom - base.zoom) < 1e-9,
      'the floor must be the default fitted size');
    assert.ok(base.minZoom > Math.min(1600 / LO.CONTENT_W, 760 / LO.CONTENT_H),
      'never smaller than a plain contain fit');
  });

  it('F37.4: the wheel zooms on desktop and dragging pans', () => {
    const office = fs.readFileSync(OFFICE, 'utf8');
    assert.ok(/addEventListener\('wheel', onWheel, \{ passive: false \}\)/.test(office),
      'desktop must handle the mouse wheel');
    assert.ok(/if \(this\.isPhoneMode\(\)\) return;\s*\n\s*e\.preventDefault\(\)/.test(office),
      'the wheel must not hijack phone scrolling');
    const drag = office.slice(office.indexOf('const onPointerMove'), office.indexOf("this.canvas.addEventListener('pointermove', onHoverMove)"));
    assert.ok(/if \(moved && !this\.isPhoneMode\(\)\)/.test(drag),
      'desktop drag must pan the view');
    assert.ok(/this\.zoomAt\(/.test(office) && /resetView\(\)/.test(office),
      'zoom and reset helpers must exist');
    const config = fs.readFileSync(CONFIG, 'utf8');
    assert.ok(/LO\.DESKTOP_ZOOM_MAX = 4/.test(config), 'the zoom-in cap must be configured');
    assert.ok(!/LO\.DESKTOP_ZOOM_MIN/.test(config), 'the old zoom-out floor must be gone');
  });

  it('F37.5: double-click returns to the fitted view', () => {
    const office = fs.readFileSync(OFFICE, 'utf8');
    const tap = office.slice(office.indexOf('if (now - lastTap < 320)'), office.indexOf('lastTap = now;'));
    assert.ok(/if \(this\.isPhoneMode\(\)\) this\.resetCamera\(\);\s*\n\s*else this\.resetView\(\)/.test(tap),
      'desktop double-click must reset the camera');
  });
});

describe('Feature 38: Meeting room furniture is laid out logically', () => {
  const WORLD = path.join(REPO, 'services/lami-office-react/web/js/world.js');
  const CONFIG = path.join(REPO, 'services/lami-office-react/web/js/config.js');

  function meetingChairs() {
    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    harness.loadScriptIntoEnv(env, 'world.js');
    env.window.LO = LO;
    LO.office = { vmResources: null, vmPanelVisible: () => false, hoveredRack: () => -1 };
    const world = new LO.World();
    const ctx = env.document.createElement('canvas').getContext('2d');
    world.drawMeetingRoom(ctx, LO.TILE_SIZE, { type: 'day' });
    // Chairs are the circles; the table is the widest filled rectangle.
    const chairs = ctx.drawCalls.filter((c) => c.type === 'arc' && c.r >= 5)
      .map((c) => ({ x: c.x, y: c.y, r: c.r }));
    // The table is drawn as a top face, a front face and a shadow, all exactly
    // 12 tiles wide: union those to get its footprint without depending on which
    // face happens to have the largest area.
    const spans = ctx.drawCalls.filter((c) => c.type === 'fillRect' && c.w === 12 * LO.TILE_SIZE);
    const table = spans.length ? {
      x: Math.min(...spans.map((c) => c.x)),
      y: Math.min(...spans.map((c) => c.y)),
      w: 12 * LO.TILE_SIZE,
      h: Math.max(...spans.map((c) => c.y + c.h)) - Math.min(...spans.map((c) => c.y))
    } : null;
    return { chairs, table, TS: LO.TILE_SIZE };
  }

  it('F38.1: no chair overlaps the conference table', () => {
    const { chairs, table } = meetingChairs();
    assert.ok(chairs.length >= 6, `expected at least six seats, got ${chairs.length}`);
    assert.ok(table, 'the table footprint must be known');
    const tx1 = table.x;
    const ty1 = table.y;
    const tx2 = table.x + table.w;
    const ty2 = table.y + table.h;
    for (const c of chairs) {
      const nearestX = Math.max(tx1, Math.min(c.x, tx2));
      const nearestY = Math.max(ty1, Math.min(c.y, ty2));
      const dist = Math.hypot(c.x - nearestX, c.y - nearestY);
      assert.ok(dist >= c.r,
        `chair at ${c.x},${c.y} (r${c.r}) overlaps the table (gap ${dist.toFixed(1)}px)`);
    }
  });

  it('F38.2: the two end seats mirror each other about the table', () => {
    const { chairs, table } = meetingChairs();
    const midY = table.y + table.h / 2;
    const ends = chairs.filter((c) => Math.abs(c.y - midY) < 2);
    assert.strictEqual(ends.length, 2, 'exactly two end seats, one per head');
    const [left, right] = ends.sort((a, b) => a.x - b.x);
    const leftGap = table.x - (left.x + left.r);
    const rightGap = (right.x - right.r) - (table.x + table.w);
    assert.ok(Math.abs(leftGap - rightGap) <= 1,
      `end seats must be symmetric (left gap ${leftGap.toFixed(1)}, right gap ${rightGap.toFixed(1)})`);
    // Regression: the right seat used to sit on the table corner while the left
    // floated a tile away.
    assert.ok(Math.abs(leftGap) <= 8 && leftGap >= 0, 'the left seat must sit just off the table');
    assert.ok(Math.abs(rightGap) <= 8 && rightGap >= 0, 'the right seat must sit just off the table');
  });

  it('F38.3: the long seat rows line up with the meeting seats in config', () => {
    const { chairs, table } = meetingChairs();
    const midY = table.y + table.h / 2;
    const rows = chairs.filter((c) => Math.abs(c.y - midY) >= 2);
    const seatXs = new Set(chairs.filter((c) => Math.abs(c.y - midY) >= 2).map((c) => c.x));
    // Six row seats over two rows: three columns, each used twice.
    assert.strictEqual(rows.length, 6, 'three seats on each long side');
    assert.strictEqual(seatXs.size, 3, 'three seat columns');

    const harness = require('../harness');
    const LO = harness.loadScriptIntoEnv(harness.createBrowserEnvironment(), 'config.js');
    const slotX = LO.SLOTS.meeting.map((s) => (s.x + 0.5) * LO.TILE_SIZE);
    for (const x of seatXs) {
      assert.ok(slotX.some((sx) => Math.abs(sx - x) < 0.6),
        `seat at ${x} must line up with a meeting seat slot`);
    }
  });

  it('F38.4: chairs are drawn from the table rect, not magic numbers', () => {
    const world = fs.readFileSync(WORLD, 'utf8');
    const from = world.indexOf('    drawMeetingRoom(ctx, ts, theme) {');
    const fn = world.slice(from, from + 4000);
    assert.ok(/const tableLeft = 38 \* ts/.test(fn), 'the table edges must be named');
    assert.ok(/const tableRight = 50 \* ts/.test(fn));
    assert.ok(/tableLeft - chairR - gap/.test(fn), 'the left seat must derive from the table edge');
    assert.ok(/tableRight \+ chairR \+ gap/.test(fn), 'the right seat must derive from the table edge');
    assert.ok(!/37\.2 \* ts/.test(fn) && !/49\.8 \* ts/.test(fn),
      'the old hardcoded, asymmetric seat positions must be gone');
    // Six seats in config: three per long side, matching the drawn chairs.
    const harness = require('../harness');
    const LO = harness.loadScriptIntoEnv(harness.createBrowserEnvironment(), 'config.js');
    assert.strictEqual(LO.SLOTS.meeting.length, 6, 'config must define six meeting seats');
  });
});

describe('Feature 39: The trashcan shows the context window live', () => {
  const BRIDGE = path.join(REPO, 'services/lami-office-react/deploy/hermes_bridge.py');
  const WORLD = path.join(REPO, 'services/lami-office-react/web/js/world.js');
  const UI = path.join(REPO, 'services/lami-office-react/web/js/ui.js');
  const NET = path.join(REPO, 'services/lami-office-react/web/js/net.js');

  it('F39.1: the bridge measures the real Hermes transcript', () => {
    if (!HAVE_PY) return;
    const out = pyJson(`
import importlib.util, json, os, sqlite3, sys, tempfile
sys.path.insert(0, 'deploy')
spec = importlib.util.spec_from_file_location('hb', 'deploy/hermes_bridge.py')
hb = importlib.util.module_from_spec(spec); spec.loader.exec_module(hb)

d = tempfile.mkdtemp(); db = os.path.join(d, 'state.db')
con = sqlite3.connect(db)
con.execute("CREATE TABLE sessions (id TEXT, model TEXT, last_activity_at REAL)")
con.execute("CREATE TABLE messages (session_id TEXT, content TEXT, tool_calls TEXT, reasoning TEXT, active INTEGER)")
con.execute("INSERT INTO sessions VALUES ('s1','deepseek/x',100)")
con.execute("INSERT INTO messages VALUES ('s1', ?, NULL, NULL, 1)", ('x' * 4000,))
con.execute("INSERT INTO messages VALUES ('s1', ?, NULL, NULL, 0)", ('y' * 4000,))   # inactive: ignored
con.commit(); con.close()

class O: pass
o = O(); o.db = db; o.include_cron = False; o.boss_session = []; o.context_limit = 1000
b = hb.Bridge.__new__(hb.Bridge); b.opts = o; b.boss_sessions = set(); b.db = db
snap = b.context_snapshot()
print(json.dumps(snap))
`);
    assert.strictEqual(out.messages, 1, 'only active messages count');
    assert.strictEqual(out.usedTokens, 1000, 'tokens estimated at 4 chars each');
    assert.strictEqual(out.limitTokens, 1000);
    assert.strictEqual(out.percent, 100.0);
    assert.strictEqual(out.type, 'context');
  }, { timeout: 60000 });

  it('F39.2: the trashcan badge follows office.contextUsage, not a constant', () => {
    const world = fs.readFileSync(WORLD, 'utf8');
    const fn = world.slice(world.indexOf('    drawContextTrashcan(ctx, tx, ty) {'),
      world.indexOf('    // Interactive Prop: Multi-Mode Whiteboard'));
    assert.ok(/office\.contextUsage/.test(fn), 'the badge must read the live value');
    assert.ok(fn.indexOf('${pct}%') > -1, 'the badge shows the percentage');

    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    harness.loadScriptIntoEnv(env, 'world.js');
    env.window.LO = LO;
    env.window.LO.office = { contextUsage: 0.87 };
    const world2 = new LO.World();
    const ctx = env.document.createElement('canvas').getContext('2d');
    world2.drawContextTrashcan(ctx, 100, 100);
    const texts = ctx.drawCalls.filter((c) => c.type === 'fillText').map((c) => c.text);
    assert.ok(texts.includes('87% 🗑️'), `the badge must show the live percentage, got ${texts}`);
  });

  it('F39.3: the client applies the streamed report and labels it an estimate', () => {
    const net = fs.readFileSync(NET, 'utf8');
    assert.ok(/case 'context':/.test(net), 'the stream must carry context reports');
    assert.ok(net.indexOf('setContextUsage(pct / 100, data)') > -1, 'the ratio and detail must be passed');
    assert.ok(/data\.context/.test(net), 'a fresh snapshot must seed the value too');
    const ui = fs.readFileSync(UI, 'utf8');
    const fn = ui.slice(ui.indexOf('    setContextUsage(ratio, detail) {'), ui.indexOf('    setContextUsage('.length + 1600));
    assert.ok(/detail\.limitTokens|detail\.limit_tokens/.test(fn), 'the real limit must be used');
    assert.ok(/estimasi/.test(fn), 'the UI must say the value is an estimate');
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    assert.ok(/"context"/.test(server), 'the server must accept and store context reports');
  });
});

describe('Feature 40: No seam or notch artefacts around characters', () => {
  const OFFICE = path.join(REPO, 'services/lami-office-react/web/js/office.js');
  const SPRITES = path.join(REPO, 'services/lami-office-react/web/js/sprites.js');

  function build() {
    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    harness.loadScriptIntoEnv(env, 'world.js');
    harness.loadScriptIntoEnv(env, 'office.js');
    env.window.LO = LO;
    LO.audio = new Proxy({}, { get: () => () => {} });
    harness.loadScriptIntoEnv(env, 'agents.js');
    LO.ui = { updateStaffCount() {}, addTicker() {}, appendChatMessage() {}, triggerEventBanner() {},
      setStatus() {}, recordDone() {}, setOfficeStatus() {}, setRoster() {} };
    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });
    const office = new LO.Office(env.document.createElement('canvas'));
    office.canvas = { clientWidth: 1600, clientHeight: 900,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }) };
    office.simulatedExternally = true;
    office.world = new LO.World();
    return { office, LO, env };
  }

  it('F40.1: depth bands use whole pixels and never leave a gap', () => {
    const { office } = build();
    // Fractional rows, like a character mid-stride. A fractional source rect made
    // drawImage skip a source row, which showed as a horizontal line that seemed
    // to follow the character.
    office.residents.forEach((c, i) => { c.row = 8.37 + i * 1.62; c.col = 4.21 + i * 2.37; });
    office.ctx.drawCalls.length = 0;
    office.render();

    const scene = office._scene;
    const bands = office.ctx.drawCalls
      .filter((c) => c.type === 'drawImage' && c.image === scene && c.args.length >= 8)
      .map((c) => ({ sy: c.args[1], sh: c.args[3], dy: c.args[5], dh: c.args[7] }));
    assert.ok(bands.length > 2, `expected several bands, got ${bands.length}`);
    for (const b of bands) {
      for (const v of [b.sy, b.sh, b.dy, b.dh]) {
        assert.ok(Number.isInteger(v), `band rect must be whole pixels, got ${v}`);
      }
    }
    for (let i = 1; i < bands.length; i++) {
      const covered = bands[i - 1].dy + bands[i - 1].dh;
      assert.ok(bands[i].dy <= covered,
        `bands must overlap or touch (gap ${bands[i].dy - covered}px)`);
    }
  });

  it('F40.2: every sprite row is the same width', () => {
    const src = fs.readFileSync(SPRITES, 'utf8');
    // Regression: three NORTH_BODY rows were 13 characters wide instead of 14,
    // leaving a 1px notch down the torso of every character seen from behind.
    for (const name of ['SOUTH_BODY', 'NORTH_BODY', 'LEGS_WALK', 'LEGS_SIT']) {
      const m = src.match(new RegExp(name + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
      if (!m) continue;
      const rows = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      if (!rows.length) continue;
      const widths = new Set(rows.map((r) => r.length));
      assert.strictEqual(widths.size, 1,
        `${name} rows must all be the same width, got ${[...widths].join(',')}`);
    }
    // And the rasteriser pads defensively, so a future short row cannot notch.
    assert.ok(/rows = rows\.map\(\(r\) => \(r\.length === rows\[0\]\.length/.test(src),
      'rasterising must pad short rows');
  });

  it('F40.3: every frame and direction renders at one size', () => {
    const harness = require('../harness');
    const env = harness.createBrowserEnvironment();
    const LO = harness.loadScriptIntoEnv(env, 'config.js');
    harness.loadScriptIntoEnv(env, 'sprites.js');
    const look = (LO.AGENT_LOOKS && LO.AGENT_LOOKS[0]) || { cloth: 0 };
    const set = LO.getCharacterSprites(look);
    const w = set.S.idle.width;
    const h = set.S.idle.height;
    for (const dir of ['S', 'N', 'E', 'W']) {
      for (const frame of ['idle', 'walk', 'type', 'blink', 'happy', 'sit', 'drink']) {
        const img = set[dir] && set[dir][frame];
        assert.ok(img, `${dir}.${frame} must exist`);
        assert.ok(img.width === w && img.height === h,
          `${dir}.${frame} is ${img.width}x${img.height}, expected ${w}x${h}`);
      }
    }
    assert.ok(env, 'sanity');
  });
});
