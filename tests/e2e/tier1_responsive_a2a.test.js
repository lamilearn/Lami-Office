/**
 * Tier 1 — Feature 15: Responsive Layout & Phone Camera
 * Feature 16: Floorplan Decoration
 * Feature 17: A2A Peer Agents & Backend Integration Wiring
 */

const { describe, it, assert } = require('../runner_utils');
const ORACLE = require('../oracle');
const { createBrowserEnvironment, loadScriptIntoEnv } = require('../harness');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');

function loadConfig(innerWidth, coarse) {
  const env = createBrowserEnvironment();
  const LO = loadScriptIntoEnv(env, 'config.js');
  env.window.innerWidth = innerWidth;
  env.window.matchMedia = (q) => ({ matches: Boolean(coarse) && q.includes('coarse'), media: q });
  LO.isPhoneMode = LO.isPhoneMode.bind(LO);
  return { LO, env };
}

function loadOffice() {
  const env = createBrowserEnvironment();
  const LO = loadScriptIntoEnv(env, 'config.js');
  loadScriptIntoEnv(env, 'sprites.js');
  loadScriptIntoEnv(env, 'office.js');
  loadScriptIntoEnv(env, 'agents.js');
  return { LO, env };
}

describe('Tier 1 — Feature 15: Responsive Layout & Phone Camera', () => {
  it('F15.1: Phone mode turns on for coarse pointers or narrow viewports', () => {
    const narrow = loadConfig(390, false);
    assert.strictEqual(narrow.LO.isPhoneMode(), true, 'Narrow viewport is phone mode');

    const wideTouch = loadConfig(1400, true);
    assert.strictEqual(wideTouch.LO.isPhoneMode(), true, 'Coarse pointer is phone mode');

    const desktop = loadConfig(1600, false);
    assert.strictEqual(desktop.LO.isPhoneMode(), false, 'Wide non-touch is desktop mode');
  });

  it('F15.2: Desktop view fills the screen without cropping the building', () => {
    const { LO } = loadConfig(1600, false);
    const v = LO.computeViewParams({
      width: 1600, height: 900, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H
    });
    const contain = Math.min(1600 / LO.CONTENT_W, 900 / LO.CONTENT_H);
    // The desktop view deliberately zooms past a bare "contain" fit so the empty
    // outside margin below the building no longer shows as a letterbox.
    assert.ok(v.zoom >= contain - 1e-9, 'Zoom must not fall below the contain fit');
    assert.ok(v.zoom <= contain * LO.DESKTOP_ZOOM_CAP + 1e-9, 'Zoom must respect the cap');
    assert.strictEqual(v.cameraMode, false);
    assert.ok(v.offsetX >= 0 && v.offsetY >= 0, 'Content must stay inside the viewport');

    // Everything the player must see stays visible.
    const ts = LO.TILE_SIZE;
    const focus = LO.VIEW_FOCUS;
    assert.ok(v.offsetX + (focus.x2 - focus.x1) * ts * v.zoom <= 1600 + 0.5,
      'the building must fit horizontally');
    assert.ok(v.offsetY + (focus.y2 - focus.y1) * ts * v.zoom <= 900 + 0.5,
      'the building must fit vertically');
  });

  it('F15.3: Phone view fills the width and keeps the focus point centered', () => {
    const { LO } = loadConfig(390, true);
    const v = LO.computeViewParams({
      width: 390, height: 844, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H,
      cameraMode: true, focusX: 44, focusY: 30
    });
    assert.ok(v.zoom >= 390 / LO.CONTENT_W - 1e-9, 'Phone zoom must at least fill the width');
    assert.strictEqual(v.cameraMode, true);
    const screenX = 44 * LO.TILE_SIZE * v.zoom + v.offsetX;
    assert.ok(Math.abs(screenX - v.availW / 2) < 1.5, 'Focused column must land at viewport center');
  });

  it('F15.3b: Portrait phones get a usable vertical fill, not a thin strip', () => {
    const { LO } = loadConfig(360, true);
    const v = LO.computeViewParams({
      width: 360, height: 640, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H,
      cameraMode: true, focusX: 44, focusY: 25
    });
    const drawnH = LO.CONTENT_H * v.zoom;
    const fill = drawnH / v.availH;
    assert.ok(fill > 0.6, `Portrait phone should fill most of the screen height, got ${fill.toFixed(2)}`);
    const drawnW = LO.CONTENT_W * v.zoom;
    assert.ok(drawnW >= v.availW - 1, 'Width must still be covered (no side bars)');
  });

  it('F15.4: Phone camera clamps pan so the world cannot scroll away', () => {
    const { LO } = loadConfig(390, true);
    const far = LO.computeViewParams({
      width: 390, height: 844, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H,
      cameraMode: true, focusX: 9999, focusY: -9999
    });
    // Right edge of the content must still be at or beyond the right viewport edge.
    const rightEdge = LO.CONTENT_W * far.zoom + far.offsetX;
    assert.ok(rightEdge >= far.availW - 1, 'Content right edge must reach the viewport edge');
  });

  it('F15.5: Pointer gestures classify taps, drags and long presses', () => {
    const { LO } = loadConfig(390, true);
    assert.strictEqual(LO.classifyPointerGesture({ x: 10, y: 10 }, { x: 13, y: 12 }, 120), 'tap');
    assert.strictEqual(LO.classifyPointerGesture({ x: 10, y: 10 }, { x: 80, y: 10 }, 120), 'drag');
    assert.strictEqual(LO.classifyPointerGesture({ x: 10, y: 10 }, { x: 11, y: 10 }, 900), 'longpress');
  });

  it('F15.6: Opening the drawer on desktop insets the canvas; phone keeps it full', () => {
    const { LO, env } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.camera = { x: 44, y: 25, targetX: 44, targetY: 25, zoom: null };
    office.drawerInset = 0;

    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });
    office.setDrawerOpen(true, 340);
    assert.strictEqual(office.drawerInset, 340, 'Desktop shrinks by the drawer width');
    office.setDrawerOpen(false, 340);
    assert.strictEqual(office.drawerInset, 0, 'Desktop restores full width');

    env.window.innerWidth = 390;
    env.window.matchMedia = () => ({ matches: true });
    office.setDrawerOpen(true, 340);
    assert.strictEqual(office.drawerInset, 0, 'Phone keeps the drawer as an overlay');
  });

  it('F15.7: screenToWorld inverts the view transform exactly', () => {
    const { LO, env } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900 }) };
    office.camera = { x: 44, y: 25, targetX: 44, targetY: 25, zoom: null };
    office.drawerInset = 0;
    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });

    const view = office.computeView(1600, 900);
    const screen = office.worldToScreen(400, 240);
    const world = office.screenToWorld(screen.x, screen.y);
    assert.ok(Math.abs(world.x - 400) < 1e-6 && Math.abs(world.y - 240) < 1e-6, 'Round trip must be exact');
    assert.ok(view.zoom > 0);
  });

  it('F15.8: The shell is full-bleed — no 100vw sizing and no vertical letterbox', () => {
    const css = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/css/style.css'), 'utf8');
    const stage = css.slice(css.indexOf('#stage {'), css.indexOf('#office {'));

    assert.ok(!/width:\s*100vw/.test(stage), '#stage must not size with 100vw (ignores scrollbar/visual viewport)');
    assert.ok(/width:\s*100%/.test(stage), '#stage must fill its container width');
    assert.ok(/height:\s*var\(--vvh,\s*100%\)/.test(stage), '#stage must honour the visual-viewport height');

    assert.ok(!/body\.vertical/.test(css), 'the vertical letterbox mode must be removed');
    assert.ok(!/calc\(100dvh \* 9 \/ 16\)/.test(css), 'the hard-coded 9:16 letterbox must be gone');
  });

  it('F15.9: The HUD grows for safe-area insets instead of clipping', () => {
    const css = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/css/style.css'), 'utf8');
    const hud = css.slice(css.indexOf('#hud {'), css.indexOf('.hud-brand, .hud-stats'));

    assert.ok(/min-height:\s*var\(--header-height\)/.test(hud), 'HUD must use min-height');
    assert.ok(!/^\s*height:\s*var\(--header-height\)/m.test(hud), 'HUD must not use a fixed height');
    assert.ok(/env\(safe-area-inset-top\)/.test(hud), 'HUD must respect the top safe area');
    assert.ok(/flex-wrap:\s*wrap/.test(hud), 'HUD must wrap on narrow screens');
  });

  it('F15.10: The ?vertical=1 override is gone from both CSS and camera mode', () => {
    const main = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/main.js'), 'utf8');
    const office = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/office.js'), 'utf8');

    assert.ok(!/classList\.add\('vertical'\)/.test(main), 'main.js must not toggle the vertical class');
    const isPhone = office.slice(office.indexOf('isPhoneMode() {'), office.indexOf('isPhoneMode() {') + 200);
    assert.ok(!/vertical/.test(isPhone), 'isPhoneMode must not branch on the vertical param');
    assert.ok(/return LO\.isPhoneMode\(\)/.test(isPhone), 'phone mode must come from device detection only');
  });

  it('F15.11: The Android soft keyboard resizes the shell via visualViewport', () => {
    const office = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/office.js'), 'utf8');
    assert.ok(/window\.visualViewport/.test(office), 'visualViewport must be used');
    assert.ok(/setupVisualViewport\(\)/.test(office), 'a visualViewport setup hook must exist');
    assert.ok(/setProperty\('--vvh'/.test(office), 'the visual viewport height must feed --vvh');
    assert.ok(/vv\.addEventListener\('resize'/.test(office), 'resize listener required');
    assert.ok(/recompute\(\)/.test(office), 'viewport changes must recompute the view');
  });

  it('F15.12: Phones render the chat drawer as a bottom sheet, not a full-height sidebar', () => {
    const css = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/css/style.css'), 'utf8');
    const sheetAt = css.indexOf('.chat-drawer.is-sheet {');
    assert.ok(sheetAt > -1, 'a bottom-sheet variant must exist');
    const sheet = css.slice(css.indexOf('.chat-drawer,', sheetAt - 400), sheetAt + 400);

    assert.ok(/top:\s*auto/.test(sheet), 'the sheet must drop the full-height top anchor');
    assert.ok(/bottom:\s*0/.test(sheet), 'the sheet must anchor to the bottom');
    assert.ok(/max-height:\s*var\(--sheet-height/.test(sheet), 'the sheet height must be variable');
    assert.ok(/border-radius:\s*16px 16px 0 0/.test(sheet), 'the sheet needs rounded top corners');
    assert.ok(/slideUpSheet/.test(css), 'the sheet must animate from the bottom');
  });

  it('F15.13: The desk drawer stays an inset card with a pixel accent rail', () => {
    const css = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/css/style.css'), 'utf8');
    const drawer = css.slice(css.indexOf('.chat-drawer {'), css.indexOf('.chat-drawer.hidden'));
    assert.ok(/top:\s*calc\(8px \+ env\(safe-area-inset-top\)\)/.test(drawer), 'desktop drawer must float below the HUD');
    assert.ok(/border-radius:\s*14px/.test(drawer), 'desktop drawer must be rounded, not edge-to-edge');
    assert.ok(/max-height:\s*calc\(100% - 16px/.test(drawer), 'desktop drawer must not hide the HUD');
    assert.ok(/repeating-linear-gradient/.test(css), 'pixel accent rail must stay');
  });

  it('F15.14: The sheet follows the visual viewport so the keyboard never covers the input', () => {
    const ui = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/ui.js'), 'utf8');
    const html = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/index.html'), 'utf8');
    const setup = ui.slice(ui.indexOf('setupChatSheet() {'), ui.indexOf('scrollChatToEnd() {'));

    assert.ok(/setupChatSheet\(\)/.test(ui), 'the sheet setup hook must exist');
    assert.ok(/visualViewport/.test(setup), 'the sheet must consult the visual viewport');
    assert.ok(/--sheet-height/.test(setup), 'the sheet height must be driven by --sheet-height');
    assert.ok(/vv\.addEventListener\('resize'/.test(setup), 'keyboard open/close must re-measure');
    assert.ok(/is-sheet/.test(ui), 'phone mode must toggle the is-sheet class');
    assert.ok(/chat-grabber/.test(html), 'the sheet needs a grab handle');
    assert.ok(/classList\.contains\('is-sheet'\)/.test(ui), 'opening the sheet must scroll to the last message');
  });

  it('F15.15: The canvas fills the shell and the office clears the HUD', () => {
    const css = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/css/style.css'), 'utf8');
    const canvas = css.slice(css.indexOf('#office {'), css.indexOf('#office:active'));
    assert.ok(/inset:\s*0/.test(canvas), 'the canvas spans the whole shell so the lawn is full-bleed');
    assert.ok(/width:\s*100%/.test(canvas) && /height:\s*100%/.test(canvas), 'the canvas must fill the shell');

    const root = css.slice(css.indexOf(':root {'), css.indexOf('* { box-sizing'));
    assert.ok(/--stage-top-gap:\s*\d+px/.test(root), 'the HUD margin must be defined once on :root');
    assert.ok(/--stage-top-gap:\s*20px/.test(css), 'the margin must shrink on tablets');
    assert.ok(/--stage-top-gap:\s*16px/.test(css), 'the margin must shrink further on phones');

    // The office is drawn below the HUD by a measured inset, not a CSS guess.
    const js = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/office.js'), 'utf8');
    assert.ok(/topInsetFor\(canvasHeight\)/.test(js), 'the inset must be derived at render time');
    assert.ok(/this\.hudBottom\(\) \+ this\.stageTopGap\(\)/.test(js),
      'the inset must be the HUD height plus the margin');
  });

  it('F15.16: The camera fills the focus region and never crops the building', () => {
    const { LO } = loadConfig(1600, false);
    const gap = 64;
    const w = 1600, h = 838;
    const withGap = LO.computeViewParams({
      width: w, height: h, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H, topInset: gap
    });
    const top = withGap.offsetY;

    // The building + rooftop sign must be fully inside the visible area.
    const ts = LO.TILE_SIZE;
    const focus = LO.VIEW_FOCUS;
    const focusW = (focus.x2 - focus.x1) * ts;
    const focusH = (focus.y2 - focus.y1) * ts;
    assert.ok(withGap.offsetX >= -0.5 && withGap.offsetX + focusW * withGap.zoom <= w + 0.5,
      'the focus width must fit horizontally');
    assert.ok(top + focusH * withGap.zoom <= h + 0.5, 'the focus height must fit vertically');
    assert.ok(top >= gap - 0.5, `content must start below the band, got ${top}`);
    assert.strictEqual(withGap.topInset, gap);

    // It zooms up versus a plain contain fit, but only within the cap.
    const contain = Math.min((w) / LO.CONTENT_W, (h - gap) / LO.CONTENT_H);
    assert.ok(withGap.zoom >= contain - 1e-9, 'the office should fill more than a bare contain fit');
    assert.ok(withGap.zoom <= contain * (LO.DESKTOP_ZOOM_CAP + 1e-9),
      'the zoom-up must stay under the cap');
  });

  it('F15.17: zero top inset keeps the office top-aligned and uncropped', () => {
    const { LO } = loadConfig(1600, false);
    const v = LO.computeViewParams({
      width: 1600, height: 900, contentW: LO.CONTENT_W, contentH: LO.CONTENT_H, topInset: 0
    });
    assert.strictEqual(v.topInset, 0);
    assert.strictEqual(v.offsetY, 0, 'with no band the content starts at the top');
    const focusH = (LO.VIEW_FOCUS.y2 - LO.VIEW_FOCUS.y1) * LO.TILE_SIZE;
    assert.ok(focusH * v.zoom <= 900 + 0.5, 'the focus region must still fit');
    assert.ok(v.zoom >= Math.min(1600 / LO.CONTENT_W, 900 / LO.CONTENT_H) - 1e-9,
      'the zoom must never fall below the contain fit');
  });

  it('F15.18: Screen<->world conversion stays exact with a top band', () => {
    const { LO, env } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    env.window.innerWidth = 1600;
    env.window.matchMedia = () => ({ matches: false });
    office.canvas = {
      clientWidth: 1600,
      clientHeight: 838,
      // The canvas fills the shell; the HUD sits above it and the office is
      // pushed down by the measured inset.
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 838, right: 1600, bottom: 838, x: 0, y: 0 })
    };
    office.camera = { x: 44, y: 25, targetX: 44, targetY: 25, zoom: null };
    office.drawerInset = 0;
    office._topGap = 64;

    const view = office.computeView(1600, 838);
    assert.strictEqual(office.topInsetFor(838), 64, 'the inset is the HUD height plus the margin');
    assert.ok(view.offsetY >= 64, `the office must start below the HUD, got ${view.offsetY}`);
    // The building + sign must fit; the empty margin below it is allowed to run
    // off the bottom (that is what removes the letterbox).
    const focusH = (LO.VIEW_FOCUS.y2 - LO.VIEW_FOCUS.y1) * LO.TILE_SIZE;
    assert.ok(view.offsetY + focusH * view.zoom <= 838 + 0.5,
      'the building must still fit inside the canvas below the HUD');
    // Pick a point that is actually inside the visible content box; a fit view
    // legitimately clamps taps that fall in the letterbox area.
    const worldX = LO.CONTENT_W / 2;
    const worldY = LO.CONTENT_H / 2;
    const screen = office.worldToScreen(worldX, worldY);
    const world = office.screenToWorld(screen.x, screen.y);
    assert.ok(Math.abs(world.x - worldX) < 1e-6 && Math.abs(world.y - worldY) < 1e-6,
      `round trip must stay exact, got ${world.x},${world.y}`);
    assert.ok(view.zoom > 0);
  });

  it('F15.19: Speech balloons use a named ceiling rim, not a magic number', () => {
    const src = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/agents.js'), 'utf8');
    assert.ok(/const BUBBLE_TOP_RIM = 34;/.test(src), 'the canopy rim must be a named constant');
    assert.ok(/by < BUBBLE_TOP_RIM/.test(src), 'the flip test must use the constant');
    assert.ok(!/by < 34\b/.test(src), 'no bare 34 may remain in the bubble logic');
  });
});

describe('Tier 1 — Feature 16: Floorplan Decoration', () => {
  const MAP_PATH = path.join(REPO, 'services/lami-office-react/web/assets/map/office.map.json');
  const TILESET_PATH = path.join(REPO, 'services/lami-office-react/web/assets/tiles/tileset.json');

  function decorCounts() {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const counts = {};
    for (const [value, run] of map.layers[2].data) {
      if (value) counts[value] = (counts[value] || 0) + run;
    }
    return counts;
  }

  it('F16.1: Doorways, plaques and sconces are placed around every door', () => {
    const counts = decorCounts();
    assert.strictEqual(counts.door_left, 6, 'Six doorway left jambs');
    assert.strictEqual(counts.door_right, 6, 'Six doorway right jambs');
    assert.strictEqual(counts.door_threshold, 12, 'Threshold on both tiles of all six doors');
    assert.strictEqual(counts.sign_plaque, 6, 'One room plaque per doorway');
    assert.ok(counts.sconce >= 6, `Expected sconces beside doors, got ${counts.sconce || 0}`);
  });

  it('F16.2: Windows appear on exterior walls, not on interior partitions', () => {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const flat = [];
    for (const [v, n] of map.layers[2].data) for (let k = 0; k < n; k++) flat.push(v);
    const meta = map.meta;
    let windows = 0;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const tile = flat[y * map.cols + x];
        // Windows are tagged with the room they belong to (window_research, ...).
        if (typeof tile !== 'string' || !tile.startsWith('window')) continue;
        windows++;
        const onEnvelope = y === meta.building.y1 || y === meta.building.y2 ||
          x === meta.building.x1 || x === meta.building.x2;
        assert.ok(onEnvelope, `Window at (${x},${y}) must sit on the building envelope`);
      }
    }
    assert.ok(windows >= 12, `Expected windows on the exterior walls, got ${windows}`);
  });

  it('F16.3: Rooms are decorated with plants, vents, rugs and wall art', () => {
    const counts = decorCounts();
    assert.ok(counts.plant >= 12, `Expected corner plants, got ${counts.plant || 0}`);
    assert.ok(counts.vent >= 2, 'Technical rooms need vents');
    assert.ok(counts.rug >= 2, 'Meeting/pantry need rugs');
    assert.ok(counts.poster >= 1, 'Wall posters expected');
    assert.ok(counts.wall_clock >= 1, 'Wall clocks expected');
    assert.strictEqual(counts.shop_awning, 1, 'Awning over the street entrance');
  });

  it('F16.4: Every decor tile name exists in the tileset index', () => {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const names = new Set(JSON.parse(fs.readFileSync(TILESET_PATH, 'utf8')).map((t) => t.name));
    const missing = new Set();
    for (const layer of map.layers) {
      for (const [value] of layer.data) {
        if (value && !names.has(value)) missing.add(value);
      }
    }
    assert.deepStrictEqual([...missing], [], `Unknown tiles: ${[...missing].join(', ')}`);
  });

  it('F16.5: Decoration never overwrites walkable floor or walls', () => {
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    const decode = (layer) => {
      const out = [];
      for (const [v, n] of layer.data) for (let k = 0; k < n; k++) out.push(v);
      return out;
    };
    const floor = decode(map.layers[0]);
    const walls = decode(map.layers[1]);
    for (let i = 0; i < floor.length; i++) {
      assert.ok(floor[i], `Tile ${i} must keep a floor value`);
      assert.ok(floor[i] !== undefined, 'Floor layer must be fully populated');
    }
    assert.ok(walls.some((w) => w), 'Wall layer must still contain walls');
  });

  it('F16.6: Door thresholds render below characters so nobody is hidden in a doorway', () => {
    const src = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/tilemap.js'), 'utf8');
    const ground = src.slice(src.indexOf('function paintGround'), src.indexOf('function paintOverlay'));
    const overlay = src.slice(src.indexOf('function paintOverlay'), src.indexOf('function drawLayer'));

    assert.ok(/=== DOOR_TILE/.test(ground), 'paintGround must handle the door tile');
    assert.ok(/drawTile\(ctx, map, DOOR_TILE/.test(ground), 'the threshold must be painted in the ground pass');
    assert.ok(!/drawTile\(ctx, map, DOOR_TILE/.test(overlay), 'the threshold must NOT be painted over characters');
    assert.ok(/name === DOOR_TILE\)\s*continue/.test(overlay), 'the overlay must skip the door tile entirely');
  });

  it('F16.7: The office render order keeps the wall overlay after the characters', () => {
    const office = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/office.js'), 'utf8');
    const render = office.slice(office.indexOf('render() {'), office.indexOf('LO.Office = Office'));
    const charsAt = render.indexOf('c.render(this.ctx)');
    const overlayAt = render.indexOf('renderOverlay');

    assert.ok(charsAt > -1 && overlayAt > charsAt, 'the overlay must be drawn after the characters for dollhouse depth');
  });
});

describe('Tier 1 — Feature 17: A2A Peer Agents & Backend Wiring', () => {
  it('F17.1: A2A peers are declared for the four LAN sidecars', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    for (const [ip, room] of [['192.168.3.91', 'research'], ['192.168.3.92', 'meeting'],
      ['192.168.3.93', 'engineering'], ['192.168.3.94', 'server']]) {
      assert.ok(server.includes(ip), `Peer IP ${ip} must be configured`);
      assert.ok(server.includes(`"room": "${room}"`), `Peer on ${ip} must map to room ${room}`);
    }
    assert.ok(server.includes('"/api/a2a"'), 'Presence endpoint must exist');
    assert.ok(server.includes('"/api/a2a/send"'), 'Send endpoint must exist');
    assert.ok(server.includes('x-a2a-token'), 'A2A secret header must be used');
  });

  it('F17.2: A2A messages require a configured secret and a known peer', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    assert.ok(/a2a_secret/.test(server), 'a2a_secret must be configurable');
    assert.ok(/a2a_peer_tokens/.test(server), 'per-peer tokens must be configurable');
    assert.ok(/token A2A belum diisi/.test(server), 'Sending must fail clearly without a token');
    assert.ok(/peer tidak dikenal/.test(server), 'Unknown peers must be rejected');
  });

  it('F17.3: Public tunnel traffic can never send A2A messages', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    const sendFn = server.slice(server.indexOf('def handle_a2a_send'));
    const body = sendFn.slice(0, sendFn.indexOf('def handle_events'));
    assert.ok(/is_public\(\)/.test(body), 'Send handler must reject public traffic');
    assert.ok(/is_trusted\(\)/.test(body), 'Send handler must require a trusted host');
  });

  it('F17.3b: Official A2A peers are detected by Agent Card and sent via JSON-RPC', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    assert.ok(server.includes('.well-known/agent-card.json'), 'Agent Card must be probed');
    assert.ok(/\"method\": \"SendMessage\"/.test(server), 'Official sends must use JSON-RPC SendMessage');
    assert.ok(/Authorization.*Bearer/.test(server), 'Official sends must use a Bearer token');
    assert.ok(server.includes('192.168.3.31') && server.includes('"port": 9900'),
      'The Lami gateway on 192.168.3.31:9900 must be a peer');
    assert.ok(/protocol_detected/.test(server), 'Dialect must be auto-detected per peer');
  });

  it('F17.3c: A2A replies are parsed from the task status or artifacts', () => {
    const server = fs.readFileSync(path.join(REPO, 'services/lami-office-react/server.py'), 'utf8');
    assert.ok(/TASK_STATE|status\.get\(\"state\"\)/.test(server), 'Task state must be read');
    assert.ok(/artifacts/.test(server), 'Artifact text must be read as a reply source');
  });

  it('F17.4: Peer characters are placed inside their specialty rooms', () => {
    const { LO } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.peerAgents = new Map();
    office.residents = [];
    office.collisionGrid = LO.Office.prototype.buildCollisionGrid.call({
      getFurnitureObstacles: LO.Office.prototype.getFurnitureObstacles
    });
    office.isWalkable = LO.Office.prototype.isWalkable.bind(office);

    office.applyA2APeers([
      { id: 'yuna', name: 'Yuna', host: '192.168.3.91', room: 'research', online: true },
      { id: 'aurora', name: 'Aurora', host: '192.168.3.92', room: 'meeting', online: true },
      { id: 'kira', name: 'Kira', host: '192.168.3.93', room: 'engineering', online: false },
      { id: 'cyro', name: 'Cyro', host: '192.168.3.94', room: 'server', online: true }
    ]);

    assert.strictEqual(office.peerAgents.size, 4, 'All four peers must be spawned');
    for (const agent of office.peerAgents.values()) {
      assert.ok(agent instanceof LO.PeerAgent, 'Peer must use the PeerAgent class');
      assert.ok(agent.online === undefined || typeof agent.online === 'boolean');
      const bounds = LO.ROOMS[agent.room].bounds;
      assert.ok(agent.col >= bounds.x1 && agent.col <= bounds.x2, `${agent.name} col inside ${agent.room}`);
      assert.ok(agent.row >= bounds.y1 && agent.row <= bounds.y2, `${agent.name} row inside ${agent.room}`);
      assert.strictEqual(office.isWalkable(agent.col, agent.row), true, `${agent.name} must stand on a walkable tile`);
    }
  });

  it('F17.5: Peer presence updates in place and stale peers are removed', () => {
    const { LO } = loadOffice();
    const office = Object.create(LO.Office.prototype);
    office.peerAgents = new Map();
    office.residents = [];
    office.collisionGrid = LO.Office.prototype.buildCollisionGrid.call({
      getFurnitureObstacles: LO.Office.prototype.getFurnitureObstacles
    });
    office.isWalkable = LO.Office.prototype.isWalkable.bind(office);

    office.applyA2APeers([{ id: 'yuna', name: 'Yuna', host: '192.168.3.91', room: 'research', online: true }]);
    const first = office.peerAgents.get('yuna');
    office.applyA2APeers([{ id: 'yuna', name: 'Yuna', host: '192.168.3.91', room: 'research', online: false }]);
    assert.strictEqual(office.peerAgents.size, 1, 'Removing a peer must not duplicate it');
    assert.strictEqual(office.peerAgents.get('yuna'), first, 'Same agent instance must be reused');
    assert.strictEqual(office.peerAgents.get('yuna').online, false, 'Online flag must refresh');

    office.applyA2APeers([]);
    assert.strictEqual(office.peerAgents.size, 0, 'Peers no longer reported must be removed');
  });
});

describe('Tier 1 — Feature 18: Live State Persistence Across Reloads', () => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  const SERVER = pathx.join(REPO, 'services/lami-office-react/server.py');

  it('F18.1: Agent identity is deterministic — the same id always gets the same name and look', () => {
    const { LO } = loadConfig(1400, false);
    const ids = ['sa-abc123', 'sa-77f2a1', 'sa-1', 'sa-zzz'];
    for (const id of ids) {
      const name1 = LO.nameForAgent(id, null);
      const name2 = LO.nameForAgent(id, null);
      const look1 = LO.lookForAgent(id);
      const look2 = LO.lookForAgent(id);
      assert.strictEqual(name1, name2, `Name for ${id} must be stable`);
      assert.deepStrictEqual(look1, look2, `Look for ${id} must be stable`);
    }
    // A provided name always wins (the server can label an agent explicitly)
    assert.strictEqual(LO.nameForAgent('sa-x', 'Rina'), 'Rina');
  });

  it('F18.2: Different agent ids map to different slot indices', () => {
    const { LO } = loadConfig(1400, false);
    const seen = new Set();
    for (const id of ['sa-aaa', 'sa-bbb', 'sa-ccc', 'sa-ddd', 'sa-eee']) {
      seen.add(LO.slotIndexForAgent(id, 6));
    }
    assert.ok(seen.size > 1, 'Slot assignment must spread agents across slots');
    for (const idx of seen) {
      assert.ok(idx >= 0 && idx < 6, `Slot index ${idx} must be in range`);
    }
  });

  it('F18.3: Sub-agents are spawned in restore mode without an entrance animation', () => {
    const src = fsx.readFileSync(pathx.join(REPO, 'services/lami-office-react/web/js/office.js'), 'utf8');
    assert.ok(/opts\.restore|restore = Boolean/.test(src), 'spawnSubAgent must accept a restore option');
    assert.ok(/agent\.state = 'work'/.test(src), 'Restored agents resume in the work state');
    assert.ok(/preferredSlot === 'auto'/.test(src), 'Restore uses deterministic auto placement');
  });

  it('F18.4: In live mode the roster comes from the server, not the event feed', () => {
    const src = fsx.readFileSync(pathx.join(REPO, 'services/lami-office-react/web/js/net.js'), 'utf8');
    // Offline/demo may still rebuild agents locally, so the restore path stays.
    assert.ok(/restore: true/.test(src), 'offline restore must still use restore mode');
    // Live mode: the server owns the floor, so the client must not build bodies
    // from snapshot/event messages (that produced agents it never simulated).
    assert.ok(/!this\.office\.simulatedExternally/.test(src),
      'snapshot/event driven agent creation must be gated on live mode');
    const spawn = src.slice(src.indexOf("case 'agent_spawn':"), src.indexOf("case 'tool_start':"));
    assert.ok(/if \(!this\.office\.simulatedExternally\)/.test(spawn),
      'agent_spawn must not create a body while the server simulates');
  });

  it('F18.5: Server persists and reloads office state', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    assert.ok(/def _load_state/.test(src) && /def _save_state/.test(src), 'Hub must persist state');
    assert.ok(/state_file/.test(src), 'State file must be configurable');
    assert.ok(/OFFICE_STATE_FILE/.test(src), 'OFFICE_STATE_FILE env must be honoured');
    assert.ok(/self\.history\.append/.test(src), 'Recent activity must be recorded');
  });

  it('F18.6: Restoring replays agent_done so finished agents are not resurrected', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    const load = src.slice(src.indexOf('def _load_state'), src.indexOf('def _save_state'));
    assert.ok(/for ev in self\.history:\s*\n\s*self\._apply\(ev\)/.test(load),
      'Restore must replay every event, including agent_done');
  });

  it('F18.7: Snapshot includes the recent history feed', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    const snap = src.slice(src.indexOf('def snapshot(self) -> dict'), src.indexOf('def _load_state'));
    assert.ok(/"history": list\(self\.history/.test(snap), 'Snapshot must expose recent history');
  });
});

describe('Tier 1 — Feature 19: Overlay Footprint (notifications must not cover the floorplan)', () => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  const CSS = pathx.join(REPO, 'services/lami-office-react/web/css/style.css');
  const UI = pathx.join(REPO, 'services/lami-office-react/web/js/ui.js');

  it('F19.1: The activity ticker is height-capped so it cannot cover the left page', () => {
    const css = fsx.readFileSync(CSS, 'utf8');
    const block = css.slice(css.indexOf('#ticker {'), css.indexOf('#ticker-list'));
    assert.ok(/max-height:\s*22vh/.test(block), 'Ticker must cap its height');
    assert.ok(/overflow:\s*hidden/.test(block), 'Ticker must clip overflow');
  });

  it('F19.2: Restoring history shows at most one toast, not a stack', () => {
    const src = fsx.readFileSync(UI, 'utf8');
    const start = src.indexOf('restoreActivity(history)');
    const body = src.slice(start, src.indexOf('\n    describeHistoryEvent(', start));
    // It must delegate to addTicker (which renders exactly one item) and must
    // not bulk-append list items.
    assert.ok(/this\.addTicker\(/.test(body), 'restoreActivity should reuse the single-toast renderer');
    assert.ok(!/appendChild/.test(body), 'restoreActivity must not bulk-append toasts');
    assert.ok(!/innerHTML\s*=\s*''/.test(body), 'restoreActivity must not clear/rebuild the list itself');
  });

  it('F19.3: A normal ticker call replaces the previous toast', () => {
    const src = fsx.readFileSync(UI, 'utf8');
    const start = src.indexOf('addTicker(icon, htmlText)');
    const body = src.slice(start, start + 1200);
    assert.ok(/tickerList\.innerHTML = ''/.test(body), 'addTicker must clear before rendering one toast');
  });
});

describe('Tier 1 — Feature 20: Mesh Sidecar Roles & Recipient Mapping', () => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  const SERVER = pathx.join(REPO, 'services/lami-office-react/server.py');

  it('F20.1: Sidecar rooms match their real roles (security->server, devops->engineering)', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    assert.ok(/"id": "kira",\s+"name": "Kira",\s+"host": "192\.168\.3\.93",\s+"port": 8000,\s+"room": "server"/.test(src),
      'Kira (security) must sit in the Server Room');
    assert.ok(/"id": "cyro",\s+"name": "Cyro",\s+"host": "192\.168\.3\.94",\s+"port": 8000,\s+"room": "engineering"/.test(src),
      'Cyro (DevOps) must sit in the Engineering Pit');
    assert.ok(/"id": "aurora"[\s\S]{0,160}"room": "meeting"/.test(src), 'Aurora (PM) must sit in the Meeting Room');
  });

  it('F20.2: A peer can send to a mesh-registered recipient distinct from its display id', () => {
    const src = fsx.readFileSync(SERVER, 'utf8');
    assert.ok(/self\.recipient = str\(spec\.get\("recipient"\) or self\.id\)/.test(src),
      'A2APeer must support a recipient override');
    assert.ok(/"recipient": peer\.recipient or peer\.id/.test(src),
      'Outgoing messages must use the mesh recipient id');
    assert.ok(/"id": "aurora"[\s\S]{0,220}"recipient": "clark"/.test(src),
      'Aurora must map to the mesh id "clark"');
  });

  it('F20.3: No sidecar secret is committed to the repository', () => {
    const tracked = ['README.md', 'PROJECT.md', '.env.example', 'docker-compose.yml',
      'services/lami-office-react/server.py'];
    for (const f of tracked) {
      const txt = fsx.readFileSync(pathx.join(REPO, f), 'utf8');
      assert.ok(!/a2a_secret_mesh_ebi_2026/.test(txt), `${f} must not contain the mesh secret`);
    }
  });
});

describe('Tier 1 — Feature 25: Per-room wall palette', () => {
  const ROOMS6 = ['boss', 'research', 'server', 'engineering', 'meeting', 'pantry'];
  const TILESET = path.join(REPO, 'services/lami-office-react/web/assets/tiles/tileset.json');
  const WALL_MAP = path.join(REPO, 'services/lami-office-react/web/assets/map/office.map.json');

  it('F25.1: every room has a tileset entry for each wall variant and window', () => {
    const index = JSON.parse(fs.readFileSync(TILESET, 'utf8'));
    const names = new Set(index.map((t) => t.name));
    for (const room of ROOMS6) {
      for (const kind of ['wall_face', 'wall_top', 'wall_side_l', 'wall_side_r', 'window']) {
        assert.ok(names.has(`${kind}_${room}`),
          `${room} is missing ${kind}_${room}; the room would fall back to the generic wall`);
      }
    }
  });

  it('F25.2: tileset entries stay inside the spritesheet grid', () => {
    const index = JSON.parse(fs.readFileSync(TILESET, 'utf8'));
    const seen = new Set();
    for (const t of index) {
      const key = `${t.col},${t.row}`;
      assert.ok(!seen.has(key), `two tiles share the cell ${key} (${t.name})`);
      seen.add(key);
      assert.ok(t.col >= 0 && t.col < 8, `${t.name} col out of range`);
      assert.ok(t.row >= 0 && t.row < 16, `${t.name} row out of range`);
    }
  });

  it('F25.3: every wall tile in the map carries its room tag', () => {
    const map = JSON.parse(fs.readFileSync(WALL_MAP, 'utf8'));
    const walls = map.layers.find((l) => l.name === 'walls');
    const flat = [];
    for (const [v, n] of walls.data) for (let k = 0; k < n; k++) flat.push(v);

    const tagged = {};
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const name = flat[y * map.cols + x];
        if (typeof name !== 'string' || !name.startsWith('wall_')) continue;
        if (name === 'wall_face' || name === 'wall_top' || name === 'wall_partition') continue;
        const room = name.slice(name.lastIndexOf('_') + 1);
        tagged[room] = (tagged[room] || 0) + 1;
      }
    }
    for (const room of ROOMS6) {
      assert.ok(tagged[room] > 10, `${room} has only ${tagged[room] || 0} room-tagged wall tiles`);
    }
  });

  it('F25.4: tilemap.js resolves room tops and treats tagged walls as solid', () => {
    const src = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/tilemap.js'), 'utf8');
    assert.ok(/function wallRoomSuffix/.test(src), 'a room-suffix resolver must exist');
    assert.ok(/function wallTopFor/.test(src), 'wall tops must match the body room');
    assert.ok(/name\.indexOf\('wall_'\) === 0/.test(src),
      'every wall_* variant must count as solid');
    assert.ok(/wallTopFor\(name\)/.test(src), 'the renderer must use the room-matched top');
  });

  it('F25.5: the six room colours are actually distinct', () => {
    const cfg = fs.readFileSync(path.join(REPO, 'services/lami-office-react/web/js/config.js'), 'utf8');
    // Restrict to the LO.ROOMS block: LO.HALLWAY also has a `wall` colour.
    const start = cfg.indexOf('LO.ROOMS = {');
    const end = cfg.indexOf('LO.HALLWAY', start);
    assert.ok(start > -1 && end > start, 'the LO.ROOMS block must be locatable');
    const roomsBlock = cfg.slice(start, end);
    const palette = [...roomsBlock.matchAll(/wall:\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => m[1].toLowerCase());
    assert.strictEqual(palette.length, ROOMS6.length, `expected ${ROOMS6.length} wall colours`);
    assert.strictEqual(new Set(palette).size, ROOMS6.length, 'each room needs its own wall colour');
  });
});

describe('Tier 1 — Feature 31: Full-bleed office view', () => {
  const CONFIG = path.join(REPO, 'services/lami-office-react/web/js/config.js');
  const OFFICE = path.join(REPO, 'services/lami-office-react/web/js/office.js');
  const TILEMAP = path.join(REPO, 'services/lami-office-react/web/js/tilemap.js');

  it('F31.1: the desktop zoom fills the focus region but never crops the building', () => {
    const { LO } = loadConfig(1920, false);
    const ts = LO.TILE_SIZE;
    const focus = LO.VIEW_FOCUS;
    const fw = (focus.x2 - focus.x1) * ts;
    const fh = (focus.y2 - focus.y1) * ts;

    for (const [w, h] of [[1366, 706], [1440, 830], [1800, 910], [2560, 900], [1200, 1000], [1920, 1018]]) {
      const gap = 78;
      const v = LO.computeViewParams({ width: w, height: h, topInset: gap });
      const contain = Math.min(w / LO.CONTENT_W, (h - gap) / LO.CONTENT_H);
      assert.ok(v.zoom >= contain - 1e-9, `${w}x${h}: zoom must not drop below the contain fit`);
      assert.ok(v.zoom <= contain * LO.DESKTOP_ZOOM_CAP + 1e-9, `${w}x${h}: zoom must respect the cap`);
      assert.ok(v.offsetX >= 0, `${w}x${h}: a negative offset would clip the west wall`);
      assert.ok(v.offsetX + fw * v.zoom <= w + 0.5, `${w}x${h}: the building must fit horizontally`);
      assert.ok(v.offsetY + fh * v.zoom <= h + 0.5, `${w}x${h}: the building must fit vertically`);
      assert.ok(v.offsetY >= gap - 0.5, `${w}x${h}: the office must start below the HUD band`);
    }
  });

  it('F31.2: the empty outside margin is what gets cropped, not the rooms', () => {
    const { LO } = loadConfig(1920, false);
    const v = LO.computeViewParams({ width: 1800, height: 910, topInset: 78 });
    // The old behaviour fit the whole 800px canvas, which forced a big letterbox.
    const renderedH = LO.CONTENT_H * v.zoom;
    const availH = 910 - 78;
    assert.ok(renderedH > availH, 'the canvas intentionally overflows so the margin is cropped');
    const buildingBottom = (LO.BUILDING.y2 + 1) * LO.TILE_SIZE;
    assert.ok(v.offsetY + buildingBottom * v.zoom <= 910 + 0.5,
      'the building bottom must remain on screen');
  });

  it('F31.3: the letterbox is painted with the outside terrain, not black', () => {
    const tm = fs.readFileSync(TILEMAP, 'utf8');
    assert.ok(/function drawOutsideFill/.test(tm), 'a terrain filler must exist');
    assert.ok(/drawOutsideFill/.test(tm.slice(tm.indexOf('LO.Tilemap = {'))),
      'it must be exported for the renderer');
    const office = fs.readFileSync(OFFICE, 'utf8');
    assert.ok(/LO\.Tilemap\.drawOutsideFill\(this\.ctx, w, h, view\.zoom\)/.test(office),
      'the renderer must fill the canvas with the terrain at the current zoom');
    assert.ok(!/this\.ctx\.fillStyle = '#141226'/.test(office),
      'the old near-black background fill must be gone');
  });

  it('F31.4: the band behind the translucent HUD stays dark', () => {
    const office = fs.readFileSync(OFFICE, 'utf8');
    assert.ok(/const hudBand = Math\.max\(0, this\.topInsetFor\(h\) - this\.stageTopGap\(\)\)/.test(office),
      'the HUD band must be derived from the inset');
    assert.ok(/'#181124'/.test(office), 'the HUD band must be repainted with the shell colour');
  });
});
