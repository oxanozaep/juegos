import { mountCanvas, makeOverlay, makeStat, beep } from './engine.js';

const BEST_KEY = 'games-hub.crossy.best';
const COLS = 9;
const VIEW_ROWS = 14;
const HOP_DUR = 0.12;
const CAR_COLORS = ['#ef4444','#3b82f6','#facc15','#22c55e','#a855f7','#fb923c','#06b6d4'];

function makeRow(y, forcedType) {
  let type = forcedType;
  if (type === undefined) {
    if (y <= 3) type = 'grass';
    else {
      const roadProb = Math.min(0.75, 0.45 + y * 0.005);
      type = Math.random() < roadProb ? 'road' : 'grass';
    }
  }
  const row = { y, type, cars: [], trees: [] };
  if (type === 'road') {
    row.dir = Math.random() < 0.5 ? -1 : 1;
    const baseSpeed = 2 + Math.random() * 2.5;
    row.speed = baseSpeed * (1 + Math.min(1.5, y * 0.012));
    row.spawnInterval = 1.4 + Math.random() * 1.6;
    row.spawnT = Math.random() * row.spawnInterval;
    // pre-spawn a few cars
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      row.cars.push({
        x: Math.random() * (COLS + 4) - 2,
        w: 1.4 + Math.random() * 0.6,
        color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
      });
    }
  } else if (type === 'grass' && y > 3) {
    // sparse trees as obstacles, but never block the whole row
    for (let x = 0; x < COLS; x++) {
      if (Math.random() < 0.12) row.trees.push(x);
    }
    // ensure at least one free column
    if (row.trees.length >= COLS) row.trees.pop();
  }
  return row;
}

export const Crossy = {
  id: 'crossy',
  name: 'Cruza',
  emoji: '🐔',
  description: 'Cruza calles esquivando coches',

  mount(container) {
    const shell = document.createElement('div');
    shell.className = 'cg-shell';

    const bar = document.createElement('div');
    bar.className = 'cg-bar';
    const sScore = makeStat('Puntos', '0');
    const sBest  = makeStat('Récord', String(loadBest()));
    bar.appendChild(sScore.el); bar.appendChild(sBest.el);
    shell.appendChild(bar);

    // Fila adicional de estadísticas (Promedio y Fecha de Récord)
    const extraBar = document.createElement('div');
    extraBar.className = 'crossy-extra-bar';
    const sAvg = makeStat('Promedio (100)', '0');
    const sDate = makeStat('Fecha Récord', '-');
    sDate.el.querySelector('.value').classList.add('date-val');
    extraBar.appendChild(sAvg.el); extraBar.appendChild(sDate.el);
    shell.appendChild(extraBar);

    const gameWrap = document.createElement('div');
    shell.appendChild(gameWrap);

    const hint = document.createElement('div');
    hint.className = 'cg-hint';
    hint.textContent = 'Tap = avanzar · swipe = mover en esa dirección';
    shell.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    let chicken;
    let rowMap;
    let cameraY;
    let maxY;
    let score;
    let state;
    let best = loadBest();
    let bestDate = loadBestDate();
    let history = loadHistory();

    function calculateAverage() {
      if (history.length === 0) return 0;
      const sum = history.reduce((a, b) => a + b, 0);
      return Math.round(sum / history.length);
    }

    const cg = mountCanvas(gameWrap, { aspectRatio: `${COLS} / ${VIEW_ROWS}`, update, draw });
    const overlay = makeOverlay(cg.wrap);

    function ensureRow(y) {
      if (rowMap.has(y)) return rowMap.get(y);
      const row = makeRow(y);
      rowMap.set(y, row);
      return row;
    }

    function hasTree(y, x) {
      const row = rowMap.get(y);
      return row && row.trees && row.trees.includes(x);
    }

    function carHits(row, x, hitWidth = 0.95) {
      if (!row || row.type !== 'road') return false;
      for (const car of row.cars) {
        if (x + hitWidth > car.x && x < car.x + car.w) return true;
      }
      return false;
    }

    function tryMove(dx, dy) {
      if (state !== 'playing') return;
      if (chicken.hopT > 0) return;
      const nx = chicken.cx + dx;
      const ny = chicken.cy + dy;
      if (nx < 0 || nx >= COLS) return;
      if (ny < 0) return;
      // ensure target row exists
      const targetRow = ensureRow(ny);
      if (targetRow.trees && targetRow.trees.includes(nx)) return; // tree blocks
      chicken.fx = chicken.cx; chicken.fy = chicken.cy;
      chicken.cx = nx; chicken.cy = ny;
      chicken.hopT = HOP_DUR;
      beep(520 + Math.min(800, score * 4), 0.04, 'square', 0.04);
      if (chicken.cy > maxY) {
        maxY = chicken.cy;
        score = maxY;
        if (score > best) {
          best = score;
          saveBest(best);
          const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
          bestDate = dateStr;
          saveBestDate(bestDate);
        }
        updateBar();
      }
    }

    function updateBar() {
      sScore.set(String(score));
      sBest.set(String(best));
      sAvg.set(String(calculateAverage()));
      sDate.set(bestDate);
    }

    function gameOver(reason) {
      state = 'over';
      beep(110, 0.3, 'sawtooth', 0.08);

      // Registrar en el historial de 100 partidas
      history.push(score);
      if (history.length > 100) history.shift();
      saveHistory(history);

      updateBar();

      overlay.show(`<div class="msg">${reason}</div>
        <div class="sub">Puntos: ${score} · Récord: ${best} (${bestDate})</div>
        <button class="primary">Volver a jugar</button>`).querySelector('button')
        .addEventListener('click', newGame);
    }

    function newGame() {
      chicken = { cx: Math.floor(COLS / 2), cy: 0, fx: Math.floor(COLS / 2), fy: 0, hopT: 0 };
      rowMap = new Map();
      cameraY = 0;
      maxY = 0;
      score = 0;
      state = 'playing';
      for (let y = 0; y <= 3; y++) rowMap.set(y, makeRow(y, 'grass'));
      for (let y = 4; y < VIEW_ROWS; y++) ensureRow(y);
      overlay.hide();
      updateBar();
    }

    function update(dt) {
      if (state !== 'playing') return;

      // camera follow
      const target = Math.max(0, chicken.cy - 4);
      cameraY += (target - cameraY) * Math.min(1, dt * 5);

      // ensure rows in viewport (+ a few ahead)
      const topY = Math.ceil(cameraY + VIEW_ROWS + 1);
      for (let y = Math.max(0, Math.floor(cameraY - 1)); y <= topY; y++) ensureRow(y);

      // garbage-collect rows far behind
      for (const y of rowMap.keys()) {
        if (y < cameraY - 5) rowMap.delete(y);
      }

      // update road rows
      for (const [y, row] of rowMap) {
        if (row.type !== 'road') continue;
        // only update rows visible-ish
        if (y < cameraY - 2 || y > topY) continue;
        row.spawnT -= dt;
        if (row.spawnT <= 0) {
          row.spawnT = row.spawnInterval;
          const w = 1.4 + Math.random() * 0.6;
          row.cars.push({
            x: row.dir > 0 ? -w - 0.2 : COLS + 0.2,
            w,
            color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
          });
        }
        for (const car of row.cars) car.x += row.dir * row.speed * dt;
        row.cars = row.cars.filter(c => c.x > -4 && c.x < COLS + 4);
      }

      // hop anim
      if (chicken.hopT > 0) {
        chicken.hopT -= dt;
        if (chicken.hopT < 0) chicken.hopT = 0;
      }

      // collision (only when chicken settled on a tile)
      if (chicken.hopT === 0) {
        const row = rowMap.get(chicken.cy);
        if (carHits(row, chicken.cx)) { gameOver('¡Te atropellaron!'); return; }
      }
    }

    function draw(ctx, w, h) {
      const cw = w / COLS;
      const ch = h / VIEW_ROWS;
      const topWorld = cameraY + VIEW_ROWS - 1;
      const worldToPx = y => (topWorld - y) * ch;

      // sky-ish bg (in case rows haven't been generated)
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, w, h);

      const startY = Math.max(0, Math.floor(cameraY - 1));
      const endY = Math.ceil(cameraY + VIEW_ROWS + 1);

      for (let y = startY; y <= endY; y++) {
        const row = rowMap.get(y);
        if (!row) continue;
        const vy = worldToPx(y);
        if (row.type === 'grass') {
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(0, vy, w, ch);
          ctx.fillStyle = '#22c55e';
          for (let x = 0; x < COLS; x++) {
            if ((x + y) % 2 === 0) ctx.fillRect(x * cw, vy, cw, ch);
          }
        } else if (row.type === 'road') {
          ctx.fillStyle = '#374151';
          ctx.fillRect(0, vy, w, ch);
          // direction-coloured side stripe to hint direction
          ctx.fillStyle = row.dir > 0 ? 'rgba(96,165,250,0.18)' : 'rgba(248,113,113,0.18)';
          ctx.fillRect(0, vy, w, 2);
          ctx.fillRect(0, vy + ch - 2, w, 2);
          // dashed centre line
          ctx.fillStyle = '#fef9c3';
          const dashW = cw * 0.5;
          for (let x = 0; x < COLS; x++) {
            ctx.fillRect(x * cw + (cw - dashW) / 2, vy + ch / 2 - 1, dashW, 2);
          }
        }
      }

      // trees (above grass)
      for (let y = startY; y <= endY; y++) {
        const row = rowMap.get(y);
        if (!row || row.type !== 'grass' || !row.trees) continue;
        const vy = worldToPx(y);
        for (const x of row.trees) {
          ctx.fillStyle = '#166534';
          ctx.fillRect(x * cw + cw * 0.15, vy + ch * 0.1, cw * 0.7, ch * 0.8);
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(x * cw + cw / 2, vy + ch * 0.4, cw * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // cars
      for (let y = startY; y <= endY; y++) {
        const row = rowMap.get(y);
        if (!row || row.type !== 'road') continue;
        const vy = worldToPx(y);
        for (const car of row.cars) {
          ctx.fillStyle = car.color;
          const cx = car.x * cw + 2;
          const cy = vy + 3;
          const cwid = car.w * cw - 4;
          const cht = ch - 6;
          ctx.fillRect(cx, cy, cwid, cht);
          // windshield
          ctx.fillStyle = 'rgba(15,23,42,0.55)';
          if (row.dir > 0) ctx.fillRect(cx + cwid * 0.6, cy + 2, cwid * 0.3, cht - 4);
          else            ctx.fillRect(cx + cwid * 0.1, cy + 2, cwid * 0.3, cht - 4);
          // headlights
          ctx.fillStyle = 'rgba(254,243,199,0.9)';
          if (row.dir > 0) {
            ctx.fillRect(cx + cwid - 3, cy + 3, 2, 3);
            ctx.fillRect(cx + cwid - 3, cy + cht - 6, 2, 3);
          } else {
            ctx.fillRect(cx + 1, cy + 3, 2, 3);
            ctx.fillRect(cx + 1, cy + cht - 6, 2, 3);
          }
        }
      }

      // chicken
      let visualX = chicken.cx;
      let visualY = chicken.cy;
      let hopOffset = 0;
      if (chicken.hopT > 0) {
        const t = 1 - chicken.hopT / HOP_DUR;
        visualX = chicken.fx + (chicken.cx - chicken.fx) * t;
        visualY = chicken.fy + (chicken.cy - chicken.fy) * t;
        hopOffset = -Math.sin(t * Math.PI) * ch * 0.35;
      }
      const px = (visualX + 0.5) * cw;
      const py = worldToPx(visualY) + ch * 0.55 + hopOffset;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(px, worldToPx(visualY) + ch * 0.82, cw * 0.32, ch * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.ellipse(px, py, cw * 0.32, ch * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      // wing
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.ellipse(px - cw * 0.05, py + ch * 0.02, cw * 0.18, ch * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      // head
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(px + cw * 0.08, py - ch * 0.22, cw * 0.22, 0, Math.PI * 2);
      ctx.fill();
      // comb
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(px + cw * 0.08, py - ch * 0.36, cw * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + cw * 0.18, py - ch * 0.34, cw * 0.06, 0, Math.PI * 2);
      ctx.fill();
      // beak
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(px + cw * 0.28, py - ch * 0.22);
      ctx.lineTo(px + cw * 0.42, py - ch * 0.18);
      ctx.lineTo(px + cw * 0.28, py - ch * 0.14);
      ctx.closePath();
      ctx.fill();
      // eye
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(px + cw * 0.15, py - ch * 0.25, cw * 0.04, 0, Math.PI * 2);
      ctx.fill();
      // legs (only when settled)
      if (chicken.hopT === 0) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - cw * 0.12, py + ch * 0.22);
        ctx.lineTo(px - cw * 0.12, py + ch * 0.36);
        ctx.moveTo(px + cw * 0.06, py + ch * 0.22);
        ctx.lineTo(px + cw * 0.06, py + ch * 0.36);
        ctx.stroke();
      }
    }

    // input
    let touchStart = null;
    cg.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
    }, { passive: false });
    cg.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const TH = 14;
      if (Math.max(adx, ady) < TH) {
        tryMove(0, 1); // tap = jump forward
      } else if (adx > ady) {
        tryMove(dx > 0 ? 1 : -1, 0);
      } else {
        tryMove(0, dy > 0 ? -1 : 1);
      }
      touchStart = null;
    }, { passive: false });
    cg.canvas.addEventListener('mousedown', () => tryMove(0, 1));

    function onKey(e) {
      if (e.key === 'ArrowUp' || e.key === 'w')   { e.preventDefault(); tryMove(0, 1); }
      else if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); tryMove(0, -1); }
      else if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); tryMove(-1, 0); }
      else if (e.key === 'ArrowRight' || e.key === 'd'){ e.preventDefault(); tryMove(1, 0); }
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

const BEST_DATE_KEY = 'games-hub.crossy.best-date';
const HISTORY_KEY = 'games-hub.crossy.history';

function loadBestDate() { return localStorage.getItem(BEST_DATE_KEY) || '-'; }
function saveBestDate(v) { try { localStorage.setItem(BEST_DATE_KEY, String(v)); } catch {} }

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveHistory(arr) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
  } catch {}
}
