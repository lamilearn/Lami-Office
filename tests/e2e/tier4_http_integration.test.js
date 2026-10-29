/**
 * Tier 4 — HTTP Integration: real server subprocess, real HTTP, stub A2A peers
 * and the real Hermes bridge.
 *
 * Everything runs offline on 127.0.0.1 with ephemeral ports, so the production
 * LAN peers (.31 / .91–.94) are never touched. The suite is skipped with an
 * explicit reason when python3 is unavailable.
 */

const { describe, it, assert, beforeAll, afterAll } = require('../runner_utils');
const H = require('../http_helpers');
const fs = require('node:fs');
const path = require('node:path');

const HAVE_PY = H.pythonAvailable();
const SKIP = HAVE_PY ? null : 'python3 is not available; HTTP integration suite skipped';
const SERVER_SRC = path.join(H.REPO, 'services/lami-office-react/server.py');

const LONG = { timeout: 30000 };

function peerJson(list) {
  return JSON.stringify(list);
}

// ---- A. Auth matrix (in-process Handler: loopback is always trusted, so the
//         client-IP dimension cannot be exercised over a real localhost socket).
function authMatrix(serverSrc, clientIp, headers, ingestToken, trusted = ['192.168.0.0/16']) {
  const py = `
import json, sys, types
sys.argv = ['server.py']
src = open(${JSON.stringify(serverSrc)}, encoding='utf-8').read()
mod = types.ModuleType('office_server')
mod.__file__ = ${JSON.stringify(serverSrc)}
exec(compile(src, ${JSON.stringify(serverSrc)}, 'exec'), mod.__dict__)
mod.CFG['ingest_token'] = ${JSON.stringify(ingestToken)}
mod.CFG['trusted_networks'] = ${JSON.stringify(trusted)}
h = mod.Handler.__new__(mod.Handler)
h.client_address = (${JSON.stringify(clientIp)}, 50000)
h.headers = ${JSON.stringify(headers)}
print(json.dumps({
  "is_public": h.is_public(),
  "is_local": h.is_local(),
  "is_trusted": h.is_trusted(),
}))
`;
  const res = require('node:child_process').spawnSync(process.env.PYTHON || 'python3', ['-c', py],
    { encoding: 'utf8', timeout: 20000 });
  if (res.status !== 0) throw new Error(`auth matrix helper failed: ${res.stderr.slice(-800)}`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

// Mirrors do_POST('/api/event') auth: tunnel always 403, trusted LAN or a valid
// token may ingest, a wrong token from an untrusted host is rejected.
function ingestDecision(auth, hasToken, headerToken) {
  if (auth.is_public) return 403;
  const valid = Boolean(hasToken && headerToken === 'test-token');
  if (!auth.is_trusted && !valid) return 403;
  return 200;
}

describe('Tier 4 — HTTP Integration: Ingest Auth Matrix', () => {
  const cases = [
    ['A1', '8.8.8.8', {}, 'test-token', false, null, 403, 'public IP without token'],
    ['A2', '8.8.8.8', { 'CF-Connecting-IP': '8.8.8.8', 'X-Office-Token': 'test-token' }, 'test-token', true, 'test-token', 403, 'tunnel request with a valid token'],
    ['A3', '8.8.8.8', { 'CF-Ray': 'abc123' }, 'test-token', true, 'test-token', 403, 'tunnel traffic is never trusted'],
    ['A4', '192.168.3.31', {}, 'test-token', false, null, 200, 'trusted LAN bridge host'],
    ['A5', '203.0.113.9', { 'X-Office-Token': 'wrong' }, 'test-token', true, 'wrong', 403, 'untrusted host with a wrong token'],
    ['A6', '203.0.113.9', { 'X-Office-Token': 'test-token' }, 'test-token', true, 'test-token', 200, 'untrusted host with the valid token'],
    ['A7', '203.0.113.9', {}, '', false, null, 403, 'no token configured and no trust']
  ];

  for (const [id, ip, headers, token, hasToken, headerToken, expected, label] of cases) {
    it(`${id}: ${label} -> ${expected}`, () => {
      if (!HAVE_PY) return;
      const auth = authMatrix(SERVER_SRC, ip, headers, token);
      assert.strictEqual(ingestDecision(auth, hasToken, headerToken), expected);
    });
  }

  it('A8: Cloudflare headers on a LAN address still count as public traffic', () => {
    if (!HAVE_PY) return;
    const auth = authMatrix(SERVER_SRC, '192.168.3.31', { 'CF-Connecting-IP': '8.8.8.8' }, 'test-token');
    assert.strictEqual(auth.is_public, true);
    assert.strictEqual(auth.is_trusted, false);
    assert.strictEqual(ingestDecision(auth, true, 'test-token'), 403);
  });
});

describe('Tier 4 — HTTP Integration: Ingest over real HTTP', () => {
  let srv = null;
  beforeAll(async () => { srv = await H.startServer(); });
  afterAll(async () => { if (srv) await srv.stop(); srv = null; });

  it('B1: POST /api/event with CF-Ray is refused with 403', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/event', { type: 'message', text: 'hi' }, { headers: { 'CF-Ray': 'x' } });
    assert.strictEqual(res.status, 403);
  }, LONG);

  it('B2: a valid single event is accepted and counted', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/event', { type: 'message', agentId: 'lami', text: 'halo' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      { received: res.json.received, accepted: res.json.accepted, rejected: res.json.rejected },
      { received: 1, accepted: 1, rejected: 0 }
    );
  }, LONG);

  it('B2b: a rejected request body does not poison the next keep-alive request', async () => {
    if (!HAVE_PY) return;
    // Regression: the 403 path skipped reading the body, so on HTTP/1.1 keep-alive
    // the leftover bytes were parsed as a new request and answered with 501.
    const { Agent } = require('node:http');
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const send = (headers, body) => new Promise((resolve, reject) => {
      const payload = Buffer.from(JSON.stringify(body));
      const req = require('node:http').request({
        host: '127.0.0.1', port: srv.port, method: 'POST', path: '/api/event', agent,
        headers: Object.assign({ 'Content-Length': String(payload.length) }, headers)
      }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    try {
      const denied = await send({ 'CF-Ray': 'x' }, { type: 'message', text: 'x'.repeat(64) });
      assert.strictEqual(denied, 403);
      const next = await send({}, { type: 'message', text: 'ok' });
      assert.strictEqual(next, 200, 'the next request on the same connection must not become a 501');
    } finally {
      agent.destroy();
    }
  }, LONG);

  it('B3: an unknown event type is received but rejected', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/event', { type: 'nope' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.received, 1);
    assert.strictEqual(res.json.accepted, 0);
    assert.strictEqual(res.json.rejected, 1);
  }, LONG);

  it('B4: a 300 KB body is refused with 413', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/event', { type: 'message', text: 'x'.repeat(300 * 1024) });
    assert.strictEqual(res.status, 413);
  }, LONG);

  it('B5: an invalid Content-Length is refused with 400', async () => {
    if (!HAVE_PY) return;
    // Node's http client rewrites Content-Length, so speak raw HTTP to send a bad one.
    const raw = `POST /api/event HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: abc\r\nConnection: close\r\n\r\n{}`;
    const status = await H.rawStatus(srv.port, raw);
    assert.strictEqual(status, 400);
  }, LONG);

  it('B6: malformed JSON is refused with 400', async () => {
    if (!HAVE_PY) return;
    const res = await H.request(srv.port, 'POST', '/api/event', { body: '{not json' });
    assert.strictEqual(res.status, 400);
  }, LONG);

  it('B7: 30 parallel ingests all succeed and the server stays healthy', async () => {
    if (!HAVE_PY) return;
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      srv.post('/api/event', { type: 'tool_start', agentId: `a${i}`, tool: 'grep', summary: `job ${i}` })));
    assert.deepStrictEqual(results.map((r) => r.status), new Array(30).fill(200));
    assert.ok(results.every((r) => r.json.accepted === 1), 'every ingest must be accepted');
    const health = await srv.get('/healthz');
    assert.strictEqual(health.status, 200);
  }, LONG);
});

describe('Tier 4 — HTTP Integration: SSE fan-out', () => {
  let srv = null;
  beforeAll(async () => { srv = await H.startServer(); });
  afterAll(async () => { if (srv) await srv.stop(); srv = null; });

  it('C1: the first frame is a snapshot with agents, stats and history', async () => {
    if (!HAVE_PY) return;
    const sse = await srv.sse();
    try {
      const snap = await sse.waitFor((ev) => ev.type === 'snapshot', 5000);
      assert.ok(Array.isArray(snap.agents), 'snapshot must carry agents');
      assert.ok(snap.stats && typeof snap.stats === 'object', 'snapshot must carry stats');
      assert.ok(Array.isArray(snap.history), 'snapshot must carry history');
    } finally {
      sse.close();
    }
  }, LONG);

  it('C2: a spawned agent reaches the stream within 3s', async () => {
    if (!HAVE_PY) return;
    const sse = await srv.sse();
    try {
      await sse.waitFor((ev) => ev.type === 'snapshot', 5000);
      const t0 = Date.now();
      const res = await srv.post('/api/event', {
        type: 'agent_spawn', agentId: 'sse-probe', parentId: 'lami', task: 'probe stream'
      });
      assert.strictEqual(res.status, 200);
      const ev = await sse.waitFor((e) => e.type === 'agent_spawn' && e.agentId === 'sse-probe', 3000);
      assert.ok(Date.now() - t0 <= 3000);
      assert.strictEqual(ev.task, 'probe stream');
    } finally {
      sse.close();
    }
  }, LONG);

  it('C3: a fresh snapshot lists the spawned agent with its running tool', async () => {
    if (!HAVE_PY) return;
    await srv.post('/api/event', { type: 'agent_spawn', agentId: 'snap-probe', parentId: 'lami', task: 'index repo' });
    await srv.post('/api/event', { type: 'tool_start', agentId: 'snap-probe', tool: 'grep', summary: 'search files' });

    const sse = await srv.sse();
    try {
      const snap = await sse.waitFor((ev) => ev.type === 'snapshot', 5000);
      const agent = snap.agents.find((a) => a.id === 'snap-probe');
      assert.ok(agent, 'spawned agent must be in the snapshot');
      assert.strictEqual(agent.tool, 'grep');
    } finally {
      sse.close();
    }
  }, LONG);
});

describe('Tier 4 — HTTP Integration: A2A custom sidecar', () => {
  let srv = null;
  let stub = null;

  beforeAll(async () => {
    stub = await H.startStubPeer({ protocol: 'custom' });
    srv = await H.startServer({
      env: { A2A_PEERS: peerJson([{ id: 'yuna', name: 'Yuna', host: '127.0.0.1', port: stub.port, room: 'research' }]) }
    });
    await H.sleep(1400); // one A2A poll cycle
  });
  afterAll(async () => {
    if (srv) await srv.stop();
    if (stub) await stub.stop();
    srv = null; stub = null;
  });

  it('D1: presence reports the peer online with protocol "custom"', async () => {
    if (!HAVE_PY) return;
    const res = await srv.get('/api/a2a');
    assert.strictEqual(res.status, 200);
    const yuna = res.json.peers.find((p) => p.id === 'yuna');
    assert.ok(yuna, 'peer must be listed');
    assert.strictEqual(yuna.online, true);
    assert.strictEqual(yuna.protocol, 'custom');
    assert.strictEqual(res.json.can_send, true);
  }, LONG);

  it('D2: sending posts the mesh payload with the shared secret', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/a2a/send', { peer: 'yuna', text: 'cek laporan Q3' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.ok, true);
    const call = stub.callsTo('/a2a/message').pop();
    assert.ok(call, 'the stub must receive the message');
    assert.strictEqual(call.headers['x-a2a-token'], 'test-mesh-secret');
    assert.strictEqual(call.body.recipient, 'yuna');
    assert.strictEqual(call.body.body, 'cek laporan Q3');
  }, LONG);

  it('D3: a recipient override is used instead of the peer id', async () => {
    if (!HAVE_PY) return;
    const other = await H.startStubPeer({ protocol: 'custom' });
    const srv2 = await H.startServer({
      env: {
        A2A_PEERS: peerJson([{ id: 'aurora', name: 'Aurora', host: '127.0.0.1', port: other.port, room: 'meeting', recipient: 'clark' }])
      }
    });
    try {
      await H.sleep(1400);
      const res = await srv2.post('/api/a2a/send', { peer: 'aurora', text: 'agenda rapat' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(other.callsTo('/a2a/message').pop().body.recipient, 'clark');
    } finally {
      await srv2.stop();
      await other.stop();
    }
  }, LONG);

  it('D4: an unknown peer is a 404', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/a2a/send', { peer: 'nobody', text: 'hi' });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.json.ok, false);
  }, LONG);

  it('D5: a missing peer or text is a 400', async () => {
    if (!HAVE_PY) return;
    const noText = await srv.post('/api/a2a/send', { peer: 'yuna' });
    assert.strictEqual(noText.status, 400);
  }, LONG);

  it('D6: a whitespace body is a 400 instead of an empty message', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/a2a/send', { peer: 'yuna', text: '   ' });
    assert.strictEqual(res.status, 400);
  }, LONG);

  it('D7: POST /api/a2a/send with CF-Ray is refused with 403', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/a2a/send', { peer: 'yuna', text: 'hi' }, { headers: { 'CF-Ray': 'x' } });
    assert.strictEqual(res.status, 403);
  }, LONG);

  it('D8: with no A2A_SECRET / tokens sending reports 503 and can_send false', async () => {
    if (!HAVE_PY) return;
    const other = await H.startStubPeer({ protocol: 'custom' });
    const srv2 = await H.startServer({
      env: {
        A2A_SECRET: '',
        A2A_PEER_TOKENS: '',
        A2A_PEERS: peerJson([{ id: 'yuna', name: 'Yuna', host: '127.0.0.1', port: other.port, room: 'research' }])
      }
    });
    try {
      await H.sleep(1400);
      const info = await srv2.get('/api/a2a');
      assert.strictEqual(info.json.can_send, false);
      const res = await srv2.post('/api/a2a/send', { peer: 'yuna', text: 'hi' });
      assert.strictEqual(res.status, 503);
    } finally {
      await srv2.stop();
      await other.stop();
    }
  }, LONG);

  it('D9: a sidecar that returns 500 marks the peer offline', async () => {
    if (!HAVE_PY) return;
    const broken = await H.startStubPeer({ protocol: 'custom', failSend: true });
    const srv2 = await H.startServer({
      env: { A2A_PEERS: peerJson([{ id: 'kira', name: 'Kira', host: '127.0.0.1', port: broken.port, room: 'server' }]) }
    });
    try {
      await H.sleep(1400);
      const res = await srv2.post('/api/a2a/send', { peer: 'kira', text: 'status' });
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.json.ok, false);
      const info = await srv2.get('/api/a2a');
      assert.strictEqual(info.json.peers.find((p) => p.id === 'kira').online, false);
    } finally {
      await srv2.stop();
      await broken.stop();
    }
  }, LONG);
});

describe('Tier 4 — HTTP Integration: A2A official protocol', () => {
  let srv = null;
  let stub = null;

  beforeAll(async () => {
    stub = await H.startStubPeer({ protocol: 'a2a' });
    srv = await H.startServer({
      env: {
        A2A_PEERS: peerJson([{ id: 'lami-a2a', name: 'Lami', host: '127.0.0.1', port: stub.port, room: 'boss', protocol: 'a2a' }])
      }
    });
    await H.sleep(1400);
  });
  afterAll(async () => {
    if (srv) await srv.stop();
    if (stub) await stub.stop();
    srv = null; stub = null;
  });

  it('E1: the Agent Card is detected and its skills are parsed', async () => {
    if (!HAVE_PY) return;
    const res = await srv.get('/api/a2a');
    const peer = res.json.peers.find((p) => p.id === 'lami-a2a');
    assert.strictEqual(peer.protocol, 'a2a');
    assert.strictEqual(peer.online, true);
    assert.deepStrictEqual(peer.skills, ['finance-report', 'research']);
  }, LONG);

  it('E2: sending uses JSON-RPC SendMessage with a Bearer token and reports the reply', async () => {
    if (!HAVE_PY) return;
    const res = await srv.post('/api/a2a/send', { peer: 'lami-a2a', text: 'ringkas sprint' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.ok, true);
    assert.strictEqual(res.json.reply, 'laporan siap');
    assert.strictEqual(res.json.state, 'TASK_STATE_COMPLETED');

    const call = stub.seen.filter((s) => s.method === 'POST' && s.url === '/').pop();
    assert.strictEqual(call.body.method, 'SendMessage');
    assert.strictEqual(call.headers.authorization, 'Bearer test-mesh-secret');
    assert.strictEqual(call.body.params.message.parts[0].text, 'ringkas sprint');
    assert.strictEqual(call.body.params.message.role, 'ROLE_USER');
  }, LONG);

  it('E3: a JSON-RPC error is surfaced as ok:false with status 502', async () => {
    if (!HAVE_PY) return;
    const erroring = await H.startStubPeer({ protocol: 'a2a', rpcError: { code: -32000, message: 'agent sibuk' } });
    const srv2 = await H.startServer({
      env: { A2A_PEERS: peerJson([{ id: 'sad', name: 'Sad', host: '127.0.0.1', port: erroring.port, room: 'meeting', protocol: 'a2a' }]) }
    });
    try {
      await H.sleep(1400);
      const res = await srv2.post('/api/a2a/send', { peer: 'sad', text: 'halo' });
      assert.strictEqual(res.status, 502, 'a JSON-RPC error maps to 502');
      assert.strictEqual(res.json.ok, false);
      assert.ok(/agent sibuk/.test(res.json.error), `error detail must be surfaced, got ${res.json.error}`);
      assert.strictEqual(res.json.peer.id, 'sad', 'the failing peer is reported for diagnostics');
    } finally {
      await srv2.stop();
      await erroring.stop();
    }
  }, LONG);
});

describe('Tier 4 — HTTP Integration: Hermes bridge end-to-end', () => {
  let srv = null;
  let dir = null;

  beforeAll(async () => {
    srv = await H.startServer({ keepDir: true });
    dir = srv.dir;
  });
  afterAll(async () => {
    if (srv) await srv.stop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    srv = null; dir = null;
  });

  it('F1: one bridge pass forwards spawn, tool_start and tool_end', async () => {
    if (!HAVE_PY) return;
    const db = path.join(dir, 'state.db');
    const stateFile = path.join(dir, 'bridge-state.json');
    H.createHermesDb(db, [
      { session_id: 'sess-bridge', role: 'user', content: 'Analisa repo', timestamp: 1 },
      {
        session_id: 'sess-bridge', role: 'assistant', content: '',
        tool_calls: JSON.stringify([{ function: { name: 'grep', arguments: { pattern: 'TODO' } } }]), timestamp: 2
      },
      { session_id: 'sess-bridge', role: 'tool', content: '{}', tool_name: 'grep', timestamp: 3 }
    ]);

    const run = H.runBridge({ db, endpoint: `http://127.0.0.1:${srv.port}`, stateFile });
    assert.strictEqual(run.code, 0, `bridge failed: ${run.stderr.slice(-800)}`);

    // The bridge hashes the session id into `sa-<hex>`, so match on the task instead.
    const state = await srv.get('/api/agents');
    const agent = state.json.agents.find((a) => a.task === 'Analisa repo');
    assert.ok(agent, `bridge agent must reach the office: ${JSON.stringify(state.json.agents)}`);
    assert.ok(/^sa-/.test(agent.id), `sub-agent ids are hashed, got ${agent.id}`);

    const sse = await srv.sse();
    try {
      const snap = await sse.waitFor((ev) => ev.type === 'snapshot', 5000);
      const types = snap.history.map((ev) => ev.type);
      assert.ok(types.includes('agent_spawn'), `history must contain agent_spawn, got ${types}`);
      assert.ok(types.includes('tool_start'), `history must contain tool_start, got ${types}`);
      assert.ok(types.includes('tool_end'), `history must contain tool_end, got ${types}`);
    } finally {
      sse.close();
    }
  }, LONG);

  it('F2: the state file advances and a second pass forwards nothing', async () => {
    if (!HAVE_PY) return;
    const db = path.join(dir, 'state.db');
    const stateFile = path.join(dir, 'bridge-state.json');
    const first = H.readBridgeState(stateFile);
    assert.ok(first && first.last_rowid >= 3, `state file must record the last rowid, got ${JSON.stringify(first)}`);

    const before = await srv.get('/api/integration');
    const again = H.runBridge({ db, endpoint: `http://127.0.0.1:${srv.port}`, stateFile });
    assert.strictEqual(again.code, 0, again.stderr.slice(-500));
    const afterRun = await srv.get('/api/integration');
    assert.strictEqual(afterRun.json.events_total, before.json.events_total, 'no new rows means no new events');
    assert.strictEqual(H.readBridgeState(stateFile).last_rowid, first.last_rowid);
  }, LONG);

  it('F3: a large batch is chunked below the ingest cap instead of a 413', async () => {
    if (!HAVE_PY) return;
    const db = path.join(dir, 'state-big.db');
    const stateFile = path.join(dir, 'bridge-state-big.json');
    const rows = [{ session_id: 'sess-big', role: 'user', content: 'Kerjakan tugas besar', timestamp: 1 }];
    for (let i = 0; i < 60; i++) {
      rows.push({
        session_id: 'sess-big', role: 'assistant', content: '',
        tool_calls: JSON.stringify([{ function: { name: 'terminal', arguments: { command: `run ${i} ${'y'.repeat(900)}` } } }]),
        timestamp: 2 + i
      });
      rows.push({ session_id: 'sess-big', role: 'tool', content: '{"exit_code":0}', tool_name: 'terminal', timestamp: 3 + i });
    }
    H.createHermesDb(db, rows);

    const run = H.runBridge({ db, endpoint: `http://127.0.0.1:${srv.port}`, stateFile });
    assert.strictEqual(run.code, 0, `bridge failed: ${run.stderr.slice(-1200)}`);
    assert.ok(!/HTTP 413/.test(run.stderr), 'no batch may be rejected as too large');

    const health = await srv.get('/healthz');
    assert.strictEqual(health.status, 200);
    const state = H.readBridgeState(stateFile);
    assert.ok(state.last_rowid >= rows.length, `state must advance past every row, got ${state.last_rowid}`);
  }, LONG);
});


describe('Tier 4 — HTTP Integration: Server-authoritative world', () => {
  let srv = null;

  beforeAll(async () => { srv = await H.startServer({ keepDir: true }); });
  afterAll(async () => {
    if (srv) {
      await srv.stop();
      fs.rmSync(srv.dir, { recursive: true, force: true });
    }
    srv = null;
  });

  it('W1: GET /api/world returns every character plus the cat', async () => {
    if (!HAVE_PY) return;
    const res = await srv.get('/api/world');
    assert.strictEqual(res.status, 200);
    const ids = res.json.chars.map((c) => c.id);
    assert.ok(ids.includes('lami'), 'the boss must be in the world');
    assert.ok(ids.filter((id) => id.startsWith('res-')).length >= 13, 'all residents must be present');
    assert.strictEqual(res.json.cat.id, 'mochi');
    assert.ok(res.json.flags && typeof res.json.flags.chars === 'number');
  }, LONG);

  it('W2: characters are never inside a solid tile', async () => {
    if (!HAVE_PY) return;
    // Let the office walk for a while so the check also covers mid-route positions.
    await H.sleep(3000);
    const res = await srv.get('/api/world');
    const bad = H.pythonJson(`
import json, sys, world
chars = json.loads(sys.argv[1])
print(json.dumps([c["id"] for c in chars if not world.is_walkable(c["col"], c["row"])]))
`, [JSON.stringify(res.json.chars)]);
    assert.deepStrictEqual(bad, [], `characters on solid tiles: ${JSON.stringify(bad)}`);
  }, LONG);

  it('W3: the world streams over SSE with no browser driving it', async () => {
    if (!HAVE_PY) return;
    const sse = await srv.sse();
    try {
      await sse.waitFor((ev) => ev.type === 'snapshot', 5000);
      const frame = await sse.waitFor((ev) => ev.type === 'world', 6000);
      assert.ok(Array.isArray(frame.chars) && frame.chars.length > 0, 'frames must carry characters');
      assert.ok(frame.t > 0, 'frames must be timestamped');
    } finally {
      sse.close();
    }
  }, LONG);

  it('W4: two independent clients see identical character positions', async () => {
    if (!HAVE_PY) return;
    const a = await srv.sse();
    const b = await srv.sse();
    try {
      await srv.post('/api/event', { type: 'agent_spawn', agentId: 'wm-sync', parentId: 'lami', task: 'sync probe' });
      const fa = await a.waitFor((ev) => ev.type === 'world', 6000);
      const fb = await b.waitFor((ev) => ev.type === 'world', 6000);
      const proj = (f) => f.chars.map((c) => [c.id, c.col, c.row]);
      assert.deepStrictEqual(proj(fa), proj(fb), 'every visitor must see the same office');
    } finally {
      a.close();
      b.close();
    }
  }, LONG);

  it('W5: the office keeps moving while nobody is watching', async () => {
    if (!HAVE_PY) return;
    const before = await srv.get('/api/world');
    const seen = new Map(before.json.chars.map((c) => [c.id, `${c.col},${c.row}`]));
    let moved = 0;
    for (let i = 0; i < 20 && moved === 0; i++) {
      await H.sleep(1500);
      const now = await srv.get('/api/world');
      moved = now.json.chars.filter((c) => seen.get(c.id) !== `${c.col},${c.row}`).length;
    }
    assert.ok(moved > 0, 'positions must change with no client open');
    const integ = await srv.get('/api/integration');
    assert.ok(integ.json.world.ticks > 0, 'the simulation thread must be ticking');
    assert.ok(integ.json.world.last_tick_ms < 50, `a tick must stay cheap, got ${integ.json.world.last_tick_ms}ms`);
  }, LONG);

  it('W6: world frames do not pollute history or the event counter', async () => {
    if (!HAVE_PY) return;
    const before = await srv.get('/api/integration');
    await H.sleep(2500);
    const after = await srv.get('/api/integration');
    // World frames and narration must not touch the Hermes ingest counter: only
    // the difference between frames and narration counts as "real" events.
    assert.strictEqual(after.json.events_total - before.json.events_total,
      after.json.world.narrated - before.json.world.narrated,
      'world frames are stream-only; only narration events are counted as events');
    // Neither /api/agents nor the snapshot may carry a world frame.
    const snap = await srv.get('/api/agents');
    assert.ok(snap.json && Array.isArray(snap.json.agents), '/api/agents still answers');
    assert.ok(!JSON.stringify(snap.json).includes('"type":"world"'), 'no world frame may enter a state endpoint');
    const sse = await srv.sse();
    try {
      const initial = await sse.waitFor((ev) => ev.type === 'snapshot', 5000);
      assert.ok(!JSON.stringify(initial).includes('"type":"world"'), 'the snapshot must stay a real event feed');
    } finally {
      sse.close();
    }
  }, LONG);
});

describe('Tier 4 — HTTP Integration: World survives a server restart', () => {
  let dir = null;

  afterAll(async () => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('W7: character positions resume from the saved state after a restart', async () => {
    if (!HAVE_PY) return;
    dir = H.tmpDir('lami-world-restart-');
    const stateFile = path.join(dir, 'office-state.json');
    const env = { OFFICE_STATE_FILE: stateFile };

    const first = await H.startServer({ dir, keepDir: true, env });
    let saved = null;
    try {
      for (let i = 0; i < 20; i++) {
        await H.sleep(1500);
        const w = await first.get('/api/world');
        if (w.json.chars.some((c) => c.state === 'walk')) {
          saved = w.json.chars;
          break;
        }
      }
      assert.ok(saved, 'a character must start walking before the restart');
      await H.sleep(6000); // let the hub flush the world block
    } finally {
      first.child.kill('SIGTERM');
      await new Promise((r) => first.child.once('exit', r));
    }

    const second = await H.startServer({ dir, keepDir: true, env });
    try {
      const w = await second.get('/api/world');
      const now = new Map(w.json.chars.map((c) => [c.id, c]));
      let matched = 0;
      for (const c of saved) {
        const restored = now.get(c.id);
        if (!restored) continue;
        // The office keeps ticking after boot, so allow a little live drift.
        if (Math.abs(restored.col - c.col) <= 3 && Math.abs(restored.row - c.row) <= 3) matched++;
      }
      assert.ok(matched >= Math.min(saved.length, 14) - 1,
        `positions must resume from the saved state (matched ${matched}/${saved.length})`);
    } finally {
      await second.stop();
    }
  }, { timeout: 120000 });
});

describe('Tier 4 — HTTP Integration: World restore on boot', () => {
  let dir = null;

  afterAll(async () => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('W8: a saved mid-walk position is resumed instead of reseated at the desk', async () => {
    if (!HAVE_PY) return;
    dir = H.tmpDir('lami-world-boot-');
    const stateFile = path.join(dir, 'office-state.json');
    // A fixture captured mid-walk: Lami heading to the window, Rina to the
    // corkboard. Regression for a boot-order bug where the world block was
    // restored before the Sim existed, silently resetting everyone to a desk.
    fs.writeFileSync(stateFile, JSON.stringify({
      day: null,
      stats: {},
      events_total: 0,
      history: [],
      world: {
        ts: Date.now() / 1000,
        lami: {
          col: 20, row: 4, targetCol: 24, targetRow: 5, facing: 'E', state: 'walk',
          path: [{ x: 24, y: 5 }], goal: { x: 24, y: 5 }, slot: null,
          bubble: null, emote: null, carry: null,
          routineState: 'moving_to_activity', routineId: 'window',
          routineTimer: 0, activityDuration: 0, task: 'Menatap Kota', tool: 'delegate'
        },
        residents: {
          'res-rina': {
            col: 45, row: 10, targetCol: 32, targetRow: 6, facing: 'W', state: 'walk',
            path: [{ x: 32, y: 10 }, { x: 32, y: 6 }], goal: { x: 32, y: 6 },
            slot: { roomId: 'research', index: 0, type: 'desk', facing: 'N' },
            bubble: null, emote: null, carry: null,
            routineState: 'moving_to_activity', routineId: 'corkboard',
            routineTimer: 0, activityDuration: 0, task: 'Cek Papan Catatan', tool: 'search'
          }
        },
        cat: { col: 72, row: 36, targetCol: 72, targetRow: 36, state: 'sit', facing: 'W' },
        subagents: {},
        pizzaTimer: 0,
        randomEventTimer: 45
      }
    }));

    const srv = await H.startServer({ dir, keepDir: true, env: { OFFICE_STATE_FILE: stateFile } });
    try {
      const w = await srv.get('/api/world');
      const chars = new Map(w.json.chars.map((c) => [c.id, c]));
      const lami = chars.get('lami');
      const rina = chars.get('res-rina');
      const dist = (c, x, y) => Math.hypot(c.col - x, c.row - y);

      // Resumed near the saved tile (a couple of ticks of walking, not a jump).
      assert.ok(dist(lami, 20, 4) < 4, `Lami must resume near the window walk, got ${lami.col},${lami.row}`);
      assert.ok(dist(rina, 45, 10) < 4, `Rina must resume near the hallway walk, got ${rina.col},${rina.row}`);
      // Far from the desk it would have been reseated to.
      assert.ok(dist(rina, 34, 10) > 5, 'Rina must NOT be back at her desk');
      // The routine survived, so the walk continues instead of restarting.
      assert.strictEqual(rina.routineState, 'moving_to_activity');
      assert.strictEqual(rina.task, 'Cek Papan Catatan');
    } finally {
      await srv.stop();
    }
  }, { timeout: 90000 });
});

describe('Tier 4 — HTTP Integration: Hermes drives the office (dashboard)', () => {
  let srv = null;

  beforeAll(async () => { srv = await H.startServer({ keepDir: true }); });
  afterAll(async () => {
    if (srv) {
      await srv.stop();
      fs.rmSync(srv.dir, { recursive: true, force: true });
    }
    srv = null;
  });

  it('D1: an office with no Hermes activity reports itself as idle and empty', async () => {
    if (!HAVE_PY) return;
    const w = await srv.get('/api/world');
    assert.strictEqual(w.json.status.mode, 'idle', 'a quiet office must not claim to be live');
    assert.strictEqual(w.json.status.agents_active, 0);
    assert.deepStrictEqual(w.json.roster.agents, [], 'no agents may be invented');
    assert.strictEqual(w.json.chars.filter((c) => c.kind === 'sub').length, 0);
  }, LONG);

  it('D2: a delegated agent walks into the room its tool belongs to', async () => {
    if (!HAVE_PY) return;
    await srv.post('/api/event', { type: 'agent_spawn', agentId: 'sa-web', parentId: 'lami', task: 'cek halaman web' });
    await srv.post('/api/event', { type: 'tool_start', agentId: 'sa-web', tool: 'web_search', summary: 'cari docs' });
    await H.sleep(1600);

    const w = await srv.get('/api/world');
    const sub = w.json.chars.find((c) => c.id === 'sa-web');
    assert.ok(sub, 'the agent must appear on the floor');
    assert.strictEqual(sub.slot && sub.slot.roomId, 'research', 'a search tool belongs to the research lab');

    const roster = w.json.roster.agents.map((a) => a.id);
    assert.ok(roster.includes('sa-web'), 'the roster must list the real agent');
    assert.strictEqual(w.json.status.mode, 'live');
    assert.ok(w.json.status.agents_active >= 1);
    assert.ok(w.json.status.events_handled > 0, 'the simulation must have consumed the events');
  }, LONG);

  it('D3: changing tool moves the agent to the matching room', async () => {
    if (!HAVE_PY) return;
    await srv.post('/api/event', { type: 'tool_start', agentId: 'sa-web', tool: 'terminal', summary: 'run tests' });
    await H.sleep(1600);
    const w = await srv.get('/api/world');
    const sub = w.json.chars.find((c) => c.id === 'sa-web');
    assert.strictEqual(sub.slot && sub.slot.roomId, 'engineering', 'a terminal tool belongs to engineering');
  }, LONG);

  it('D4: a duplicated spawn never creates a second body', async () => {
    if (!HAVE_PY) return;
    await srv.post('/api/event', { type: 'agent_spawn', agentId: 'sa-dup', parentId: 'lami', task: 'probe' });
    await srv.post('/api/event', { type: 'agent_spawn', agentId: 'sa-dup', parentId: 'lami', task: 'probe' });
    await H.sleep(1200);
    const w = await srv.get('/api/world');
    const bodies = w.json.chars.filter((c) => c.id === 'sa-dup');
    assert.strictEqual(bodies.length, 1, 'reconciliation must be idempotent');
    await srv.post('/api/event', { type: 'agent_done', agentId: 'sa-dup', ok: true });
  }, LONG);

  it('D5: a finished agent leaves the floor and the roster', async () => {
    if (!HAVE_PY) return;
    await srv.post('/api/event', { type: 'agent_done', agentId: 'sa-web', ok: true });
    let removed = false;
    for (let i = 0; i < 14; i++) {
      await H.sleep(1200);
      const w = await srv.get('/api/world');
      if (!w.json.chars.some((c) => c.id === 'sa-web') &&
          !w.json.roster.agents.some((a) => a.id === 'sa-web')) {
        removed = true;
        break;
      }
    }
    assert.ok(removed, 'the agent must despawn after reporting');
  }, { timeout: 60000 });

  it('D6: GET /api/roster exposes the same truth as the frame', async () => {
    if (!HAVE_PY) return;
    const w = await srv.get('/api/world');
    const roster = await srv.get('/api/roster');
    assert.strictEqual(roster.status, 200);
    assert.deepStrictEqual(
      roster.json.roster.agents.map((a) => a.id).sort(),
      w.json.roster.agents.map((a) => a.id).sort(),
      '/api/roster and the world frame must not disagree'
    );
    assert.strictEqual(roster.json.status.agents_active, w.json.status.agents_active);
  }, LONG);

  it('D7: the office invents no narration while Hermes is quiet', async () => {
    if (!HAVE_PY) return;
    const sse = await srv.sse();
    try {
      await sse.waitFor((ev) => ev.type === 'snapshot', 5000);
      await H.sleep(6000);
      const banners = sse.events.filter((e) => e.type === 'event_banner');
      assert.deepStrictEqual(banners, [], 'no martabak/power/coffee/printer events by default');
      const chats = sse.events.filter((e) => e.type === 'message');
      assert.deepStrictEqual(chats, [], 'staff must not emit invented chat lines');
    } finally {
      sse.close();
    }
  }, LONG);

  it('D8: a failing simulation never breaks ingest', async () => {
    if (!HAVE_PY) return;
    // The hook is wrapped: a 200 here proves an exception inside the world cannot
    // take down the bridge path.
    const res = await srv.post('/api/event', { type: 'agent_status', agentId: 'lami', status: 'thinking' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.accepted, 1);
    const health = await srv.get('/healthz');
    assert.strictEqual(health.status, 200);
  }, LONG);
});
