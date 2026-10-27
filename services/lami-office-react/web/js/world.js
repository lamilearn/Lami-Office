/* Lami's AI Office — Isometric 2.5D World & Building Renderer (Happy Mall Story Style) */
(function () {
  const LO = window.LO;

  class World {
    constructor() {
      this.timeSec = 0;
      this.clouds = [
        { x: 15, y: 12, w: 45, speed: 1.2 },
        { x: 140, y: 18, w: 35, speed: 1.0 },
        { x: 260, y: 10, w: 50, speed: 1.5 }
      ];
      this.stars = [];
      for (let i = 0; i < 35; i++) {
        this.stars.push({
          x: Math.random() * LO.CONTENT_W,
          y: Math.random() * (LO.ROOF_OFFSET + 30),
          s: Math.random() * 1.5 + 0.5,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    update(dt) {
      this.timeSec += dt;
      for (const c of this.clouds) {
        c.x += c.speed * dt;
        if (c.x > LO.CONTENT_W + 50) c.x = -60;
      }
    }

    getSkyTheme() {
      let t;
      if (this.manualTheme === 'night') {
        t = { type: 'night', sky1: '#141226', sky2: '#281f44', light: 0.2 };
      } else if (this.manualTheme === 'sunset') {
        t = { type: 'sunset', sky1: '#ff9a76', sky2: '#644175', light: 0.7 };
      } else if (this.manualTheme === 'day') {
        t = { type: 'day', sky1: '#8ed0f8', sky2: '#c9e8fc', light: 1.0 };
      } else {
        const h = new Date().getHours();
        if (h >= 20 || h < 5) {
          t = { type: 'night', sky1: '#141226', sky2: '#281f44', light: 0.2 };
        } else if (h >= 17) {
          t = { type: 'sunset', sky1: '#ff9a76', sky2: '#644175', light: 0.7 };
        } else if (h < 9) {
          t = { type: 'morning', sky1: '#ffd1b3', sky2: '#8cc4f7', light: 0.8 };
        } else {
          t = { type: 'day', sky1: '#8ed0f8', sky2: '#c9e8fc', light: 1.0 };
        }
      }

      // Power flicker effect (Claude-Office random event)
      const office = window.LO?.office;
      if (office && office.flickerTimer > 0) {
        const darkFlash = Math.sin(this.timeSec * 30) > 0;
        if (darkFlash) {
          return { type: 'night', sky1: '#07060e', sky2: '#120d20', light: 0.08 };
        }
      }
      return t;
    }

    render(ctx) {
      const theme = this.getSkyTheme();

      // 1. Sky Gradient Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, LO.CONTENT_H);
      skyGrad.addColorStop(0, theme.sky1);
      skyGrad.addColorStop(1, theme.sky2);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, LO.CONTENT_W, LO.CONTENT_H);

      // Stars / Moon (Night / Sunset)
      if (theme.type === 'night' || theme.type === 'sunset') {
        ctx.fillStyle = '#ffffff';
        for (const s of this.stars) {
          const alpha = 0.4 + 0.6 * Math.sin(this.timeSec * 2 + s.phase);
          ctx.globalAlpha = (theme.type === 'night' ? 1.0 : 0.4) * Math.max(0, alpha);
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), Math.ceil(s.s), Math.ceil(s.s));
        }
        ctx.globalAlpha = 1.0;

        // Crescent / Glowing Moon
        ctx.fillStyle = '#fff9d6';
        ctx.beginPath();
        ctx.arc(LO.CONTENT_W - 36, 20, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.sky1;
        ctx.beginPath();
        ctx.arc(LO.CONTENT_W - 39, 18, 7.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Fluffy pastel clouds
      if (theme.type !== 'night') {
        ctx.fillStyle = theme.type === 'sunset' ? '#ffded6' : '#ffffff';
        ctx.globalAlpha = 0.75;
        for (const c of this.clouds) {
          const cx = Math.floor(c.x);
          ctx.beginPath();
          ctx.arc(cx, c.y, 7, 0, Math.PI * 2);
          ctx.arc(cx + 7, c.y - 3, 9, 0, Math.PI * 2);
          ctx.arc(cx + 16, c.y, 7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // Roof Banner ("👑 LAMI CORP") on Top
      this.drawRoofBanner(ctx);

      // 2. Render Stacked Isometric Floors (From Floor 5 up to Floor 0 or vice versa)
      for (let f = 0; f < LO.NF; f++) {
        this.drawIsometricFloor(ctx, f, theme);
      }
    }

    drawRoofBanner(ctx) {
      const topPt = LO.isoToScreen(0, 0, 0);
      const bx = LO.ORIGIN_X;
      const by = topPt.y - 34;
      const office = window.LO?.office;
      const isTheOffice = Boolean(office && office.theOfficeMode);

      // Cute Mall Signboard
      ctx.fillStyle = isTheOffice ? '#dff9fb' : '#ffd25e';
      ctx.fillRect(bx - 60, by, 120, 16);
      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx - 59.5, by + 0.5, 119, 15);

      ctx.fillStyle = '#3a2838';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isTheOffice ? '📄 DUNDER MIFFLIN' : '👑 LAMI OFFICE', bx, by + 11);

      // Small antenna beacon
      ctx.fillStyle = '#55445c';
      ctx.fillRect(bx - 64, by - 12, 2, 12);
      const beacon = Math.sin(this.timeSec * 4) > 0;
      ctx.fillStyle = beacon ? '#ff3344' : '#661122';
      ctx.fillRect(bx - 65, by - 14, 4, 3);
    }

    drawIsometricFloor(ctx, floorIndex, theme) {
      const f = LO.FLOORS[floorIndex];
      const cols = LO.GRID_COLS;
      const rows = LO.GRID_ROWS;

      // 1. Back Wall (North-West: along row = 0)
      this.drawBackWallNW(ctx, floorIndex, f, cols);

      // 2. Back Wall (North-East: along col = cols)
      this.drawBackWallNE(ctx, floorIndex, f, cols, rows);

      // 3. Isometric Floor Base Slab Thickness (Front Faces: SW & SE edges)
      this.drawFloorSlab(ctx, floorIndex, f, cols, rows);

      // 4. Diamond Floor Checkerboard Tiles
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p0 = LO.isoToScreen(c, r, floorIndex);
          const p1 = LO.isoToScreen(c + 1, r, floorIndex);
          const p2 = LO.isoToScreen(c + 1, r + 1, floorIndex);
          const p3 = LO.isoToScreen(c, r + 1, floorIndex);

          ctx.fillStyle = (c + r) % 2 === 0 ? f.tile1 : f.tile2;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(58, 40, 56, 0.12)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Cozy Night Lighting: warm interior light pool over tiles
      if (theme.type === 'night') {
        const centerPos = LO.isoToScreen(cols / 2, rows / 2, floorIndex);
        const grad = ctx.createRadialGradient(centerPos.x, centerPos.y - 10, 8, centerPos.x, centerPos.y, 65);
        grad.addColorStop(0, 'rgba(255, 238, 175, 0.22)');
        grad.addColorStop(0.7, 'rgba(255, 215, 130, 0.08)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(centerPos.x, centerPos.y, 64, 32, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Room Badge on Back Wall
      const badgePos = LO.isoToScreen(1.5, 0, floorIndex);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fillRect(badgePos.x - 18, badgePos.y - 26, 36, 9);
      ctx.strokeStyle = '#3a2838';
      ctx.strokeRect(badgePos.x - 17.5, badgePos.y - 25.5, 35, 8);
      ctx.fillStyle = '#3a2838';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${f.short} ${f.icon}`, badgePos.x, badgePos.y - 19);

      // 6. Isometric Furniture & Room Props
      this.drawRoomProps(ctx, floorIndex, f.id, theme);
    }

    drawBackWallNW(ctx, floorIndex, f, cols) {
      const pStart = LO.isoToScreen(0, 0, floorIndex);
      const pEnd = LO.isoToScreen(cols, 0, floorIndex);
      const wallH = 28;

      ctx.fillStyle = f.wallL;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.lineTo(pEnd.x, pEnd.y - wallH);
      ctx.lineTo(pStart.x, pStart.y - wallH);
      ctx.closePath();
      ctx.fill();

      // Top trim
      ctx.strokeStyle = f.trim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y - wallH);
      ctx.lineTo(pEnd.x, pEnd.y - wallH);
      ctx.stroke();

      // Wall outline
      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    drawBackWallNE(ctx, floorIndex, f, cols, rows) {
      const pStart = LO.isoToScreen(cols, 0, floorIndex);
      const pEnd = LO.isoToScreen(cols, rows, floorIndex);
      const wallH = 28;

      ctx.fillStyle = f.wallR;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.lineTo(pEnd.x, pEnd.y - wallH);
      ctx.lineTo(pStart.x, pStart.y - wallH);
      ctx.closePath();
      ctx.fill();

      // Top trim
      ctx.strokeStyle = f.trim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y - wallH);
      ctx.lineTo(pEnd.x, pEnd.y - wallH);
      ctx.stroke();

      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    drawFloorSlab(ctx, floorIndex, f, cols, rows) {
      const pWest = LO.isoToScreen(0, rows, floorIndex);
      const pSouth = LO.isoToScreen(cols, rows, floorIndex);
      const pEast = LO.isoToScreen(cols, 0, floorIndex);
      const slabH = 6;

      // South-West slab face
      ctx.fillStyle = '#423240';
      ctx.beginPath();
      ctx.moveTo(pWest.x, pWest.y);
      ctx.lineTo(pSouth.x, pSouth.y);
      ctx.lineTo(pSouth.x, pSouth.y + slabH);
      ctx.lineTo(pWest.x, pWest.y + slabH);
      ctx.closePath();
      ctx.fill();

      // South-East slab face
      ctx.fillStyle = '#2f2430';
      ctx.beginPath();
      ctx.moveTo(pSouth.x, pSouth.y);
      ctx.lineTo(pEast.x, pEast.y);
      ctx.lineTo(pEast.x, pEast.y + slabH);
      ctx.lineTo(pSouth.x, pSouth.y + slabH);
      ctx.closePath();
      ctx.fill();

      // Gold / pastel accent stripe on slab rim
      ctx.strokeStyle = f.trim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pWest.x, pWest.y);
      ctx.lineTo(pSouth.x, pSouth.y);
      ctx.lineTo(pEast.x, pEast.y);
      ctx.stroke();
    }

    // ---- 3D Isometric Cube / Block Helper ----
    drawIsoCube(ctx, col, row, floor, wCols, dRows, hPx, topCol, leftCol, rightCol) {
      const p0 = LO.isoToScreen(col, row, floor);
      const p1 = LO.isoToScreen(col + wCols, row, floor);
      const p2 = LO.isoToScreen(col + wCols, row + dRows, floor);
      const p3 = LO.isoToScreen(col, row + dRows, floor);

      // Top face (raised by hPx)
      ctx.fillStyle = topCol;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y - hPx);
      ctx.lineTo(p1.x, p1.y - hPx);
      ctx.lineTo(p2.x, p2.y - hPx);
      ctx.lineTo(p3.x, p3.y - hPx);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Left face
      ctx.fillStyle = leftCol;
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y - hPx);
      ctx.lineTo(p2.x, p2.y - hPx);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right face
      ctx.fillStyle = rightCol;
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y - hPx);
      ctx.lineTo(p1.x, p1.y - hPx);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // ---- Isometric Furniture & Room Details ----
    drawRoomProps(ctx, floorIndex, roomId, theme) {
      switch (roomId) {
        case 'boss': {
          // Arched window on North-West wall
          const wPos = LO.isoToScreen(4.0, 0, floorIndex);
          ctx.fillStyle = theme.type === 'night' ? '#181730' : '#88c8f7';
          ctx.fillRect(wPos.x - 14, wPos.y - 24, 28, 16);
          ctx.strokeStyle = '#ba854d';
          ctx.strokeRect(wPos.x - 13.5, wPos.y - 23.5, 27, 15);

          // Grand Executive Desk (col: 4.0, row: 2.0)
          this.drawIsoCube(ctx, 4.0, 2.0, floorIndex, 1.4, 0.8, 8, '#7a3e2e', '#5a2b1e', '#451e13');

          // Gold laptop on desk
          const lp = LO.isoToScreen(4.4, 2.2, floorIndex);
          ctx.fillStyle = '#ffd25e';
          ctx.fillRect(lp.x - 4, lp.y - 12, 8, 4);
          ctx.fillStyle = '#fff9d6';
          ctx.fillRect(lp.x - 3, lp.y - 15, 6, 4); // screen

          // Easter-egg Signature Prop: Floating Gold Crown & "Best Boss" Mug
          const crownBob = Math.sin(this.timeSec * 3) * 1.5;
          const crPos = LO.isoToScreen(4.9, 2.0, floorIndex);
          ctx.fillStyle = '#f1c40f';
          ctx.fillRect(crPos.x - 4, crPos.y - 19 + crownBob, 8, 3);
          ctx.fillRect(crPos.x - 4, crPos.y - 22 + crownBob, 2, 3);
          ctx.fillRect(crPos.x - 1, crPos.y - 23 + crownBob, 2, 4);
          ctx.fillRect(crPos.x + 2, crPos.y - 22 + crownBob, 2, 3);
          // Mug
          const mgPos = LO.isoToScreen(3.8, 2.3, floorIndex);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(mgPos.x - 2, mgPos.y - 11, 4, 4);
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(mgPos.x - 1, mgPos.y - 10, 2, 2);

          // Potted luxury plant
          const pl = LO.isoToScreen(6.2, 0.8, floorIndex);
          ctx.fillStyle = '#c0392b';
          ctx.fillRect(pl.x - 4, pl.y - 6, 8, 6);
          ctx.fillStyle = '#27ae60';
          ctx.beginPath();
          ctx.arc(pl.x, pl.y - 9, 6, 0, Math.PI * 2);
          ctx.fill();

          // ---- Context Window Trashcan (Claude-Office reference) ----
          const office = window.LO?.office;
          const ctxUsage = office ? office.contextUsage : 0.42; // ratio 0.0 - 1.0
          const tcPos = LO.isoToScreen(3.0, 1.8, floorIndex);

          // Outer metal wastebasket
          this.drawIsoCube(ctx, 3.0, 1.8, floorIndex, 0.6, 0.6, 8, '#95a5a6', '#7f8c8d', '#576574');

          // Crumpled paper balls filling the trashcan
          const paperCount = Math.min(Math.floor(ctxUsage * 9), 10);
          const paperColors = ['#ffffff', '#f1f2f6', '#fed330', '#dff9fb'];
          for (let p = 0; p < paperCount; p++) {
            const pxOffset = ((p * 5) % 4) - 2;
            const pyOffset = -Math.min(p * 1.2, 9);
            ctx.fillStyle = paperColors[p % paperColors.length];
            ctx.fillRect(tcPos.x + pxOffset - 2, tcPos.y - 7 + pyOffset, 4, 3);
            ctx.fillStyle = '#718093';
            ctx.fillRect(tcPos.x + pxOffset, tcPos.y - 6 + pyOffset, 1, 1);
          }

          // Overflow crumpled papers on floor if context > 70%
          if (ctxUsage > 0.7) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(tcPos.x + 5, tcPos.y - 1, 3, 2);
            ctx.fillRect(tcPos.x - 6, tcPos.y + 1, 3, 2);
          }

          // Floating mini badge above trashcan
          const pct = Math.round(ctxUsage * 100);
          const tBob = Math.sin(this.timeSec * 3) * 1.2;
          ctx.fillStyle = ctxUsage > 0.8 ? '#e74c3c' : (ctxUsage > 0.5 ? '#f39c12' : '#27ae60');
          ctx.fillRect(tcPos.x - 13, tcPos.y - 21 + tBob, 26, 7);
          ctx.strokeStyle = '#3a2838';
          ctx.strokeRect(tcPos.x - 12.5, tcPos.y - 20.5, 25, 6);
          ctx.fillStyle = '#ffffff';
          ctx.font = '5px "Press Start 2P", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${pct}% 🗑️`, tcPos.x, tcPos.y - 16 + tBob);
          break;
        }

        case 'research': {
          // Double research desks
          this.drawIsoCube(ctx, 2.2, 1.2, floorIndex, 1.2, 0.7, 7, '#8f7762', '#6b5443', '#574232');
          this.drawIsoCube(ctx, 4.2, 1.2, floorIndex, 1.2, 0.7, 7, '#8f7762', '#6b5443', '#574232');

          // Monitors with glowing blue search screens
          [2.6, 4.6].forEach((c) => {
            const mp = LO.isoToScreen(c, 1.4, floorIndex);
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(mp.x - 4, mp.y - 13, 8, 6);
            ctx.fillStyle = '#7ec8f2';
            ctx.fillRect(mp.x - 3, mp.y - 12, 6, 4);
          });

          // Signature Prop: Mini Microscope & Journal Stack on desk
          const rBob = Math.sin(this.timeSec * 3 + 1) * 1.2;
          const scPos = LO.isoToScreen(2.0, 1.3, floorIndex);
          ctx.fillStyle = '#34495e';
          ctx.fillRect(scPos.x - 2, scPos.y - 13 + rBob, 4, 6);
          ctx.fillStyle = '#00bcd4';
          ctx.fillRect(scPos.x, scPos.y - 16 + rBob, 2, 3);
          const jpPos = LO.isoToScreen(3.2, 1.4, floorIndex);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(jpPos.x - 3, jpPos.y - 10, 6, 3);
          ctx.fillStyle = '#3498db';
          ctx.fillRect(jpPos.x - 1, jpPos.y - 10, 2, 1);

          // Corkboard on North-West wall
          const cb = LO.isoToScreen(5.5, 0, floorIndex);
          ctx.fillStyle = '#c79867';
          ctx.fillRect(cb.x - 14, cb.y - 22, 28, 14);
          ctx.fillStyle = '#ff8fa3'; ctx.fillRect(cb.x - 10, cb.y - 19, 5, 5);
          ctx.fillStyle = '#ffd25e'; ctx.fillRect(cb.x - 2, cb.y - 18, 5, 5);
          ctx.fillStyle = '#7ec8f2'; ctx.fillRect(cb.x + 6, cb.y - 17, 5, 5);
          break;
        }

        case 'coding': {
          // Isometric Coding Desks with green code monitors
          this.drawIsoCube(ctx, 2.0, 1.4, floorIndex, 1.2, 0.7, 7, '#5c546e', '#453d54', '#322c3e');
          this.drawIsoCube(ctx, 4.0, 1.4, floorIndex, 1.2, 0.7, 7, '#5c546e', '#453d54', '#322c3e');
          this.drawIsoCube(ctx, 2.2, 3.0, floorIndex, 1.2, 0.7, 7, '#5c546e', '#453d54', '#322c3e');

          // Glowing Green Terminal Monitors
          [2.4, 4.4].forEach((c) => {
            const cp = LO.isoToScreen(c, 1.6, floorIndex);
            ctx.fillStyle = '#1e1927';
            ctx.fillRect(cp.x - 5, cp.y - 14, 10, 7);
            ctx.fillStyle = '#36d399';
            ctx.fillRect(cp.x - 4, cp.y - 13, 8, 5);
          });

          // Signature Prop: Yellow Rubber Duck Debugger & Energy Can
          const dkB = Math.sin(this.timeSec * 3 + 2) * 1.5;
          const dkPos = LO.isoToScreen(1.8, 1.5, floorIndex);
          ctx.fillStyle = '#f1c40f'; // duck body
          ctx.fillRect(dkPos.x - 3, dkPos.y - 14 + dkB, 5, 4);
          ctx.fillStyle = '#e67e22'; // orange beak
          ctx.fillRect(dkPos.x + 2, dkPos.y - 13 + dkB, 2, 2);
          // Green Energy Drink Can
          const canPos = LO.isoToScreen(2.9, 1.5, floorIndex);
          ctx.fillStyle = '#2ecc71';
          ctx.fillRect(canPos.x - 1, canPos.y - 13, 3, 5);
          ctx.fillStyle = '#111111';
          ctx.fillRect(canPos.x, canPos.y - 12, 1, 3);

          // Mini server tower with blinking LED
          const srv = LO.isoToScreen(6.2, 1.2, floorIndex);
          ctx.fillStyle = '#221b2c';
          ctx.fillRect(srv.x - 4, srv.y - 16, 8, 16);
          const blink = Math.sin(this.timeSec * 8) > 0;
          ctx.fillStyle = blink ? '#36d399' : '#145c3e';
          ctx.fillRect(srv.x - 2, srv.y - 14, 2, 2);
          break;
        }

        case 'meeting': {
          const office = window.LO?.office;
          const wbMode = office ? (office.whiteboardMode || 0) : 0; // 0 = Tasks, 1 = Tools, 2 = Team

          // Whiteboard frame on North-West wall (interactive)
          const wb = LO.isoToScreen(3.5, 0, floorIndex);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(wb.x - 22, wb.y - 26, 44, 18);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(wb.x - 21.5, wb.y - 25.5, 43, 17);

          // Top Header Tabs: [Tasks] [Tools] [Team]
          const tabLabels = ['TASKS', 'TOOLS', 'TEAM'];
          for (let ti = 0; ti < 3; ti++) {
            const tabX = wb.x - 20 + ti * 14;
            ctx.fillStyle = wbMode === ti ? '#3b82f6' : '#cbd5e1';
            ctx.fillRect(tabX, wb.y - 25, 13, 4);
            ctx.fillStyle = wbMode === ti ? '#ffffff' : '#475569';
            ctx.font = '3px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(tabLabels[ti], tabX + 6.5, wb.y - 22);
          }

          // Whiteboard content based on active mode
          if (wbMode === 0) {
            // Mode 0: Tasks checklist & sticky notes
            ctx.fillStyle = '#ff7675'; ctx.fillRect(wb.x - 18, wb.y - 19, 5, 5); // red sticky
            ctx.fillStyle = '#fdcb6e'; ctx.fillRect(wb.x - 11, wb.y - 19, 5, 5); // yellow sticky
            ctx.fillStyle = '#00cec9'; ctx.fillRect(wb.x - 4, wb.y - 19, 5, 5);  // cyan sticky
            // Task lines
            ctx.fillStyle = '#2d3436';
            ctx.fillRect(wb.x + 3, wb.y - 18, 14, 1);
            ctx.fillRect(wb.x + 3, wb.y - 15, 10, 1);
            ctx.fillRect(wb.x + 3, wb.y - 12, 12, 1);
            // Green checkmark
            ctx.fillStyle = '#00b894';
            ctx.fillRect(wb.x - 18, wb.y - 12, 3, 3);
          } else if (wbMode === 1) {
            // Mode 1: Tool analytics bar chart
            const barColors = ['#36d399', '#3b82f6', '#f59e0b', '#ec4899'];
            const barHeights = [9, 7, 11, 5];
            for (let bi = 0; bi < 4; bi++) {
              ctx.fillStyle = barColors[bi];
              const bx = wb.x - 16 + bi * 9;
              ctx.fillRect(bx, wb.y - 10 - barHeights[bi], 6, barHeights[bi]);
            }
          } else {
            // Mode 2: Agent hierarchy org chart
            ctx.fillStyle = '#ffd25e'; ctx.fillRect(wb.x - 4, wb.y - 20, 8, 3); // Lami boss box
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(wb.x - 0.5, wb.y - 17, 1, 3); // connector
            ctx.fillRect(wb.x - 12, wb.y - 14, 24, 1); // branch
            // 3 Sub-boxes
            ctx.fillStyle = '#7ec8f2'; ctx.fillRect(wb.x - 15, wb.y - 13, 6, 3);
            ctx.fillStyle = '#8fdba8'; ctx.fillRect(wb.x - 3, wb.y - 13, 6, 3);
            ctx.fillStyle = '#ff8fab'; ctx.fillRect(wb.x + 9, wb.y - 13, 6, 3);
          }

          // Marker tray at bottom
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(wb.x - 14, wb.y - 8, 28, 2);
          ctx.fillStyle = '#e74c3c'; ctx.fillRect(wb.x - 10, wb.y - 9, 4, 1); // red marker
          ctx.fillStyle = '#3498db'; ctx.fillRect(wb.x - 4, wb.y - 9, 4, 1);  // blue marker
          ctx.fillStyle = '#2ecc71'; ctx.fillRect(wb.x + 2, wb.y - 9, 4, 1);  // green marker
          ctx.fillStyle = '#34495e'; ctx.fillRect(wb.x + 8, wb.y - 10, 4, 2); // eraser

          // Isometric Conference Table
          this.drawIsoCube(ctx, 3.0, 2.0, floorIndex, 1.8, 1.2, 7, '#c7926b', '#9b6e4e', '#7a5135');

          // Signature Prop: Sakura Flower Vase on Conference Table
          const flB = Math.sin(this.timeSec * 3 + 3) * 1.2;
          const vsPos = LO.isoToScreen(3.8, 2.5, floorIndex);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(vsPos.x - 2, vsPos.y - 12, 4, 4);
          ctx.fillStyle = '#ff7675';
          ctx.beginPath();
          ctx.arc(vsPos.x, vsPos.y - 15 + flB, 3, 0, Math.PI * 2);
          ctx.fill();
          // Agenda binder
          const bdPos = LO.isoToScreen(4.4, 2.3, floorIndex);
          ctx.fillStyle = '#3498db';
          ctx.fillRect(bdPos.x - 3, bdPos.y - 10, 6, 2);
          break;
        }

        case 'pantry': {
          // Coffee bar counter
          this.drawIsoCube(ctx, 1.5, 1.2, floorIndex, 1.4, 0.8, 8, '#ffffff', '#c8b49e', '#ab9681');

          // Espresso Machine & Animated Steam
          const kp = LO.isoToScreen(1.8, 1.4, floorIndex);
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(kp.x - 4, kp.y - 14, 8, 6);
          const steamY = (this.timeSec * 12) % 8;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillRect(kp.x - 1, kp.y - 16 - steamY, 2, 2);

          // Microwave on counter next to espresso
          const mwPos = LO.isoToScreen(2.5, 1.3, floorIndex);
          ctx.fillStyle = '#2c3e50';
          ctx.fillRect(mwPos.x - 4, mwPos.y - 14, 8, 5);
          ctx.fillStyle = Math.sin(this.timeSec * 2) > 0 ? '#f39c12' : '#34495e';
          ctx.fillRect(mwPos.x - 3, mwPos.y - 13, 4, 3); // door glass
          ctx.fillStyle = '#2ecc71';
          ctx.fillRect(mwPos.x + 2, mwPos.y - 13, 1, 1); // timer display

          // Signature Prop: Donut tray on counter
          const dnPos = LO.isoToScreen(2.2, 1.6, floorIndex);
          ctx.fillStyle = '#d35400';
          ctx.fillRect(dnPos.x - 3, dnPos.y - 10, 6, 2);
          ctx.fillStyle = '#ff7675';
          ctx.fillRect(dnPos.x - 2, dnPos.y - 11, 4, 1);

          // ---- Water Cooler (Claude-Office break area) ----
          this.drawIsoCube(ctx, 5.8, 1.8, floorIndex, 0.6, 0.6, 8, '#ecf0f1', '#bdc3c7', '#95a5a6');
          const wcPos = LO.isoToScreen(6.1, 2.1, floorIndex);
          // Translucent blue bottle on top
          ctx.fillStyle = 'rgba(52, 152, 219, 0.85)';
          ctx.fillRect(wcPos.x - 3, wcPos.y - 16, 6, 7);
          ctx.fillStyle = '#2980b9';
          ctx.fillRect(wcPos.x - 2, wcPos.y - 18, 4, 2);
          // Animated rising bubble
          const bubbleY = ((this.timeSec * 8) % 6);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(wcPos.x, wcPos.y - 11 - bubbleY, 1, 1);
          // Red & blue taps
          ctx.fillStyle = '#e74c3c'; ctx.fillRect(wcPos.x - 2, wcPos.y - 10, 1, 2);
          ctx.fillStyle = '#3498db'; ctx.fillRect(wcPos.x + 1, wcPos.y - 10, 1, 2);

          // Random Office Event Item: Pizza/Martabak Delivery Box
          const office = window.LO?.office;
          if (office && office.pizzaEventTimer > 0) {
            const pzPos = LO.isoToScreen(2.4, 1.8, floorIndex);
            ctx.fillStyle = '#e67e22'; // pizza box
            ctx.fillRect(pzPos.x - 5, pzPos.y - 12, 10, 4);
            ctx.fillStyle = '#d35400';
            ctx.strokeRect(pzPos.x - 4.5, pzPos.y - 11.5, 9, 3);
            ctx.fillStyle = '#f39c12';
            ctx.fillRect(pzPos.x - 2, pzPos.y - 11, 4, 2);
          }

          // Pastel Teal Lounge Sofa
          this.drawIsoCube(ctx, 3.8, 2.2, floorIndex, 1.6, 0.9, 6, '#7ac9af', '#57aa8f', '#3f8d74');

          // Vending machine on North-East wall
          this.drawIsoCube(ctx, 6.2, 1.0, floorIndex, 0.8, 0.8, 16, '#ff7675', '#d65453', '#b83b3a');
          break;
        }

        case 'server': {
          // Array of tall isometric server racks
          [2.0, 3.6, 5.2].forEach((c, idx) => {
            this.drawIsoCube(ctx, c, 1.0, floorIndex, 0.9, 0.8, 18, '#2c2738', '#1c1826', '#14111d');
            const sp = LO.isoToScreen(c + 0.45, 1.4, floorIndex);
            for (let r = 0; r < 3; r++) {
              const b1 = Math.sin(this.timeSec * 6 + idx + r) > 0;
              ctx.fillStyle = b1 ? '#2ecc71' : '#145a32';
              ctx.fillRect(sp.x - 2, sp.y - 14 + r * 4, 2, 2);
              ctx.fillStyle = !b1 ? '#3498db' : '#1b4f72';
              ctx.fillRect(sp.x + 1, sp.y - 14 + r * 4, 2, 2);
            }
          });

          // Mainframe control desk
          this.drawIsoCube(ctx, 4.8, 2.8, floorIndex, 1.0, 0.8, 7, '#34495e', '#2c3e50', '#1a252f');

          // Signature Prop: DevOps Toolkit & Wrench on desk
          const tkB = Math.sin(this.timeSec * 3 + 4) * 1.2;
          const tkPos = LO.isoToScreen(4.5, 2.9, floorIndex);
          ctx.fillStyle = '#95a5a6'; // metal wrench
          ctx.fillRect(tkPos.x - 3, tkPos.y - 12 + tkB, 6, 2);
          ctx.fillStyle = '#e74c3c'; // red handle
          ctx.fillRect(tkPos.x - 1, tkPos.y - 13 + tkB, 2, 4);
          break;
        }
      }
    }
  }

  LO.World = World;
})();
