/* Lami's AI Office — 2D Top-Down / RPG Pixel-Art World & Building Renderer */
(function () {
  const LO = window.LO;

  class World {
    constructor() {
      this.timeSec = 0;
      this.clouds = [
        { x: 30, y: 30, w: 45, speed: 1.2 },
        { x: 420, y: 36, w: 35, speed: 0.9 },
        { x: 900, y: 28, w: 50, speed: 1.4 }
      ];
      this.stars = [];
      const contentW = LO.CONTENT_W || 1408;
      for (let i = 0; i < 70; i++) {
        this.stars.push({
          x: Math.random() * contentW,
          y: 20 + Math.random() * 16,
          s: Math.random() * 1.5 + 0.5,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    update(dt) {
      this.timeSec += dt;
      const contentW = LO.CONTENT_W || 1408;
      for (const c of this.clouds) {
        c.x += c.speed * dt * 10;
        if (c.x > contentW + 60) c.x = -60;
      }
    }

    getSkyTheme() {
      let t;
      if (this.manualTheme === 'night') {
        t = { type: 'night', sky1: '#141226', sky2: '#281f44', light: 0.25 };
      } else if (this.manualTheme === 'sunset') {
        t = { type: 'sunset', sky1: '#ff9a76', sky2: '#644175', light: 0.7 };
      } else if (this.manualTheme === 'day') {
        t = { type: 'day', sky1: '#8ed0f8', sky2: '#c9e8fc', light: 1.0 };
      } else {
        const h = new Date().getHours();
        if (h >= 20 || h < 5) {
          t = { type: 'night', sky1: '#141226', sky2: '#281f44', light: 0.25 };
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

    hasTilemap() {
      return !!(LO.Tilemap && LO.Tilemap.isReady());
    }

    render(ctx) {
      const theme = this.getSkyTheme();
      const contentW = LO.CONTENT_W || 1408;
      const contentH = LO.CONTENT_H || 800;
      const ts = LO.TILE_SIZE || 16;

      // 1. Solid Outer Foundation Fill
      ctx.fillStyle = '#141226';
      ctx.fillRect(0, 0, contentW, contentH);

      // 2. Top Exterior Sky & Roof Signboard (row 0..2)
      this.drawSkyHeader(ctx, theme, contentW);

      if (this.hasTilemap()) {
        // 3. Floors + setback wall faces from the generated tilemap
        LO.Tilemap.drawGround(ctx);

        // 4. Carpets, rugs and furniture (procedural, on top of the tiles)
        this.drawCarpets(ctx, ts);
        this.drawAllFurniture(ctx, ts, theme);

        // 5. Ambient Lighting Pools (Night / Sunset)
        if (theme.type === 'night' || theme.type === 'sunset') {
          this.drawAmbientLighting(ctx, theme, ts);
        }
        return;
      }

      // ---- Fallback: procedural floorplan (used while the tileset loads or if it fails)
      this.drawCorridorFloor(ctx, ts);
      this.drawRoomFloors(ctx, ts);
      this.drawCarpets(ctx, ts);
      this.drawWalls(ctx, ts);
      this.drawWallDecorations(ctx, ts, theme);
      this.drawAllFurniture(ctx, ts, theme);
      if (theme.type === 'night' || theme.type === 'sunset') {
        this.drawAmbientLighting(ctx, theme, ts);
      }
    }

    // Wall tops, door frames and decor are painted after characters for depth.
    renderOverlay(ctx) {
      if (!this.hasTilemap()) return;
      LO.Tilemap.drawWallOverlay(ctx);
    }

    // ---- 1. Sky Header & Roof Banner (32px tall) ----
    drawSkyHeader(ctx, theme, contentW) {
      const headerH = 32;
      const skyGrad = ctx.createLinearGradient(0, 0, 0, headerH);
      skyGrad.addColorStop(0, theme.sky1);
      skyGrad.addColorStop(1, theme.sky2);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, contentW, headerH);

      // Stars in Night / Sunset
      if (theme.type === 'night' || theme.type === 'sunset') {
        ctx.fillStyle = '#ffffff';
        for (const s of this.stars) {
          const alpha = 0.4 + 0.6 * Math.sin(this.timeSec * 2 + s.phase);
          ctx.globalAlpha = (theme.type === 'night' ? 1.0 : 0.4) * Math.max(0, alpha);
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), Math.ceil(s.s), Math.ceil(s.s));
        }
        ctx.globalAlpha = 1.0;

        // Glowing Moon
        ctx.fillStyle = '#fff9d6';
        ctx.beginPath();
        ctx.arc(contentW - 48, 14, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.sky1;
        ctx.beginPath();
        ctx.arc(contentW - 51, 12, 6.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Clouds
      if (theme.type !== 'night') {
        ctx.fillStyle = theme.type === 'sunset' ? '#ffded6' : '#ffffff';
        ctx.globalAlpha = 0.75;
        for (const c of this.clouds) {
          const cx = Math.floor(c.x);
          ctx.beginPath();
          ctx.arc(cx, c.y, 6, 0, Math.PI * 2);
          ctx.arc(cx + 6, c.y - 2, 8, 0, Math.PI * 2);
          ctx.arc(cx + 14, c.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // Roof Signboard Banner (Centered on Header)
      const office = window.LO?.office;
      const isTheOffice = Boolean(office && office.theOfficeMode);
      const bx = Math.floor(contentW / 2);
      const by = 8;

      ctx.fillStyle = isTheOffice ? '#dff9fb' : '#ffd25e';
      ctx.fillRect(bx - 110, by, 220, 18);
      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx - 109.5, by + 0.5, 219, 17);

      ctx.fillStyle = '#3a2838';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isTheOffice ? '📄 DUNDER MIFFLIN HQ' : '👑 LAMI AI OFFICE SUITE', bx, by + 12);

      // Blinking Antenna Beacon
      ctx.fillStyle = '#55445c';
      ctx.fillRect(bx - 116, by - 6, 2, 8);
      const beacon = Math.sin(this.timeSec * 4) > 0;
      ctx.fillStyle = beacon ? '#ff3344' : '#661122';
      ctx.fillRect(bx - 117, by - 8, 4, 3);
    }

    // ---- Fallback 2: Hallway bands + doorway thresholds ----
    drawCorridorFloor(ctx, ts) {
      const bands = LO.HALLWAY_BANDS || [LO.HALLWAY.bounds];
      const cells = [];
      for (const band of bands) {
        if (!band) continue;
        for (let y = band.y1; y <= band.y2; y++) {
          for (let x = band.x1; x <= band.x2; x++) cells.push([x, y]);
        }
      }
      // Doorway tiles sit on the shared wall ring; open them to the hallway floor.
      for (const d of (LO.doorways ? LO.doorways() : [])) {
        for (const t of d.tiles) cells.push([t.x, t.y]);
      }
      for (const [x, y] of cells) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#272437' : '#221f31';
        ctx.fillRect(x * ts, y * ts, ts, ts);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x * ts + 0.5, y * ts + 0.5, ts - 1, ts - 1);
      }
    }

    // ---- Fallback 3: Room floors ----
    drawRoomFloors(ctx, ts) {
      const rooms = LO.ROOMS || {};
      for (const key of ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry']) {
        const r = rooms[key];
        if (!r || !r.bounds) continue;
        const b = r.bounds;

        for (let y = b.y1; y <= b.y2; y++) {
          for (let x = b.x1; x <= b.x2; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? r.floor1 : r.floor2;
            ctx.fillRect(x * ts, y * ts, ts, ts);

            ctx.strokeStyle = 'rgba(58, 40, 56, 0.08)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x * ts + 0.5, y * ts + 0.5, ts - 1, ts - 1);
          }
        }
      }
    }

    // ---- 4. Carpets & Rugs (from LO.ROOMS[].carpet + fixed pads) ----
    drawCarpets(ctx, ts) {
      const boss = LO.ROOMS.boss?.carpet || { x1: 6, y1: 7, x2: 24, y2: 15 };
      const bx = boss.x1 * ts, by = boss.y1 * ts;
      const bw = (boss.x2 - boss.x1 + 1) * ts, bh = (boss.y2 - boss.y1 + 1) * ts;
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(bx, by, bw, bh);

      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);

      // Meeting Room Conference Rug (X: 36..51, Y: 29..33)
      const mx = 36 * ts, my = 29 * ts, mw = 16 * ts, mh = 5 * ts;
      ctx.fillStyle = '#fae3d2';
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#b56d43';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx + 1, my + 1, mw - 2, mh - 2);

      // Pantry Lounge Sofa Rug (X: 61..72, Y: 32..38)
      const px = 61 * ts, py = 32 * ts, pw = 12 * ts, ph = 7 * ts;
      ctx.fillStyle = '#a7f3d0';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    }

    // ---- Fallback 5: Procedural shared-wall floorplan ----
    drawCozyBrickFace(ctx, x, y, w, h, baseColor, brickDark) {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);

      const courseH = 4;
      const brickW = 8;
      const numCourses = Math.floor(h / courseH);

      ctx.fillStyle = brickDark || 'rgba(40, 20, 15, 0.28)';
      for (let ci = 0; ci < numCourses; ci++) {
        const cy = y + ci * courseH;
        ctx.fillRect(x, cy + courseH - 1, w, 1);
        const offset = (ci % 2) * (brickW / 2);
        for (let bx = x + offset; bx < x + w; bx += brickW) {
          ctx.fillRect(bx, cy, 1, courseH);
        }
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, y, w, 1);
    }

    drawWalls(ctx, ts) {
      const rooms = LO.ROOMS || {};
      const wallDepth = 24;
      const oakTrim = '#5a3d28';
      const oakHighlight = '#8c5d3b';
      const oakShadow = '#382215';
      const building = LO.BUILDING;
      if (!building) return;

      const doorSet = new Set();
      for (const d of (LO.doorways ? LO.doorways() : [])) {
        for (const t of d.tiles) doorSet.add(`${t.x},${t.y}`);
      }

      // A. Perimeter envelope (north + south faces)
      const envelope = [
        { x: building.x1, y: building.y1, w: (building.x2 - building.x1 + 1) * ts, faceUp: true },
        { x: building.x1, y: building.y2, w: (building.x2 - building.x1 + 1) * ts, faceUp: false }
      ];
      for (const seg of envelope) {
        this.drawCozyBrickFace(ctx, seg.x * ts, seg.y * ts, seg.w, ts, '#4a3b32', '#33241c', oakTrim);
        ctx.fillStyle = oakHighlight;
        ctx.fillRect(seg.x * ts, seg.y * ts, seg.w, 2);
        ctx.fillStyle = seg.faceUp ? oakShadow : oakHighlight;
        ctx.fillRect(seg.x * ts, seg.y * ts + ts - 1, seg.w, 1);
      }
      // East / west walls
      for (const x of [building.x1, building.x2]) {
        const h = (building.y2 - building.y1 + 1) * ts;
        this.drawCozyBrickFace(ctx, x * ts, building.y1 * ts, ts, h, '#4a3b32', '#33241c', oakTrim);
      }
      // Strip the perimeter back off the hallway openings
      for (const band of (LO.HALLWAY_BANDS || [])) {
        if (!band) continue;
        for (let y = band.y1; y <= band.y2; y++) {
          for (let x = band.x1; x <= band.x2; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#272437' : '#221f31';
            ctx.fillRect(x * ts, y * ts, ts, ts);
          }
        }
        this.drawDoorFrame(ctx, ts, band.x1, band.y2, 'S');
      }

      // B. Shared partition walls: ring each room, drawn once via a dedupe set
      const drawn = new Set();
      const paintWall = (x, y, color, dark) => {
        const k = `${x},${y}`;
        if (drawn.has(k) || doorSet.has(k)) return;
        drawn.add(k);
        const px = x * ts, py = y * ts;
        this.drawCozyBrickFace(ctx, px, py, ts, ts, color || oakTrim, dark || oakShadow, oakTrim);
        ctx.fillStyle = 'rgba(140, 93, 59, 0.85)';
        ctx.fillRect(px, py, ts, 2);
        ctx.strokeStyle = '#2d2438';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
      };

      for (const key of ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry']) {
        const r = rooms[key];
        if (!r || !r.bounds) continue;
        const b = r.bounds;
        for (let x = b.x1 - 1; x <= b.x2 + 1; x++) {
          paintWall(x, b.y1 - 1, r.wall, r.wallDark);
          paintWall(x, b.y2 + 1, r.wall, r.wallDark);
        }
        for (let y = b.y1 - 1; y <= b.y2 + 1; y++) {
          paintWall(b.x1 - 1, y, r.wall, r.wallDark);
          paintWall(b.x2 + 1, y, r.wall, r.wallDark);
        }
      }

      // C. Doorway frames
      for (const key of ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry']) {
        const r = rooms[key];
        if (!r || !r.door) continue;
        this.drawDoorFrame(ctx, ts, r.door.x, r.door.y, r.door.side || 'S');
      }
    }

    drawDoorFrame(ctx, ts, doorX, doorY, side) {
      const px = doorX * ts;
      const py = doorY * ts;
      ctx.fillStyle = '#5a3d28';
      ctx.fillRect(px, py, 3, ts);
      ctx.fillRect(px + 2 * ts - 3, py, 3, ts);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(px + 3, py + (side === 'S' ? ts - 4 : 0), 2 * ts - 6, 4);
      ctx.fillStyle = 'rgba(15, 10, 25, 0.15)';
      ctx.fillRect(px, side === 'S' ? py + ts : py - 4, 2 * ts, 4);
    }

    // ---- Fallback 6: Wall-mounted decorations around the new plan ----
    drawWallDecorations(ctx, ts, theme) {
      const boss = LO.ROOMS.boss.bounds;
      [boss.x1 + 4, boss.x2 - 5].forEach((wx) => {
        const xPx = wx * ts, yPx = boss.y1 * ts - 8;
        ctx.fillStyle = theme.type === 'night' ? '#181730' : '#88c8f7';
        ctx.fillRect(xPx, yPx, 2 * ts, 14);
        ctx.strokeStyle = '#ba854d';
        ctx.lineWidth = 1;
        ctx.strokeRect(xPx + 0.5, yPx + 0.5, 2 * ts - 1, 13);
      });

      const wb = LO.PROPS?.whiteboard || { x: 34, y: 24 };
      this.drawWhiteboard(ctx, wb.x * ts, (wb.y - 1.5) * ts);

      // Doorway signboards (hallway side of each door)
      for (const key of ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry']) {
        const r = LO.ROOMS[key];
        if (!r || !r.door) continue;
        const side = r.door.side || 'S';
        const sx = (r.door.x + 1) * ts;
        const sy = (r.door.y + (side === 'S' ? 2 : -2)) * ts;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(sx - 20, sy - 8, 40, 9);
        ctx.strokeStyle = '#3a2838';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 19.5, sy - 7.5, 39, 8);
        ctx.fillStyle = '#3a2838';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${r.icon} ${r.short}`, sx, sy - 1.5);
      }
    }

    // ---- 7. 2D Furniture & Props ----
    drawAllFurniture(ctx, ts, theme) {
      this.drawBossOffice(ctx, ts, theme);
      this.drawResearchLab(ctx, ts, theme);
      this.drawServerRoom(ctx, ts, theme);
      this.drawEngineeringPit(ctx, ts, theme);
      this.drawMeetingRoom(ctx, ts, theme);
      this.drawPantryLounge(ctx, ts, theme);
      this.drawElevatorLobby(ctx, ts, theme);
    }

    // Helper: 2D Block
    draw2DBlock(ctx, xPx, yPx, wPx, hPx, topH, topColor, frontColor, outlineColor) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(xPx + 2, yPx + hPx - 2, wPx, 4);

      ctx.fillStyle = frontColor;
      ctx.fillRect(xPx, yPx + topH, wPx, hPx - topH);

      ctx.fillStyle = topColor;
      ctx.fillRect(xPx, yPx, wPx, topH);

      ctx.strokeStyle = outlineColor || '#2d2438';
      ctx.lineWidth = 1;
      ctx.strokeRect(xPx + 0.5, yPx + 0.5, wPx - 1, hPx - 1);
    }

    // Specific Room 1: Boss Office (interior X: 2..27, Y: 3..18)
    drawBossOffice(ctx, ts, theme) {
      // Grand Executive Desk (X: 11..17, Y: 7)
      const dx = 11 * ts, dy = 7 * ts, dw = 7 * ts, dh = 1.2 * ts;
      this.draw2DBlock(ctx, dx, dy, dw, dh, 14, '#7a3e2e', '#5a2b1e', '#ffd25e');

      // Executive Leather Swivel Chair (behind the desk)
      const cx = 14 * ts + 8, cy = 6 * ts;
      ctx.fillStyle = '#1f1e24';
      ctx.beginPath();
      ctx.arc(cx, cy + 8, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd25e';
      ctx.fillRect(cx - 3, cy + 4, 2, 2);
      ctx.fillRect(cx + 1, cy + 4, 2, 2);

      // Gold Laptop on Desk
      const lx = 13 * ts, ly = 6.9 * ts;
      ctx.fillStyle = '#ffd25e';
      ctx.fillRect(lx, ly, 14, 8);
      ctx.fillStyle = '#fff9d6';
      ctx.fillRect(lx + 2, ly + 1, 10, 5);

      // "Best Boss" Mug
      const mx = 11.6 * ts, my = 7 * ts;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx, my, 6, 6);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(mx + 2, my + 2, 2, 2);

      // Floating Gold Crown Easter Egg
      const crownBob = Math.sin(this.timeSec * 3) * 2;
      const crX = 14.5 * ts, crY = 5.1 * ts + crownBob;
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(crX, crY, 10, 4);
      ctx.fillRect(crX, crY - 3, 2, 3);
      ctx.fillRect(crX + 4, crY - 4, 2, 4);
      ctx.fillRect(crX + 8, crY - 3, 2, 3);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(crX + 4, crY + 1, 2, 2);

      // Potted Luxury Monstera Plant
      const px = 4 * ts, py = 5 * ts;
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(px, py + 8, 14, 10);
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(px + 7, py + 5, 8, 0, Math.PI * 2);
      ctx.fill();

      // Second plant on the east side
      const p2x = 25 * ts, p2y = 5 * ts;
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(p2x, p2y + 8, 14, 10);
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(p2x + 7, p2y + 5, 8, 0, Math.PI * 2);
      ctx.fill();

      // Boss bookshelf (X: 8, Y: 6)
      this.draw2DBlock(ctx, 8 * ts, 6 * ts, 1 * ts, 1.2 * ts, 8, '#5c4033', '#3d2b22');

      // Context Window Trashcan (Interactive Prop)
      const tc = LO.PROPS?.trashcan || { x: 20, y: 6 };
      this.drawContextTrashcan(ctx, (tc.x + 0.5) * ts, (tc.y + 0.5) * ts);

      // Guest chairs facing the desk
      const chairs = LO.SLOTS?.boss || [];
      for (const s of chairs.slice(1)) {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc((s.col + 0.5) * ts, (s.row + 0.5) * ts, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Interactive Prop: Context Window Trashcan
    drawContextTrashcan(ctx, tx, ty) {
      const office = window.LO?.office;
      const ctxUsage = office ? office.contextUsage : 0.42;

      this.draw2DBlock(ctx, tx - 7, ty - 5, 14, 14, 6, '#95a5a6', '#7f8c8d', '#576574');

      const paperCount = Math.min(Math.floor(ctxUsage * 10), 10);
      const paperColors = ['#ffffff', '#f1f2f6', '#fed330', '#dff9fb'];
      for (let p = 0; p < paperCount; p++) {
        const pxOffset = ((p * 5) % 6) - 3;
        const pyOffset = -Math.min(p * 1.2, 8);
        ctx.fillStyle = paperColors[p % paperColors.length];
        ctx.fillRect(tx + pxOffset - 2, ty - 6 + pyOffset, 4, 3);
      }

      if (ctxUsage > 0.7) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(tx + 10, ty + 2, 4, 3);
        ctx.fillRect(tx - 12, ty + 4, 4, 3);
      }

      const pct = Math.round(ctxUsage * 100);
      const tBob = Math.sin(this.timeSec * 3) * 1.5;
      ctx.fillStyle = ctxUsage > 0.8 ? '#e74c3c' : (ctxUsage > 0.5 ? '#f39c12' : '#27ae60');
      ctx.fillRect(tx - 16, ty - 22 + tBob, 32, 9);
      ctx.strokeStyle = '#3a2838';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx - 15.5, ty - 21.5 + tBob, 31, 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${pct}% 🗑️`, tx, ty - 15 + tBob);
    }

    // Specific Room 2: Research Lab (interior X: 30..55, Y: 3..18)
    drawResearchLab(ctx, ts, theme) {
      // 3 Workstations with Dual Monitors at desk rows (X: 33, 41, 49 @ Y: 9)
      [33, 41, 49].forEach((dx) => {
        this.draw2DBlock(ctx, dx * ts, 9 * ts, 3 * ts, 1.1 * ts, 12, '#8f7762', '#6b5443');

        const m1x = dx * ts + 3, my = 9 * ts - 2;
        const m2x = dx * ts + 26;
        [m1x, m2x].forEach((mx) => {
          ctx.fillStyle = '#2c3e50';
          ctx.fillRect(mx, my, 13, 9);
          ctx.fillStyle = '#7ec8f2';
          ctx.fillRect(mx + 1, my + 1, 11, 7);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(mx + 2, my + 5);
          ctx.lineTo(mx + 5, my + 3);
          ctx.lineTo(mx + 8, my + 6);
          ctx.lineTo(mx + 11, my + 4);
          ctx.stroke();
        });
      });

      // Microscope Station (X: 33..34, Y: 15)
      const scX = 33 * ts, scY = 15 * ts;
      this.draw2DBlock(ctx, scX, scY, 2 * ts, 1.1 * ts, 10, '#ffffff', '#cbd5e1');
      ctx.fillStyle = '#34495e';
      ctx.fillRect(scX + 8, scY + 1, 5, 8);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(scX + 9, scY - 2, 3, 3);
      ctx.fillStyle = '#00bcd4';
      ctx.beginPath();
      ctx.arc(scX + 22, scY + 5, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Lab bookshelves (X: 49..53, Y: 3) + corkboard (X: 31..34, Y: 4)
      const bsX = 49 * ts, bsY = 3 * ts;
      this.draw2DBlock(ctx, bsX, bsY, 5 * ts, 1 * ts, 10, '#5c4033', '#3d2b22');
      const bookColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c'];
      for (let bi = 0; bi < 20; bi++) {
        ctx.fillStyle = bookColors[bi % bookColors.length];
        ctx.fillRect(bsX + 3 + bi * 3.6, bsY + 3, 2.6, 9);
      }

      const cbX = 31 * ts, cbY = 4 * ts;
      this.draw2DBlock(ctx, cbX, cbY, 4 * ts, 1 * ts, 10, '#c79867', '#8c5828');
      ctx.fillStyle = '#ff8fa3'; ctx.fillRect(cbX + 5, cbY + 3, 6, 5);
      ctx.fillStyle = '#ffd25e'; ctx.fillRect(cbX + 17, cbY + 3, 6, 5);
      ctx.fillStyle = '#7ec8f2'; ctx.fillRect(cbX + 29, cbY + 3, 6, 5);

      // Journal stack on the middle desk
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(43 * ts + 2, 9.2 * ts, 10, 4);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(43 * ts + 4, 9.2 * ts, 6, 1);
    }

    // Specific Room 3: Server Room (interior X: 58..83, Y: 3..18)
    drawServerRoom(ctx, ts, theme) {
      // Glowing raised-floor cable duct down the aisle
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(69 * ts, 4 * ts, 3 * ts, 12 * ts);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(69 * ts + 0.5, 4 * ts + 0.5, 3 * ts - 1, 12 * ts - 1);

      // 4 Dark Server Racks (X: 63, 69, 75, 81 @ Y: 6..7)
      [63, 69, 75, 81].forEach((rx, idx) => {
        const xPx = rx * ts, yPx = 6 * ts;
        this.draw2DBlock(ctx, xPx, yPx, (idx === 3 ? 2 : 3) * ts, 2 * ts, 10, '#2c2738', '#1c1826');

        for (let row = 0; row < 3; row++) {
          const ly = yPx + 10 + row * 6;
          const b1 = Math.sin(this.timeSec * 8 + idx + row) > 0;
          const b2 = Math.sin(this.timeSec * 5 + idx * 1.5 + row) > 0;
          ctx.fillStyle = b1 ? '#2ecc71' : '#145a32';
          ctx.fillRect(xPx + 5, ly, 3, 2);
          ctx.fillStyle = b2 ? '#38bdf8' : '#0369a1';
          ctx.fillRect(xPx + 11, ly, 3, 2);
          ctx.fillStyle = !b1 ? '#f59e0b' : '#78350f';
          ctx.fillRect(xPx + 17, ly, 3, 2);
        }
      });

      // Wall monitor: live CPU/RAM per agent VM. Numbers come from each agent's
      // own metrics endpoint (deploy/metrics_agent.py); when a host does not
      // report, the row says so instead of drawing a fake gauge.
      this.drawVmMonitor(ctx, ts);

      // Mainframe Ops Console Desk (X: 66..71, Y: 14)
      const cx = 66 * ts, cy = 14 * ts;
      this.draw2DBlock(ctx, cx, cy, 6 * ts, 1.2 * ts, 12, '#34495e', '#2c3e50');

      [cx + 6, cx + 36, cx + 66].forEach((mx, i) => {
        ctx.fillStyle = '#111827';
        ctx.fillRect(mx, cy - 2, 14, 8);
        ctx.fillStyle = i === 0 ? '#2ecc71' : (i === 1 ? '#38bdf8' : '#34d399');
        ctx.fillRect(mx + 1, cy - 1, 12, 5);
      });

      const tkX = cx + 12, tkY = cy + 5;
      const tkB = Math.sin(this.timeSec * 3 + 4) * 1.2;
      ctx.fillStyle = '#95a5a6';
      ctx.fillRect(tkX, tkY + tkB, 8, 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(tkX + 2, tkY - 1 + tkB, 2, 4);
    }

    // Specific Room 4: Engineering Pit (interior X: 2..27, Y: 24..39)
    drawEngineeringPit(ctx, ts, theme) {
      const pods = [
        { x: 6, y: 27 }, { x: 11, y: 27 },
        { x: 6, y: 32 }, { x: 11, y: 32 },
        { x: 17, y: 30 }, { x: 22, y: 30 }
      ];

      for (const p of pods) {
        const xPx = p.x * ts, yPx = p.y * ts;
        this.draw2DBlock(ctx, xPx, yPx, 3 * ts, 1.1 * ts, 12, '#453d54', '#322c3e');

        ctx.fillStyle = '#1e1927';
        ctx.fillRect(xPx + 6, yPx - 2, 16, 9);
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(xPx + 7, yPx - 1, 14, 7);
        ctx.fillStyle = '#36d399';
        ctx.fillRect(xPx + 9, yPx + 1, 9, 1);
        ctx.fillRect(xPx + 9, yPx + 3, 7, 1);
        if (Math.sin(this.timeSec * 8) > 0) {
          ctx.fillRect(xPx + 17, yPx + 3, 2, 2);
        }
      }

      // Yellow Rubber Duck Debugger
      const dkB = Math.sin(this.timeSec * 3 + 2) * 1.5;
      const dkX = 7 * ts, dkY = 27 * ts + dkB;
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(dkX, dkY, 6, 5);
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(dkX + 6, dkY + 1, 3, 2);

      // Green Energy Drink Can
      const canX = 9 * ts, canY = 27.1 * ts;
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(canX, canY, 4, 6);
      ctx.fillStyle = '#111111';
      ctx.fillRect(canX + 1, canY + 1, 2, 4);

      // Mini Server Tower / Custom Rig (X: 16, Y: 27)
      const rigX = 16 * ts, rigY = 27 * ts;
      this.draw2DBlock(ctx, rigX, rigY, 1 * ts, 1.2 * ts, 8, '#221b2c', '#15101c');
      const rgbColor = ['#ff7675', '#74b9ff', '#55efc4', '#a29bfe'][Math.floor(this.timeSec * 2) % 4];
      ctx.fillStyle = rgbColor;
      ctx.fillRect(rigX + 3, rigY + 6, 8, 8);
    }

    // Specific Room 5: Meeting Room (interior X: 30..55, Y: 24..39)
    drawMeetingRoom(ctx, ts, theme) {
      // Large Conference Table (X: 38..49, Y: 30..32)
      const tx = 38 * ts, ty = 30 * ts, tw = 12 * ts, th = 3 * ts;
      this.draw2DBlock(ctx, tx, ty, tw, th, 16, '#c7926b', '#9b6e4e');

      // Chairs: north row, south row, heads
      [41, 44, 47].forEach((c) => {
        ctx.fillStyle = '#334155';
        ctx.beginPath(); ctx.arc((c + 0.5) * ts, 29.4 * ts, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc((c + 0.5) * ts, 33.6 * ts, 6, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(37.2 * ts, 31.5 * ts, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(49.8 * ts, 31.5 * ts, 6, 0, Math.PI * 2); ctx.fill();

      // Sakura Flower Vase Centerpiece
      const flB = Math.sin(this.timeSec * 3 + 3) * 1.2;
      const vsX = 44 * ts, vsY = 31 * ts;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(vsX - 3, vsY - 3, 6, 6);
      ctx.fillStyle = '#ff7675';
      ctx.beginPath();
      ctx.arc(vsX, vsY - 6 + flB, 4, 0, Math.PI * 2);
      ctx.fill();

      // Agenda Binder on Table
      ctx.fillStyle = '#3498db';
      ctx.fillRect(vsX + 22, vsY - 1, 8, 4);
    }

    // ---- VM resource monitor (Server Room) ----
    staticGaugeColor(percent) {
      if (percent == null) return '#475569';
      if (percent >= 85) return '#e74c3c';
      if (percent >= 65) return '#f59e0b';
      return '#2ecc71';
    }

    drawVmMonitor(ctx, ts) {
      const office = (typeof window !== 'undefined') ? window.LO?.office : null;
      const data = office ? office.vmResources : null;
      const agents = (data && Array.isArray(data.agents)) ? data.agents : [];

      const x = 58 * ts + 4;
      const y = 9.1 * ts;
      const w = 25 * ts - 8;
      const rowH = 13;
      const h = 14 + Math.max(agents.length, 1) * rowH;

      // Bezel + screen
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      ctx.font = '5px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText('VM RESOURCES', x + 4, y + 9);

      if (!agents.length) {
        ctx.fillStyle = '#64748b';
        ctx.fillText('menunggu metrik agent...', x + 4, y + 22);
        return;
      }

      const barW = 84;
      const cpuX = x + 96;
      const memX = x + 96 + barW + 46;

      agents.slice(0, 6).forEach((a, i) => {
        const ry = y + 14 + i * rowH;
        const online = a.online !== false;
        const has = Boolean(a.has_metrics);

        // name
        ctx.fillStyle = online ? '#e2e8f0' : '#64748b';
        const label = `${a.icon || '•'} ${String(a.name || a.id || '?').slice(0, 8)}`;
        ctx.fillText(label, x + 4, ry + 8);

        // CPU
        ctx.fillStyle = '#64748b';
        ctx.fillText('CPU', cpuX - 22, ry + 8);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cpuX, ry + 2, barW, 7);
        if (has && a.cpu_percent != null) {
          ctx.fillStyle = this.staticGaugeColor(a.cpu_percent);
          ctx.fillRect(cpuX, ry + 2, Math.max(1, (barW * Math.min(100, a.cpu_percent)) / 100), 7);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(`${Math.round(a.cpu_percent)}%`, cpuX + barW + 4, ry + 8);
        } else {
          ctx.fillStyle = '#64748b';
          ctx.fillText('--', cpuX + barW + 4, ry + 8);
        }

        // RAM
        ctx.fillStyle = '#64748b';
        ctx.fillText('RAM', memX - 22, ry + 8);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(memX, ry + 2, barW, 7);
        if (has && a.mem_percent != null) {
          ctx.fillStyle = this.staticGaugeColor(a.mem_percent);
          ctx.fillRect(memX, ry + 2, Math.max(1, (barW * Math.min(100, a.mem_percent)) / 100), 7);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(`${Math.round(a.mem_percent)}%`, memX + barW + 4, ry + 8);
        } else {
          ctx.fillStyle = '#64748b';
          ctx.fillText('--', memX + barW + 4, ry + 8);
        }
      });
    }

    // Interactive Prop: Multi-Mode Whiteboard
    drawWhiteboard(ctx, xPx, yPx) {
      const office = window.LO?.office;
      const wbMode = office ? (office.whiteboardMode || 0) : 0;
      const wbW = 80, wbH = 28;

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(xPx, yPx, wbW, wbH);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(xPx + 0.5, yPx + 0.5, wbW - 1, wbH - 1);

      const tabLabels = ['TASKS', 'TOOLS', 'TEAM'];
      for (let ti = 0; ti < 3; ti++) {
        const tabX = xPx + 2 + ti * 26;
        ctx.fillStyle = wbMode === ti ? '#3b82f6' : '#cbd5e1';
        ctx.fillRect(tabX, yPx + 1, 25, 6);
        ctx.fillStyle = wbMode === ti ? '#ffffff' : '#475569';
        ctx.font = '4px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(tabLabels[ti], tabX + 12.5, yPx + 5.5);
      }

      if (wbMode === 0) {
        ctx.fillStyle = '#ff7675'; ctx.fillRect(xPx + 4, yPx + 9, 7, 7);
        ctx.fillStyle = '#fdcb6e'; ctx.fillRect(xPx + 13, yPx + 9, 7, 7);
        ctx.fillStyle = '#00cec9'; ctx.fillRect(xPx + 22, yPx + 9, 7, 7);
        ctx.fillStyle = '#2d3436';
        ctx.fillRect(xPx + 34, yPx + 10, 40, 1);
        ctx.fillRect(xPx + 34, yPx + 15, 30, 1);
        ctx.fillRect(xPx + 34, yPx + 20, 36, 1);
        ctx.fillStyle = '#00b894';
        ctx.fillRect(xPx + 4, yPx + 19, 5, 5);
      } else if (wbMode === 1) {
        const barColors = ['#36d399', '#3b82f6', '#f59e0b', '#ec4899'];
        const barHeights = [14, 10, 17, 8];
        for (let bi = 0; bi < 4; bi++) {
          ctx.fillStyle = barColors[bi];
          ctx.fillRect(xPx + 10 + bi * 16, yPx + 25 - barHeights[bi], 10, barHeights[bi]);
        }
      } else {
        ctx.fillStyle = '#ffd25e'; ctx.fillRect(xPx + 30, yPx + 8, 20, 5);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(xPx + 39.5, yPx + 13, 1, 3);
        ctx.fillRect(xPx + 15, yPx + 16, 50, 1);
        ctx.fillStyle = '#7ec8f2'; ctx.fillRect(xPx + 10, yPx + 17, 13, 5);
        ctx.fillStyle = '#8fdba8'; ctx.fillRect(xPx + 34, yPx + 17, 13, 5);
        ctx.fillStyle = '#ff8fab'; ctx.fillRect(xPx + 58, yPx + 17, 13, 5);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(xPx + 10, yPx + wbH - 2, 60, 2);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(xPx + 14, yPx + wbH - 3, 5, 1);
      ctx.fillStyle = '#3498db'; ctx.fillRect(xPx + 24, yPx + wbH - 3, 5, 1);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(xPx + 34, yPx + wbH - 3, 5, 1);
      ctx.fillStyle = '#3498db'; ctx.fillRect(xPx + 46, yPx + wbH - 4, 6, 2);
    }

    // Specific Room 6: Pantry & Lounge (interior X: 58..83, Y: 24..39)
    drawPantryLounge(ctx, ts, theme) {
      // Coffee Bar Marble Counter (X: 60..65, Y: 27)
      const cx = 60 * ts, cy = 27 * ts;
      this.draw2DBlock(ctx, cx, cy, 6 * ts, 1.2 * ts, 12, '#ffffff', '#c8b49e');

      const kpX = cx + 8, kpY = cy - 2;
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(kpX, kpY, 14, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(kpX + 2, kpY + 2, 4, 3);
      const steamY = (this.timeSec * 15) % 10;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(kpX + 3, kpY - 3 - steamY, 2, 2);

      // Microwave Oven
      const mwX = cx + 34, mwY = cy - 2;
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(mwX, mwY, 14, 9);
      ctx.fillStyle = '#34495e';
      ctx.fillRect(mwX + 2, mwY + 2, 7, 5);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(mwX + 10, mwY + 2, 2, 2);

      // Donut Tray
      const dnX = cx + 62, dnY = cy + 2;
      ctx.fillStyle = '#d35400';
      ctx.fillRect(dnX, dnY, 10, 4);
      ctx.fillStyle = '#ff7675';
      ctx.fillRect(dnX + 2, dnY + 1, 6, 2);

      // Interactive Water Cooler Dispenser
      const wc = LO.PROPS?.watercooler || { x: 74, y: 28 };
      this.drawWaterCooler(ctx, wc.x * ts, wc.y * ts, ts);

      // Pastel Teal Lounge Sofa (X: 63..68, Y: 33)
      const sX = 63 * ts, sY = 33 * ts;
      this.draw2DBlock(ctx, sX, sY, 6 * ts, 1.1 * ts, 10, '#7ac9af', '#57aa8f');

      // Low Wood Coffee Table (X: 68..70, Y: 36)
      this.draw2DBlock(ctx, 68 * ts, 36 * ts, 3 * ts, 1.0 * ts, 8, '#c7926b', '#9b6e4e');

      // Snack Vending Machine along East wall (X: 78..80, Y: 33..34)
      const vmX = 78 * ts, vmY = 33 * ts;
      this.draw2DBlock(ctx, vmX, vmY, 3 * ts, 2 * ts, 8, '#ff7675', '#d65453');
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(vmX + 3, vmY + 8, 40, 22);
      const snackColors = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899'];
      for (let si = 0; si < 4; si++) {
        ctx.fillStyle = snackColors[si];
        ctx.fillRect(vmX + 5 + si * 9, vmY + 12, 6, 8);
      }

      // Pizza / Martabak Event Item on Table
      const office = window.LO?.office;
      if (office && office.pizzaEventTimer > 0) {
        const pzX = 68 * ts + 2, pzY = 36 * ts + 2;
        ctx.fillStyle = '#e67e22';
        ctx.fillRect(pzX, pzY, 14, 5);
        ctx.strokeStyle = '#d35400';
        ctx.strokeRect(pzX + 0.5, pzY + 0.5, 13, 4);
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(pzX + 3, pzY + 1, 8, 3);
      }
    }

    // Interactive Prop: Water Cooler
    drawWaterCooler(ctx, wx, wy, ts) {
      ts = ts || LO.TILE_SIZE || 16;
      this.draw2DBlock(ctx, wx + 1, wy + 4, 14, 12, 6, '#ecf0f1', '#bdc3c7');

      ctx.fillStyle = 'rgba(52, 152, 219, 0.85)';
      ctx.fillRect(wx + 2, wy - 6, 12, 10);
      ctx.fillStyle = '#2980b9';
      ctx.fillRect(wx + 4, wy - 9, 8, 3);

      const bubbleY = (this.timeSec * 8) % 7;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx + 7, wy + 1 - bubbleY, 2, 2);

      ctx.fillStyle = '#e74c3c'; ctx.fillRect(wx + 3, wy + 7, 2, 3);
      ctx.fillStyle = '#3498db'; ctx.fillRect(wx + 9, wy + 7, 2, 3);
    }

    // Entrance lobby (west side of the central hallway): mat, door and sign
    drawElevatorLobby(ctx, ts, theme) {
      const ent = LO.ENTRANCE || { x: 2, y: 21 };
      // Glass entrance door punched through the west wall at the hallway row
      const ex = 1 * ts, ey = 20 * ts;
      ctx.fillStyle = '#88c8f7';
      ctx.fillRect(ex, ent.y * ts, 2, 3 * ts);
      ctx.strokeStyle = '#5a3d28';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ex + 0.5, ent.y * ts + 0.5, 1.5, 3 * ts - 1);
      // Welcome mat inside the entrance
      ctx.fillStyle = '#2f6d46';
      ctx.fillRect(ent.x * ts, ent.y * ts, ts, ts);
      ctx.fillStyle = '#a7f3d0';
      ctx.fillRect(ent.x * ts + 3, ent.y * ts + 7, ts - 6, 2);
      // Reception plaque above the door
      ctx.fillStyle = '#ffd25e';
      ctx.fillRect(ex + 4, ey - 12, 66, 9);
      ctx.strokeStyle = '#3a2838';
      ctx.strokeRect(ex + 4.5, ey - 11.5, 65, 8);
      ctx.fillStyle = '#3a2838';
      ctx.font = '5px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🚪 LOBBY', ex + 37, ey - 5.5);
    }

    // ---- 8. Ambient Lighting Pools (Night / Sunset) ----
    drawAmbientLighting(ctx, theme, ts) {
      const lightSources = [
        { x: 14 * ts, y: 7 * ts, r: 120, color: 'rgba(255, 238, 175, 0.22)' },  // Boss Desk
        { x: 42 * ts, y: 11 * ts, r: 110, color: 'rgba(186, 230, 253, 0.18)' }, // Research Lab
        { x: 71 * ts, y: 7 * ts, r: 120, color: 'rgba(56, 189, 248, 0.16)' },   // Server Racks
        { x: 14 * ts, y: 30 * ts, r: 130, color: 'rgba(167, 243, 208, 0.18)' }, // Engineering
        { x: 44 * ts, y: 31 * ts, r: 120, color: 'rgba(254, 215, 170, 0.20)' }, // Meeting Room
        { x: 63 * ts, y: 28 * ts, r: 115, color: 'rgba(254, 240, 138, 0.22)' }  // Pantry Bar
      ];

      for (const ls of lightSources) {
        const grad = ctx.createRadialGradient(ls.x, ls.y, 10, ls.x, ls.y, ls.r);
        grad.addColorStop(0, ls.color);
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ls.x, ls.y, ls.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- Backward Compatibility Wrappers ----
    drawIsometricFloor(ctx, floorIndex, theme) {
      this.render(ctx);
    }

    drawIsoCube(ctx, col, row, floor, wCols, dRows, hPx, topCol, leftCol, rightCol) {
      const ts = LO.TILE_SIZE || 16;
      this.draw2DBlock(ctx, col * ts, row * ts, wCols * ts, dRows * ts, Math.min(hPx, dRows * ts), topCol, leftCol || topCol, rightCol || topCol);
    }

    drawBackWallNW() {}
    drawBackWallNE() {}
    drawFloorSlab() {}
    drawRoofBanner(ctx) {
      const theme = this.getSkyTheme();
      this.drawSkyHeader(ctx, theme, LO.CONTENT_W || 1408);
    }
    drawRoomProps() {}
  }

  LO.World = World;
})();
