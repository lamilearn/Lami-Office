/* Lami's AI Office — SSE Live Network Bridge & Event Dispatcher */
(function () {
  const LO = window.LO;

  class NetworkBridge {
    constructor(office, demoCtrl) {
      this.office = office;
      this.demoCtrl = demoCtrl;
      this.evtSource = null;
      this.retryDelay = 2000;
      this.maxRetryDelay = 15000;
    }

    async connect() {
      // 1. Check if user explicitly asked for demo mode
      if (LO.params.get('demo') === '1') {
        this.demoCtrl.start();
        return;
      }

      // 2. Connect to Server-Sent Events stream (/events) immediately. The server
      //    simulates the office for everyone, so positions come from the stream.
      this.office.simulatedExternally = true;
      this.startEventSource();

      // 3. Fetch runtime config from server in parallel
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.toolRooms) {
            LO.toolRoomOverrides = cfg.toolRooms;
          }
          if (cfg.mode === 'demo') {
            this.demoCtrl.start();
          }
        }
      } catch (e) {
        console.warn('[net] config fetch error:', e);
      }

      // 4. A2A peer agents (Hermes sidecars on the LAN): presence + roster
      this.syncA2A();
      this.a2aTimer = setInterval(() => this.syncA2A(), 15000);
      // 5. Per-agent VM resources for the Server Room wall monitor
      this.syncResources();
      this.resourceTimer = setInterval(() => this.syncResources(), 15000);
    }

    async syncA2A() {
      try {
        const res = await fetch('/api/a2a');
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.peers) && this.office &&
            typeof this.office.applyA2APeers === 'function') {
          this.office.applyA2APeers(data.peers);
          if (LO.ui && typeof LO.ui.renderA2APeers === 'function') {
            LO.ui.renderA2APeers(data.peers, Boolean(data.can_send));
          }
        }
      } catch (e) {
        /* peer presence is best-effort; the office keeps running */
      }
    }

    // Real CPU/RAM per agent host, shown on the Server Room monitor.
    async syncResources() {
      try {
        const res = await fetch('/api/resources');
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.agents) && this.office) {
          this.office.vmResources = data;
          this.office.vmResourcesAt = Date.now();
        }
      } catch (e) {
        /* gauges are best-effort; the Server Room keeps rendering */
      }
    }

    // Fetch the authoritative world once (page load / reconnect).
    async loadWorld() {
      try {
        const res = await fetch('/api/world');
        if (!res.ok) return;
        const frame = await res.json();
        if (frame && Array.isArray(frame.chars) && typeof this.office.applyWorld === 'function') {
          this.office.applyWorld(frame);
        }
      } catch (e) {
        /* the stream will supply frames shortly */
      }
    }

    startEventSource() {
      if (this.evtSource) {
        this.evtSource.close();
      }

      try {
        this.evtSource = new EventSource('/events');

        this.evtSource.onopen = () => {
          this.retryDelay = 2000;
          this.office.simulatedExternally = true;
          this.loadWorld();
          LO.ui.setStatus('live');
          LO.ui.addTicker('🟢', 'Tersambung ke aktivitas <b>Hermes Live</b>.');
        };

        this.evtSource.onmessage = (e) => {
          if (!e.data || e.data.startsWith(':')) return; // ignore heartbeat ping
          try {
            const data = JSON.parse(e.data);
            this.handleEvent(data);
          } catch (err) {
            console.error('[net] parse error:', err);
          }
        };

        this.evtSource.onerror = (err) => {
          console.warn('[net] stream disconnected, retrying...', err);
          LO.ui.setStatus('offline');
          this.evtSource.close();
          this.evtSource = null;

          // The server is the world owner; without it this page has to simulate
          // locally again, otherwise everyone would freeze in place.
          this.office.simulatedExternally = false;
          if (this.office.subagents.size === 0 && !this.demoCtrl.active) {
            this.demoCtrl.start();
          }

          setTimeout(() => {
            this.retryDelay = Math.min(this.retryDelay * 1.5, this.maxRetryDelay);
            this.startEventSource();
          }, this.retryDelay);
        };
      } catch (e) {
        console.warn('[net] SSE failed, fallback to demo:', e);
        this.demoCtrl.start();
      }
    }

    handleEvent(data) {
      if (!data || !data.type) return;

      // Stop demo if real events start arriving
      if (this.demoCtrl.active && data.type !== 'snapshot') {
        this.demoCtrl.stop();
        LO.ui.setStatus('live');
      }

      switch (data.type) {
        case 'snapshot':
          if (data.stats) {
            LO.ui.setStats(data.stats.doneToday || 0, data.stats.coins || 0);
          }
          // The roster is NOT rebuilt here. In live mode the server owns who is on
          // the floor and sends it inside `world` frames; building agents from the
          // event feed as well would create bodies the server never simulated.
          if (Array.isArray(data.agents) && !this.office.simulatedExternally) {
            const live = new Set();
            data.agents.forEach((a) => {
              live.add(a.id);
              const sub = this.office.spawnSubAgent({
                agentId: a.id,
                name: a.name,
                task: a.task,
                tool: a.tool,
                summary: a.summary,
                since: a.since
              }, { restore: true });
              if (a.tool) sub.startWork(a.tool, a.summary || a.tool);
              sub.reported = false;
            });
            LO.ui.updateStaffCount(this.office.residents.length + this.office.subagents.size);
          }
          // Show recent activity from the server so a fresh page is not empty.
          if (Array.isArray(data.history) && LO.ui) {
            if (LO.ui.restoreActivity) LO.ui.restoreActivity(data.history);
            const msgs = data.history.filter((ev) => ev && ev.type === 'message').slice(-15);
            if (msgs.length && LO.ui.appendChatMessage) {
              for (const ev of msgs) {
                const who = ev.who || (ev.agentId === 'lami' ? 'Boss Lami' : (ev.agentId || 'Agent'));
                LO.ui.appendChatMessage(who, ev.role || 'Agent', ev.text || '', ev.icon || '💬',
                  ev.color || '#8b5cf6', false, false, (ev.ts || 0) * 1000);
              }
            }
          }
          // Ask for a world snapshot so the first paint already matches the
          // server, then let the `world` frames keep it current.
          this.loadWorld();
          break;

        // While the server simulates, these events are already expressed inside
        // the `world` frames (roster + character state). Animating them locally
        // as well is what produced agents the server never knew about.
        case 'agent_spawn':
          if (!this.office.simulatedExternally) this.office.spawnSubAgent(data);
          break;

        case 'tool_start':
          if (!this.office.simulatedExternally) this.office.onToolStart(data);
          break;

        case 'tool_end':
          if (!this.office.simulatedExternally) this.office.onToolEnd(data);
          break;

        case 'agent_status':
          if (!this.office.simulatedExternally) this.office.onAgentStatus(data);
          break;

        case 'agent_done':
          if (!this.office.simulatedExternally) this.office.onAgentDone(data);
          break;

        case 'message':
          // The server authors every character message, so print it verbatim
          // instead of also reacting to it (that would double the bubbles).
          if (LO.ui && LO.ui.appendChatMessage && data.text) {
            LO.ui.appendChatMessage(
              data.who || (data.agentId === 'lami' ? 'Boss Lami' : data.agentId || 'Agent'),
              data.role || 'Agent', data.text, data.icon || '💬', data.color || '#8b5cf6',
              false, false, (data.ts || 0) * 1000
            );
          }
          break;

        case 'ticker':
          if (LO.ui && LO.ui.addTicker) LO.ui.addTicker(data.icon || '•', data.text || '');
          break;

        case 'event_banner':
          if (LO.ui && LO.ui.triggerEventBanner) {
            LO.ui.triggerEventBanner(data.icon || '✨', data.title || '', data.desc || '');
          }
          break;

        case 'world':
          if (typeof this.office.applyWorld === 'function') this.office.applyWorld(data);
          break;
      }
    }
  }

  LO.NetworkBridge = NetworkBridge;
})();
