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
      this.floor = floor;
      this.col = col;
      this.row = row;
      this.targetFloor = floor;
      this.targetCol = col;
      this.targetRow = row;

      this.facing = 'SE'; // 'SE' | 'SW' | 'NE' | 'NW'
      this.state = 'idle'; // idle | walk | type | lift_wait | lift_ride | reporting
      this.speed = 2.2; // tiles per second
      this.sprites = LO.getCharacterSprites(this.look);

      this.frame = 'idle';
      this.animTimer = 0;
      this.walkStep = false;

      this.emote = null;
      this.emoteTimer = 0;
      this.bubble = null;
      this.bubbleTimer = 0;

      this.carriedItem = null; // 'paper'
      this.particles = [];

      this.idleActionTimer = Math.random() * 5 + 3;
      this.assignedSlot = null;
    }

    getDepth() {
      // Y-sorting: floor priority, then isometric grid diagonal (col + row)
      return this.floor * 1000 + (this.col + this.row) * 10;
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
      // Needs to change floor
      if (this.floor !== this.targetFloor) {
        if (this.state !== 'lift_wait' && this.state !== 'lift_ride') {
          // Walk diagonally to elevator waiting area
          const dCol = LO.LIFT_WAIT_COL - this.col;
          const dRow = LO.LIFT_WAIT_ROW - this.row;
          const dist = Math.hypot(dCol, dRow);
          if (dist > 0.15) {
            this.walkTowards(LO.LIFT_WAIT_COL, LO.LIFT_WAIT_ROW, dt);
          } else {
            this.col = LO.LIFT_WAIT_COL;
            this.row = LO.LIFT_WAIT_ROW;
            this.state = 'lift_wait';
            this.frame = 'idle';
            this.facing = 'SW';
            this.waitElevatorTime = 0;
            office.elevator.request(this);
          }
        } else if (this.state === 'lift_wait') {
          this.waitElevatorTime = (this.waitElevatorTime || 0) + dt;
          if (this.waitElevatorTime > 12) {
            this.waitElevatorTime = 0;
            office.elevator.request(this);
          }
        }
        return;
      }

      // On correct floor
      if (this.state === 'lift_ride') {
        this.state = 'walk';
      }

      if (this.state === 'lift_wait') {
        this.frame = 'idle';
        return;
      }

      // Walk to target slot on floor
      const dCol = this.targetCol - this.col;
      const dRow = this.targetRow - this.row;
      const dist = Math.hypot(dCol, dRow);

      if (dist > 0.12) {
        this.walkTowards(this.targetCol, this.targetRow, dt);
      } else {
        this.col = this.targetCol;
        this.row = this.targetRow;
        if (this.state === 'walk') {
          this.onArrived();
        }
        this.updateIdleState(dt);
      }
    }

    walkTowards(destCol, destRow, dt) {
      this.state = 'walk';
      const dCol = destCol - this.col;
      const dRow = destRow - this.row;
      const dist = Math.hypot(dCol, dRow);

      // Determine 4-way Isometric Facing
      if (Math.abs(dCol) > Math.abs(dRow)) {
        this.facing = dCol > 0 ? 'SE' : 'NW';
      } else {
        this.facing = dRow > 0 ? 'SW' : 'NE';
      }

      const step = Math.min(this.speed * dt, dist);
      this.col += (dCol / dist) * step;
      this.row += (dRow / dist) * step;

      // Happy Mall Story walk bounce
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
        if (this.assignedSlot && this.assignedSlot.type === 'desk') {
          this.frame = Math.sin(Date.now() / 320) > 0 ? 'type' : 'idle';
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
      const sprGroup = this.sprites[this.facing] || this.sprites.SE;
      const img = sprGroup[this.frame] || sprGroup.idle;

      const px = Math.floor(pos.x - this.sprites.w / 2);
      const py = Math.floor(pos.y - this.sprites.h + 2);

      // Isometric Character Shadow
      ctx.fillStyle = 'rgba(58, 40, 56, 0.28)';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 1, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw Chibi Sprite
      ctx.drawImage(img, px, py);

      // Carried Paper Item
      if (this.carriedItem === 'paper') {
        const paper = LO.getPaperSprite();
        const paperX = this.facing === 'SE' || this.facing === 'NE' ? px + this.sprites.w - 3 : px - 2;
        ctx.drawImage(paper, paperX, py + 9);
      }

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
      switch (this.id) {
        case 'res-rina':
          return [
            {
              id: 'corkboard',
              name: 'Cek Papan Catatan',
              floor: 1, // 4F Research Lab
              col: 5.2,
              row: 1.1,
              facing: 'NW',
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
              floor: 1,
              col: 5.2,
              row: 3.2,
              facing: 'NW',
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
              floor: 1,
              col: 2.0,
              row: 2.8,
              facing: 'NE',
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
              floor: 4, // 1F Pantry
              col: 2.0,
              row: 1.5,
              facing: 'SE',
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
              floor: 0, // Roof Boss
              col: 3.5,
              row: 3.2,
              facing: 'NE',
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
              floor: 2, // 3F Coding
              col: 5.8,
              row: 1.8,
              facing: 'NW',
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
              floor: 2,
              col: 5.8,
              row: 3.2,
              facing: 'NW',
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
              floor: 2,
              col: 4.2,
              row: 1.8,
              facing: 'SE',
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
              floor: 4, // 1F Pantry
              col: 5.6,
              row: 1.8,
              facing: 'NW',
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
              floor: 3, // 2F Meeting
              col: 3.5,
              row: 1.2,
              facing: 'NW',
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
              floor: 3,
              col: 2.0,
              row: 2.2,
              facing: 'SE',
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
              floor: 0, // Roof Boss
              col: 2.2,
              row: 3.0,
              facing: 'NE',
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
              floor: 4, // 1F Pantry
              col: 3.8,
              row: 2.2,
              facing: 'SE',
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
              floor: 5, // B1 Server
              col: 2.5,
              row: 1.6,
              facing: 'NW',
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
              floor: 5,
              col: 4.0,
              row: 1.6,
              facing: 'NW',
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
              floor: 5,
              col: 2.2,
              row: 3.2,
              facing: 'NE',
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
              floor: 4, // 1F Pantry
              col: 2.0,
              row: 1.5,
              facing: 'SE',
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
          col: 4.0,
          row: 1.1,
          facing: 'NW',
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
          col: 5.8,
          row: 1.4,
          facing: 'NE',
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
          col: 2.8,
          row: 3.0,
          facing: 'SW',
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
          floor: 4, // 1F Pantry
          col: 3.5,
          row: 2.0,
          facing: 'SE',
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

    reportToLami() {
      this.carriedItem = 'paper';
      this.targetFloor = 0;
      this.targetCol = 3.5;
      this.targetRow = 3.2;
      this.state = 'reporting';
      this.setBubble('Lapor Boss, selesai! 📄', 4.0);
    }

    deliverReport(lami) {
      this.carriedItem = null;
      this.facing = 'NE';
      this.setEmote('❤️', 3.0);
      this.setBubble('Ini hasilnya, Boss! ✨', 3.0);
      this.addParticle('+1 Tugas', '✅', '#2ecc71');
      lami.cheer();
    }
  }

  // ---- Mochi the Cat (Isometric) ----
  class MochiCat {
    constructor() {
      this.floor = 4; // Pantry
      this.col = 4.2;
      this.row = 2.8;
      this.targetCol = 4.2;
      this.targetRow = 2.8;
      this.facing = 'SE';
      this.state = 'sit';
      this.sprites = LO.getCatSprites();
      this.timer = Math.random() * 5 + 3;
      this.meowTimer = Math.random() * 16 + 10;
      this.bubble = null;
      this.bubbleTimer = 0;
    }

    getDepth() {
      return this.floor * 1000 + (this.col + this.row) * 10;
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
          this.targetCol = 2 + Math.random() * 4;
          this.targetRow = 1.5 + Math.random() * 2.5;
          this.facing = this.targetCol > this.col ? 'SE' : 'SW';
        } else if (roll < 0.8) {
          this.state = 'sit';
        } else {
          this.state = 'idle';
        }
      }

      this.meowTimer -= dt;
      if (this.meowTimer <= 0) {
        this.meowTimer = Math.random() * 18 + 12;

        // Cek jika ada orang di dekat Mochi di Pantry (Lantai 4)
        let someoneNear = false;
        if (office) {
          const pantryChars = [
            office.lami,
            ...office.residents,
            ...office.subagents.values()
          ].filter((c) => c && c.floor === 4);

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
      const spr = this.facing === 'SE' ? this.sprites.SE : this.sprites.SW;
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
      super('delivery-rider', 'Bang Kurir', 'Kurir Martabak', { hair: 2, skin: 1, cloth: 1, long: false, glasses: false }, 4, LO.DOOR_COL, LO.DOOR_ROW);
      this.speed = 2.4;
      this.carriedItem = 'paper'; // carries food box
      this.targetFloor = 4;
      this.targetCol = 2.8;
      this.targetRow = 2.0;
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
          this.targetFloor = 4;
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
        this.facing = 'NW';
        this.setEmote('🍕', 3.5);
        this.setBubble('Martabak manis spesial siap di pantry! 🍕✨', 4.0);
        const office = window.LO?.office;
        if (office) {
          office.pizzaEventTimer = 25.0; // box stays for 25s
          const pantryStaff = [office.lami, ...office.residents, ...office.subagents.values()].filter((c) => c && c.floor === 4);
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
