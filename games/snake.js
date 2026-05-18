const SIZE = 20;
const INITIAL_TICK = 200;
const MIN_TICK = 80;
const SPEEDUP_PER_FOOD = 4;
const BEST_KEY = 'games-hub.snake.best';
const STATE_KEY = 'games-hub.snake.state';

const DIRS = {
  up:    { dr: -1, dc: 0 },
  down:  { dr: 1,  dc: 0 },
  left:  { dr: 0,  dc: -1 },
  right: { dr: 0,  dc: 1 }
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

function loadBest() { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} }
function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; } }
function saveState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} }
function clearStoredState() { try { localStorage.removeItem(STATE_KEY); } catch {} }

function randomEmptyCell(snake) {
  const taken = new Set(snake.map(s => s.r * SIZE + s.c));
  const free = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return null;
  const v = free[Math.floor(Math.random() * free.length)];
  return { r: Math.floor(v / SIZE), c: v % SIZE };
}

export const Snake = {
  id: 'snake',
  name: 'Serpiente',
  emoji: '🐍',
  description: 'Clásico con swipe',

  mount(container) {
    let snake = null;
    let dir = 'right';
    let dirQueue = [];
    let food = null;
    let score = 0;
    let best = loadBest();
    let tickMs = INITIAL_TICK;
    let state = 'ready';   // 'ready' | 'playing' | 'over'
    let tickHandle = null;
    let touchStart = null;
    const onCells = [];    // {node, cls} to clear before next render

    const root = document.createElement('div');
    root.className = 'snake';

    const bar = document.createElement('div');
    bar.className = 'snake-bar';
    const scoreEl = document.createElement('div');
    scoreEl.className = 'snake-stat';
    scoreEl.innerHTML = `<div class="label">Puntuación</div><div class="value" id="snake-score">0</div>`;
    const bestEl = document.createElement('div');
    bestEl.className = 'snake-stat';
    bestEl.innerHTML = `<div class="label">Récord</div><div class="value" id="snake-best">${best}</div>`;
    bar.appendChild(scoreEl);
    bar.appendChild(bestEl);
    root.appendChild(bar);

    const boardWrap = document.createElement('div');
    boardWrap.className = 'snake-board-wrap';
    const board = document.createElement('div');
    board.className = 'snake-board';
    board.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${SIZE}, 1fr)`;
    boardWrap.appendChild(board);
    root.appendChild(boardWrap);

    const hint = document.createElement('div');
    hint.className = 'snake-hint';
    hint.textContent = 'Desliza o usa las flechas para empezar';
    root.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'snake-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    root.appendChild(actions);

    container.appendChild(root);

    // Build static cell grid once
    const cellNodes = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'snake-cell';
        board.appendChild(cell);
        row.push(cell);
      }
      cellNodes.push(row);
    }

    function render() {
      for (const { node, cls } of onCells) node.classList.remove(cls);
      onCells.length = 0;

      if (food) {
        const fn = cellNodes[food.r][food.c];
        fn.classList.add('food');
        onCells.push({ node: fn, cls: 'food' });
      }
      for (let i = 0; i < snake.length; i++) {
        const { r, c } = snake[i];
        const n = cellNodes[r][c];
        const cls = i === 0 ? 'head' : 'body';
        n.classList.add(cls);
        onCells.push({ node: n, cls });
      }
      document.getElementById('snake-score').textContent = score;
      document.getElementById('snake-best').textContent = best;

      const existing = boardWrap.querySelector('.snake-overlay');
      if (existing) existing.remove();
      if (state === 'over') {
        const ov = document.createElement('div');
        ov.className = 'snake-overlay';
        ov.innerHTML = `<div class="msg">¡Fin del juego!</div><div class="score">Puntuación: ${score}</div>`;
        const b = document.createElement('button');
        b.className = 'primary';
        b.textContent = 'Volver a jugar';
        b.addEventListener('click', startNew);
        ov.appendChild(b);
        boardWrap.appendChild(ov);
      }

      hint.style.visibility = state === 'ready' ? 'visible' : 'hidden';
    }

    function persist() {
      if (state === 'playing') {
        saveState({ snake, dir, food, score, tickMs });
      }
    }

    function gameOver() {
      state = 'over';
      stopLoop();
      clearStoredState();
      render();
    }

    function stopLoop() {
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }
    function restartLoop() {
      stopLoop();
      tickHandle = setInterval(tick, tickMs);
    }

    function tick() {
      if (state !== 'playing') return;
      if (dirQueue.length > 0) {
        const next = dirQueue.shift();
        if (next !== OPPOSITE[dir]) dir = next;
      }
      const head = snake[0];
      const d = DIRS[dir];
      const newHead = { r: head.r + d.dr, c: head.c + d.dc };
      if (newHead.r < 0 || newHead.r >= SIZE || newHead.c < 0 || newHead.c >= SIZE) {
        gameOver();
        return;
      }
      const willGrow = newHead.r === food.r && newHead.c === food.c;
      const limit = willGrow ? snake.length : snake.length - 1;
      for (let i = 0; i < limit; i++) {
        if (snake[i].r === newHead.r && snake[i].c === newHead.c) { gameOver(); return; }
      }
      snake.unshift(newHead);
      if (willGrow) {
        score++;
        if (score > best) { best = score; saveBest(best); }
        if (tickMs > MIN_TICK) {
          tickMs = Math.max(MIN_TICK, tickMs - SPEEDUP_PER_FOOD);
          restartLoop();
        }
        food = randomEmptyCell(snake);
        if (!food) { gameOver(); return; }
      } else {
        snake.pop();
      }
      persist();
      render();
    }

    function pushDir(d) {
      if (state === 'over') return;
      const last = dirQueue.length > 0 ? dirQueue[dirQueue.length - 1] : dir;
      if (d === last || d === OPPOSITE[last]) return;
      dirQueue.push(d);
      if (state === 'ready') {
        state = 'playing';
        restartLoop();
      }
    }

    function onKey(e) {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
      };
      const newDir = map[e.key];
      if (!newDir) return;
      e.preventDefault();
      pushDir(newDir);
    }
    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    function onTouchEnd(e) {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (Math.max(adx, ady) < 20) return;
      if (adx > ady) pushDir(dx > 0 ? 'right' : 'left');
      else pushDir(dy > 0 ? 'down' : 'up');
    }
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKey);

    function startNew() {
      snake = [
        { r: Math.floor(SIZE / 2), c: 5 },
        { r: Math.floor(SIZE / 2), c: 4 },
        { r: Math.floor(SIZE / 2), c: 3 }
      ];
      dir = 'right';
      dirQueue = [];
      score = 0;
      tickMs = INITIAL_TICK;
      state = 'ready';
      food = randomEmptyCell(snake);
      stopLoop();
      clearStoredState();
      render();
    }

    newBtn.addEventListener('click', startNew);

    function loadOrStart() {
      const saved = loadState();
      if (saved && Array.isArray(saved.snake) && saved.snake.length > 0 && saved.food) {
        snake = saved.snake;
        dir = saved.dir || 'right';
        dirQueue = [];
        food = saved.food;
        score = saved.score || 0;
        tickMs = saved.tickMs || INITIAL_TICK;
        state = 'ready';
        render();
        return;
      }
      startNew();
    }

    loadOrStart();

    return () => {
      stopLoop();
      window.removeEventListener('keydown', onKey);
    };
  }
};
