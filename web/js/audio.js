/* Lami's AI Office — 8-bit sound synth via Web Audio API */
(function () {
  const LO = window.LO;

  class SoundManager {
    constructor() {
      this.ctx = null;
      this.muted = localStorage.getItem('lo_muted') === 'true';
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('lo_muted', this.muted);
      return this.muted;
    }

    playTone(freq, type = 'square', duration = 0.1, gainVal = 0.1, slideFreq = null) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (slideFreq) {
          osc.frequency.exponentialRampToValueAtTime(slideFreq, now + duration);
        }

        gain.gain.setValueAtTime(gainVal, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {
        // AudioContext might be blocked until user gesture
      }
    }

    coin() {
      if (this.muted) return;
      this.playTone(987.77, 'sine', 0.08, 0.12); // B5
      setTimeout(() => {
        this.playTone(1318.51, 'sine', 0.22, 0.15); // E6
      }, 70);
    }

    liftDing() {
      if (this.muted) return;
      this.playTone(880, 'triangle', 0.45, 0.15); // A5 chime
    }

    keyboard() {
      if (this.muted) return;
      const f = 300 + Math.random() * 250;
      this.playTone(f, 'square', 0.025, 0.04);
    }

    spawn() {
      if (this.muted) return;
      this.playTone(523.25, 'triangle', 0.08, 0.1);
      setTimeout(() => this.playTone(659.25, 'triangle', 0.08, 0.1), 70);
      setTimeout(() => this.playTone(783.99, 'triangle', 0.14, 0.12), 140);
    }

    error() {
      if (this.muted) return;
      this.playTone(320, 'sawtooth', 0.2, 0.15, 130);
    }

    pop() {
      if (this.muted) return;
      this.playTone(450, 'sine', 0.05, 0.08, 750);
    }
  }

  LO.audio = new SoundManager();
})();
