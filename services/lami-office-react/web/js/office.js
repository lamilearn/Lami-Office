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
      if (LO.ui && LO.ui.updateStaffCount) LO.ui.updateStaffCount(this.residents.length);

      // Server-authoritative world. When true the server simulates every
      // character and this page only renders `applyWorld()` frames, so all
      // visitors see the same office. It flips to false only when the stream is
      // unavailable and the local demo controller takes over.
      this.simulatedExternally = false;
      this.lastWorldAt = 0;
      // True once a world frame has positioned everybody (the first frame snaps,
      // later frames ease). Reset only on a full page load, never on reconnect.
      this.worldPlaced = false;
      this.worldTargets = new Map();
      this.pendingWorld = null;

      this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;

      // Responsive view state: phones get a pan/zoom camera, desktop fits all.
      this.phoneMode = false;
      this.drawerInset = 0;
      this.view = { zoom: 1, offsetX: 0, offsetY: 0, availW: LO.CONTENT_W, availH: LO.CONTENT_H, cameraMode: false };
      this.camera = {
        x: LO.CONTENT_W / 2 / LO.TILE_SIZE,
        y: LO.CONTENT_H / 2 / LO.TILE_SIZE,
        targetX: LO.CONTENT_W / 2 / LO.TILE_SIZE,
        targetY: LO.CONTENT_H / 2 / LO.TILE_SIZE,
        zoom: null
      };

      // Random Office Events (Claude-Office reference)
      this.deliveryRider = null;
      this.flickerTimer = 0;
      this.pizzaEventTimer = 0;
      this.randomEventTimer = 45.0 + Math.random() * 20;

      // Context Window Trashcan & Multi-Mode Whiteboard (Claude-Office reference)
      this.contextUsage = 0.42;
      this.whiteboardMode = 0;
      this.theOfficeMode = false;

      // A2A peer agents (Hermes sidecars on the LAN)
      this.peerAgents = new Map();
      this.a2aPeers = [];

      window.LO.office = this;
      this.setupInput();
    }

    // ---- 2D Orthogonal Collision Matrix Generation (88 x 50) ----
    // Shared-wall floorplan: everything starts solid, then the configured room
    // interiors, hallway bands and 2-tile doorways are opened as walkable.
    buildCollisionGrid() {
      const cols = LO.GRID_COLS || 88;
      const rows = LO.GRID_ROWS || 50;
      const grid = Array.from({ length: rows }, () => new Uint8Array(cols).fill(1));
      const open = (x, y) => {
        if (x >= 0 && x < cols && y >= 0 && y < rows) grid[y][x] = 0;
      };

      // 1. Room interiors (walkable up to the inner face of the shared wall)
      const rooms = LO.ROOMS || {};
      for (const roomId in rooms) {
        const room = rooms[roomId];
        if (!room || !room.bounds) continue;
        const { x1, y1, x2, y2 } = room.bounds;
        for (let y = y1; y <= y2; y++) {
          for (let x = x1; x <= x2; x++) open(x, y);
        }
      }

      // 2. Hallway bands (north, south, lobby)
      for (const band of (LO.HALLWAY_BANDS || [LO.HALLWAY])) {
        if (!band) continue;
        for (let y = band.y1; y <= band.y2; y++) {
          for (let x = band.x1; x <= band.x2; x++) open(x, y);
        }
      }

      // 3. Doorways (2 tiles wide) punch through the shared partition wall
      for (const d of (LO.doorways ? LO.doorways() : [])) {
        for (const t of d.tiles) open(t.x, t.y);
      }

      // 4. Mark Furniture & Prop Obstacles as solid (1)
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

      // 5. Safety Guarantee: Ensure all configured workstation and activity slots are walkable (0)
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
        // Boss Office (interior X: 2..27, Y: 3..18)
        { x: 11, y: 7,  w: 7, h: 1, name: 'Executive Desk' },
        { x: 4,  y: 5,  w: 1, h: 1, name: 'Boss Plant / Monstera' },
        { x: 20, y: 6,  w: 1, h: 1, name: 'Context Trashcan' },
        { x: 25, y: 5,  w: 1, h: 1, name: 'Boss Plant East' },
        { x: 8,  y: 6,  w: 1, h: 1, name: 'Boss Bookshelf' },

        // Research Lab (interior X: 30..55, Y: 3..18)
        { x: 33, y: 9,  w: 3, h: 1, name: 'Research Desk 1' },
        { x: 41, y: 9,  w: 3, h: 1, name: 'Research Desk 2' },
        { x: 49, y: 9,  w: 3, h: 1, name: 'Research Desk 3' },
        { x: 33, y: 15, w: 2, h: 1, name: 'Microscope Station' },
        { x: 49, y: 3,  w: 5, h: 1, name: 'Lab Bookshelves' },
        { x: 31, y: 4,  w: 4, h: 1, name: 'Lab Corkboard' },

        // Server Room (interior X: 58..83, Y: 3..18)
        { x: 63, y: 6,  w: 3, h: 2, name: 'Server Rack Cluster 1' },
        { x: 69, y: 6,  w: 3, h: 2, name: 'Server Rack Cluster 2' },
        { x: 75, y: 6,  w: 3, h: 2, name: 'Server Rack Cluster 3' },
        { x: 81, y: 6,  w: 2, h: 2, name: 'Server Rack Cluster 4' },
        { x: 66, y: 14, w: 6, h: 1, name: 'Mainframe Ops Console' },

        // Engineering Pit (interior X: 2..27, Y: 24..39)
        { x: 6,  y: 27, w: 3, h: 1, name: 'Dev Desk 1' },
        { x: 11, y: 27, w: 3, h: 1, name: 'Dev Desk 2' },
        { x: 6,  y: 32, w: 3, h: 1, name: 'Dev Desk 3' },
        { x: 11, y: 32, w: 3, h: 1, name: 'Dev Desk 4' },
        { x: 17, y: 30, w: 3, h: 1, name: 'Dev Desk 5' },
        { x: 22, y: 30, w: 3, h: 1, name: 'Dev Desk 6' },
        { x: 16, y: 27, w: 1, h: 1, name: 'Mini Server Rig' },

        // Meeting Room (interior X: 30..55, Y: 24..39)
        { x: 38, y: 30, w: 12, h: 3, name: 'Conference Table' },
        { x: 32, y: 24, w: 5, h: 1,  name: 'Multi-Mode Whiteboard' },

        // Pantry / Lounge (interior X: 58..83, Y: 24..39)
        { x: 60, y: 27, w: 6, h: 1, name: 'Espresso Bar Counter' },
        { x: 74, y: 28, w: 1, h: 1, name: 'Water Cooler' },
        { x: 63, y: 33, w: 6, h: 1, name: 'Teal Lounge Sofa' },
        { x: 68, y: 36, w: 3, h: 1, name: 'Coffee Table' },
        { x: 78, y: 33, w: 3, h: 2, name: 'Snack Vending Machine' }
      ];
    }

    isWalkable(tileX, tileY) {
      const x = Math.floor(tileX);
      const y = Math.floor(tileY);
      if (x < 0 || x >= (LO.GRID_COLS || 88) || y < 0 || y >= (LO.GRID_ROWS || 50)) return false;
      return this.collisionGrid[y][x] === 0;
    }

    setCollision(tileX, tileY, isSolid) {
      const x = Math.floor(tileX);
      const y = Math.floor(tileY);
      if (x >= 0 && x < (LO.GRID_COLS || 88) && y >= 0 && y < (LO.GRID_ROWS || 50)) {
        this.collisionGrid[y][x] = isSolid ? 1 : 0;
      }
    }

    // ---- 2D Orthogonal Pathfinding Method ----
    findPath(start, goal, customGrid = null) {
      const grid = customGrid || this.collisionGrid;
      if (!grid) return null;

      const cols = LO.GRID_COLS || 88;
      const rows = LO.GRID_ROWS || 50;
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

    // Resolve a room slot. 'auto' picks a deterministic slot from the character
    // id so a reconnected page rebuilds the same seating arrangement.
    assignToSlot(char, roomId, preferredSlot = null) {
      const slots = LO.SLOTS[roomId];
      const occ = this.slotOccupancy[roomId];
      if (!slots || !occ) return;

      let idx = -1;
      if (preferredSlot === 'auto') {
        const start = LO.slotIndexForAgent(char.id, slots.length);
        for (let i = 0; i < slots.length; i++) {
          const candidate = (start + i) % slots.length;
          if (!occ[candidate]) { idx = candidate; break; }
        }
      } else if (preferredSlot !== null && !occ[preferredSlot]) {
        idx = preferredSlot;
      }
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
      // Restored characters are already seated; jumping straight to the slot
      // avoids a whole-office "everyone walks in again" replay on reconnect.
      if (preferredSlot === 'auto') {
        char.col = char.targetCol;
        char.row = char.targetRow;
        char.path = [];
      }
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
    // opts.restore: rebuilding from a server snapshot after a reconnect. The
    // agent is placed straight at its slot instead of walking in from the door,
    // and nothing is announced as if it had just arrived.
    spawnSubAgent(data, opts = {}) {
      const id = data.agentId || `sa-${Date.now()}`;
      if (this.subagents.has(id)) return this.subagents.get(id);

      const restore = Boolean(opts.restore);
      const name = LO.nameForAgent(id, data.name);
      const room = LO.roomForTool(data.tool) || 'engineering';
      const agent = new LO.SubAgent(id, name, data.task, room, LO.lookForAgent(id));

      this.subagents.set(id, agent);
      this.assignToSlot(agent, room, restore ? 'auto' : null);

      if (restore) {
        // Resumed agent: already on the floor, mid-task, no entrance animation.
        agent.state = 'work';
        agent.frame = 'type';
        if (data.tool) agent.startWork(data.tool, data.summary || data.tool);
        if (data.since) agent.startTime = data.since * 1000;
        LO.ui.updateStaffCount(this.residents.length + this.subagents.size);
        return agent;
      }

      const roomIdx = LO.FLOOR_INDEX[room] !== undefined ? LO.FLOOR_INDEX[room] : 2;
      const floorLabel = LO.FLOORS[roomIdx]?.label || room;
      LO.ui.addTicker('✨', `Karyawan baru: <b>${name}</b> join ke <i>${floorLabel}</i>`);
      LO.ui.appendChatMessage('Sistem', 'Kantor', `✨ Karyawan baru <b>${name}</b> bergabung ke divisi <i>${floorLabel}</i>`, '✨', '#1f9d5c');
      LO.ui.updateStaffCount(this.residents.length + this.subagents.size);

      // Boss Lami delegates
      this.lami.setEmote('📢', 2.0);
      this.lami.setBubble(`Tolong bantu: ${data.task || 'tugas baru'} ya! 📋`, 3.5);

      if (this.isPhoneMode()) this.focusAgent(agent);
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
            LO.ui.updateStaffCount(this.residents.length + this.subagents.size);
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
      const toWorld = (clientX, clientY) => this.screenToWorld(clientX, clientY);

      const activateAt = (clientX, clientY) => {
        const p = toWorld(clientX, clientY);
        if (!p) return false;
        const canvasX = p.x;
        const canvasY = p.y;

        // 1. Check if any character was clicked (2D top-down hit-test)
        const hitRadius = 18 / Math.max(0.15, this.view.zoom || 1);
        const peers = this.peerAgents ? [...this.peerAgents.values()] : [];
        const allAgents = [this.lami, ...peers, ...this.subagents.values(), ...this.residents];
        if (this.deliveryRider) allAgents.push(this.deliveryRider);
        for (const a of allAgents) {
          const col = a.col !== undefined ? a.col : a.x;
          const row = a.row !== undefined ? a.row : a.y;
          const ax = (col + 0.5) * LO.TILE_SIZE;
          const ay = (row + 0.5) * LO.TILE_SIZE;
          const dist = Math.hypot(canvasX - ax, canvasY - (ay - 4));
          if (dist < hitRadius) {
            LO.ui.showCard(a);
            LO.audio.pop();
            this.focusAgent(a);
            return true;
          }
        }

        // 2. Interactive Props in 2D Plane
        const props = LO.PROPS || {};

        // a. Context Window Trashcan (Boss Office, from LO.PROPS.trashcan)
        const tc = props.trashcan;
        if (tc) {
          const tcCenterX = (tc.x + (tc.w || 1) / 2) * LO.TILE_SIZE;
          const tcCenterY = (tc.y + (tc.h || 1) / 2) * LO.TILE_SIZE;
          if (Math.hypot(canvasX - tcCenterX, canvasY - tcCenterY) < hitRadius) {
            LO.audio.pop();
            LO.ui.showContextModal();
            return true;
          }
        }

        // b. Multi-Mode Whiteboard (Meeting Room, 5x2 tiles hanging on the north wall)
        const wb = props.whiteboard;
        if (wb) {
          const pad = 4 / Math.max(0.15, this.view.zoom || 1);
          const wbX1 = wb.x * LO.TILE_SIZE - pad;
          const wbX2 = (wb.x + (wb.w || 5)) * LO.TILE_SIZE + pad;
          const wbY1 = wb.y * LO.TILE_SIZE - 16;
          const wbY2 = (wb.y + (wb.h || 2)) * LO.TILE_SIZE + 16;
          if (canvasX >= wbX1 && canvasX <= wbX2 && canvasY >= wbY1 && canvasY <= wbY2) {
            LO.audio.pop();
            this.whiteboardMode = (this.whiteboardMode + 1) % 3;
            const tabs = ['tasks', 'tools', 'team'];
            LO.ui.showWhiteboardModal(tabs[this.whiteboardMode]);
            return true;
          }
        }

        // c. Water Cooler / Pantry Dispenser (from LO.PROPS.watercooler)
        const wc = props.watercooler || props.waterCooler;
        if (wc) {
          const wcCenterX = (wc.x + (wc.w || 1) / 2) * LO.TILE_SIZE;
          const wcCenterY = (wc.y + (wc.h || 1) / 2) * LO.TILE_SIZE;
          if (Math.hypot(canvasX - wcCenterX, canvasY - wcCenterY) < hitRadius) {
            LO.audio.pop();
            LO.ui.addTicker('💧', 'Dispenser air galon Pantry: <i>Gluk... gluk... gluk...</i> Segar!');
            LO.ui.appendChatMessage('Pantry', 'Fasilitas', 'Segarnya air galon sejuk di Pantry! Rehidrasi dulu 💧✨', '💧', '#3498db');
            return true;
          }
        }

        // Click outside any interactive target
        LO.ui.hideCard();
        return false;
      };

      if (!this.canvas || !this.canvas.addEventListener) return;

      // Unified pointer handling: tap selects, drag pans (phone camera mode),
      // two fingers pinch-zoom, double-tap resets to fit-width.
      const pointers = new Map();
      let dragStart = null;
      let pinchStart = null;
      let moved = false;
      let lastTap = 0;

      const localPoint = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top, clientX: e.clientX, clientY: e.clientY };
      };

      const onPointerDown = (e) => {
        const p = localPoint(e);
        pointers.set(e.pointerId, p);
        moved = false;
        if (pointers.size === 1) {
          dragStart = { ...p, time: Date.now(), camX: this.camera.x, camY: this.camera.y };
        } else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinchStart = {
            distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            zoom: this.camera.zoom || this.view.zoom,
            midX: (a.x + b.x) / 2,
            midY: (a.y + b.y) / 2
          };
        }
      };

      const onPointerMove = (e) => {
        if (!pointers.has(e.pointerId)) return;
        const p = localPoint(e);
        pointers.set(e.pointerId, p);

        if (pointers.size >= 2 && pinchStart) {
          const [a, b] = [...pointers.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          if (!this.isPhoneMode()) return;
          this.setCameraZoom(this.camera.zoom * (distance / pinchStart.distance));
          moved = true;
          return;
        }

        if (!dragStart) return;
        const dx = p.x - dragStart.x;
        const dy = p.y - dragStart.y;
        if (Math.hypot(dx, dy) > (LO.TAP_MAX_DISTANCE || 8)) moved = true;
        if (moved && this.isPhoneMode()) {
          const zoom = this.view.zoom || 1;
          this.camera.x = dragStart.camX - dx / zoom;
          this.camera.y = dragStart.camY - dy / zoom;
          this.camera.targetX = this.camera.x;
          this.camera.targetY = this.camera.y;
        }
      };

      const onPointerUp = (e) => {
        const start = dragStart;
        const gesture = start
          ? LO.classifyPointerGesture(
            { x: start.x, y: start.y },
            { x: (pointers.get(e.pointerId) || start).x, y: (pointers.get(e.pointerId) || start).y },
            Date.now() - start.time
          )
          : 'cancel';

        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (pointers.size === 0) dragStart = null;

        if (moved || gesture !== 'tap') return;

        const now = Date.now();
        if (this.isPhoneMode() && now - lastTap < 320) {
          lastTap = 0;
          this.resetCamera();
          return;
        }
        lastTap = now;

        const p = localPoint(e);
        activateAt(p.clientX, p.clientY);
      };

      this.canvas.addEventListener('pointerdown', onPointerDown);
      this.canvas.addEventListener('pointermove', onPointerMove);
      this.canvas.addEventListener('pointerup', onPointerUp);
      this.canvas.addEventListener('pointercancel', (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (pointers.size === 0) dragStart = null;
      });

      // Mouse fallback for environments without Pointer Events.
      if (typeof window !== 'undefined' && !window.PointerEvent) {
        this.canvas.addEventListener('click', (e) => {
          if (moved) { moved = false; return; }
          activateAt(e.clientX, e.clientY);
        });
      }

      // Keep the view correct across resizes, rotations and drawer changes.
      const onResize = () => this.recompute();
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
      }

      // Android soft keyboard shrinks the *visual* viewport without firing a
      // window resize. Mirror its height into --vvh (consumed by #stage) so the
      // chat input stays visible and the canvas re-fits.
      this.setupVisualViewport();
      this.refreshMode();
    }

    setupVisualViewport() {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv || typeof document === 'undefined') return;

      let timer = null;
      const apply = () => {
        const root = document.documentElement;
        if (!root || !root.style) return;
        // Only shrink: a browser toolbar retracting (vv taller than layout)
        // must not blow the shell past the layout viewport.
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
        root.style.setProperty('--vv-offset', `${Math.round(vv.offsetTop)}px`);
      };
      const onVV = () => {
        apply();
        clearTimeout(timer);
        timer = setTimeout(() => this.recompute(), 150); // debounce camera jitter
      };

      apply();
      vv.addEventListener('resize', onVV);
      vv.addEventListener('scroll', onVV);
    }

    // Re-evaluate mode, view transform and camera bounds after a viewport change.
    recompute() {
      // Breakpoints may change --stage-top-gap (e.g. resizing into phone width).
      this._topGap = null;
      this.refreshMode();
      this.reclampCamera();
    }

    // ---- Camera Mode (phones / touch-first devices) ----
    // Driven purely by device capability + viewport width; the old ?vertical=1
    // override letterboxed the whole app, so it was removed.
    isPhoneMode() {
      return LO.isPhoneMode();
    }

    refreshMode() {
      const next = this.isPhoneMode();
      if (next !== this.phoneMode) {
        this.phoneMode = next;
        if (next) this.resetCamera();
      }
      return this.phoneMode;
    }

    resetCamera() {
      this.camera.x = LO.CONTENT_W / 2 / LO.TILE_SIZE;
      this.camera.y = LO.CONTENT_H / 2 / LO.TILE_SIZE;
      this.camera.zoom = null; // null = fill width
      this.camera.targetX = this.camera.x;
      this.camera.targetY = this.camera.y;
    }

    setCameraZoom(zoom) {
      const availW = (this.view && this.view.availW) || LO.CONTENT_W;
      const availH = (this.view && this.view.availH) || LO.CONTENT_H;
      const base = Math.max(
        availW / LO.CONTENT_W,
        (availH / LO.CONTENT_H) * (LO.PHONE_HEIGHT_FILL || 0.72)
      );
      const floor = base * (LO.PHONE_ZOOM_MIN || 0.6);
      const ceil = base * (LO.PHONE_ZOOM_MAX || 3);
      this.camera.zoom = Math.min(ceil, Math.max(floor, zoom || base));
    }

    reclampCamera() {
      if (!this.camera) return;
      this.camera.x = Math.min(LO.GRID_COLS, Math.max(0, this.camera.x));
      this.camera.y = Math.min(LO.GRID_ROWS, Math.max(0, this.camera.y));
      this.camera.targetX = Math.min(LO.GRID_COLS, Math.max(0, this.camera.targetX));
      this.camera.targetY = Math.min(LO.GRID_ROWS, Math.max(0, this.camera.targetY));
    }

    setDrawerOpen(open, widthPx) {
      const width = open ? Math.max(0, widthPx || 0) : 0;
      // Phones keep the drawer as a full overlay; only desktop shrinks.
      this.drawerInset = this.isPhoneMode() ? 0 : width;
    }

    // Empty band reserved at the top of the canvas (below the HUD). Read from
    // --stage-top-gap so CSS stays the single source of truth; cached because
    // getComputedStyle is expensive and only changes on a resize.
    stageTopGap() {
      if (this._topGap !== undefined && this._topGap !== null) return this._topGap;
      let gap = 0;
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        try {
          const raw = getComputedStyle(document.documentElement).getPropertyValue('--stage-top-gap');
          gap = parseFloat(raw) || 0;
        } catch (e) { gap = 0; }
      }
      this._topGap = gap;
      return gap;
    }

    // The band is expressed in CSS pixels against the shell. If the canvas still
    // hugs the top of the viewport it needs the inset; if CSS already pushed it
    // below the band (the normal case) no extra inset is applied.
    topInsetFor(canvasHeight) {
      const gap = this.stageTopGap();
      if (gap <= 0) return 0;
      const viewportTop = this.canvasViewportTop();
      const remaining = Math.max(0, gap - viewportTop);
      return Math.min(remaining, canvasHeight);
    }

    // Viewport-relative top of the canvas. The shell never scrolls (overflow is
    // hidden), so rect.top and clientTop agree; rect is preferred because it is
    // also what screenToWorld uses, keeping the two in the same frame.
    canvasViewportTop() {
      if (!this.canvas) return 0;
      if (typeof this.canvas.getBoundingClientRect === 'function') {
        try {
          const rect = this.canvas.getBoundingClientRect();
          if (rect && typeof rect.top === 'number') return rect.top;
        } catch (e) { /* fall through */ }
      }
      return typeof this.canvas.clientTop === 'number' ? this.canvas.clientTop : 0;
    }

    computeView(width, height) {
      const w = width || (this.canvas ? this.canvas.clientWidth : LO.CONTENT_W);
      const h = height || (this.canvas ? this.canvas.clientHeight : LO.CONTENT_H);
      const cameraMode = this.isPhoneMode();
      const view = LO.computeViewParams({
        width: w,
        height: h,
        contentW: LO.CONTENT_W,
        contentH: LO.CONTENT_H,
        drawerInset: this.drawerInset || 0,
        topInset: this.topInsetFor(h),
        cameraMode,
        zoom: cameraMode ? (this.camera.zoom || null) : null,
        focusX: this.camera.x,
        focusY: this.camera.y
      });

      // Keep legacy fields in sync for anything that still reads them.
      this.scale = view.zoom;
      this.offsetX = view.offsetX;
      this.offsetY = view.offsetY;
      this.view = view;
      return view;
    }

    screenToWorld(clientX, clientY) {
      if (!this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return null;
      const rect = this.canvas.getBoundingClientRect();
      // Strictly derive the transform from the current box: a cached view from an
      // earlier layout (or another size) would map taps to the wrong tile.
      const width = (rect && rect.width) || this.canvas.clientWidth || LO.CONTENT_W;
      const height = (rect && rect.height) || this.canvas.clientHeight || LO.CONTENT_H;
      const view = this.computeView(width, height);
      const zoom = view.zoom || 1;
      return {
        x: (clientX - rect.left - view.offsetX) / zoom,
        y: (clientY - rect.top - view.offsetY) / zoom
      };
    }

    worldToScreen(worldX, worldY) {
      let width = this.canvas && this.canvas.clientWidth;
      let height = this.canvas && this.canvas.clientHeight;
      if ((!width || !height) && this.canvas && typeof this.canvas.getBoundingClientRect === 'function') {
        const rect = this.canvas.getBoundingClientRect();
        width = width || (rect && rect.width);
        height = height || (rect && rect.height);
      }
      const view = this.computeView(width || LO.CONTENT_W, height || LO.CONTENT_H);
      const zoom = view.zoom || 1;
      return {
        x: worldX * zoom + view.offsetX,
        y: worldY * zoom + view.offsetY
      };
    }

    // Focus the camera on an agent (phone mode only; desktop stays fit-all).
    focusAgent(agentOrId) {
      if (!this.isPhoneMode()) return false;
      let agent = agentOrId;
      if (typeof agentOrId === 'string') {
        agent = this.subagents.get(agentOrId) ||
          this.residents.find((r) => r.id === agentOrId) ||
          (this.lami && this.lami.id === agentOrId ? this.lami : null);
      }
      if (!agent) return false;
      const col = agent.col !== undefined ? agent.col : agent.x;
      const row = agent.row !== undefined ? agent.row : agent.y;
      if (col === undefined || row === undefined) return false;
      const dz = LO.CAMERA_DEADZONE || 0;
      if (Math.abs(this.camera.targetX - col) < dz && Math.abs(this.camera.targetY - row) < dz) {
        return true;
      }
      this.camera.targetX = col;
      this.camera.targetY = row;
      return true;
    }

    focusBoss() {
      const seat = LO.LAMI_SEAT || { col: 14, row: 6 };
      if (!this.isPhoneMode()) return false;
      this.camera.targetX = seat.col;
      this.camera.targetY = seat.row;
      return true;
    }

    updateCamera(dt) {
      const cam = this.camera;
      if (!cam) return;
      const ease = Math.min(1, (LO.CAMERA_LERP || 8) * dt);
      cam.x += (cam.targetX - cam.x) * ease;
      cam.y += (cam.targetY - cam.y) * ease;
      this.reclampCamera();
    }

    // ---- A2A peer agents (Hermes sidecars on the LAN) ----
    // Each peer is shown as a character standing in its specialty room.
    applyA2APeers(peers) {
      if (!Array.isArray(peers)) return;
      this.a2aPeers = peers;
      if (!this.peerAgents) this.peerAgents = new Map();

      const seen = new Set();
      for (const peer of peers) {
        if (!peer || !peer.id) continue;
        seen.add(peer.id);
        let agent = this.peerAgents.get(peer.id);

        if (!agent) {
          const seat = this.peerSeat(peer.room, this.peerAgents.size);
          agent = new LO.PeerAgent(
            `a2a-${peer.id}`,
            peer.name || peer.id,
            peer.hostname || `A2A · ${peer.host || ''}`,
            peer.room || 'engineering'
          );
          agent.peerId = peer.id;
          agent.icon = peer.icon || '🔗';
          agent.color = peer.color || '#94a3b8';
          agent.col = seat.col;
          agent.row = seat.row;
          agent.targetCol = seat.col;
          agent.targetRow = seat.row;
          agent.homeCol = seat.col;
          agent.homeRow = seat.row;
          this.peerAgents.set(peer.id, agent);
        }

        agent.online = Boolean(peer.online);
        agent.latencyMs = peer.latency_ms;
        agent.endpoint = peer.endpoint || '';
        agent.hostname = peer.hostname || agent.hostname;
      }

      for (const [id, agent] of [...this.peerAgents]) {
        if (!seen.has(id)) {
          this.peerAgents.delete(id);
        }
      }
    }

    // Pick a standing spot for a peer inside its room, avoiding staff slots.
    peerSeat(roomId, index) {
      const room = LO.ROOMS[roomId] || LO.ROOMS.engineering;
      const b = room.bounds;
      const used = new Set();
      const slots = LO.SLOTS[roomId] || [];
      for (const s of slots) used.add(`${s.col},${s.row}`);
      const occupied = new Set();
      for (const a of [...this.residents, ...this.peerAgents.values()]) {
        if (a && a.col !== undefined) occupied.add(`${Math.round(a.col)},${Math.round(a.row)}`);
      }
      // Walk a small spiral outward from the room's doorway-facing centre.
      const cx = Math.round((b.x1 + b.x2) / 2);
      const cy = Math.round((b.y1 + b.y2) / 2);
      const offsets = [
        [0, 2], [2, 2], [-2, 2], [2, -2], [-2, -2],
        [0, -2], [4, 2], [-4, 2], [4, -2], [-4, -2], [0, 4], [0, -4]
      ];
      for (let i = 0; i < offsets.length; i++) {
        const [dx, dy] = offsets[(i + (index || 0)) % offsets.length];
        const col = Math.min(b.x2, Math.max(b.x1, cx + dx));
        const row = Math.min(b.y2, Math.max(b.y1, cy + dy));
        const key = `${col},${row}`;
        if (used.has(key) || occupied.has(key)) continue;
        if (!this.isWalkable(col, row)) continue;
        return { col, row };
      }
      return { col: cx, row: cy };
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

    // ---- Server-authoritative world (live mode) ------------------------------
    // The server simulates every character; this page interpolates between the
    // 5 Hz frames so motion stays smooth at 60 fps without a local simulation.
    findChar(id) {
      if (!id) return null;
      if (id === 'lami') return this.lami;
      if (id === 'mochi') return this.cat;
      if (id === 'delivery-rider') return this.deliveryRider;
      if (this.subagents.has(id)) return this.subagents.get(id);
      return this.residents.find((r) => r.id === id) || null;
    }

    // Rebuild the non-resident cast from a world frame so a later visitor sees
    // whoever is actually working (Hermes sub-agents and A2A peers), not an
    // empty office. Peers are simulated like sub-agents, so they must be
    // created here too - otherwise their positions arrive but nobody draws them.
    syncWorldAgents(frame) {
      if (!Array.isArray(frame.chars)) return;
      const live = new Set();
      for (const c of frame.chars) {
        if (c.kind !== 'sub' && c.kind !== 'peer') continue;
        live.add(c.id);
        if (this.subagents.has(c.id)) continue;
        const agent = this.spawnSubAgent({
          agentId: c.id,
          name: c.name,
          task: c.task,
          tool: c.tool,
          summary: c.summary
        }, { restore: true });
        agent.kind = c.kind;
        if (c.tool) agent.startWork(c.tool, c.summary || c.tool);
        agent.reported = false;
      }
      for (const id of [...this.subagents.keys()]) {
        if (live.has(id)) continue;
        this.freeSlot(this.subagents.get(id));
        this.subagents.delete(id);
      }
      if (LO.ui && LO.ui.updateStaffCount) {
        LO.ui.updateStaffCount(this.residents.length + this.subagents.size);
      }
    }

    applyWorld(frame) {
      if (!frame || !Array.isArray(frame.chars)) return;
      this.pendingWorld = frame;
      // Honest status straight from the server (live / slow / idle).
      if (frame.status && typeof frame.status === 'object') {
        this.worldStatus = frame.status;
        if (LO.ui && typeof LO.ui.setOfficeStatus === 'function') {
          LO.ui.setOfficeStatus(frame.status);
        }
      }
      if (frame.roster && LO.ui && typeof LO.ui.setRoster === 'function') {
        LO.ui.setRoster(frame.roster);
      }
      this.lastWorldAt = Date.now();
      this.syncWorldAgents(frame);

      // The very first frame after a page load must place everyone at the real
      // position. Easing from the spawn point (desk / doorway) made every
      // refresh look like the office had been reset, then everything slid back
      // into place over the next second.
      const firstFrame = !this.worldPlaced;

      // Characters: remember the target, let applyWorldTargets() ease toward it.
      for (const data of frame.chars) {
        const char = this.findChar(data.id);
        if (!char) continue;
        this.worldTargets.set(data.id, data);
        if (firstFrame || char.col === undefined) {
          char.col = data.col;
          char.row = data.row;
        }
        char.facing = data.facing || char.facing;
        char.state = data.state || char.state;
        char.frame = data.frame || char.frame;
        char.bubble = data.bubble || null;
        char.bubbleTimer = data.bubble ? 1 : 0;
        char.emote = data.emote || null;
        char.emoteTimer = data.emote ? 1 : 0;
        char.carriedItem = data.carry || null;
        if (data.kind && char.kind === undefined) char.kind = data.kind;
        if (data.routineState) char.routineState = data.routineState;
        if (data.task) char.task = data.task;
        if (data.name && char.name !== data.name) char.name = data.name;
        if (data.slot) char.assignedSlot = data.slot;
      }

      // The delivery rider is created and destroyed by the server's random events.
      if (frame.rider && !this.deliveryRider) {
        this.deliveryRider = new LO.DeliveryRider();
      } else if (!frame.rider && this.deliveryRider) {
        this.deliveryRider = null;
      }
      if (frame.cat) {
        const cat = this.cat;
        cat.col = frame.cat.col;
        cat.row = frame.cat.row;
        cat.state = frame.cat.state || cat.state;
        cat.facing = frame.cat.facing || cat.facing;
        cat.bubble = frame.cat.bubble || null;
      }
      if (frame.flags) {
        if (typeof frame.flags.pizzaTimer === 'number') this.pizzaEventTimer = frame.flags.pizzaTimer;
        if (typeof frame.flags.flickerTimer === 'number') this.flickerTimer = frame.flags.flickerTimer;
      }
      this.worldPlaced = true;
    }

    // Ease every character toward its last server position (~120 ms catch-up).
    applyWorldTargets(dt) {
      if (!this.worldTargets.size) return;
      const ease = Math.min(1, dt * 9);
      for (const [id, target] of this.worldTargets) {
        const char = this.findChar(id);
        if (!char) continue;
        const dc = target.col - char.col;
        const dr = target.row - char.row;
        if (Math.abs(dc) < 0.01 && Math.abs(dr) < 0.01) {
          char.col = target.col;
          char.row = target.row;
        } else if (Math.hypot(dc, dr) > 8) {
          char.col = target.col; // a fresh page or a jumped character: no slide
          char.row = target.row;
        } else {
          char.col += dc * ease;
          char.row += dr * ease;
        }
        // Timers count down locally so bubbles fade between 5 Hz frames.
        if (char.bubbleTimer > 0) char.bubbleTimer -= dt;
        if (char.emoteTimer > 0) char.emoteTimer -= dt;
      }
      if (this.cat && this.cat.bubbleTimer > 0) this.cat.bubbleTimer -= dt;
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
      this.updateCamera(dt);
      this.world.update(dt);
      this.elevator.update(dt, this);

      // Live mode: the server owns positions, routines and narration. Animating
      // them here as well would double-bill every event and let the tabs drift.
      if (this.simulatedExternally) {
        this.applyWorldTargets(dt);
        return;
      }

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

      // 2D Character Elastic Separation Physics (Social Anti-Overlap in Hallways & Doors)
      const allLiving = [this.lami, ...this.residents, ...this.subagents.values()].filter(c => c && c.state !== 'spawn');
      for (let i = 0; i < allLiving.length; i++) {
        const c1 = allLiving[i];
        for (let j = i + 1; j < allLiving.length; j++) {
          const c2 = allLiving[j];
          const sepDx = c2.col - c1.col;
          const sepDy = c2.row - c1.row;
          const sepDist = Math.hypot(sepDx, sepDy);
          const minSeparation = 0.72; // tile clearance
          if (sepDist < minSeparation && sepDist > 0.001) {
            const overlap = (minSeparation - sepDist) * 0.5;
            const nx = sepDx / sepDist;
            const ny = sepDy / sepDist;
            // Push characters apart along normal to prevent visual stacking
            c1.col -= nx * overlap * dt * 4.5;
            c1.row -= ny * overlap * dt * 4.5;
            c2.col += nx * overlap * dt * 4.5;
            c2.row += ny * overlap * dt * 4.5;
          }
        }
      }

      // Check lively coworker hallway encounters, meetings & greetings
      this.updateSocials(dt);
    }

    updateSocials(dt) {
      const all = [this.lami, ...this.residents, ...this.subagents.values()].filter(c => c && c.state !== 'spawn');
      for (const a of all) {
        if (a.socialCooldown > 0) a.socialCooldown -= dt;
      }

      for (let i = 0; i < all.length; i++) {
        const a = all[i];
        if (a.socialCooldown > 0 || a.pauseTimer > 0 || a.state === 'reporting') continue;

        for (let j = i + 1; j < all.length; j++) {
          const b = all[j];
          if (b.socialCooldown > 0 || b.pauseTimer > 0 || b.state === 'reporting') continue;

          const dist = Math.hypot(a.col - b.col, a.row - b.row);
          if (dist < 2.2) {
            a.pauseTimer = 1.0;
            b.pauseTimer = 1.0;
            a.socialCooldown = 20.0 + Math.random() * 8;
            b.socialCooldown = 20.0 + Math.random() * 8;

            const dx = b.col - a.col;
            const dy = b.row - a.row;
            if (Math.abs(dx) >= Math.abs(dy)) {
              a.facing = dx > 0 ? 'E' : 'W';
              b.facing = dx > 0 ? 'W' : 'E';
            } else {
              a.facing = dy > 0 ? 'S' : 'N';
              b.facing = dy > 0 ? 'N' : 'S';
            }

            // Room-aware contextual encounters (bounds come from config.js)
            const inMeeting = (LO.roomAt(a.col, a.row) === 'meeting') || (LO.roomAt(b.col, b.row) === 'meeting');
            const inPantry = (LO.roomAt(a.col, a.row) === 'pantry') || (LO.roomAt(b.col, b.row) === 'pantry');

            const isBoss = a.id === 'lami' || b.id === 'lami';
            if (isBoss) {
              const boss = a.id === 'lami' ? a : b;
              const worker = a.id === 'lami' ? b : a;
              worker.setEmote('👑', 2.5);
              worker.setBubble('Pagi Boss Lami! ✨', 3.0);
              boss.setEmote('🌟', 2.5);
              boss.setBubble('Semangat kerjanya ya! 👍', 3.0);
            } else if (inMeeting) {
              const meetingDialogues = [
                ['Bahas sprint goal minggu ini 🎯', 'Siap, fitur utama udah on-track! 🚀'],
                ['Whiteboard-nya rame banget 📊', 'Banyak ide keren nih! 💡'],
                ['Sprint review jam berapa ya? 📋', 'Setelah lunch break nanti 👍'],
                ['Desain arsitektur baru udah fix 📐', 'Mantap, gass koding! ✨']
              ];
              const d = meetingDialogues[Math.floor(Math.random() * meetingDialogues.length)];
              a.setEmote('📊', 2.5);
              a.setBubble(d[0], 3.0);
              b.setEmote('💡', 2.5);
              b.setBubble(d[1], 3.0);
            } else if (inPantry) {
              const pantryDialogues = [
                ['Seduh kopi arabika dulu ☕', 'Bagi gulanya dong kak! 🍵'],
                ['Kulkas ada cemilan baru 🍩', 'Wah mantap buat nemenin koding! 🎉'],
                ['Istirahat sejenak mata lelah 😴', 'Yuk jalan santai dikit biar seger 🚶']
              ];
              const d = pantryDialogues[Math.floor(Math.random() * pantryDialogues.length)];
              a.setEmote('☕', 2.5);
              a.setBubble(d[0], 3.0);
              b.setEmote('😊', 2.5);
              b.setBubble(d[1], 3.0);
            } else {
              const dialogues = [
                ['Halo Kak! Semangat ya! 👋', 'Halo juga! Gass koding! 🚀'],
                ['Mau ke pantry nih ☕', 'Nitip kopi hangat dong! 🍵'],
                ['PR-nya udah di-approve ya 👍', 'Mantap, siap deploy! ✨'],
                ['Ada ide fitur baru nih 💡', 'Bahas di meeting nanti! 📋'],
                ['Bentar lagi jam makan siang 🍕', 'Wah martabak enak nih! 🎉']
              ];
              const d = dialogues[Math.floor(Math.random() * dialogues.length)];
              a.setEmote('👋', 2.5);
              a.setBubble(d[0], 3.0);
              b.setEmote('😊', 2.5);
              b.setBubble(d[1], 3.0);
            }
            break;
          }
        }
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

      // Confine drawing to the canvas box. With a top band reserved, a centred
      // fit can sit slightly above the canvas, so clip instead of leaking over
      // the HUD band.
      this.ctx.beginPath();
      this.ctx.rect(0, 0, w, h);
      this.ctx.clip();

      // Background fill across the whole canvas so the drawer inset area is
      // never a black gap.
      this.ctx.fillStyle = '#141226';
      this.ctx.fillRect(0, 0, w, h);

      const view = this.computeView(w, h);
      this.ctx.translate(view.offsetX, view.offsetY);
      this.ctx.scale(view.zoom, view.zoom);

      // 1. World Floor, Walls & Stationary Props
      this.world.render(this.ctx);

      // 2. Elevator Adapter (no-op in 2D mode)
      if (this.elevator && this.elevator.render) {
        this.elevator.render(this.ctx);
      }

      // 3. Characters sorted by 2D Y-Depth (Painter's Algorithm)
      const peers = this.peerAgents ? [...this.peerAgents.values()] : [];
      const allChars = [this.lami, ...this.residents, ...peers, ...this.subagents.values(), this.cat];
      if (this.deliveryRider) allChars.push(this.deliveryRider);
      allChars.sort((a, b) => a.getDepth() - b.getDepth());

      for (const c of allChars) {
        c.render(this.ctx);
      }

      // 4. Wall tops, doorway frames & wall decor painted over characters so a
      //    room reads as an enclosed box (architect-plan / dollhouse depth).
      if (this.world.renderOverlay) this.world.renderOverlay(this.ctx);

      this.ctx.restore();
    }
  }

  LO.Office = Office;
})();
