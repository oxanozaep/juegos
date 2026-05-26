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
import { onAuthUpdate, signInWithGoogle, signOutUser } from './db-sync.js';

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
    <div id="auth-profile" class="auth-profile-box"></div>
  `;
  app.appendChild(header);
  updateProfileUI();

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

let userProfileData = null;

onAuthUpdate((user) => {
  userProfileData = user;
  const h = location.hash || '#/';
  if (h === '#/' || h === '#') {
    updateProfileUI();
  }
});

function updateProfileUI() {
  const container = document.getElementById('auth-profile');
  if (!container) return;

  if (userProfileData) {
    container.innerHTML = `
      <div class="profile-logged">
        <img class="profile-avatar" src="${userProfileData.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" alt="Avatar">
        <div class="profile-info">
          <span class="profile-name">${userProfileData.displayName || 'Jugador'}</span>
          <button id="signout-btn" class="profile-btn-logout">Cerrar sesión</button>
        </div>
      </div>
    `;
    document.getElementById('signout-btn').addEventListener('click', () => {
      signOutUser();
    });
  } else {
    container.innerHTML = `
      <button id="signin-btn" class="profile-btn-login">
        <span class="btn-icon">🎮</span> Conectar
      </button>
    `;
    document.getElementById('signin-btn').addEventListener('click', async () => {
      const btn = document.getElementById('signin-btn');
      btn.disabled = true;
      btn.innerHTML = `Cargando...`;
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error("Error signing in:", err);
        updateProfileUI();
      }
    });
  }
}

window.addEventListener('hashchange', render);
render();
