#!/usr/bin/env python3
"""hermes_bridge.py — run next to Hermes Agent and mirror its activity into Lami's AI Office.

The office server can only watch a Hermes home that lives on the same machine.
When Hermes runs on another host (e.g. 192.168.3.31) start this bridge there:

    python3 hermes_bridge.py \
        --endpoint http://192.168.3.33:13579 \
        --token "$OFFICE_INGEST_TOKEN"

It tails the Hermes SQLite state database read-only, converts tool calls into
office events (agent_spawn / tool_start / tool_end / agent_status / message /
agent_done) and POSTs them to /api/event with the shared ingest token.

Examples:
    python3 hermes_bridge.py --probe                 # show parsed events, send nothing
    python3 hermes_bridge.py --once --limit 20       # one batch then exit
    python3 hermes_bridge.py --include-cron          # also mirror cron sessions
    python3 hermes_bridge.py --dry-run               # poll but never POST

Stdlib only. Safe to run as a systemd user service.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_DB = "~/.hermes/state.db"
TOOL_ARG_HINTS = ("command", "path", "query", "url", "prompt", "summary", "task", "pattern", "name")
_SECRET_RX = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{10,}"),
    re.compile(r"xox[abprs]-[A-Za-z0-9\-]{8,}"),
    re.compile(r"\b\d{6,}:[A-Za-z0-9_\-]{20,}\b"),
]
_URL_RX = re.compile(r"https?://([^/\s\"'<>]+)[^\s\"'<>]*", re.I)


def clean(value, limit: int = 60) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = json.dumps(value, ensure_ascii=False)
        except Exception:  # noqa: BLE001
            value = str(value)
    text = _URL_RX.sub(lambda m: m.group(1).split("@")[-1], value)
    for rx in _SECRET_RX:
        text = rx.sub("•••", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[: limit - 1].rstrip() + "…" if len(text) > limit else text


def agent_id_for(session: str, boss_sessions: set[str]) -> str:
    if session in boss_sessions:
        return "lami"
    digest = hashlib.sha1(session.encode()).hexdigest()[:6]
    return f"sa-{digest}"


def summarize_call(name: str, raw_args) -> str:
    args = raw_args
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except Exception:  # noqa: BLE001
            args = {"raw": args}
    if not isinstance(args, dict):
        args = {}
    for hint in TOOL_ARG_HINTS:
        if args.get(hint):
            return clean(f"{name}: {args[hint]}")
    return clean(name)


class Bridge:
    def __init__(self, opts):
        self.opts = opts
        self.db = Path(os.path.expanduser(opts.db))
        self.state_path = Path(os.path.expanduser(opts.state_file))
        self.url = opts.endpoint.rstrip("/") + "/api/event"
        self.last_rowid = self._load_state()
        self.spawned: set[str] = set()
        self.last_seen: dict[str, float] = {}
        self.boss_sessions = set(opts.boss_session or [])

    def _load_state(self) -> int:
        try:
            return int(json.loads(self.state_path.read_text())["last_rowid"])
        except Exception:  # noqa: BLE001
            return 0

    def _save_state(self):
        try:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            self.state_path.write_text(json.dumps({"last_rowid": self.last_rowid}))
        except OSError as exc:
            log(f"state file not writable: {exc}")

    def connect(self):
        if not self.db.exists():
            raise SystemExit(f"state.db tidak ditemukan: {self.db}")
        return sqlite3.connect(f"file:{self.db}?mode=ro", uri=True)

    def rows(self, limit: int | None):
        con = self.connect()
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        if self.opts.probe and limit:
            # Probe shows the most recent rows instead of the oldest backlog.
            cur.execute(
                "SELECT rowid AS _rowid, session_id, role, content, tool_name, tool_calls, timestamp "
                "FROM messages ORDER BY rowid DESC LIMIT ?", (limit,))
            data = list(reversed(cur.fetchall()))
        elif self.last_rowid <= 0:
            # No state yet: start at the live end of the log instead of replaying
            # the whole history (a fresh DB has ~16k rows, far past the ingest cap).
            cur.execute("SELECT COALESCE(MAX(rowid), 0) AS m FROM messages")
            latest = cur.fetchone()["m"]
            self.last_rowid = latest - self.opts.backlog
            if self.last_rowid < 0:
                self.last_rowid = 0
            data = self._select_after(cur, self.last_rowid, limit if limit and limit < self.opts.backlog else self.opts.backlog)
        else:
            data = self._select_after(cur, self.last_rowid, limit)
        con.close()
        return data

    @staticmethod
    def _select_after(cur, after: int, limit: int | None):
        cur.execute(
            "SELECT rowid AS _rowid, session_id, role, content, tool_name, tool_calls, timestamp "
            "FROM messages WHERE rowid > ? ORDER BY rowid ASC" + (" LIMIT ?" if limit else ""),
            ((after, limit) if limit else (after,)),
        )
        return cur.fetchall()

    def session_task(self, session: str) -> str:
        try:
            con = self.connect()
            row = con.execute(
                "SELECT content FROM messages WHERE session_id=? AND role='user' ORDER BY rowid ASC LIMIT 1",
                (session,),
            ).fetchone()
            con.close()
            return clean(row[0], 48) if row else "Hermes session"
        except Exception:  # noqa: BLE001
            return "Hermes session"

    def parse(self, row) -> list[dict]:
        sid = row["session_id"] or "unknown"
        if sid.startswith("cron_") and not self.opts.include_cron and sid not in self.boss_sessions:
            return []
        aid = agent_id_for(sid, self.boss_sessions)
        events: list[dict] = []

        if aid not in self.spawned:
            self.spawned.add(aid)
            events.append({"type": "agent_spawn", "agentId": aid, "parentId": "lami",
                           "task": self.session_task(sid), "name": "Hermes" if aid == "lami" else None})
            events[-1] = {k: v for k, v in events[-1].items() if v is not None}

        role = (row["role"] or "").lower()
        if role == "assistant" and row["tool_calls"]:
            try:
                calls = json.loads(row["tool_calls"])
            except Exception:  # noqa: BLE001
                calls = []
            for call in calls if isinstance(calls, list) else []:
                fn = call.get("function") or {}
                name = fn.get("name") or call.get("name") or "tool"
                events.append({"type": "tool_start", "agentId": aid, "tool": name,
                               "summary": summarize_call(name, fn.get("arguments", call.get("arguments")))})
        elif role == "tool":
            ok = True
            try:
                payload = json.loads(row["content"] or "{}")
                if isinstance(payload, dict) and payload.get("exit_code") not in (None, 0):
                    ok = False
            except Exception:  # noqa: BLE001
                pass
            events.append({"type": "tool_end", "agentId": aid, "tool": row["tool_name"] or "tool", "ok": ok})
        elif role == "assistant" and row["content"]:
            text = clean(row["content"], 70)
            if text:
                events.append({"type": "message", "agentId": aid, "text": text})
                events.append({"type": "agent_status", "agentId": aid, "status": "happy"})

        if events:
            self.last_seen[aid] = time.time()
        return events

    def send(self, events: list[dict]) -> bool:
        if not events:
            return True
        if self.opts.dry_run:
            for ev in events:
                print("DRY", json.dumps(ev, ensure_ascii=False))
            return True
        body = json.dumps(events).encode()
        req = urllib.request.Request(self.url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.opts.token:
            req.add_header("X-Office-Token", self.opts.token)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except urllib.error.HTTPError as exc:
            log(f"POST {self.url} -> HTTP {exc.code} {exc.read()[:120]!r}")
        except Exception as exc:  # noqa: BLE001
            log(f"POST {self.url} gagal: {exc}")
        return False

    MAX_BATCH_BYTES = 60_000

    def send_batches(self, last_rowid: int, events: list[dict]) -> int:
        chunk: list[dict] = []
        size = 0
        sent = 0
        for ev in events + [None]:
            if ev is None:
                break
            ev_size = len(json.dumps(ev, ensure_ascii=False).encode()) + 2
            if chunk and size + ev_size > self.MAX_BATCH_BYTES:
                if not self.send(chunk):
                    return sent
                sent += len(chunk)
                chunk, size = [], 0
            chunk.append(ev)
            size += ev_size
        if chunk and not self.send(chunk):
            return sent
        sent += len(chunk)
        self.last_rowid = last_rowid
        self._save_state()
        return sent

    def reap(self):
        now = time.time()
        for aid, seen in list(self.last_seen.items()):
            if now - seen > self.opts.timeout:
                self.send([{"type": "agent_done", "agentId": aid, "ok": True, "result": "idle timeout"}])
                self.last_seen.pop(aid, None)
                self.spawned.discard(aid)

    def poll_once(self, limit: int | None = None) -> int:
        rows = self.rows(limit)
        if not rows:
            return 0
        batch: list[dict] = []
        for row in rows:
            batch.extend(self.parse(row))
        # Split the batch so a large backlog never exceeds the server's body cap
        # (256 KB) and gets rejected as one oversized request.
        if not self.opts.probe:
            return self.send_batches(rows[-1]["_rowid"], batch)
        if self.opts.probe:
            for ev in batch:
                print(json.dumps(ev, ensure_ascii=False))
            self.last_rowid = rows[-1]["_rowid"]
            return len(batch)
        if self.send(batch):
            self.last_rowid = rows[-1]["_rowid"]
            self._save_state()
        return len(batch)

    def run(self):
        if self.opts.probe:
            print(f"# probing {self.db} (rowid > {self.last_rowid})")
            self.poll_once(self.opts.limit)
            return
        log(f"bridge -> {self.url} db={self.db} rowid={self.last_rowid}")
        while True:
            try:
                count = self.poll_once(self.opts.limit if self.opts.once else None)
                if count:
                    log(f"forwarded {count} events (rowid={self.last_rowid})")
            except Exception as exc:  # noqa: BLE001
                log(f"poll error: {exc}")
            self.reap()
            if self.opts.once:
                return
            time.sleep(self.opts.poll)


def log(msg: str):
    sys.stderr.write(f"[bridge] {time.strftime('%H:%M:%S')} {msg}\n")


def verify(opts) -> int:
    """Check Hermes db + office endpoint wiring without sending real events."""
    import sqlite3
    ok = True

    db = os.path.expanduser(opts.db)
    if not os.path.exists(db):
        print(f"FAIL db      : {db} tidak ada")
        ok = False
    else:
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
            n = con.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
            con.close()
            print(f"OK   db      : {db} ({n} pesan)")
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL db      : {exc}")
            ok = False

    base = opts.endpoint.rstrip("/")
    for path in ("/healthz", "/api/config"):
        try:
            with urllib.request.urlopen(base + path, timeout=5) as resp:
                print(f"OK   {path:<12}: HTTP {resp.status}")
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {path:<12}: {exc}")
            ok = False

    # Ingest probe: a single harmless status event the office answers with 200.
    probe = json.dumps([{"type": "agent_status", "agentId": "lami", "status": "online"}]).encode()
    req = urllib.request.Request(base + "/api/event", data=probe, method="POST")
    req.add_header("Content-Type", "application/json")
    if opts.token:
        req.add_header("X-Office-Token", opts.token)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"OK   ingest  : HTTP {resp.status} {resp.read()[:80].decode('utf-8', 'ignore')}")
    except urllib.error.HTTPError as exc:
        print(f"FAIL ingest  : HTTP {exc.code} {exc.read()[:120].decode('utf-8', 'ignore')}")
        ok = False
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL ingest  : {exc}")
        ok = False

    print("PASSED" if ok else "FAILED")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Mirror Hermes activity into Lami's AI Office.")
    ap.add_argument("--endpoint", default=os.environ.get("OFFICE_URL", "http://127.0.0.1:8090"))
    ap.add_argument("--token", default=os.environ.get("OFFICE_INGEST_TOKEN", ""))
    ap.add_argument("--db", default=os.environ.get("HERMES_STATE_DB", DEFAULT_DB))
    ap.add_argument("--state-file", default="~/.hermes/office_bridge_state.json")
    ap.add_argument("--poll", type=float, default=1.0)
    ap.add_argument("--backlog", type=int, default=200,
                    help="events to replay on first start when no state file exists")
    ap.add_argument("--timeout", type=float, default=90.0, help="idle seconds before agent_done")
    ap.add_argument("--boss-session", action="append", default=[], help="session id(s) shown as Lami")
    ap.add_argument("--include-cron", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--verify", action="store_true", help="cek db + endpoint office lalu keluar")
    ap.add_argument("--dry-run", action="store_true")
    opts = ap.parse_args()
    if opts.verify:
        raise SystemExit(verify(opts))
    Bridge(opts).run()


if __name__ == "__main__":
    main()
