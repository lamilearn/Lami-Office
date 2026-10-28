/* Lami's AI Office — Procedural Chibi Pixel-Art Sprites (Isometric 4-Directions) */
(function () {
  const LO = window.LO;

  const OUTLINE = '#3a2838';
  const HAIR = [
    ['#4a3428', '#33231b'], ['#2d2a3e', '#1d1b29'], ['#e9a24a', '#c97f2c'], ['#d4567a', '#a93c5c'],
    ['#7a5bd1', '#5a3fae'], ['#3f7fd1', '#2c5ea6'], ['#f3d36b', '#d6b043'], ['#5bbf9a', '#3d9a78'],
    ['#b9a6e8', '#9883d1'], ['#e86d4f', '#c1513a'],
  ];
  const SKIN = [['#ffe0c4', '#f5c3a0'], ['#ffd2ad', '#ebb48a'], ['#e8b48c', '#cf956b'], ['#c98d63', '#a8714c']];
  const CLOTH = [
    ['#ff8fab', '#e56b8b'], ['#7ec8f2', '#5aa7d6'], ['#8fdba8', '#62bb83'], ['#ffc46b', '#eaa540'],
    ['#b79cf2', '#9478d6'], ['#ff9e7a', '#e57c58'], ['#6fd0c8', '#47b0a7'], ['#f58fd0', '#d468b0'],
  ];
  const PANTS = ['#4b4e7a', '#5a4a6e', '#3f5a6e', '#6e4a4a'];
  LO.PALETTE = { HAIR, SKIN, CLOTH, PANTS };

  // South (Facing Down / Front) 14 x 20
  const SOUTH_BODY = [
    '....OOOOOO....',
    '...OHHHHHHO...',
    '..OHHHHHHHHO..',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHHHHHO.',
    '.OHHhHHHHhHHO.',
    '.OHSSSSSSSSHO.',
    '.OSSSESSSESSO.',
    '.OSSSESSSESSO.',
    '.OSSBSSSSSBSO.',
    '..OSSSSmSSSO..',
    '...OOSSSSOO...',
    '..OCCCwwCCCO..',
    '.OCCCCwwCCCCO.',
    '.OSCCCCCCCCSO.',
    '..OccccccccO..',
    '...OPPPPPPO...',
    '...OPPOOPPO...',
    '...OPPOOPPO...',
    '...KKK..KKK...',
  ];

  // North (Facing Up / Back) 14 x 20
  const NORTH_BODY = [
    '....OOOOOO....',
    '...OHHHHHHO...',
    '..OHHHHHHHHO..',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHHHHHO.',
    '..OHHHHHHHHO..',
    '...OHHHHHHO...',
    '...OOHHHHOO...',
    '..OCCCCCCCC..',
    '.OCCCCCCCCCC.',
    '.OCCCCCCCCCC.',
    '..OccccccccO..',
    '...OPPPPPPO...',
    '...OPPOOPPO...',
    '...OPPOOPPO...',
    '...KKK..KKK...',
  ];

  // East (Facing Right / Side profile) 14 x 20
  const EAST_BODY = [
    '....OOOOOO....',
    '...OHHHHHHO...',
    '..OHHHHHHHHO..',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHHHHHO.',
    '.OHHHHHHhHHO..',
    '.OHSSSSSSSHO..',
    '.OSSSESSSSO...',
    '.OSSSESSSSO...',
    '.OSSSSSBSO....',
    '..OSSSmSSO....',
    '...OOSSSSO....',
    '..OCCCCCO.....',
    '.OCCCCCCCCO...',
    '.OSCCCCCCCCO..',
    '..OccccccccO..',
    '...OPPPPPPO...',
    '...OPPOOPPO...',
    '...OPPOOPPO...',
    '...KKK..KKK...',
  ];

  // Backwards-compatible aliases
  const FRONT_BODY = SOUTH_BODY;
  const BACK_BODY = NORTH_BODY;

  const LEGS_WALK = ['..OPPO..OPPO..', '..OPPO..OPPO..', '..KKK....KKK..'];
  const LEGS_SIT = ['...OPPPPPPO...', '..OKK....KKO..', '..............'];
  const ARMS_TYPE = ['.OSCCCwwCCCSO.', '.OCCCCCCCCCCO.'];
  const ARMS_DRINK = ['.OSCCCwwCCCSO.', '.OSCCMUUMCCSO.'];
  const EYES_BLINK = ['.OSSSSSSSSSSO.', '.OSSSOSSSOSSO.'];
  const GLASSES = '.OSSGEGSGEGSO.';

  function setChar(row, i, ch) { return row.substring(0, i) + ch + row.substring(i + 1); }

  function buildRows(look, frame, isBack = false) {
    let rows = (isBack ? BACK_BODY : FRONT_BODY).slice();
    if (look.long) {
      for (let r = 6; r <= 11; r++) {
        rows[r] = setChar(setChar(setChar(setChar(rows[r], 0, 'O'), 1, 'H'), 12, 'H'), 13, 'O');
      }
    }
    if (!isBack && look.tie) {
      rows[13] = '.OCCCCYYCCCCO.';
      rows[14] = '.OSCCCYYCCCSO.';
      rows[15] = '..OcccYYcccO..';
    }
    if (frame === 'walk') rows.splice(17, 3, ...LEGS_WALK);
    if (!isBack && frame === 'sit') {
      rows[16] = '..OccccccccO..';
      rows.splice(17, 3, ...LEGS_SIT);
    }
    if (!isBack && frame === 'type') { rows[13] = ARMS_TYPE[0]; rows[14] = ARMS_TYPE[1]; }
    if (!isBack && frame === 'drink') { rows[13] = ARMS_DRINK[0]; rows[14] = ARMS_DRINK[1]; }
    if (!isBack && frame === 'blink') { rows[7] = EYES_BLINK[0]; rows[8] = EYES_BLINK[1]; }
    if (!isBack && frame === 'happy') { rows[7] = '.OSSSSSSSSSSO.'; rows[8] = '.OSSOSOSOSOSO.'; rows[10] = '..OSSSmmSSSO..'; }
    if (!isBack && look.glasses && frame !== 'blink' && frame !== 'happy') rows[7] = GLASSES;
    if (look.wings) {
      const L = ['', 'OO..', 'OAO.', 'OAAO', '.OAA', '..OA', '...O'];
      rows = rows.map((r, i) => {
        const l = L[i] || '....';
        const rr = l.split('').reverse().join('');
        return (l.padEnd(4, '.')) + r + (rr.padStart(4, '.'));
      });
    }
    return rows;
  }

  function paletteFor(look) {
    const hair = look.hairColors || HAIR[look.hair % HAIR.length];
    const skin = SKIN[look.skin % SKIN.length];
    const cloth = look.clothColors || CLOTH[look.cloth % CLOTH.length];
    return {
      O: OUTLINE, H: hair[0], h: hair[1], S: skin[0], s: skin[1], B: '#ff9fae', E: '#2a1f2d', m: '#c0606a',
      C: cloth[0], c: cloth[1], w: '#ffffff', P: look.pants || PANTS[(look.cloth || 0) % PANTS.length], K: '#3b2c3a',
      A: '#ffffff', Y: '#ffd25e', G: '#2a1f2d', M: '#ffffff', U: '#8b4513',
    };
  }

  function rasterize(rows, pal) {
    const w = rows[0].length, h = rows.length;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === '.' || !pal[ch]) continue;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function flip(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }

  const cache = new Map();
  const FRAMES = ['idle', 'walk', 'type', 'blink', 'happy', 'sit', 'drink'];

  /** Returns 4-directional sprite set: S, N, E, W (and backward-compatible aliases SE, SW, NE, NW) */
  LO.getCharacterSprites = function (look) {
    const key = JSON.stringify(look);
    if (cache.has(key)) return cache.get(key);
    const pal = paletteFor(look);

    const s = {}, n = {}, e = {}, w = {};
    for (const f of FRAMES) {
      s[f] = rasterize(buildRows(look, f, false), pal);
      n[f] = rasterize(buildRows(look, f, true), pal);
      e[f] = rasterize(buildRows(look, f, false), pal); // Side/East frame
      w[f] = flip(e[f]);
    }

    const set = {
      // 2D Cardinal Directions
      S: s,
      N: n,
      E: e,
      W: w,
      // Backward-compatible isometric direction mapping
      SE: s,
      SW: w,
      NE: e,
      NW: n,
      // General fallbacks
      right: e,
      left: w,
      down: s,
      up: n,
      w: s.idle.width,
      h: s.idle.height
    };
    cache.set(key, set);
    return set;
  };

  LO.LAMI_LOOK = {
    hair: 8, skin: 0, cloth: 0, long: false, glasses: false, tie: true, wings: true,
    hairColors: ['#c3b0f5', '#9b86dc'], clothColors: ['#3c4a8c', '#2c376c'], pants: '#2c376c',
  };

  // Tribute looks for "The Office" (Scranton Dunder Mifflin Mode)
  LO.OFFICE_TRIBUTE_LOOKS = {
    michael: { hair: 1, skin: 0, cloth: 1, long: false, glasses: false, tie: true, clothColors: ['#2c3e50', '#1a252f'] },
    dwight:  { hair: 0, skin: 1, cloth: 3, long: false, glasses: true, tie: true, clothColors: ['#d4ac0d', '#b7950b'] },
    jim:     { hair: 0, skin: 0, cloth: 1, long: false, glasses: false, tie: true, clothColors: ['#ecf0f1', '#bdc3c7'] },
    pam:     { hair: 2, skin: 0, cloth: 0, long: true,  glasses: false, tie: false, clothColors: ['#ffb6c1', '#ff69b4'] },
    angela:  { hair: 6, skin: 0, cloth: 4, long: false, glasses: false, tie: false, clothColors: ['#bdc3c7', '#95a5a6'] },
  };

  // A2A peer agents: distinct looks with a remote-agent badge colour.
  LO.PEER_LOOKS = {
    yuna:   { hair: 2, skin: 0, cloth: 0, long: true,  glasses: true,  tie: false, clothColors: ['#60a5fa', '#3b82f6'] },
    aurora: { hair: 4, skin: 1, cloth: 1, long: true,  glasses: false, tie: false, clothColors: ['#f472b6', '#db2777'] },
    kira:   { hair: 6, skin: 0, cloth: 3, long: false, glasses: false, tie: true,  clothColors: ['#34d399', '#059669'] },
    cyro:   { hair: 5, skin: 2, cloth: 2, long: false, glasses: true,  tie: true,  clothColors: ['#a78bfa', '#7c3aed'] },
  };

  LO.randomLook = function (rng = Math.random) {
    return {
      hair: Math.floor(rng() * HAIR.length), skin: Math.floor(rng() * SKIN.length),
      cloth: Math.floor(rng() * CLOTH.length), long: rng() < 0.45, glasses: rng() < 0.2,
    };
  };

  // ---- Mochi the Cat (Isometric) ----
  const CAT = [
    '........O..O',
    '.O......OOOO',
    'OF.....OFEFE',
    'OF.OOOOOFFpF',
    '.OOFFFFFFFFO',
    '...OFFFFFFO.',
    '...OFO..OFO.',
    '...OO....OO.',
  ];
  const CAT_WALK = ['...OFO.OFO..', '...OO..OO...'];
  const CAT_SIT = [
    '........O..O',
    '........OOOO',
    '.......OFEFE',
    '.O....OFFFpF',
    'OF..OOFFFFFO',
    'OF.OFFFFFFO.',
    '.OOFFFFFFFO.',
    '...OOOOOOO..',
  ];
  const CAT_PAL = { O: OUTLINE, F: '#f5b46a', E: '#2a1f2d', p: '#ff8fa3' };
  LO.getCatSprites = function () {
    if (cache.has('cat')) return cache.get('cat');
    const walkRows = CAT.slice(0, 6).concat(CAT_WALK);
    const se = { idle: rasterize(CAT, CAT_PAL), walk: rasterize(walkRows, CAT_PAL), sit: rasterize(CAT_SIT, CAT_PAL) };
    const sw = { idle: flip(se.idle), walk: flip(se.walk), sit: flip(se.sit) };
    const set = { SE: se, SW: sw, right: se, left: sw, w: 12, h: 8 };
    cache.set('cat', set);
    return set;
  };

  // ---- Coin 7x7 ----
  LO.getCoinSprite = function () {
    if (cache.has('coin')) return cache.get('coin');
    const rows = ['..OOO..', '.OYYYO.', 'OYWYYyO', 'OYWYYyO', 'OYYYYyO', '.OyyyO.', '..OOO..'];
    const c = rasterize(rows, { O: '#9a6a12', Y: '#ffd25e', y: '#e9a827', W: '#fff6c9' });
    cache.set('coin', c);
    return c;
  };

  // ---- Paper 5x6 ----
  LO.getPaperSprite = function () {
    if (cache.has('paper')) return cache.get('paper');
    const c = rasterize(['OOOO.', 'OwwwO', 'OgggO', 'OwwwO', 'OgggO', 'OOOOO'], { O: OUTLINE, w: '#ffffff', g: '#9bb7d4' });
    cache.set('paper', c);
    return c;
  };
})();
