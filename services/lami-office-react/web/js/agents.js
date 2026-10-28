/* Lami's AI Office — Isometric 2.5D Characters (Happy Mall Story Style) */
(function () {
  const LO = window.LO;

  const IDLE_CHATS = {
    boss: [
      'Target hari ini aman! 👑',
      'Ngopi dulu bentar ☕',
      'Semangat semuanya! 💪',
      'Kerjaan rapi, mantap 👍',
      'Kantor makin produktif ✨'
    ],
    research: [
      'Dapet data bagus nih 📚',
      'Lagi baca referensi 🔍',
      'Analisis tren kelar 💡',
      'Risetnya menarik banget ✨'
    ],
    coding: [
      'Kodingan lancar jaya 💻',
      'Fix bug beres 👍',
      'Deploy aman tanpa error 🚀',
      'Kode bersih & rapi ✨'
    ],
    meeting: [
      'Diskusi seru banget 📋',
      'Roadmap sudah jelas 📝',
      'Bagi tugas beres 🤝'
    ],
    pantry: [
      'Ngopi dulu bentar ☕',
      'Donatnya enak banget 🍩',
      'Santai sejenak di sofa 🛋️',
      'Rehat dulu biar seger ✨'
    ],
    server: [
      'Server adem ayem 🖥️',
      'Lampu hijau semua 🟢',
      'Koneksi lancar pol ⚡'
    ]
  };

  class Character {
    constructor(id, name, role, look, floor = 0, col = 3, row = 2) {
      this.id = id;
      this.name = name;
      this.role = role;
      this.look = look;
      this.floor = 0;
      this.col = col;
      this.row = row;
      this.targetFloor = 0;
      this.targetCol = col;
      this.targetRow = row;

      this.facing = 'S'; // 'S' | 'N' | 'E' | 'W'
      this.state = 'idle'; // idle | walk | type | reporting | work
      this.speed = 2.4; // tiles per second
      this.sprites = LO.getCharacterSprites(this.look);

      // 2D Continuous Kinematics & Mario-Style Physics Engine
      this.vx = 0;              // continuous horizontal velocity (tiles/sec)
      this.vy = 0;              // continuous vertical velocity (tiles/sec)
      this.ax = 0;              // steering acceleration
      this.ay = 0;
      this.friction = 0.82;     // floor friction dampening
      this.maxSpeed = 2.4;      // maximum speed limit
      this.accel = 16.0;        // responsive steering acceleration force
      this.radius = 0.36;       // physical circle collision radius (tile units)

      // Mario-Style Bounciness & Micro-Physics
      this.bounceTimer = 0;
      this.bounceHeight = 2.4;  // pixel height for retro walk hop
      this.squashX = 1.0;       // horizontal squash scale factor
      this.squashY = 1.0;       // vertical stretch scale factor
      this.dustTimer = 0;

      this.frame = 'idle';
      this.animTimer = 0;
      this.walkStep = false;
      this.path = []; // orthogonal waypoints [{x, y}, ...]

      this.emote = null;
      this.emoteTimer = 0;
      this.bubble = null;
      this.bubbleTimer = 0;

      this.carriedItem = null; // 'paper'
      this.particles = [];

      this.idleActionTimer = Math.random() * 5 + 3;
      this.assignedSlot = null;
      this.pauseTimer = 0;
      this.socialCooldown = Math.random() * 8 + 4;
      this.workCycleTimer = Math.random() * 4 + 2;
      this.workCycleMode = 'type';
    }

    getDepth() {
      // 2D Top-down Y-depth sorting (Painter's algorithm): lower row rendered in front
      return (this.row || 0) * 100 + (this.col || 0) * 0.1;
    }

    setEmote(icon, duration = 3.0) {
      this.emote = icon;
      this.emoteTimer = duration;
    }

    setBubble(text, duration = 4.0) {
      if (!text) {
        this.bubble = null;
        return;
      }
      this.bubble = text.length > 32 ? text.substring(0, 31) + '…' : text;
      this.bubbleTimer = duration;
    }

    addParticle(text, icon = '🪙', color = '#ffd25e') {
      const pos = LO.isoToScreen(this.col, this.row, this.floor);
      this.particles.push({
        text, icon, color,
        x: pos.x,
        y: pos.y - 20,
        vy: -22,
        alpha: 1.0,
        life: 1.2
      });
    }

    navigateTo(destCol, destRow, office) {
      this.targetCol = destCol;
      this.targetRow = destRow;
      this.pathGoal = { x: destCol, y: destRow };

      const sx = Math.round(this.col);
      const sy = Math.round(this.row);
      const gx = Math.round(destCol);
      const gy = Math.round(destRow);

      if (sx === gx && sy === gy) {
        this.col = destCol;
        this.row = destRow;
        this.path = [];
        this.state = 'walk';
        this.onArrived();
        return;
      }

      const sim = office || window.LO?.office;
      const p = sim && sim.findPath ? sim.findPath({ x: sx, y: sy }, { x: gx, y: gy }) : null;
      if (p && p.length > 1) {
        // Drop the tile the character already stands on.
        this.path = p.slice(1);
        // navigateTo is also used mid 'reporting'; keep that semantic state.
        if (this.state !== 'reporting') this.state = 'walk';
        return;
      }

      // No reachable route: never clip through walls as a fallback. Complete
      // the navigation in place so the agent's state machine cannot hang.
      this.path = [];
      this.state = 'work';
      this.onArrived();
    }

    update(dt, office) {
      this.animTimer += dt;

      // Update Timers
      if (this.emoteTimer > 0) {
        this.emoteTimer -= dt;
        if (this.emoteTimer <= 0) this.emote = null;
      }
      if (this.bubbleTimer > 0) {
        this.bubbleTimer -= dt;
        if (this.bubbleTimer <= 0) this.bubble = null;
      }

      // Update floating particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.y += p.vy * dt;
        p.alpha = Math.max(0, p.life / 1.2);
        if (p.life <= 0) this.particles.splice(i, 1);
      }

      // Movement & Navigation
      this.updateMovement(dt, office);
    }

    updateMovement(dt, office) {
      // Single-floor 2D top-down world: normalize
      if (this.floor !== 0 || this.targetFloor !== 0) {
        this.floor = 0;
        this.targetFloor = 0;
      }

      // If paused for social encounter or greeting, smoothly brake walking velocity
      if (this.pauseTimer > 0) {
        this.pauseTimer -= dt;
        this.vx *= 0.5;
        this.vy *= 0.5;
        this.squashX = 1.0;
        this.squashY = 1.0;
        this.frame = 'idle';
        return;
      }

      // 0. Destination changed while walking (routine switch, new tool, ...):
      // recompute immediately instead of finishing the stale path.
      if (this.pathGoal &&
          (this.pathGoal.x !== this.targetCol || this.pathGoal.y !== this.targetRow)) {
        this.navigateTo(this.targetCol, this.targetRow, office);
        if (!this.path || this.path.length === 0) return;
      }

      // 1. Follow waypoint path with Continuous Kinematic Physics & Steering
      if (this.path && this.path.length > 0) {
        if (this.state !== 'reporting') this.state = 'walk';
        const targetNode = this.path[0];
        let dx = targetNode.x - this.col;
        let dy = targetNode.y - this.row;
        let dist = Math.hypot(dx, dy);

        // Update facing direction based on primary travel axis
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (Math.abs(dx) > 0.001) this.facing = dx > 0 ? 'E' : 'W';
        } else {
          if (Math.abs(dy) > 0.001) this.facing = dy > 0 ? 'S' : 'N';
        }

        // Steering Force (Seek & Arrive dampening):
        // When approaching waypoint or final destination, smoothly decelerate to eliminate jerky snaps.
        const arriveThreshold = 0.5;
        const targetSpeed = dist < arriveThreshold ? Math.max(0.6, this.maxSpeed * (dist / arriveThreshold)) : this.maxSpeed;
        const desiredVx = (dx / (dist || 1)) * targetSpeed;
        const desiredVy = (dy / (dist || 1)) * targetSpeed;

        // Apply acceleration towards desired velocity
        this.ax = (desiredVx - this.vx) * this.accel;
        this.ay = (desiredVy - this.vy) * this.accel;

        this.vx += this.ax * dt;
        this.vy += this.ay * dt;

        // Apply floor friction drag
        this.vx *= Math.pow(this.friction, dt * 60);
        this.vy *= Math.pow(this.friction, dt * 60);

        // Speed clamping
        const curSpeed = Math.hypot(this.vx, this.vy);
        if (curSpeed > this.maxSpeed) {
          this.vx = (this.vx / curSpeed) * this.maxSpeed;
          this.vy = (this.vy / curSpeed) * this.maxSpeed;
        }

        // Continuous Circle-to-AABB Wall Sliding Collision Resolution:
        const collisionGrid = office ? office.collisionGrid : (window.LO?.office?.collisionGrid);
        let nextCol = this.col + this.vx * dt;
        let nextRow = this.row + this.vy * dt;

        if (collisionGrid) {
          const rows = collisionGrid.length;
          const cols = collisionGrid[0].length;
          const isSolidTile = (c, r) => {
            const cx = Math.floor(c);
            const cy = Math.floor(r);
            if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return true;
            return collisionGrid[cy][cx] === 1;
          };

          // Slide along vertical wall (check X movement)
          const colCheck = this.vx > 0 ? (nextCol + this.radius) : (nextCol - this.radius);
          if (isSolidTile(colCheck, this.row)) {
            this.vx = 0;
            nextCol = this.col;
          }

          // Slide along horizontal wall (check Y movement)
          const rowCheck = this.vy > 0 ? (nextRow + this.radius) : (nextRow - this.radius);
          if (isSolidTile(this.col, rowCheck)) {
            this.vy = 0;
            nextRow = this.row;
          }
        }

        this.col = nextCol;
        this.row = nextRow;

        // Mario-Style Bounciness step cycle & squash-and-stretch
        this.bounceTimer += dt * 14;
        const bouncePhase = Math.sin(this.bounceTimer);
        if (bouncePhase > 0.6) {
          this.squashX = 0.94;
          this.squashY = 1.08;
        } else if (bouncePhase < -0.3) {
          this.squashX = 1.08;
          this.squashY = 0.92;
        } else {
          this.squashX = 1.0;
          this.squashY = 1.0;
        }

        // Walk dust puff emission
        this.dustTimer += dt;
        if (this.dustTimer > 0.35) {
          this.dustTimer = 0;
          const screenPos = LO.isoToScreen(this.col, this.row, this.floor);
          this.particles.push({
            text: '',
            icon: '💨',
            color: '#d6c2a8',
            x: screenPos.x + (Math.random() * 4 - 2),
            y: screenPos.y + 1,
            vy: -8,
            alpha: 0.6,
            life: 0.3
          });
        }

        if (this.animTimer > 0.15) {
          this.animTimer = 0;
          this.walkStep = !this.walkStep;
        }
        this.frame = this.walkStep ? 'walk' : 'idle';

        // Check waypoint completion
        const remainingDist = Math.hypot(targetNode.x - this.col, targetNode.y - this.row);
        if (remainingDist <= Math.hypot(this.vx * dt, this.vy * dt) || remainingDist < 0.14) {
          this.col = targetNode.x;
          this.row = targetNode.y;
          this.path.shift();

          if (this.path.length === 0) {
            this.vx = 0;
            this.vy = 0;
            this.squashX = 1.0;
            this.squashY = 1.0;
            if (Math.round(this.targetCol) === targetNode.x &&
                Math.round(this.targetRow) === targetNode.y) {
              this.col = this.targetCol;
              this.row = this.targetRow;
            } else {
              this.targetCol = this.col;
              this.targetRow = this.row;
            }
            this.pathGoal = { x: this.targetCol, y: this.targetRow };
            if (this.state === 'walk' || this.state === 'reporting') this.onArrived();
          }
        }
        return;
      }

      // 2. Check if destination was updated without navigateTo
      const dTarget = Math.hypot(this.targetCol - this.col, this.targetRow - this.row);
      if (dTarget > 0.2) {
        this.navigateTo(this.targetCol, this.targetRow, office);
        return;
      }

      // 3. At destination: smooth deceleration & resting idle
      this.vx *= 0.5;
      this.vy *= 0.5;
      if (Math.hypot(this.vx, this.vy) < 0.05) {
        this.vx = 0;
        this.vy = 0;
        this.col = this.targetCol;
        this.row = this.targetRow;
      }
      this.squashX = 1.0;
      this.squashY = 1.0;
      this.bounceTimer = 0;
      if (this.state === 'walk') {
        this.onArrived();
      }
      this.updateIdleState(dt);
    }

    walkTowards(destCol, destRow, dt) {
      this.state = 'walk';
      const dCol = destCol - this.col;
      const dRow = destRow - this.row;
      const dist = Math.hypot(dCol, dRow);

      // Determine cardinal facing for 2D top-down movement
      if (Math.abs(dCol) >= Math.abs(dRow)) {
        if (Math.abs(dCol) > 0.001) this.facing = dCol > 0 ? 'E' : 'W';
      } else {
        if (Math.abs(dRow) > 0.001) this.facing = dRow > 0 ? 'S' : 'N';
      }

      const step = Math.min(this.speed * dt, dist);
      this.col += (dCol / dist) * step;
      this.row += (dRow / dist) * step;

      // Retro RPG walk bounce & step animation
      this.animTimer += dt;
      if (this.animTimer > 0.15) {
        this.animTimer = 0;
        this.walkStep = !this.walkStep;
      }
      this.frame = this.walkStep ? 'walk' : 'idle';
    }

    onArrived() {
      this.state = 'work';
      this.frame = 'idle';
      if (this.assignedSlot && this.assignedSlot.facing) {
        this.facing = this.assignedSlot.facing;
      }
    }

    updateIdleState(dt) {
      if (this.state === 'work') {
        this.workCycleTimer -= dt;
        if (this.workCycleTimer <= 0) {
          const roll = Math.random();
          if (roll < 0.60) {
            this.workCycleMode = 'type';
            this.workCycleTimer = Math.random() * 5 + 3;
          } else if (roll < 0.85) {
            this.workCycleMode = 'think';
            this.workCycleTimer = Math.random() * 3 + 2;
            if (Math.random() < 0.4 && !this.bubble) {
              const thoughts = ['💡', '💭', '⚙️', '📝', '⚡'];
              this.setEmote(thoughts[Math.floor(Math.random() * thoughts.length)], 2.5);
            }
          } else {
            this.workCycleMode = 'drink';
            this.workCycleTimer = Math.random() * 2.5 + 2;
            if (Math.random() < 0.5 && !this.bubble) {
              this.setEmote('☕', 2.0);
            }
          }
        }

        if (this.workCycleMode === 'type') {
          this.frame = Math.sin(Date.now() / 240) > 0 ? 'type' : 'idle';
        } else if (this.workCycleMode === 'think') {
          this.frame = Math.sin(Date.now() / 600) > 0.8 ? 'blink' : 'idle';
        } else if (this.workCycleMode === 'drink') {
          this.frame = 'drink';
        } else {
          this.frame = 'idle';
        }
        return;
      }

      // Casual idle behaviors & Indonesian chats
      this.idleActionTimer -= dt;
      if (this.idleActionTimer <= 0) {
        this.idleActionTimer = Math.random() * 6 + 4;
        const roll = Math.random();
        if (roll < 0.2) {
          this.frame = 'blink';
        } else if (roll < 0.5 && !this.bubble) {
          const roomKey = this.assignedSlot ? this.assignedSlot.roomId : (this.id === 'lami' ? 'boss' : 'pantry');
          const list = IDLE_CHATS[roomKey] || IDLE_CHATS.pantry;
          if (list && list.length > 0 && Math.random() < 0.35) {
            const chat = list[Math.floor(Math.random() * list.length)];
            this.setBubble(chat, 3.5);
          }
        } else {
          this.frame = 'idle';
        }
      }
    }

    render(ctx) {
      const pos = LO.isoToScreen(this.col, this.row, this.floor);
      const sprGroup = this.sprites[this.facing] || this.sprites.SE || this.sprites.right;
      const img = sprGroup[this.frame] || sprGroup.idle;

      // Mario-Style Bounciness & Squash/Stretch Dynamics
      const isMoving = Math.hypot(this.vx || 0, this.vy || 0) > 0.08;
      const hopY = isMoving ? Math.abs(Math.sin(this.bounceTimer || 0)) * (this.bounceHeight || 2.2) : 0;
      const sx = this.squashX || 1.0;
      const sy = this.squashY || 1.0;

      // Dynamic Character Shadow (contracts slightly on hop)
      ctx.fillStyle = isMoving ? 'rgba(58, 40, 56, 0.20)' : 'rgba(58, 40, 56, 0.28)';
      ctx.beginPath();
      const shadowRadius = isMoving ? Math.max(3.8, 6 - hopY * 0.7) : 6;
      ctx.ellipse(pos.x, pos.y + 1, shadowRadius, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw Chibi Sprite with Mario Squash & Stretch transform
      ctx.save();
      ctx.translate(pos.x, pos.y + 2 - hopY);
      ctx.scale(sx, sy);
      const halfW = Math.floor(this.sprites.w / 2);
      ctx.drawImage(img, -halfW, -this.sprites.h);

      // Carried Paper Item (inside sprite transform)
      if (this.carriedItem === 'paper') {
        const paper = LO.getPaperSprite();
        const paperX = (this.facing === 'E' || this.facing === 'S' || this.facing === 'SE') ? halfW - 3 : -halfW - 2;
        ctx.drawImage(paper, paperX, -this.sprites.h + 9);
      }
      ctx.restore();

      const py = Math.floor(pos.y - this.sprites.h + 2 - hopY);

      // Emote & Speech Bubble
      if (this.emote) this.renderEmote(ctx, pos.x, py);
      if (this.bubble) this.renderBubble(ctx, pos.x, py);

      // Render Floating Particles
      for (const p of this.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(`${p.icon} ${p.text}`, p.x, p.y);
        ctx.restore();
      }
    }

    renderEmote(ctx, x, py) {
      const ey = py - 8 + Math.sin(Date.now() / 200) * 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, ey, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.emote, x, ey + 1);
    }

    renderBubble(ctx, x, py) {
      ctx.font = '6px "Pixelify Sans", system-ui, sans-serif';
      const text = this.bubble;
      const metrics = ctx.measureText(text);
      const bw = Math.max(26, metrics.width + 8);
      const bh = 13;
      let bx = Math.floor(x - bw / 2);
      bx = Math.max(8, Math.min(LO.CONTENT_W - bw - 8, bx));

      // Jika karakter terlalu dekat ke atas (lantai Boss), posisikan balon di samping/bawah agar tidak menutupi HUD
      let by = Math.floor(py - bh - 5);
      const isTop = by < 34;
      if (isTop) {
        by = Math.floor(py + 20); // tampil di bawah karakter
      }

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 1;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

      // Tail (menghubungkan balon dengan karakter)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (!isTop) {
        ctx.moveTo(x - 2, by + bh);
        ctx.lineTo(x, by + bh + 3);
        ctx.lineTo(x + 2, by + bh);
      } else {
        ctx.moveTo(x - 2, by);
        ctx.lineTo(x, by - 3);
        ctx.lineTo(x + 2, by);
      }
      ctx.fill();

      ctx.fillStyle = '#3a2838';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + bw / 2, by + bh / 2);
    }
  }

  // ---- Resident Agent with Active Routines (Happy Mall Story Style) ----
  class ResidentAgent extends Character {
    constructor(id, name, role, room, slotIndex, look) {
      const floorIdx = LO.FLOOR_INDEX[room];
      const slot = LO.SLOTS[room][slotIndex] || { col: 3, row: 2, facing: 'SE' };
      super(id, name, role, look, floorIdx, slot.col, slot.row);

      this.homeRoom = room;
      this.homeFloor = floorIdx;
      this.homeSlotIndex = slotIndex;
      this.homeSlot = slot;
      this.assignedSlot = { roomId: room, index: slotIndex, type: slot.type, facing: slot.facing };
      this.facing = slot.facing || 'SE';

      this.task = 'Bekerja di Meja';
      this.currentTool = this.getDefaultTool();
      this.startTime = Date.now();

      // Routine state machine: 'desk' | 'moving_to_activity' | 'in_activity' | 'returning_to_desk'
      this.routineState = 'desk';
      this.currentRoutine = null;

      // Stagger routines so employees don't all leave at once
      const staggerMap = {
        'res-rina': 5 + Math.random() * 4,
        'res-dodo': 12 + Math.random() * 4,
        'res-sekar': 19 + Math.random() * 4,
        'res-bima': 26 + Math.random() * 4
      };
      this.routineTimer = staggerMap[id] || (Math.random() * 12 + 8);
      this.activityDuration = 0;
    }

    getDefaultTool() {
      switch (this.homeRoom) {
        case 'research': return 'search';
        case 'coding': return 'code';
        case 'meeting': return 'plan';
        case 'server': return 'terminal';
        default: return 'task';
      }
    }

    getRoutines() {
      const personal = this.getPersonalRoutines();
      if (personal && personal.length > 0) return personal;
      return (LO.ROOM_ROUTINES && LO.ROOM_ROUTINES[this.homeRoom]) || [];
    }

    getPersonalRoutines() {
      switch (this.id) {
        case 'res-rina':
          return [
            {
              id: 'corkboard',
              name: 'Cek Papan Catatan',
              floor: 0,
              col: 32,
              row: 6,
              facing: 'N',
              duration: 7,
              startBubble: 'Cek hipotesis di papan 📌',
              arriveBubble: 'Data riset sinkron semua 💡',
              arriveEmote: '💡',
              leaveBubble: 'Lanjut analisis di meja 📚',
              task: 'Analisis Papan Catatan'
            },
            {
              id: 'stretch',
              name: 'Peregangan Jendela',
              floor: 0,
              col: 54,
              row: 17,
              facing: 'E',
              duration: 6,
              startBubble: 'Peregangan badan dulu~ ✨',
              arriveBubble: 'Udara sejuk bikin fokus 🌿',
              arriveEmote: '✨',
              leaveBubble: 'Badan seger kembali! 💪',
              task: 'Peregangan & Istirahat Mata'
            },
            {
              id: 'reading',
              name: 'Membaca Jurnal',
              floor: 0,
              col: 33,
              row: 17,
              facing: 'W',
              duration: 7,
              startBubble: 'Buka referensi jurnal 📖',
              arriveBubble: 'Metode baru menarik banget 🔍',
              arriveEmote: '📚',
              leaveBubble: 'Terapkan ke riset tim ✨',
              task: 'Membaca Jurnal Ilmiah'
            },
            {
              id: 'coffee_pantry',
              name: 'Ngopi di Pantry',
              floor: 0,
              col: 62,
              row: 30,
              facing: 'N',
              duration: 8,
              startBubble: 'Turun ke pantry, ngopi dulu 🍵',
              arriveBubble: 'Racik matcha latte hangat 🍵✨',
              arriveEmote: '☕',
              leaveBubble: 'Kembali ke Lab Riset! 🚀',
              task: 'Rehat Matcha di Pantry'
            },
            {
              id: 'consult_boss',
              name: 'Lapor Boss Lami',
              floor: 0,
              col: 14,
              row: 9,
              facing: 'N',
              duration: 6.5,
              startBubble: 'Naik ke kantor Boss Lami 👑',
              arriveBubble: 'Lapor temuan riset, Boss! 📑',
              arriveEmote: '✨',
              leaveBubble: 'Siap laksanakan arahan Boss! 👍',
              task: 'Konsultasi ke Boss Lami',
              onArrive: (agent, office) => {
                if (office && office.lami) office.lami.cheer();
              }
            }
          ];

        case 'res-dodo':
          return [
            {
              id: 'server_mini',
              name: 'Cek Mini Server',
              floor: 0,
              col: 20,
              row: 28,
              facing: 'N',
              duration: 7,
              startBubble: 'Cek build runner lokal ⚙️',
              arriveBubble: 'Build hijau, test pass 100%! 🟢',
              arriveEmote: '⚙️',
              leaveBubble: 'Lanjut coding modul baru 💻',
              task: 'Inspeksi Build Runner'
            },
            {
              id: 'arch_board',
              name: 'Desain Skema',
              floor: 0,
              col: 24,
              row: 37,
              facing: 'E',
              duration: 7,
              startBubble: 'Petakan skema arsitektur 📐',
              arriveBubble: 'Arsitektur baru lebih ngebut ⚡',
              arriveEmote: '💡',
              leaveBubble: 'Implementasi ke kode! 🚀',
              task: 'Desain Skema Arsitektur'
            },
            {
              id: 'peer_review',
              name: 'Code Review Tim',
              floor: 0,
              col: 4,
              row: 31,
              facing: 'W',
              duration: 6,
              startBubble: 'Cek PR kodingan teman 👀',
              arriveBubble: 'Kode bersih, approve merge! 👍',
              arriveEmote: '✅',
              leaveBubble: 'Balik ke terminal ⌨️',
              task: 'Code Review Tim'
            },
            {
              id: 'pantry_snack',
              name: 'Cari Cemilan',
              floor: 0,
              col: 77,
              row: 32,
              facing: 'N',
              duration: 8,
              startBubble: 'Turun cari cemilan koding 🍫',
              arriveBubble: 'Kopi hitam + biskuit mantap ☕',
              arriveEmote: '☕',
              leaveBubble: 'Bahan bakar koding ready! ⚡',
              task: 'Ambil Kopi di Pantry'
            }
          ];

        case 'res-sekar':
          return [
            {
              id: 'agenda_board',
              name: 'Update Whiteboard',
              floor: 0,
              col: 33,
              row: 26,
              facing: 'N',
              duration: 7,
              startBubble: 'Tulis agenda rapat baru 📝',
              arriveBubble: 'Jadwal meeting sinkron semua 🗓️',
              arriveEmote: '📋',
              leaveBubble: 'Rapikan notulensi rapat ✨',
              task: 'Update Papan Agenda'
            },
            {
              id: 'podium',
              name: 'Presentasi Progres',
              floor: 0,
              col: 52,
              row: 31,
              facing: 'W',
              duration: 6.5,
              startBubble: 'Siapkan materi presentasi 📊',
              arriveBubble: 'Target kuartal ini on-track! 🎯',
              arriveEmote: '📢',
              leaveBubble: 'Sesi tanya jawab kelar 🤝',
              task: 'Presentasi Progres Tim'
            },
            {
              id: 'report_boss',
              name: 'Lapor Boss Lami',
              floor: 0,
              col: 14,
              row: 9,
              facing: 'N',
              duration: 6.5,
              startBubble: 'Bawa berkas ke Boss Lami 👑',
              arriveBubble: 'Ini jadwal evaluasi, Boss! 📑',
              arriveEmote: '❤️',
              leaveBubble: 'Boss setuju, kembali ke 2F ✨',
              task: 'Lapor Dokumen ke Boss',
              onArrive: (agent, office) => {
                if (office && office.lami) {
                  office.lami.setBubble('Terima kasih Sekar! ✨', 3.0);
                  office.lami.setEmote('❤️', 2.5);
                }
              }
            },
            {
              id: 'lounge_relax',
              name: 'Santai di Sofa',
              floor: 0,
              col: 67,
              row: 36,
              facing: 'N',
              duration: 8,
              startBubble: 'Turun santai di sofa lounge 🛋️',
              arriveBubble: 'Teh hangat + puk-puk Mochi 🐱☕',
              arriveEmote: '☕',
              leaveBubble: 'Kembali segar berenergi! 🌸',
              task: 'Santai di Sofa Lounge',
              onArrive: (agent, office) => {
                if (office && office.cat) office.cat.setBubble('Purrr... 🐾', 3.0);
              }
            }
          ];

        case 'res-bima':
          return [
            {
              id: 'patrol_rack_a',
              name: 'Inspeksi Rack A',
              floor: 0,
              col: 64,
              row: 11,
              facing: 'N',
              duration: 7,
              startBubble: 'Patroli suhu server Rack A ❄️',
              arriveBubble: 'Suhu 17°C, airflow optimal 🟢',
              arriveEmote: '🖥️',
              leaveBubble: 'Lanjut cek Rack B 🚶‍♂️',
              task: 'Inspeksi Suhu Server'
            },
            {
              id: 'patrol_rack_b',
              name: 'Inspeksi Rack B',
              floor: 0,
              col: 70,
              row: 11,
              facing: 'N',
              duration: 7,
              startBubble: 'Cek traffic jaringan Rack B ⚡',
              arriveBubble: 'Throughput 10 Gbps ngebut pol! 🚀',
              arriveEmote: '⚡',
              leaveBubble: 'Jaringan prima tanpa drop 👍',
              task: 'Monitoring Traffic Network'
            },
            {
              id: 'cables_patch',
              name: 'Cek Kabel Jaringan',
              floor: 0,
              col: 76,
              row: 11,
              facing: 'N',
              duration: 6,
              startBubble: 'Cek kerapian kabel switch 🔧',
              arriveBubble: 'Kabel fiber optik rapi jali 👍',
              arriveEmote: '🔧',
              leaveBubble: 'Balik ke terminal server 🖥️',
              task: 'Cek Pengkabelan Fiber'
            },
            {
              id: 'coffee_break',
              name: 'Ngopi ke Pantry',
              floor: 0,
              col: 63,
              row: 30,
              facing: 'N',
              duration: 8,
              startBubble: 'Naik dari basement, ngopi ☕',
              arriveBubble: 'Hirup udara segar & kopi panas 🌿☕',
              arriveEmote: '☕',
              leaveBubble: 'Server aman, kembali ke B1! 🖥️',
              task: 'Ngopi di 1F Pantry'
            }
          ];

        default:
          return [];
      }
    }

    update(dt, office) {
      super.update(dt, office);

      switch (this.routineState) {
        case 'desk': {
          this.routineTimer -= dt;
          if (this.routineTimer <= 0) {
            const routines = this.getRoutines();
            if (routines.length > 0) {
              const r = routines[Math.floor(Math.random() * routines.length)];
              this.startRoutine(r);
            } else {
              this.routineTimer = Math.random() * 15 + 10;
            }
          }
          break;
        }

        case 'in_activity': {
          this.activityDuration -= dt;
          if (this.activityDuration <= 0) {
            this.returnToDesk();
          }
          break;
        }
      }
    }

    updateIdleState(dt) {
      if (this.routineState === 'in_activity') {
        if (this.currentRoutine) {
          const id = this.currentRoutine.id;
          if (id === 'coffee_pantry' || id === 'coffee_break' || id === 'lounge_relax') {
            this.frame = 'drink';
            return;
          }
          if (id === 'server_mini' || id === 'patrol_rack_a' || id === 'patrol_rack_b' || id === 'cables_patch' || id === 'agenda_board') {
            this.frame = Math.sin(Date.now() / 280) > 0 ? 'type' : 'idle';
            return;
          }
        }
        this.frame = Math.sin(Date.now() / 600) > 0.85 ? 'blink' : 'idle';
        return;
      }
      super.updateIdleState(dt);
    }

    startRoutine(routine) {
      this.currentRoutine = routine;
      this.routineState = 'moving_to_activity';
      this.targetFloor = routine.floor;
      this.targetCol = routine.col;
      this.targetRow = routine.row;
      this.task = routine.name;
      if (routine.startBubble) {
        this.setBubble(routine.startBubble, 3.5);
        if (Math.random() < 0.55 && window.LO?.ui?.appendChatMessage) {
          LO.ui.appendChatMessage(this.name, this.role, routine.startBubble, LO.iconForTool(this.currentTool), '#8e44ad');
        }
      }
    }

    returnToDesk() {
      if (this.currentRoutine && this.currentRoutine.leaveBubble) {
        this.setBubble(this.currentRoutine.leaveBubble, 2.8);
      }
      this.routineState = 'returning_to_desk';
      this.targetFloor = this.homeFloor;
      this.targetCol = this.homeSlot.col;
      this.targetRow = this.homeSlot.row;
      this.task = 'Kembali ke Meja';
    }

    onArrived() {
      if (this.routineState === 'moving_to_activity' && this.currentRoutine) {
        this.routineState = 'in_activity';
        this.state = 'work';
        this.frame = 'idle';
        this.facing = this.currentRoutine.facing || 'SE';
        this.activityDuration = this.currentRoutine.duration || 7;
        this.task = this.currentRoutine.task || this.currentRoutine.name;

        if (this.currentRoutine.arriveBubble) {
          this.setBubble(this.currentRoutine.arriveBubble, 3.8);
        }
        if (this.currentRoutine.arriveEmote) {
          this.setEmote(this.currentRoutine.arriveEmote, 3.0);
        }
        if (this.currentRoutine.onArrive) {
          this.currentRoutine.onArrive(this, window.LO?.office || {});
        }
        return;
      }

      if (this.routineState === 'returning_to_desk') {
        this.routineState = 'desk';
        this.currentRoutine = null;
        this.state = 'work';
        this.frame = 'idle';
        this.facing = this.homeSlot.facing || 'SE';
        this.task = 'Bekerja di Meja';
        this.currentTool = this.getDefaultTool();
        this.routineTimer = Math.random() * 16 + 14; // 14 to 30 detik bekerja di meja
        return;
      }

      super.onArrived();
    }

    interruptForWork(tool, summary) {
      this.currentTool = tool;
      this.task = summary || `Mengerjakan ${tool}`;
      this.setBubble(`${LO.iconForTool(tool)} ${summary || tool}`, 4.0);

      if (this.routineState !== 'desk') {
        this.returnToDesk();
      } else {
        this.state = 'work';
        this.frame = 'type';
      }
    }

    finishWork(ok = true) {
      this.frame = 'idle';
      if (ok) {
        this.setEmote('✅', 2.5);
        this.setBubble('Beres! 👍', 2.5);
        this.addParticle('+1 ⭐', '⭐', '#2ecc71');
      } else {
        this.setEmote('💦', 2.5);
        this.setBubble('Ada kendala... ⚠️', 2.5);
      }
      this.routineTimer = Math.random() * 8 + 6;
    }
  }

  // ---- Boss Lami with Office Patrol Routines ----
  class Lami extends Character {
    constructor() {
      super('lami', 'Boss Lami', 'CEO & Master AI', LO.LAMI_LOOK, 0, LO.LAMI_SEAT.col, LO.LAMI_SEAT.row);
      this.homeSeat = LO.LAMI_SEAT;
      this.facing = LO.LAMI_SEAT.facing || 'SW';
      this.task = 'CEO & Master AI';
      this.currentTool = 'delegate';

      this.routineState = 'desk';
      this.currentRoutine = null;
      this.routineTimer = Math.random() * 10 + 16; // 16 - 26 detik sebelum patroli pertama
      this.activityDuration = 0;
    }

    getRoutines() {
      return [
        {
          id: 'window',
          name: 'Menatap Kota',
          floor: 0,
          col: 24,
          row: 5,
          facing: 'N',
          duration: 7,
          startBubble: 'Lihat pemandangan kota dulu 🏙️',
          arriveBubble: 'Kota tampak indah dari atas ✨',
          arriveEmote: '🌟',
          leaveBubble: 'Lanjut pantau target kantor 👑',
          task: 'Menatap Pemandangan Kota'
        },
        {
          id: 'bonsai',
          name: 'Merawat Bonsai',
          floor: 0,
          col: 5,
          row: 5,
          facing: 'W',
          duration: 6,
          startBubble: 'Cek tanaman bonsai kantor 🌱',
          arriveBubble: 'Bonsai makin asri & subur 🌿',
          arriveEmote: '🌿',
          leaveBubble: 'Kantor hijau bikin pikiran jernih ✨',
          task: 'Merawat Bonsai Kantor'
        },
        {
          id: 'balcony',
          name: 'Pantau Gedung',
          floor: 0,
          col: 4,
          row: 17,
          facing: 'W',
          duration: 6.5,
          startBubble: 'Tinjau suasana kerja dari balkon 👑',
          arriveBubble: 'Semua divisi sangat produktif! 👍',
          arriveEmote: '✨',
          leaveBubble: 'Lami Corp siap terbang tinggi 🚀',
          task: 'Memantau Operasional Gedung'
        },
        {
          id: 'pantry_visit',
          name: 'Sapa Tim di Pantry',
          floor: 0,
          col: 76,
          row: 30,
          facing: 'N',
          duration: 8,
          startBubble: 'Turun ke Pantry sapa tim ☕',
          arriveBubble: 'Halo semuanya, ngopi bareng! ☕✨',
          arriveEmote: '👑',
          leaveBubble: 'Semangat terus kerjanya! 💪',
          task: 'Menyapa Tim & Rehat di 1F',
          onArrive: (lami, office) => {
            if (office && office.cat) office.cat.setBubble('Meong Boss! 🐾', 3.0);
          }
        }
      ];
    }

    update(dt, office) {
      super.update(dt, office);

      switch (this.routineState) {
        case 'desk': {
          this.routineTimer -= dt;
          if (this.routineTimer <= 0) {
            const list = this.getRoutines();
            const r = list[Math.floor(Math.random() * list.length)];
            this.startRoutine(r);
          }
          break;
        }

        case 'in_activity': {
          this.activityDuration -= dt;
          if (this.activityDuration <= 0) {
            this.returnToDesk();
          }
          break;
        }
      }
    }

    updateIdleState(dt) {
      if (this.routineState === 'in_activity') {
        if (this.currentRoutine) {
          const id = this.currentRoutine.id;
          if (id === 'coffee_pantry' || id === 'coffee_break' || id === 'lounge_relax') {
            this.frame = 'drink';
            return;
          }
          if (id === 'server_mini' || id === 'patrol_rack_a' || id === 'patrol_rack_b' || id === 'cables_patch' || id === 'agenda_board') {
            this.frame = Math.sin(Date.now() / 280) > 0 ? 'type' : 'idle';
            return;
          }
        }
        this.frame = Math.sin(Date.now() / 600) > 0.85 ? 'blink' : 'idle';
        return;
      }
      super.updateIdleState(dt);
    }

    startRoutine(routine) {
      this.currentRoutine = routine;
      this.routineState = 'moving_to_activity';
      this.targetFloor = routine.floor;
      this.targetCol = routine.col;
      this.targetRow = routine.row;
      this.task = routine.name;
      if (routine.startBubble) {
        this.setBubble(routine.startBubble, 3.5);
        if (Math.random() < 0.6 && window.LO?.ui?.appendChatMessage) {
          LO.ui.appendChatMessage('Boss Lami', 'CEO', routine.startBubble, '👑', '#ffd25e');
        }
      }
    }

    returnToDesk() {
      if (this.currentRoutine && this.currentRoutine.leaveBubble) {
        this.setBubble(this.currentRoutine.leaveBubble, 2.8);
      }
      this.routineState = 'returning_to_desk';
      this.targetFloor = this.homeSeat.floor;
      this.targetCol = this.homeSeat.col;
      this.targetRow = this.homeSeat.row;
      this.task = 'CEO & Master AI';
    }

    onArrived() {
      if (this.routineState === 'moving_to_activity' && this.currentRoutine) {
        this.routineState = 'in_activity';
        this.state = 'work';
        this.frame = 'idle';
        this.facing = this.currentRoutine.facing || 'SW';
        this.activityDuration = this.currentRoutine.duration || 7;
        this.task = this.currentRoutine.task || this.currentRoutine.name;

        if (this.currentRoutine.arriveBubble) this.setBubble(this.currentRoutine.arriveBubble, 3.5);
        if (this.currentRoutine.arriveEmote) this.setEmote(this.currentRoutine.arriveEmote, 3.0);
        if (this.currentRoutine.onArrive) this.currentRoutine.onArrive(this, window.LO?.office || {});
        return;
      }

      if (this.routineState === 'returning_to_desk') {
        this.routineState = 'desk';
        this.currentRoutine = null;
        this.state = 'work';
        this.facing = this.homeSeat.facing || 'SW';
        this.task = 'CEO & Master AI';
        this.routineTimer = Math.random() * 18 + 18; // 18 - 36 detik di meja
        return;
      }

      super.onArrived();
    }

    cheer() {
      this.setEmote('🎉', 3.5);
      this.setBubble('Kerja bagus! Mantap 👍', 3.0);
      this.frame = 'happy';
      this.addParticle('+1 ⭐', '🪙', '#ffd25e');
      LO.audio.coin();
      setTimeout(() => { this.frame = 'idle'; }, 2000);
    }

    panic() {
      this.setEmote('💦', 3.0);
      this.setBubble('Waduh, ada error! 💦', 3.0);
      this.frame = 'blink';
      LO.audio.error();
    }

    think() {
      this.setEmote('💡', 4.0);
      this.setBubble('Bentar, lagi mikir ide... 💡', 3.0);
      if (this.routineState !== 'desk') {
        this.returnToDesk();
      }
    }
  }

  // ---- Dynamic Sub-Agent ----
  class SubAgent extends Character {
    constructor(id, name, task, room = 'coding') {
      const look = LO.randomLook();
      super(id, name, 'Sub-Agent', look, LO.GROUND, LO.DOOR_COL, LO.DOOR_ROW);
      this.task = task || 'Tugas Baru';
      this.room = room;
      this.currentTool = null;
      this.currentSummary = '';
      this.startTime = Date.now();
      this.state = 'spawn';
      this.targetFloor = LO.FLOOR_INDEX[room] !== undefined ? LO.FLOOR_INDEX[room] : LO.FLOOR_INDEX.coding;
      this.role = LO.ROLE_BY_ROOM[room] || 'Specialist';

      this.setEmote('✨', 2.5);
      this.setBubble('Siap tugas baru! 💼', 3.0);
      LO.audio.spawn();
    }

    onArrived() {
      if (this.state === 'reporting') {
        this.state = 'report_done';
        this.carriedItem = 'paper';
        this.facing = 'N';
        const office = this.reportOffice || window.LO?.office;
        if (office && office.lami) this.deliverReport(office.lami);
        this.reportOffice = null;

        // Report delivered: unwind in the pantry before heading home.
        if (office && office.assignToSlot) {
          office.assignToSlot(this, 'pantry');
          this.state = 'walk';
          this.setBubble('Istirahat dulu di pantry ☕', 3.0);
          this.navigateTo(this.targetCol, this.targetRow, office);
        } else {
          this.state = 'work';
        }
        return;
      }

      this.state = 'work';
      this.frame = 'idle';
      if (this.assignedSlot && this.assignedSlot.facing) {
        this.facing = this.assignedSlot.facing;
      }
      if (!this.bubble) {
        this.setBubble('Mulai kerja... ⚡', 2.5);
      }
    }

    startWork(tool, summary) {
      this.currentTool = tool;
      this.currentSummary = summary;
      this.setBubble(`${LO.iconForTool(tool)} ${summary}`, 5.0);
      if (this.state === 'work') {
        this.frame = 'type';
      }
    }

    endWork(ok) {
      if (ok) {
        this.setEmote('✅', 2.0);
        this.setBubble('Tugas beres! ✅', 2.5);
      } else {
        this.setEmote('💦', 3.0);
        this.setBubble('Maaf, ada kendala 💦', 3.0);
        LO.audio.error();
      }
      this.currentTool = null;
    }

    reportToLami(office) {
      this.carriedItem = 'paper';
      this.targetFloor = 0;
      this.state = 'reporting';
      this.setBubble('Lapor Boss, selesai! 📄', 4.0);
      const spot = (LO.SLOTS.boss && LO.SLOTS.boss[0]) || { x: 11, y: 8 };
      this.reportOffice = office || window.LO?.office;
      this.navigateTo(spot.x, spot.y, this.reportOffice);
    }

    deliverReport(lami) {
      this.carriedItem = null;
      this.facing = 'N';
      this.setEmote('❤️', 3.0);
      this.setBubble('Ini hasilnya, Boss! ✨', 3.0);
      this.addParticle('+1 Tugas', '✅', '#2ecc71');
      lami.cheer();
    }
  }

  // ---- Mochi the Cat (2D Pantry Lounge) ----
  class MochiCat {
    constructor() {
      this.floor = 0; // single-floor 2D office
      this.col = 72;
      this.row = 36;
      this.targetCol = 72;
      this.targetRow = 36;
      this.facing = 'W';
      this.state = 'sit';
      this.sprites = LO.getCatSprites();
      this.timer = Math.random() * 5 + 3;
      this.meowTimer = Math.random() * 16 + 10;
      this.bubble = null;
      this.bubbleTimer = 0;
    }

    getDepth() {
      return (this.row || 0) * 100 + (this.col || 0) * 0.1;
    }

    setBubble(text, duration = 3.0) {
      this.bubble = text;
      this.bubbleTimer = duration;
    }

    update(dt, office) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = Math.random() * 6 + 3;
        const roll = Math.random();
        if (roll < 0.45) {
          this.state = 'walk';
          this.targetCol = 70 + Math.random() * 8;   // open lounge floor
          this.targetRow = 30 + Math.random() * 8;
          this.facing = this.targetCol > this.col ? 'E' : 'W';
        } else if (roll < 0.8) {
          this.state = 'sit';
        } else {
          this.state = 'idle';
        }
      }

      this.meowTimer -= dt;
      if (this.meowTimer <= 0) {
        this.meowTimer = Math.random() * 18 + 12;

        // Cek jika ada orang di dekat Mochi di Pantry (Lantai Dasar / Pantry)
        let someoneNear = false;
        if (office) {
          const pantryChars = [
            office.lami,
            ...office.residents,
            ...office.subagents.values()
          ].filter((c) => c && Math.hypot(c.col - this.col, c.row - this.row) < 2.5);

          for (const c of pantryChars) {
            const dist = Math.hypot(this.col - c.col, this.row - c.row);
            if (dist < 1.6) {
              someoneNear = true;
              break;
            }
          }
        }

        if (someoneNear) {
          const friendlyMeows = ['Purrr... 🐾', 'Ngeong! ✨', 'Suka dielus 🐱', 'Mau cemilan 🐟'];
          this.setBubble(friendlyMeows[Math.floor(Math.random() * friendlyMeows.length)], 3.0);
        } else {
          const meows = ['Meong~ 🐾', 'Purrr... 💤', 'Mau ikan 🐟', 'Ngeong! ✨'];
          this.setBubble(meows[Math.floor(Math.random() * meows.length)], 3.0);
        }
      }

      if (this.bubbleTimer > 0) {
        this.bubbleTimer -= dt;
        if (this.bubbleTimer <= 0) this.bubble = null;
      }

      if (this.state === 'walk') {
        const dCol = this.targetCol - this.col;
        const dRow = this.targetRow - this.row;
        const dist = Math.hypot(dCol, dRow);
        if (dist <= 0.1) {
          this.col = this.targetCol;
          this.row = this.targetRow;
          this.state = 'sit';
        } else {
          const step = Math.min(1.2 * dt, dist);
          this.col += (dCol / dist) * step;
          this.row += (dRow / dist) * step;
        }
      }
    }

    render(ctx) {
      const pos = LO.isoToScreen(this.col, this.row, this.floor);
      const spr = this.facing === 'W' ? this.sprites.SW : this.sprites.SE;
      const img = spr[this.state] || spr.sit;
      ctx.drawImage(img, Math.floor(pos.x - 6), Math.floor(pos.y - 7));

      if (this.bubble) {
        ctx.font = '6px "Pixelify Sans", system-ui, sans-serif';
        const text = this.bubble;
        const metrics = ctx.measureText(text);
        const bw = Math.max(26, metrics.width + 6);
        const bh = 11;
        const bx = Math.floor(pos.x - bw / 2);
        const by = Math.floor(pos.y - bh - 9);

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3a2838';
        ctx.lineWidth = 1;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

        ctx.fillStyle = '#3a2838';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + bw / 2, by + bh / 2);
      }
    }
  }

  // ---- Delivery Rider (Special Random Event Character - Claude-Office style) ----
  class DeliveryRider extends Character {
    constructor() {
      super('delivery-rider', 'Bang Kurir', 'Kurir Martabak', { hair: 2, skin: 1, cloth: 1, long: false, glasses: false }, (LO.GROUND ?? 4), LO.DOOR_COL, LO.DOOR_ROW);
      this.speed = 2.4;
      this.carriedItem = 'paper'; // carries food box
      this.targetFloor = 0;
      this.targetCol = 70;
      this.targetRow = 32;
      this.state = 'walk';
      this.phase = 'entering'; // 'entering' | 'delivering' | 'leaving'
      this.waitTimer = 0;
      this.setBubble('Permisi, paket martabak hangat! 🍕', 3.0);
      this.setEmote('🛵', 2.5);
    }

    update(dt, office) {
      super.update(dt, office);

      if (this.phase === 'delivering') {
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) {
          this.phase = 'leaving';
          this.carriedItem = null;
          this.targetFloor = 0;
          this.targetCol = LO.DOOR_COL;
          this.targetRow = LO.DOOR_ROW;
          this.setBubble('Selamat menikmati semuanya! 👋', 3.0);
        }
      }
    }

    onArrived() {
      if (this.phase === 'entering') {
        this.phase = 'delivering';
        this.waitTimer = 4.0;
        this.facing = 'N';
        this.setEmote('🍕', 3.5);
        this.setBubble('Martabak manis spesial siap di pantry! 🍕✨', 4.0);
        const office = window.LO?.office;
        if (office) {
          office.pizzaEventTimer = 25.0; // box stays for 25s
          const pantryStaff = [office.lami, ...office.residents, ...office.subagents.values()].filter((c) => c && Math.hypot(c.col - 70, c.row - 32) < 6);
          for (const s of pantryStaff) {
            s.setBubble('Wah mantap, makasih bang! 🎉', 3.0);
            s.setEmote('❤️', 2.5);
          }
        }
        return;
      }

      if (this.phase === 'leaving') {
        const office = window.LO?.office;
        if (office) {
          office.deliveryRider = null;
        }
      }
    }
  }

  LO.Character = Character;
  LO.ResidentAgent = ResidentAgent;
  LO.Lami = Lami;
  LO.SubAgent = SubAgent;
  LO.MochiCat = MochiCat;
  LO.DeliveryRider = DeliveryRider;
})();
