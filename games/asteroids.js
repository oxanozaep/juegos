import { mountCanvas, makeOverlay, makeStat, TAU, rand, randInt, circleCircleHit, beep } from './engine.js';

const BEST_KEY = 'games-hub.asteroids.best';
const W = 100, H = 100;
const SHIP_R = 2.4;
const SHIP_THRUST = 50;
const SHIP_TURN = 4.5; // rad/s
const FRICTION = 0.4;
const BULLET_SPEED = 75;
const BULLET_LIFE = 1.0;

function wrap(p) {
  if (p.x < 0) p.x += W;
  if (p.x > W) p.x -= W;
  if (p.y < 0) p.y += H;
  if (p.y > H) p.y -= H;
}

function newAsteroid(size, x = null, y = null) {
  const r = size === 3 ? 6 : size === 2 ? 4 : 2.4;
  const speed = (4 - size) * 6 + rand(-3, 3);
  const ang = rand(0, TAU);
  return {
    x: x ?? rand(0, W),
    y: y ?? rand(0, H),
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    r, size,
    shape: buildAsteroidShape()
  };
}

function buildAsteroidShape() {
  const n = 10;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const dr = 1 + rand(-0.25, 0.25);
    pts.push({ a, r: dr });
  }
  return pts;
}

export const Asteroids = {
  id: 'asteroids',
  name: 'Asteroids',
  emoji: '🚀',
  description: 'Esquiva y dispara',

  mount(container) {
    const shell = document.createElement('div');
    shell.className = 'cg-shell';

    const bar = document.createElement('div');
    bar.className = 'cg-bar';
    const sScore = makeStat('Puntos', '0');
    const sLives = makeStat('Vidas', '3');
    const sBest  = makeStat('Récord', String(loadBest()));
    bar.appendChild(sScore.el); bar.appendChild(sLives.el); bar.appendChild(sBest.el);
    shell.appendChild(bar);

    const gameWrap = document.createElement('div');
    shell.appendChild(gameWrap);

    const hint = document.createElement('div');
    hint.className = 'cg-hint';
    hint.textContent = 'Toca lados: girar. Centro: empujar. Doble tap: disparar.';
    shell.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    let ship, asteroids, bullets, lives, score, state, level, respawnT, invincT;
    let best = loadBest();
    let input = { left: false, right: false, thrust: false, fire: false };
    let fireCooldown = 0;

    const cg = mountCanvas(gameWrap, { aspectRatio: '1 / 1', update, draw });
    const overlay = makeOverlay(cg.wrap);

    function newLevel(l) {
      level = l;
      asteroids = [];
      const n = 3 + l;
      for (let i = 0; i < n; i++) {
        let pos;
        do { pos = { x: rand(0, W), y: rand(0, H) }; }
        while (Math.hypot(pos.x - W/2, pos.y - H/2) < 25);
        asteroids.push(newAsteroid(3, pos.x, pos.y));
      }
      bullets = [];
      respawnShip();
    }

    function respawnShip() {
      ship = { x: W/2, y: H/2, vx: 0, vy: 0, a: -Math.PI / 2 };
      invincT = 2;
    }

    function newGame() {
      score = 0; lives = 3;
      state = 'playing';
      newLevel(1);
      overlay.hide();
      updateBar();
    }

    function updateBar() {
      sScore.set(String(score));
      sLives.set(String(lives));
      sBest.set(String(best));
    }

    function gameOver() {
      state = 'over';
      if (score > best) { best = score; saveBest(best); updateBar(); }
      overlay.show(`<div class="msg">¡Fin!</div><div class="sub">Puntuación: ${score}</div>
        <button class="primary">Volver a jugar</button>`).querySelector('button')
        .addEventListener('click', newGame);
    }

    function fire() {
      if (fireCooldown > 0 || state !== 'playing') return;
      fireCooldown = 0.22;
      bullets.push({
        x: ship.x + Math.cos(ship.a) * SHIP_R,
        y: ship.y + Math.sin(ship.a) * SHIP_R,
        vx: ship.vx + Math.cos(ship.a) * BULLET_SPEED,
        vy: ship.vy + Math.sin(ship.a) * BULLET_SPEED,
        life: BULLET_LIFE
      });
      beep(880, 0.05, 'square', 0.04);
    }

    function update(dt) {
      if (state !== 'playing') return;
      fireCooldown = Math.max(0, fireCooldown - dt);
      invincT = Math.max(0, invincT - dt);
      if (respawnT > 0) {
        respawnT -= dt;
        if (respawnT <= 0) respawnShip();
        return;
      }

      if (input.left)  ship.a -= SHIP_TURN * dt;
      if (input.right) ship.a += SHIP_TURN * dt;
      if (input.thrust) {
        ship.vx += Math.cos(ship.a) * SHIP_THRUST * dt;
        ship.vy += Math.sin(ship.a) * SHIP_THRUST * dt;
      }
      ship.vx *= Math.max(0, 1 - FRICTION * dt);
      ship.vy *= Math.max(0, 1 - FRICTION * dt);
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      wrap(ship);
      if (input.fire) fire();

      for (const b of bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        wrap(b);
      }
      bullets = bullets.filter(b => b.life > 0);

      for (const a of asteroids) {
        a.x += a.vx * dt; a.y += a.vy * dt;
        wrap(a);
      }

      // bullet-asteroid collisions
      const newRocks = [];
      const killedBullets = new Set();
      const killedAsteroids = new Set();
      for (let i = 0; i < bullets.length; i++) {
        if (killedBullets.has(i)) continue;
        const b = bullets[i];
        for (let j = 0; j < asteroids.length; j++) {
          if (killedAsteroids.has(j)) continue;
          const a = asteroids[j];
          if (circleCircleHit(b.x, b.y, 0.5, a.x, a.y, a.r)) {
            killedBullets.add(i);
            killedAsteroids.add(j);
            score += (4 - a.size) * 20;
            beep(220, 0.1, 'sawtooth', 0.05);
            if (a.size > 1) {
              newRocks.push(newAsteroid(a.size - 1, a.x, a.y));
              newRocks.push(newAsteroid(a.size - 1, a.x, a.y));
            }
            break;
          }
        }
      }
      bullets = bullets.filter((_, i) => !killedBullets.has(i));
      asteroids = asteroids.filter((_, i) => !killedAsteroids.has(i));
      asteroids.push(...newRocks);

      // ship-asteroid
      if (invincT <= 0) {
        for (const a of asteroids) {
          if (circleCircleHit(ship.x, ship.y, SHIP_R * 0.6, a.x, a.y, a.r)) {
            lives--; updateBar();
            beep(110, 0.3, 'sawtooth', 0.07);
            if (lives <= 0) { gameOver(); return; }
            respawnT = 1;
            break;
          }
        }
      }
      updateBar();

      if (asteroids.length === 0) newLevel(level + 1);
    }

    function draw(ctx, w, h) {
      const s = w / W;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // asteroids
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.2;
      for (const a of asteroids) {
        ctx.beginPath();
        for (let i = 0; i <= a.shape.length; i++) {
          const p = a.shape[i % a.shape.length];
          const x = (a.x + Math.cos(p.a) * a.r * p.r) * s;
          const y = (a.y + Math.sin(p.a) * a.r * p.r) * s;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // bullets
      ctx.fillStyle = '#fde047';
      for (const b of bullets) {
        ctx.beginPath();
        ctx.arc(b.x * s, b.y * s, 0.6 * s, 0, TAU);
        ctx.fill();
      }

      // ship
      if (respawnT <= 0 && (invincT === 0 || Math.floor(invincT * 10) % 2 === 0)) {
        ctx.save();
        ctx.translate(ship.x * s, ship.y * s);
        ctx.rotate(ship.a + Math.PI / 2);
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -SHIP_R * s);
        ctx.lineTo(SHIP_R * 0.7 * s, SHIP_R * s);
        ctx.lineTo(0, SHIP_R * 0.5 * s);
        ctx.lineTo(-SHIP_R * 0.7 * s, SHIP_R * s);
        ctx.closePath();
        ctx.stroke();
        if (input.thrust) {
          ctx.strokeStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(-SHIP_R * 0.4 * s, SHIP_R * 0.7 * s);
          ctx.lineTo(0, (SHIP_R + 1.4) * s);
          ctx.lineTo(SHIP_R * 0.4 * s, SHIP_R * 0.7 * s);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // touch input: zones
    const activeTouches = new Map(); // touchId → zone
    function zoneOf(x, w) {
      if (x < w * 0.33) return 'left';
      if (x > w * 0.66) return 'right';
      return 'thrust';
    }
    function refreshInput() {
      input.left = false; input.right = false; input.thrust = false;
      for (const z of activeTouches.values()) {
        if (z === 'left') input.left = true;
        else if (z === 'right') input.right = true;
        else if (z === 'thrust') input.thrust = true;
      }
    }
    let lastTap = 0;
    cg.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const rect = cg.canvas.getBoundingClientRect();
      for (const t of e.changedTouches) {
        const x = t.clientX - rect.left;
        const z = zoneOf(x, rect.width);
        activeTouches.set(t.identifier, z);
      }
      refreshInput();
      const now = performance.now();
      if (now - lastTap < 280) fire();
      lastTap = now;
    }, { passive: false });
    cg.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      for (const t of e.changedTouches) activeTouches.delete(t.identifier);
      refreshInput();
    }, { passive: false });
    cg.canvas.addEventListener('touchcancel', e => {
      for (const t of e.changedTouches) activeTouches.delete(t.identifier);
      refreshInput();
    });

    function onKeyDown(e) {
      if (e.key === 'ArrowLeft' || e.key === 'a') { input.left = true; e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { input.right = true; e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'w') { input.thrust = true; e.preventDefault(); }
      else if (e.key === ' ') { fire(); e.preventDefault(); }
    }
    function onKeyUp(e) {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
      else if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
      else if (e.key === 'ArrowUp' || e.key === 'w') input.thrust = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    newBtn.addEventListener('click', newGame);

    newGame();

    return () => {
      cg.destroy();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }
};

function loadBest() { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} }
