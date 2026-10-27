/* Lami's AI Office — Isometric Office Engine, Glass Lift & Game Loop (Happy Mall Story Style) */
(function () {
  const LO = window.LO;

  // ---- Isometric Glass Elevator System ----
  class Elevator {
    constructor() {
      this.currentFloor = LO.GROUND;
      const initialPos = LO.isoToScreen(LO.LIFT_COL, LO.LIFT_ROW, this.currentFloor);
      this.screenY = initialPos.y - 14;
      this.targetFloor = LO.GROUND;
      this.state = 'idle'; // idle | moving | door_open | door_close
      this.passengers = [];
      this.queue = [];
      this.doorProgress = 0; // 0 = closed, 1 = fully open
      this.speed = 85; // px/sec
      this.waitTimer = 0;
    }

    request(character) {
      const existing = this.queue.find((item) => item.char === character);
      if (existing) {
        existing.targetFloor = character.targetFloor;
      } else {
        this.queue.push({ char: character, targetFloor: character.targetFloor });
      }
    }

    update(dt, office) {
      const targetPos = LO.isoToScreen(LO.LIFT_COL, LO.LIFT_ROW, this.targetFloor);
      const targetY = targetPos.y - 14;

      switch (this.state) {
        case 'idle': {
          if (this.queue.length > 0) {
            const next = this.queue[0];
            if (this.currentFloor === next.char.floor) {
              this.state = 'door_open';
              LO.audio.liftDing();
            } else {
              this.targetFloor = next.char.floor;
              this.state = 'moving';
            }
          }
          break;
        }

        case 'moving': {
          const dy = targetY - this.screenY;
          const dist = Math.abs(dy);
          const step = this.speed * dt;
          if (dist <= step) {
            this.screenY = targetY;
            this.currentFloor = this.targetFloor;
            this.state = 'door_open';
            LO.audio.liftDing();
          } else {
            this.screenY += Math.sign(dy) * step;
          }
          // Move passengers with elevator
          for (const p of this.passengers) {
            p.floor = this.currentFloor;
            p.col = LO.LIFT_COL;
            p.row = LO.LIFT_ROW;
          }
          break;
        }

        case 'door_open': {
          this.doorProgress += dt * 3.2;
          if (this.doorProgress >= 1) {
            this.doorProgress = 1;

            // Let exiting passengers disembark onto target floor
            for (let i = this.passengers.length - 1; i >= 0; i--) {
              const p = this.passengers[i];
              if (p.targetFloor === this.currentFloor) {
                p.floor = this.currentFloor;
                p.col = LO.LIFT_WAIT_COL;
                p.row = LO.LIFT_WAIT_ROW;
                p.state = 'walk';
                this.passengers.splice(i, 1);
              }
            }

            // Board waiting passengers at this floor
            for (let i = this.queue.length - 1; i >= 0; i--) {
              const item = this.queue[i];
              if (item.char.floor === this.currentFloor && this.passengers.length < 4) {
                const char = item.char;
                char.state = 'lift_ride';
                char.col = LO.LIFT_COL;
                char.row = LO.LIFT_ROW;
                this.passengers.push(char);
                this.queue.splice(i, 1);
              }
            }

            if (this.passengers.length > 0) {
              this.targetFloor = this.passengers[0].targetFloor;
            } else if (this.queue.length > 0) {
              this.targetFloor = this.queue[0].char.floor;
            }

            this.waitTimer = 0.5;
            this.state = 'waiting';
          }
          break;
        }

        case 'waiting': {
          this.waitTimer -= dt;
          if (this.waitTimer <= 0) {
            this.state = 'door_close';
          }
          break;
        }

        case 'door_close': {
          this.doorProgress -= dt * 3.2;
          if (this.doorProgress <= 0) {
            this.doorProgress = 0;
            if (this.passengers.length > 0 || (this.queue.length > 0 && this.queue[0].char.floor !== this.currentFloor)) {
              this.state = 'moving';
            } else {
              this.state = 'idle';
            }
          }
          break;
        }
      }
    }

    render(ctx) {
      const topPos = LO.isoToScreen(LO.LIFT_COL, LO.LIFT_ROW, 0);
      const botPos = LO.isoToScreen(LO.LIFT_COL, LO.LIFT_ROW, LO.NF - 1);
      const lx = topPos.x - 10;
      const lw = 20;

      // 1. Vertical Elevator Shaft Steel Cables & Guide Rails
      ctx.strokeStyle = '#546e7a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx + 2, topPos.y - 20);
      ctx.lineTo(lx + 2, botPos.y + 10);
      ctx.moveTo(lx + lw - 2, topPos.y - 20);
      ctx.lineTo(lx + lw - 2, botPos.y + 10);
      ctx.stroke();

      // 2. Glass Elevator Cabin
      const cy = Math.floor(this.screenY);
      const ch = 22;

      // Interior warm glow
      ctx.fillStyle = '#fff8e1';
      ctx.fillRect(lx, cy, lw, ch);

      // Glass tint & reflection
      ctx.fillStyle = 'rgba(129, 212, 250, 0.45)';
      ctx.fillRect(lx + 1, cy + 1, lw - 2, ch - 2);

      // Steel frame
      ctx.strokeStyle = '#37474f';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx + 0.5, cy + 0.5, lw - 1, ch - 1);

      // Sliding Glass Doors
      const doorW = (lw / 2) * (1 - this.doorProgress);
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(lx, cy, doorW, ch);
      ctx.fillRect(lx + lw - doorW, cy, doorW, ch);

      // Indicator LED
      const isCall = this.queue.length > 0 || this.passengers.length > 0;
      ctx.fillStyle = isCall ? '#2ecc71' : '#f39c12';
      ctx.fillRect(lx + lw / 2 - 2, cy - 3, 4, 3);
    }
  }

  // ---- Main Office Simulation ----
  class Office {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.world = new LO.World();
      this.elevator = new Elevator();

      this.lami = new LO.Lami();
      this.cat = new LO.MochiCat();
      this.subagents = new Map();
      this.residents = [];

      this.slotOccupancy = {};
      this.initSlots();
      this.initResidents();

      this.lastTime = performance.now();
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;

      // Random Office Events (Claude-Office reference)
      this.deliveryRider = null;
      this.flickerTimer = 0;
      this.pizzaEventTimer = 0;
      this.randomEventTimer = 45.0 + Math.random() * 20;

      // Context Window Trashcan & Multi-Mode Whiteboard (Claude-Office reference)
      this.contextUsage = 0.42;
      this.whiteboardMode = 0;
      this.theOfficeMode = false;

      window.LO.office = this;
      this.setupInput();
    }

    initSlots() {
      for (const roomId in LO.SLOTS) {
        this.slotOccupancy[roomId] = new Array(LO.SLOTS[roomId].length).fill(null);
      }
    }

    initResidents() {
      for (const r of LO.RESIDENTS) {
        const char = new LO.ResidentAgent(r.id, r.name, r.role, r.room, r.slot, r.look);
        this.residents.push(char);
        this.assignToSlot(char, r.room, r.slot);
      }
    }

    assignToSlot(char, roomId, preferredSlot = null) {
      const slots = LO.SLOTS[roomId];
      const occ = this.slotOccupancy[roomId];
      if (!slots || !occ) return;

      let idx = preferredSlot !== null && !occ[preferredSlot] ? preferredSlot : -1;
      if (idx === -1) {
        idx = occ.findIndex((c) => c === null);
      }
      if (idx === -1) idx = Math.floor(Math.random() * slots.length);

      // Free previous slot
      if (char.assignedSlot && char.assignedSlot.roomId) {
        const prevOcc = this.slotOccupancy[char.assignedSlot.roomId];
        if (prevOcc) prevOcc[char.assignedSlot.index] = null;
      }

      occ[idx] = char;
      const slotDef = slots[idx];
      char.assignedSlot = { roomId, index: idx, type: slotDef.type, facing: slotDef.facing };
      char.targetFloor = LO.FLOOR_INDEX[roomId];
      char.targetCol = slotDef.col;
      char.targetRow = slotDef.row;
      if (slotDef.facing) char.facing = slotDef.facing;
    }

    freeSlot(char) {
      if (char.assignedSlot && char.assignedSlot.roomId) {
        const occ = this.slotOccupancy[char.assignedSlot.roomId];
        if (occ) occ[char.assignedSlot.index] = null;
        char.assignedSlot = null;
      }
    }

    // ---- Random Office Events (Claude-Office reference) ----
    triggerRandomEvent(type = null) {
      const types = ['pizza', 'flicker', 'coffee', 'printer'];
      const chosen = type || types[Math.floor(Math.random() * types.length)];

      switch (chosen) {
        case 'pizza': {
          if (!this.deliveryRider) {
            this.deliveryRider = new LO.DeliveryRider();
            LO.ui.triggerEventBanner('🍕', 'TRAKTIR MARTABAK!', 'Bang Kurir tiba di Pantry 1F membawa martabak manis!');
            LO.ui.appendChatMessage('Bang Kurir', 'Kurir', 'Halo Lami Corp! Paket martabak manis hangat sudah sampai di Pantry 1F ya 🍕🛵', '🛵', '#e67e22');
            this.lami.cheer();
            LO.audio.coin();
          }
          break;
        }

        case 'flicker': {
          this.flickerTimer = 0.9;
          LO.ui.triggerEventBanner('⚡', 'LISTRIK KEDIP!', 'Genset darurat aktif, sistem backup server 100% terjaga!');
          LO.ui.appendChatMessage('Bima', 'Admin Server', 'Tenang semua! UPS & genset otomatis aktif, server B1 aman sentosa 🖥️⚡', '⚡', '#3498db');
          const bima = this.residents.find((r) => r.id === 'res-bima');
          if (bima) {
            bima.setBubble('Genset aman, server lancar! ⚡', 3.5);
            bima.setEmote('⚡', 3.0);
          }
          LO.audio.error();
          break;
        }

        case 'coffee': {
          LO.ui.triggerEventBanner('☕', 'RESTOCK KOPI PANTRY!', 'Biji kopi gayo baru diseduh, mesin espresso mengepul!');
          LO.ui.appendChatMessage('Sekar', 'Sekretaris', 'Teman-teman, kopi gayo baru diseduh di Pantry 1F! Rehat bentar yuk ☕✨', '☕', '#9c27b0');
          LO.audio.pop();
          LO.ui.recordDone(true);
          const sekar = this.residents.find((r) => r.id === 'res-sekar');
          if (sekar) sekar.setEmote('☕', 3.0);
          break;
        }

        case 'printer': {
          LO.ui.triggerEventBanner('📄', 'PRINTER JAM!', 'Kertas laporan tersangkut di ruang meeting, segera diperbaiki!');
          LO.ui.appendChatMessage('Dodo', 'Senior Coder', 'Bentar guys, printer macet lagi... Udah gue beresin dan bersihin ya 🖨️👍', '🖨️', '#2e7d32');
          const dodo = this.residents.find((r) => r.id === 'res-dodo');
          if (dodo) {
            dodo.setBubble('Paper jam beres diperbaiki 👍', 3.5);
            dodo.setEmote('📄', 3.0);
          }
          LO.audio.keyboard();
          break;
        }
      }
    }

    // ---- Event Ingest Handlers ----
    spawnSubAgent(data) {
      const id = data.agentId || `sa-${Date.now()}`;
      if (this.subagents.has(id)) return this.subagents.get(id);

      const name = data.name || LO.NAMES[Math.floor(Math.random() * LO.NAMES.length)];
      const room = LO.roomForTool(data.tool) || 'coding';
      const agent = new LO.SubAgent(id, name, data.task, room);

      this.subagents.set(id, agent);
      this.assignToSlot(agent, room);

      LO.ui.addTicker('✨', `Karyawan baru: <b>${name}</b> join ke <i>${LO.FLOORS[LO.FLOOR_INDEX[room]].label}</i>`);
      LO.ui.appendChatMessage('Sistem', 'Kantor', `✨ Karyawan baru <b>${name}</b> bergabung ke divisi <i>${LO.FLOORS[LO.FLOOR_INDEX[room]].label}</i>`, '✨', '#1f9d5c');
      LO.ui.updateStaffCount(this.subagents.size);

      // Boss Lami delegates
      this.lami.setEmote('📢', 2.0);
      this.lami.setBubble(`Tolong bantu: ${data.task || 'tugas baru'} ya! 📋`, 3.5);

      return agent;
    }

    onToolStart(data) {
      const aid = data.agentId;
      const targetRoom = LO.roomForTool(data.tool);

      if (aid === 'lami') {
        this.lami.think();
        this.lami.setBubble(`Lagi ${data.summary || data.tool}... ⚡`, 3.5);
        const res = this.residents.find((r) => (r.homeRoom || r.assignedSlot?.roomId) === targetRoom);
        if (res) {
          if (res.interruptForWork) {
            res.interruptForWork(data.tool, data.summary || data.tool);
          } else {
            res.setBubble(`${LO.iconForTool(data.tool)} ${data.summary || data.tool}`, 4.0);
            res.state = 'work';
          }
        }
        LO.ui.addTicker('🛠️', `Boss Lami: <i>${data.tool}</i> (${data.summary || 'jalan'})`);
        return;
      }

      let agent = this.subagents.get(aid);
      if (!agent) {
        agent = this.spawnSubAgent({ agentId: aid, task: data.summary, tool: data.tool });
      }

      if (agent.assignedSlot?.roomId !== targetRoom) {
        this.assignToSlot(agent, targetRoom);
      }

      agent.startWork(data.tool, data.summary || data.tool);
      LO.audio.keyboard();
      LO.ui.addTicker('⚡', `<b>${agent.name}</b>: ${LO.iconForTool(data.tool)} ${data.summary || data.tool}`);
      LO.ui.appendChatMessage(agent.name, agent.role || 'Staff', `${LO.iconForTool(data.tool)} Menjalankan: <code>${data.summary || data.tool}</code>`, LO.iconForTool(data.tool), '#3498db');
    }

    onToolEnd(data) {
      const aid = data.agentId;
      if (aid === 'lami') {
        const targetRoom = LO.roomForTool(data.tool);
        const res = this.residents.find((r) => (r.homeRoom || r.assignedSlot?.roomId) === targetRoom);
        if (res && res.finishWork) {
          res.finishWork(data.ok !== false);
        } else if (res) {
          res.setBubble(data.ok !== false ? 'Beres! 👍' : 'Ada kendala... ⚠️', 2.5);
          res.frame = 'idle';
        }
        if (data.ok !== false) {
          LO.ui.recordDone(true);
        }
        return;
      }
      const agent = this.subagents.get(aid);
      if (agent) {
        agent.endWork(data.ok !== false);
      }
    }

    onAgentStatus(data) {
      if (data.agentId === 'lami') {
        if (data.status === 'thinking') this.lami.think();
        else if (data.status === 'happy') this.lami.cheer();
        else if (data.status === 'error') this.lami.panic();
      }
    }

    onAgentDone(data) {
      const aid = data.agentId;
      const agent = this.subagents.get(aid);
      if (!agent) return;

      const ok = data.ok !== false;
      if (ok) {
        agent.reportToLami();
        LO.ui.addTicker('🎉', `<b>${agent.name}</b> selesai tugas! Lapor ke Boss Lami.`);
        LO.ui.appendChatMessage(agent.name, agent.role || 'Staff', `Lapor Boss Lami, tugas telah selesai dengan baik! 🎉`, '✅', '#2ecc71');
        LO.ui.recordDone(true);
        setTimeout(() => {
          agent.deliverReport(this.lami);
          setTimeout(() => {
            this.assignToSlot(agent, 'pantry');
            setTimeout(() => {
              this.freeSlot(agent);
              this.subagents.delete(aid);
              LO.ui.updateStaffCount(this.subagents.size);
            }, 6000);
          }, 3500);
        }, 3000);
      } else {
        agent.setEmote('💦', 3.0);
        this.lami.panic();
        LO.ui.addTicker('⚠️', `<b>${agent.name}</b> ada kendala tugas.`);
        LO.ui.recordDone(false);
      }
    }

    setupInput() {
      const handleClick = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        if (clientX === undefined) return;

        const canvasX = (clientX - rect.left - this.offsetX) / this.scale;
        const canvasY = (clientY - rect.top - this.offsetY) / this.scale;

        // 1. Check if any agent was clicked (Isometric distance)
        const allAgents = [this.lami, ...this.subagents.values(), ...this.residents];
        for (const a of allAgents) {
          const pos = LO.isoToScreen(a.col, a.row, a.floor);
          const dist = Math.hypot(canvasX - pos.x, canvasY - (pos.y - 10));
          if (dist < 15) {
            LO.ui.showCard(a);
            LO.audio.pop();
            return;
          }
        }

        // 2. Interactive Props (Claude-Office reference)
        // a. Context Window Trashcan (Floor 0: Boss Room at col 3.0, row 1.8)
        const tcPos = LO.isoToScreen(3.0, 1.8, 0);
        if (Math.hypot(canvasX - tcPos.x, canvasY - (tcPos.y - 10)) < 18) {
          LO.audio.pop();
          LO.ui.showContextModal();
          return;
        }

        // b. Multi-Mode Whiteboard (Floor 3: Meeting Room at col 3.5, row 0)
        const wbPos = LO.isoToScreen(3.5, 0, 3);
        if (Math.abs(canvasX - wbPos.x) <= 24 && canvasY >= wbPos.y - 28 && canvasY <= wbPos.y - 4) {
          LO.audio.pop();
          this.whiteboardMode = (this.whiteboardMode + 1) % 3;
          const tabs = ['tasks', 'tools', 'team'];
          LO.ui.showWhiteboardModal(tabs[this.whiteboardMode]);
          return;
        }

        // c. Water Cooler / Pantry Dispenser (Floor 4: Pantry at col 5.8, row 1.8)
        const wcPos = LO.isoToScreen(5.8, 1.8, 4);
        if (Math.hypot(canvasX - wcPos.x, canvasY - (wcPos.y - 12)) < 15) {
          LO.audio.pop();
          LO.ui.addTicker('💧', 'Dispenser air galon Pantry 1F: <i>Gluk... gluk... gluk...</i> Segar!');
          LO.ui.appendChatMessage('Pantry', 'Fasilitas', 'Segarnya air galon sejuk di Pantry 1F! Rehidrasi dulu 💧✨', '💧', '#3498db');
          return;
        }

        LO.ui.hideCard();
      };

      this.canvas.addEventListener('click', handleClick);
      this.canvas.addEventListener('touchstart', handleClick, { passive: true });
    }

    // ---- The Office (Scranton Dunder Mifflin Tribute Mode) ----
    toggleTheOfficeMode() {
      this.theOfficeMode = !this.theOfficeMode;
      const tribute = LO.OFFICE_TRIBUTE_LOOKS;

      if (this.theOfficeMode) {
        // Switch Lami to Michael Scott
        this.lami.name = 'Michael Scott';
        this.lami.role = 'Regional Manager';
        this.lami.look = tribute.michael;
        this.lami.sprites = LO.getCharacterSprites(this.lami.look);
        this.lami.setBubble("THAT'S WHAT SHE SAID! 📄", 4.0);
        this.lami.setEmote('📄', 3.5);

        // Switch residents to Scranton crew
        const map = [
          { id: 'res-dodo', name: 'Dwight Schrute', role: 'Asst. to Regional Mgr', look: tribute.dwight, bubble: 'Question: What bear is best? 🐻', emote: '👓' },
          { id: 'res-bima', name: 'Jim Halpert', role: 'Sales Representative', look: tribute.jim, bubble: 'Looking at the camera... 👀', emote: '📎' },
          { id: 'res-sekar', name: 'Pam Beesly', role: 'Office Administrator', look: tribute.pam, bubble: 'Dunder Mifflin, this is Pam! 📞', emote: '🌸' },
          { id: 'res-rina', name: 'Angela Martin', role: 'Senior Accountant', look: tribute.angela, bubble: 'I have 7 cats at home. 🐱', emote: '🐾' }
        ];

        for (const m of map) {
          const res = this.residents.find((r) => r.id === m.id);
          if (res) {
            res.name = m.name;
            res.role = m.role;
            res.look = m.look;
            res.sprites = LO.getCharacterSprites(res.look);
            res.setBubble(m.bubble, 4.0);
            res.setEmote(m.emote, 3.5);
          }
        }

        LO.audio.coin();
        LO.ui.triggerEventBanner('📄', 'DUNDER MIFFLIN SCRANTON!', 'The Office Tribute Mode: Welcome to Scranton Paper Co.!');
        LO.ui.addTicker('📄', 'Mode <b>The Office (Scranton)</b> diaktifkan!');
        LO.ui.appendChatMessage('Michael Scott', 'Regional Mgr', "THAT'S WHAT SHE SAID! 📄 Welcome to Dunder Mifflin Scranton Branch!", '📄', '#2c3e50');
        LO.ui.appendChatMessage('Dwight Schrute', 'Asst. to Reg Mgr', "Bears. Beets. Battlestar Galactica. 🐻", '👓', '#d4ac0d');
      } else {
        // Revert Lami
        this.lami.name = 'Boss Lami';
        this.lami.role = 'CEO & Master AI';
        this.lami.look = LO.LAMI_LOOK;
        this.lami.sprites = LO.getCharacterSprites(this.lami.look);
        this.lami.setBubble('Kembali ke markas AI Lami Corp! 👑', 3.5);
        this.lami.setEmote('👑', 3.0);

        // Revert residents
        for (const orig of LO.RESIDENTS) {
          const res = this.residents.find((r) => r.id === orig.id);
          if (res) {
            res.name = orig.name;
            res.role = orig.role;
            res.look = orig.look;
            res.sprites = LO.getCharacterSprites(res.look);
            res.setBubble(`Siap lanjut tugas ${orig.role}! 👍`, 3.0);
          }
        }

        LO.audio.pop();
        LO.ui.triggerEventBanner('👑', 'LAMI CORP DIKEMBALIKAN', 'Kembali ke markas AI Lami Corp!');
        LO.ui.addTicker('👑', 'Mode <b>Lami Corp AI</b> diaktifkan kembali.');
        LO.ui.appendChatMessage('Boss Lami', 'CEO', 'Selamat datang kembali di Lami Corp AI! Semangat kerjanya tim 👑✨', '👑', '#ffd25e');
      }
    }

    // ---- Loop ----
    start() {
      const loop = (now) => {
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        this.update(dt);
        this.render();

        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    update(dt) {
      this.world.update(dt);
      this.elevator.update(dt, this);

      this.lami.update(dt, this);
      this.cat.update(dt, this);

      // Random office event timers
      if (this.pizzaEventTimer > 0) this.pizzaEventTimer -= dt;
      if (this.flickerTimer > 0) this.flickerTimer -= dt;

      this.randomEventTimer -= dt;
      if (this.randomEventTimer <= 0) {
        this.randomEventTimer = 50.0 + Math.random() * 30;
        this.triggerRandomEvent();
      }

      if (this.deliveryRider) {
        this.deliveryRider.update(dt, this);
      }

      for (const res of this.residents) {
        res.update(dt, this);
      }
      for (const sub of this.subagents.values()) {
        sub.update(dt, this);
      }
    }

    render() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;

      if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
      }

      this.ctx.imageSmoothingEnabled = false;
      this.ctx.save();
      this.ctx.scale(dpr, dpr);

      // Fit content maintaining aspect ratio
      const scaleX = w / LO.CONTENT_W;
      const scaleY = h / LO.CONTENT_H;
      this.scale = Math.min(scaleX, scaleY);
      this.offsetX = Math.floor((w - LO.CONTENT_W * this.scale) / 2);
      this.offsetY = Math.floor((h - LO.CONTENT_H * this.scale) / 2);

      // Background fill
      this.ctx.fillStyle = '#141226';
      this.ctx.fillRect(0, 0, w, h);

      this.ctx.translate(this.offsetX, this.offsetY);
      this.ctx.scale(this.scale, this.scale);

      // 1. World & Isometric Building Floors
      this.world.render(this.ctx);

      // 2. Isometric Glass Elevator
      this.elevator.render(this.ctx);

      // 3. Characters sorted by Isometric Depth (Painter's Algorithm)
      const allChars = [this.lami, ...this.residents, ...this.subagents.values(), this.cat];
      if (this.deliveryRider) allChars.push(this.deliveryRider);
      allChars.sort((a, b) => a.getDepth() - b.getDepth());

      for (const c of allChars) {
        c.render(this.ctx);
      }

      this.ctx.restore();
    }
  }

  LO.Office = Office;
})();
