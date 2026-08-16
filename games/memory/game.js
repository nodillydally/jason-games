/* game.js — Memory: how much can you hold, and for how long.
 *
 * Two halves that answer to the same profile:
 *
 *   SPAN (Classic, Reverse, Climb, Review) is the rated core. A sequence
 *   flashes, it goes away, you reproduce it. Get it right and the next one is
 *   one longer; get it wrong and it drops back. Each of the four kinds —
 *   digits, letters, words, grid — carries its own Elo, because they load
 *   different systems and a single "memory score" would average away the only
 *   interesting finding (see data/pools.js).
 *
 *   PAIRS is concentration: a board of faces, find them two at a time. It pays
 *   XP, coins and chests like everything else but it is deliberately NOT
 *   rated. A pairs board rewards a search strategy as much as recall, and
 *   folding that into the same number as digit span would make the number mean
 *   less rather than more. The scoreboard says what it measures.
 *
 * Progress lives in localStorage; cloud sync is optional (lib/sync.js).
 */

const STORE_KEY = 'memory.profile.v1';
const TRIALS = 10;
const CLIMB_LIVES = 3;
const MIN_SPAN = 3;
const MAX_SPAN = 14;          // past this the exposure alone runs half a minute

const MODES = [
  { id: 'span',    label: 'Span',    icon: '🎯', hint: '10 sequences. Right and it grows, wrong and it shrinks.' },
  { id: 'reverse', label: 'Reverse', icon: '🔄', hint: '10 sequences, recalled backwards. Worth about two extra places.' },
  { id: 'climb',   label: 'Climb',   icon: '📈', hint: 'No round limit. 3 lives — see how far the sequence goes.' },
  { id: 'pairs',   label: 'Pairs',   icon: '🃏', hint: 'The classic board. Find every pair in as few turns as you can.' },
  { id: 'review',  label: 'Review',  icon: '📚', hint: 'Drills whichever kind you are currently worst at.' },
  { id: 'versus',  label: 'Versus',  icon: '🤝', hint: 'Two players, one device — pass it back and forth.' },
];

/* --------------------------------- versus ---------------------------------
 *
 * Both players get the SAME length. That is the whole point: solo memory runs
 * a staircase that converges on YOUR limit, which is exactly what a contest
 * must not do — a staircase would quietly hand each player a length they can
 * manage and the match would measure nothing. So versus fixes the span from
 * the picked difficulty, and only Climb moves it, identically for both.
 */

const VERSUS_TURNS = 5;      // Turns: sequences each
const VERSUS_SECONDS = 60;   // Timed: clock per player
const VERSUS_LIVES = 3;
// Lives runs at a FIXED length, which means a player who can comfortably hold
// that length never misses and the turn never ends. Numbers gets away without
// this because its difficulty is unbounded; a span is capped at MAX_SPAN, so
// the format has a ceiling it can reach. The cap is high enough that a normal
// turn ends on lives, not on the count.
const VERSUS_LIVES_CAP = 12;

const VERSUS_FORMATS = [
  { id: 'turns', icon: '🔄', label: 'Turns', hint: `${VERSUS_TURNS} sequences each, alternating.` },
  { id: 'timed', icon: '⏱', label: 'Timed', hint: `${VERSUS_SECONDS} seconds each — most points wins.` },
  { id: 'climb', icon: '📈', label: 'Climb', hint: `Alternating, and the sequence gains a place every time. ${VERSUS_LIVES} lives each — last one standing.` },
  { id: 'lives', icon: '💀', label: 'Lives', hint: `${VERSUS_LIVES} lives each, or ${VERSUS_LIVES_CAP} sequences — whichever comes first.` },
];

const isVersus = () => g && g.mode === 'versus';
const vsFormat = () => (g && g.vs ? g.vs.format : 'turns');
const versusPlayer = () => g.vs.players[g.vs.turn];

// Keyed to the PLAYER's own count, so both climb the identical ladder no
// matter who is ahead.
function versusSpan() {
  if (vsFormat() !== 'climb') return g.vs.baseSpan;
  return clampSpan(g.vs.baseSpan + versusPlayer().answered);
}

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   start: 3, per: 1000, mult: 1,   cols: 3, rows: 4 },
  { id: 'normal', label: 'Normal', start: 5, per: 750,  mult: 1.6, cols: 4, rows: 4 },
  { id: 'hard',   label: 'Hard',   start: 7, per: 520,  mult: 2.6, cols: 4, rows: 5 },
];

const ADAPTIVE = { id: 'adaptive', label: 'Adaptive', icon: '🎚' };

/* --------------------------------- rating ---------------------------------
 *
 * Span maps onto the same 1000-baseline scale the other games use, anchored
 * where the evidence is: an unaided digit span of 7 is the average adult, so 7
 * sits at 1000. Every extra place is worth 200, which makes a span of 10 a
 * 1600 — the same distance above average that a 1600 means in Numbers.
 *
 * Recalling backwards counts as two extra places rather than as its own scale.
 * It is the same capacity being asked to do more with it, and giving it a
 * separate rating would let someone hold two contradictory "letter" numbers.
 */
const ELO_START = 1000;
const PER_PLACE = 200;
const BASE_SPAN = 7;
const dqOf = (effLen) => ELO_START + PER_PLACE * (effLen - BASE_SPAN);
const spanForRating = (r) => clampSpan(Math.round(BASE_SPAN + (r - ELO_START) / PER_PLACE));
const clampSpan = (n) => Math.max(MIN_SPAN, Math.min(MAX_SPAN, n));

/* ------------------------------ DOM handles ------------------------------ */

const $ = (id) => document.getElementById(id);

const tile = (icon, value, label) =>
  `<div class="stat"><i class="ic">${icon}</i><b>${value}</b><span>${label}</span></div>`;

const screens = {
  menu: $('screen-menu'),
  game: $('screen-game'),
  results: $('screen-results'),
  stats: $('screen-stats'),
  how: $('screen-how'),
};

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const sample = (pool, n) => shuffle(pool).slice(0, n);

// Digits repeat in the real world and in every real span test, so they are
// drawn WITH replacement — but never the same value twice in a row, which
// would be a free chunk rather than an extra place.
function drawDigits(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    let d;
    do { d = DIGIT_POOL[Math.floor(Math.random() * DIGIT_POOL.length)]; }
    while (d === out[i - 1]);
    out.push(d);
  }
  return out;
}

/* --------------------------- persistent profile --------------------------- */

const BLANK = { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {}, elo: {}, span: {}, pairs: {} };

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...BLANK, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { ...BLANK };
}

const store = loadStore();
const saveStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));

const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

const statFor = (id) => store.stats[id] || { seen: 0, correct: 0, ms: 0 };
const bestSpan = (id) => store.span[id] || 0;

function eloState(kind) {
  if (!store.elo[kind]) store.elo[kind] = { r: ELO_START, n: 0 };
  return store.elo[kind];
}
const eloOf = (kind) => (store.elo[kind] ? store.elo[kind].r : ELO_START);

function avgElo() {
  const rs = Object.values(store.elo).filter((e) => e && e.n > 0).map((e) => e.r);
  return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
}

const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const kindLabel = (id) => (KIND_BY_ID[id] ? KIND_BY_ID[id].label : id);

// The kind you are currently worst at, by rating among those played — Review
// mode's whole definition, and the honest one: least developed, not least
// recently played.
function weakestKind() {
  const played = KINDS.filter((k) => store.elo[k.id] && store.elo[k.id].n > 0);
  if (!played.length) return KINDS[0];
  return played.sort((a, b) => eloOf(a.id) - eloOf(b.id))[0];
}

/* --------------------------------- menu --------------------------------- */

const sel = { mode: 'span', kind: 'digits', difficulty: 'adaptive', vsFormat: 'turns' };

function optionButton(item, group, active) {
  const b = document.createElement('button');
  b.className = active ? 'active' : '';
  b.innerHTML = item.icon ? `<span class="opt-icon">${item.icon}</span>${item.label}` : item.label;
  b.addEventListener('click', () => { sel[group] = item.id; renderMenu(); });
  return b;
}

function renderMenu() {
  const level = levelForXp(store.xp);
  $('menu-level').textContent = level;
  const cur = store.xp - xpAtLevel(level);
  const need = xpAtLevel(level + 1) - xpAtLevel(level);
  $('xp-fill').style.width = `${Math.min(100, (cur / need) * 100)}%`;
  $('xp-label').textContent = `${cur} / ${need} XP to level ${level + 1}`;

  Wardrobe.check('memory', level);

  const avg = avgElo();
  const best = Math.max(0, ...KINDS.map((k) => bestSpan(k.id)));
  $('profile-stats').innerHTML =
    (avg !== null ? `<span><b>${avg}</b> avg elo</span>` : `<span><b>${store.games}</b> rounds</span>`) +
    `<span><b>${best || '—'}</b> best span</span>` +
    `<span><b>${store.answered}</b> sequences</span>`;

  const fill = (elId, items, group) => {
    const el = $(elId);
    el.innerHTML = '';
    items.forEach((item) => el.appendChild(optionButton(item, group, sel[group] === item.id)));
  };

  fill('mode-options', MODES, 'mode');
  fill('kind-options', KINDS, 'kind');
  fill('difficulty-options', [ADAPTIVE, ...DIFFICULTIES], 'difficulty');

  const isVs = sel.mode === 'versus';
  $('versus-block').classList.toggle('hidden', !isVs);
  if (isVs) {
    fill('vsformat-options', VERSUS_FORMATS, 'vsFormat');
    const f = VERSUS_FORMATS.find((x) => x.id === sel.vsFormat) || VERSUS_FORMATS[0];
    $('vsformat-blurb').textContent =
      `${f.hint} Difficulty sets the length both players face; Adaptive falls back to Normal so nobody gets a handicap.`;
  }

  // Pairs has no kind, and Review picks its own — offering the picker in
  // either case would be a control that silently does nothing.
  const showKind = sel.mode !== 'pairs' && sel.mode !== 'review';
  $('kind-block').classList.toggle('hidden', !showKind);
  const kind = KIND_BY_ID[sel.kind];
  $('kind-blurb').textContent = kind ? kind.note : '';

  const mode = MODES.find((m) => m.id === sel.mode);
  const weak = weakestKind();
  $('setup-hint').textContent =
    sel.mode === 'review' ? `${mode.hint} Right now that is ${weak.icon} ${weak.label}.`
      : sel.mode === 'pairs' ? `${mode.hint} Difficulty sets the size of the board.`
      : isVs ? `${mode.hint} Both players face the same length.`
      : sel.difficulty === 'adaptive'
        ? `${mode.hint} Starting length comes from your ${kindLabel(sel.kind).toLowerCase()} rating.`
        : mode.hint;
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
}

/* ------------------------------- game state ------------------------------- */

let g = null;
let ticker = null;
let showTimer = null;

function difficultyOf() {
  return sel.difficulty === 'adaptive' ? ADAPTIVE : DIFFICULTIES.find((d) => d.id === sel.difficulty);
}

function startGame() {
  clearInterval(ticker);
  clearTimeout(showTimer);

  const mode = sel.mode;
  const kind = mode === 'review' ? weakestKind().id : mode === 'pairs' ? 'pairs' : sel.kind;
  const versus = mode === 'versus';
  // Adaptive would size the sequence to JASON's rating and hand it to whoever
  // is sitting there. Versus falls back to Normal so both face the same.
  const diff = versus && sel.difficulty === 'adaptive'
    ? DIFFICULTIES.find((d) => d.id === 'normal')
    : difficultyOf();

  g = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    kind,
    reverse: mode === 'reverse',
    difficulty: diff,
    rounds: mode === 'climb' || mode === 'pairs' || versus ? Infinity : TRIALS,
    round: 0,
    score: 0,
    answered: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    lives: mode === 'climb' ? CLIMB_LIVES : Infinity,
    span: diff.id === 'adaptive' ? spanForRating(eloOf(kind)) : diff.start,
    topSpan: 0,
    missed: [],
    log: [],
    eloMoves: {},
    dead: false,
    phase: 'idle',
    startedAt: Date.now(),
    vs: versus ? {
      format: sel.vsFormat,
      turn: 0,
      turnsEach: VERSUS_TURNS,
      turnRounds: 0,
      tier: 0,
      turnEndsAt: 0,
      baseSpan: diff.start,
      players: [
        { name: ($('p1-name').value.trim() || 'Player 1').slice(0, 12), score: 0, correct: 0, answered: 0, streak: 0, lives: VERSUS_LIVES },
        { name: ($('p2-name').value.trim() || 'Player 2').slice(0, 12), score: 0, correct: 0, answered: 0, streak: 0, lives: VERSUS_LIVES },
      ],
    } : null,
  };
  // Reverse is harder at the same length, so it starts a place lower rather
  // than handing you two guaranteed failures to find that out.
  if (g.reverse) g.span = clampSpan(g.span - 1);

  if (versus) beginVersusTurn();
  else $('hud-lives').classList.toggle('hidden', !Number.isFinite(g.lives));
  $('results-chest').classList.add('hidden');
  $('span-stage').classList.toggle('hidden', mode === 'pairs');
  $('pairs-stage').classList.toggle('hidden', mode !== 'pairs');

  showScreen('game');
  if (mode === 'pairs') startPairs(); else nextTrial();

  ticker = setInterval(tick, 90);
}

/* ---------------------------- versus turn cycle ---------------------------- */

// A turn is over when the format says so; the match when nobody has one left.
// Past the ceiling the climb stops being a climb — the sequence cannot get any
// longer, so a player who has reached it has finished their run whether or not
// they still hold lives.
const atCeiling = (p) => g.vs.baseSpan + p.answered > MAX_SPAN;

function versusTurnOver() {
  switch (vsFormat()) {
    case 'timed': return Date.now() >= g.vs.turnEndsAt;
    case 'lives': return versusPlayer().lives <= 0 || g.vs.turnRounds >= VERSUS_LIVES_CAP;
    // Turns and Climb both hand the device over after every single sequence.
    default:      return g.vs.turnRounds >= 1;
  }
}

function versusMatchOver() {
  if (vsFormat() === 'turns') return g.vs.players.every((p) => p.answered >= g.vs.turnsEach);
  if (vsFormat() === 'climb') return g.vs.players.every((p) => p.lives <= 0 || atCeiling(p));
  return g.vs.turn === 1;
}

// The next seat is the other player — unless they are already out, in which
// case the survivor keeps climbing alone until their own lives run out.
function nextVersusSeat() {
  const other = g.vs.turn === 0 ? 1 : 0;
  if (vsFormat() !== 'climb') return other;
  const done = (p) => p.lives <= 0 || atCeiling(p);
  if (!done(g.vs.players[other])) return other;
  return done(versusPlayer()) ? other : g.vs.turn;
}

// A streak belongs to the player, not the seat — it survives the opponent's go.
function beginVersusTurn() {
  g.streak = versusPlayer().streak || 0;
  g.vs.turnEndsAt = Date.now() + VERSUS_SECONDS * 1000;
  if (vsFormat() === 'lives') versusPlayer().lives = VERSUS_LIVES;
  g.vs.turnRounds = 0;
  g.vs.tier = 0;
  $('hud-lives').classList.add('hidden');   // lives ride in the progress slot here
}

function endVersusTurn() {
  if (versusMatchOver()) return endGame();
  const seat = nextVersusSeat();
  // Nobody to pass to — the survivor just carries on.
  if (seat === g.vs.turn) { g.vs.turnRounds = 0; return nextTrial(); }
  showHandoff(seat);
}

function showHandoff(nextTurn) {
  const up = g.vs.players[nextTurn];
  const other = g.vs.players[nextTurn === 0 ? 1 : 0];
  const alternating = vsFormat() === 'turns';
  $('handoff-title').textContent = `${up.name}, you're up`;
  $('handoff-sub').innerHTML = alternating
    ? `${esc(up.name)} <b>${up.score.toLocaleString()}</b> · ${esc(other.name)} <b>${other.score.toLocaleString()}</b>`
      + `<br>Sequence ${Math.min(up.answered + 1, g.vs.turnsEach)} of ${g.vs.turnsEach}. Pass the device.`
    : `${esc(other.name)} scored <b>${other.score.toLocaleString()}</b> — ${other.correct}/${other.answered} held.`
      + '<br>Beat it. Hand the device over.';
  $('handoff').classList.remove('hidden');
  $('handoff-go').onclick = () => {
    $('handoff').classList.add('hidden');
    g.vs.turn = nextTurn;
    beginVersusTurn();
    nextTrial();
  };
}

function endVersus() {
  const [a, b] = g.vs.players;
  const winner = a.score === b.score ? null : (a.score > b.score ? a : b);
  const fmt = VERSUS_FORMATS.find((f) => f.id === g.vs.format) || VERSUS_FORMATS[0];

  $('results-title').textContent = winner ? `🏆 ${winner.name} wins` : '🤝 Dead heat';
  $('results-score').innerHTML =
    `${a.score.toLocaleString()}<span> ${esc(a.name)} · ${esc(b.name)} ${b.score.toLocaleString()}</span>`;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${a.correct}/${a.answered}</b><span>${esc(a.name)}</span></div>` +
    `<div class="stat"><b>${b.correct}/${b.answered}</b><span>${esc(b.name)}</span></div>` +
    `<div class="stat"><b>${Math.abs(a.score - b.score).toLocaleString()}</b><span>margin</span></div>` +
    (g.vs.format === 'climb'
      ? `<div class="stat"><b>${clampSpan(g.vs.baseSpan + a.answered - 1)} · ${clampSpan(g.vs.baseSpan + b.answered - 1)}</b><span>span reached</span></div>`
      : `<div class="stat"><b>${fmt.label}</b><span>format</span></div>`);
  $('results-xp').innerHTML = '';
  $('results-detail').innerHTML =
    '<p class="versus-note">Versus doesn\'t touch your ratings, best spans or stats — someone else was remembering.</p>';

  showScreen('results');
  if (window.Juice) {
    Juice.replay($('results-score'), 'pop');
    if (winner) Juice.celebrate($('results-score'));
  }
  g = null;
}

/* ------------------------------- span trials ------------------------------- */

function buildSequence(kind, n) {
  if (kind === 'digits') return drawDigits(n);
  if (kind === 'letters') return sample(LETTER_POOL, n);
  if (kind === 'words') return sample(WORD_POOL, n);
  return sample(Array.from({ length: GRID_CELLS }, (_, i) => String(i)), n);
}

function perItemMs() {
  if (g.difficulty.id !== 'adaptive') return g.difficulty.per;
  // Longer sequences get less time each — the exposure should stay a
  // manageable length overall, and the pressure is part of the test.
  return Math.max(420, Math.round(950 - 45 * g.span));
}

function nextTrial() {
  if (!g) return;
  if (isVersus() && versusTurnOver()) { endVersusTurn(); return; }
  if (g.round >= g.rounds) { endGame(); return; }

  g.round += 1;
  if (isVersus()) {
    const next = versusSpan();
    if (vsFormat() === 'climb' && next !== g.span && g.vs.tier) {
      if (window.Juice) Juice.toast(`📈 Span ${next}`);
    }
    g.span = next;
    g.vs.tier += 1;
  }
  g.seq = buildSequence(g.kind, g.span);
  g.entered = [];
  g.phase = 'show';
  g.shownAt = Date.now();

  const kind = KIND_BY_ID[g.kind];
  $('kind-tag').textContent = `${kind.icon} ${kind.label}${g.reverse ? ' · backwards' : ''}`;
  $('phase-tag').textContent = 'remember';
  $('phase-tag').className = 'phase-tag showing';
  $('feedback').textContent = '';
  $('feedback').className = '';
  $('next-btn').classList.add('hidden');
  $('slots').classList.add('hidden');
  $('pad').classList.add('hidden');
  $('recall-actions').classList.add('hidden');

  $('hud-progress').textContent = Number.isFinite(g.rounds) ? `${g.round} / ${g.rounds}` : `#${g.round}`;
  $('hud-span').textContent = `span ${g.span}`;
  paintHud();

  playSequence();
}

// Show the items one at a time. One at a time rather than all at once is what
// makes this a span test rather than a reading test: all sixteen on screen
// together and you would simply read them off.
function playSequence() {
  const per = perItemMs();
  const showEl = $('show');
  g.showEndsAt = Date.now() + per * g.seq.length + 400;

  if (g.kind === 'grid') {
    renderGrid(showEl, false);
    let i = 0;
    const step = () => {
      if (!g || g.phase !== 'show') return;
      showEl.querySelectorAll('.cell').forEach((c) => c.classList.remove('lit'));
      if (i >= g.seq.length) { showTimer = setTimeout(beginRecall, 380); return; }
      const cell = showEl.querySelector(`.cell[data-i="${g.seq[i]}"]`);
      if (cell) cell.classList.add('lit');
      i += 1;
      // A gap between lights, so two consecutive cells read as two events.
      showTimer = setTimeout(() => {
        if (!g || g.phase !== 'show') return;
        showEl.querySelectorAll('.cell').forEach((c) => c.classList.remove('lit'));
        showTimer = setTimeout(step, Math.max(90, per * 0.25));
      }, per * 0.75);
    };
    step();
    return;
  }

  showEl.className = `show kind-${g.kind}`;
  let i = 0;
  const step = () => {
    if (!g || g.phase !== 'show') return;
    if (i >= g.seq.length) {
      showEl.innerHTML = '';
      showTimer = setTimeout(beginRecall, 380);
      return;
    }
    showEl.innerHTML = `<span class="item">${esc(g.seq[i])}</span>`;
    i += 1;
    showTimer = setTimeout(step, per);
  };
  step();
}

function renderGrid(host, live) {
  host.className = `show kind-grid${live ? ' live' : ''}`;
  host.style.setProperty('--cols', GRID_COLS);
  host.innerHTML = Array.from({ length: GRID_CELLS }, (_, i) =>
    `<button class="cell" data-i="${i}" ${live ? '' : 'disabled'} aria-label="cell ${i + 1}"></button>`).join('');
  if (!live) return;
  host.querySelectorAll('.cell').forEach((c) => {
    c.addEventListener('click', () => enter(c.dataset.i, c));
  });
}

function beginRecall() {
  if (!g) return;
  g.phase = 'recall';
  g.recallStartedAt = Date.now();
  // Generous but finite: enough to actually walk a memory palace, not enough
  // to write it down.
  g.recallEndsAt = Date.now() + 6000 + 3000 * g.seq.length;

  $('phase-tag').textContent = g.reverse ? 'recall — backwards' : 'recall';
  $('phase-tag').className = 'phase-tag recalling';
  $('slots').classList.remove('hidden');
  $('recall-actions').classList.remove('hidden');
  paintSlots();

  if (g.kind === 'grid') {
    renderGrid($('show'), true);
    $('pad').classList.add('hidden');
    return;
  }

  $('show').innerHTML = '';
  $('show').className = 'show empty';
  const pad = $('pad');
  pad.classList.remove('hidden');
  pad.className = `pad pad-${g.kind}`;
  pad.innerHTML = '';

  const keys = g.kind === 'digits' ? DIGIT_POOL
    : g.kind === 'letters' ? LETTER_POOL
    // Words get a bank of the sequence plus two decoys. A bank of exactly the
    // right words would hand you the last one free every time.
    : shuffle([...g.seq, ...sample(WORD_POOL.filter((w) => !g.seq.includes(w)), 2)]);

  keys.forEach((k) => {
    const b = document.createElement('button');
    b.className = 'key';
    b.textContent = k;
    b.dataset.value = k;
    b.addEventListener('click', () => enter(k, b));
    pad.appendChild(b);
  });
}

function enter(value, btn) {
  if (!g || g.phase !== 'recall') return;
  if (g.entered.length >= g.seq.length) return;
  g.entered.push(String(value));
  if (btn) {
    // Grid cells are never repeated inside a sequence, so a tapped one stays
    // marked: the slots row says what order you gave, the board says which
    // cells you picked. A 180ms flash left you with neither once you were
    // three taps in.
    if (g.kind === 'grid') btn.classList.add('chosen');
    else {
      btn.classList.add('tapped');
      setTimeout(() => btn.classList.remove('tapped'), 180);
      // Each word is used once, so a used key stands down rather than lying
      // about being available.
      if (g.kind === 'words') btn.disabled = true;
    }
  }
  if (window.Juice) Juice.buzz(8);
  paintSlots();
}

function undo() {
  if (!g || g.phase !== 'recall' || !g.entered.length) return;
  const popped = g.entered.pop();
  if (g.kind === 'words') {
    const btn = $('pad').querySelector(`.key[data-value="${CSS.escape(popped)}"]`);
    if (btn) btn.disabled = false;
  } else if (g.kind === 'grid') {
    const cell = $('show').querySelector(`.cell[data-i="${CSS.escape(popped)}"]`);
    if (cell) cell.classList.remove('chosen');
  }
  paintSlots();
}

function paintSlots() {
  const el = $('slots');
  el.className = `slots kind-${g.kind}`;
  el.innerHTML = Array.from({ length: g.seq.length }, (_, i) => {
    const v = g.entered[i];
    if (v === undefined) return '<span class="slot"></span>';
    const shown = g.kind === 'grid' ? String(Number(v) + 1) : v;
    return `<span class="slot filled">${esc(shown)}</span>`;
  }).join('');
  $('submit-btn').disabled = g.entered.length !== g.seq.length;
  $('undo-btn').disabled = !g.entered.length;
}

function submit() {
  if (!g || g.phase !== 'recall') return;
  if (g.entered.length !== g.seq.length) return;
  grade(false);
}

function grade(timedOut) {
  if (!g || g.phase !== 'recall') return;
  g.phase = 'graded';

  const want = g.reverse ? g.seq.slice().reverse() : g.seq;
  const got = g.entered;
  // Span is scored all-or-nothing, the way every real span test is: holding
  // six of seven places is not a seven span. Partial credit is kept anyway,
  // because it is the honest thing to show on the results screen.
  const hits = want.filter((v, i) => got[i] === v).length;
  const won = hits === want.length && got.length === want.length;
  const ms = Date.now() - g.recallStartedAt;
  const effLen = g.span + (g.reverse ? 2 : 0);

  g.answered += 1;
  if (won) g.correct += 1;

  // Versus is someone else's hands on the device, so it records nothing: no
  // rating, no best span, no lifetime accuracy. A guest missing three in a row
  // must not cost Jason a rating he spent weeks earning.
  const solo = !isVersus();
  if (solo) {
    store.answered += 1;
    if (won) store.correct += 1;

    const s = { ...statFor(g.kind) };
    s.seen += 1;
    s.ms += ms;
    if (won) s.correct += 1;
    store.stats[g.kind] = s;

    const e = eloState(g.kind);
    const before = e.r;
    const expected = 1 / (1 + 10 ** ((dqOf(effLen) - e.r) / 400));
    const k = Math.max(14, 36 - e.n * 0.5);
    e.r = Math.max(600, e.r + k * ((won ? 1 : 0) - expected));
    e.n += 1;
    g.eloMoves[g.kind] = (g.eloMoves[g.kind] || 0) + (e.r - before);
  }

  let pts = 0;
  if (won) {
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    g.topSpan = Math.max(g.topSpan, g.span);
    if (solo && g.span > bestSpan(g.kind)) {
      store.span[g.kind] = g.span;
      if (window.Juice) Juice.toast(`🧠 New ${kindLabel(g.kind).toLowerCase()} best — span ${g.span}`);
    }
    const speed = clamp(1 - ms / (g.recallEndsAt - g.recallStartedAt), 0, 1);
    // Points ride on the length held, so a span-9 trial is worth roughly
    // twice a span-5 one rather than the same flat hundred.
    pts = Math.round((60 * effLen + 90 * speed + Math.min(60, g.streak * 8)) * (g.difficulty.mult || 1.4));
    g.score += pts;
  } else {
    g.streak = 0;
    if (Number.isFinite(g.lives)) g.lives -= 1;
    g.missed.push({ span: g.span, want: want.slice(), got: got.slice(), hits });
  }

  g.log.push({
    item_id: `${g.kind}-${g.span}${g.reverse ? 'r' : ''}`,
    item_name: `${kindLabel(g.kind)} span ${g.span}${g.reverse ? ' reversed' : ''}`,
    prompt: want.join(' '),
    given: got.join(' ') || null,
    correct: won,
    ms,
    answered_at: new Date().toISOString(),
  });

  // Show the answer against what was entered, place by place — the only
  // feedback that tells you WHERE it broke, which is the useful part.
  const rows = want.map((v, i) => {
    const gv = got[i];
    const label = g.kind === 'grid' ? String(Number(v) + 1) : v;
    const gLabel = gv === undefined ? '·' : g.kind === 'grid' ? String(Number(gv) + 1) : gv;
    const ok = gv === v;
    return `<span class="cmp ${ok ? 'ok' : 'no'}">${esc(label)}${ok ? '' : `<em>${esc(gLabel)}</em>`}</span>`;
  }).join('');

  const fb = $('feedback');
  fb.className = won ? 'good' : 'bad';
  fb.innerHTML = (won
    ? `✓ Span ${g.span} held`
    : timedOut ? `Out of time — ${hits}/${want.length} in place`
      : `✕ ${hits}/${want.length} in place`)
    + `<div class="cmp-row">${rows}</div>`;

  if (window.Juice) {
    if (won) { Juice.good({ points: pts, anchor: fb, streak: g.streak }); Juice.streak(g.streak, $('hud-streak')); }
    else Juice.bad();
  }

  // The seated player carries their own totals; g.score and g.streak are just
  // the live view of whoever is holding the device.
  if (isVersus()) {
    const p = versusPlayer();
    p.answered += 1;
    p.score += pts;
    p.streak = g.streak;
    if (won) p.correct += 1;
    else if (vsFormat() === 'lives' || vsFormat() === 'climb') p.lives -= 1;
    g.vs.turnRounds += 1;
  } else {
    // Adapt for the next one — up on a hit, down on a miss, never below the
    // floor. This is the staircase every span test uses, and it converges on
    // your actual limit in about six trials. Versus deliberately skips it:
    // a staircase would hand each player a length they can manage, and the
    // match would stop being a comparison.
    g.span = clampSpan(g.span + (won ? 1 : -1));
    saveStore();
  }

  paintHud();

  $('pad').querySelectorAll('.key').forEach((b) => { b.disabled = true; });
  $('show').querySelectorAll('.cell').forEach((c) => { c.disabled = true; });
  $('recall-actions').classList.add('hidden');

  if (isVersus()) { $('next-btn').classList.remove('hidden'); return; }

  const dead = Number.isFinite(g.lives) && g.lives <= 0;
  if (dead) g.dead = true;
  if (dead || (Number.isFinite(g.rounds) && g.round >= g.rounds)) {
    setTimeout(() => endGame(), 1400);
    return;
  }
  $('next-btn').classList.remove('hidden');
}

/* --------------------------------- pairs --------------------------------- */

function startPairs() {
  const d = g.difficulty.id === 'adaptive' ? DIFFICULTIES[1] : g.difficulty;
  const cells = d.cols * d.rows;
  const pairs = Math.floor(cells / 2);
  const faces = sample(PAIR_FACES, pairs);
  g.pairs = {
    cols: d.cols,
    total: pairs,
    found: 0,
    moves: 0,
    open: [],
    busy: false,
    deck: shuffle([...faces, ...faces]),
    startedAt: Date.now(),
  };
  g.rounds = Infinity;

  $('hud-progress').textContent = `0 / ${pairs}`;
  $('hud-span').textContent = '';
  paintHud();
  renderBoard();
  $('pairs-note').textContent = `${pairs} pairs. Every flip counts — the fewest turns wins, not the fastest.`;
}

function renderBoard() {
  const board = $('board');
  board.style.setProperty('--cols', g.pairs.cols);
  board.innerHTML = g.pairs.deck.map((face, i) =>
    `<button class="card-tile" data-i="${i}"><span class="face">${face}</span></button>`).join('');
  board.querySelectorAll('.card-tile').forEach((t) => {
    t.addEventListener('click', () => flip(Number(t.dataset.i), t));
  });
}

function flip(i, el) {
  const p = g.pairs;
  if (p.busy || el.classList.contains('up') || el.classList.contains('done')) return;
  el.classList.add('up');
  p.open.push({ i, el });
  if (window.Juice) Juice.buzz(8);
  if (p.open.length < 2) return;

  p.moves += 1;
  $('pairs-moves').textContent = `${p.moves} turn${p.moves === 1 ? '' : 's'}`;
  const [a, b] = p.open;

  if (p.deck[a.i] === p.deck[b.i]) {
    p.open = [];
    p.found += 1;
    a.el.classList.add('done');
    b.el.classList.add('done');
    $('hud-progress').textContent = `${p.found} / ${p.total}`;
    g.score += Math.round(140 * (g.difficulty.mult || 1.4));
    paintHud();
    if (window.Juice) Juice.good({ points: 0, anchor: b.el });
    if (p.found === p.total) setTimeout(() => endGame(), 700);
    return;
  }

  p.busy = true;
  setTimeout(() => {
    a.el.classList.remove('up');
    b.el.classList.remove('up');
    p.open = [];
    p.busy = false;
  }, 760);
}

/* ------------------------------- HUD / clock ------------------------------- */

function paintHud() {
  if (!g) return;

  if (isVersus()) {
    const [a, b] = g.vs.players;
    const f = vsFormat();
    const up = versusPlayer();
    $('hud-progress').textContent =
      f === 'lives' ? `${up.name} · ${'♥'.repeat(Math.max(0, up.lives))}`
      : f === 'climb' ? `${up.name} · ${'♥'.repeat(Math.max(0, up.lives))}`
      : f === 'timed' ? `${up.name} · ${Math.max(0, Math.ceil((g.vs.turnEndsAt - Date.now()) / 1000))}s`
      : `${up.name} · ${Math.min(up.answered + 1, g.vs.turnsEach)}/${g.vs.turnsEach}`;
    $('hud-score').innerHTML =
      `<span class="${g.vs.turn === 0 ? 'vs-on' : ''}">${esc(a.name)} ${a.score.toLocaleString()}</span>`
      + '<span class="vs-sep"> · </span>'
      + `<span class="${g.vs.turn === 1 ? 'vs-on' : ''}">${esc(b.name)} ${b.score.toLocaleString()}</span>`;
    $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
    return;
  }

  $('hud-score').textContent = `${g.score.toLocaleString()} pts`;
  $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
  if (Number.isFinite(g.lives)) $('hud-lives').textContent = '♥'.repeat(Math.max(0, g.lives));
}

function tick() {
  if (!g) return;
  const fillEl = $('timer-fill');

  if (g.mode === 'pairs') {
    fillEl.style.width = '0%';
    return;
  }
  if (g.phase === 'show') {
    const pct = clamp((g.showEndsAt - Date.now()) / (g.showEndsAt - g.shownAt), 0, 1);
    fillEl.style.width = `${pct * 100}%`;
    fillEl.classList.remove('low');
    return;
  }
  if (g.phase === 'recall') {
    const pct = clamp((g.recallEndsAt - Date.now()) / (g.recallEndsAt - g.recallStartedAt), 0, 1);
    fillEl.style.width = `${pct * 100}%`;
    fillEl.classList.toggle('low', pct < 0.25);
    if (Date.now() >= g.recallEndsAt) grade(true);
    return;
  }
  fillEl.style.width = '0%';

  // Timed versus: the clock ends a TURN, not the match, and only once the
  // sequence in play has been graded — nobody loses one mid-recall to the
  // handover. The countdown itself rides in the progress slot.
  if (isVersus()) {
    if (vsFormat() === 'timed') paintHud();
    if (vsFormat() === 'timed' && g.phase === 'graded' && Date.now() >= g.vs.turnEndsAt) endVersusTurn();
  }
}

/* -------------------------------- finishing -------------------------------- */

function syncSession(aborted, xpGain) {
  if (!g) return;
  const answered = g.mode === 'pairs' ? (g.pairs ? g.pairs.moves : 0) : g.answered;
  if (!answered) return;
  Sync.record({
    game: 'memory',
    session: {
      client_session_id: g.id,
      mode: g.mode,
      continent: null,
      difficulty: g.difficulty.id,
      question_type: g.kind,
      score: aborted ? 0 : g.score,
      answered,
      correct: g.mode === 'pairs' ? (g.pairs ? g.pairs.found : 0) : g.correct,
      best_streak: g.mode === 'pairs' ? 0 : g.bestStreak,
      duration_ms: Date.now() - g.startedAt,
      xp_gained: xpGain,
      aborted,
      played_at: new Date(g.startedAt).toISOString(),
    },
    answers: g.log,
  });
}

function endGame(aborted = false) {
  clearInterval(ticker);
  clearTimeout(showTimer);
  ticker = null;
  if (!g) return;

  if (aborted) {
    if (!isVersus()) { syncSession(true, 0); saveStore(); }
    showScreen('menu');
    renderMenu();
    g = null;
    return;
  }

  // Versus has its own scoreboard and deliberately banks nothing: no XP, no
  // chest, no session synced to Atlas. Two people took turns on one device;
  // there is no single player whose record it would belong to.
  if (isVersus()) { endVersus(); return; }

  const levelBefore = levelForXp(store.xp);
  const xpGain = Math.round(g.score / 10);
  store.xp += xpGain;
  store.games += 1;

  const bestKey = `${g.mode}|${g.kind}|${g.difficulty.id}`;
  const isBest = g.score > 0 && g.score > (store.best[bestKey] || 0);
  if (isBest) store.best[bestKey] = g.score;

  const p = g.pairs;
  if (g.mode === 'pairs' && p) {
    const key = `${p.total}`;
    const prev = store.pairs[key];
    if (!prev || p.moves < prev.moves) store.pairs[key] = { moves: p.moves, ms: Date.now() - p.startedAt };
  }

  saveStore();
  syncSession(false, xpGain);

  Wardrobe.earn(xpGain / 2 + (isBest ? 10 : 0));
  Wardrobe.awardChest('memory');
  // Ten places held in one go is the achievement here — three above the
  // average adult span, and not reachable by rehearsal alone.
  if (g.topSpan >= 10) Wardrobe.grantFlag('memory:span-ten');
  if (g.mode === 'pairs' && p && p.moves === p.total) Wardrobe.grantFlag('memory:perfect-board');

  const levelAfter = levelForXp(store.xp);

  if (g.mode === 'pairs' && p) {
    const secs = Math.round((Date.now() - p.startedAt) / 1000);
    const perfect = p.moves === p.total;
    $('results-title').textContent = perfect ? '🃏 A perfect board' : '🃏 Board cleared';
    $('results-score').innerHTML = `${p.moves}<span> turns · ${p.total} pairs</span>`;
    $('results-stats').innerHTML =
      tile('🎯', `${p.total}`, 'pairs') +
      tile('🔁', p.moves, 'turns') +
      tile('📏', `${Math.round((p.total / p.moves) * 100)}%`, 'efficiency') +
      tile('⏱', `${secs}s`, 'time') +
      tile(isBest ? '🏆' : '🎲', g.score.toLocaleString(), `pts${isBest ? ' · new best!' : ''}`);
    const rec = store.pairs[String(p.total)];
    $('results-detail').innerHTML =
      `<p class="clean-sweep">${perfect
        ? 'Every turn a match — that is the floor, and nobody gets there by luck.'
        : `The floor is ${p.total} turns. Your best on this board is ${rec ? rec.moves : p.moves}.`}</p>`;
  } else {
    const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
    const sessionNet = Object.values(g.eloMoves).reduce((a, b) => a + b, 0);
    const avgAfter = avgElo();

    $('results-title').textContent =
      g.dead ? `💀 Out of lives — topped out at ${g.topSpan || MIN_SPAN}`
        : g.mode === 'climb' ? `📈 Reached span ${g.topSpan}`
        : g.reverse ? 'Backwards round complete'
        : 'Round complete';

    $('results-score').innerHTML = avgAfter !== null
      ? `${avgAfter}<span> elo · ${sessionNet >= 0 ? '+' : '−'}${Math.abs(Math.round(sessionNet))} this session</span>`
      : `${g.score.toLocaleString()}<span> pts</span>`;

    $('results-stats').innerHTML =
      tile('🧠', g.topSpan || '—', 'top span') +
      tile('🎯', `${g.correct}/${g.answered}`, 'held') +
      tile('📊', `${acc}%`, 'accuracy') +
      tile('🔥', g.bestStreak, 'best streak') +
      (() => {
        const d = g.eloMoves[g.kind] || 0;
        if (Math.abs(d) < 1) return '';
        return tile(d > 0 ? '📈' : '📉',
          `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}`,
          `${kindLabel(g.kind)} → ${Math.round(eloOf(g.kind))}`);
      })() +
      tile(isBest ? '🏆' : '🎲', g.score.toLocaleString(), `pts${isBest ? ' · new best!' : ''}`);

    $('results-detail').innerHTML = g.missed.length
      ? '<h3>Where it broke</h3>' + g.missed.slice(0, 4).map((m) => {
        const fmt = (arr) => arr.map((v) => (g.kind === 'grid' ? Number(v) + 1 : v)).join(' ');
        return `<div class="missed-row"><code>${esc(fmt(m.want))}</code>` +
          `<span>span ${m.span} · you had ${m.hits} in place${m.got.length ? ` · ${esc(fmt(m.got))}` : ''}</span></div>`;
      }).join('')
      : '<p class="clean-sweep">Nothing dropped — every sequence held.</p>';
  }

  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;

  const chests = Wardrobe.pending();
  $('results-chest').classList.toggle('hidden', !chests);
  $('results-chest').textContent = chests > 1 ? `Open ${chests} chests` : 'Open your chest';

  showScreen('results');
  if (window.Juice) {
    if (isBest || g.topSpan >= 9) Juice.celebrate($('results-score'));
    if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
  }

  g = null;
}

/* --------------------------------- stats --------------------------------- */

function renderStats() {
  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  $('stats-summary').innerHTML =
    `<span><b>${store.games}</b> rounds</span>` +
    `<span><b>${store.answered}</b> sequences</span>` +
    `<span><b>${acc}%</b> held</span>`;

  $('stats-kinds').innerHTML = '<h3>By kind</h3>' + KINDS.map((k) => {
    const s = statFor(k.id);
    const pct = s.seen ? Math.round((s.correct / s.seen) * 100) : 0;
    const e = store.elo[k.id];
    const best = bestSpan(k.id);
    return `<div class="topic-row">
      <span class="topic-name"><b>${k.icon}</b> ${esc(k.label)}
        <em class="topic-lv">${e && e.n ? Math.round(e.r) : '—'}</em></span>
      <span class="bar"><i style="width:${s.seen ? pct : 0}%"></i></span>
      <span class="topic-num">${best ? `span ${best} · ${pct}%` : '—'}</span>
    </div>`;
  }).join('');

  const boards = Object.entries(store.pairs).sort((a, b) => Number(a[0]) - Number(b[0]));
  $('stats-pairs').innerHTML = boards.length
    ? '<h3>Pairs — fewest turns</h3><div class="chips">' + boards.map(([pairs, rec]) =>
      `<span class="chip">${pairs} pairs · ${rec.moves} turns</span>`).join('') + '</div>'
    : '<p class="clean-sweep">No boards cleared yet. Pairs is unrated on purpose — see the scoreboard note.</p>';
}

/* ---------------------------------- how ---------------------------------- */

function renderHow(topicId = 'limit') {
  const el = $('how-topics');
  el.innerHTML = '';
  HOW_TOPICS.forEach((t) => {
    const b = document.createElement('button');
    b.className = t.id === topicId ? 'active' : '';
    b.innerHTML = `<span class="opt-icon">${t.icon}</span>${t.label}`;
    b.addEventListener('click', () => renderHow(t.id));
    el.appendChild(b);
  });
  const body = $('how-body');
  body.innerHTML = HOWTO[topicId] || '';
  body.classList.remove('fade-in');
  void body.offsetWidth;
  body.classList.add('fade-in');
}

/* --------------------------------- wiring --------------------------------- */

$('start-btn').addEventListener('click', startGame);
$('quit-btn').addEventListener('click', () => endGame(true));
$('next-btn').addEventListener('click', nextTrial);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('submit-btn').addEventListener('click', submit);
$('undo-btn').addEventListener('click', undo);
$('results-chest').addEventListener('click', () => {
  Wardrobe.openChestUI(() => {
    $('results-chest').classList.add('hidden');
    renderMenu();
  });
});
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('how-btn').addEventListener('click', () => { renderHow(); showScreen('how'); });
$('how-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

document.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (!g) return;

  if (g.phase === 'graded' && (e.key === 'Enter' || e.key === ' ')) {
    if (!$('next-btn').classList.contains('hidden')) { e.preventDefault(); nextTrial(); }
    return;
  }
  if (g.phase !== 'recall') return;

  if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
  if (e.key === 'Enter') { e.preventDefault(); submit(); return; }

  // Typing straight into the pad: digits and letters answer to the keyboard,
  // words and grid can only be tapped.
  const key = e.key.toUpperCase();
  if (g.kind === 'digits' && /^[0-9]$/.test(e.key)) {
    const btn = $('pad').querySelector(`.key[data-value="${e.key}"]`);
    if (btn) { enter(e.key, btn); }
  } else if (g.kind === 'letters' && LETTER_POOL.includes(key)) {
    const btn = $('pad').querySelector(`.key[data-value="${key}"]`);
    if (btn) { enter(key, btn); }
  }
});

/* ---------------------------------- boot ---------------------------------- */

Wardrobe.attach('memory');
renderMenu();
Sync.mountUI();

if (new URLSearchParams(location.search).get('play')) startGame();
