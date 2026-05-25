import { mountCanvas, makeOverlay, makeStat, clamp, beep, circleRectHit } from './engine.js';

const BEST_KEY = 'games-hub.superpang.best';
const W = 160, H = 120; // 4:3 Aspect Ratio
const FLOOR_Y = H - 8;
const CEILING_Y = 6;
const GRAVITY = 75;

// Bubble size constants
// Size 4 (huge), 3 (large), 2 (medium), 1 (small)
const BUBBLE_CONFIGS = {
  4: { r: 7.5, bounceV: 96, pts: 100, color: ['#ec4899', '#f43f5e'] },
  3: { r: 5.5, bounceV: 82, pts: 150, color: ['#fb923c', '#f97316'] },
  2: { r: 3.8, bounceV: 68, pts: 200, color: ['#06b6d4', '#3b82f6'] },
  1: { r: 2.2, bounceV: 54, pts: 250, color: ['#10b981', '#22c55e'] }
};

export const SuperPang = {
  id: 'superpang',
  name: 'Super Pang',
  emoji: '🎈',
  description: 'Revienta las burbujas retro',

  mount(container) {
    const shell = document.createElement('div');
    shell.className = 'cg-shell';

    // Stats bar
    const bar = document.createElement('div');
    bar.className = 'cg-bar';
    const sScore = makeStat('Puntos', '0');
    const sLives = makeStat('Vidas', '3');
    const sBest  = makeStat('Récord', String(loadBest()));
    bar.appendChild(sScore.el); bar.appendChild(sLives.el); bar.appendChild(sBest.el);
    shell.appendChild(bar);

    // Canvas container
    const gameWrap = document.createElement('div');
    shell.appendChild(gameWrap);

    // Hint text
    const hint = document.createElement('div');
    hint.className = 'cg-hint';
    hint.textContent = '◀ ▶ Mover · ▲/Space Disparar · ¡Atento a los Power-ups!';
    shell.appendChild(hint);

    // Touch controls wrapper
    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'pang-controls';
    controlsWrap.innerHTML = `
      <div class="pang-dir-btns">
        <button class="pang-btn pang-left-btn" type="button">◀</button>
        <button class="pang-btn pang-right-btn" type="button">▶</button>
      </div>
      <button class="pang-btn pang-fire-btn" type="button">🔫 DISPARAR</button>
    `;
    shell.appendChild(controlsWrap);

    // Menu actions
    const actions = document.createElement('div');
    actions.className = 'cg-actions';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(newBtn);
    shell.appendChild(actions);

    container.appendChild(shell);

    // Game state variables
    let player, bubbles, shots, drops, platforms;
    let score, lives, level, state;
    let timeFreezeT, flashT, fireCooldown;
    let best = loadBest();
    
    // Input state
    let keys = { left: false, right: false, fire: false };
    let touchMoveLeft = false;
    let touchMoveRight = false;
    let touchFire = false;

    const cg = mountCanvas(gameWrap, { aspectRatio: '4 / 3', update, draw });
    const overlay = makeOverlay(cg.wrap);

    // Level Designs
    function initLevel(l) {
      level = l;
      bubbles = [];
      shots = [];
      drops = [];
      platforms = [];
      timeFreezeT = 0;
      flashT = 0;
      fireCooldown = 0;

      // Base boundaries are floor at FLOOR_Y, ceiling at CEILING_Y, walls at 0 & W

      if (l === 1) {
        // Level 1: One huge bubble in the center bouncing high
        spawnBubble(W / 2, 35, 4, 15);
      } else if (l === 2) {
        // Level 2: Two large bubbles bouncing in opposite directions
        spawnBubble(W * 0.3, 30, 3, -15);
        spawnBubble(W * 0.7, 30, 3, 15);
      } else if (l === 3) {
        // Level 3: Four medium bubbles, fast-paced action
        spawnBubble(W * 0.2, 40, 2, -18);
        spawnBubble(W * 0.4, 30, 2, -12);
        spawnBubble(W * 0.6, 30, 2, 12);
        spawnBubble(W * 0.8, 40, 2, 18);
      } else if (l === 4) {
        // Level 4: Platforms! Suspended blocks in the middle.
        // Bubbles bounce off platforms and cables stick to them.
        platforms.push({ x: 30, y: 65, w: 40, h: 5 });
        platforms.push({ x: 90, y: 65, w: 40, h: 5 });
        
        spawnBubble(W * 0.25, 30, 3, 16);
        spawnBubble(W * 0.75, 30, 3, -16);
        spawnBubble(W / 2, 20, 2, 12);
      } else {
        // Level 5+: Extreme Chaos with vertical barriers & big bubbles!
        platforms.push({ x: 65, y: 45, w: 30, h: 5 });
        platforms.push({ x: 20, y: 75, w: 35, h: 5 });
        platforms.push({ x: 105, y: 75, w: 35, h: 5 });

        spawnBubble(W * 0.15, 30, 4, 18);
        spawnBubble(W * 0.85, 30, 4, -18);
        spawnBubble(W / 2, 20, 2, 12);
      }

      state = 'playing';
      overlay.hide();
      updateBar();
    }

    function spawnBubble(x, y, size, vx, vy = -10) {
      const cfg = BUBBLE_CONFIGS[size];
      bubbles.push({
        x, y,
        vx, vy,
        size,
        r: cfg.r,
        bounceV: cfg.bounceV,
        color: cfg.color,
        pts: cfg.pts
      });
    }

    function newGame() {
      score = 0;
      lives = 3;
      player = {
        x: W / 2 - 5,
        w: 9,
        h: 13,
        speed: 72,
        weapon: 'cable', // 'cable', 'double', 'gancho', 'pistol'
        shield: false,
        walkCycle: 0
      };
      initLevel(1);
    }

    function updateBar() {
      sScore.set(String(score));
      sLives.set(String(lives));
      sBest.set(String(best));
    }

    function triggerDynamite() {
      flashT = 0.25;
      beep(100, 0.3, 'sawtooth', 0.15);
      const nextBubbles = [];
      for (const b of bubbles) {
        if (b.size > 1) {
          // split
          score += b.pts;
          nextBubbles.push(
            { ...b, size: b.size - 1, r: BUBBLE_CONFIGS[b.size - 1].r, bounceV: BUBBLE_CONFIGS[b.size - 1].bounceV, color: BUBBLE_CONFIGS[b.size - 1].color, pts: BUBBLE_CONFIGS[b.size - 1].pts, vx: -20, vy: -30 },
            { ...b, size: b.size - 1, r: BUBBLE_CONFIGS[b.size - 1].r, bounceV: BUBBLE_CONFIGS[b.size - 1].bounceV, color: BUBBLE_CONFIGS[b.size - 1].color, pts: BUBBLE_CONFIGS[b.size - 1].pts, vx: 20, vy: -30 }
          );
        } else {
          // size 1 gets popped
          score += b.pts;
        }
      }
      bubbles = nextBubbles;
      updateBar();
    }

    function spawnDrop(x, y) {
      if (Math.random() > 0.22) return; // 22% chance of dropping powerups
      const types = ['double', 'gancho', 'pistol', 'shield', 'time_freeze', 'dynamite'];
      // Weigh some more common than others
      const weights = [0.2, 0.2, 0.2, 0.15, 0.15, 0.1]; // totals 1.0
      let r = Math.random();
      let type = types[0];
      let sum = 0;
      for (let i = 0; i < types.length; i++) {
        sum += weights[i];
        if (r <= sum) { type = types[i]; break; }
      }
      drops.push({ x, y, type, r: 4.5, vy: 25 });
    }

    function popBubble(bIdx, shotIdx) {
      const b = bubbles[bIdx];
      bubbles.splice(bIdx, 1);
      score += b.pts;
      
      beep(550, 0.08, 'sine', 0.08);

      if (shotIdx !== null && shots[shotIdx]) {
        if (shots[shotIdx].type === 'laser') {
          shots.splice(shotIdx, 1);
        }
      }

      if (b.size > 1) {
        const nextSize = b.size - 1;
        // spawn two smaller bubbles
        spawnBubble(b.x - 2, b.y, nextSize, -22, -35);
        spawnBubble(b.x + 2, b.y, nextSize, 22, -35);
      }
      
      spawnDrop(b.x, b.y);
      updateBar();
    }

    function fireWeapon() {
      if (state !== 'playing' || fireCooldown > 0) return;

      const activeCables = shots.filter(s => s.type === 'cable' || s.type === 'gancho');

      if (player.weapon === 'cable') {
        if (activeCables.length === 0) {
          shots.push({ x: player.x + player.w / 2, yStart: FLOOR_Y, yTip: FLOOR_Y, speed: 175, type: 'cable', state: 'rising', timer: 0 });
          beep(750, 0.06, 'sawtooth', 0.04);
          fireCooldown = 0.25;
        }
      } else if (player.weapon === 'double') {
        if (activeCables.length < 2) {
          shots.push({ x: player.x + player.w / 2, yStart: FLOOR_Y, yTip: FLOOR_Y, speed: 175, type: 'cable', state: 'rising', timer: 0 });
          beep(750, 0.06, 'sawtooth', 0.04);
          fireCooldown = 0.22;
        }
      } else if (player.weapon === 'gancho') {
        if (activeCables.length === 0) {
          shots.push({ x: player.x + player.w / 2, yStart: FLOOR_Y, yTip: FLOOR_Y, speed: 160, type: 'gancho', state: 'rising', timer: 0 });
          beep(680, 0.08, 'triangle', 0.05);
          fireCooldown = 0.3;
        }
      } else if (player.weapon === 'pistol') {
        const laserShots = shots.filter(s => s.type === 'laser');
        if (laserShots.length < 3) {
          shots.push({ x: player.x + player.w / 2, y: FLOOR_Y - player.h, vy: -200, type: 'laser', w: 1.5, h: 4 });
          beep(900, 0.04, 'square', 0.03);
          fireCooldown = 0.12;
        }
      }
    }

    function playerHit() {
      if (player.shield) {
        player.shield = false;
        beep(250, 0.25, 'sine', 0.08);
        // transient invincibility - remove hit bubbles nearby to give breathing space
        bubbles = bubbles.filter(b => {
          const dist = Math.hypot(b.x - (player.x + player.w / 2), b.y - (player.y + player.h / 2));
          if (dist < b.r + 20) {
            score += b.pts;
            return false;
          }
          return true;
        });
        updateBar();
        return;
      }

      lives--;
      updateBar();
      beep(150, 0.3, 'sawtooth', 0.1);

      if (lives <= 0) {
        state = 'over';
        if (score > best) { best = score; saveBest(best); updateBar(); }
        overlay.show(`
          <div class="msg">¡Fin de la partida!</div>
          <div class="sub">Puntos: ${score} · Nivel: ${level}</div>
          <button class="primary">Jugar de nuevo</button>
        `).querySelector('button').addEventListener('click', newGame);
      } else {
        // restart level
        initLevel(level);
      }
    }

    function levelClear() {
      state = 'clear';
      beep(880, 0.15, 'sine', 0.06);
      setTimeout(() => {
        beep(1100, 0.25, 'sine', 0.08);
        initLevel(level + 1);
      }, 1000);
    }

    function update(dt) {
      if (state !== 'playing') return;

      // Timers decrement
      if (timeFreezeT > 0) timeFreezeT = Math.max(0, timeFreezeT - dt);
      if (flashT > 0) flashT = Math.max(0, flashT - dt);
      if (fireCooldown > 0) fireCooldown = Math.max(0, fireCooldown - dt);

      // 1. Move Player
      let dir = 0;
      if (keys.left || touchMoveLeft) dir = -1;
      else if (keys.right || touchMoveRight) dir = 1;

      if (dir !== 0) {
        player.x = clamp(player.x + dir * player.speed * dt, 4, W - player.w - 4);
        player.walkCycle += dt * 15;
      } else {
        player.walkCycle = 0;
      }
      player.y = FLOOR_Y - player.h;

      if (keys.fire || touchFire) fireWeapon();

      // 2. Update Weapons / Shots
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        if (s.type === 'laser') {
          s.y += s.vy * dt;
          
          // collision with platform
          let hitPlat = false;
          for (const plat of platforms) {
            if (s.x >= plat.x && s.x <= plat.x + plat.w && s.y <= plat.y + plat.h && s.y >= plat.y) {
              hitPlat = true;
              break;
            }
          }
          
          if (s.y < CEILING_Y || hitPlat) {
            shots.splice(i, 1);
          }
        } else {
          // cable or gancho
          if (s.state === 'rising') {
            s.yTip -= s.speed * dt;
            
            // Check collision with platforms or ceiling
            let stopY = CEILING_Y;
            for (const plat of platforms) {
              if (s.x >= plat.x && s.x <= plat.x + plat.w) {
                if (s.yTip <= plat.y + plat.h && s.yTip >= plat.y) {
                  stopY = plat.y + plat.h;
                  break;
                }
              }
            }

            if (s.yTip <= stopY) {
              s.yTip = stopY;
              s.state = 'stuck';
              s.timer = s.type === 'gancho' ? 3.0 : 1.2;
            }
          } else if (s.state === 'stuck') {
            s.timer -= dt;
            if (s.timer <= 0) {
              shots.splice(i, 1);
            }
          }
        }
      }

      // 3. Update Bubbles
      const isFrozen = timeFreezeT > 0;
      const bubbleSpeedScale = isFrozen ? 0.08 : 1.0;

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];

        // Apply physics
        if (!isFrozen) b.vy += GRAVITY * dt;
        b.x += b.vx * dt * bubbleSpeedScale;
        b.y += b.vy * dt * bubbleSpeedScale;

        // Wall collisions
        if (b.x - b.r < 4) { b.x = 4 + b.r; b.vx = Math.abs(b.vx); }
        if (b.x + b.r > W - 4) { b.x = W - 4 - b.r; b.vx = -Math.abs(b.vx); }

        // Floor collision
        if (b.y + b.r > FLOOR_Y) {
          b.y = FLOOR_Y - b.r;
          b.vy = -b.bounceV;
          if (!isFrozen) beep(160, 0.04, 'triangle', 0.02);
        }

        // Ceiling collision
        if (b.y - b.r < CEILING_Y) {
          b.y = CEILING_Y + b.r;
          b.vy = Math.abs(b.vy);
        }

        // Platform collisions
        for (const plat of platforms) {
          if (circleRectHit(b.x, b.y, b.r, plat.x, plat.y, plat.w, plat.h)) {
            const cx = clamp(b.x, plat.x, plat.x + plat.w);
            const cy = clamp(b.y, plat.y, plat.y + plat.h);
            const dx = b.x - cx;
            const dy = b.y - cy;

            if (Math.abs(dx) > Math.abs(dy)) {
              if (dx > 0) { b.x = plat.x + plat.w + b.r; b.vx = Math.abs(b.vx); }
              else { b.x = plat.x - b.r; b.vx = -Math.abs(b.vx); }
            } else {
              if (dy > 0) { b.y = plat.y + plat.h + b.r; b.vy = Math.abs(b.vy); }
              else { b.y = plat.y - b.r; b.vy = -b.bounceV; if (!isFrozen) beep(160, 0.04, 'triangle', 0.02); }
            }
          }
        }

        // Shot collisions vs bubbles
        let popped = false;
        for (let j = shots.length - 1; j >= 0; j--) {
          const s = shots[j];
          if (s.type === 'laser') {
            const dist = Math.hypot(b.x - s.x, b.y - s.y);
            if (dist < b.r + 1.5) {
              popBubble(i, j);
              popped = true;
              break;
            }
          } else {
            // Cable / Gancho line vs bubble hit test
            const nearX = Math.abs(b.x - s.x) <= b.r + 0.8;
            const nearY = b.y >= s.yTip - b.r && b.y <= s.yStart + b.r;
            if (nearX && nearY) {
              popBubble(i, null);
              popped = true;
              break;
            }
          }
        }

        if (popped) continue;

        // Player collision vs bubble
        const pCx = clamp(b.x, player.x, player.x + player.w);
        const pCy = clamp(b.y, player.y, player.y + player.h);
        const pDx = b.x - pCx;
        const pDy = b.y - pCy;
        const distSq = pDx * pDx + pDy * pDy;

        if (distSq < b.r * b.r) {
          playerHit();
          return;
        }
      }

      // 4. Update Drops / Power-ups
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.vy * dt;
        
        // ground hit
        if (d.y + d.r > FLOOR_Y) {
          d.y = FLOOR_Y - d.r;
          d.vy = 0;
        }

        // hit player
        const pCx = clamp(d.x, player.x, player.x + player.w);
        const pCy = clamp(d.y, player.y, player.y + player.h);
        const dist = Math.hypot(d.x - pCx, d.y - pCy);
        
        if (dist < d.r) {
          // Trigger powerup
          beep(880, 0.12, 'sine', 0.08);
          if (d.type === 'double' || d.type === 'gancho' || d.type === 'pistol') {
            player.weapon = d.type;
          } else if (d.type === 'shield') {
            player.shield = true;
          } else if (d.type === 'time_freeze') {
            timeFreezeT = 4.0;
          } else if (d.type === 'dynamite') {
            triggerDynamite();
          }
          drops.splice(i, 1);
          continue;
        }

        // filter offscreen
        if (d.y > H + 10) {
          drops.splice(i, 1);
        }
      }

      // Check level clear
      if (bubbles.length === 0 && state === 'playing') {
        levelClear();
      }
    }

    function draw(ctx, w, h) {
      const s = w / W;

      // 1. Draw Cyberpunk Grid Background
      if (flashT > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        return;
      }

      ctx.fillStyle = timeFreezeT > 0 ? '#021e33' : '#070714';
      ctx.fillRect(0, 0, w, h);

      // Draw Grid Lines (cyber retro styling)
      ctx.strokeStyle = timeFreezeT > 0 ? 'rgba(6, 182, 212, 0.08)' : 'rgba(236, 72, 153, 0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x * s, 0);
        ctx.lineTo(x * s, h);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y * s);
        ctx.lineTo(w, y * s);
        ctx.stroke();
      }

      // Draw Horizon light
      const grad = ctx.createLinearGradient(0, FLOOR_Y * s, 0, h);
      grad.addColorStop(0, timeFreezeT > 0 ? 'rgba(6,182,212,0.3)' : 'rgba(236,72,153,0.25)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, FLOOR_Y * s, w, h - FLOOR_Y * s);

      // Boundaries (Side walls)
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, 4 * s, h);
      ctx.fillRect((W - 4) * s, 0, 4 * s, h);
      // Floor and Ceiling rails
      ctx.fillRect(0, FLOOR_Y * s, w, 2 * s);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0, 0, w, CEILING_Y * s);

      // Neon glowing lines for bounds
      ctx.strokeStyle = timeFreezeT > 0 ? '#06b6d4' : '#ec4899';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(4 * s, CEILING_Y * s);
      ctx.lineTo(4 * s, FLOOR_Y * s);
      ctx.lineTo((W - 4) * s, FLOOR_Y * s);
      ctx.lineTo((W - 4) * s, CEILING_Y * s);
      ctx.stroke();

      // Ceiling glowing rail
      ctx.strokeStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(0, CEILING_Y * s);
      ctx.lineTo(w, CEILING_Y * s);
      ctx.stroke();

      // 2. Draw Platforms
      ctx.fillStyle = '#312e81';
      ctx.strokeStyle = '#4338ca';
      ctx.lineWidth = 1 * s;
      for (const plat of platforms) {
        ctx.fillRect(plat.x * s, plat.y * s, plat.w * s, plat.h * s);
        ctx.strokeRect(plat.x * s, plat.y * s, plat.w * s, plat.h * s);
        // Draw steel plate rivets on platforms
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect((plat.x + 2) * s, (plat.y + plat.h/2 - 0.5) * s, 1 * s, 1 * s);
        ctx.fillRect((plat.x + plat.w - 3) * s, (plat.y + plat.h/2 - 0.5) * s, 1 * s, 1 * s);
        ctx.fillStyle = '#312e81';
      }

      // 3. Draw Shots (Harpoons or Lasers)
      for (const sShot of shots) {
        if (sShot.type === 'laser') {
          ctx.fillStyle = '#facc15';
          ctx.fillRect((sShot.x - sShot.w / 2) * s, sShot.y * s, sShot.w * s, sShot.h * s);
          // light glow
          ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
          ctx.fillRect((sShot.x - sShot.w * 1.5) * s, (sShot.y - 1) * s, sShot.w * 3 * s, (sShot.h + 2) * s);
        } else {
          // Cable/Gancho: Draw anchor string (glowing neon chain link or zigzag)
          ctx.strokeStyle = sShot.type === 'gancho' ? '#10b981' : '#fbbf24';
          ctx.lineWidth = 1.5 * s;
          
          ctx.beginPath();
          let cy = sShot.yStart;
          ctx.moveTo(sShot.x * s, cy * s);
          // Draw zigzag harpoon wire
          while (cy > sShot.yTip) {
            cy -= 4;
            if (cy < sShot.yTip) cy = sShot.yTip;
            const ox = (cy % 8 === 0) ? -1 : 1;
            ctx.lineTo((sShot.x + ox) * s, cy * s);
          }
          ctx.stroke();

          // Draw the arrowhead (tip)
          ctx.fillStyle = sShot.type === 'gancho' ? '#34d399' : '#fef08a';
          ctx.beginPath();
          ctx.moveTo(sShot.x * s, sShot.yTip * s);
          ctx.lineTo((sShot.x - 3) * s, (sShot.yTip + 4) * s);
          ctx.lineTo((sShot.x + 3) * s, (sShot.yTip + 4) * s);
          ctx.closePath();
          ctx.fill();
        }
      }

      // 4. Draw Drops / Power-ups
      for (const d of drops) {
        ctx.save();
        ctx.translate(d.x * s, d.y * s);
        // glowing background circle
        const pulsate = 1.2 + Math.sin(performance.now() / 100) * 0.15;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath(); ctx.arc(0, 0, d.r * pulsate * s, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1 * s;
        ctx.strokeRect(-d.r * s, -d.r * s, d.r * 2 * s, d.r * 2 * s);

        // emoji text representation inside
        ctx.font = `${Math.floor(d.r * 1.5 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let emoji = '⚡';
        if (d.type === 'double') emoji = '⚡';
        else if (d.type === 'gancho') emoji = '⚓';
        else if (d.type === 'pistol') emoji = '🔫';
        else if (d.type === 'shield') emoji = '🛡️';
        else if (d.type === 'time_freeze') emoji = '⏳';
        else if (d.type === 'dynamite') emoji = '🧨';
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
      }

      // 5. Draw Bubbles with Neon Gradient Gloss
      for (const b of bubbles) {
        ctx.save();
        ctx.translate(b.x * s, b.y * s);

        const radGrad = ctx.createRadialGradient(
          -b.r * 0.3 * s, -b.r * 0.3 * s, b.r * 0.1 * s,
          0, 0, b.r * s
        );
        if (timeFreezeT > 0) {
          // semi-translucent frozen ice bubbles
          radGrad.addColorStop(0, '#ffffff');
          radGrad.addColorStop(0.3, 'rgba(6, 182, 212, 0.45)');
          radGrad.addColorStop(1, 'rgba(30, 41, 59, 0.7)');
        } else {
          radGrad.addColorStop(0, '#ffffff');
          radGrad.addColorStop(0.2, b.color[0]);
          radGrad.addColorStop(1, b.color[1]);
        }

        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(0, 0, b.r * s, 0, Math.PI * 2);
        ctx.fill();

        // bubble gloss reflection line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.arc(-b.r * 0.2 * s, -b.r * 0.2 * s, b.r * 0.6 * s, Math.PI * 1.0, Math.PI * 1.5);
        ctx.stroke();

        ctx.restore();
      }

      // 6. Draw Player (Cute little Arcade hero with walking legs animation)
      ctx.save();
      ctx.translate(player.x * s, player.y * s);

      // Shield glow
      if (player.shield) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc((player.w / 2) * s, (player.h / 2) * s, Math.max(player.w, player.h) * 0.8 * s, 0, Math.PI * 2);
        ctx.stroke();
        // fill overlay
        ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
        ctx.fill();
      }

      // Draw walking legs
      ctx.fillStyle = '#ef4444'; // Red pants
      const leftLegOffset = Math.sin(player.walkCycle) * 2.5 * s;
      const rightLegOffset = -Math.sin(player.walkCycle) * 2.5 * s;
      ctx.fillRect(1 * s, (player.h - 3) * s, 2 * s, 3 * s + leftLegOffset);
      ctx.fillRect((player.w - 3) * s, (player.h - 3) * s, 2 * s, 3 * s + rightLegOffset);

      // Body (blue shirt)
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0 * s, 4 * s, player.w * s, 7 * s);

      // Arms holding gun
      ctx.fillStyle = '#f59e0b'; // Skin
      ctx.fillRect(-1.5 * s, 5 * s, 2 * s, 2.5 * s); // left hand
      ctx.fillStyle = '#9ca3af'; // Gun
      ctx.fillRect((player.w - 1) * s, 4 * s, 4 * s, 1.8 * s); // gun barrel
      ctx.fillStyle = '#4b5563';
      ctx.fillRect((player.w - 0.5) * s, 5 * s, 1 * s, 2 * s); // grip

      // Head / Helmet
      ctx.fillStyle = '#ffffff'; // White helmet
      ctx.beginPath();
      ctx.arc((player.w / 2) * s, 2 * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();
      // Visor
      ctx.fillStyle = '#1e293b';
      ctx.fillRect((player.w / 2 - 1) * s, 0.5 * s, 2.5 * s, 1.8 * s);

      ctx.restore();

      // Show freeze overlay banner
      if (timeFreezeT > 0) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#06b6d4';
        ctx.font = `italic bold ${Math.floor(7 * s)}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`⏳ TIEMPO CONGELADO: ${timeFreezeT.toFixed(1)}s`, w - 10 * s, 16 * s);
      }
    }

    // Touch control button bindings
    const leftBtn = controlsWrap.querySelector('.pang-left-btn');
    const rightBtn = controlsWrap.querySelector('.pang-right-btn');
    const fireBtn = controlsWrap.querySelector('.pang-fire-btn');

    function bindTouch(btn, onDown, onUp) {
      btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('active'); onDown(); });
      btn.addEventListener('pointerup', e => { e.preventDefault(); btn.classList.remove('active'); onUp(); });
      btn.addEventListener('pointerleave', e => { e.preventDefault(); btn.classList.remove('active'); onUp(); });
      btn.addEventListener('touchend', e => { e.preventDefault(); btn.classList.remove('active'); onUp(); });
    }

    bindTouch(leftBtn, () => { touchMoveLeft = true; }, () => { touchMoveLeft = false; });
    bindTouch(rightBtn, () => { touchMoveRight = true; }, () => { touchMoveRight = false; });
    bindTouch(fireBtn, () => { touchFire = true; }, () => { touchFire = false; });

    // Keyboard bindings
    function onKeyDown(e) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
      else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { keys.fire = true; e.preventDefault(); }
    }
    function onKeyUp(e) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
      else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.fire = false;
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
