const SIZE = 4;
const BEST_KEY = 'games-hub.2048.best';
const STATE_KEY = 'games-hub.2048.state';

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function clone(g) { return g.map(r => r.slice()); }

function equals(a, b) {
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE; j++)
      if (a[i][j] !== b[i][j]) return false;
  return true;
}

function emptyCells(g) {
  const out = [];
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE; j++)
      if (g[i][j] === 0) out.push([i, j]);
  return out;
}

function spawn(g) {
  const cells = emptyCells(g);
  if (cells.length === 0) return null;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return [r, c];
}

function rotateCW(g) {
  const out = emptyGrid();
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE; j++)
      out[j][SIZE - 1 - i] = g[i][j];
  return out;
}

function rotateN(g, n) {
  let out = g;
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) out = rotateCW(out);
  return out;
}

function slideLeft(g) {
  let gained = 0;
  const out = emptyGrid();
  for (let i = 0; i < SIZE; i++) {
    const row = g[i].filter(v => v !== 0);
    const merged = [];
    let j = 0;
    while (j < row.length) {
      if (j + 1 < row.length && row[j] === row[j + 1]) {
        const v = row[j] * 2;
        merged.push(v);
        gained += v;
        j += 2;
      } else {
        merged.push(row[j]);
        j++;
      }
    }
    while (merged.length < SIZE) merged.push(0);
    out[i] = merged;
  }
  return { grid: out, gained };
}

function move(g, dir) {
  const rot = { left: 0, down: 1, right: 2, up: 3 }[dir];
  const rotated = rotateN(g, rot);
  const { grid: slid, gained } = slideLeft(rotated);
  const restored = rotateN(slid, -rot);
  return { grid: restored, gained, moved: !equals(g, restored) };
}

function canMove(g) {
  if (emptyCells(g).length > 0) return true;
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE; j++) {
      if (j + 1 < SIZE && g[i][j] === g[i][j + 1]) return true;
      if (i + 1 < SIZE && g[i][j] === g[i + 1][j]) return true;
    }
  return false;
}

function reachedWin(g) {
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE; j++)
      if (g[i][j] >= 2048) return true;
  return false;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.grid || !Array.isArray(s.grid)) return null;
    return s;
  } catch { return null; }
}

function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

function clearState() {
  try { localStorage.removeItem(STATE_KEY); } catch {}
}

function getBest() {
  return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
}

function setBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch {}
}

export const Game2048 = {
  id: '2048',
  name: '2048',
  emoji: '🔢',
  description: 'Desliza y combina hasta 2048',

  mount(container) {
    let grid, score, best, wonAcknowledged = false, showWinOverlay = false, gameOver = false, newCell = null;

    const root = document.createElement('div');
    root.className = 'g2048';

    const scores = document.createElement('div');
    scores.className = 'g2048-scores';
    const scoreEl = document.createElement('div');
    scoreEl.className = 'g2048-score';
    scoreEl.innerHTML = `<div class="label">Puntuación</div><div class="value" id="g2048-score">0</div>`;
    const bestEl = document.createElement('div');
    bestEl.className = 'g2048-score';
    bestEl.innerHTML = `<div class="label">Récord</div><div class="value" id="g2048-best">0</div>`;
    scores.appendChild(scoreEl);
    scores.appendChild(bestEl);
    root.appendChild(scores);

    const board = document.createElement('div');
    board.className = 'g2048-board';
    root.appendChild(board);

    const actions = document.createElement('div');
    actions.className = 'g2048-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    root.appendChild(actions);

    container.appendChild(root);

    function render() {
      board.innerHTML = '';
      for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE; j++) {
          const cell = document.createElement('div');
          cell.className = 'g2048-cell';
          board.appendChild(cell);
          const v = grid[i][j];
          if (v !== 0) {
            const tile = document.createElement('div');
            const cls = v <= 2048 ? `t-${v}` : 't-big';
            tile.className = `g2048-tile ${cls}`;
            tile.textContent = v;
            if (newCell && newCell[0] === i && newCell[1] === j) tile.classList.add('new');
            cell.appendChild(tile);
          }
        }
      }
      document.getElementById('g2048-score').textContent = score;
      document.getElementById('g2048-best').textContent = best;

      const existing = board.querySelector('.g2048-overlay');
      if (existing) existing.remove();
      if (gameOver) showOverlay('¡Fin del juego!', 'Reintentar');
      else if (showWinOverlay) showOverlay('¡2048! Sigues jugando…', 'Continuar', true);
    }

    function showOverlay(message, btnText, transient = false) {
      const ov = document.createElement('div');
      ov.className = 'g2048-overlay';
      const msg = document.createElement('div');
      msg.className = 'msg';
      msg.textContent = message;
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = btnText;
      btn.addEventListener('click', () => {
        if (transient) { showWinOverlay = false; render(); }
        else { startNew(); }
      });
      ov.appendChild(msg);
      ov.appendChild(btn);
      board.appendChild(ov);
    }

    function attemptMove(dir) {
      if (gameOver) return;
      const res = move(grid, dir);
      if (!res.moved) return;
      grid = res.grid;
      score += res.gained;
      if (score > best) { best = score; setBest(best); }
      const spawned = spawn(grid);
      newCell = spawned;
      if (!wonAcknowledged && reachedWin(grid)) {
        wonAcknowledged = true;
        showWinOverlay = true;
      }
      if (!canMove(grid)) { gameOver = true; clearState(); }
      else saveState({ grid, score, wonAcknowledged });
      render();
    }

    function startNew() {
      grid = emptyGrid();
      score = 0;
      wonAcknowledged = false;
      showWinOverlay = false;
      gameOver = false;
      newCell = null;
      spawn(grid);
      spawn(grid);
      clearState();
      saveState({ grid, score, wonAcknowledged });
      render();
    }

    const saved = loadState();
    best = getBest();
    if (saved && canMove(saved.grid)) {
      grid = saved.grid;
      score = saved.score || 0;
      wonAcknowledged = !!(saved.wonAcknowledged || saved.wonNotified);
      showWinOverlay = false;
      gameOver = false;
    } else {
      grid = emptyGrid();
      score = 0;
      spawn(grid); spawn(grid);
      saveState({ grid, score, wonAcknowledged: false });
    }
    render();

    newBtn.addEventListener('click', startNew);

    function onKey(e) {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      attemptMove(dir);
    }
    window.addEventListener('keydown', onKey);

    let touchStart = null;
    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }
    function onTouchEnd(e) {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const TH = 24;
      if (Math.max(adx, ady) < TH) return;
      if (adx > ady) attemptMove(dx > 0 ? 'right' : 'left');
      else attemptMove(dy > 0 ? 'down' : 'up');
    }
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }
};
