#!/usr/bin/env python3
"""
Tiny per-host metrics endpoint for the A2A mesh.

The office's Server Room shows CPU/RAM for every agent. Those numbers have to be
real, so each agent host runs this and the office polls it, exactly like it
already probes /health for presence.

Stdlib only (no psutil) because the agent hosts deliberately stay dependency
free: everything comes from /proc and os.statvfs.

Run:
  AGENT_ID=yuna METRICS_PORT=8010 python3 metrics_agent.py

GET /metrics ->
  {"agent": "yuna", "host": "...", "ts": ..., "uptime_s": ...,
   "cpu": {"cores": 2, "percent": 12.4, "load1": 0.3, "load5": 0.2, "load15": 0.1},
   "mem": {"total_mb": 3819, "used_mb": 1240, "available_mb": 2579, "percent": 32.5},
   "disk": {"mount": "/", "total_gb": 39.2, "used_gb": 12.1, "percent": 30.9}}
"""
from __future__ import annotations

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AGENT_ID = os.environ.get("AGENT_ID", "agent")
PORT = int(os.environ.get("METRICS_PORT", "8010"))
HOST = os.environ.get("METRICS_HOST", "0.0.0.0")
DISK_PATH = os.environ.get("METRICS_DISK", "/")

# CPU usage is a delta between two /proc/stat samples, so the previous reading is
# kept between requests: each poll reports the average over the poll interval.
_prev_cpu: tuple[float, float] | None = None


def _cpu_times() -> tuple[float, float]:
    """(busy_jiffies, total_jiffies) from /proc/stat."""
    with open("/proc/stat", "r", encoding="utf-8") as fh:
        parts = fh.readline().split()
    values = [float(v) for v in parts[1:]]
    idle = values[3] + (values[4] if len(values) > 4 else 0.0)  # idle + iowait
    total = sum(values)
    return total - idle, total


def cpu_snapshot(wait: float = 0.0) -> dict:
    global _prev_cpu
    now = _cpu_times()
    if _prev_cpu is None and wait > 0:
        time.sleep(wait)
        _prev_cpu = now
        now = _cpu_times()
    if _prev_cpu is None:
        _prev_cpu = now
        percent = 0.0
    else:
        busy_d = now[0] - _prev_cpu[0]
        total_d = now[1] - _prev_cpu[1]
        percent = max(0.0, min(100.0, (busy_d / total_d) * 100.0)) if total_d > 0 else 0.0
    _prev_cpu = now
    try:
        load1, load5, load15 = os.getloadavg()
    except (OSError, AttributeError):
        load1 = load5 = load15 = 0.0
    return {
        "cores": os.cpu_count() or 1,
        "percent": round(percent, 1),
        "load1": round(load1, 2),
        "load5": round(load5, 2),
        "load15": round(load15, 2),
    }


def mem_snapshot() -> dict:
    info: dict[str, float] = {}
    with open("/proc/meminfo", "r", encoding="utf-8") as fh:
        for line in fh:
            key, _, rest = line.partition(":")
            info[key.strip()] = float(rest.strip().split()[0])  # kB
    total = info.get("MemTotal", 0.0)
    available = info.get("MemAvailable", info.get("MemFree", 0.0))
    used = max(0.0, total - available)
    return {
        "total_mb": int(total / 1024),
        "used_mb": int(used / 1024),
        "available_mb": int(available / 1024),
        "percent": round((used / total) * 100.0, 1) if total else 0.0,
    }


def disk_snapshot() -> dict:
    st = os.statvfs(DISK_PATH)
    total = st.f_blocks * st.f_frsize
    free = st.f_bavail * st.f_frsize
    used = max(0, total - free)
    gb = 1024 ** 3
    return {
        "mount": DISK_PATH,
        "total_gb": round(total / gb, 1),
        "used_gb": round(used / gb, 1),
        "percent": round((used / total) * 100.0, 1) if total else 0.0,
    }


def uptime_s() -> float:
    with open("/proc/uptime", "r", encoding="utf-8") as fh:
        return float(fh.read().split()[0])


def metrics() -> dict:
    return {
        "agent": AGENT_ID,
        "host": os.uname().nodename,
        "ts": time.time(),
        "uptime_s": round(uptime_s(), 1),
        "cpu": cpu_snapshot(),
        "mem": mem_snapshot(),
        "disk": disk_snapshot(),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LamiMetrics/1.0"

    def _send(self, code: int, payload: bytes, ctype: str = "application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):  # noqa: N802 - http.server API
        if self.path.split("?")[0] == "/metrics":
            body = json.dumps(metrics()).encode()
            return self._send(200, body)
        if self.path.split("?")[0] in ("/health", "/healthz"):
            return self._send(200, b'{"status":"online"}')
        return self._send(404, b'{"error":"not found"}')

    def log_message(self, *_args):  # keep the journal quiet
        pass


def main() -> int:
    # Prime the CPU baseline so the first poll is not a lonely 0%.
    cpu_snapshot(wait=0.0)
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[metrics] {AGENT_ID} listening on {HOST}:{PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
