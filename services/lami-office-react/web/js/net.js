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

      // 2. Connect to Server-Sent Events stream (/events) immediately
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

    startEventSource() {
      if (this.evtSource) {
        this.evtSource.close();
      }

      try {
        this.evtSource = new EventSource('/events');

        this.evtSource.onopen = () => {
          this.retryDelay = 2000;
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

          // If offline and no agents exist, run demo so screen isn't empty
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
          if (Array.isArray(data.agents)) {
            data.agents.forEach((a) => {
              const sub = this.office.spawnSubAgent({
                agentId: a.id,
                name: a.name,
                task: a.task,
                tool: a.tool,
              });
              if (a.tool) {
                sub.startWork(a.tool, a.summary || a.tool);
              }
            });
          }
          break;

        case 'agent_spawn':
          this.office.spawnSubAgent(data);
          break;

        case 'tool_start':
          this.office.onToolStart(data);
          break;

        case 'tool_end':
          this.office.onToolEnd(data);
          break;

        case 'agent_status':
          this.office.onAgentStatus(data);
          break;

        case 'agent_done':
          this.office.onAgentDone(data);
          break;

        case 'message':
          if (data.agentId === 'lami') {
            this.office.lami.setBubble(data.text, 4.0);
          }
          break;
      }
    }
  }

  LO.NetworkBridge = NetworkBridge;
})();
