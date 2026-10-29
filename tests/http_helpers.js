/**
 * HTTP-level integration helpers for the Lami AI Office backend.
 *
 * Boots the real `server.py` as a subprocess and drives it over real HTTP, plus
 * local stub A2A peers and the real Hermes bridge. Everything binds 127.0.0.1 on
 * an ephemeral port, so the suite never touches the production LAN peers.
 */

const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const SERVER = path.join(REPO, 'services', 'lami-office-react', 'server.py');
const BRIDGE = path.join(REPO, 'services', 'lami-office-react', 'deploy', 'hermes_bridge.py');

function pythonBin() {
  return process.env.PYTHON || 'python3';
}

// The whole HTTP suite is skipped with an explicit reason when python3 is absent.
function pythonAvailable() {
  try {
    const res = spawnSync(pythonBin(), ['--version'], { encoding: 'utf8', timeout: 8000 });
    return res.status === 0;
  } catch (_) {
    return false;
  }
}

function freePort(attempt = 0) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', (err) => {
      srv.close();
      if (attempt < 5) resolve(freePort(attempt + 1));
      else reject(new Error(`could not find a free port after 5 attempts: ${err.message}`));
    });
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function tmpDir(prefix = 'lami-http-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// --- HTTP -----------------------------------------------------------------

function request(port, method, pathname, { body, headers = {}, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : (Buffer.isBuffer(body) ? body : Buffer.from(
      typeof body === 'string' ? body : JSON.stringify(body)));
    const hdrs = Object.assign({}, headers);
    if (payload) hdrs['Content-Length'] = String(payload.length);
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: hdrs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.setTimeout(timeout, () => req.destroy(new Error(`${method} ${pathname} timed out`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const getJson = (port, p, opts) => request(port, 'GET', p, opts);
const postJson = (port, p, body, opts = {}) => request(port, 'POST', p, Object.assign({ body }, opts));

// Speaks raw HTTP so a deliberately malformed header (e.g. Content-Length: abc)
// survives to the server; Node's client would rewrite it.
function rawStatus(port, rawRequest, { timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => sock.write(rawRequest));
    let data = '';
    sock.setTimeout(timeout, () => { sock.destroy(); reject(new Error('raw request timed out')); });
    sock.on('data', (chunk) => { data += chunk.toString('utf8'); });
    sock.on('end', () => {
      const m = /^HTTP\/1\.[01] (\d{3})/.exec(data);
      resolve(m ? Number(m[1]) : 0);
    });
    sock.on('error', reject);
  });
}

async function waitForHealth(port, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await getJson(port, '/healthz', { timeout: 1500 });
      if (res.status === 200) return res.json;
    } catch (err) {
      lastErr = err;
    }
    await sleep(120);
  }
  throw new Error(`server on :${port} did not become healthy: ${lastErr ? lastErr.message : 'no response'}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Opens the SSE stream and parses `data:` frames as they arrive.
function openSse(port, { timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const events = [];
    const waiters = [];
    let buffer = '';
    let closed = false;
    const req = http.get({ host: '127.0.0.1', port, path: '/events', headers: { Accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`/events -> HTTP ${res.statusCode}`));
        return;
      }
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n\n')) > -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try {
              events.push(JSON.parse(line.slice(5).trim()));
            } catch (_) { /* ignore malformed frame */ }
          }
        }
        for (const w of waiters.slice()) {
          const hit = events.find(w.predicate);
          if (hit) {
            waiters.splice(waiters.indexOf(w), 1);
            w.resolve(hit);
          }
        }
      });
      res.on('end', () => { closed = true; });
      resolve({
        events,
        get closed() { return closed; },
        waitFor(predicate, waitMs = 5000) {
          const hit = events.find(predicate);
          if (hit) return Promise.resolve(hit);
          return new Promise((res2, rej2) => {
            const timer = setTimeout(() => rej2(new Error('timed out waiting for SSE event')), waitMs);
            waiters.push({ predicate, resolve: (ev) => { clearTimeout(timer); res2(ev); } });
          });
        },
        close() {
          req.destroy();
        }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(new Error('SSE connect timed out')); });
    req.on('error', (err) => { if (!closed) reject(err); });
  });
}

// --- Server process -------------------------------------------------------

async function startServer(overrides = {}) {
  const port = overrides.port || await freePort();
  const dir = overrides.dir || tmpDir();
  const env = Object.assign({}, process.env, {
    HOST: '127.0.0.1',
    PORT: String(port),
    OFFICE_SOURCE: 'none',
    HERMES_HOME: path.join(dir, 'hermes'),
    // Never reuse the developer's real office state: an isolated file keeps the
    // suite hermetic and stops "[state] dipulihkan" boot noise.
    OFFICE_STATE_FILE: path.join(dir, 'office-state.json'),
    PUBLIC_MODE: 'live',
    INGEST_TOKEN: 'test-token',
    A2A_SECRET: 'test-mesh-secret',
    A2A_PEERS: '[]',
    A2A_POLL_INTERVAL: '1',
    A2A_REPLY_TIMEOUT: '10'
  }, overrides.env || {});
  fs.mkdirSync(env.HERMES_HOME, { recursive: true });

  const child = spawn(pythonBin(), [SERVER], { env, cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.on('error', () => {});

  const stop = async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    const settled = await Promise.race([exited, sleep(3000).then(() => 'timeout')]);
    if (settled === 'timeout' && child.exitCode === null) child.kill('SIGKILL');
    await exited;
    if (!overrides.keepDir) fs.rmSync(dir, { recursive: true, force: true });
  };

  const started = {
    port, dir, child, logs: () => out, stop,
    get: (p, opts) => getJson(port, p, opts),
    post: (p, body, opts) => postJson(port, p, body, opts),
    sse: (opts) => openSse(port, opts)
  };

  try {
    await waitForHealth(port);
  } catch (err) {
    await stop();
    throw new Error(`${err.message}\n--- server output ---\n${out.slice(-1500)}`);
  }
  return started;
}

// --- Stub A2A peers -------------------------------------------------------

// protocol: 'custom' (GET /health + POST /a2a/message) or 'a2a' (Agent Card + JSON-RPC)
async function startStubPeer({ protocol = 'custom', failSend = false, rpcError = null } = {}) {
  const port = await freePort();
  const seen = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* ignore */ }
      const record = { method: req.method, url: req.url, headers: req.headers, body: json };
      seen.push(record);
      const send = (code, obj) => {
        const body = Buffer.from(JSON.stringify(obj));
        res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': String(body.length) });
        res.end(body);
      };

      if (protocol === 'a2a') {
        if (req.method === 'GET' && req.url.startsWith('/.well-known/agent-card.json')) {
          return send(200, {
            protocolVersion: '1.0',
            name: 'hermes-agent-yuna',
            skills: [{ id: 'finance-report' }, { id: 'research' }]
          });
        }
        if (req.method === 'POST' && req.url === '/') {
          if (failSend) return send(500, { error: 'stub failure' });
          if (rpcError) return send(200, { jsonrpc: '2.0', id: json && json.id, error: rpcError });
          return send(200, {
            jsonrpc: '2.0',
            id: json && json.id,
            result: {
              task: {
                status: { state: 'TASK_STATE_COMPLETED', message: { parts: [{ text: 'laporan siap' }] } }
              }
            }
          });
        }
        return send(404, { error: 'not found' });
      }

      if (req.method === 'GET' && req.url === '/health') {
        return send(200, { status: 'online', hostname: 'stub-sidecar', agent_id: 'stub' });
      }
      if (req.method === 'POST' && req.url === '/a2a/message') {
        if (failSend) return send(500, { error: 'stub failure' });
        return send(200, { status: 'queued' });
      }
      return send(404, { error: 'not found' });
    });
  });
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', resolve);
  });
  return {
    port,
    seen,
    callsTo(suffix) { return seen.filter((s) => s.url.endsWith(suffix)); },
    async stop() {
      await new Promise((resolve) => srv.close(resolve));
    }
  };
}

// --- Agent metrics stub ---------------------------------------------------
// Serves the same payload shape as deploy/metrics_agent.py so the office can be
// tested without touching the real agent hosts.
async function startMetricsStub({ agent = 'stub', cpu = 42.5, mem = 32.3, disk = 20, fail = false } = {}) {
  const port = await freePort();
  const srv = http.createServer((req, res) => {
    const send = (code, obj) => {
      const body = Buffer.from(JSON.stringify(obj));
      res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': String(body.length) });
      res.end(body);
    };
    const path = req.url.split('?')[0];
    if (!fail && path === '/metrics') {
      return send(200, {
        agent, host: `stub-${agent}`, ts: Date.now() / 1000, uptime_s: 1234,
        cpu: { cores: 2, percent: cpu, load1: 0.4, load5: 0.3, load15: 0.2 },
        mem: { total_mb: 3819, used_mb: 1234, available_mb: 2585, percent: mem },
        disk: { mount: '/', total_gb: 30, used_gb: 6, percent: disk }
      });
    }
    if (path === '/health') return send(200, { status: 'online', hostname: `stub-${agent}` });
    return send(404, { error: 'not found' });
  });
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', resolve);
  });
  return { port, async stop() { await new Promise((r) => srv.close(r)); } };
}

// --- Hermes bridge fixtures ----------------------------------------------

// Creates a Hermes-shaped state.db so the real bridge can be exercised.
function createHermesDb(dbPath, rows) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const script = `
import json, sqlite3, sys
path, payload = sys.argv[1], json.loads(sys.argv[2])
con = sqlite3.connect(path)
con.execute("""CREATE TABLE IF NOT EXISTS messages (
  session_id TEXT, role TEXT, content TEXT, tool_name TEXT, tool_calls TEXT, timestamp REAL
)""")
for r in payload:
    con.execute(
        "INSERT INTO messages (session_id, role, content, tool_name, tool_calls, timestamp) VALUES (?,?,?,?,?,?)",
        (r.get("session_id"), r.get("role"), r.get("content"), r.get("tool_name"), r.get("tool_calls"), r.get("timestamp"))
    )
con.commit()
con.close()
print("ok")
`;
  const res = spawnSync(pythonBin(), ['-c', script, dbPath, JSON.stringify(rows)], { encoding: 'utf8', timeout: 15000 });
  if (res.status !== 0) throw new Error(`could not create hermes db: ${res.stderr || res.stdout}`);
  return dbPath;
}

// Runs the real hermes_bridge.py once against the office server.
function runBridge({ db, endpoint, stateFile, token = 'test-token', extraArgs = [], timeout = 30000 }) {
  const args = [BRIDGE, '--once', '--db', db, '--endpoint', endpoint, '--state-file', stateFile,
    '--backlog', '200'].concat(extraArgs);
  if (token) args.push('--token', token);
  const res = spawnSync(pythonBin(), args, { encoding: 'utf8', timeout });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function readBridgeState(stateFile) {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (_) {
    return null;
  }
}

// Runs a python snippet inside services/lami-office-react (so `import world`
// works) and returns its parsed JSON stdout. argv goes through sys.argv.
function pythonJson(script, args = [], timeout = 60000) {
  const res = spawnSync(pythonBin(), ['-c', script, ...args], {
    cwd: path.join(REPO, 'services', 'lami-office-react'),
    encoding: 'utf8',
    timeout
  });
  if (res.status !== 0) {
    throw new Error(`python helper failed:\n${(res.stderr || res.stdout || '').slice(-1200)}`);
  }
  const lines = (res.stdout || '').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

module.exports = {
  REPO,
  pythonJson,
  SERVER,
  BRIDGE,
  pythonAvailable,
  freePort,
  tmpDir,
  request,
  rawStatus,
  getJson,
  postJson,
  waitForHealth,
  openSse,
  sleep,
  startServer,
  startStubPeer,
  startMetricsStub,
  createHermesDb,
  runBridge,
  readBridgeState
};
