/* Lami's AI Office — Application Bootstrap */
(function () {
  const LO = window.LO;

  window.addEventListener('DOMContentLoaded', () => {
    // 1. Check Vertical TikTok Mode (only if explicitly requested via ?vertical=1)
    if (LO.params.get('vertical') === '1') {
      document.body.classList.add('vertical');
    }

    // 2. Sound param override
    if (LO.params.get('sound') === '1') {
      LO.audio.muted = false;
      document.getElementById('btn-sound').textContent = '🔊';
    }

    // 3. Setup Canvas & Office simulation
    const canvas = document.getElementById('office');
    const office = new LO.Office(canvas);
    LO.office = office;
    LO.currentOffice = office;

    // 3b. Load the floorplan tilemap + tileset. The renderer falls back to the
    //     procedural floorplan until (or unless) the assets arrive.
    if (LO.Tilemap && typeof LO.Tilemap.load === 'function') {
      LO.Tilemap.load()
        .then(() => { LO.tilemapReady = true; })
        .catch((err) => {
          LO.tilemapReady = false;
          console.warn('[tilemap] falling back to procedural floorplan:', err && err.message);
        });
    }

    // 4. Setup Demo Controller & Network Bridge
    const demoCtrl = new LO.DemoController(office);
    const net = new LO.NetworkBridge(office, demoCtrl);

    // 5. Start Game Loop & Network
    office.start();
    net.connect();

    // 6. Dismiss Loading Screen
    if (LO.params.get('noloader') === '1') {
      const loader = document.getElementById('loading');
      if (loader) loader.remove();
    } else {
      setTimeout(() => {
        const loader = document.getElementById('loading');
        if (loader) {
          loader.classList.add('done');
          setTimeout(() => loader.remove(), 700);
        }
      }, 400);
    }

    // Initial greeting
    setTimeout(() => {
      office.lami.setBubble('Selamat datang di kantor Lami! 👑', 4.0);
    }, 1200);
  });
})();
