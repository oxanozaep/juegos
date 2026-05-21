// Shared mini-engine for canvas-based games.

export class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vec2(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  scale(s) { this.x *= s; this.y *= s; return this; }
  rotate(a) {
    const cs = Math.cos(a), sn = Math.sin(a);
    const x = this.x * cs - this.y * sn;
    const y = this.x * sn + this.y * cs;
    this.x = x; this.y = y;
    return this;
  }
  len() { return Math.hypot(this.x, this.y); }
  normalize() {
    const l = this.len();
    if (l > 0) { this.x /= l; this.y /= l; }
    return this;
  }
}

export const TAU = Math.PI * 2;
export const clamp = (v, mn, mx) => v < mn ? mn : v > mx ? mx : v;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function aabbHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
export function circleCircleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by, r = ar + br;
  return dx * dx + dy * dy < r * r;
}

let _audio = null;
function ensureAudio() {
  if (!_audio) {
    try { _audio = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { _audio = null; }
  }
  if (_audio && _audio.state === 'suspended') { try { _audio.resume(); } catch {} }
  return _audio;
}
export function beep(freq = 440, dur = 0.08, type = 'square', vol = 0.05) {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = vol;
    osc.connect(g); g.connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.stop(ctx.currentTime + dur);
  } catch {}
}

// Statbar helper
export function makeStat(label, val) {
  const el = document.createElement('div');
  el.className = 'cg-stat';
  el.innerHTML = `<div class="label">${label}</div><div class="value">${val}</div>`;
  return { el, set(v) { el.querySelector('.value').textContent = v; } };
}

// Mount a canvas with auto-resize, dpr scaling, and rAF loop.
// opts: { aspectRatio?: string, update?(dt,w,h), draw?(ctx,w,h), onResize?(w,h) }
export function mountCanvas(container, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'canvas-game';
  if (opts.aspectRatio) wrap.style.aspectRatio = opts.aspectRatio;
  container.appendChild(wrap);
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let cssW = 1, cssH = 1;
  let raf = null;
  let running = false;
  let paused = false;
  let last = 0;

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (opts.onResize) opts.onResize(cssW, cssH);
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && opts.update) opts.update(dt, cssW, cssH);
    if (opts.draw) opts.draw(ctx, cssW, cssH);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function onVis() {
    paused = document.hidden;
    if (!document.hidden) last = performance.now();
  }
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', resize);
  resize();
  start();

  return {
    canvas, ctx, wrap,
    width: () => cssW,
    height: () => cssH,
    setPaused(v) { paused = !!v; if (!v) last = performance.now(); },
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', resize);
    }
  };
}

// Build a HTML overlay attached to a canvas-game wrap.
export function makeOverlay(wrap) {
  const el = document.createElement('div');
  el.className = 'cg-overlay hidden';
  wrap.appendChild(el);
  return {
    show(html) {
      el.innerHTML = html;
      el.classList.remove('hidden');
      return el;
    },
    hide() { el.classList.add('hidden'); }
  };
}
