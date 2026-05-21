import { mountCanvas, makeOverlay, makeStat, aabbHit, beep } from './engine.js';

const BEST_KEY = 'games-hub.flappy.best';
const W = 100, H = 160;
const GRAVITY = 360;
const FLAP_V = -110;
const PIPE_GAP = 36;
const PIPE_W = 14;
const PIPE_SPEED = 50;
const PIPE_SPACING = 50;
const BIRD_R = 3;
const BIRD_X = 25;
const GROUND_H = 8;

export const Flappy = {
  id: 'flappy',
  name: 'Flappy',
  emoji: '🐦',
  description: 'Esquiva tuberías con un toque',

  mount(container) {
    const shell = document.createElement('div');
    shell.className = 'cg-shell';

    const bar = document.createElement('div');
    bar.className = 'cg-bar';
    const sScore = makeStat('Puntos', '0');
    const sBest  = makeStat('Récord', String(loadBest()));
    bar.appendChild(sScore.el); bar.appendChild(sBest.el);
    shell.appendChild(bar);

    const gameWrap = document.createElement('div');
    shell.appendChild(gameWrap);

    const hint = document.createElement('div');
    hint.className = 'cg-hint';
    hint.textContent = 'Toca para volar';
    shell.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    let bird, vy, pipes, score, state;
    let best = loadBest();

    const cg = mountCanvas(gameWrap, { aspectRatio: '5 / 8', update, draw });
    const overlay = makeOverlay(cg.wrap);

    function newGame() {
      bird = { x: BIRD_X, y: H / 2 };
      vy = 0;
      pipes = [];
      score = 0;
      // initial pipes
      for (let i = 0; i < 4; i++) addPipe(W + i * PIPE_SPACING);
      state = 'ready';
      hint.style.visibility = 'visible';
      overlay.hide();
      updateBar();
    }

    function addPipe(x) {
      const gapY = 20 + Math.random() * (H - GROUND_H - 40 - PIPE_GAP);
      pipes.push({ x, gapY, passed: false });
    }

    function flap() {
      if (state === 'ready') { state = 'playing'; hint.style.visibility = 'hidden'; }
      if (state !== 'playing') return;
      vy = FLAP_V;
      beep(620, 0.04, 'square', 0.04);
    }

    function gameOver() {
      state = 'over';
      if (score > best) { best = score; saveBest(best); }
      updateBar();
      beep(140, 0.25, 'sawtooth', 0.07);
      overlay.show(`<div class="msg">¡Te estampaste!</div>
        <div class="sub">Puntuación: ${score} · Récord: ${best}</div>
        <button class="primary">Volver a jugar</button>`).querySelector('button')
        .addEventListener('click', newGame);
    }

    function updateBar() { sScore.set(String(score)); sBest.set(String(best)); }

    function update(dt) {
      if (state === 'over') return;
      if (state === 'ready') {
        bird.y = H / 2 + Math.sin(performance.now() / 200) * 2;
        return;
      }
      vy += GRAVITY * dt;
      bird.y += vy * dt;

      for (const p of pipes) p.x -= PIPE_SPEED * dt;
      while (pipes.length && pipes[0].x + PIPE_W < 0) pipes.shift();
      const last = pipes[pipes.length - 1];
      if (last.x < W - PIPE_SPACING) addPipe(last.x + PIPE_SPACING);

      // collisions
      if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; gameOver(); return; }
      if (bird.y + BIRD_R > H - GROUND_H) { bird.y = H - GROUND_H - BIRD_R; gameOver(); return; }
      for (const p of pipes) {
        if (aabbHit({ x: bird.x - BIRD_R, y: bird.y - BIRD_R, w: BIRD_R * 2, h: BIRD_R * 2 },
                   { x: p.x, y: 0, w: PIPE_W, h: p.gapY }) ||
            aabbHit({ x: bird.x - BIRD_R, y: bird.y - BIRD_R, w: BIRD_R * 2, h: BIRD_R * 2 },
                   { x: p.x, y: p.gapY + PIPE_GAP, w: PIPE_W, h: H - GROUND_H - p.gapY - PIPE_GAP })) {
          gameOver(); return;
        }
        if (!p.passed && p.x + PIPE_W < bird.x) {
          p.passed = true;
          score++;
          beep(880, 0.06, 'sine', 0.05);
          updateBar();
        }
      }
    }

    function draw(ctx, w, h) {
      const s = w / W;
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(0, 0, w, h);
      // clouds (simple)
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc((20 + i * 30) * s, (30 + (i % 2) * 10) * s, 6 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // pipes
      ctx.fillStyle = '#16a34a';
      for (const p of pipes) {
        ctx.fillRect(p.x * s, 0, PIPE_W * s, p.gapY * s);
        ctx.fillRect(p.x * s, (p.gapY + PIPE_GAP) * s, PIPE_W * s, (H - GROUND_H - p.gapY - PIPE_GAP) * s);
        // lip
        ctx.fillStyle = '#15803d';
        ctx.fillRect((p.x - 0.5) * s, (p.gapY - 2) * s, (PIPE_W + 1) * s, 2 * s);
        ctx.fillRect((p.x - 0.5) * s, (p.gapY + PIPE_GAP) * s, (PIPE_W + 1) * s, 2 * s);
        ctx.fillStyle = '#16a34a';
      }
      // ground
      ctx.fillStyle = '#a16207';
      ctx.fillRect(0, (H - GROUND_H) * s, w, GROUND_H * s);
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(0, (H - GROUND_H) * s, w, 1.5 * s);

      // bird
      ctx.save();
      ctx.translate(bird.x * s, bird.y * s);
      const tilt = Math.max(-0.6, Math.min(1.2, vy / 100));
      ctx.rotate(tilt);
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.arc(0, 0, BIRD_R * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(BIRD_R * s, 0);
      ctx.lineTo((BIRD_R + 1.5) * s, -0.5 * s);
      ctx.lineTo((BIRD_R + 1.5) * s, 0.5 * s);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(BIRD_R * 0.4 * s, -BIRD_R * 0.3 * s, BIRD_R * 0.4 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(BIRD_R * 0.6 * s, -BIRD_R * 0.3 * s, BIRD_R * 0.15 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function onTouch(e) { e.preventDefault(); flap(); }
    cg.canvas.addEventListener('touchstart', onTouch, { passive: false });
    cg.canvas.addEventListener('mousedown', e => { e.preventDefault(); flap(); });
    function onKey(e) {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); flap(); }
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
