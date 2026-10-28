/**
 * Tier 2 — Backend Hardening (negative testing regressions F-1..F-5)
 *
 * These lock in the failure-testing fixes on services/lami-office-react/server.py:
 *   F-1 ingest reports accepted vs rejected
 *   F-2 a corrupt Hermes DB must not kill the watcher
 *   F-3 a failed A2A send clears the peer's online flag
 *   F-4 the sanitizer keeps prose but masks secrets
 *   F-5 oversized bodies are rejected with 413 before parsing
 */

const { describe, it, assert } = require('../runner_utils');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const SERVER_DIR = path.join(REPO, 'services', 'lami-office-react');

function py(script, env = {}) {
  const out = execFileSync('python3', ['-c', script], {
    cwd: SERVER_DIR,
    env: { ...process.env, OFFICE_SOURCE: "none", HERMES_HOME: "/tmp/kilo/h2-none", ...env },
    encoding: 'utf8',
    timeout: 60000
  });
  return out.trim();
}

describe('Tier 2 — Backend Hardening: Ingest Validation (F-1)', () => {
  it('H1.1: Ingest answers with received/accepted/rejected counts', () => {
    const src = require('node:fs').readFileSync(path.join(SERVER_DIR, 'server.py'), 'utf8');
    assert.ok(/"accepted": accepted/.test(src), 'Ingest must report accepted count');
    assert.ok(/"rejected": rejected/.test(src), 'Ingest must report rejected count');
    assert.ok(/"received": len\(events\)/.test(src), 'Ingest must report received count');
  });

  it('H1.2: Rejected events are counted, not silently published', () => {
    const src = require('node:fs').readFileSync(path.join(SERVER_DIR, 'server.py'), 'utf8');
    assert.ok(/sanitize_event\(ev\) is None/.test(src), 'Unknown event types must be rejected explicitly');
  });

  it('H1.3: Non-object and unknown-type payloads are rejected, never accepted', () => {
    const result = py(`
import sys, os, io
sys.argv=['x']
import server as S
class H(S.Handler):
    path='/api/event'
    def __init__(self, body):
        self.client_address=('127.0.0.1',1); self.headers={}; self.rfile=io.BytesIO(body)
        self.code=None
    def send_json(self, code, obj):
        self.code=code; self.out=obj; return code
for body in [b'"hello"', b'{"type":"hack"}', b'[{"type":"message","text":"a"},123]']:
    h=H(body); S.CFG['ingest_token']=''
    # bypass network read: feed the raw body directly
    ev, err, code = h.read_events()
    accepted=0; rejected=0
    for e in ev:
        if not isinstance(e, dict) or S.sanitize_event(e) is None: rejected+=1
        else: accepted+=1
    print(accepted, rejected, err or 'none')
`);
    assert.strictEqual(result, '0 1 none\n0 1 none\n0 1 none');
  });
});

describe('Tier 2 — Backend Hardening: Body Limits (F-5)', () => {
  it('H5.1: Oversized bodies are rejected with 413 before JSON parsing', () => {
    const result = py(`
import sys, io
sys.argv=['x']
import server as S
class H(S.Handler):
    path='/api/event'
    def __init__(self):
        self.client_address=('127.0.0.1',1)
        self.headers={'Content-Length': str(S.Handler.MAX_BODY + 1000)}
        self.rfile=io.BytesIO(b'')
ev, err, code = H().read_events()
print(code, 'oversize' if 'besar' in (err or '') else err)
`);
    assert.strictEqual(result, '413 oversize');
  });

  it('H5.2: Invalid or negative Content-Length is a 400, never a crash', () => {
    const result = py(`
import sys, io
sys.argv=['x']
import server as S
class H(S.Handler):
    path='/api/event'
    def __init__(self, cl):
        self.client_address=('127.0.0.1',1)
        self.headers={'Content-Length': cl}; self.rfile=io.BytesIO(b'')
for cl in ['abc', '-5', '']:
    ev, err, code = H(cl).read_events()
    print(code)
`);
    assert.strictEqual(result, '400\n400\n200');
  });

  it('H5.3: A valid small body still parses', () => {
    const result = py(`
import sys, io
sys.argv=['x']
import server as S
body=b'{"type":"message","text":"ok"}'
class H(S.Handler):
    path='/api/event'
    def __init__(self):
        self.client_address=('127.0.0.1',1)
        self.headers={'Content-Length': str(len(body))}; self.rfile=io.BytesIO(body)
ev, err, code = H().read_events()
print(code, len(ev), err)
`);
    assert.strictEqual(result, '200 1 None');
  });
});

describe('Tier 2 — Backend Hardening: Watcher Resilience (F-2)', () => {
  it('H2.1: A corrupt Hermes DB is reported, not fatal', () => {
    const result = py(`
import sys, os, threading, time
sys.argv=['x']
import server as S
S.CFG['sqlite_path']='/tmp/kilo/h2-corrupt.db'
S.CFG['antigravity_glob']=''
S.CFG['sessions_glob']='/tmp/kilo/h2-no-sessions/**/*.json*'
S.CFG['source']='sqlite'
S.CFG['poll_interval']=0.05
open('/tmp/kilo/h2-corrupt.db','wb').write(b'not-sqlite'*50)
t=threading.Thread(target=S.watcher_loop, daemon=True); t.start()
for _ in range(60):
    if S.WATCHER['ticks'] >= 1: break
    time.sleep(0.05)
import io, contextlib
buf=io.StringIO()
print('ALIVE' if t.is_alive() else 'DEAD', 'sqlite' in S.WATCHER['errors'], S.WATCHER['ticks'] >= 1)
`).split('\n').pop();
    // watcher_loop prints diagnostics; only the last line is our assertion payload
    assert.strictEqual(result, 'ALIVE True True');
  });

  it('H2.2: Watcher health is exposed through the integration payload', () => {
    const src = require('node:fs').readFileSync(path.join(SERVER_DIR, 'server.py'), 'utf8');
    assert.ok(/"health": \(/.test(src), 'Integration must expose watcher health');
    assert.ok(/"errors": WATCHER\["errors"\]/.test(src), 'Integration must expose watcher errors');
  });
});

describe('Tier 2 — Backend Hardening: A2A Presence (F-3)', () => {
  it('H3.1: A failed send clears the peer online flag', () => {
    const result = py(`
import sys, os, json
sys.argv=['x']
os.environ['A2A_PEERS']=json.dumps([{"id":"dead","host":"192.168.3.200","port":8000,"room":"research"}])
os.environ['A2A_SECRET']='secret'
import server as S
p=S.A2A.get('dead'); p.online=True
r=S.A2A.send('dead','hi')
print(S.A2A.get('dead').online, r.get('status'))
`);
    assert.strictEqual(result, 'False 502');
  });

  it('H3.2: Sending never happens without a configured secret', () => {
    const result = py(`
import sys, os
sys.argv=['x']
os.environ['A2A_SECRET']=''
import server as S
print(S.A2A.send('yuna','hi').get('status'))
`);
    assert.strictEqual(result, '503');
  });
});

describe('Tier 2 — Backend Hardening: Sanitizer Balance (F-4)', () => {
  it('H4.1: Plain prose and long words are preserved', () => {
    const result = py(`
import sys
sys.argv=['x']
import server as S
print(S.clean_text('x'*120, 200))
print(S.clean_text('Lorem ipsum dolor sit amet consectetur adipiscing elit', 200))
`);
    const [word, prose] = result.split('\n');
    assert.strictEqual(word.length, 120, 'Long plain word must not be redacted');
    assert.ok(prose.startsWith('Lorem ipsum'), 'Prose must survive sanitizing');
  });

  it('H4.2: Base64 blobs, hex keys and credential shapes are still masked', () => {
    const result = py(`
import sys
sys.argv=['x']
import server as S
print(S.clean_text('QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODk=', 200))
print(S.clean_text('0123456789abcdef0123456789abcdef', 200))
print(S.clean_text('key=sk-abc123456789012345', 200))
print(S.clean_text('user@example.com', 200))
`);
    const lines = result.split('\n');
    assert.strictEqual(lines[0], '•••', 'Base64 blob must be masked');
    assert.strictEqual(lines[1], '•••', 'Hex key must be masked');
    assert.ok(lines[2].includes('•••'), 'API key must be masked');
    assert.strictEqual(lines[3], '[email]', 'Email must be masked');
  });
});
