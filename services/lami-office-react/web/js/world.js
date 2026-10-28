/* Lami's AI Office — 2D Top-Down / RPG Pixel-Art World & Building Renderer */
(function () {
  const LO = window.LO;

  class World {
    constructor() {
      this.timeSec = 0;
      this.clouds = [
        { x: 30, y: 8, w: 45, speed: 1.2 },
        { x: 320, y: 12, w: 35, speed: 0.9 },
        { x: 680, y: 6, w: 50, speed: 1.4 }
      ];
      this.stars = [];
      const contentW = LO.CONTENT_W || 1024;
      for (let i = 0; i < 45; i++) {
        this.stars.push({
          x: Math.random() * contentW,
          y: Math.random() * 32,
          s: Math.random() * 1.5 + 0.5,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    update(dt) {
      this.timeSec += dt;
      const contentW = LO.CONTENT_W || 1024;
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

    render(ctx) {
      const theme = this.getSkyTheme();
      const contentW = LO.CONTENT_W || 1024;
      const contentH = LO.CONTENT_H || 576;
      const ts = LO.TILE_SIZE || 16;

      // 1. Solid Outer Foundation Fill
      ctx.fillStyle = '#141226';
      ctx.fillRect(0, 0, contentW, contentH);

      // 2. Top Exterior Sky & Roof Signboard (Y: 0..1)
      this.drawSkyHeader(ctx, theme, contentW);

      // 3. Central Corridor Floor (Y: 15..18)
      this.drawCorridorFloor(ctx, ts);

      // 4. Room Floors for all 6 rooms
      this.drawRoomFloors(ctx, ts);

      // 5. Special Carpets & Runners
      this.drawCarpets(ctx, ts);

      // 6. Walls, Partitions, and Doorway Transitions
      this.drawWalls(ctx, ts);

      // 7. Wall-Mounted Decorations & Windows
      this.drawWallDecorations(ctx, ts, theme);

      // 8. 2D Office Furniture & Room Props
      this.drawAllFurniture(ctx, ts, theme);

      // 9. Ambient Lighting Pools (Night / Sunset)
      if (theme.type === 'night' || theme.type === 'sunset') {
        this.drawAmbientLighting(ctx, theme, ts);
      }
    }

    // ---- 1. Sky Header & Roof Banner ----
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

    // ---- 2. Central Corridor Floor ----
    drawCorridorFloor(ctx, ts) {
      const y1 = 15 * ts;
      const y2 = 19 * ts;
      const x1 = 0;
      const x2 = (LO.GRID_COLS || 64) * ts;

      // Slate / Linoleum alternating tiles
      for (let y = 15; y < 19; y++) {
        for (let x = 0; x < (LO.GRID_COLS || 64); x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#272437' : '#221f31';
          ctx.fillRect(x * ts, y * ts, ts, ts);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x * ts + 0.5, y * ts + 0.5, ts - 1, ts - 1);
        }
      }

      // Subtle center walking path runner (Y: 16.5..17.5)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(x1, 16.5 * ts, x2, ts);
    }

    // ---- 3. Room Floors ----
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

            // Subtle parquet / tile seam
            ctx.strokeStyle = 'rgba(58, 40, 56, 0.08)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x * ts + 0.5, y * ts + 0.5, ts - 1, ts - 1);
          }
        }

        // Room-specific floor texture details
        if (key === 'server') {
          // Glowing blue underfloor cable duct grating down center aisle (X: 48..50, Y: 5..13)
          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.fillRect(48 * ts, 5 * ts, 3 * ts, 9 * ts);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(48 * ts + 0.5, 5 * ts + 0.5, 3 * ts - 1, 9 * ts - 1);
        }
      }
    }

    // ---- 4. Carpets & Rugs ----
    drawCarpets(ctx, ts) {
      // Boss Royal Purple Carpet (X: 5..16, Y: 5..11)
      const bx = 5 * ts, by = 5 * ts, bw = 12 * ts, bh = 7 * ts;
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(bx, by, bw, bh);

      // Gold / Violet Border
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);

      // Meeting Room Conference Rug (X: 26..36, Y: 23..27)
      const mx = 26 * ts, my = 23 * ts, mw = 11 * ts, mh = 5 * ts;
      ctx.fillStyle = '#fae3d2';
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#b56d43';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx + 1, my + 1, mw - 2, mh - 2);

      // Pantry Lounge Sofa Rug (X: 44..50, Y: 26..29)
      const px = 44 * ts, py = 26 * ts, pw = 7 * ts, ph = 4 * ts;
      ctx.fillStyle = '#a7f3d0';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    }

    // ---- 5. Cozy Pixel RPG Walls & Doorway Archways ----
    drawCozyBrickFace(ctx, x, y, w, h, baseColor, brickDark, trimOak) {
      // Base solid fill
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);

      // Pixel brick courses (4px course height, 8px brick width, alternating mortar)
      const courseH = 4;
      const brickW = 8;
      const numCourses = Math.floor(h / courseH);

      ctx.fillStyle = brickDark || 'rgba(40, 20, 15, 0.28)';
      for (let ci = 0; ci < numCourses; ci++) {
        const cy = y + ci * courseH;
        // Horizontal mortar seam
        ctx.fillRect(x, cy + courseH - 1, w, 1);

        // Vertical mortar joints
        const offset = (ci % 2) * (brickW / 2);
        for (let bx = x + offset; bx < x + w; bx += brickW) {
          ctx.fillRect(bx, cy, 1, courseH);
        }
      }

      // Subtle top brick highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, y, w, 1);
    }

    drawWalls(ctx, ts) {
      const rooms = LO.ROOMS || {};
      const wallDepth = 24; // 1.5 tiles (24px)
      const oakTrim = '#5a3d28';
      const oakHighlight = '#8c5d3b';
      const oakShadow = '#382215';

      // A. North Exterior Walls for Top Rooms (Y = 2)
      for (const key of ['boss', 'research', 'server']) {
        const r = rooms[key];
        if (!r) continue;
        const b = r.bounds;
        const wx = b.x1 * ts;
        const ww = (b.x2 - b.x1 + 1) * ts;
        const wy = b.y1 * ts;

        // Timber Top Cap / Lintel
        ctx.fillStyle = oakHighlight;
        ctx.fillRect(wx, wy, ww, 2);
        ctx.fillStyle = r.trim || oakTrim;
        ctx.fillRect(wx, wy + 2, ww, 3);
        ctx.fillStyle = oakShadow;
        ctx.fillRect(wx, wy + 5, ww, 1);

        // Cozy Brick Face
        const faceH = wallDepth - 10;
        this.drawCozyBrickFace(ctx, wx, wy + 6, ww, faceH, r.wall || '#b5834f', r.wallDark || '#7a4e25', r.trim);

        // Skirting Baseboard (Wood wainscoting)
        ctx.fillStyle = oakHighlight;
        ctx.fillRect(wx, wy + wallDepth - 4, ww, 1);
        ctx.fillStyle = r.trim || oakTrim;
        ctx.fillRect(wx, wy + wallDepth - 3, ww, 3);

        // Wall Outline & Seams
        ctx.strokeStyle = '#2d2438';
        ctx.lineWidth = 1;
        ctx.strokeRect(wx + 0.5, wy + 0.5, ww - 1, wallDepth - 1);

        // Ambient Occlusion / Drop shadow onto floor
        ctx.fillStyle = 'rgba(15, 10, 25, 0.22)';
        ctx.fillRect(wx, wy + wallDepth, ww, 6);
      }

      // Helper to render cozy framed doorway portal
      const drawDoorwayPortal = (doorX, wy, isTopRoom) => {
        const px = doorX * ts;
        const pw = 2 * ts; // 32px
        const postW = 3;

        // Doorposts (left and right timber jambs)
        ctx.fillStyle = oakTrim;
        ctx.fillRect(px, wy, postW, ts);
        ctx.fillRect(px + pw - postW, wy, postW, ts);
        // Iron brackets / hardware
        ctx.fillStyle = '#261b2e';
        ctx.fillRect(px, wy + 2, postW, 2);
        ctx.fillRect(px + pw - postW, wy + 2, postW, 2);

        // Arched timber lintel over doorway top
        ctx.fillStyle = oakHighlight;
        ctx.fillRect(px, wy, pw, 2);
        ctx.fillStyle = oakTrim;
        ctx.fillRect(px, wy + 2, pw, 2);
        ctx.fillStyle = oakShadow;
        ctx.fillRect(px + 4, wy + 3, pw - 8, 1);

        // Cozy Brass & Woven Welcome Threshold Strip
        const ty = isTopRoom ? wy + ts - 4 : wy;
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(px + postW, ty, pw - postW * 2, 4);
        ctx.fillStyle = '#997316';
        ctx.fillRect(px + postW, ty + 1, pw - postW * 2, 1);
        ctx.fillStyle = '#fce280';
        ctx.fillRect(px + postW + 1, ty + 2, pw - postW * 2 - 2, 1);
      };

      // B. Corridor Partition Walls & Portals (Along Y = 14 and Y = 19)
      // Top Rooms South Wall (along Y = 14)
      for (const key of ['boss', 'research', 'server']) {
        const r = rooms[key];
        if (!r) continue;
        const b = r.bounds;
        const doorX = r.door ? r.door.x : (b.x1 + Math.floor((b.x2 - b.x1) / 2));
        const wy = 14 * ts;

        // Left section of wall (before door)
        const leftW = (doorX - b.x1) * ts;
        if (leftW > 0) {
          const lx = b.x1 * ts;
          this.drawCozyBrickFace(ctx, lx, wy, leftW, ts, r.wall, r.wallDark, r.trim);
          // Oak top trim & baseboard
          ctx.fillStyle = oakHighlight; ctx.fillRect(lx, wy, leftW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(lx, wy + 2, leftW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(lx, wy + ts - 3, leftW, 3);
          ctx.strokeStyle = '#2d2438'; ctx.lineWidth = 1;
          ctx.strokeRect(lx + 0.5, wy + 0.5, leftW - 1, ts - 1);
          // Bottom drop shadow
          ctx.fillStyle = 'rgba(15, 10, 25, 0.20)';
          ctx.fillRect(lx, wy + ts, leftW, 5);
        }

        // Right section of wall (after door, door width = 2 tiles = 32px)
        const rightStartX = (doorX + 2) * ts;
        const rightW = (b.x2 + 1) * ts - rightStartX;
        if (rightW > 0) {
          this.drawCozyBrickFace(ctx, rightStartX, wy, rightW, ts, r.wall, r.wallDark, r.trim);
          // Oak top trim & baseboard
          ctx.fillStyle = oakHighlight; ctx.fillRect(rightStartX, wy, rightW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(rightStartX, wy + 2, rightW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(rightStartX, wy + ts - 3, rightW, 3);
          ctx.strokeStyle = '#2d2438'; ctx.lineWidth = 1;
          ctx.strokeRect(rightStartX + 0.5, wy + 0.5, rightW - 1, ts - 1);
          // Bottom drop shadow
          ctx.fillStyle = 'rgba(15, 10, 25, 0.20)';
          ctx.fillRect(rightStartX, wy + ts, rightW, 5);
        }

        // Timber archway doorway
        drawDoorwayPortal(doorX, wy, true);
      }

      // Bottom Rooms North Wall (along Y = 19)
      for (const key of ['engineering', 'meeting', 'pantry']) {
        const r = rooms[key];
        if (!r) continue;
        const b = r.bounds;
        const doorX = r.door ? r.door.x : (b.x1 + Math.floor((b.x2 - b.x1) / 2));
        const wy = 19 * ts;

        // Left section of wall (before door)
        const leftW = (doorX - b.x1) * ts;
        if (leftW > 0) {
          const lx = b.x1 * ts;
          this.drawCozyBrickFace(ctx, lx, wy, leftW, ts, r.wall, r.wallDark, r.trim);
          // Oak top trim & baseboard
          ctx.fillStyle = oakHighlight; ctx.fillRect(lx, wy, leftW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(lx, wy + 2, leftW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(lx, wy + ts - 3, leftW, 3);
          ctx.strokeStyle = '#2d2438'; ctx.lineWidth = 1;
          ctx.strokeRect(lx + 0.5, wy + 0.5, leftW - 1, ts - 1);
          // Top drop shadow towards corridor
          ctx.fillStyle = 'rgba(15, 10, 25, 0.15)';
          ctx.fillRect(lx, wy - 4, leftW, 4);
        }

        // Right section of wall (after door)
        const rightStartX = (doorX + 2) * ts;
        const rightW = (b.x2 + 1) * ts - rightStartX;
        if (rightW > 0) {
          this.drawCozyBrickFace(ctx, rightStartX, wy, rightW, ts, r.wall, r.wallDark, r.trim);
          // Oak top trim & baseboard
          ctx.fillStyle = oakHighlight; ctx.fillRect(rightStartX, wy, rightW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(rightStartX, wy + 2, rightW, 2);
          ctx.fillStyle = r.trim || oakTrim; ctx.fillRect(rightStartX, wy + ts - 3, rightW, 3);
          ctx.strokeStyle = '#2d2438'; ctx.lineWidth = 1;
          ctx.strokeRect(rightStartX + 0.5, wy + 0.5, rightW - 1, ts - 1);
          // Top drop shadow towards corridor
          ctx.fillStyle = 'rgba(15, 10, 25, 0.15)';
          ctx.fillRect(rightStartX, wy - 4, rightW, 4);
        }

        // Timber archway doorway
        drawDoorwayPortal(doorX, wy, false);
      }

      // C. Cozy Vertical Room Partition Walls (Width: 1 tile = 16px)
      const partitions = [
        { x: 20, y1: 2, y2: 14, color: '#4a3b32', dark: '#33241c', label: 'W1' }, // Boss | Research
        { x: 40, y1: 2, y2: 14, color: '#3d3b48', dark: '#282633', label: 'W2' }, // Research | Server
        { x: 22, y1: 19, y2: 32, color: '#3b473e', dark: '#253328', label: 'W3' }, // Engineering | Meeting
        { x: 40, y1: 19, y2: 32, color: '#4d3d34', dark: '#332720', label: 'W4' }  // Meeting | Pantry
      ];

      for (const p of partitions) {
        const px = p.x * ts;
        const py = p.y1 * ts;
        const ph = (p.y2 - p.y1 + 1) * ts;

        // Brick body of partition
        this.drawCozyBrickFace(ctx, px, py, ts, ph, p.color, p.dark, oakTrim);

        // Wooden pilaster columns at corridor ends (corners)
        const cornerY = p.y1 === 2 ? (p.y2 * ts) : py;
        ctx.fillStyle = oakHighlight;
        ctx.fillRect(px, cornerY, ts, 4);
        ctx.fillStyle = oakTrim;
        ctx.fillRect(px, cornerY + 4, ts, ts - 4);
        ctx.fillStyle = '#261b2e';
        ctx.fillRect(px + 2, cornerY + 2, 2, 2);
        ctx.fillRect(px + ts - 4, cornerY + 2, 2, 2);

        // Partition outline
        ctx.strokeStyle = '#2d2438';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ph - 1);

        // Right side drop shadow (depth perspective)
        ctx.fillStyle = 'rgba(15, 10, 25, 0.22)';
        ctx.fillRect(px + ts, py, 6, ph);

        // Cozy wall sconce / lantern on the corridor pillar
        const sconceY = cornerY + 5;
        ctx.fillStyle = '#54381e';
        ctx.fillRect(px + 6, sconceY, 4, 3);
        // Flickering warm flame
        const flicker = Math.sin(this.timeSec * 12 + p.x) * 0.5 + 0.5;
        ctx.fillStyle = flicker > 0.4 ? '#ffcf40' : '#ffa500';
        ctx.fillRect(px + 7, sconceY - 2, 2, 2);
        ctx.fillStyle = 'rgba(255, 210, 80, 0.18)';
        ctx.beginPath();
        ctx.arc(px + 8, sconceY - 1, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- 6. Wall Decorations & Windows ----
    drawWallDecorations(ctx, ts, theme) {
      // A. Arched Skyline Windows in Boss Office (X: 6..8 and X: 15..17)
      [6, 15].forEach((wx) => {
        const xPx = wx * ts, yPx = 2 * ts + 4;
        ctx.fillStyle = theme.type === 'night' ? '#181730' : '#88c8f7';
        ctx.fillRect(xPx, yPx, 2 * ts, 14);
        ctx.strokeStyle = '#ba854d';
        ctx.lineWidth = 1;
        ctx.strokeRect(xPx + 0.5, yPx + 0.5, 2 * ts - 1, 13);
      });

      // B. Research Lab Corkboard (X: 24..27, Y: 2..3)
      const cbX = 24 * ts, cbY = 2 * ts + 4;
      ctx.fillStyle = '#c79867';
      ctx.fillRect(cbX, cbY, 3.5 * ts, 16);
      ctx.strokeStyle = '#8c5828';
      ctx.strokeRect(cbX + 0.5, cbY + 0.5, 3.5 * ts - 1, 15);
      // Pinned sticky notes
      ctx.fillStyle = '#ff8fa3'; ctx.fillRect(cbX + 4, cbY + 3, 8, 8);
      ctx.fillStyle = '#ffd25e'; ctx.fillRect(cbX + 16, cbY + 2, 8, 8);
      ctx.fillStyle = '#7ec8f2'; ctx.fillRect(cbX + 28, cbY + 4, 8, 8);
      ctx.strokeStyle = '#e74c3c'; ctx.beginPath(); ctx.moveTo(cbX + 8, cbY + 7); ctx.lineTo(cbX + 20, cbY + 6); ctx.stroke();

      // C. Research Academic Bookshelves (X: 34..37, Y: 2..4)
      const bsX = 34 * ts, bsY = 2 * ts + 2;
      ctx.fillStyle = '#5c4033';
      ctx.fillRect(bsX, bsY, 3.5 * ts, 20);
      ctx.strokeStyle = '#3d2b22';
      ctx.strokeRect(bsX + 0.5, bsY + 0.5, 3.5 * ts - 1, 19);
      // Colorful book spines
      const bookColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c'];
      for (let bi = 0; bi < 14; bi++) {
        ctx.fillStyle = bookColors[bi % bookColors.length];
        ctx.fillRect(bsX + 3 + bi * 3.5, bsY + 4, 2.5, 13);
      }

      // D. Meeting Room Interactive Whiteboard (North wall at X: 25..29, Y: 19)
      const wb = LO.PROPS?.whiteboard || { x: 25, y: 19 };
      this.drawWhiteboard(ctx, wb.x * ts, wb.y * ts - 12);

      // E. Doorway Signboards in Central Corridor
      const signs = [
        { x: 10, y: 14, text: '👑 BOSS' },
        { x: 30, y: 14, text: '🔍 LAB' },
        { x: 49, y: 14, text: '🖥️ SRV' },
        { x: 11, y: 18.5, text: '💻 ENG' },
        { x: 31, y: 18.5, text: '📋 MEET' },
        { x: 49, y: 18.5, text: '☕ LOUNGE' }
      ];

      for (const s of signs) {
        const sx = s.x * ts + 16;
        const sy = s.y * ts + 1;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(sx - 20, sy - 8, 40, 9);
        ctx.strokeStyle = '#3a2838';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 19.5, sy - 7.5, 39, 8);
        ctx.fillStyle = '#3a2838';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s.text, sx, sy - 1.5);
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
      // Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(xPx + 2, yPx + hPx - 2, wPx, 4);

      // Front Face
      ctx.fillStyle = frontColor;
      ctx.fillRect(xPx, yPx + topH, wPx, hPx - topH);

      // Top Face
      ctx.fillStyle = topColor;
      ctx.fillRect(xPx, yPx, wPx, topH);

      // Outline
      ctx.strokeStyle = outlineColor || '#2d2438';
      ctx.lineWidth = 1;
      ctx.strokeRect(xPx + 0.5, yPx + 0.5, wPx - 1, hPx - 1);
    }

    // Specific Room 1: Boss Office
    drawBossOffice(ctx, ts, theme) {
      // Grand Executive Desk (X: 9..13, Y: 6)
      const dx = 9 * ts, dy = 6 * ts, dw = 5 * ts, dh = 1.2 * ts;
      this.draw2DBlock(ctx, dx, dy, dw, dh, 14, '#7a3e2e', '#5a2b1e', '#ffd25e');

      // Executive Leather Swivel Chair (X: 11, Y: 4.8)
      const cx = 11 * ts + 8, cy = 4.8 * ts;
      ctx.fillStyle = '#1f1e24';
      ctx.beginPath();
      ctx.arc(cx, cy + 8, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd25e';
      ctx.fillRect(cx - 3, cy + 4, 2, 2);
      ctx.fillRect(cx + 1, cy + 4, 2, 2);

      // Gold Laptop on Desk
      const lx = 10.5 * ts, ly = 5.9 * ts;
      ctx.fillStyle = '#ffd25e';
      ctx.fillRect(lx, ly, 14, 8);
      ctx.fillStyle = '#fff9d6';
      ctx.fillRect(lx + 2, ly + 1, 10, 5);

      // "Best Boss" Mug
      const mx = 9.6 * ts, my = 6.0 * ts;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx, my, 6, 6);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(mx + 2, my + 2, 2, 2);

      // Floating Gold Crown Easter Egg
      const crownBob = Math.sin(this.timeSec * 3) * 2;
      const crX = 11.5 * ts, crY = 4.1 * ts + crownBob;
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(crX, crY, 10, 4);
      ctx.fillRect(crX, crY - 3, 2, 3);
      ctx.fillRect(crX + 4, crY - 4, 2, 4);
      ctx.fillRect(crX + 8, crY - 3, 2, 3);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(crX + 4, crY + 1, 2, 2);

      // Potted Luxury Monstera Plant (X: 3, Y: 4)
      const px = 3 * ts, py = 4 * ts;
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(px, py + 8, 14, 10);
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(px + 7, py + 5, 8, 0, Math.PI * 2);
      ctx.fill();

      // Context Window Trashcan (Interactive Prop) (X: 14, Y: 5)
      const tc = LO.PROPS?.trashcan || { x: 14, y: 5 };
      this.drawContextTrashcan(ctx, (tc.x + 0.5) * ts, (tc.y + 0.5) * ts);
    }

    // Interactive Prop: Context Window Trashcan
    drawContextTrashcan(ctx, tx, ty) {
      const office = window.LO?.office;
      const ctxUsage = office ? office.contextUsage : 0.42;

      // Ribbed Metal Bin
      this.draw2DBlock(ctx, tx - 7, ty - 5, 14, 14, 6, '#95a5a6', '#7f8c8d', '#576574');

      // Crumpled Paper Balls Filling Can
      const paperCount = Math.min(Math.floor(ctxUsage * 10), 10);
      const paperColors = ['#ffffff', '#f1f2f6', '#fed330', '#dff9fb'];
      for (let p = 0; p < paperCount; p++) {
        const pxOffset = ((p * 5) % 6) - 3;
        const pyOffset = -Math.min(p * 1.2, 8);
        ctx.fillStyle = paperColors[p % paperColors.length];
        ctx.fillRect(tx + pxOffset - 2, ty - 6 + pyOffset, 4, 3);
      }

      // Overflow Paper on Carpet if context > 70%
      if (ctxUsage > 0.7) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(tx + 10, ty + 2, 4, 3);
        ctx.fillRect(tx - 12, ty + 4, 4, 3);
      }

      // Floating Badge (${pct}% 🗑️)
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

    // Specific Room 2: Research Lab
    drawResearchLab(ctx, ts, theme) {
      // 3 Workstations with Dual Monitors (X: 23, 28, 33 at Y: 7)
      [23, 28, 33].forEach((dx) => {
        this.draw2DBlock(ctx, dx * ts, 7 * ts, 2 * ts, 1.1 * ts, 12, '#8f7762', '#6b5443');

        // Dual Monitors on Desk
        const m1x = dx * ts + 2, my = 7 * ts - 2;
        const m2x = dx * ts + 17;
        [m1x, m2x].forEach((mx) => {
          ctx.fillStyle = '#2c3e50';
          ctx.fillRect(mx, my, 13, 9);
          ctx.fillStyle = '#7ec8f2';
          ctx.fillRect(mx + 1, my + 1, 11, 7);
          // Waveform line
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

      // Microscope Station (X: 22..24, Y: 11..12)
      const scX = 22 * ts, scY = 11 * ts;
      this.draw2DBlock(ctx, scX, scY, 2 * ts, 1.1 * ts, 10, '#ffffff', '#cbd5e1');
      // Cast-Iron Microscope
      ctx.fillStyle = '#34495e';
      ctx.fillRect(scX + 8, scY + 1, 5, 8);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(scX + 9, scY - 2, 3, 3);
      // Petri Dish Specimen
      ctx.fillStyle = '#00bcd4';
      ctx.beginPath();
      ctx.arc(scX + 22, scY + 5, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Journal Stack on Desk
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(29 * ts + 2, 7.2 * ts, 10, 4);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(29 * ts + 4, 7.2 * ts, 6, 1);
    }

    // Specific Room 3: Server Room
    drawServerRoom(ctx, ts, theme) {
      // 4 Dark Server Racks (X: 43, 47, 51, 55 at Y: 4..5)
      [43, 47, 51, 55].forEach((rx, idx) => {
        const xPx = rx * ts, yPx = 4 * ts;
        this.draw2DBlock(ctx, xPx, yPx, 2 * ts, 2 * ts, 10, '#2c2738', '#1c1826');

        // Blinking LED Status Lights on Racks
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

      // Mainframe Ops Console Desk (X: 46..49, Y: 10)
      const cx = 46 * ts, cy = 10 * ts;
      this.draw2DBlock(ctx, cx, cy, 4 * ts, 1.2 * ts, 12, '#34495e', '#2c3e50');

      // 3 Curved Monitoring Screens
      [cx + 4, cx + 24, cx + 44].forEach((mx, i) => {
        ctx.fillStyle = '#111827';
        ctx.fillRect(mx, cy - 2, 14, 8);
        ctx.fillStyle = i === 0 ? '#2ecc71' : (i === 1 ? '#38bdf8' : '#34d399');
        ctx.fillRect(mx + 1, cy - 1, 12, 5);
      });

      // DevOps Toolkit & Wrench on Desk
      const tkX = cx + 8, tkY = cy + 4;
      const tkB = Math.sin(this.timeSec * 3 + 4) * 1.2;
      ctx.fillStyle = '#95a5a6';
      ctx.fillRect(tkX, tkY + tkB, 8, 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(tkX + 2, tkY - 1 + tkB, 2, 4);
    }

    // Specific Room 4: Engineering Pit
    drawEngineeringPit(ctx, ts, theme) {
      // 6 Developer Desks (3 Dual Pods)
      const pods = [
        { x: 5, y: 21 }, { x: 9, y: 21 },
        { x: 5, y: 25 }, { x: 9, y: 25 },
        { x: 15, y: 23 }, { x: 18, y: 23 }
      ];

      for (const p of pods) {
        const xPx = p.x * ts, yPx = p.y * ts;
        this.draw2DBlock(ctx, xPx, yPx, 2 * ts, 1.1 * ts, 12, '#453d54', '#322c3e');

        // Glowing Green Phosphor Terminal Monitor
        ctx.fillStyle = '#1e1927';
        ctx.fillRect(xPx + 4, yPx - 2, 16, 9);
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(xPx + 5, yPx - 1, 14, 7);
        ctx.fillStyle = '#36d399';
        ctx.fillRect(xPx + 7, yPx + 1, 9, 1);
        ctx.fillRect(xPx + 7, yPx + 3, 7, 1);
        // Blinking cursor
        if (Math.sin(this.timeSec * 8) > 0) {
          ctx.fillRect(xPx + 15, yPx + 3, 2, 2);
        }
      }

      // Yellow Rubber Duck Debugger (Desk at X: 5.5, Y: 21)
      const dkB = Math.sin(this.timeSec * 3 + 2) * 1.5;
      const dkX = 5.5 * ts, dkY = 21 * ts + dkB;
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(dkX, dkY, 6, 5);
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(dkX + 6, dkY + 1, 3, 2); // beak

      // Green Energy Drink Can (Desk at X: 7.2, Y: 21.1)
      const canX = 7.2 * ts, canY = 21.1 * ts;
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(canX, canY, 4, 6);
      ctx.fillStyle = '#111111';
      ctx.fillRect(canX + 1, canY + 1, 2, 4);

      // Mini Server Tower / Custom Rig (X: 13, Y: 21)
      const rigX = 13 * ts, rigY = 21 * ts;
      this.draw2DBlock(ctx, rigX, rigY, 1 * ts, 1.2 * ts, 8, '#221b2c', '#15101c');
      // Cycling RGB Interior
      const rgbColor = ['#ff7675', '#74b9ff', '#55efc4', '#a29bfe'][Math.floor(this.timeSec * 2) % 4];
      ctx.fillStyle = rgbColor;
      ctx.fillRect(rigX + 3, rigY + 6, 8, 8);
    }

    // Specific Room 5: Meeting Room
    drawMeetingRoom(ctx, ts, theme) {
      // Large Conference Table (X: 28..34, Y: 24..25)
      const tx = 28 * ts, ty = 24 * ts, tw = 7 * ts, th = 2 * ts;
      this.draw2DBlock(ctx, tx, ty, tw, th, 16, '#c7926b', '#9b6e4e');

      // 8 Ergonomic Mesh Chairs
      // 3 North Chairs (Y: 23.3)
      [29, 31.5, 33.5].forEach((cx) => {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(cx * ts, 23.3 * ts, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      // 3 South Chairs (Y: 26.2)
      [29, 31.5, 33.5].forEach((cx) => {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(cx * ts, 26.2 * ts, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      // 2 Head Chairs (West / East)
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(27.2 * ts, 25 * ts, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(35.8 * ts, 25 * ts, 6, 0, Math.PI * 2); ctx.fill();

      // Sakura Flower Vase Centerpiece on Conference Table
      const flB = Math.sin(this.timeSec * 3 + 3) * 1.2;
      const vsX = 31.5 * ts, vsY = 24.6 * ts;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(vsX - 3, vsY - 3, 6, 6);
      ctx.fillStyle = '#ff7675';
      ctx.beginPath();
      ctx.arc(vsX, vsY - 6 + flB, 4, 0, Math.PI * 2);
      ctx.fill();

      // Agenda Binder on Table
      ctx.fillStyle = '#3498db';
      ctx.fillRect(vsX + 14, vsY - 1, 8, 4);
    }

    // Interactive Prop: Multi-Mode Whiteboard
    drawWhiteboard(ctx, xPx, yPx) {
      const office = window.LO?.office;
      const wbMode = office ? (office.whiteboardMode || 0) : 0;
      const wbW = 64, wbH = 24;

      // Board Base & Aluminum Frame
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(xPx, yPx, wbW, wbH);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(xPx + 0.5, yPx + 0.5, wbW - 1, wbH - 1);

      // Top Header Tabs: [TASKS] [TOOLS] [TEAM]
      const tabLabels = ['TASKS', 'TOOLS', 'TEAM'];
      for (let ti = 0; ti < 3; ti++) {
        const tabX = xPx + 2 + ti * 20;
        ctx.fillStyle = wbMode === ti ? '#3b82f6' : '#cbd5e1';
        ctx.fillRect(tabX, yPx + 1, 19, 5);
        ctx.fillStyle = wbMode === ti ? '#ffffff' : '#475569';
        ctx.font = '4px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(tabLabels[ti], tabX + 9.5, yPx + 5);
      }

      // Dynamic Tab Contents
      if (wbMode === 0) {
        // Mode 0: Tasks Checklist & Sticky Notes
        ctx.fillStyle = '#ff7675'; ctx.fillRect(xPx + 4, yPx + 8, 6, 6);
        ctx.fillStyle = '#fdcb6e'; ctx.fillRect(xPx + 12, yPx + 8, 6, 6);
        ctx.fillStyle = '#00cec9'; ctx.fillRect(xPx + 20, yPx + 8, 6, 6);
        // Task Lines
        ctx.fillStyle = '#2d3436';
        ctx.fillRect(xPx + 30, yPx + 9, 26, 1);
        ctx.fillRect(xPx + 30, yPx + 13, 20, 1);
        ctx.fillRect(xPx + 30, yPx + 17, 24, 1);
        // Green Checkmark
        ctx.fillStyle = '#00b894';
        ctx.fillRect(xPx + 4, yPx + 16, 4, 4);
      } else if (wbMode === 1) {
        // Mode 1: Tool Analytics Bar Chart
        const barColors = ['#36d399', '#3b82f6', '#f59e0b', '#ec4899'];
        const barHeights = [11, 8, 13, 6];
        for (let bi = 0; bi < 4; bi++) {
          ctx.fillStyle = barColors[bi];
          ctx.fillRect(xPx + 8 + bi * 13, yPx + 21 - barHeights[bi], 8, barHeights[bi]);
        }
      } else {
        // Mode 2: Agent Hierarchy Org Chart
        ctx.fillStyle = '#ffd25e'; ctx.fillRect(xPx + 24, yPx + 7, 16, 4); // Lami Node
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(xPx + 31.5, yPx + 11, 1, 3);
        ctx.fillRect(xPx + 12, yPx + 14, 40, 1);
        // 3 Sub-Boxes
        ctx.fillStyle = '#7ec8f2'; ctx.fillRect(xPx + 8, yPx + 15, 10, 4);
        ctx.fillStyle = '#8fdba8'; ctx.fillRect(xPx + 27, yPx + 15, 10, 4);
        ctx.fillStyle = '#ff8fab'; ctx.fillRect(xPx + 46, yPx + 15, 10, 4);
      }

      // Marker Tray at Bottom
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(xPx + 8, yPx + wbH - 2, 48, 2);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(xPx + 12, yPx + wbH - 3, 5, 1);
      ctx.fillStyle = '#3498db'; ctx.fillRect(xPx + 20, yPx + wbH - 3, 5, 1);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(xPx + 28, yPx + wbH - 3, 5, 1);
      ctx.fillStyle = '#3498db'; ctx.fillRect(xPx + 38, yPx + wbH - 4, 6, 2); // Eraser
    }

    // Specific Room 6: Pantry & Lounge
    drawPantryLounge(ctx, ts, theme) {
      // Coffee Bar Marble Counter (X: 43..46, Y: 22)
      const cx = 43 * ts, cy = 22 * ts;
      this.draw2DBlock(ctx, cx, cy, 4 * ts, 1.2 * ts, 12, '#ffffff', '#c8b49e');

      // Italian Commercial Espresso Machine
      const kpX = cx + 6, kpY = cy - 2;
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(kpX, kpY, 14, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(kpX + 2, kpY + 2, 4, 3); // Cup
      // Animated Steam Particles
      const steamY = (this.timeSec * 15) % 10;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(kpX + 3, kpY - 3 - steamY, 2, 2);

      // Microwave Oven
      const mwX = cx + 24, mwY = cy - 2;
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(mwX, mwY, 14, 9);
      ctx.fillStyle = '#34495e';
      ctx.fillRect(mwX + 2, mwY + 2, 7, 5); // Glass
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(mwX + 10, mwY + 2, 2, 2); // Timer

      // Donut Tray
      const dnX = cx + 44, dnY = cy + 2;
      ctx.fillStyle = '#d35400';
      ctx.fillRect(dnX, dnY, 10, 4);
      ctx.fillStyle = '#ff7675';
      ctx.fillRect(dnX + 2, dnY + 1, 6, 2);

      // Interactive Water Cooler Dispenser (X: 51, Y: 23)
      const wc = LO.PROPS?.watercooler || { x: 51, y: 23 };
      this.drawWaterCooler(ctx, wc.x * ts, wc.y * ts, ts);

      // Pastel Teal Lounge Sofa (X: 45..48, Y: 27)
      const sX = 45 * ts, sY = 27 * ts;
      this.draw2DBlock(ctx, sX, sY, 4 * ts, 1.1 * ts, 10, '#7ac9af', '#57aa8f');

      // Low Wood Coffee Table in Front of Sofa (X: 46..47, Y: 29)
      this.draw2DBlock(ctx, 46 * ts, 29 * ts, 2 * ts, 1.0 * ts, 8, '#c7926b', '#9b6e4e');

      // Snack Vending Machine along East Wall (X: 55..56, Y: 27..28)
      const vmX = 55 * ts, vmY = 27 * ts;
      this.draw2DBlock(ctx, vmX, vmY, 2 * ts, 2 * ts, 8, '#ff7675', '#d65453');
      // Glass display with colorful snacks
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(vmX + 3, vmY + 8, 26, 18);
      const snackColors = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899'];
      for (let si = 0; si < 4; si++) {
        ctx.fillStyle = snackColors[si];
        ctx.fillRect(vmX + 4 + si * 6, vmY + 11, 4, 6);
      }

      // Pizza / Martabak Event Item on Table
      const office = window.LO?.office;
      if (office && office.pizzaEventTimer > 0) {
        const pzX = 46 * ts + 2, pzY = 29 * ts + 2;
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
      // White Dispenser Cabinet
      this.draw2DBlock(ctx, wx + 1, wy + 4, 14, 12, 6, '#ecf0f1', '#bdc3c7');

      // Translucent Blue Water Bottle on Top
      ctx.fillStyle = 'rgba(52, 152, 219, 0.85)';
      ctx.fillRect(wx + 2, wy - 6, 12, 10);
      ctx.fillStyle = '#2980b9';
      ctx.fillRect(wx + 4, wy - 9, 8, 3);

      // Animated Rising Bubble
      const bubbleY = (this.timeSec * 8) % 7;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx + 7, wy + 1 - bubbleY, 2, 2);

      // Red & Blue Taps
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(wx + 3, wy + 7, 2, 3);
      ctx.fillStyle = '#3498db'; ctx.fillRect(wx + 9, wy + 7, 2, 3);
    }

    // Elevator Lobby & Entrance (East Corridor X: 59..63, Y: 15..18)
    drawElevatorLobby(ctx, ts, theme) {
      const ex = 59 * ts, ey = 15 * ts;
      // Double Steel Elevator Doors
      ctx.fillStyle = '#64748b';
      ctx.fillRect(ex, ey, 3.5 * ts, 4 * ts);
      ctx.fillStyle = '#475569';
      ctx.fillRect(ex + 2, ey + 4, 1.6 * ts, 3.5 * ts);
      ctx.fillRect(ex + 1.8 * ts, ey + 4, 1.6 * ts, 3.5 * ts);
      // Floor Indicator Panel
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(ex + 6, ey - 4, 40, 7);
      ctx.fillStyle = '#22c55e';
      ctx.font = '4px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('1F ▲', ex + 26, ey);
    }

    // ---- 8. Ambient Lighting Pools (Night / Sunset) ----
    drawAmbientLighting(ctx, theme, ts) {
      const lightSources = [
        { x: 11 * ts, y: 6 * ts, r: 90, color: 'rgba(255, 238, 175, 0.22)' }, // Boss Desk
        { x: 29 * ts, y: 8 * ts, r: 80, color: 'rgba(186, 230, 253, 0.18)' }, // Research Lab
        { x: 49 * ts, y: 6 * ts, r: 95, color: 'rgba(56, 189, 248, 0.16)' },  // Server Racks
        { x: 11 * ts, y: 24 * ts, r: 95, color: 'rgba(167, 243, 208, 0.18)' },// Engineering
        { x: 31 * ts, y: 25 * ts, r: 90, color: 'rgba(254, 215, 170, 0.20)' },// Meeting Room
        { x: 47 * ts, y: 24 * ts, r: 85, color: 'rgba(254, 240, 138, 0.22)' } // Pantry Bar
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
      this.drawSkyHeader(ctx, theme, LO.CONTENT_W || 1024);
    }
    drawRoomProps() {}
  }

  LO.World = World;
})();
