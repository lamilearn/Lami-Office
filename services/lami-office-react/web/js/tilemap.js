/* Lami's AI Office — Tilemap & Spritesheet Renderer (assets/map/office.map.json) */
(function () {
  const LO = (window.LO = window.LO || {});

  const DEFAULT_TILESET = 'assets/tiles/tileset.json';
  const DEFAULT_MAP = 'assets/map/office.map.json';
  const TILESET_PNG = 'assets/tiles/tileset.png';
  const OUTSIDE_TILE = 'floor_outside';
  const WALL_LIFT = 14; // px the north-wall face rises above its tile (fake height)
  const LAYER_ORDER = ['floor', 'walls', 'decor'];
  const SOUTH_FACE_MIN = 3; // tile height (px) drawn on the south edge of a wall run

  const STATE = {
    map: null,
    index: null,
    image: null,
    ready: false,
    failed: false,
    loading: null
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
      LO.tilemap = STATE;
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

  // Paint one tile name across a whole layer.
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

  function isSolidWall(map, x, y) {
    if (!map || !map.layers.walls) return false;
    if (y < 0 || y >= map.rows || x < 0 || x >= map.cols) return true;
    return !!map.layers.walls[y][x] && map.layers.walls[y][x] !== OUTSIDE_TILE;
  }

  // Floors first, then the parts of walls that sit *behind* characters:
  // the north-face extrusion. The flat wall body is drawn later via drawWallOverlay
  // so characters standing in front of a wall are never hidden.
  function drawGround(ctx) {
    if (!isReady()) return false;
    const map = STATE.map;
    const ts = map.tileSize;
    drawLayer(ctx, 'floor');

    const walls = map.layers.walls;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const name = walls[y][x];
        if (!name || name === 'door_mid') continue;
        const aboveSolid = isSolidWall(map, x, y - 1);
        const belowSolid = isSolidWall(map, x, y + 1);
        if (!belowSolid) {
          // south-facing wall: render the whole face raised, like a room divider
          drawTile(ctx, map, 'wall_top', x * ts, y * ts - WALL_LIFT);
          drawTile(ctx, map, name === 'wall_top' ? 'wall_top' : name, x * ts, y * ts - WALL_LIFT + 4);
          ctx.fillStyle = 'rgba(15, 10, 25, 0.22)';
          ctx.fillRect(x * ts, y * ts + ts, ts, 6);
        } else if (aboveSolid) {
          // interior wall running vertically: draw the tile flush
          drawTile(ctx, map, name, x * ts, y * ts);
        } else {
          drawTile(ctx, map, name, x * ts, y * ts);
        }
      }
    }
    return true;
  }

  // Wall tops, door frames and decorations drawn after characters so rooms read
  // as enclosed boxes (dollhouse / architect-plan look).
  function drawWallOverlay(ctx) {
    if (!isReady()) return false;
    const map = STATE.map;
    const ts = map.tileSize;
    const walls = map.layers.walls;

    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const name = walls[y][x];
        if (!name) continue;
        if (name === 'door_mid') {
          drawTile(ctx, map, 'door_mid', x * ts, y * ts);
          continue;
        }
        const belowSolid = isSolidWall(map, x, y + 1);
        if (belowSolid) continue; // flush body already drawn in drawGround
        // riser cap on top of the raised face
        drawTile(ctx, map, 'wall_top', x * ts, y * ts - WALL_LIFT);
        ctx.fillStyle = 'rgba(58, 40, 56, 0.35)';
        ctx.fillRect(x * ts, y * ts + ts, ts, 1);
      }
    }

    return drawLayer(ctx, 'decor');
  }

  // Solid tiles (walls layer) — used by the generator dry-run and tests.
  function solidTiles() {
    if (!STATE.map) return null;
    const out = [];
    for (let y = 0; y < STATE.map.rows; y++) {
      for (let x = 0; x < STATE.map.cols; x++) {
        if (isSolidWall(STATE.map, x, y)) out.push({ x, y, name: STATE.map.layers.walls[y][x] });
      }
    }
    return out;
  }

  // Tiles referenced by the map but missing from the tileset index.
  function missingTiles() {
    if (!STATE.map) return [];
    const names = STATE.map.names;
    const missing = new Set();
    for (const layer of Object.values(STATE.map.layers)) {
      for (const row of layer) {
        for (const name of row) {
          if (name && !names.has(name)) missing.add(name);
        }
      }
    }
    return [...missing];
  }

  LO.tilemap = STATE;
  LO.Tilemap = {
    load,
    isReady,
    isFailed() { return STATE.failed; },
    get map() { return STATE.map; },
    decodeLayer,
    drawGround,
    drawWallOverlay,
    drawLayer,
    drawTile,
    isSolidWall,
    solidTiles,
    missingTiles,
    layerOrder: LAYER_ORDER,
    SOUTH_FACE_MIN
  };
})();
