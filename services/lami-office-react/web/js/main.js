/* Lami's AI Office — Application Bootstrap */
(function () {
  const LO = window.LO;

  window.addEventListener('DOMContentLoaded', () => {
    // 1. Sound param override
    if (LO.params.get('sound') === '1') {
      LO.audio.muted = false;
      document.getElementById('btn-sound').textContent = '🔊';
    }

    // 2. Setup Canvas & Office simulation
    const canvas = document.getElementById('office');
    const office = new LO.Office(canvas);
    LO.office = office;
    LO.currentOffice = office;

    // 2b. Load the floorplan tilemap + tileset. The renderer falls back to the
    //     procedural floorplan until (or unless) the assets arrive.
    if (LO.Tilemap && typeof LO.Tilemap.load === 'function') {
      LO.Tilemap.load().catch((err) => {
        console.warn('[tilemap] falling back to procedural floorplan:', err && err.message);
      });
    }

    // 3. Setup Demo Controller & Network Bridge
    const demoCtrl = new LO.DemoController(office);
    const net = new LO.NetworkBridge(office, demoCtrl);

    // 4. Start Game Loop & Network
    office.start();
    net.connect();

    // 5. Dismiss Loading Screen
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

    // Initial greeting. In live mode the server owns every character's narration
    // (bubbles arrive in the world frames), so the local greeting is demo-only.
    setTimeout(() => {
      if (office.simulatedExternally) return;
      office.lami.setBubble('Selamat datang di kantor Lami! 👑', 4.0);
    }, 1200);
  });
})();
