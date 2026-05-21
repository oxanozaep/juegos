import { mountCanvas, makeOverlay, makeStat, beep } from './engine.js';

const COLS = 19, ROWS = 21;
// Maze legend: # wall, ' ' void(wall), _ open walkable, . dot, o power,
//              - door, T tunnel, P pacman spawn
const MAZE_STR = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###_#_###.####',
  '   #.#_______#.#   ',
  '####.#_##-##_#.####',
  'T___.__#___#__.___T',
  '####.#_#####_#.####',
  '   #.#_______#.#   ',
  '####.###_#_###.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o..#....P....#..o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################'
];

const BEST_KEY = 'games-hub.pacman.best';
const TUNNEL_ROW = 9;

const DIRS = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIR_NAMES = ['up', 'down', 'left', 'right'];
// Order in which "left" and "right" buttons consider directions, given the
// current heading. Priority is: actual rotation, then straight, then the
// opposite rotation. The opposite of current direction (reverse) is excluded
// because we don't normally allow 180° turns inside corridors.
const LEFT_PRIORITY = {
  up:    ['left',  'up',   'right'],
  right: ['up',    'right','down'],
  down:  ['right', 'down', 'left'],
  left:  ['down',  'left', 'up']
};
const RIGHT_PRIORITY = {
  up:    ['right', 'up',   'left'],
  right: ['down',  'right','up'],
  down:  ['left',  'down', 'right'],
  left:  ['up',    'left', 'down']
};

export const Pacman = {
  id: 'pacman',
  name: 'Pac-Man',
  emoji: '👻',
  description: 'Come puntos, evita fantasmas',

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
    hint.textContent = 'Toca el tablero o un botón para empezar';
    shell.appendChild(hint);

    const turnRow = document.createElement('div');
    turnRow.className = 'pac-turn-row';
    const turnLeftBtn = document.createElement('button');
    turnLeftBtn.className = 'pac-turn-btn';
    turnLeftBtn.textContent = '←';
    turnLeftBtn.setAttribute('aria-label', 'Girar a la izquierda');
    const turnRightBtn = document.createElement('button');
    turnRightBtn.className = 'pac-turn-btn';
    turnRightBtn.textContent = '→';
    turnRightBtn.setAttribute('aria-label', 'Girar a la derecha');
    turnRow.appendChild(turnLeftBtn);
    turnRow.appendChild(turnRightBtn);
    shell.appendChild(turnRow);

    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    // Parse maze
    let tiles, totalDots, pacSpawn;
    function parseMaze() {
      tiles = [];
      totalDots = 0;
      for (let y = 0; y < ROWS; y++) {
        const row = [];
        for (let x = 0; x < COLS; x++) {
          const ch = MAZE_STR[y][x];
          let t;
          if (ch === '.') { t = 2; totalDots++; }
          else if (ch === 'o') { t = 3; totalDots++; }
          else if (ch === '-') t = 4;
          else if (ch === 'T') t = 5;
          else if (ch === '_') t = 0;
          else if (ch === 'P') { t = 0; pacSpawn = { x, y }; }
          else t = 1; // '#', ' ' and anything else → wall
          row.push(t);
        }
        tiles.push(row);
      }
    }

    function isWalkable(tx, ty, allowDoor = false) {
      if (ty === TUNNEL_ROW && (tx < 0 || tx >= COLS)) return true;
      if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
      const t = tiles[ty][tx];
      if (t === 1) return false;
      if (t === 4 && !allowDoor) return false;
      return true;
    }

    let pac, ghosts, score, lives, level, state, frightT, frightChain, dotsLeft;
    let bufferedTurn = null;
    let best = loadBest();

    const cg = mountCanvas(gameWrap, { aspectRatio: `${COLS} / ${ROWS}`, update, draw });
    const overlay = makeOverlay(cg.wrap);

    function newGhost(x, y, color, name) {
      return {
        tx: x, ty: y, x, y,
        dir: 'left', nextDir: null,
        progress: 0,
        color, name,
        state: 'chase',     // 'chase' | 'frightened' | 'eyes'
        baseSpeed: 7.5,
        home: { x, y }
      };
    }

    function resetEntities() {
      pac = {
        tx: pacSpawn.x, ty: pacSpawn.y,
        x: pacSpawn.x, y: pacSpawn.y,
        dir: 'left', nextDir: null,
        progress: 0, speed: 8.2,
        mouth: 0
      };
      ghosts = [
        newGhost(9, 7,  '#ef4444', 'blinky'),
        newGhost(6, 7,  '#f9a8d4', 'pinky'),
        newGhost(12, 7, '#67e8f9', 'inky'),
        newGhost(9, 11, '#fb923c', 'clyde')
      ];
      frightT = 0;
      frightChain = 0;
    }

    function newGame() {
      parseMaze();
      score = 0; lives = 3; level = 1;
      dotsLeft = totalDots;
      resetEntities();
      state = 'ready';
      bufferedTurn = null;
      overlay.hide();
      hint.style.visibility = 'visible';
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

    function nextLevel() {
      level++;
      score += 500;
      parseMaze();
      dotsLeft = totalDots;
      resetEntities();
      for (const g of ghosts) g.baseSpeed = Math.min(9, 7.5 + (level - 1) * 0.3);
      state = 'ready';
      bufferedTurn = null;
      hint.style.visibility = 'visible';
      updateBar();
    }

    function dirsAvailable(ent, allowReverse, allowDoor) {
      const opts = [];
      for (const d of DIR_NAMES) {
        if (!allowReverse && d === OPPOSITE[ent.dir]) continue;
        const dx = DIRS[d];
        if (isWalkable(ent.tx + dx.x, ent.ty + dx.y, allowDoor)) opts.push(d);
      }
      return opts;
    }

    function pacAi() {
      const back = OPPOSITE[pac.dir];
      const opts = DIR_NAMES.filter(d =>
        d !== back && isWalkable(pac.tx + DIRS[d].x, pac.ty + DIRS[d].y));

      // Apply user-buffered turn using priority lists (smart pick)
      if (bufferedTurn) {
        const priority = (bufferedTurn === 'left' ? LEFT_PRIORITY : RIGHT_PRIORITY)[pac.dir];
        for (const d of priority) {
          if (opts.includes(d)) {
            bufferedTurn = null;
            return d;
          }
        }
        // Dead end fallback: allow reverse if buffered turn was pressed
        if (isWalkable(pac.tx + DIRS[back].x, pac.ty + DIRS[back].y)) {
          bufferedTurn = null;
          return back;
        }
        bufferedTurn = null;
        return null;
      }

      if (opts.length === 0) return null;        // dead end without input
      if (opts.length === 1) return opts[0];     // corridor / L-turn: auto-follow
      return null;                                // intersection: wait for input
    }

    function ghostTarget(g) {
      if (g.state === 'eyes') return g.home;
      if (g.state === 'frightened') return null;
      if (g.name === 'blinky') return { x: pac.tx, y: pac.ty };
      if (g.name === 'pinky') {
        const d = DIRS[pac.dir];
        return { x: pac.tx + d.x * 4, y: pac.ty + d.y * 4 };
      }
      if (g.name === 'inky') {
        const d = DIRS[pac.dir];
        return { x: pac.tx + d.x * 2, y: pac.ty + d.y * 2 };
      }
      // clyde
      const dist = Math.hypot(pac.tx - g.tx, pac.ty - g.ty);
      if (dist > 8) return { x: pac.tx, y: pac.ty };
      return { x: 0, y: ROWS - 1 };
    }

    function ghostAi(g) {
      const allowDoor = g.state === 'eyes';
      let opts = dirsAvailable(g, false, allowDoor);
      if (opts.length === 0) {
        const r = OPPOSITE[g.dir];
        if (isWalkable(g.tx + DIRS[r].x, g.ty + DIRS[r].y, allowDoor)) return r;
        return null;
      }
      if (g.state === 'frightened') {
        return opts[Math.floor(Math.random() * opts.length)];
      }
      const target = ghostTarget(g);
      let best = opts[0], bestDist = Infinity;
      for (const o of opts) {
        const nx = g.tx + DIRS[o].x;
        const ny = g.ty + DIRS[o].y;
        const dd = (nx - target.x) ** 2 + (ny - target.y) ** 2;
        if (dd < bestDist) { bestDist = dd; best = o; }
      }
      return best;
    }

    function step(ent, dt, speed, ai, allowDoor) {
      ent.progress += speed * dt;
      while (ent.progress >= 1) {
        ent.progress -= 1;
        const d = DIRS[ent.dir];
        ent.tx += d.x;
        ent.ty += d.y;
        if (ent.tx < 0) ent.tx = COLS - 1;
        if (ent.tx >= COLS) ent.tx = 0;
        const chosen = ai();
        if (chosen) ent.dir = chosen;
        else {
          ent.progress = 0;
          ent.x = ent.tx; ent.y = ent.ty;
          return;
        }
        // verify next move is possible
        const nd = DIRS[ent.dir];
        if (!isWalkable(ent.tx + nd.x, ent.ty + nd.y, allowDoor)) {
          ent.progress = 0;
          ent.x = ent.tx; ent.y = ent.ty;
          return;
        }
      }
      const d = DIRS[ent.dir];
      ent.x = ent.tx + d.x * ent.progress;
      ent.y = ent.ty + d.y * ent.progress;
    }

    function update(dt) {
      if (state !== 'playing') return;

      // Pac
      step(pac, dt, pac.speed, pacAi);
      pac.mouth = (pac.mouth + dt * 8) % (Math.PI * 2);

      // eat dot
      const tx = pac.tx, ty = pac.ty;
      if (ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS) {
        const t = tiles[ty][tx];
        if (t === 2) {
          tiles[ty][tx] = 0;
          score += 10; dotsLeft--;
          updateBar();
          beep(660, 0.03, 'square', 0.03);
        } else if (t === 3) {
          tiles[ty][tx] = 0;
          score += 50; dotsLeft--;
          frightT = 7;
          frightChain = 0;
          for (const g of ghosts) {
            if (g.state !== 'eyes') {
              g.state = 'frightened';
              g.dir = OPPOSITE[g.dir]; // reverse on power
            }
          }
          updateBar();
          beep(220, 0.15, 'sine', 0.05);
        }
      }
      if (dotsLeft <= 0) { nextLevel(); return; }

      // Frightened timer
      if (frightT > 0) {
        frightT -= dt;
        if (frightT <= 0) {
          for (const g of ghosts) if (g.state === 'frightened') g.state = 'chase';
        }
      }

      // Ghosts
      for (const g of ghosts) {
        let sp = g.baseSpeed;
        if (g.state === 'frightened') sp = 5;
        else if (g.state === 'eyes') sp = 14;
        step(g, dt, sp, () => ghostAi(g), g.state === 'eyes');
        if (g.state === 'eyes' && g.tx === g.home.x && g.ty === g.home.y && g.progress < 0.01) {
          g.state = 'chase';
        }
      }

      // Collisions pac-ghost
      for (const g of ghosts) {
        const dist = Math.hypot(g.x - pac.x, g.y - pac.y);
        if (dist < 0.6) {
          if (g.state === 'frightened') {
            frightChain++;
            score += 200 * Math.pow(2, Math.min(3, frightChain - 1));
            updateBar();
            beep(880, 0.15, 'sine', 0.06);
            g.state = 'eyes';
          } else if (g.state !== 'eyes') {
            lives--;
            updateBar();
            beep(110, 0.4, 'sawtooth', 0.08);
            if (lives <= 0) { gameOver(); return; }
            resetEntities();
            return;
          }
        }
      }
    }

    function draw(ctx, w, h) {
      const cw = w / COLS, ch = h / ROWS;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // walls
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = tiles[y][x];
          if (t === 1) {
            ctx.fillStyle = '#1d4ed8';
            ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
          } else if (t === 4) {
            ctx.fillStyle = '#f9a8d4';
            ctx.fillRect(x * cw, y * ch + ch * 0.4, cw, ch * 0.2);
          }
        }
      }
      // dots & power
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = tiles[y][x];
          if (t === 2) {
            ctx.fillStyle = '#fef3c7';
            ctx.beginPath();
            ctx.arc((x + 0.5) * cw, (y + 0.5) * ch, Math.max(1, cw * 0.1), 0, Math.PI * 2);
            ctx.fill();
          } else if (t === 3) {
            ctx.fillStyle = '#fef3c7';
            ctx.beginPath();
            ctx.arc((x + 0.5) * cw, (y + 0.5) * ch, cw * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ghosts
      for (const g of ghosts) {
        const cx = (g.x + 0.5) * cw;
        const cy = (g.y + 0.5) * ch;
        const r = cw * 0.42;
        let color = g.color;
        if (g.state === 'frightened') color = frightT < 2 && Math.floor(frightT * 6) % 2 === 0 ? '#fff' : '#3b82f6';
        else if (g.state === 'eyes') color = null;

        if (color) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0);
          ctx.lineTo(cx + r, cy + r * 0.8);
          // wavy bottom
          const segs = 4;
          for (let i = 1; i <= segs; i++) {
            const px = cx + r - (2 * r) * (i / segs);
            const py = cy + r * 0.8 + (i % 2 === 0 ? -r * 0.2 : 0);
            ctx.lineTo(px, py);
          }
          ctx.lineTo(cx - r, cy - r * 0.1);
          ctx.fill();
        }
        // eyes
        ctx.fillStyle = '#fff';
        const eyeR = r * 0.28;
        const ex = r * 0.35;
        ctx.beginPath(); ctx.arc(cx - ex, cy - r * 0.1, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + ex, cy - r * 0.1, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1d4ed8';
        const pd = DIRS[g.dir];
        const pupX = pd.x * eyeR * 0.5, pupY = pd.y * eyeR * 0.5;
        ctx.beginPath(); ctx.arc(cx - ex + pupX, cy - r * 0.1 + pupY, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + ex + pupX, cy - r * 0.1 + pupY, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
      }

      // pac
      const pcx = (pac.x + 0.5) * cw;
      const pcy = (pac.y + 0.5) * ch;
      const pr = cw * 0.45;
      const angle = (Math.sin(pac.mouth) * 0.5 + 0.5) * 0.6;
      const baseAng = pac.dir === 'right' ? 0 : pac.dir === 'down' ? Math.PI / 2 : pac.dir === 'left' ? Math.PI : -Math.PI / 2;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(pcx, pcy);
      ctx.arc(pcx, pcy, pr, baseAng + angle, baseAng - angle + Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }

    function startIfReady() {
      if (state === 'ready') {
        state = 'playing';
        hint.style.visibility = 'hidden';
      }
    }
    function pressTurn(side) {
      bufferedTurn = side;
      startIfReady();
    }
    function bindTurnBtn(btn, side) {
      const press = e => { e.preventDefault(); pressTurn(side); };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('mousedown', press);
    }
    bindTurnBtn(turnLeftBtn, 'left');
    bindTurnBtn(turnRightBtn, 'right');

    cg.canvas.addEventListener('touchstart', e => { e.preventDefault(); startIfReady(); }, { passive: false });
    cg.canvas.addEventListener('mousedown', () => startIfReady());

    function onKey(e) {
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); pressTurn('left'); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); pressTurn('right'); }
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
