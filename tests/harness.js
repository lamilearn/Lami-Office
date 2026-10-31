/**
 * Lami AI Office — Browser Environment & DOM Mock Harness
 * Enables headless E2E testing of canvas rendering, event handling,
 * and game engine execution without requiring a heavy browser dependency.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MockDOMTokenList {
  constructor() {
    this.tokens = new Set();
  }
  add(...tokens) {
    tokens.forEach(t => this.tokens.add(t));
  }
  remove(...tokens) {
    tokens.forEach(t => this.tokens.delete(t));
  }
  contains(token) {
    return this.tokens.has(token);
  }
  toggle(token, force) {
    if (force !== undefined) {
      if (force) this.tokens.add(token);
      else this.tokens.delete(token);
      return force;
    }
    if (this.tokens.has(token)) {
      this.tokens.delete(token);
      return false;
    }
    this.tokens.add(token);
    return true;
  }
  toString() {
    return Array.from(this.tokens).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockDOMTokenList();
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.clientWidth = 1024;
    this.clientHeight = 576;
    this.textContent = '';
    this.innerHTML = '';
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const arr = this.listeners.get(type) || [];
    const idx = arr.indexOf(listener);
    if (idx !== -1) arr.splice(idx, 1);
  }

  dispatchEvent(event) {
    const arr = this.listeners.get(event.type) || [];
    for (const fn of arr) {
      fn(event);
    }
    return true;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      width: this.clientWidth,
      height: this.clientHeight,
      x: 0,
      y: 0
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    // detach
  }
}

class MockCanvasContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.imageSmoothingEnabled = false;
    this.font = '10px monospace';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.drawCalls = [];
    this.transformStack = [];
    this.currentTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ type: 'fillRect', x, y, w, h, fillStyle: this.fillStyle });
  }

  strokeRect(x, y, w, h) {
    this.drawCalls.push({ type: 'strokeRect', x, y, w, h, strokeStyle: this.strokeStyle });
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ type: 'clearRect', x, y, w, h });
  }

  fillText(text, x, y) {
    this.drawCalls.push({ type: 'fillText', text, x, y, fillStyle: this.fillStyle });
  }

  strokeText(text, x, y) {
    this.drawCalls.push({ type: 'strokeText', text, x, y, strokeStyle: this.strokeStyle });
  }

  measureText(text) {
    return { width: (text ? text.length : 0) * 6, height: 10 };
  }

  drawImage(img, ...args) {
    this.drawCalls.push({ type: 'drawImage', image: img, args });
  }

  save() {
    this.transformStack.push({ ...this.currentTransform });
  }

  restore() {
    if (this.transformStack.length > 0) {
      this.currentTransform = this.transformStack.pop();
    }
  }

  translate(x, y) {
    this.currentTransform.x += x;
    this.currentTransform.y += y;
  }

  scale(sx, sy) {
    this.currentTransform.scaleX *= sx;
    this.currentTransform.scaleY *= sy;
  }

  beginPath() {
    this.drawCalls.push({ type: 'beginPath' });
  }

  closePath() {
    this.drawCalls.push({ type: 'closePath' });
  }

  arc(x, y, r, sa, ea) {
    this.drawCalls.push({ type: 'arc', x, y, r, sa, ea });
  }

  fill() {
    this.drawCalls.push({ type: 'fill' });
  }

  stroke() {
    this.drawCalls.push({ type: 'stroke' });
  }

  moveTo(x, y) {
    this.drawCalls.push({ type: 'moveTo', x, y });
  }

  lineTo(x, y) {
    this.drawCalls.push({ type: 'lineTo', x, y });
  }

  // Methods the renderer relies on that the mock previously lacked, so a full
  // Office.render() pass can be exercised in tests.
  setTransform(a, b, c, d, e, f) {
    if (typeof a === 'object' && a !== null) {
      this.currentTransform = { x: a.e || 0, y: a.f || 0, scaleX: a.a || 1, scaleY: a.d || 1 };
      return;
    }
    this.currentTransform = { x: e || 0, y: f || 0, scaleX: a || 1, scaleY: d || 1 };
  }

  resetTransform() {
    this.currentTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  }

  rect(x, y, w, h) {
    this.drawCalls.push({ type: 'rect', x, y, w, h });
  }

  clip() {
    this.drawCalls.push({ type: 'clip' });
  }

  ellipse(x, y, rx, ry, rotation, startAngle, endAngle, counterclockwise) {
    if (arguments.length < 7) {
      throw new TypeError(`Failed to execute 'ellipse' on 'CanvasRenderingContext2D': 7 arguments required, but only ${arguments.length} present.`);
    }
    this.drawCalls.push({ type: 'ellipse', x, y, rx, ry, rotation, startAngle, endAngle, counterclockwise });
  }

  quadraticCurveTo(cx, cy, x, y) {
    this.drawCalls.push({ type: 'quadraticCurveTo', cx, cy, x, y });
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    this.drawCalls.push({ type: 'bezierCurveTo', c1x, c1y, c2x, c2y, x, y });
  }

  createLinearGradient() {
    return { addColorStop() {} };
  }

  createRadialGradient() {
    return { addColorStop() {} };
  }
}

class MockCanvasElement extends MockElement {
  constructor(width = 1024, height = 576) {
    super('canvas', 'office');
    this.width = width;
    this.height = height;
    this.clientWidth = width;
    this.clientHeight = height;
    this.ctx = new MockCanvasContext2D(this);
  }

  getContext(type) {
    if (type === '2d') return this.ctx;
    return null;
  }
}

class MockOffscreenCanvas {
  constructor(width = 1024, height = 576) {
    this.width = width;
    this.height = height;
    this.ctx = new MockCanvasContext2D(this);
  }

  getContext(type) {
    if (type === '2d') return this.ctx;
    return null;
  }
}

function createBrowserEnvironment() {
  const elements = new Map();

  const canvas = new MockCanvasElement(1024, 576);
  elements.set('office', canvas);

  // Add standard HUD and modal elements
  const ids = [
    'stage', 'hud', 'hud-clock', 'hud-done', 'hud-coins', 'hud-staff',
    'hud-ctx-chip', 'hud-ctx-val', 'btn-wb', 'btn-time', 'btn-chat', 'btn-sound',
    'ticker', 'ticker-list', 'card', 'card-avatar', 'card-name', 'card-role',
    'card-task', 'card-tool', 'card-room', 'card-time', 'card-close',
    'chat-drawer', 'chat-messages', 'chat-form', 'chat-input', 'chat-send', 'chat-close', 'chat-clear-btn',
    'event-banner', 'event-icon', 'event-title', 'event-desc',
    'whiteboard-modal', 'wb-close', 'ctx-modal', 'ctx-close', 'loading'
  ];

  for (const id of ids) {
    if (!elements.has(id)) {
      if (id === 'card-avatar') {
        elements.set(id, new MockCanvasElement(20, 20));
      } else {
        elements.set(id, new MockElement('div', id));
      }
    }
  }

  const document = {
    createElement(tag) {
      if (tag === 'canvas') return new MockCanvasElement(32, 32);
      return new MockElement(tag);
    },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, new MockElement('div', id));
      }
      return elements.get(id);
    },
    querySelector(sel) {
      if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
      return new MockElement('div');
    },
    querySelectorAll() {
      return [];
    },
    body: new MockElement('body'),
    elements
  };

  const window = {
    document,
    devicePixelRatio: 1,
    innerWidth: 1920,
    innerHeight: 1080,
    performance: { now: () => Date.now() },
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Map,
    Set,
    Array,
    Object,
    Math,
    JSON,
    URLSearchParams: class MockURLSearchParams {
      get() { return null; }
    },
    OffscreenCanvas: MockOffscreenCanvas,
    AudioContext: class MockAudioContext {
      constructor() {
        this.destination = {};
      }
      createOscillator() {
        return {
          connect: () => {},
          start: () => {},
          stop: () => {},
          frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }
        };
      }
      createGain() {
        return {
          connect: () => {},
          gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }
        };
      }
    }
  };

  window.window = window;
  window.LO = {};

  return { window, document, canvas };
}

function loadScriptIntoEnv(env, scriptRelativePath) {
  const root = path.resolve(__dirname, '..', 'services', 'lami-office-react', 'web', 'js');
  const fullPath = path.resolve(root, scriptRelativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Script file not found: ${fullPath}`);
  }
  const code = fs.readFileSync(fullPath, 'utf8');

  // Execute inside the sandbox
  const context = vm.createContext(env.window);
  vm.runInContext(code, context, { filename: scriptRelativePath });
  return env.window.LO;
}

module.exports = {
  createBrowserEnvironment,
  loadScriptIntoEnv,
  MockCanvasElement,
  MockOffscreenCanvas,
  MockElement
};
