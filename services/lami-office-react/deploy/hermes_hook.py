#!/usr/bin/env python3
"""
hermes_hook.py — Helper hook & CLI client to push events from Hermes Agent to Lami's AI Office.

Usage in Python code:
    from hermes_hook import OfficeHook
    hook = OfficeHook("http://localhost:8090")
    hook.tool_start("lami", "code", "Refactoring database")
    hook.tool_end("lami", "code", ok=True)
    hook.spawn_agent("sa1", name="Budi", task="Riset API")
    hook.agent_done("sa1", ok=True)

Usage from CLI / bash scripts:
    python3 deploy/hermes_hook.py tool_start --tool terminal --summary "Menjalankan migrasi database"
    python3 deploy/hermes_hook.py tool_end --tool terminal --ok
    python3 deploy/hermes_hook.py status --status thinking
    python3 deploy/hermes_hook.py spawn --agent-id sa1 --name "Budi" --task "Riset API endpoint"
    python3 deploy/hermes_hook.py done --agent-id sa1 --ok
"""

import sys
import json
import argparse
import urllib.request
import urllib.error


class OfficeHook:
    def __init__(self, endpoint: str = "http://127.0.0.1:8090", token: str = ""):
        self.url = f"{endpoint.rstrip('/')}/api/event"
        self.token = token

    def send(self, event_data: dict) -> bool:
        payload = json.dumps(event_data).encode("utf-8")
        req = urllib.request.Request(self.url, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("X-Office-Token", self.token)
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                return resp.status == 200
        except Exception as e:
            # Silent fallback if office server is not running
            sys.stderr.write(f"[hermes_hook] notice: {e}\n")
            return False

    def tool_start(self, agent_id: str, tool: str, summary: str = ""):
        return self.send({
            "type": "tool_start",
            "agentId": agent_id,
            "tool": tool,
            "summary": summary or tool
        })

    def tool_end(self, agent_id: str, tool: str, ok: bool = True):
        return self.send({
            "type": "tool_end",
            "agentId": agent_id,
            "tool": tool,
            "ok": ok
        })

    def status(self, agent_id: str, status: str):
        return self.send({
            "type": "agent_status",
            "agentId": agent_id,
            "status": status  # thinking, happy, error, delegating
        })

    def spawn_agent(self, agent_id: str, name: str = "", task: str = "", parent_id: str = "lami"):
        return self.send({
            "type": "agent_spawn",
            "agentId": agent_id,
            "parentId": parent_id,
            "name": name,
            "task": task
        })

    def agent_done(self, agent_id: str, ok: bool = True, result: str = ""):
        return self.send({
            "type": "agent_done",
            "agentId": agent_id,
            "ok": ok,
            "result": result or ("selesai" if ok else "gagal")
        })


def main():
    parser = argparse.ArgumentParser(description="Push Hermes events to Lami AI Office")
    parser.add_argument("--url", default="http://127.0.0.1:8090", help="Office server URL")
    parser.add_argument("--token", default="", help="Optional X-Office-Token")

    sub = parser.add_subparsers(dest="command")

    # tool_start
    p_ts = sub.add_parser("tool_start")
    p_ts.add_argument("--agent-id", default="lami")
    p_ts.add_argument("--tool", required=True)
    p_ts.add_argument("--summary", default="")

    # tool_end
    p_te = sub.add_parser("tool_end")
    p_te.add_argument("--agent-id", default="lami")
    p_te.add_argument("--tool", required=True)
    p_te.add_argument("--ok", action="store_true", default=True)
    p_te.add_argument("--failed", dest="ok", action="store_false")

    # status
    p_st = sub.add_parser("status")
    p_st.add_argument("--agent-id", default="lami")
    p_st.add_argument("--status", choices=["thinking", "happy", "error", "delegating"], default="thinking")

    # spawn
    p_sp = sub.add_parser("spawn")
    p_sp.add_argument("--agent-id", required=True)
    p_sp.add_argument("--name", default="")
    p_sp.add_argument("--task", default="")
    p_sp.add_argument("--parent-id", default="lami")

    # done
    p_dn = sub.add_parser("done")
    p_dn.add_argument("--agent-id", required=True)
    p_dn.add_argument("--ok", action="store_true", default=True)
    p_dn.add_argument("--failed", dest="ok", action="store_false")
    p_dn.add_argument("--result", default="")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    hook = OfficeHook(args.url, args.token)

    if args.command == "tool_start":
        hook.tool_start(args.agent_id, args.tool, args.summary)
    elif args.command == "tool_end":
        hook.tool_end(args.agent_id, args.tool, args.ok)
    elif args.command == "status":
        hook.status(args.agent_id, args.status)
    elif args.command == "spawn":
        hook.spawn_agent(args.agent_id, args.name, args.task, args.parent_id)
    elif args.command == "done":
        hook.agent_done(args.agent_id, args.ok, args.result)


if __name__ == "__main__":
    main()

