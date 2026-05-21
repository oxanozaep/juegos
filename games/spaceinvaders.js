import { mountCanvas, makeOverlay, makeStat, clamp, aabbHit, rand, beep } from './engine.js';

const BEST_KEY = 'games-hub.invaders.best';
const W = 100, H = 130;
const ROWS = 5, COLS = 11;
const ALIEN_W = 5, ALIEN_H = 3.5;
const ALIEN_GX = 2, ALIEN_GY = 2;
const PLAYER_W = 7, PLAYER_H = 2.5;
const PLAYER_Y = H - 6;
const BULLET_SPEED = 90;
const ALIEN_BULLET_SPEED = 35;
const SHIELDS = 4;
const SHIELD_W = 9, SHIELD_H = 4, SHIELD_PX = 9, SHIELD_PY = 4;
const SHIELD_Y = PLAYER_Y - 14;

const ALIEN_COLORS = ['#f87171', '#fb923c', '#facc15', '#34d399', '#60a5fa'];

const ALIEN_PATTERNS = [
  // 1. Classic grid
  [
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX'
  ],
  // 2. V-formation
  [
    'X.........X',
    '.X.......X.',
    '..X.....X..',
    '...X...X...',
    '....XXX....'
  ],
  // 3. X-shape
  [
    'X.........X',
    '.X.......X.',
    '..X.X.X.X..',
    '...X.X.X...',
    '....X.X....'
  ],
  // 4. Space Cross
  [
    '.....X.....',
    '....XXX....',
    'XXXXXXXXXXX',
    '....XXX....',
    '.....X.....'
  ],
  // 5. Checkerboard
  [
    'X.X.X.X.X.X',
    '.X.X.X.X.X.',
    'X.X.X.X.X.X',
    '.X.X.X.X.X.',
    'X.X.X.X.X.X'
  ],
  // 6. W-Shape
  [
    'X.........X',
    '.X.......X.',
    '..X..X..X..',
    '...X.X.X...',
    '....X.X....'
  ],
  // 7. Fortress / Castle layout
  [
    'X.XX.X.XX.X',
    'XXXXXXXXXXX',
    'X.X.X.X.X.X',
    'XX.XXX.XX.X',
    'X.........X'
  ]
];

const ALIEN_SPRITES = [
  // type 0: squid (top row)
  ['..XXX..',
   '.XXXXX.',
   'XX.X.XX',
   'XXXXXXX',
   '.X.X.X.',
   'X.....X'],
  // type 1: crab (middle rows)
  ['X.....X',
   '.X.X.X.',
   'XXXXXXX',
   'XX.X.XX',
   '.XXXXX.',
   'X..X..X'],
  // type 2: octopus (bottom rows)
  ['.XXXXX.',
   'XXXXXXX',
   'X.X.X.X',
   'XXXXXXX',
   '.X.X.X.',
   'X.X.X.X']
];

function drawAlien(ctx, x, y, w, h, color, type) {
  const pat = ALIEN_SPRITES[type % ALIEN_SPRITES.length];
  const cols = pat[0].length;
  const rows = pat.length;
  const pw = w / cols;
  const ph = h / rows;
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (pat[r][c] === 'X') {
        ctx.fillRect(x + c * pw, y + r * ph, pw + 0.5, ph + 0.5);
      }
    }
  }
}

export const SpaceInvaders = {
  id: 'invaders',
  name: 'Invaders',
  emoji: '👾',
  description: 'Aliens en marcha',

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
    hint.textContent = 'Arrastra para mover. Toca para disparar.';
    shell.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    let player, aliens, alienDir, alienStepT, stepInterval, bullets, alienBullets, shields, lives, score, level, state, fireCooldown;
    let firing = false;
    let best = loadBest();

    const cg = mountCanvas(gameWrap, { aspectRatio: '3 / 4', update, draw });
    const overlay = makeOverlay(cg.wrap);

    function buildShields() {
      const out = [];
      const totalW = SHIELDS * SHIELD_W + (SHIELDS - 1) * 6;
      const startX = (W - totalW) / 2;
      const px = SHIELD_W / SHIELD_PX;
      const py = SHIELD_H / SHIELD_PY;
      for (let s = 0; s < SHIELDS; s++) {
        const sx = startX + s * (SHIELD_W + 6);
        for (let i = 0; i < SHIELD_PX; i++) {
          for (let j = 0; j < SHIELD_PY; j++) {
            // Carve a dome shape: skip top corners
            if (j === 0 && (i === 0 || i === SHIELD_PX - 1)) continue;
            if (j === SHIELD_PY - 1 && i >= SHIELD_PX / 2 - 1 && i <= SHIELD_PX / 2) continue;
            out.push({ x: sx + i * px, y: SHIELD_Y + j * py, w: px, h: py, alive: true });
          }
        }
      }
      return out;
    }

    function newLevel(l) {
      level = l;
      aliens = [];
      const totalW = COLS * ALIEN_W + (COLS - 1) * (ALIEN_GX - ALIEN_W);
      const startX = (W - COLS * ALIEN_W - (COLS - 1) * 1.5) / 2;
      const startY = 10 + Math.min(l - 1, 4) * 3;

      // Pick a random alien formation pattern
      const pattern = ALIEN_PATTERNS[Math.floor(Math.random() * ALIEN_PATTERNS.length)];

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (pattern[r][c] === 'X') {
            aliens.push({
              x: startX + c * (ALIEN_W + 1.5),
              y: startY + r * (ALIEN_H + 1.5),
              w: ALIEN_W, h: ALIEN_H,
              row: r,
              alive: true
            });
          }
        }
      }
      alienDir = 1;
      alienStepT = 0;
      stepInterval = 0.8;
      bullets = [];
      alienBullets = [];
      shields = buildShields();
    }

    function newGame() {
      score = 0; lives = 3;
      newLevel(1);
      player = { x: W / 2 - PLAYER_W / 2 };
      fireCooldown = 0;
      state = 'playing';
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
      fireCooldown = 0.45;
      bullets.push({ x: player.x + PLAYER_W / 2 - 0.4, y: PLAYER_Y - 2, w: 0.8, h: 2 });
      beep(700, 0.05, 'square', 0.04);
    }

    function update(dt) {
      if (state !== 'playing') return;
      fireCooldown = Math.max(0, fireCooldown - dt);
      if (firing) fire();

      // alien step
      const alive = aliens.filter(a => a.alive);
      const total = ROWS * COLS;
      stepInterval = clamp(0.9 - (1 - alive.length / total) * 0.85, 0.08, 0.9);
      alienStepT += dt;
      if (alienStepT >= stepInterval && alive.length > 0) {
        alienStepT = 0;
        let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const a of alive) {
          minX = Math.min(minX, a.x);
          maxX = Math.max(maxX, a.x + a.w);
          maxY = Math.max(maxY, a.y + a.h);
        }
        let shouldDrop = (alienDir > 0 && maxX + 1.5 >= W) || (alienDir < 0 && minX - 1.5 <= 0);
        if (shouldDrop) {
          alienDir *= -1;
          for (const a of aliens) a.y += 2;
        } else {
          for (const a of aliens) a.x += 1.5 * alienDir;
        }
        // alien fire
        if (Math.random() < 0.55) {
          const byCol = {};
          for (const a of alive) {
            if (!byCol[a.x] || a.y > byCol[a.x].y) byCol[a.x] = a;
          }
          const shooters = Object.values(byCol);
          if (shooters.length) {
            const s = shooters[Math.floor(Math.random() * shooters.length)];
            alienBullets.push({ x: s.x + s.w / 2 - 0.4, y: s.y + s.h, w: 0.8, h: 2 });
          }
        }
        // alien reached player line
        if (maxY >= PLAYER_Y) { lives = 0; gameOver(); return; }
      }

      // player bullets up
      for (const b of bullets) b.y -= BULLET_SPEED * dt;
      // alien bullets down
      for (const b of alienBullets) b.y += ALIEN_BULLET_SPEED * dt;

      // bullets vs aliens
      for (const b of bullets) {
        for (const a of aliens) {
          if (!a.alive) continue;
          if (aabbHit(b, a)) {
            a.alive = false;
            b.dead = true;
            score += (ROWS - a.row) * 10 + 10;
            beep(440, 0.05, 'square', 0.05);
            break;
          }
        }
      }
      // bullets vs shields (both directions)
      for (const list of [bullets, alienBullets]) {
        for (const b of list) {
          for (const s of shields) {
            if (!s.alive) continue;
            if (aabbHit(b, s)) {
              s.alive = false;
              b.dead = true;
              break;
            }
          }
        }
      }
      // alien bullets vs player
      for (const b of alienBullets) {
        if (b.dead) continue;
        if (aabbHit(b, { x: player.x, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H })) {
          b.dead = true;
          lives--; updateBar();
          beep(160, 0.18, 'sawtooth', 0.07);
          if (lives <= 0) { gameOver(); return; }
        }
      }
      bullets = bullets.filter(b => !b.dead && b.y > -3);
      alienBullets = alienBullets.filter(b => !b.dead && b.y < H + 3);

      if (aliens.every(a => !a.alive)) {
        beep(700, 0.2, 'sine', 0.08);
        newLevel(level + 1);
      }
      updateBar();
    }

    function draw(ctx, w, h) {
      const s = w / W;
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, w, h);

      // aliens
      for (const a of aliens) {
        if (!a.alive) continue;
        const type = a.row === 0 ? 0 : (a.row <= 2 ? 1 : 2);
        drawAlien(ctx, a.x * s, a.y * s, a.w * s, a.h * s, ALIEN_COLORS[a.row], type);
      }
      // shields
      ctx.fillStyle = '#22c55e';
      for (const sh of shields) {
        if (sh.alive) ctx.fillRect(sh.x * s, sh.y * s, sh.w * s, sh.h * s);
      }
      // player
      ctx.fillStyle = '#a7f3d0';
      ctx.fillRect(player.x * s, PLAYER_Y * s, PLAYER_W * s, PLAYER_H * s);
      ctx.fillRect((player.x + PLAYER_W / 2 - 0.5) * s, (PLAYER_Y - 1) * s, 1 * s, 1 * s);

      // bullets
      ctx.fillStyle = '#fde047';
      for (const b of bullets) ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
      ctx.fillStyle = '#f87171';
      for (const b of alienBullets) ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
    }

    function pointerMove(e) {
      const t = e.touches ? e.touches[0] : e;
      const rect = cg.canvas.getBoundingClientRect();
      const px = (t.clientX - rect.left) / rect.width * W;
      player.x = clamp(px - PLAYER_W / 2, 0, W - PLAYER_W);
    }
    cg.canvas.addEventListener('touchstart', e => { e.preventDefault(); pointerMove(e); firing = true; }, { passive: false });
    cg.canvas.addEventListener('touchmove',  e => { e.preventDefault(); pointerMove(e); }, { passive: false });
    cg.canvas.addEventListener('touchend',   e => { e.preventDefault(); firing = false; }, { passive: false });
    cg.canvas.addEventListener('touchcancel', () => { firing = false; });
    cg.canvas.addEventListener('mousedown', e => { pointerMove(e); firing = true; });
    cg.canvas.addEventListener('mousemove', e => { if (e.buttons) pointerMove(e); });
    cg.canvas.addEventListener('mouseup', () => { firing = false; });
    cg.canvas.addEventListener('mouseleave', () => { firing = false; });

    function onKeyDown(e) {
      if (e.key === 'ArrowLeft' || e.key === 'a') { player.x = clamp(player.x - 5, 0, W - PLAYER_W); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { player.x = clamp(player.x + 5, 0, W - PLAYER_W); e.preventDefault(); }
      else if (e.key === ' ' || e.key === 'Enter') { firing = true; e.preventDefault(); }
    }
    function onKeyUp(e) {
      if (e.key === ' ' || e.key === 'Enter') firing = false;
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
