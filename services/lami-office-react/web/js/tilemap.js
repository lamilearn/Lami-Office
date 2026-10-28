/* Lami's AI Office — Tilemap & Spritesheet Renderer (assets/map/office.map.json) */
(function () {
  const LO = (window.LO = window.LO || {});

  const DEFAULT_TILESET = 'assets/tiles/tileset.json';
  const DEFAULT_MAP = 'assets/map/office.map.json';
  const TILESET_PNG = 'assets/tiles/tileset.png';
  const DOOR_TILE = 'door_mid';
  const OUTSIDE_TILE = 'floor_outside';
  const WALL_LIFT = 14; // px the north-wall face rises above its tile (fake height)

  const STATE = {
    map: null,
    index: null,
    image: null,
    ready: false,
    failed: false,
    loading: null,
    groundCanvas: null,
    overlayCanvas: null,
    baked: false
  };

  function decodeLayer(layer, cols, rows) {
    const total = cols * rows;
    const flat = new Array(total);
    let i = 0;
    if (layer.encoding === 'rle') {
      for (const entry of layer.data || []) {
        const value = entry[0] === undefined ? null : entry[0];
        const run = entry[1] || 0;
        for (let k = 0; k < run && i < total; k++) flat[i++] = value;
      }
    } else if (Array.isArray(layer.data)) {
      for (const v of layer.data) {
        if (i >= total) break;
        flat[i++] = v === undefined ? null : v;
      }
    }
    if (i !== total) throw new Error(`tilemap layer "${layer.name}" has ${i} tiles, expected ${total}`);
    const out = [];
    for (let y = 0; y < rows; y++) out.push(flat.slice(y * cols, (y + 1) * cols));
    return out;
  }

  function decodeMap(raw) {
    const cols = raw.cols;
    const rows = raw.rows;
    const layers = {};
    for (const layer of raw.layers || []) layers[layer.name] = decodeLayer(layer, cols, rows);
    const index = new Map();
    for (const entry of STATE.index || []) index.set(entry.name, { col: entry.col, row: entry.row });
    return {
      cols,
      rows,
      tileSize: raw.tileSize || LO.TILE_SIZE || 16,
      layers,
      index,
      names: new Set(index.keys()),
      meta: raw.meta || {},
      tileset: raw.tileset || DEFAULT_TILESET
    };
  }

  function loadImage(src) {
    if (typeof Image === 'undefined') return Promise.reject(new Error('Image is not available'));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${src}`));
      img.src = src;
    });
  }

  async function fetchJson(url) {
    if (typeof fetch !== 'function') throw new Error('fetch is not available');
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  // Load the tileset index, the map and the spritesheet. Safe to call repeatedly.
  function load(options = {}) {
    if (STATE.ready) return Promise.resolve(STATE.map);
    if (STATE.loading) return STATE.loading;
    const tilesetUrl = options.tileset || DEFAULT_TILESET;
    const mapUrl = options.map || DEFAULT_MAP;
    const imageUrl = options.image || TILESET_PNG;

    STATE.loading = (async () => {
      const [index, rawMap, image] = await Promise.all([
        fetchJson(tilesetUrl),
        fetchJson(mapUrl),
        loadImage(imageUrl)
      ]);
      STATE.index = Array.isArray(index) ? index : (index.tiles || []);
      STATE.image = image;
      STATE.map = decodeMap(rawMap);
      STATE.ready = true;
      STATE.failed = false;
      bake();
      return STATE.map;
    })().catch((err) => {
      STATE.failed = true;
      STATE.loading = null;
      throw err;
    });

    return STATE.loading;
  }

  function isReady() {
    return STATE.ready && !!STATE.map && !!STATE.image;
  }

  function tileRect(map, name) {
    const cell = map.index.get(name);
    if (!cell) return null;
    return {
      sx: cell.col * map.tileSize,
      sy: cell.row * map.tileSize,
      sw: map.tileSize,
      sh: map.tileSize
    };
  }

  function drawTile(ctx, map, name, dx, dy) {
    const rect = tileRect(map, name);
    if (!rect || !STATE.image) return false;
    ctx.drawImage(STATE.image, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, map.tileSize, map.tileSize);
    return true;
  }

  // A wall tile is solid unless it is an outside filler or a walkable doorway.
  function isSolidWall(map, x, y) {
    if (!map || !map.layers.walls) return false;
    if (y < 0 || y >= map.rows || x < 0 || x >= map.cols) return true;
    const name = map.layers.walls[y][x];
    return !!name && name !== OUTSIDE_TILE && name !== DOOR_TILE;
  }

  // Floors + the flush/set-back parts of walls (drawn below characters).
  function paintGround(ctx) {
    const map = STATE.map;
    const ts = map.tileSize;
    drawLayer(ctx, 'floor');

    const walls = map.layers.walls;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const name = walls[y][x];
        if (!name) continue;
        if (name === DOOR_TILE) {
          // Door thresholds are walkable floor: draw them below the characters
          // so someone crossing the doorway is never hidden by the tile.
          drawTile(ctx, map, DOOR_TILE, x * ts, y * ts);
          continue;
        }
        const belowSolid = isSolidWall(map, x, y + 1);
        if (!belowSolid) {
          // south-facing wall: render the face raised, like a room divider
          drawTile(ctx, map, 'wall_top', x * ts, y * ts - WALL_LIFT);
          drawTile(ctx, map, name === 'wall_top' ? 'wall_top' : name, x * ts, y * ts - WALL_LIFT + 4);
          ctx.fillStyle = 'rgba(15, 10, 25, 0.22)';
          ctx.fillRect(x * ts, y * ts + ts, ts, 6);
        } else {
          drawTile(ctx, map, name, x * ts, y * ts);
        }
      }
    }
  }

  // Wall tops, doorway frames and decor (drawn above characters so rooms read
  // as enclosed boxes / architect-plan depth).
  function paintOverlay(ctx) {
    const map = STATE.map;
    const ts = map.tileSize;
    const walls = map.layers.walls;

    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const name = walls[y][x];
        if (!name) continue;
        if (name === DOOR_TILE) continue; // threshold is floor: drawn below characters
        if (isSolidWall(map, x, y + 1)) continue; // flush body already drawn in paintGround
        drawTile(ctx, map, 'wall_top', x * ts, y * ts - WALL_LIFT);
        ctx.fillStyle = 'rgba(58, 40, 56, 0.35)';
        ctx.fillRect(x * ts, y * ts + ts, ts, 1);
      }
    }

    drawLayer(ctx, 'decor');
  }

  // Paint one tile layer across the whole map.
  function drawLayer(ctx, layerName) {
    if (!isReady()) return false;
    const map = STATE.map;
    const layer = map.layers[layerName];
    if (!layer) return false;
    const ts = map.tileSize;
    for (let y = 0; y < map.rows; y++) {
      const row = layer[y];
      for (let x = 0; x < map.cols; x++) {
        const name = row[x];
        if (!name) continue;
        drawTile(ctx, map, name, x * ts, y * ts);
      }
    }
    return true;
  }

  function makeCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c;
    }
    return null;
  }

  // Rasterize the static ground and overlay layers once so render() only blits
  // two images per frame instead of redrawing thousands of tiles.
  function bake() {
    STATE.baked = false;
    if (!isReady()) return;
    const map = STATE.map;
    const w = (LO.CONTENT_W || map.cols * map.tileSize);
    const h = (LO.CONTENT_H || map.rows * map.tileSize);

    const ground = makeCanvas(w, h);
    const overlay = makeCanvas(w, h);
    if (!ground || !overlay) return;

    const gctx = ground.getContext('2d');
    const octx = overlay.getContext('2d');
    if (!gctx || !octx) return;
    gctx.imageSmoothingEnabled = false;
    octx.imageSmoothingEnabled = false;

    paintGround(gctx);
    paintOverlay(octx);

    STATE.groundCanvas = ground;
    STATE.overlayCanvas = overlay;
    STATE.baked = true;
  }

  // Floors, wall faces and set-back walls (below characters).
  function drawGround(ctx) {
    if (!isReady()) return false;
    if (STATE.baked) {
      ctx.drawImage(STATE.groundCanvas, 0, 0);
      return true;
    }
    paintGround(ctx);
    return true;
  }

  // Wall tops, doorway frames and decor (above characters).
  function drawWallOverlay(ctx) {
    if (!isReady()) return false;
    if (STATE.baked) {
      ctx.drawImage(STATE.overlayCanvas, 0, 0);
      return true;
    }
    paintOverlay(ctx);
    return true;
  }

  LO.Tilemap = {
    load,
    isReady,
    drawGround,
    drawWallOverlay
  };
})();
