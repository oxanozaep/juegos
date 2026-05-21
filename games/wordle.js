import { VALID_WORDS } from './wordle-dictionary.js';

const STATE_KEY = 'games-hub.wordle.state';
const STATS_KEY = 'games-hub.wordle.stats';
const LEN = 5;
const MAX_GUESSES = 6;

const ANSWERS = [
  'ABETO','ABRIL','ABRIR','ABUSO','ACASO','ACERO','ACOSO','ACTOR','ACTOS','AGUDO',
  'AGUJA','AHORA','ALDEA','ALETA','ALGAS','ALIAS','ALMAS','ALTAR','ALTOS','AMIGA',
  'AMIGO','ANCHO','ANDAR','ANEXO','ANGEL','ANIMO','ANTES','ANUAL','APOYO','ARBOL',
  'ARDER','ARENA','ARMAS','AROMA','ARROZ','ARTES','ASADO','ASILO','ASTRO','ATAJO',
  'ATRAS','AVENA','AVION','AVISO','AZADA','BAILE','BAJAR','BAJOS','BALON','BANCA',
  'BANDA','BARCO','BARRA','BASES','BATIR','BEBER','BELLA','BELLO','BESOS','BICHO',
  'BOCAS','BODAS','BOLAS','BOLSO','BOMBA','BOTAS','BRAVO','BREVE','BRISA','BROMA',
  'BRUMA','BRUTO','BUCEO','BUENA','BUENO','BUSCA','BUZON','CABRA','CACAO','CAIDA',
  'CAJAS','CALAR','CALDO','CALLE','CALMA','CALOR','CAMAS','CAMPO','CANAL','CANTO',
  'CAPAZ','CARGA','CARGO','CARNE','CARRO','CARTA','CASAS','CASCO','CAUSA','CAZAR',
  'CEBRA','CEDER','CELOS','CERCA','CERDO','CESTA','CHICA','CHICO','CHINO','CHIVO',
  'CICLO','CIEGO','CIELO','CINCO','CINTA','CIRCO','CIVIL','CLARO','CLAVE','CLAVO',
  'CLIMA','COBRA','COBRE','COCER','COCHE','COJIN','COLAR','COLOR','COMER','COMUN',
  'CORAL','CORTE','CORTO','COSAS','COSER','COSTO','CREAR','CREMA','CRUCE','CRUDO',
  'CRUEL','CULPA','CULTO','CURAR','CURSO','DEBER','DECIR','DEDOS','DEJAR','DELTA',
  'DENSO','DESDE','DICHA','DICHO','DIETA','DIOSA','DISCO','DOBLE','DOLAR','DOLOR',
  'DOMAR','DRAMA','DUCHA','DUDAR','DUELO','DUEÑO','DULCE','DUNAS','DURAR','DUROS',
  'ECHAR','ENERO','ENTRE','ERIZO','ERRAR','ETAPA','EXITO','FACIL','FALDA','FALSO',
  'FAROS','FAUNA','FAVOR','FECHA','FELIZ','FERIA','FEROZ','FIBRA','FINAL','FIRMA',
  'FIRME','FLOJO','FLORA','FLOTA','FOCAS','FONDO','FORMA','FOTOS','FRENO','FRESA',
  'FRITO','FRUTA','FRUTO','FUEGO','FUERA','FUMAR','FURIA','GAFAS','GANAR','GATOS',
  'GENIO','GENTE','GIRAR','GLOBO','GOLPE','GORDO','GOTAS','GRADO','GRAMO','GRASA',
  'GRAVE','GRIPE','GRITO','GRUPO','GUAPA','GUAPO','GUION','GUSTO','HACER','HACIA',
  'HASTA','HECHO','HEROE','HIELO','HIENA','HIJOS','HILAR','HOGAR','HOJAS','HORAS',
  'HOTEL','HUECO','HUESO','HUMOR','IDEAL','IDEAS','IDOLO','IGUAL','INDIO','ISLAS',
  'JABON','JAULA','JOVEN','JOYAS','JUEGO','JUGAR','JUNIO','JUNTA','JUNTO','JURAR',
  'JUSTO','LABIO','LAGOS','LANZA','LAPIZ','LARGO','LATIR','LAVAR','LAZOS','LECHO',
  'LEGAL','LEJOS','LENTO','LETRA','LEYES','LIBRA','LIBRE','LIBRO','LICOR','LIDER',
  'LIMON','LISTA','LISTO','LITRO','LLAMA','LLAVE','LLEGA','LLORA','LOGRO','LUCES',
  'LUCHA','LUEGO','LUNES','MACHO','MADRE','MAFIA','MAGIA','MAGOS','MANGO','MANOS',
  'MANTA','MARES','MARCO','MARZO','MAYOR','MEDIA','MEDIO','MEJOR','MELON','MENOR',
  'MENOS','MENTE','MESAS','METAL','METER','METRO','MIEDO','MILES','MIRAR','MITAD',
  'MITOS','MONJA','MORIR','MOSCA','MOTOR','MOTOS','MOVER','MUDAR','MUELA','MULTA',
  'MUNDO','MURAL','MUSEO','NACER','NADAR','NARIZ','NAVES','NEGRO','NEGRA','NEVAR',
  'NIDOS','NIETO','NIÑOS','NIVEL','NOBLE','NOCHE','NORMA','NORTE','NOTAS','NOVIA',
  'NOVIO','NUBES','NUDOS','NUEVA','NUEVE','NUEVO','NUNCA','OASIS','OBRAS','ODIAR',
  'OESTE','OLIVA','OLIVO','OPACO','OPTAR','OVEJA','PACTO','PADRE','PALMA','PALOS',
  'PAPEL','PARES','PARTE','PASAR','PASTA','PATIO','PAUSA','PECHO','PEDIR','PEGAR',
  'PEINE','PELAR','PELEA','PELOS','PERLA','PERRO','PESCA','PIANO','PICAR','PIEZA',
  'PINOS','PISAR','PISTA','PIZZA','PLACA','PLANO','PLATA','PLATO','PLAYA','PLAZA',
  'PLAZO','PLENO','PLOMO','PLUMA','POBRE','PODER','POETA','POLAR','POLLO','PONER',
  'POTRO','PRADO','PRESA','PRESO','PRIMO','PRISA','PUEDE','PUROS','QUEJA','QUESO',
  'QUIEN','RABIA','RADIO','RAMOS','RANAS','RAROS','RASGO','RATAS','RATON','RAYAS',
  'RAYOS','RAZON','RECTO','REDES','REGLA','REINA','REINO','RELOJ','REMAR','RENTA',
  'REZAR','RIEGO','RIGOR','RITMO','RITOS','RIVAL','ROBAR','ROBLE','ROCAS','RODEO',
  'ROPAS','ROSAS','RUBIA','RUBIO','RUEDA','RUGIR','RUIDO','RUINA','RUMOR','RUTAS',
  'SABER','SABLE','SABOR','SACAR','SALAS','SALDO','SALON','SALSA','SALTO','SALUD',
  'SALVO','SANTO','SAUCE','SECAR','SECOS','SEDAS','SEGUN','SELLO','SEÑAL','SEÑOR',
  'SERIE','SERIO','SETAS','SIETE','SIGLO','SIGNO','SILLA','SIMIO','SOBRE','SOCIO',
  'SOLES','SOMOS','SONAR','SOPLO','SORDO','SUAVE','SUBIR','SUCIO','SUEÑO','SUELO',
  'SUMAR','SUPER','TABLA','TACOS','TALAR','TALLA','TANTO','TAPAR','TAREA','TARTA',
  'TECHO','TECLA','TEJAS','TEJER','TELAS','TEMER','TENIS','TENSO','TERMO','TIBIO',
  'TIENE','TIESO','TIGRE','TIMON','TINTA','TINTO','TIPOS','TIRAR','TIROS','TITAN',
  'TOCAR','TODOS','TOMAR','TONOS','TONTO','TOPOS','TOQUE','TORTA','TOTAL','TRAGO',
  'TRAJE','TRAMA','TRAMO','TRAPO','TRIBU','TRIGO','TROZO','TUBOS','TUMBA','TURBO',
  'TURNO','UNION','VACAS','VAGOS','VAGON','VALLA','VALOR','VAMOS','VASOS','VECES',
  'VEJEZ','VELAR','VELAS','VELOZ','VENAS','VENIR','VERDE','VERSO','VIAJE','VICIO',
  'VIDAS','VIDEO','VIEJA','VIEJO','VIENE','VIGAS','VINOS','VIRAR','VIRUS','VISTA',
  'VISTO','VIUDA','VIUDO','VIVIR','VOCAL','VOLAR','VOTAR','VOTOS','VUELO','YEMAS',
  'ZARZA','ZONAS','ZUMOS','ZURDO'
];

const VALID_SET = new Set();
for (const w of VALID_WORDS) VALID_SET.add(w);
for (const w of ANSWERS) VALID_SET.add(w);

function normalize(s) {
  return s.toUpperCase()
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I')
    .replace(/Ó/g, 'O').replace(/Ú/g, 'U').replace(/Ü/g, 'U');
}

function evaluate(guess, answer) {
  const g = [...guess];
  const a = [...answer];
  const result = Array(LEN).fill('gray');
  for (let i = 0; i < LEN; i++) {
    if (g[i] === a[i]) { result[i] = 'green'; a[i] = null; }
  }
  for (let i = 0; i < LEN; i++) {
    if (result[i] === 'green') continue;
    const idx = a.indexOf(g[i]);
    if (idx >= 0) { result[i] = 'yellow'; a[idx] = null; }
  }
  return result;
}

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    return {
      played: s.played || 0,
      wins: s.wins || 0,
      streak: s.streak || 0,
      maxStreak: s.maxStreak || 0,
      dist: Array.isArray(s.dist) && s.dist.length === MAX_GUESSES ? s.dist : Array(MAX_GUESSES).fill(0)
    };
  } catch {
    return { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: Array(MAX_GUESSES).fill(0) };
  }
}
function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {} }
function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; } }
function saveState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} }
function clearStoredState() { try { localStorage.removeItem(STATE_KEY); } catch {} }

function pickWord() {
  return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
}

const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L','Ñ'],
  ['NUEVA','Z','X','C','V','B','N','M','BACK']
];

export const Wordle = {
  id: 'wordle',
  name: 'Wordle',
  emoji: '🟩',
  description: 'Adivina la palabra de 5 letras',

  mount(container) {
    let secret = null;
    let guesses = [];  // { word, evals }
    let current = '';
    let finished = null; // 'win' | 'lose' | null
    let kbState = {};
    let countedThisGame = false;
    let stats = loadStats();

    const root = document.createElement('div');
    root.className = 'wordle';

    const statsEl = document.createElement('div');
    statsEl.className = 'wordle-stats';
    root.appendChild(statsEl);

    const banner = document.createElement('div');
    root.appendChild(banner);

    const gridEl = document.createElement('div');
    gridEl.className = 'wordle-grid';
    root.appendChild(gridEl);

    const kb = document.createElement('div');
    kb.className = 'wordle-keyboard';
    const keyButtons = {};
    for (const row of KB_ROWS) {
      const r = document.createElement('div');
      r.className = 'wordle-kb-row';
      for (const k of row) {
        const b = document.createElement('button');
        b.className = 'wordle-key' + ((k === 'NUEVA' || k === 'BACK') ? ' wide' : '');
        b.textContent = k === 'BACK' ? '⌫' : (k === 'NUEVA' ? 'Nueva' : k);
        b.addEventListener('click', () => handleKey(k));
        r.appendChild(b);
        if (k.length === 1) keyButtons[k] = b;
      }
      kb.appendChild(r);
    }
    root.appendChild(kb);

    const actions = document.createElement('div');
    actions.className = 'wordle-actions';
    const enterBtn = document.createElement('button');
    enterBtn.className = 'primary';
    enterBtn.textContent = 'Enter';
    enterBtn.addEventListener('click', () => handleKey('ENTER'));
    actions.appendChild(enterBtn);
    root.appendChild(actions);

    container.appendChild(root);

    function renderStats() {
      const pct = stats.played > 0 ? Math.round(100 * stats.wins / stats.played) : 0;
      statsEl.innerHTML =
        `<div>Jugadas <span class="stat-val">${stats.played}</span></div>` +
        `<div>Victorias <span class="stat-val">${pct}%</span></div>` +
        `<div>Racha <span class="stat-val">${stats.streak}</span></div>` +
        `<div>Máxima <span class="stat-val">${stats.maxStreak}</span></div>`;
    }

    function renderGrid(shakeRow = -1) {
      gridEl.innerHTML = '';
      for (let row = 0; row < MAX_GUESSES; row++) {
        const r = document.createElement('div');
        r.className = 'wordle-row';
        const guess = guesses[row];
        const isCurrentRow = !finished && row === guesses.length;
        for (let col = 0; col < LEN; col++) {
          const c = document.createElement('div');
          c.className = 'wordle-cell';
          if (guess) {
            c.textContent = guess.word[col];
            c.classList.add(guess.evals[col]);
          } else if (isCurrentRow && col < current.length) {
            c.textContent = current[col];
            c.classList.add('filled');
          }
          if (row === shakeRow) c.classList.add('shake');
          r.appendChild(c);
        }
        gridEl.appendChild(r);
      }
    }

    function renderKeyboard() {
      for (const k of Object.keys(keyButtons)) {
        const btn = keyButtons[k];
        btn.classList.remove('green', 'yellow', 'gray');
        if (kbState[k]) btn.classList.add(kbState[k]);
      }
    }

    function renderBanner() {
      banner.innerHTML = '';
      if (finished === 'win') {
        const b = document.createElement('div');
        b.className = 'wordle-banner win';
        b.innerHTML = `¡Acertaste! La palabra era <span class="reveal">${secret}</span>`;
        banner.appendChild(b);
      } else if (finished === 'lose') {
        const b = document.createElement('div');
        b.className = 'wordle-banner lose';
        b.innerHTML = `La palabra era <span class="reveal">${secret}</span>`;
        banner.appendChild(b);
      }
    }

    function render(shakeRow = -1) {
      renderStats();
      renderGrid(shakeRow);
      renderKeyboard();
      renderBanner();
      enterBtn.disabled = !!finished;
    }

    function updateKb(word, evals) {
      for (let i = 0; i < LEN; i++) {
        const l = word[i];
        const cur = kbState[l];
        const ev = evals[i];
        if (cur === 'green') continue;
        if (ev === 'green') kbState[l] = 'green';
        else if (ev === 'yellow' && cur !== 'green') kbState[l] = 'yellow';
        else if (!cur) kbState[l] = 'gray';
      }
    }

    function persist() {
      saveState({ secret, guesses, current, finished, kbState, countedThisGame });
    }

    function recordResult(won, attemptIdx) {
      if (countedThisGame) return;
      countedThisGame = true;
      stats.played++;
      if (won) {
        stats.wins++;
        stats.streak++;
        if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak;
        stats.dist[attemptIdx] = (stats.dist[attemptIdx] || 0) + 1;
      } else {
        stats.streak = 0;
      }
      saveStats(stats);
    }

    function submit() {
      const row = guesses.length;
      if (current.length < LEN) { render(row); return; }
      const guess = current;
      if (!VALID_SET.has(guess)) { render(row); return; }
      const evals = evaluate(guess, secret);
      guesses.push({ word: guess, evals });
      updateKb(guess, evals);
      current = '';
      const won = evals.every(e => e === 'green');
      if (won) {
        finished = 'win';
        recordResult(true, guesses.length - 1);
      } else if (guesses.length >= MAX_GUESSES) {
        finished = 'lose';
        recordResult(false);
      }
      persist();
      render();
    }

    function handleKey(k) {
      if (k === 'NUEVA') { startNew(); return; }
      if (finished) return;
      if (k === 'ENTER') { submit(); return; }
      if (k === 'BACK') {
        if (current.length > 0) { current = current.slice(0, -1); render(); persist(); }
        return;
      }
      if (current.length < LEN && /^[A-ZÑ]$/.test(k)) {
        current += k;
        render();
        persist();
      }
    }

    function onKeyDown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); handleKey('ENTER'); return; }
      if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); return; }
      const k = normalize(e.key);
      if (k.length === 1 && /^[A-ZÑ]$/.test(k)) {
        e.preventDefault();
        handleKey(k);
      }
    }

    function startNew() {
      secret = pickWord();
      guesses = [];
      current = '';
      finished = null;
      kbState = {};
      countedThisGame = false;
      persist();
      render();
    }

    function loadOrStart() {
      const saved = loadState();
      if (saved && saved.secret && VALID_SET.has(saved.secret)) {
        secret = saved.secret;
        guesses = Array.isArray(saved.guesses) ? saved.guesses : [];
        current = saved.current || '';
        finished = saved.finished || null;
        kbState = saved.kbState || {};
        countedThisGame = !!saved.countedThisGame;
        render();
        return;
      }
      startNew();
    }

    window.addEventListener('keydown', onKeyDown);
    loadOrStart();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }
};
