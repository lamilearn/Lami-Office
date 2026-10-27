#!/usr/bin/env python3
"""
Lami's AI Office - bridge server.

- Pure Python standard library (no pip install needed).
- Serves the web app (./web) AND the live event stream (/events, Server-Sent Events) on ONE port (default 8090).
- Watches Hermes activity (sqlite state.db or session files) and converts it into office events.
- Local-only ingest endpoint (POST /api/event) so Hermes hooks/scripts can push events directly.
- Every event is sanitized before it reaches the browser (paths, secrets, emails, URLs are masked).

Run:  python3 server.py            (normal)
      python3 server.py --probe    (inspect Hermes data sources, then exit)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import queue
import re
import sqlite3
import sys
import threading
import time
from collections import deque
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
CONFIG_PATH = ROOT / "config.json"

# --------------------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "host": "0.0.0.0",
    "port": 8090,
    "public_mode": "live",          # "live" = tunnel visitors see real (sanitized) activity, "demo" = fake events only
    "ingest_token": "",             # optional token required for POST /api/event
    "hermes_home": "~/.hermes",
    "source": "auto",               # auto | sqlite | sessions | none
    "sqlite_path": "{hermes_home}/state.db",
    "sessions_glob": "{hermes_home}/sessions/**/*.json*",
    "antigravity_glob": "~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl",
    "poll_interval": 0.5,
    "subagent_timeout": 900,        # seconds without activity before a sub-agent is sent home
    "max_summary": 40,
    "extra_redact": [],             # extra regex patterns to mask
    "tool_rooms": {},               # optional overrides, e.g. {"my_tool": "research"}
}


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            user = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            cfg.update({k: v for k, v in user.items() if not k.startswith("_")})
        except Exception as exc:  # noqa: BLE001
            print(f"[config] gagal baca config.json: {exc}", file=sys.stderr)
    env_map = {
        "HOST": "host", "PORT": "port", "PUBLIC_MODE": "public_mode",
        "HERMES_HOME": "hermes_home", "INGEST_TOKEN": "ingest_token", "OFFICE_SOURCE": "source",
    }
    for env, key in env_map.items():
        if os.environ.get(env):
            cfg[key] = os.environ[env]
    cfg["port"] = int(cfg["port"])
    home = os.path.expanduser(str(cfg["hermes_home"]))
    cfg["hermes_home"] = home
    cfg["sqlite_path"] = os.path.expanduser(str(cfg["sqlite_path"]).replace("{hermes_home}", home))
    cfg["sessions_glob"] = os.path.expanduser(str(cfg["sessions_glob"]).replace("{hermes_home}", home))
    cfg["antigravity_glob"] = os.path.expanduser(str(cfg.get("antigravity_glob", "~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl")))
    return cfg


CFG = load_config()

# --------------------------------------------------------------------------------------
# Sanitizer - nothing sensitive leaves this machine
# --------------------------------------------------------------------------------------
_URL = re.compile(r"https?://([^/\s\"'<>]+)[^\s\"'<>]*", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_SECRETS = [
    r"sk-[A-Za-z0-9_\-]{8,}",
    r"(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{10,}",
    r"xox[abprs]-[A-Za-z0-9\-]{8,}",
    r"AKIA[0-9A-Z]{12,}",
    r"AIza[0-9A-Za-z_\-]{20,}",
    r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{4,}",
    r"\b\d{6,}:[A-Za-z0-9_\-]{20,}\b",                       # telegram bot token
    r"(?i)\b(?:api[_-]?key|token|secret|password|passwd|pwd|auth)\b\s*[:=]\s*\S+",
    r"\b[A-Fa-f0-9]{32,}\b",
    r"\b[A-Za-z0-9+/_\-]{40,}={0,2}",
]
_SECRET_RE = [re.compile(p) for p in _SECRETS + list(CFG.get("extra_redact") or [])]
_WIN_PATH = re.compile(r"[A-Za-z]:\\(?:[^\\\s\"']+\\)*([^\\\s\"']+)")
_UNIX_PATH = re.compile(r"(?:~|\.{0,2})?/(?:[\w.\-@]+/)+([\w.\-@]+)")
_ENV = re.compile(r"\$\{?[A-Z_][A-Z0-9_]*\}?")
_TOOL_NAME = re.compile(r"[^\w.\-:]")


def clean_text(value, limit: int | None = None) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = json.dumps(value, ensure_ascii=False)
        except Exception:  # noqa: BLE001
            value = str(value)
    s = value
    s = _URL.sub(lambda m: m.group(1).split("@")[-1], s)
    s = _EMAIL.sub("[email]", s)
    for rx in _SECRET_RE:
        s = rx.sub("•••", s)
    s = _WIN_PATH.sub(lambda m: m.group(1), s)
    s = _UNIX_PATH.sub(lambda m: m.group(1), s)
    s = _ENV.sub("$ENV", s)
    s = re.sub(r"\s+", " ", s).strip()
    limit = limit or int(CFG["max_summary"])
    if len(s) > limit:
        s = s[: limit - 1].rstrip() + "…"
    return s


ALLOWED_KEYS = {"type", "agentId", "parentId", "task", "tool", "summary", "ok", "status", "result", "text", "name", "ts"}
ALLOWED_TYPES = {"agent_spawn", "tool_start", "tool_end", "agent_status", "agent_done", "message"}


def sanitize_event(ev: dict) -> dict | None:
    if not isinstance(ev, dict) or ev.get("type") not in ALLOWED_TYPES:
        return None
    out = {}
    for k, v in ev.items():
        if k not in ALLOWED_KEYS:
            continue
        if k in ("task", "summary", "result", "text", "name"):
            out[k] = clean_text(v, 60 if k in ("task", "result") else None)
        elif k in ("agentId", "parentId", "status"):
            out[k] = _TOOL_NAME.sub("", str(v))[:40]
        elif k == "tool":
            out[k] = _TOOL_NAME.sub("_", str(v))[:40]
        elif k == "ok":
            out[k] = bool(v)
        elif k == "ts":
            try:
                out[k] = float(v)
            except (TypeError, ValueError):
                pass
        else:
            out[k] = v
    out.setdefault("ts", time.time())
    if "agentId" not in out:
        out["agentId"] = "lami"
    return out


# --------------------------------------------------------------------------------------
# Hub - keeps state for snapshots and fans events out to every connected browser
# --------------------------------------------------------------------------------------
class Hub:
    def __init__(self):
        self.lock = threading.Lock()
        self.subs: list[queue.Queue] = []
        self.agents: dict[str, dict] = {}
        self.day = date.today().isoformat()
        self.stats = {"doneToday": 0, "coins": 0, "failedToday": 0}

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=500)
        with self.lock:
            self.subs.append(q)
        return q

    def unsubscribe(self, q: queue.Queue):
        with self.lock:
            if q in self.subs:
                self.subs.remove(q)

    def snapshot(self) -> dict:
        with self.lock:
            return {"type": "snapshot", "agents": list(self.agents.values()), "stats": dict(self.stats), "ts": time.time()}

    def publish(self, raw: dict):
        ev = sanitize_event(raw)
        if not ev:
            return
        with self.lock:
            self._apply(ev)
            for q in list(self.subs):
                try:
                    q.put_nowait(ev)
                except queue.Full:
                    pass

    def _apply(self, ev: dict):
        today = date.today().isoformat()
        if today != self.day:
            self.day = today
            self.stats["doneToday"] = 0
            self.stats["failedToday"] = 0
        aid, t, now = ev["agentId"], ev["type"], time.time()
        if t == "agent_spawn" and aid != "lami":
            self.agents[aid] = {"id": aid, "task": ev.get("task", ""), "name": ev.get("name", ""),
                                "tool": None, "summary": "", "status": "working", "since": now, "last": now}
        elif aid in self.agents:
            a = self.agents[aid]
            a["last"] = now
            if t == "tool_start":
                a["tool"], a["summary"] = ev.get("tool"), ev.get("summary", "")
            elif t == "tool_end":
                a["tool"] = None
            elif t == "agent_status":
                a["status"] = ev.get("status", a["status"])
            elif t == "agent_done":
                self.agents.pop(aid, None)
                if ev.get("ok", True):
                    self.stats["doneToday"] += 1
                    self.stats["coins"] += 1
                else:
                    self.stats["failedToday"] += 1

    def reap(self, timeout: float):
        """Send home sub-agents that went silent."""
        now = time.time()
        with self.lock:
            stale = [aid for aid, a in self.agents.items() if now - a["last"] > timeout]
        for aid in stale:
            self.publish({"type": "agent_done", "agentId": aid, "ok": False, "result": "timeout"})


HUB = Hub()

# --------------------------------------------------------------------------------------
# Hermes adapters
# --------------------------------------------------------------------------------------
ARG_KEYS = ["query", "q", "url", "urls", "path", "file_path", "filename", "file", "command", "cmd",
            "goal", "task", "tasks", "prompt", "pattern", "action", "name", "text", "content"]


def parse_json(value):
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", "ignore")
    if isinstance(value, str) and value.strip()[:1] in ("{", "["):
        try:
            return json.loads(value)
        except Exception:  # noqa: BLE001
            return value
    return value


TOOL_ID_LABELS = {
    "web_search": "Cari info",
    "search_web": "Cari info",
    "browser": "Buka web",
    "read_url": "Baca web",
    "read_url_content": "Baca web",
    "write_file": "Tulis file",
    "write_to_file": "Tulis file",
    "edit_file": "Edit file",
    "replace_file_content": "Edit file",
    "multi_replace_file_content": "Edit file",
    "read_file": "Baca file",
    "view_file": "Baca file",
    "list_dir": "Cek folder",
    "run_command": "Terminal",
    "terminal": "Terminal",
    "shell": "Terminal",
    "grep_search": "Cari kode",
    "delegate_task": "Bagi tugas",
    "image_gen": "Bikin gambar",
    "generate_image": "Bikin gambar",
}


def summarize_args(tool: str, args) -> str:
    args = parse_json(args)
    label = TOOL_ID_LABELS.get(tool, tool.replace("_", " "))
    detail = ""
    if isinstance(args, dict):
        for key in ARG_KEYS:
            if key in args and args[key]:
                val = args[key]
                if isinstance(val, list):
                    val = val[0] if val else ""
                    if isinstance(val, dict):
                        val = val.get("goal") or val.get("task") or ""
                if key in ("command", "cmd", "CommandLine") and isinstance(val, str):
                    val = " ".join(val.split()[:4])
                if key == "content" or key == "CodeContent":
                    detail = "isi konten"
                    break
                detail = clean_text(val)
                break
        if not detail and "code" in args:
            detail = "jalanin kode"
    elif isinstance(args, str) and args:
        detail = clean_text(args)

    if detail:
        return f"{label}: {detail}"
    return f"{label}"


def looks_error(content) -> bool:
    text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False, default=str)
    head = text[:400].lower()
    parsed = parse_json(text)
    if isinstance(parsed, dict):
        if parsed.get("success") is False or parsed.get("error") or parsed.get("status") in ("error", "failed"):
            return True
        if parsed.get("exit_code") not in (None, 0):
            return True
    return head.startswith("error") or "traceback (most recent call last)" in head


def normalize_tool_calls(raw) -> list[dict]:
    raw = parse_json(raw)
    if not raw:
        return []
    if isinstance(raw, dict):
        raw = [raw]
    calls = []
    for c in raw if isinstance(raw, list) else []:
        if not isinstance(c, dict):
            continue
        fn = c.get("function") if isinstance(c.get("function"), dict) else {}
        name = fn.get("name") or c.get("name") or c.get("tool") or "tool"
        args = fn.get("arguments", c.get("arguments", c.get("input", c.get("args"))))
        calls.append({"id": c.get("id") or c.get("tool_call_id") or f"{name}-{time.time()}", "name": name, "args": args})
    return calls


class Tracker:
    """Turns a stream of chat messages (from any source) into office events."""

    def __init__(self, hub: Hub):
        self.hub = hub
        self.session_agent: dict[str, str] = {}
        self.pending: dict[str, tuple] = {}        # tool_call_id -> (agentId, tool, children)
        self.waiting_children: deque = deque()     # sub-agents waiting for their session to show up
        self.counter = 0

    def agent_for(self, sid: str, parent: str | None) -> str:
        if sid in self.session_agent:
            return self.session_agent[sid]
        if (parent or self.waiting_children) and self.waiting_children:
            aid = self.waiting_children.popleft()
        else:
            aid = "lami"
        self.session_agent[sid] = aid
        return aid

    def on_message(self, sid: str, msg: dict, parent: str | None = None):
        role = (msg.get("role") or msg.get("type") or "").lower()
        aid = self.agent_for(str(sid), parent)
        pub = self.hub.publish

        if role == "user" and aid == "lami":
            pub({"type": "agent_status", "agentId": "lami", "status": "thinking"})
            return

        if role == "assistant":
            calls = normalize_tool_calls(msg.get("tool_calls"))
            if msg.get("tool_name") and not calls:
                calls = [{"id": msg.get("tool_call_id") or str(time.time()), "name": msg["tool_name"], "args": msg.get("arguments")}]
            for call in calls:
                name = str(call["name"])
                if name == "delegate_task":
                    children = self._spawn_children(call["args"])
                    self.pending[call["id"]] = (aid, name, children)
                    pub({"type": "agent_status", "agentId": aid, "status": "delegating"})
                    pub({"type": "tool_start", "agentId": aid, "tool": name, "summary": f"delegasi {len(children)} tugas"})
                else:
                    self.pending[call["id"]] = (aid, name, [])
                    pub({"type": "tool_start", "agentId": aid, "tool": name, "summary": summarize_args(name, call["args"])})
            text = msg.get("content")
            if not calls and isinstance(text, str) and text.strip():
                if CFG.get("show_messages"):
                    pub({"type": "message", "agentId": aid, "text": text})
                if aid == "lami":
                    pub({"type": "agent_status", "agentId": "lami", "status": "happy"})
            return

        if role == "tool":
            call_id = msg.get("tool_call_id") or msg.get("id")
            aid2, name, children = self.pending.pop(call_id, (aid, msg.get("tool_name") or msg.get("name") or "tool", []))
            ok = not looks_error(msg.get("content", ""))
            pub({"type": "tool_end", "agentId": aid2, "tool": name, "ok": ok})
            for child in children:
                if child in self.waiting_children:
                    self.waiting_children.remove(child)
                pub({"type": "agent_done", "agentId": child, "ok": ok, "result": "selesai" if ok else "gagal"})

    def _spawn_children(self, args) -> list[str]:
        args = parse_json(args)
        tasks = []
        if isinstance(args, dict):
            if isinstance(args.get("tasks"), list):
                for t in args["tasks"]:
                    tasks.append(t.get("goal") or t.get("task") or "tugas") if isinstance(t, dict) else tasks.append(str(t))
            elif args.get("goal") or args.get("task"):
                tasks.append(args.get("goal") or args.get("task"))
        if not tasks:
            tasks = ["tugas dari boss"]
        ids = []
        for task in tasks[:8]:
            self.counter += 1
            aid = f"sa{self.counter}"
            ids.append(aid)
            self.waiting_children.append(aid)
            self.hub.publish({"type": "agent_spawn", "agentId": aid, "parentId": "lami", "task": task})
        return ids


class SqliteSource:
    def __init__(self, path: str, tracker: Tracker):
        self.path, self.tracker = path, tracker
        self.last_rowid = None
        self.cols: list[str] = []
        self.parent_col = None
        self.parents: dict[str, str | None] = {}

    def _conn(self):
        return sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, timeout=2)

    def setup(self) -> bool:
        if not os.path.exists(self.path):
            return False
        with self._conn() as con:
            tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "messages" not in tables:
                print(f"[sqlite] tabel 'messages' tidak ada di {self.path} (ada: {sorted(tables)})")
                return False
            self.cols = [r[1] for r in con.execute("PRAGMA table_info(messages)")]
            if "sessions" in tables:
                scols = [r[1] for r in con.execute("PRAGMA table_info(sessions)")]
                self.parent_col = next((c for c in scols if "parent" in c.lower()), None)
            self.last_rowid = con.execute("SELECT COALESCE(MAX(rowid),0) FROM messages").fetchone()[0]
        print(f"[sqlite] watching {self.path} (kolom: {', '.join(self.cols)}) mulai rowid {self.last_rowid}")
        return True

    def _parent(self, con, sid):
        if not self.parent_col:
            return None
        if sid not in self.parents:
            try:
                row = con.execute(f"SELECT {self.parent_col} FROM sessions WHERE id=?", (sid,)).fetchone()
                self.parents[sid] = row[0] if row else None
            except sqlite3.Error:
                self.parents[sid] = None
        return self.parents[sid]

    def poll(self):
        with self._conn() as con:
            con.row_factory = sqlite3.Row
            rows = con.execute("SELECT rowid AS _rid, * FROM messages WHERE rowid > ? ORDER BY rowid LIMIT 500",
                               (self.last_rowid,)).fetchall()
            for row in rows:
                self.last_rowid = row["_rid"]
                msg = {k: row[k] for k in row.keys()}
                sid = msg.get("session_id") or msg.get("session") or "main"
                self.tracker.on_message(str(sid), msg, self._parent(con, sid))


class SessionFilesSource:
    def __init__(self, pattern: str, tracker: Tracker):
        self.pattern, self.tracker = pattern, tracker
        self.state: dict[str, dict] = {}

    def setup(self) -> bool:
        files = self._files()
        for f in files:
            self.state[f] = self._initial_state(f)
        print(f"[sessions] watching {self.pattern} ({len(files)} file)")
        return bool(files) or os.path.isdir(os.path.dirname(self.pattern.split("*")[0]) or ".")

    def _files(self):
        return [f for f in glob.glob(self.pattern, recursive=True) if os.path.isfile(f)]

    def _initial_state(self, f):
        st = {"mtime": os.path.getmtime(f), "offset": 0, "count": 0}
        if f.endswith(".jsonl"):
            st["offset"] = os.path.getsize(f)
        else:
            st["count"] = len(self._load_json(f)[0])
        return st

    @staticmethod
    def _load_json(f):
        try:
            data = json.loads(Path(f).read_text(encoding="utf-8", errors="ignore"))
        except Exception:  # noqa: BLE001
            return [], None, None
        if isinstance(data, list):
            return data, None, None
        msgs = data.get("messages") or data.get("conversation") or data.get("history") or []
        return msgs, data.get("session_id") or data.get("id"), data.get("parent_session_id") or data.get("parent_id")

    def poll(self):
        for f in self._files():
            mtime = os.path.getmtime(f)
            st = self.state.get(f)
            if st is None:  # brand-new session file -> process from the start
                st = self.state[f] = {"mtime": 0, "offset": 0, "count": 0}
            if mtime == st["mtime"]:
                continue
            st["mtime"] = mtime
            sid = Path(f).stem
            if f.endswith(".jsonl"):
                with open(f, "r", encoding="utf-8", errors="ignore") as fh:
                    fh.seek(st["offset"])
                    chunk = fh.read()
                    st["offset"] = fh.tell()
                for line in chunk.splitlines():
                    try:
                        obj = json.loads(line)
                    except Exception:  # noqa: BLE001
                        continue
                    if isinstance(obj, dict):
                        msg = obj.get("message") if isinstance(obj.get("message"), dict) else obj
                        self.tracker.on_message(obj.get("session_id") or sid, msg, obj.get("parent_session_id"))
            else:
                msgs, file_sid, parent = self._load_json(f)
                for msg in msgs[st["count"]:]:
                    if isinstance(msg, dict):
                        self.tracker.on_message(file_sid or sid, msg, parent)
                st["count"] = len(msgs)


class AntigravitySource:
    """Watches Antigravity / Gemini assistant transcripts in real time."""

    def __init__(self, pattern: str, hub: Hub):
        self.pattern = pattern
        self.hub = hub
        self.file_state: dict[str, int] = {}
        self.active_tool: str | None = None
        self.active_subagents: dict[str, str] = {}
        self.subagent_counter = 0

    def setup(self) -> bool:
        files = self._files()
        initial_done = 0
        for f in files:
            try:
                self.file_state[f] = os.path.getsize(f)
                with open(f, "r", encoding="utf-8", errors="ignore") as fh:
                    for line in fh:
                        if '"type":"GENERIC"' in line or '"type": "GENERIC"' in line:
                            initial_done += 1
            except OSError:
                self.file_state[f] = 0

        if initial_done > 0:
            with self.hub.lock:
                self.hub.stats["doneToday"] = initial_done
                self.hub.stats["coins"] = initial_done

        print(f"[antigravity] watching {self.pattern} ({len(files)} file, {initial_done} task hari ini)")
        return bool(files) or os.path.isdir(os.path.expanduser("~/.gemini/antigravity/brain"))

    def _files(self) -> list[str]:
        return [f for f in glob.glob(self.pattern, recursive=True) if os.path.isfile(f)]

    def poll(self):
        for f in self._files():
            try:
                curr_size = os.path.getsize(f)
            except OSError:
                continue

            offset = self.file_state.get(f)
            if offset is None:
                offset = 0
            if curr_size <= offset:
                continue

            with open(f, "r", encoding="utf-8", errors="ignore") as fh:
                fh.seek(offset)
                chunk = fh.read()
                self.file_state[f] = fh.tell()

            parts = Path(f).parts
            conv_id = parts[-4] if len(parts) >= 4 else "main"

            for line in chunk.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    step = json.loads(line)
                except Exception:
                    continue
                self._handle_step(conv_id, step)

    def _handle_step(self, conv_id: str, step: dict):
        source = step.get("source")
        stype = step.get("type")
        status = step.get("status", "DONE")
        pub = self.hub.publish

        aid = self.active_subagents.get(conv_id, "lami")

        # 1. User request -> Boss Lami berpikir
        if source == "USER_EXPLICIT" or stype == "USER_INPUT":
            pub({"type": "agent_status", "agentId": "lami", "status": "thinking"})
            return

        # 2. Assistant merencanakan / menjalankan tool
        if source == "MODEL" and stype == "PLANNER_RESPONSE":
            tool_calls = step.get("tool_calls") or []
            if tool_calls:
                for call in tool_calls:
                    name = str(call.get("name") or "tool")
                    args = call.get("args") or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except Exception:
                            args = {}

                    if name == "invoke_subagent":
                        sub_list = args.get("Subagents") or []
                        if not isinstance(sub_list, list):
                            sub_list = [sub_list]
                        pub({"type": "agent_status", "agentId": "lami", "status": "delegating"})
                        for sub in sub_list:
                            self.subagent_counter += 1
                            sub_aid = f"sa{self.subagent_counter}"
                            role = (sub.get("Role") if isinstance(sub, dict) else "") or "SubAgent"
                            prompt = (sub.get("Prompt") if isinstance(sub, dict) else str(sub)) or "Tugas baru"
                            self.active_subagents[sub_aid] = sub_aid
                            pub({"type": "agent_spawn", "agentId": sub_aid, "parentId": "lami", "task": prompt, "name": role})
                            pub({"type": "tool_start", "agentId": sub_aid, "tool": "coding", "summary": f"{role}: mulai"})
                    else:
                        self.active_tool = name
                        summary = ""
                        if isinstance(args, dict):
                            summary = args.get("toolSummary") or args.get("toolAction")
                        if summary and isinstance(summary, str):
                            summary = summary.strip(' \t\n\r"\'')
                        if not summary:
                            summary = summarize_args(name, args)
                        pub({"type": "tool_start", "agentId": aid, "tool": name, "summary": str(summary)})
            else:
                content = step.get("content")
                if isinstance(content, str) and content.strip():
                    pub({"type": "agent_status", "agentId": aid, "status": "happy"})
                    if CFG.get("show_messages"):
                        pub({"type": "message", "agentId": aid, "text": clean_text(content, 40)})

        # 3. Tool selesai (GENERIC output)
        if source == "MODEL" and stype == "GENERIC":
            content = step.get("content", "")
            ok = (status != "ERROR" and not looks_error(content))
            tool_name = self.active_tool or "tool"
            pub({"type": "tool_end", "agentId": aid, "tool": tool_name, "ok": ok})
            self.active_tool = None
            if aid != "lami":
                pub({"type": "agent_done", "agentId": aid, "ok": ok, "result": "selesai" if ok else "gagal"})


def watcher_loop():
    tracker = Tracker(HUB)
    sources = []

    # 1. Antigravity / Gemini Source (prioritas untuk live AI environment)
    ag_glob = CFG.get("antigravity_glob")
    if ag_glob:
        ag = AntigravitySource(ag_glob, HUB)
        try:
            if ag.setup():
                sources.append(ag)
        except Exception as exc:  # noqa: BLE001
            print(f"[antigravity] error: {exc}", file=sys.stderr)

    # 2. Hermes SQLite
    mode = CFG["source"]
    if mode in ("auto", "sqlite"):
        s = SqliteSource(CFG["sqlite_path"], tracker)
        try:
            if s.setup():
                sources.append(s)
        except sqlite3.Error as exc:
            print(f"[sqlite] error: {exc}")

    # 3. Hermes Sessions
    if mode == "sessions" or (mode == "auto" and not sources):
        s = SessionFilesSource(CFG["sessions_glob"], tracker)
        if s.setup():
            sources.append(s)

    if not sources:
        print("[watcher] tidak ada sumber aktif yang ketemu. Office tetap jalan (ingest API / demo mode).")
    else:
        print(f"[watcher] aktif dengan {len(sources)} sumber data real-time.")

    while True:
        for s in sources:
            try:
                s.poll()
            except Exception as exc:  # noqa: BLE001
                print(f"[watcher] {type(s).__name__}: {exc}", file=sys.stderr)
        HUB.reap(float(CFG["subagent_timeout"]))
        time.sleep(float(CFG["poll_interval"]))


# --------------------------------------------------------------------------------------
# HTTP server
# --------------------------------------------------------------------------------------
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
        ".webp": "image/webp", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".wav": "audio/wav"}


class Handler(BaseHTTPRequestHandler):
    server_version = "LamiOffice/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter logs
        first = str(args[0]) if args else ""
        if "/events" not in first:
            sys.stderr.write("[http] " + fmt % args + "\n")

    def do_HEAD(self):
        self.do_GET()

    # A request is "public" if it came through Cloudflare (tunnel adds these headers).
    def is_public(self) -> bool:
        return bool(self.headers.get("CF-Connecting-IP") or self.headers.get("CF-Ray"))

    def is_local(self) -> bool:
        return not self.is_public() and self.client_address[0] in ("127.0.0.1", "::1", "localhost")

    def mode_for_client(self) -> str:
        return "demo" if (self.is_public() and CFG["public_mode"] == "demo") else "live"

    def send_json(self, code: int, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/events":
            return self.handle_events()
        if path == "/api/config":
            return self.send_json(200, {"mode": self.mode_for_client(), "toolRooms": CFG.get("tool_rooms") or {}})
        if path in ("/healthz", "/api/health"):
            return self.send_json(200, {"ok": True, "status": "ok", "clients": len(HUB.subs), "time": time.time()})
        if path == "/api/boss":
            return self.send_json(200, {
                "id": "lami", "name": "Lami", "title": "Hermes Agent",
                "description": "AI orchestrator", "status": "online",
                "color": "#C084FC", "type": "boss",
                "sub_agents": len(HUB.agents), "tools": ["browser", "terminal", "code", "web", "memory", "vision"]
            })
        if path == "/api/agents":
            snap = HUB.snapshot()
            return self.send_json(200, {
                "agents": snap.get("agents", []),
                "stats": snap.get("stats", {}),
                "online": len(snap.get("agents", [])),
                "total": len(snap.get("agents", [])),
                "boss": {"id": "lami", "name": "Lami", "status": "online"}
            })
        return self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/event":
            return self.send_json(404, {"error": "not found"})
        has_valid_token = bool(CFG["ingest_token"] and self.headers.get("X-Office-Token") == CFG["ingest_token"])
        if not self.is_local() and not has_valid_token:
            return self.send_json(403, {"error": "ingest hanya dari localhost atau gunakan header X-Office-Token yang valid"})
        if CFG["ingest_token"] and not has_valid_token:
            return self.send_json(401, {"error": "token salah"})
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 256_000)
            data = json.loads(self.rfile.read(length) or b"{}")
        except Exception:  # noqa: BLE001
            return self.send_json(400, {"error": "json tidak valid"})
        events = data if isinstance(data, list) else [data]
        for ev in events:
            HUB.publish(ev)
        return self.send_json(200, {"ok": True, "count": len(events)})

    def handle_events(self):
        if self.mode_for_client() == "demo":
            return self.send_json(403, {"error": "public demo mode"})
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q = HUB.subscribe()
        try:
            self.wfile.write(b"retry: 3000\n\n")
            self.wfile.write(f"data: {json.dumps(HUB.snapshot())}\n\n".encode())
            self.wfile.flush()
            while True:
                try:
                    ev = q.get(timeout=20)
                    self.wfile.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")  # heartbeat keeps Cloudflare from closing the stream
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            HUB.unsubscribe(q)

    def serve_static(self, path: str):
        rel = path.lstrip("/") or "index.html"
        target = (WEB_DIR / rel).resolve()
        if WEB_DIR.resolve() not in target.parents and target != WEB_DIR.resolve():
            return self.send_json(403, {"error": "forbidden"})
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            return self.send_json(404, {"error": "not found"})
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(target.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)


# --------------------------------------------------------------------------------------
# Probe - helps you (or Lami) see which Hermes data exists on this machine
# --------------------------------------------------------------------------------------
def probe():
    ag_pattern = CFG.get("antigravity_glob", "")
    ag_files = glob.glob(ag_pattern, recursive=True)
    print(f"Antigravity : {ag_pattern}  ({len(ag_files)} file aktif)")
    for f in sorted(ag_files, key=os.path.getmtime)[-3:]:
        print("   -", f)

    home = CFG["hermes_home"]
    print(f"\nHERMES_HOME : {home}  ({'ada' if os.path.isdir(home) else 'TIDAK ADA'})")
    if os.path.isdir(home):
        for name in sorted(os.listdir(home))[:40]:
            print("   -", name)
    db = CFG["sqlite_path"]
    print(f"\nSQLite      : {db}  ({'ada' if os.path.exists(db) else 'tidak ada'})")
    if os.path.exists(db):
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            cols = [r[1] for r in con.execute(f"PRAGMA table_info({t})")]
            print(f"   [{t}] {', '.join(cols)}")
        con.close()
    files = glob.glob(CFG["sessions_glob"], recursive=True)
    print(f"\nSessions    : {CFG['sessions_glob']}  ({len(files)} file)")
    for f in sorted(files, key=os.path.getmtime)[-5:]:
        print("   -", f)


def main():
    ap = argparse.ArgumentParser(description="Lami's AI Office server")
    ap.add_argument("--probe", action="store_true", help="cek sumber data Hermes lalu keluar")
    args = ap.parse_args()
    if args.probe:
        return probe()
    if CFG["source"] != "none":
        threading.Thread(target=watcher_loop, daemon=True).start()
    srv = ThreadingHTTPServer((CFG["host"], CFG["port"]), Handler)
    srv.daemon_threads = True
    print(f"🏢 Lami's AI Office jalan di http://{CFG['host']}:{CFG['port']}  (public_mode={CFG['public_mode']})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye 👋")


if __name__ == "__main__":
    main()
