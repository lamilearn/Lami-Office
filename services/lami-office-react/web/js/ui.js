/* Lami's AI Office — HUD, Ticker, Character Info Card & Sound Control */
(function () {
  const LO = window.LO;

  class UIManager {
    constructor() {
      this.clockEl = document.getElementById('hud-clock');
      this.doneEl = document.getElementById('hud-done');
      this.coinsEl = document.getElementById('hud-coins');
      this.staffEl = document.getElementById('hud-staff');
      this.statusEl = document.getElementById('hud-status');
      this.soundBtn = document.getElementById('btn-sound');
      this.tickerList = document.getElementById('ticker-list');

      this.cardEl = document.getElementById('card');
      this.cardAvatar = document.getElementById('card-avatar');
      this.cardName = document.getElementById('card-name');
      this.cardRole = document.getElementById('card-role');
      this.cardTask = document.getElementById('card-task');
      this.cardTool = document.getElementById('card-tool');
      this.cardRoom = document.getElementById('card-room');
      this.cardTime = document.getElementById('card-time');
      this.cardClose = document.getElementById('card-close');

      // Modals (Whiteboard & Context Window Trashcan)
      this.wbBtn = document.getElementById('btn-wb');
      this.wbModal = document.getElementById('whiteboard-modal');
      this.wbClose = document.getElementById('wb-close');
      this.wbTabBtns = document.querySelectorAll('.wb-tab-btn');
      this.wbTabContents = document.querySelectorAll('.wb-tab-content');

      this.ctxChip = document.getElementById('hud-ctx-chip');
      this.ctxVal = document.getElementById('hud-ctx-val');
      this.ctxModal = document.getElementById('context-modal');
      this.ctxClose = document.getElementById('ctx-close');
      this.ctxPctText = document.getElementById('ctx-pct-text');
      this.ctxGaugeBar = document.getElementById('ctx-gauge-bar');
      this.ctxUsedVal = document.getElementById('ctx-used-val');
      this.ctxStatusText = document.getElementById('ctx-status-text');

      this.doneCount = 0;
      this.coinsCount = 0;
      this.selectedAgent = null;

      this.init();
    }

    init() {
      // Clock
      this.updateClock();
      setInterval(() => this.updateClock(), 1000);

      // Sound button
      this.soundBtn.textContent = LO.audio.muted ? '🔇' : '🔊';
      this.soundBtn.addEventListener('click', () => {
        const isMuted = LO.audio.toggleMute();
        this.soundBtn.textContent = isMuted ? '🔇' : '🔊';
        if (!isMuted) LO.audio.pop();
      });

      // Card close
      this.cardClose.addEventListener('click', () => this.hideCard());

      // Card timer update
      setInterval(() => {
        if (this.selectedAgent && !this.cardEl.classList.contains('hidden')) {
          this.refreshCardDetails(this.selectedAgent);
        }
      }, 1000);

      // Time of Day Toggle Button (Claude-Office reference)
      this.timeBtn = document.getElementById('btn-time');
      this.timeModes = ['auto', 'day', 'sunset', 'night'];
      this.timeModeIdx = 0;
      if (this.timeBtn) {
        this.timeBtn.addEventListener('click', () => this.cycleTimeMode());
      }

      // Slack-style Office Chat Drawer (Claude-Office reference)
      this.chatBtn = document.getElementById('btn-chat');
      this.chatDrawer = document.getElementById('chat-drawer');
      this.chatClose = document.getElementById('chat-close');
      this.chatClear = document.getElementById('chat-clear-btn');
      this.chatForm = document.getElementById('chat-form');
      this.chatInput = document.getElementById('chat-input');
      this.chatMessages = document.getElementById('chat-messages');
      this.eventBanner = document.getElementById('event-banner');

      if (this.chatBtn && this.chatDrawer) {
        this.chatBtn.addEventListener('click', () => this.toggleChatDrawer());
        this.chatClose.addEventListener('click', () => this.toggleChatDrawer(false));
        if (this.chatClear) {
          this.chatClear.addEventListener('click', () => {
            this.chatMessages.innerHTML = '';
            this.appendChatMessage('Sistem', 'Kantor', 'Riwayat chat telah dibersihkan. 🧹', '✨', '#1f9d5c', false, true);
          });
        }
        this.chatForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleChatSubmit();
        });

        // Greeting message in Slack chat
        this.appendChatMessage('Boss Lami', 'CEO', 'Selamat datang di Lami Corp! Ketik <code>/help</code> untuk melihat daftar perintah santai. 👑✨', '👑', '#ffd25e');
      }

      // Whiteboard Modal bindings
      if (this.wbBtn && this.wbModal) {
        this.wbBtn.addEventListener('click', () => this.showWhiteboardModal());
        if (this.wbClose) this.wbClose.addEventListener('click', () => this.hideWhiteboardModal());
        this.wbModal.addEventListener('click', (e) => {
          if (e.target === this.wbModal) this.hideWhiteboardModal();
        });
        this.wbTabBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            this.switchWhiteboardTab(btn.dataset.tab);
          });
        });
      }

      // Context Window Trashcan Modal bindings
      if (this.ctxChip && this.ctxModal) {
        this.ctxChip.addEventListener('click', () => this.showContextModal());
        if (this.ctxClose) this.ctxClose.addEventListener('click', () => this.hideContextModal());
        this.ctxModal.addEventListener('click', (e) => {
          if (e.target === this.ctxModal) this.hideContextModal();
        });
      }
    }

    cycleTimeMode() {
      this.timeModeIdx = (this.timeModeIdx + 1) % this.timeModes.length;
      const mode = this.timeModes[this.timeModeIdx];
      const office = window.LO?.office;

      const icons = { auto: '🔄', day: '☀️', sunset: '🌇', night: '🌙' };
      const labels = { auto: 'Otomatis (Sesuai Jam)', day: 'Siang Cerah ☀️', sunset: 'Senja Sore 🌇', night: 'Malam Berbintang 🌙' };

      if (office && office.world) {
        office.world.manualTheme = mode === 'auto' ? null : mode;
      }

      if (this.timeBtn) {
        this.timeBtn.textContent = icons[mode];
        this.timeBtn.title = `Waktu: ${labels[mode]}`;
      }

      this.addTicker(icons[mode], `Pencahayaan diubah ke: <b>${labels[mode]}</b>`);
      this.appendChatMessage('Sistem', 'Pencahayaan', `Pencahayaan kantor dialihkan ke mode: <b>${labels[mode]}</b>`, icons[mode], '#f39c12', false, true);
    }

    toggleChatDrawer(show = null) {
      if (!this.chatDrawer) return;
      const willShow = show !== null ? show : this.chatDrawer.classList.contains('hidden');
      if (willShow) {
        // Anti-overlap: hide any open character card when drawer opens
        this.hideCard();
        this.chatDrawer.classList.remove('hidden');
        LO.audio.pop();
        if (this.chatInput) setTimeout(() => this.chatInput.focus(), 80);
      } else {
        this.chatDrawer.classList.add('hidden');
      }
    }

    appendChatMessage(sender, role, text, icon = '💬', color = '#555', isUser = false, isSystem = false) {
      if (!this.chatMessages) return;

      const msg = document.createElement('div');
      msg.className = `chat-msg ${isUser ? 'user' : ''} ${isSystem ? 'system' : ''}`;

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      msg.innerHTML = `
        <div class="chat-avatar" style="border-color:${color};">${icon}</div>
        <div class="chat-content">
          <div class="chat-author">
            <b>${sender}</b>
            <span class="chat-badge" style="color:${color};">${role}</span>
            <span class="chat-time">${timeStr}</span>
          </div>
          <div class="chat-bubble">${text}</div>
        </div>
      `;

      this.chatMessages.appendChild(msg);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    handleChatSubmit() {
      const text = (this.chatInput.value || '').trim();
      if (!text) return;
      this.chatInput.value = '';

      // Tampilkan pesan user
      this.appendChatMessage('Kamu', 'User', text, '👤', '#1976d2', true);

      // Handle Slash Commands
      if (text.startsWith('/')) {
        this.handleSlashCommand(text);
        return;
      }

      // Friendly AI reply from team / Boss Lami
      setTimeout(() => {
        const office = window.LO?.office;
        const replies = [
          'Siap laksanakan! Semua divisi on-track. 💪',
          'Kantor adem ayem, target hari ini aman terkendali! 👑',
          'Sip! Mau kopi gayo dulu di pantry 1F? ☕',
          'Mantap pol, semangat kerjanya! ✨',
          'Server adem 17°C, jaringan 10 Gbps ngebut tanpa drop! 🖥️',
          'Fitur kodingan baru udah di-approve merge 👍'
        ];
        const rep = replies[Math.floor(Math.random() * replies.length)];
        this.appendChatMessage('Boss Lami', 'CEO', rep, '👑', '#ffd25e');
        if (office && office.lami) office.lami.cheer();
      }, 600);
    }

    handleSlashCommand(cmdStr) {
      const parts = cmdStr.split(' ');
      const cmd = parts[0].toLowerCase();
      const arg = (parts[1] || '').toLowerCase();
      const office = window.LO?.office;

      switch (cmd) {
        case '/help': {
          const helpHtml = `
            <b>Daftar Perintah Slash:</b><br>
            • <code>/status</code>: Cek kesehatan kantor & koin<br>
            • <code>/agents</code>: Posisi & aktivitas karyawan<br>
            • <code>/whiteboard [tasks|tools|team]</code>: Buka whiteboard 2F 📋<br>
            • <code>/context [0-100]</code>: Cek & atur context window 🗑️<br>
            • <code>/the-office</code>: Easter Egg mode Scranton Dunder Mifflin 📄<br>
            • <code>/event pizza</code>: Panggil kurir martabak/pizza 🍕<br>
            • <code>/event flicker</code>: Simulasi listrik berkedip ⚡<br>
            • <code>/event coffee</code>: Restock kopi pantry ☕<br>
            • <code>/event printer</code>: Printer macet 📄<br>
            • <code>/time [day|sunset|night|auto]</code>: Ganti suasana<br>
            • <code>/clear</code>: Bersihkan obrolan
          `;
          this.appendChatMessage('Sistem', 'Help', helpHtml, 'ℹ️', '#1976d2', false, true);
          break;
        }

        case '/status': {
          const staffCount = (office ? office.subagents.size : 0) + 4; // 4 resident
          const statusHtml = `
            📊 <b>Status Lami Corp:</b><br>
            • Staf Aktif: <b>${staffCount} orang</b> (4 Tetap + Sub-agents)<br>
            • Task Selesai: <b>${this.doneCount}</b><br>
            • Saldo Koin: <b>🪙 ${this.coinsCount}</b><br>
            • Context Window: <b>${Math.round((office?.contextUsage || 0.42) * 100)}%</b><br>
            • Suasana: <b>${this.timeModes[this.timeModeIdx]}</b><br>
            • Server Room: <b>18°C Normal 🟢</b>
          `;
          this.appendChatMessage('Sistem', 'Status', statusHtml, '📊', '#8e44ad', false, true);
          break;
        }

        case '/agents': {
          if (!office) return;
          let listHtml = '👥 <b>Daftar Karyawan di Gedung:</b><br>';
          listHtml += `• <b>${office.lami.name}</b> (Roof): ${office.lami.task || 'CEO'}<br>`;
          for (const r of office.residents) {
            const fName = LO.FLOORS[r.floor]?.label || 'Floor';
            listHtml += `• <b>${r.name}</b> (${fName}): ${r.task || 'Kerja'}<br>`;
          }
          for (const s of office.subagents.values()) {
            const fName = LO.FLOORS[s.floor]?.label || 'Floor';
            listHtml += `• <b>${s.name}</b> (${fName}): ${s.currentTool || s.task}<br>`;
          }
          this.appendChatMessage('Sistem', 'Staff', listHtml, '👥', '#2980b9', false, true);
          break;
        }

        case '/the-office': {
          if (!office) return;
          office.toggleTheOfficeMode();
          break;
        }

        case '/whiteboard':
        case '/wb': {
          const tab = ['tasks', 'tools', 'team'].includes(arg) ? arg : 'tasks';
          this.showWhiteboardModal(tab);
          break;
        }

        case '/context': {
          if (arg && !isNaN(parseFloat(arg))) {
            const val = parseFloat(arg) > 1 ? parseFloat(arg) / 100 : parseFloat(arg);
            this.setContextUsage(val);
            this.appendChatMessage('Sistem', 'Context', `Kapasitas context window diatur ke: <b>${Math.round(val * 100)}%</b>`, '🗑️', '#8e44ad', false, true);
          }
          this.showContextModal();
          break;
        }

        case '/event': {
          if (!office) return;
          if (['pizza', 'flicker', 'coffee', 'printer'].includes(arg)) {
            office.triggerRandomEvent(arg);
          } else {
            office.triggerRandomEvent();
          }
          break;
        }

        case '/time': {
          if (['day', 'sunset', 'night', 'auto'].includes(arg)) {
            this.timeModeIdx = this.timeModes.indexOf(arg);
            const mode = arg;
            if (office && office.world) office.world.manualTheme = mode === 'auto' ? null : mode;
            const icons = { auto: '🔄', day: '☀️', sunset: '🌇', night: '🌙' };
            if (this.timeBtn) this.timeBtn.textContent = icons[mode];
            this.appendChatMessage('Sistem', 'Waktu', `Suasana kantor diubah ke <b>${mode}</b>!`, icons[mode], '#f39c12', false, true);
          } else {
            this.appendChatMessage('Sistem', 'Waktu', 'Format: <code>/time [day|sunset|night|auto]</code>', '⚠️', '#e67e22', false, true);
          }
          break;
        }

        case '/clear': {
          this.chatMessages.innerHTML = '';
          this.appendChatMessage('Sistem', 'Kantor', 'Riwayat chat telah dibersihkan. 🧹', '✨', '#1f9d5c', false, true);
          break;
        }

        default: {
          this.appendChatMessage('Sistem', 'Error', `Perintah <code>${cmd}</code> tidak dikenal. Ketik <code>/help</code> untuk bantuan.`, '⚠️', '#c0392b', false, true);
          break;
        }
      }
    }

    triggerEventBanner(icon, title, desc, duration = 4.5) {
      if (!this.eventBanner) return;
      const iconEl = document.getElementById('event-icon');
      const titleEl = document.getElementById('event-title');
      const descEl = document.getElementById('event-desc');

      if (iconEl) iconEl.textContent = icon;
      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = desc;

      this.eventBanner.classList.remove('hidden');
      clearTimeout(this.eventTimer);
      this.eventTimer = setTimeout(() => {
        if (this.eventBanner) this.eventBanner.classList.add('hidden');
      }, duration * 1000);
    }

    updateClock() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      this.clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    setStatus(mode) {
      this.statusEl.className = 'hud-pill';
      if (mode === 'live') {
        this.statusEl.classList.add('status-live');
        this.statusEl.innerHTML = '<i></i><b>LIVE</b>';
      } else if (mode === 'demo') {
        this.statusEl.classList.add('status-demo');
        this.statusEl.innerHTML = '<i></i><b>DEMO</b>';
      } else {
        this.statusEl.classList.add('status-offline');
        this.statusEl.innerHTML = '<i></i><b>OFFLINE</b>';
      }
    }

    updateStaffCount(count) {
      this.staffEl.textContent = count;
    }

    recordDone(ok) {
      if (ok) {
        this.doneCount++;
        this.coinsCount++;
        this.doneEl.textContent = this.doneCount;
        this.coinsEl.textContent = this.coinsCount;

        // Bump animation
        const chip = this.coinsEl.closest('.hud-chip');
        if (chip) {
          chip.classList.remove('bump');
          void chip.offsetWidth; // trigger reflow
          chip.classList.add('bump');
        }
      }
    }

    setStats(done, coins) {
      this.doneCount = done;
      this.coinsCount = coins;
      this.doneEl.textContent = done;
      this.coinsEl.textContent = coins;
    }

    addTicker(icon, htmlText) {
      this.tickerList.innerHTML = '';

      const li = document.createElement('li');
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      li.innerHTML = `
        <span class="t-icon">${icon}</span>
        <span class="t-text">${htmlText}</span>
        <span class="t-time">${timeStr}</span>
      `;

      this.tickerList.appendChild(li);

      clearTimeout(this.tickerTimer);
      this.tickerTimer = setTimeout(() => {
        if (li && li.parentNode) {
          li.style.transition = 'opacity .5s ease, transform .5s ease';
          li.style.opacity = '0';
          li.style.transform = 'translateY(8px)';
          setTimeout(() => { if (li.parentNode) li.remove(); }, 520);
        }
      }, 3500);
    }

    showCard(agent) {
      this.selectedAgent = agent;
      this.cardName.textContent = agent.name;
      this.cardRole.textContent = agent.role || 'Karyawan';

      const tickerEl = document.getElementById('ticker');
      if (tickerEl) tickerEl.style.display = 'none';

      const ctx = this.cardAvatar.getContext('2d');
      ctx.clearRect(0, 0, 20, 20);
      ctx.imageSmoothingEnabled = false;
      const sprGroup = agent.sprites[agent.facing] || agent.sprites.SE || agent.sprites.right;
      const spr = sprGroup.idle || sprGroup.type || agent.sprites.right.idle;
      ctx.drawImage(spr, 20 / 2 - spr.width / 2, 20 - spr.height);

      this.refreshCardDetails(agent);

      this.cardEl.classList.remove('hidden');
    }

    refreshCardDetails(agent) {
      this.cardTask.textContent = agent.task || 'Standby';
      this.cardTool.textContent = agent.currentTool ? `${LO.iconForTool(agent.currentTool)} ${agent.currentTool}` : 'Ngopi / Standby';
      const curFloorObj = LO.FLOORS[agent.floor];
      const homeRoomId = agent.homeRoom || (agent.assignedSlot ? agent.assignedSlot.roomId : 'pantry');
      const homeLabel = LO.FLOORS[LO.FLOOR_INDEX[homeRoomId]]?.label || homeRoomId;
      this.cardRoom.textContent = curFloorObj ? curFloorObj.label : homeLabel;

      if (agent.startTime) {
        const sec = Math.floor((Date.now() - agent.startTime) / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        this.cardTime.textContent = `${m}m ${s}s`;
      } else {
        this.cardTime.textContent = 'Tetap';
      }
    }

    hideCard() {
      this.cardEl.classList.add('hidden');
      this.selectedAgent = null;

      const tickerEl = document.getElementById('ticker');
      if (tickerEl) tickerEl.style.display = '';
    }

    showWhiteboardModal(initialTab = null) {
      if (!this.wbModal) return;
      if (initialTab) this.switchWhiteboardTab(initialTab);
      this.wbModal.classList.remove('hidden');
      LO.audio.pop();
    }

    hideWhiteboardModal() {
      if (this.wbModal) this.wbModal.classList.add('hidden');
    }

    switchWhiteboardTab(tabName) {
      if (!tabName) return;
      this.wbTabBtns.forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === tabName);
      });
      this.wbTabContents.forEach((c) => {
        c.classList.toggle('active', c.id === `wb-tab-${tabName}`);
      });
      const office = window.LO?.office;
      if (office) {
        const modeMap = { tasks: 0, tools: 1, team: 2 };
        if (modeMap[tabName] !== undefined) {
          office.whiteboardMode = modeMap[tabName];
        }
      }
    }

    showContextModal() {
      if (!this.ctxModal) return;
      const office = window.LO?.office;
      if (office && office.contextUsage !== undefined) {
        this.setContextUsage(office.contextUsage);
      }
      this.ctxModal.classList.remove('hidden');
      LO.audio.pop();
    }

    hideContextModal() {
      if (this.ctxModal) this.ctxModal.classList.add('hidden');
    }

    setContextUsage(ratio) {
      const clamped = Math.max(0, Math.min(1, ratio));
      const office = window.LO?.office;
      if (office) office.contextUsage = clamped;

      const pct = Math.round(clamped * 100);
      const usedTokens = Math.round(clamped * 200000);

      if (this.ctxVal) this.ctxVal.textContent = `${pct}%`;
      if (this.ctxPctText) this.ctxPctText.textContent = `${pct}% Terisi`;
      if (this.ctxGaugeBar) this.ctxGaugeBar.style.width = `${pct}%`;
      if (this.ctxUsedVal) this.ctxUsedVal.textContent = usedTokens.toLocaleString();

      if (this.ctxStatusText) {
        if (clamped >= 0.85) {
          this.ctxStatusText.innerHTML = '🔴 Meluber (Hampir Penuh)';
        } else if (clamped >= 0.6) {
          this.ctxStatusText.innerHTML = '🟡 Sedang';
        } else {
          this.ctxStatusText.innerHTML = '🟢 Aman';
        }
      }
    }
  }

  LO.ui = new UIManager();
})();
