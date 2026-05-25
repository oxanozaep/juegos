import { Game2048 } from './games/game2048.js';
import { Sudoku } from './games/sudoku.js';
import { Wordle } from './games/wordle.js';
import { Breakout } from './games/breakout.js';
import { Asteroids } from './games/asteroids.js';
import { SpaceInvaders } from './games/spaceinvaders.js';
import { Flappy } from './games/flappy.js';
import { Tetris } from './games/tetris.js';
import { Pacman } from './games/pacman.js';
import { Crossy } from './games/crossy.js';
import { SuperPang } from './games/superpang.js';

const games = [Game2048, Sudoku, Wordle, Breakout, Asteroids, SpaceInvaders, Flappy, Tetris, Pacman, Crossy, SuperPang];

const registry = Object.fromEntries(games.map(g => [g.id, g]));

const app = document.getElementById('app');
let cleanup = null;

function clearScreen() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch {}
  }
  cleanup = null;
  app.innerHTML = '';
}

function renderHome() {
  clearScreen();
  const header = document.createElement('div');
  header.className = 'home-header';
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 14px;">
      <img src="icon.svg" alt="Arcade Logo" style="width: 52px; height: 52px; border-radius: 12px; filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.45));">
      <div>
        <h1 style="margin: 0; font-size: 28px; letter-spacing: -0.5px;">Mis Juegos</h1>
        <div class="sub" style="color: var(--muted); font-size: 14px;">Elige uno para empezar</div>
      </div>
    </div>
  `;
  app.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'game-grid';
  for (const g of games) {
    const card = document.createElement('button');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="icon">${g.emoji}</div>
      <div class="name">${g.name}</div>
      <div class="desc">${g.description}</div>
    `;
    card.addEventListener('click', () => navigate('#/' + g.id));
    grid.appendChild(card);
  }
  app.appendChild(grid);
}

function renderGame(id) {
  const game = registry[id];
  if (!game) { navigate('#/'); return; }
  clearScreen();

  const shell = document.createElement('div');
  shell.className = 'game-shell';

  const top = document.createElement('div');
  top.className = 'game-topbar';
  const back = document.createElement('button');
  back.className = 'back-btn';
  back.innerHTML = '&larr; Volver';
  back.addEventListener('click', () => navigate('#/'));
  const title = document.createElement('h2');
  title.textContent = game.name;
  const spacer = document.createElement('span');
  spacer.style.width = '64px';
  top.appendChild(back);
  top.appendChild(title);
  top.appendChild(spacer);
  shell.appendChild(top);

  const container = document.createElement('div');
  shell.appendChild(container);
  app.appendChild(shell);

  cleanup = game.mount(container);
}

function navigate(hash) {
  if (location.hash === hash) { render(); return; }
  location.hash = hash;
}

function render() {
  const h = location.hash || '#/';
  if (h === '#/' || h === '#') return renderHome();
  const id = h.replace(/^#\//, '');
  renderGame(id);
}

window.addEventListener('hashchange', render);
render();
