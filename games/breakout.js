import { mountCanvas, makeOverlay, makeStat, clamp, circleRectHit, beep } from './engine.js';

const BEST_KEY = 'games-hub.breakout.best';
const W = 100, H = 140;
const PADDLE_W = 18, PADDLE_H = 1.8;
const PADDLE_Y = H - 8;
const BALL_R = 1.3;
const ROWS = 6, COLS = 9;
const PALETTE = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

export const Breakout = {
  id: 'breakout',
  name: 'Breakout',
  emoji: '🧱',
  description: 'Rompe los ladrillos',

  mount(container) {
    const shell = document.createElement('div');
    shell.className = 'cg-shell';

    const bar = document.createElement('div');
    bar.className = 'cg-bar';
    const sScore = makeStat('Puntos', '0');
    const sLives = makeStat('Vidas', '3');
    const sBest = makeStat('Récord', String(loadBest()));
    bar.appendChild(sScore.el); bar.appendChild(sLives.el); bar.appendChild(sBest.el);
    shell.appendChild(bar);

    const gameWrap = document.createElement('div');
    shell.appendChild(gameWrap);

    const hint = document.createElement('div');
    hint.className = 'cg-hint';
    hint.textContent = 'Mueve el dedo (o ← →). Toca para lanzar.';
    shell.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    let state = 'ready';
    let paddleX, ball, vel, bricks, lives, score, level;
    let best = loadBest();

    const cg = mountCanvas(gameWrap, { aspectRatio: '3 / 4', update, draw });
    const overlay = makeOverlay(cg.wrap);

    function newLevel(l) {
      level = l;
      const margin = 3;
      const top = 10;
      const bw = (W - margin * 2 - (COLS - 1) * 0.5) / COLS;
      const bh = 3;
      bricks = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          bricks.push({
            x: margin + c * (bw + 0.5),
            y: top + r * (bh + 0.5),
            w: bw, h: bh,
            color: PALETTE[r % PALETTE.length],
            points: (ROWS - r) * 10,
            alive: true
          });
        }
      }
      resetBall();
    }

    function resetBall() {
      paddleX = W / 2 - PADDLE_W / 2;
      ball = { x: W / 2, y: PADDLE_Y - BALL_R - 0.5 };
      vel = { x: 0, y: 0 };
      state = 'ready';
      hint.style.visibility = 'visible';
      overlay.hide();
    }

    function launch() {
      if (state !== 'ready') return;
      const speed = 55 + level * 4;
      const a = (Math.random() - 0.5) * Math.PI * 0.4;
      vel.x = speed * Math.sin(a);
      vel.y = -speed * Math.cos(a);
      state = 'playing';
      hint.style.visibility = 'hidden';
    }

    function newGame() {
      score = 0; lives = 3;
      newLevel(1);
      updateBar();
    }

    function updateBar() {
      sScore.set(String(score));
      sLives.set(String(lives));
      sBest.set(String(best));
    }

    function gameOver() {
      state = 'over';
      if (score > best) { best = score; saveBest(best); }
      updateBar();
      overlay.show(`<div class="msg">¡Fin del juego!</div>
        <div class="sub">Puntuación: ${score}</div>
        <button class="primary">Volver a jugar</button>`).querySelector('button')
        .addEventListener('click', newGame);
    }

    function update(dt) {
      if (state !== 'playing') return;
      const speed = Math.hypot(vel.x, vel.y) || (55 + level * 4);

      ball.x += vel.x * dt;
      ball.y += vel.y * dt;

      if (ball.x < BALL_R) { ball.x = BALL_R; vel.x = Math.abs(vel.x); }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; vel.x = -Math.abs(vel.x); }
      if (ball.y < BALL_R) { ball.y = BALL_R; vel.y = Math.abs(vel.y); }

      if (ball.y > H + BALL_R) {
        lives--; updateBar();
        if (lives <= 0) { gameOver(); return; }
        resetBall();
        return;
      }

      if (ball.y > PADDLE_Y - BALL_R && ball.y < PADDLE_Y + PADDLE_H + BALL_R &&
          ball.x > paddleX - BALL_R && ball.x < paddleX + PADDLE_W + BALL_R && vel.y > 0) {
        ball.y = PADDLE_Y - BALL_R;
        const hit = clamp((ball.x - paddleX) / PADDLE_W, 0, 1);
        const a = (hit - 0.5) * Math.PI * 0.7;
        vel.x = speed * Math.sin(a);
        vel.y = -speed * Math.cos(a);
      }

      for (const b of bricks) {
        if (!b.alive) continue;
        if (circleRectHit(ball.x, ball.y, BALL_R, b.x, b.y, b.w, b.h)) {
          b.alive = false;
          score += b.points;
          beep(660, 0.05);
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          const dx = (ball.x - cx) / (b.w / 2);
          const dy = (ball.y - cy) / (b.h / 2);
          if (Math.abs(dx) > Math.abs(dy)) vel.x = (ball.x < cx ? -1 : 1) * Math.abs(vel.x);
          else vel.y = (ball.y < cy ? -1 : 1) * Math.abs(vel.y);
          updateBar();
          break;
        }
      }

      if (bricks.every(b => !b.alive)) {
        beep(880, 0.18, 'sine', 0.08);
        newLevel(level + 1);
      }
    }

    function draw(ctx, w, h) {
      const s = w / W;
      ctx.fillStyle = '#0c0c10';
      ctx.fillRect(0, 0, w, h);
      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
      }
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(paddleX * s, PADDLE_Y * s, PADDLE_W * s, PADDLE_H * s);
      ctx.fillStyle = '#f0f0f0';
      ctx.beginPath();
      ctx.arc(ball.x * s, ball.y * s, BALL_R * s, 0, Math.PI * 2);
      ctx.fill();
    }

    function pointerMove(e) {
      const t = e.touches ? e.touches[0] : e;
      const rect = cg.canvas.getBoundingClientRect();
      const px = (t.clientX - rect.left) / rect.width * W;
      paddleX = clamp(px - PADDLE_W / 2, 0, W - PADDLE_W);
    }
    function pointerDown(e) {
      pointerMove(e);
      if (state === 'ready') launch();
    }
    cg.canvas.addEventListener('touchstart', e => { e.preventDefault(); pointerDown(e); }, { passive: false });
    cg.canvas.addEventListener('touchmove',  e => { e.preventDefault(); pointerMove(e); }, { passive: false });
    cg.canvas.addEventListener('mousedown', pointerDown);
    cg.canvas.addEventListener('mousemove', e => { if (e.buttons) pointerMove(e); });

    function onKey(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); paddleX = clamp(paddleX - 4, 0, W - PADDLE_W); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); paddleX = clamp(paddleX + 4, 0, W - PADDLE_W); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (state === 'ready') launch(); }
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
