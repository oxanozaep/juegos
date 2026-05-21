import { mountCanvas, makeOverlay, makeStat, beep } from './engine.js';

const BEST_KEY = 'games-hub.tetris.best';
const COLS = 10, ROWS = 20;

// Tetromino definitions (rotations as 4x4 bitmaps stored as arrays of [x,y] cells)
const PIECES = {
  I: { color: '#22d3ee', shapes: [
    [[0,1],[1,1],[2,1],[3,1]],
    [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[1,0],[1,1],[1,2],[1,3]]
  ]},
  O: { color: '#facc15', shapes: [
    [[1,0],[2,0],[1,1],[2,1]]
  ]},
  T: { color: '#a855f7', shapes: [
    [[1,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]],
    [[1,0],[0,1],[1,1],[1,2]]
  ]},
  S: { color: '#22c55e', shapes: [
    [[1,0],[2,0],[0,1],[1,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]],
    [[0,0],[0,1],[1,1],[1,2]]
  ]},
  Z: { color: '#ef4444', shapes: [
    [[0,0],[1,0],[1,1],[2,1]],
    [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,0],[0,1],[1,1],[0,2]]
  ]},
  J: { color: '#3b82f6', shapes: [
    [[0,0],[0,1],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[0,2],[1,2]]
  ]},
  L: { color: '#fb923c', shapes: [
    [[2,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]],
    [[0,0],[1,0],[1,1],[1,2]]
  ]}
};
const PIECE_KEYS = Object.keys(PIECES);

export const Tetris = {
  id: 'tetris',
  name: 'Tetris',
  emoji: '🟦',
  description: 'Encaja las piezas',

  mount(container) {
    const shell = document.createElement('div');
    shell.className = 'cg-shell';

    const bar = document.createElement('div');
    bar.className = 'cg-bar';
    const sScore = makeStat('Puntos', '0');
    const sLines = makeStat('Líneas', '0');
    const sBest  = makeStat('Récord', String(loadBest()));
    bar.appendChild(sScore.el); bar.appendChild(sLines.el); bar.appendChild(sBest.el);
    shell.appendChild(bar);

    const gameWrap = document.createElement('div');
    shell.appendChild(gameWrap);

    const hint = document.createElement('div');
    hint.className = 'cg-hint';
    hint.textContent = 'Swipe ←→ mover · ↓ bajar · tap rotar · ↑/swipe largo: drop';
    shell.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    let grid;        // ROWS x COLS, 0 or color
    let piece;       // { type, rot, x, y }
    let bag;
    let dropT, dropInterval;
    let score, lines, level, state;
    let best = loadBest();

    const cg = mountCanvas(gameWrap, { aspectRatio: '1 / 2', update, draw });
    cg.wrap.style.maxHeight = '52vh';
    cg.wrap.style.margin = '0 auto';
    const overlay = makeOverlay(cg.wrap);

    function refillBag() {
      bag = PIECE_KEYS.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }

    function nextPiece() {
      if (!bag || bag.length === 0) refillBag();
      const type = bag.pop();
      const p = { type, rot: 0, x: 3, y: -1 };
      if (collides(p)) state = 'over';
      return p;
    }

    function collides(p) {
      const shape = PIECES[p.type].shapes[p.rot % PIECES[p.type].shapes.length];
      for (const [dx, dy] of shape) {
        const x = p.x + dx, y = p.y + dy;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && grid[y][x]) return true;
      }
      return false;
    }

    function lock() {
      const shape = PIECES[piece.type].shapes[piece.rot % PIECES[piece.type].shapes.length];
      for (const [dx, dy] of shape) {
        const x = piece.x + dx, y = piece.y + dy;
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) grid[y][x] = PIECES[piece.type].color;
      }
      // clear lines
      let cleared = 0;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (grid[y].every(c => c)) {
          grid.splice(y, 1);
          grid.unshift(Array(COLS).fill(0));
          cleared++;
          y++;
        }
      }
      if (cleared) {
        const pts = [0, 100, 300, 500, 800][cleared] * level;
        score += pts;
        lines += cleared;
        level = 1 + Math.floor(lines / 10);
        dropInterval = Math.max(0.1, 0.8 - (level - 1) * 0.07);
        beep(660 + cleared * 120, 0.1, 'sine', 0.06);
        updateBar();
      } else {
        beep(220, 0.04, 'square', 0.03);
      }
      piece = nextPiece();
    }

    function tryMove(dx, dy) {
      const np = { ...piece, x: piece.x + dx, y: piece.y + dy };
      if (!collides(np)) { piece = np; return true; }
      return false;
    }
    function tryRotate(dir) {
      const max = PIECES[piece.type].shapes.length;
      const np = { ...piece, rot: (piece.rot + dir + max) % max };
      // simple wall kicks
      for (const k of [0, -1, 1, -2, 2]) {
        const t = { ...np, x: np.x + k };
        if (!collides(t)) { piece = t; return true; }
      }
      return false;
    }
    function hardDrop() {
      while (tryMove(0, 1)) {}
      lock();
      beep(330, 0.05, 'square', 0.04);
    }

    function newGame() {
      grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      bag = null;
      score = 0; lines = 0; level = 1;
      dropInterval = 0.8;
      dropT = 0;
      state = 'playing';
      piece = nextPiece();
      overlay.hide();
      updateBar();
    }

    function gameOver() {
      state = 'over';
      if (score > best) { best = score; saveBest(best); updateBar(); }
      overlay.show(`<div class="msg">¡Fin!</div>
        <div class="sub">Puntos: ${score} · Líneas: ${lines}</div>
        <button class="primary">Volver a jugar</button>`).querySelector('button')
        .addEventListener('click', newGame);
    }

    function updateBar() {
      sScore.set(String(score)); sLines.set(String(lines)); sBest.set(String(best));
    }

    function update(dt) {
      if (state === 'over') { gameOver(); return; }
      if (state !== 'playing') return;
      dropT += dt;
      if (dropT >= dropInterval) {
        dropT = 0;
        if (!tryMove(0, 1)) lock();
      }
    }

    function draw(ctx, w, h) {
      const cell = Math.min(w / COLS, h / ROWS);
      const offsetX = (w - COLS * cell) / 2;
      const offsetY = (h - ROWS * cell) / 2;

      ctx.fillStyle = '#0c0c10';
      ctx.fillRect(0, 0, w, h);

      // Draw background of the grid area
      ctx.fillStyle = '#050508';
      ctx.fillRect(offsetX, offsetY, COLS * cell, ROWS * cell);

      // grid bg lines
      ctx.strokeStyle = '#1d1d24';
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(offsetX + x * cell, offsetY);
        ctx.lineTo(offsetX + x * cell, offsetY + ROWS * cell);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY + y * cell);
        ctx.lineTo(offsetX + COLS * cell, offsetY + y * cell);
        ctx.stroke();
      }

      // grid blocks
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (grid[y][x]) drawCell(ctx, x, y, cell, grid[y][x], offsetX, offsetY);
        }
      }
      // current piece
      if (piece) {
        const shape = PIECES[piece.type].shapes[piece.rot % PIECES[piece.type].shapes.length];
        for (const [dx, dy] of shape) {
          drawCell(ctx, piece.x + dx, piece.y + dy, cell, PIECES[piece.type].color, offsetX, offsetY);
        }
      }
    }

    function drawCell(ctx, x, y, cell, color, offsetX, offsetY) {
      const px = offsetX + x * cell;
      const py = offsetY + y * cell;
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(px + 1, py + 1, cell - 2, Math.max(2, cell * 0.18));
    }

    // input: touch swipes + taps
    let touchStart = null;
    let movedSinceStart = false;
    let lastStepT = 0;
    cg.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
      movedSinceStart = false;
    }, { passive: false });

    cg.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!touchStart) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const cellPx = cg.canvas.getBoundingClientRect().width / COLS;
      const step = cellPx;
      const now = performance.now();
      if (Math.abs(dx) > step && Math.abs(dx) > Math.abs(dy)) {
        const dir = dx > 0 ? 1 : -1;
        const steps = Math.floor(Math.abs(dx) / step);
        for (let i = 0; i < steps; i++) tryMove(dir, 0);
        touchStart.x += dir * step * steps;
        movedSinceStart = true;
      } else if (dy > step && now - lastStepT > 50) {
        tryMove(0, 1);
        touchStart.y += step;
        lastStepT = now;
        movedSinceStart = true;
      }
    }, { passive: false });

    cg.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const elapsed = performance.now() - touchStart.t;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (!movedSinceStart && adx < 12 && ady < 12 && elapsed < 250) {
        tryRotate(1);
      } else if (ady > 80 && dy > 0 && ady > adx) {
        hardDrop();
      }
      touchStart = null;
    }, { passive: false });

    function onKey(e) {
      if (state === 'over') return;
      if (e.key === 'ArrowLeft') { tryMove(-1, 0); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { tryMove(1, 0); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { tryMove(0, 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'x') { tryRotate(1); e.preventDefault(); }
      else if (e.key === 'z') { tryRotate(-1); e.preventDefault(); }
      else if (e.key === ' ') { hardDrop(); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKey);
    newBtn.addEventListener('click', newGame);

    newGame();

    return () => {
      cg.destroy();
      window.removeEventListener('keydown', onKey);
    };
  }
};

function loadBest() { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} }
