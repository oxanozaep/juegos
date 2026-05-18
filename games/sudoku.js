const STATE_KEY = 'games-hub.sudoku.state';
const DIFF_KEY = 'games-hub.sudoku.difficulty';
const RECORDS_KEY = 'games-hub.sudoku.records';

const DIFFICULTIES = {
  facil:  { label: 'Fácil',  givens: 45 },
  medio:  { label: 'Medio',  givens: 36 },
  dificil:{ label: 'Difícil',givens: 30 }
};

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}') || {}; }
  catch { return {}; }
}
function saveRecords(r) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch {}
}
function formatDateES(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyBoard() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function clone(b) { return b.map(r => r.slice()); }

function isValid(b, r, c, v) {
  for (let i = 0; i < 9; i++) {
    if (b[r][i] === v) return false;
    if (b[i][c] === v) return false;
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (b[br + i][bc + j] === v) return false;
  return true;
}

function fillFull(b) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (b[r][c] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const v of nums) {
          if (isValid(b, r, c, v)) {
            b[r][c] = v;
            if (fillFull(b)) return true;
            b[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function findBestEmpty(b) {
  let best = null, bestCount = 10, bestCands = null;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (b[r][c] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) if (isValid(b, r, c, v)) cands.push(v);
      if (cands.length < bestCount) {
        best = [r, c];
        bestCount = cands.length;
        bestCands = cands;
        if (bestCount <= 1) return { cell: best, cands: bestCands };
      }
    }
  }
  return best ? { cell: best, cands: bestCands } : null;
}

function countSolutions(b, limit = 2) {
  const next = findBestEmpty(b);
  if (!next) return 1;
  const [r, c] = next.cell;
  let count = 0;
  for (const v of next.cands) {
    b[r][c] = v;
    count += countSolutions(b, limit - count);
    b[r][c] = 0;
    if (count >= limit) return count;
  }
  return count;
}

function generatePuzzle(targetGivens) {
  const solution = emptyBoard();
  fillFull(solution);
  const puzzle = clone(solution);
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
  let givens = 81;
  for (const p of positions) {
    if (givens <= targetGivens) break;
    const r = Math.floor(p / 9), c = p % 9;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(clone(puzzle), 2) !== 1) {
      puzzle[r][c] = backup;
    } else {
      givens--;
    }
  }
  return { puzzle, solution };
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
}

function clearStoredState() {
  try { localStorage.removeItem(STATE_KEY); } catch {}
}

export const Sudoku = {
  id: 'sudoku',
  name: 'Sudoku',
  emoji: '🧩',
  description: '9×9 clásico con notas y validación',

  mount(container) {
    const HISTORY_LIMIT = 10;
    let puzzle = null;       // initial givens (immutable)
    let solution = null;
    let board = null;        // current user board
    let notes = null;        // 9x9 of Set<number>
    let errors = null;       // 9x9 of bool
    let history = [];        // snapshots for undo (max HISTORY_LIMIT)
    let selectedNumber = null;
    let mode = 'final';      // 'final' | 'note'
    let selectedCell = null; // [r,c]
    let timer = 0;
    let timerHandle = null;
    let solved = false;
    let difficulty = localStorage.getItem(DIFF_KEY) || 'medio';

    const root = document.createElement('div');
    root.className = 'sudoku';

    const bar = document.createElement('div');
    bar.className = 'sudoku-bar';
    const timerEl = document.createElement('div');
    timerEl.className = 'timer';
    timerEl.textContent = '00:00';
    const diffSel = document.createElement('select');
    diffSel.className = 'diff-select';
    for (const k of Object.keys(DIFFICULTIES)) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = DIFFICULTIES[k].label;
      if (k === difficulty) opt.selected = true;
      diffSel.appendChild(opt);
    }
    bar.appendChild(timerEl);
    bar.appendChild(diffSel);
    root.appendChild(bar);

    const recordsEl = document.createElement('div');
    recordsEl.className = 'sudoku-records';
    root.appendChild(recordsEl);

    const boardEl = document.createElement('div');
    boardEl.className = 'sudoku-board';
    root.appendChild(boardEl);

    const modes = document.createElement('div');
    modes.className = 'sudoku-modes';
    const finalBtn = document.createElement('button');
    finalBtn.textContent = 'Definitivo';
    finalBtn.classList.add('active');
    const noteBtn = document.createElement('button');
    noteBtn.textContent = 'Posible';
    modes.appendChild(finalBtn);
    modes.appendChild(noteBtn);
    root.appendChild(modes);

    const pad = document.createElement('div');
    pad.className = 'sudoku-pad';
    const padButtons = [];
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement('button');
      b.dataset.n = n;
      b.innerHTML = `<span class="n">${n}</span><span class="count"></span>`;
      b.addEventListener('click', () => selectNumber(n));
      pad.appendChild(b);
      padButtons.push(b);
    }
    root.appendChild(pad);

    const actions = document.createElement('div');
    actions.className = 'sudoku-actions';
    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Deshacer';
    undoBtn.disabled = true;
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Borrar casilla';
    const newBtn = document.createElement('button');
    newBtn.className = 'primary';
    newBtn.textContent = 'Nueva partida';
    actions.appendChild(undoBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(newBtn);
    root.appendChild(actions);

    const banner = document.createElement('div');
    root.appendChild(banner);

    container.appendChild(root);

    function setMode(m) {
      mode = m;
      finalBtn.classList.toggle('active', m === 'final');
      noteBtn.classList.toggle('active', m === 'note');
    }
    finalBtn.addEventListener('click', () => setMode('final'));
    noteBtn.addEventListener('click', () => setMode('note'));

    diffSel.addEventListener('change', () => {
      difficulty = diffSel.value;
      localStorage.setItem(DIFF_KEY, difficulty);
      renderRecord();
    });

    newBtn.addEventListener('click', () => startNew(difficulty));

    clearBtn.addEventListener('click', () => {
      if (!selectedCell) return;
      const [r, c] = selectedCell;
      if (puzzle[r][c] !== 0) return;
      if (board[r][c] === 0 && notes[r][c].size === 0) return;
      pushHistory();
      board[r][c] = 0;
      notes[r][c].clear();
      errors[r][c] = false;
      persist();
      render();
    });

    undoBtn.addEventListener('click', undo);

    function snapshot() {
      return {
        board: board.map(r => r.slice()),
        notes: notes.map(r => r.map(s => [...s])),
        errors: errors.map(r => r.slice())
      };
    }

    function pushHistory() {
      history.push(snapshot());
      if (history.length > HISTORY_LIMIT) history.shift();
    }

    function undo() {
      if (history.length === 0) return;
      const prev = history.pop();
      board = prev.board;
      notes = prev.notes.map(r => r.map(arr => new Set(arr)));
      errors = prev.errors;
      solved = false;
      persist();
      render();
    }

    let lastRecordBeaten = false;
    function maybeUpdateRecord() {
      const records = loadRecords();
      const cur = records[difficulty];
      lastRecordBeaten = !cur || timer < cur.time;
      if (lastRecordBeaten) {
        records[difficulty] = { time: timer, date: new Date().toISOString() };
        saveRecords(records);
      }
    }

    function renderRecord() {
      const records = loadRecords();
      const cur = records[difficulty];
      const label = DIFFICULTIES[difficulty].label;
      if (cur) {
        recordsEl.innerHTML =
          `<span>Récord (${label})</span>` +
          `<span><span class="rec-time">${formatTime(cur.time)}</span> ` +
          `<span class="rec-date">· ${formatDateES(cur.date)}</span></span>`;
      } else {
        recordsEl.innerHTML = `<span>Récord (${label})</span><span class="rec-time">—</span>`;
      }
    }

    function selectNumber(n) {
      selectedNumber = selectedNumber === n ? null : n;
      render();
    }

    function countNumber(n) {
      let c = 0;
      for (let r = 0; r < 9; r++)
        for (let cc = 0; cc < 9; cc++)
          if (board[r][cc] === n && !errors[r][cc]) c++;
      return c;
    }

    function isSolved() {
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (board[r][c] !== solution[r][c]) return false;
      return true;
    }

    function persist() {
      saveState({
        puzzle, solution, board,
        notes: notes.map(row => row.map(s => [...s])),
        errors, timer, difficulty, solved,
        history
      });
    }

    function startTimer() {
      stopTimer();
      timerHandle = setInterval(() => {
        if (solved) return;
        timer++;
        timerEl.textContent = formatTime(timer);
        if (timer % 5 === 0) persist();
      }, 1000);
    }

    function stopTimer() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    }

    function onCellClick(r, c) {
      if (solved) return;
      selectedCell = [r, c];
      if (puzzle[r][c] !== 0) { render(); return; }
      if (selectedNumber == null) { render(); return; }

      if (mode === 'final') {
        if (board[r][c] === selectedNumber) { render(); return; }
        pushHistory();
        board[r][c] = selectedNumber;
        notes[r][c].clear();
        errors[r][c] = selectedNumber !== solution[r][c];
        if (!errors[r][c] && isSolved()) {
          solved = true;
          stopTimer();
          maybeUpdateRecord();
        }
      } else {
        if (board[r][c] !== 0) { render(); return; }
        pushHistory();
        if (notes[r][c].has(selectedNumber)) notes[r][c].delete(selectedNumber);
        else notes[r][c].add(selectedNumber);
      }
      persist();
      render();
    }

    function render() {
      boardEl.innerHTML = '';
      const sel = selectedCell;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = document.createElement('div');
          cell.className = 'sudoku-cell';
          if (r === 2 || r === 5) cell.classList.add('row-bottom-bold');
          const isGiven = puzzle[r][c] !== 0;
          if (isGiven) cell.classList.add('given');
          if (errors[r][c]) cell.classList.add('error');

          if (sel && sel[0] === r && sel[1] === c) {
            cell.classList.add('selected');
          } else if (sel) {
            const [sr, sc] = sel;
            const sameRow = sr === r, sameCol = sc === c;
            const sameBox = Math.floor(sr/3) === Math.floor(r/3) && Math.floor(sc/3) === Math.floor(c/3);
            if (sameRow || sameCol || sameBox) cell.classList.add('peer');
          }
          if (selectedNumber != null && board[r][c] === selectedNumber) {
            cell.classList.add('highlight');
          }

          const v = board[r][c];
          if (v !== 0) {
            cell.textContent = v;
          } else if (notes[r][c].size > 0) {
            const grid = document.createElement('div');
            grid.className = 'sudoku-notes';
            for (let n = 1; n <= 9; n++) {
              const sp = document.createElement('span');
              if (notes[r][c].has(n)) sp.textContent = n;
              grid.appendChild(sp);
            }
            cell.appendChild(grid);
          }

          cell.addEventListener('click', () => onCellClick(r, c));
          boardEl.appendChild(cell);
        }
      }

      for (const btn of padButtons) {
        const n = parseInt(btn.dataset.n, 10);
        const cnt = countNumber(n);
        btn.classList.toggle('active', selectedNumber === n);
        btn.classList.toggle('exhausted', cnt >= 9);
        btn.querySelector('.count').textContent = cnt > 0 ? cnt : '';
      }

      timerEl.textContent = formatTime(timer);
      undoBtn.disabled = history.length === 0 || solved;
      renderRecord();

      banner.innerHTML = '';
      if (solved) {
        const b = document.createElement('div');
        b.className = 'sudoku-banner' + (lastRecordBeaten ? ' record' : '');
        b.textContent = lastRecordBeaten
          ? `¡Nuevo récord! ${formatTime(timer)}`
          : `¡Resuelto en ${formatTime(timer)}!`;
        banner.appendChild(b);
      }
    }

    function loadOrGenerate() {
      const saved = loadState();
      if (saved && saved.puzzle && saved.solution) {
        puzzle = saved.puzzle;
        solution = saved.solution;
        board = saved.board;
        notes = saved.notes.map(row => row.map(arr => new Set(arr)));
        errors = saved.errors;
        timer = saved.timer || 0;
        difficulty = saved.difficulty || difficulty;
        solved = !!saved.solved;
        history = Array.isArray(saved.history) ? saved.history : [];
        diffSel.value = difficulty;
        render();
        if (!solved) startTimer();
        return;
      }
      startNew(difficulty);
    }

    function startNew(diff) {
      difficulty = diff;
      localStorage.setItem(DIFF_KEY, difficulty);
      diffSel.value = difficulty;
      solved = false;
      lastRecordBeaten = false;
      timer = 0;
      stopTimer();
      boardEl.innerHTML = '';
      const loading = document.createElement('div');
      loading.className = 'sudoku-loading';
      loading.textContent = 'Generando puzzle…';
      banner.innerHTML = '';
      boardEl.appendChild(loading);
      setTimeout(() => {
        const { puzzle: p, solution: s } = generatePuzzle(DIFFICULTIES[difficulty].givens);
        puzzle = p;
        solution = s;
        board = clone(p);
        notes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
        errors = Array.from({ length: 9 }, () => Array(9).fill(false));
        history = [];
        selectedNumber = null;
        selectedCell = null;
        setMode('final');
        persist();
        render();
        startTimer();
      }, 30);
    }

    loadOrGenerate();

    return () => {
      stopTimer();
    };
  }
};
