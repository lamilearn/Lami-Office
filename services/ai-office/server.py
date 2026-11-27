"""AI Office Backend - FastAPI + WebSocket + Docker SDK"""
import asyncio, os, time, re
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Office")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SKETCH_PATH = os.path.join(os.path.dirname(__file__), "sketch.html")

AGENT_DEFS = {
    "jellyfin":     {"name":"Media",        "icon":"🎬", "type":"service"},
    "searxng":      {"name":"Search",       "icon":"🔍", "type":"service"},
    "flaresolverr": {"name":"Scraper",      "icon":"🕷", "type":"service"},
    "termix":       {"name":"Terminal",     "icon":"💻", "type":"service"},
    "stirling-pdf": {"name":"PDF",          "icon":"📄", "type":"service"},
    "nango-server": {"name":"Integrations", "icon":"🔗", "type":"service"},
    "cloudflared":  {"name":"Network",      "icon":"🌐", "type":"service"},
    "tailscale":    {"name":"VPN",          "icon":"🔒", "type":"service"},
    "nango-db":     {"name":"DB",           "icon":"🗄", "type":"service"},
    "nango-redis":  {"name":"Cache",        "icon":"⚡", "type":"service"},
}

LAMI = {
    "id": "lami", "name": "Lami", "title": "Hermes Agent",
    "description": "AI orchestrator", "status": "online",
    "color": "#C084FC", "type": "boss",
    "sub_agents": 8, "tools": ["browser","terminal","code","web","memory","vision"],
}

def get_docker_status():
    try:
        import docker
        client = docker.DockerClient(base_url="unix://var/run/docker.sock")
        containers = client.containers.list()
        agents = []
        for c in containers:
            name = c.name
            if name in AGENT_DEFS:
                d = AGENT_DEFS[name]
                agents.append({
                    "id": name, "name": d["name"], "icon": d["icon"],
                    "type": d["type"], "status": "online" if c.status == "running" else "offline",
                })
        return agents
    except Exception as e:
        msg = str(e)[:80]
        return [{"id":"error","name":"Error: "+msg,"icon":"⚠","type":"error","status":"offline"}]

def get_system_stats():
    s = {"load": "?", "memory_pct": 0}
    try:
        with open("/proc/loadavg") as f:
            s["load"] = f.read().split()[0]
    except:
        pass
    try:
        with open("/proc/meminfo") as f:
            d = f.read()
            m = re.search(r"MemTotal:\s+(\d+)", d)
            a = re.search(r"MemAvailable:\s+(\d+)", d)
            if m and a:
                total = int(m.group(1))
                avail = int(a.group(1))
                used = total - avail
                s["memory_pct"] = round(used / total * 100) if total else 0
    except:
        pass
    return s

@app.get("/")
async def index():
    return FileResponse(SKETCH_PATH)

@app.get("/api/boss")
async def get_boss():
    return LAMI

@app.get("/api/agents")
async def get_agents():
    agents = get_docker_status()
    stats = get_system_stats()
    return {
        "agents": agents,
        "stats": stats,
        "online": sum(1 for a in agents if a["status"] == "online"),
        "total": len(agents),
        "boss": LAMI,
    }

@app.get("/api/health")
async def health():
    return {"status": "ok", "time": time.time()}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            agents = get_docker_status()
            stats = get_system_stats()
            await ws.send_json({
                "type": "update",
                "agents": agents,
                "stats": stats,
                "online": sum(1 for a in agents if a["status"] == "online"),
                "total": len(agents),
                "timestamp": time.time(),
            })
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=80)
