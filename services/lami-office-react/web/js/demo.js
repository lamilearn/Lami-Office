/* Lami's AI Office — Demo Mode (Realistic event generator for TikTok recordings) */
(function () {
  const LO = window.LO;

  class DemoController {
    constructor(office) {
      this.office = office;
      this.active = false;
      this.timer = null;
      this.demoTasks = [
        { task: 'Riset tren AI di TikTok', tool: 'web_search', summary: "cari 'viral ai office'" },
        { task: 'Koding bridge WebSocket', tool: 'write_file', summary: 'edit server.py: ws handler' },
        { task: 'Compile sprite pixel art', tool: 'terminal', summary: 'python build_sprites.py' },
        { task: 'Planning sprint fitur baru', tool: 'delegate_task', summary: 'susun roadmap lantai 5' },
        { task: 'Cek load balancing server', tool: 'inference', summary: 'evaluasi model LLM 70B' },
        { task: 'Browsing referensi UI kairosoft', tool: 'browser', summary: 'buka galeri happy mall' },
        { task: 'Debug query SQLite history', tool: 'shell', summary: 'select * from sessions limit 5' },
        { task: 'Bikin prompt Hermes Lami', tool: 'edit_file', summary: 'tulis PROMPT_HERMES.md' },
      ];
      this.counter = 1;
    }

    start() {
      if (this.active) return;
      this.active = true;
      LO.ui.setStatus('demo');
      LO.ui.addTicker('🎬', '<b>Demo Mode aktif</b>: Mensimulasikan aktivitas sub-agent.');

      // Initial batch of 2 employees
      this.spawnRandom();
      setTimeout(() => this.spawnRandom(), 2000);

      // Tease a random office event in demo
      setTimeout(() => {
        if (this.active && this.office) {
          this.office.triggerRandomEvent('coffee');
        }
      }, 7000);

      // Loop
      this.scheduleNext();
    }

    stop() {
      this.active = false;
      if (this.timer) clearTimeout(this.timer);
    }

    scheduleNext() {
      if (!this.active) return;
      const delay = Math.random() * 4000 + 3500;
      this.timer = setTimeout(() => {
        this.step();
        this.scheduleNext();
      }, delay);
    }

    step() {
      const activeCount = this.office.subagents.size;
      const roll = Math.random();

      // If less than 2, spawn new one
      if (activeCount < 2 || (activeCount < 4 && roll < 0.45)) {
        this.spawnRandom();
      } else {
        // Trigger activity on an existing subagent
        const agents = Array.from(this.office.subagents.values());
        if (agents.length === 0) return;
        const target = agents[Math.floor(Math.random() * agents.length)];

        if (target.state === 'work' && !target.currentTool) {
          const item = this.demoTasks[Math.floor(Math.random() * this.demoTasks.length)];
          this.office.onToolStart({ agentId: target.id, tool: item.tool, summary: item.summary });

          setTimeout(() => {
            this.office.onToolEnd({ agentId: target.id, tool: item.tool, ok: true });
            if (Math.random() < 0.5) {
              setTimeout(() => {
                this.office.onAgentDone({ agentId: target.id, ok: true });
              }, 1500);
            }
          }, Math.random() * 4000 + 3000);
        }
      }
    }

    spawnRandom() {
      const item = this.demoTasks[Math.floor(Math.random() * this.demoTasks.length)];
      const id = `demo-${this.counter++}`;
      const name = LO.NAMES[Math.floor(Math.random() * LO.NAMES.length)];

      const agent = this.office.spawnSubAgent({
        agentId: id,
        name,
        task: item.task,
        tool: item.tool,
      });

      // Start working after settling in room
      setTimeout(() => {
        if (this.office.subagents.has(id)) {
          this.office.onToolStart({ agentId: id, tool: item.tool, summary: item.summary });

          // Finish after some time
          setTimeout(() => {
            if (this.office.subagents.has(id)) {
              this.office.onToolEnd({ agentId: id, tool: item.tool, ok: true });
              setTimeout(() => {
                this.office.onAgentDone({ agentId: id, ok: true });
              }, 2000);
            }
          }, Math.random() * 5000 + 4000);
        }
      }, 4000);
    }
  }

  LO.DemoController = DemoController;
})();
