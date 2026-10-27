/* Lami's AI Office — 2D Top-Down Office Engine, Elevator Bypass & Game Loop */
(function () {
  const LO = window.LO;

  // ---- 2D Top-Down Elevator Bypass Adapter ----
  class Elevator {
    constructor() {
      this.currentFloor = 0;
      this.targetFloor = 0;
      this.state = 'idle';
      this.passengers = [];
      this.queue = [];
      this.doorProgress = 0;
      this.speed = 0;
      this.waitTimer = 0;
      this.screenY = 0;
    }

    request(character) {
      // In 2D horizontal world, all rooms are on ground floor (floor 0).
      // Bypass vertical elevator: immediately synchronize floor and resume walking
      if (character) {
        character.floor = character.targetFloor;
        character.state = 'walk';
      }
    }

    update(dt, office) {
      // Immediate drain of any queued passengers as safeguard against agent freeze
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item && item.char) {
          item.char.floor = item.char.targetFloor;
          item.char.state = 'walk';
        }
      }
      while (this.passengers.length > 0) {
        const p = this.passengers.shift();
        p.floor = p.targetFloor;
        p.state = 'walk';
      }
    }

    render(ctx) {
      // In 2D top-down mode, no vertical elevator shaft or cables are drawn.
      // Decorative building entrance or lift door is handled cleanly by world.js.
    }
  }

  // ---- Main Office Simulation ----
  class Office {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
      this.world = new LO.World();
      this.elevator = new Elevator();

      this.collisionGrid = this.buildCollisionGrid();

      this.lami = new LO.Lami();
      this.cat = new LO.MochiCat();
      this.subagents = new Map();
      this.residents = [];

      this.slotOccupancy = {};
      this.initSlots();
      this.initResidents();

      this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
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

    // ---- 2D Orthogonal Collision Matrix Generation (64 x 36) ----
    buildCollisionGrid() {
      const cols = LO.GRID_COLS || 64;
      const rows = LO.GRID_ROWS || 36;
      // Initialize full matrix as solid (1 = obstacle)
      const grid = Array.from({ length: rows }, () => new Uint8Array(cols).fill(1));

      // 1. Mark Central Hallway / Corridor as walkable (0)
      for (let y = 15; y <= 18; y++) {
        for (let x = 1; x <= 62; x++) {
          grid[y][x] = 0;
        }
      }

      // 2. Mark Room Interiors as walkable (0)
      const rooms = LO.ROOMS || {};
      for (const roomId in rooms) {
        const room = rooms[roomId];
        if (!room || !room.bounds) continue;
        const { x1, y1, x2, y2 } = room.bounds;
        for (let y = y1 + 1; y < y2; y++) {
          for (let x = x1 + 1; x < x2; x++) {
            grid[y][x] = 0;
          }
        }
        // Ensure doorway is navigable (2 tiles wide)
        if (room.door) {
          const dx = room.door.x;
          const dy = room.door.y;
          for (let ox = 0; ox < 2; ox++) {
            const ddx = dx + ox;
            if (ddx >= 0 && ddx < cols && dy >= 0 && dy < rows) {
              grid[dy][ddx] = 0;
            }
            if (dy <= 15 && dy + 1 < rows) grid[dy + 1][ddx] = 0;
            if (dy >= 18 && dy - 1 >= 0) grid[dy - 1][ddx] = 0;
          }
        }
      }

      // 3. Mark Furniture & Prop Obstacles as solid (1)
      const obstacles = this.getFurnitureObstacles();
      for (const obs of obstacles) {
        const ow = obs.w || 1;
        const oh = obs.h || 1;
        for (let dy = 0; dy < oh; dy++) {
          for (let dx = 0; dx < ow; dx++) {
            const ox = obs.x + dx;
            const oy = obs.y + dy;
            if (ox >= 0 && ox < cols && oy >= 0 && oy < rows) {
              grid[oy][ox] = 1;
            }
          }
        }
      }

      // 4. Safety Guarantee: Ensure all configured workstation and activity slots are walkable (0)
      const slots = LO.SLOTS || {};
      for (const roomId in slots) {
        if (!Array.isArray(slots[roomId])) continue;
        for (const slot of slots[roomId]) {
          const sx = slot.x !== undefined ? slot.x : slot.col;
          const sy = slot.y !== undefined ? slot.y : slot.row;
          if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
            grid[sy][sx] = 0;
          }
        }
      }
      if (LO.LAMI_SEAT) {
        const lx = LO.LAMI_SEAT.x !== undefined ? LO.LAMI_SEAT.x : LO.LAMI_SEAT.col;
        const ly = LO.LAMI_SEAT.y !== undefined ? LO.LAMI_SEAT.y : LO.LAMI_SEAT.row;
        if (lx >= 0 && lx < cols && ly >= 0 && ly < rows) {
          grid[ly][lx] = 0;
        }
      }

      return grid;
    }

    getFurnitureObstacles() {
      return [
        // Boss Office (X: 2..19, Y: 2..14)
        { x: 10, y: 6, w: 3, h: 1, name: 'Executive Desk' },
        { x: 3,  y: 3, w: 2, h: 2, name: 'Boss Plant / Monstera' },
        { x: 14, y: 5, w: 1, h: 1, name: 'Context Trashcan' },
        { x: 18, y: 3, w: 1, h: 1, name: 'Boss Plant East' },

        // Research Lab (X: 21..39, Y: 2..14)
        { x: 23, y: 7, w: 2, h: 1, name: 'Research Desk 1' },
        { x: 28, y: 7, w: 2, h: 1, name: 'Research Desk 2' },
        { x: 33, y: 7, w: 2, h: 1, name: 'Research Desk 3' },
        { x: 22, y: 3, w: 3, h: 1, name: 'Lab Equipment Bench' },
        { x: 36, y: 3, w: 3, h: 1, name: 'Lab Bookshelves' },

        // Server Room (X: 41..58, Y: 2..14)
        { x: 43, y: 4, w: 2, h: 2, name: 'Server Rack Cluster 1' },
        { x: 47, y: 4, w: 2, h: 2, name: 'Server Rack Cluster 2' },
        { x: 51, y: 4, w: 2, h: 2, name: 'Server Rack Cluster 3' },
        { x: 55, y: 4, w: 2, h: 2, name: 'Server Rack Cluster 4' },
        { x: 47, y: 10, w: 3, h: 1, name: 'Mainframe Ops Console' },

        // Engineering Pit (X: 2..21, Y: 19..32)
        { x: 5,  y: 21, w: 2, h: 1, name: 'Dev Desk 1' },
        { x: 9,  y: 21, w: 2, h: 1, name: 'Dev Desk 2' },
        { x: 5,  y: 25, w: 2, h: 1, name: 'Dev Desk 3' },
        { x: 9,  y: 25, w: 2, h: 1, name: 'Dev Desk 4' },
        { x: 14, y: 23, w: 2, h: 1, name: 'Dev Desk 5' },
        { x: 18, y: 23, w: 2, h: 1, name: 'Dev Desk 6' },
        { x: 13, y: 21, w: 1, h: 1, name: 'Mini Server Rig' },

        // Meeting Room (X: 23..39, Y: 19..32)
        { x: 28, y: 24, w: 7, h: 3, name: 'Conference Table' },
        { x: 25, y: 19, w: 3, h: 1, name: 'Multi-Mode Whiteboard' },

        // Pantry / Lounge (X: 41..58, Y: 19..32)
        { x: 43, y: 23, w: 3, h: 1, name: 'Espresso Bar Counter' },
        { x: 51, y: 23, w: 1, h: 1, name: 'Water Cooler' },
        { x: 55, y: 27, w: 2, h: 1, name: 'Snack Vending Machine' },
        { x: 46, y: 27, w: 4, h: 1, name: 'Teal Lounge Sofa' }
      ];
    }

    isWalkable(tileX, tileY) {
      const x = Math.floor(tileX);
      const y = Math.floor(tileY);
      if (x < 0 || x >= (LO.GRID_COLS || 64) || y < 0 || y >= (LO.GRID_ROWS || 36)) return false;
      return this.collisionGrid[y][x] === 0;
    }

    setCollision(tileX, tileY, isSolid) {
      const x = Math.floor(tileX);
      const y = Math.floor(tileY);
      if (x >= 0 && x < (LO.GRID_COLS || 64) && y >= 0 && y < (LO.GRID_ROWS || 36)) {
        this.collisionGrid[y][x] = isSolid ? 1 : 0;
      }
    }

    // ---- 2D Orthogonal Pathfinding Method ----
    findPath(start, goal, customGrid = null) {
      const grid = customGrid || this.collisionGrid;
      if (!grid) return null;

      const cols = LO.GRID_COLS || 64;
      const rows = LO.GRID_ROWS || 36;
      const startX = start.x !== undefined ? start.x : start.col;
      const startY = start.y !== undefined ? start.y : start.row;
      const goalX = goal.x !== undefined ? goal.x : goal.col;
      const goalY = goal.y !== undefined ? goal.y : goal.row;

      // Clip to map bounds; LO.findOrthogonalPath snaps both ends to the
      // nearest walkable tile so a furniture overlap never breaks a walk.
      const sx = Math.max(0, Math.min(cols - 1, Math.round(startX)));
      const sy = Math.max(0, Math.min(rows - 1, Math.round(startY)));
      const gx = Math.max(0, Math.min(cols - 1, Math.round(goalX)));
      const gy = Math.max(0, Math.min(rows - 1, Math.round(goalY)));

      return LO.findOrthogonalPath
        ? LO.findOrthogonalPath({ x: sx, y: sy }, { x: gx, y: gy }, grid)
        : null;
    }

    initSlots() {
      for (const roomId in LO.SLOTS) {
        if (Array.isArray(LO.SLOTS[roomId])) {
          this.slotOccupancy[roomId] = new Array(LO.SLOTS[roomId].length).fill(null);
        }
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
      char.floor = 0;
      char.targetFloor = 0;
      char.targetCol = slotDef.x !== undefined ? slotDef.x : slotDef.col;
      char.targetRow = slotDef.y !== undefined ? slotDef.y : slotDef.row;
      char.targetX = char.targetCol;
      char.targetY = char.targetRow;
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
            LO.ui.triggerEventBanner('🍕', 'TRAKTIR MARTABAK!', 'Bang Kurir tiba di Pantry membawa martabak manis!');
            LO.ui.appendChatMessage('Bang Kurir', 'Kurir', 'Halo Lami Corp! Paket martabak manis hangat sudah sampai di Pantry ya 🍕🛵', '🛵', '#e67e22');
            this.lami.cheer();
            LO.audio.coin();
          }
          break;
        }

        case 'flicker': {
          this.flickerTimer = 0.9;
          LO.ui.triggerEventBanner('⚡', 'LISTRIK KEDIP!', 'Genset darurat aktif, sistem backup server 100% terjaga!');
          LO.ui.appendChatMessage('Bima', 'Admin Server', 'Tenang semua! UPS & genset otomatis aktif, server aman sentosa 🖥️⚡', '⚡', '#3498db');
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
          LO.ui.appendChatMessage('Sekar', 'Sekretaris', 'Teman-teman, kopi gayo baru diseduh di Pantry! Rehat bentar yuk ☕✨', '☕', '#9c27b0');
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
      const room = LO.roomForTool(data.tool) || 'engineering';
      const agent = new LO.SubAgent(id, name, data.task, room);

      this.subagents.set(id, agent);
      this.assignToSlot(agent, room);

      const roomIdx = LO.FLOOR_INDEX[room] !== undefined ? LO.FLOOR_INDEX[room] : 2;
      const floorLabel = LO.FLOORS[roomIdx]?.label || room;
      LO.ui.addTicker('✨', `Karyawan baru: <b>${name}</b> join ke <i>${floorLabel}</i>`);
      LO.ui.appendChatMessage('Sistem', 'Kantor', `✨ Karyawan baru <b>${name}</b> bergabung ke divisi <i>${floorLabel}</i>`, '✨', '#1f9d5c');
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
        agent.reportToLami(this);
        LO.ui.addTicker('🎉', `<b>${agent.name}</b> selesai tugas! Lapor ke Boss Lami.`);
        LO.ui.appendChatMessage(agent.name, agent.role || 'Staff', `Lapor Boss Lami, tugas telah selesai dengan baik! 🎉`, '✅', '#2ecc71');
        LO.ui.recordDone(true);

        // Despawn only after the report is delivered and the agent has walked
        // back to the pantry (never delete someone mid-corridor).
        const started = Date.now();
        const cleanup = () => {
          const stillWalking = agent.path && agent.path.length > 0;
          const inPantry = agent.assignedSlot && agent.assignedSlot.roomId === 'pantry' && !stillWalking;
          if (!inPantry && Date.now() - started < 90000) {
            setTimeout(cleanup, 500);
            return;
          }
          setTimeout(() => {
            if (!this.subagents.has(aid)) return;
            this.freeSlot(agent);
            this.subagents.delete(aid);
            LO.ui.updateStaffCount(this.subagents.size);
          }, 1500);
        };
        setTimeout(cleanup, 2500);
      } else {
        agent.setEmote('💦', 3.0);
        this.lami.panic();
        LO.ui.addTicker('⚠️', `<b>${agent.name}</b> ada kendala tugas.`);
        LO.ui.recordDone(false);
      }
    }

    setupInput() {
      const handleClick = (e) => {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        if (clientX === undefined) return;

        // Convert DOM screen pixels to 2D logical world pixels (1024x576)
        const canvasX = (clientX - rect.left - this.offsetX) / this.scale;
        const canvasY = (clientY - rect.top - this.offsetY) / this.scale;

        // 1. Check if any character was clicked (2D top-down hit-test)
        const allAgents = [this.lami, ...this.subagents.values(), ...this.residents];
        if (this.deliveryRider) allAgents.push(this.deliveryRider);
        for (const a of allAgents) {
          const col = a.col !== undefined ? a.col : a.x;
          const row = a.row !== undefined ? a.row : a.y;
          const ax = (col + 0.5) * LO.TILE_SIZE;
          const ay = (row + 0.5) * LO.TILE_SIZE;
          const dist = Math.hypot(canvasX - ax, canvasY - (ay - 4));
          if (dist < 18) {
            LO.ui.showCard(a);
            LO.audio.pop();
            return;
          }
        }

        // 2. Interactive Props in 2D Plane
        const props = LO.PROPS || {
          trashcan: { x: 14, y: 5, w: 1, h: 1 },
          whiteboard: { x: 25, y: 19, w: 4, h: 2 },
          watercooler: { x: 51, y: 23, w: 1, h: 1 }
        };

        // a. Context Window Trashcan (Boss Office at tile 14, 5)
        const tc = props.trashcan;
        if (tc) {
          const tcCenterX = (tc.x + (tc.w || 1) / 2) * LO.TILE_SIZE;
          const tcCenterY = (tc.y + (tc.h || 1) / 2) * LO.TILE_SIZE;
          if (Math.hypot(canvasX - tcCenterX, canvasY - tcCenterY) < 18) {
            LO.audio.pop();
            LO.ui.showContextModal();
            return;
          }
        }

        // b. Multi-Mode Whiteboard (Meeting Room at tiles 25-28, 19-20)
        const wb = props.whiteboard;
        if (wb) {
          const wbX1 = wb.x * LO.TILE_SIZE - 4;
          const wbX2 = (wb.x + (wb.w || 4)) * LO.TILE_SIZE + 4;
          const wbY1 = wb.y * LO.TILE_SIZE - 16;
          const wbY2 = (wb.y + (wb.h || 2)) * LO.TILE_SIZE + 16;
          if (canvasX >= wbX1 && canvasX <= wbX2 && canvasY >= wbY1 && canvasY <= wbY2) {
            LO.audio.pop();
            this.whiteboardMode = (this.whiteboardMode + 1) % 3;
            const tabs = ['tasks', 'tools', 'team'];
            LO.ui.showWhiteboardModal(tabs[this.whiteboardMode]);
            return;
          }
        }

        // c. Water Cooler / Pantry Dispenser (Pantry at tile 51, 23)
        const wc = props.watercooler || props.waterCooler;
        if (wc) {
          const wcCenterX = (wc.x + (wc.w || 1) / 2) * LO.TILE_SIZE;
          const wcCenterY = (wc.y + (wc.h || 1) / 2) * LO.TILE_SIZE;
          if (Math.hypot(canvasX - wcCenterX, canvasY - wcCenterY) < 18) {
            LO.audio.pop();
            LO.ui.addTicker('💧', 'Dispenser air galon Pantry: <i>Gluk... gluk... gluk...</i> Segar!');
            LO.ui.appendChatMessage('Pantry', 'Fasilitas', 'Segarnya air galon sejuk di Pantry! Rehidrasi dulu 💧✨', '💧', '#3498db');
            return;
          }
        }

        // Click outside any interactive target
        LO.ui.hideCard();
      };

      if (this.canvas && this.canvas.addEventListener) {
        this.canvas.addEventListener('click', handleClick);
        this.canvas.addEventListener('touchstart', handleClick, { passive: true });
      }
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
      if (!this.canvas || !this.ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.clientWidth || LO.CONTENT_W;
      const h = this.canvas.clientHeight || LO.CONTENT_H;

      if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
      }

      this.ctx.imageSmoothingEnabled = false;
      this.ctx.save();
      this.ctx.scale(dpr, dpr);

      // Fit 16:9 content (1024x576) maintaining aspect ratio
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

      // 1. World Floor, Walls & Stationary Props
      this.world.render(this.ctx);

      // 2. Elevator Adapter (no-op in 2D mode)
      if (this.elevator && this.elevator.render) {
        this.elevator.render(this.ctx);
      }

      // 3. Characters sorted by 2D Y-Depth (Painter's Algorithm)
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
