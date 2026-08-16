/* game.js — Spelling: spell the word from its meaning.
 *
 * The word is never shown and never spoken. You get the definition and a
 * sentence with the word cut out, and you supply the letters — which is the
 * only version of this that tests spelling rather than copying or listening.
 *
 * Everything rated is rated per TRAP (data/words.js explains why): the useful
 * finding is "you still lose -ible words", not "you missed irresistible".
 * Words themselves are tracked as facts — three right in a row learns one, two
 * wrong takes it back — on the same terms as Mapmaster's countries and
 * Chronicle's events, so the hub's "things learned" number means one thing
 * across all of them.
 *
 * Progress lives in localStorage; cloud sync is optional and handled by
 * lib/sync.js.
 */

const STORE_KEY = 'spelling.profile.v1';
const QUIZ_ROUNDS = 10;
const MARATHON_LIVES = 3;
const BLITZ_SECONDS = 90;
const LADDER_STEP = 5;      // correct answers per rung

const MODES = [
  { id: 'classic',  label: 'Classic',  icon: '🎯', hint: '10 words.' },
  { id: 'blitz',    label: 'Blitz',    icon: '⏱',  hint: '90 seconds — as many as you can spell.' },
  { id: 'marathon', label: 'Marathon', icon: '💀', hint: '3 lives. Words keep coming until you miss three.' },
  { id: 'ladder',   label: 'Ladder',   icon: '📈', hint: 'Starts easy, climbs a tier every 5 correct. 3 lives.' },
  { id: 'review',   label: 'Review',   icon: '📚', hint: 'Only the words you have actually got wrong.' },
];

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   t: 0.2, choices: 4, seconds: 40, mult: 1 },
  { id: 'normal', label: 'Normal', t: 1.0, choices: 4, seconds: 32, mult: 1.6 },
  { id: 'hard',   label: 'Hard',   t: 1.8, choices: 0, seconds: 45, mult: 2.6 },
];

// Adaptive is the default and runs on Elo, exactly like Numbers: every trap
// carries a rating, every word carries a difficulty (its tier), and answering
// is a match between the two. Words are served just above your rating, so the
// game sits at your edge instead of at a fixed level.
const ADAPTIVE = { id: 'adaptive', label: 'Adaptive', icon: '🎚' };
const ELO_START = 1000;
const ELO_PER_T = 300;
const tOf = (r) => Math.max(0, (r - ELO_START) / ELO_PER_T);
const dqOf = (t) => ELO_START + ELO_PER_T * t;

// Continuous pacing. Past t≈1.2 the choices disappear and the word must be
// typed — picking the right spelling out of four is recognition, and
// recognition stops being worth anything once you can do it.
const pacingFor = (t) => ({
  id: 'adaptive',
  seconds: Math.min(45, Math.round(26 + 6 * t)),
  choices: t < 1.2 ? 4 : 0,
  mult: 1 + 0.7 * t,
});

/* ------------------------------ DOM handles ------------------------------ */

const $ = (id) => document.getElementById(id);

const tile = (icon, value, label) =>
  `<div class="stat"><i class="ic">${icon}</i><b>${value}</b><span>${label}</span></div>`;

const screens = {
  menu: $('screen-menu'),
  game: $('screen-game'),
  results: $('screen-results'),
  stats: $('screen-stats'),
  rules: $('screen-rules'),
};

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* --------------------------- persistent profile --------------------------- */

const BLANK = { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {}, words: {}, elo: {} };

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
const masteryOf = (id) => { const s = statFor(id); return s.seen ? s.correct / s.seen : 0; };

const LEARN_RUN = 3;
const UNLEARN_RUN = 2;
const wordState = (w) => store.words[w] || { seen: 0, correct: 0, run: 0, miss: 0, learned: false };
const learnedCount = () => Object.values(store.words).filter((f) => f.learned).length;

function eloState(cat) {
  if (!store.elo[cat]) store.elo[cat] = { r: ELO_START, n: 0 };
  return store.elo[cat];
}
const eloOf = (cat) => (store.elo[cat] ? store.elo[cat].r : ELO_START);

// Mean of the traps that have been played at all — the one number on the
// stats card, and what lib/elo.js reads for the cross-game board.
function avgElo() {
  const rs = Object.values(store.elo).filter((e) => e && e.n > 0).map((e) => e.r);
  return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
}

/* --------------------------- misspelling engine ---------------------------
 *
 * Multiple choice is only worth playing if the wrong answers are the mistakes
 * you would actually make. Random letter noise ("necessarq") is answerable
 * without knowing anything, so every distractor here is generated by applying
 * ONE real error pattern — the ie/ei flip, a doubled or undoubled consonant, a
 * swapped ending, a dropped silent letter, a vowel heard wrong.
 *
 * Anything that lands on a word the game itself knows is thrown away, so a
 * distractor can never quietly be the right answer to a different question.
 */

const WORD_SET = new Set(WORDS.map((x) => x.w.toLowerCase()));

const SOFT = 'bcdfglmnprstv';

const END_SWAPS = [
  ['ible', 'able'], ['able', 'ible'],
  ['ance', 'ence'], ['ence', 'ance'],
  ['ant', 'ent'], ['ent', 'ant'],
  ['ary', 'ery'], ['ery', 'ary'],
  ['sion', 'tion'], ['tion', 'sion'],
  ['ise', 'ize'], ['ize', 'ise'],
  ['cy', 'sy'], ['ally', 'aly'], ['ly', 'lly'],
];

const SILENT_CUTS = [
  ['kn', 'n'], ['wr', 'r'], ['ps', 's'], ['rh', 'r'], ['gn', 'n'],
  ['mb', 'm'], ['bt', 't'], ['lm', 'm'], ['mn', 'm'], ['gh', 'g'],
  ['ch', 'c'], ['ph', 'f'], ['que', 'k'], ['sc', 's'], ['wh', 'w'],
];

const VOWEL_SWAPS = [['a', 'e'], ['e', 'a'], ['e', 'i'], ['i', 'e'], ['o', 'u'], ['u', 'o'], ['a', 'i']];

// y doing a vowel's job is its own trap — rhythm, syllable, analysis.
const Y_SWAPS = [['y', 'i'], ['i', 'y'], ['y', 'e']];

function misspellings(word) {
  const w = word.toLowerCase();
  const out = [];
  const push = (v) => {
    if (!v || v === w || v.length < 3 || WORD_SET.has(v) || out.includes(v)) return;
    out.push(v);
  };

  if (w.includes('ie')) push(w.replace('ie', 'ei'));
  if (w.includes('ei')) push(w.replace('ei', 'ie'));

  // Undouble whatever is already doubled, and double something that isn't —
  // the two halves of the single most common spelling error there is.
  const dbl = w.match(new RegExp(`([${SOFT}])\\1`));
  if (dbl) push(w.replace(dbl[0], dbl[1]));
  for (let i = 1; i < w.length - 1; i += 1) {
    const c = w[i];
    if (!SOFT.includes(c)) continue;
    if (c === w[i - 1] || c === w[i + 1]) continue;
    if (!'aeiou'.includes(w[i - 1])) continue;
    push(w.slice(0, i) + c + w.slice(i));
  }

  END_SWAPS.forEach(([a, b]) => { if (w.endsWith(a)) push(w.slice(0, -a.length) + b); });
  SILENT_CUTS.forEach(([a, b]) => { if (w.includes(a)) push(w.replace(a, b)); });

  // A vowel heard wrong in an unstressed middle syllable — how "separate"
  // becomes "seperate" and "definitely" becomes "definately".
  for (let i = 1; i < w.length - 1; i += 1) {
    if (!'aeiouy'.includes(w[i])) continue;
    [...VOWEL_SWAPS, ...Y_SWAPS].forEach(([from, to]) => {
      if (w[i] === from) push(w.slice(0, i) + to + w.slice(i + 1));
    });
  }

  return out;
}

// The fallback pool, kept separate because it is genuinely weaker. Swapping
// two adjacent letters is a real error - it is most typos - but it tests
// proofreading rather than knowing how the word is spelled, so it is only
// drawn on when the patterns above cannot fill four options. "rhythm" is the
// case that forces it: one vowel, no doubled letter, no swappable ending.
function transpositions(word) {
  const w = word.toLowerCase();
  const out = [];
  for (let i = 1; i < w.length - 2; i += 1) {
    if (w[i] === w[i + 1]) continue;
    const v = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    if (v !== w && !WORD_SET.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// The real confusable comes first when a word has one: "principal" is a far
// better wrong answer for "principle" than anything a generator can invent,
// because it is the mistake a competent speller actually makes.
function choicesFor(entry, n) {
  const wrong = [];
  const take = (list) => shuffle(list).forEach((v) => {
    if (wrong.length < n - 1 && !wrong.includes(v)) wrong.push(v);
  });

  if (entry.near) wrong.push(entry.near);
  take(misspellings(entry.w));
  // Only if the error patterns could not fill the row. A handful of words —
  // rhythm, whistle — have almost no surface for them to work on.
  if (wrong.length < n - 1) take(transpositions(entry.w));

  return shuffle([entry.w, ...wrong.slice(0, n - 1)]);
}

/* ------------------------------ word choice ------------------------------ */

const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const catLabel = (id) => (CAT_BY_ID[id] ? CAT_BY_ID[id].label : id);

// Traps you have never tried, or keep losing, come up more often.
function weightFor(id) {
  const s = statFor(id);
  if (!s.seen) return 2.5;
  return 1 + 3 * (1 - s.correct / s.seen);
}

function drawCategory() {
  const pool = g.catPool;
  if (pool.length === 1) return pool[0].id;
  const weights = pool.map((c) => weightFor(c.id));
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return pool[i].id;
  }
  return pool[pool.length - 1].id;
}

// Words you have missed and not since fixed. Review mode is built from this,
// and it is also why a word that beat you comes back sooner than one that
// didn't.
function reviewWords() {
  return WORDS.filter((e) => {
    const s = store.words[e.w];
    return s && s.seen > 0 && !s.learned && s.correct < s.seen;
  });
}

// Serve a word whose tier sits nearest the target difficulty, preferring ones
// that are unseen or unlearned, and never repeating inside a session.
function pickWord(catId, targetT) {
  let pool = WORDS.filter((e) => e.cat === catId && !g.used.has(e.w));
  if (g.mode === 'review') {
    const rw = reviewWords().filter((e) => !g.used.has(e.w));
    if (rw.length) pool = rw;
  }
  if (!pool.length) {
    g.used.clear();
    pool = WORDS.filter((e) => e.cat === catId);
    if (!pool.length) pool = WORDS.slice();
  }

  const scored = pool.map((e) => {
    const gap = Math.abs(TIER_T[e.tier] - targetT);
    const s = store.words[e.w];
    // Unseen words and unlearned ones are worth more than a word already
    // banked — the game should keep finding new edges rather than victory-lap.
    const freshness = !s ? -0.35 : s.learned ? 0.5 : -0.15;
    return { e, k: gap + freshness + Math.random() * 0.45 };
  });
  scored.sort((a, b) => a.k - b.k);
  return scored[0].e;
}

/* --------------------------------- menu --------------------------------- */

const sel = { mode: 'classic', cat: 'mixed', difficulty: 'adaptive' };

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

  Wardrobe.check('spelling', level);

  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  const avg = avgElo();
  $('profile-stats').innerHTML =
    (avg !== null ? `<span><b>${avg}</b> avg elo</span>` : `<span><b>${store.games}</b> rounds</span>`) +
    `<span><b>${learnedCount()}</b> words learned</span>` +
    `<span><b>${acc}%</b> accuracy</span>`;

  const fill = (elId, items, group) => {
    const el = $(elId);
    el.innerHTML = '';
    items.forEach((item) => el.appendChild(optionButton(item, group, sel[group] === item.id)));
  };

  fill('mode-options', MODES, 'mode');
  fill('cat-options', [{ id: 'mixed', label: 'All traps', icon: '🎲' }, ...CATEGORIES], 'cat');
  fill('difficulty-options', [ADAPTIVE, ...DIFFICULTIES], 'difficulty');

  const cat = CAT_BY_ID[sel.cat];
  $('cat-blurb').textContent = cat ? cat.note : 'Every trap in rotation, weighted towards the ones you keep falling into.';

  const mode = MODES.find((m) => m.id === sel.mode);
  const reviewCount = sel.mode === 'review' ? reviewWords().length : null;
  $('start-btn').disabled = reviewCount === 0;
  $('setup-hint').textContent =
    reviewCount === 0 ? 'Nothing to review yet — play a round, miss something, then come back.'
      : reviewCount ? `${mode.hint} ${reviewCount} word${reviewCount === 1 ? '' : 's'} waiting.`
      : sel.mode === 'ladder' ? `${mode.hint} Difficulty is set by the ladder, not the picker.`
      : `${mode.hint}${sel.difficulty === 'hard' ? ' Hard means typing every word.' : ''}`;
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
}

/* ------------------------------- the runner ------------------------------- */

let avatars = [];
const poseAll = (name) => avatars.forEach((a) => a.pose(name));
const flashAll = (name, ms) => avatars.forEach((a) => a.flash(name, ms));

function mountAvatars() {
  avatars = [];
  if (!window.Avatar) return;
  avatars.push(Avatar.create($('companion-avatar'), {
    ink: Wardrobe.ink(), gear: Wardrobe.gear(), facing: 'e',
    sprite: Wardrobe.character(), extras: Wardrobe.extras(),
  }));
  poseAll('idle');
}

// Modes with a known end measure against it; Marathon and Ladder have no
// finish, so the runner simply runs on the spot.
function companionProgress() {
  if (!g) return 0;
  if (g.mode === 'blitz') return 1 - Math.max(0, g.endsAt - Date.now()) / (BLITZ_SECONDS * 1000);
  if (!Number.isFinite(g.rounds)) return null;
  return (g.round - 1 + (g.locked ? 1 : 0)) / g.rounds;
}

function placeCompanion() {
  if (!g) return;
  const p = companionProgress();
  $('companion-rail').classList.toggle('open', p === null);
  $('companion-avatar').style.left = `${clamp(p === null ? 0 : p, 0, 1) * 100}%`;
}

/* ------------------------------- game state ------------------------------- */

let g = null;
let ticker = null;

function startGame() {
  const mode = sel.mode;
  const catPool = sel.cat === 'mixed' ? CATEGORIES.slice() : [CAT_BY_ID[sel.cat]];

  g = {
    id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    cat: sel.cat,
    catPool,
    difficulty: sel.difficulty === 'adaptive' ? ADAPTIVE : DIFFICULTIES.find((d) => d.id === sel.difficulty),
    rounds: mode === 'classic' ? QUIZ_ROUNDS : Infinity,
    round: 0,
    score: 0,
    answered: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    lives: mode === 'marathon' || mode === 'ladder' ? MARATHON_LIVES : Infinity,
    rung: 0,                       // ladder only
    used: new Set(),
    missed: [],
    log: [],
    eloMoves: {},
    newlyLearned: 0,
    newlyLost: 0,
    dead: false,
    locked: false,
    startedAt: Date.now(),
    endsAt: mode === 'blitz' ? Date.now() + BLITZ_SECONDS * 1000 : 0,
    qdiff: { mult: 1 },
  };

  $('hud-clock').classList.toggle('hidden', mode !== 'blitz');
  $('hud-lives').classList.toggle('hidden', !Number.isFinite(g.lives));
  $('results-chest').classList.add('hidden');

  showScreen('game');
  mountAvatars();
  nextQuestion();

  clearInterval(ticker);
  ticker = setInterval(tick, 100);
}

// Where the next word should sit, in difficulty-scalar terms. Adaptive tracks
// your rating in the trap being asked; the ladder walks up on its own; the
// manual difficulties are flat.
function targetT(catId) {
  if (g.mode === 'ladder') return 0.2 + g.rung * 0.5;
  if (g.difficulty.id !== 'adaptive') return g.difficulty.t;
  return tOf(eloOf(catId)) + 0.25;   // just above you, never level with you
}

function nextQuestion() {
  if (!g) return;
  if (g.round >= g.rounds) { endGame(); return; }
  if (g.mode === 'blitz' && Date.now() >= g.endsAt) { endGame(); return; }

  g.round += 1;
  g.locked = false;

  const catId = drawCategory();
  const t = targetT(catId);
  const entry = pickWord(catId, t);
  g.used.add(entry.w);

  const pacing = g.difficulty.id === 'adaptive' || g.mode === 'ladder'
    ? pacingFor(t)
    : g.difficulty;
  g.qdiff = pacing;

  g.q = {
    entry,
    cat: entry.cat,
    dq: dqOf(TIER_T[entry.tier]),
    typed: pacing.choices === 0,
  };
  g.questionStartedAt = Date.now();
  g.questionEndsAt = Date.now() + pacing.seconds * 1000;

  const cat = CAT_BY_ID[entry.cat];
  $('cat-tag').textContent = cat ? `${cat.icon} ${cat.label}` : entry.cat;
  $('tier-tag').textContent = '●'.repeat(entry.tier) + '○'.repeat(5 - entry.tier);
  $('tier-tag').title = `Tier ${entry.tier} of 5`;

  $('definition').textContent = entry.def;
  // The blank is the whole question, so it gets drawn rather than typed: a run
  // of underscores in a serif face is indistinguishable from a rule.
  $('sentence').innerHTML = esc(entry.sent).replace('___', '<span class="blank"></span>');

  $('feedback').textContent = '';
  $('feedback').className = '';
  $('next-btn').classList.add('hidden');

  const choicesEl = $('choices');
  const form = $('type-form');
  if (g.q.typed) {
    choicesEl.innerHTML = '';
    choicesEl.classList.add('hidden');
    form.classList.remove('hidden');
    $('type-input').value = '';
    $('type-input').disabled = false;
    // Autofocus only where a keyboard is already present — popping the
    // on-screen keyboard on a phone hides the sentence being asked about.
    if (window.matchMedia('(hover: hover)').matches) $('type-input').focus();
  } else {
    form.classList.add('hidden');
    choicesEl.classList.remove('hidden');
    choicesEl.innerHTML = '';
    choicesFor(entry, pacing.choices).forEach((option, i) => {
      const b = document.createElement('button');
      b.className = 'enter';
      b.innerHTML = `<span class="key">${i + 1}</span>${esc(option)}`;
      b.dataset.value = option;
      b.addEventListener('click', () => answer(option, b));
      choicesEl.appendChild(b);
    });
  }

  $('hud-progress').textContent = Number.isFinite(g.rounds)
    ? `${g.round} / ${g.rounds}`
    : g.mode === 'ladder' ? `Tier ${g.rung + 1}` : `#${g.round}`;
  paintHud();
  placeCompanion();
  poseAll('run');
}

function paintHud() {
  if (!g) return;
  $('hud-score').textContent = `${g.score.toLocaleString()} pts`;
  $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
  if (Number.isFinite(g.lives)) $('hud-lives').textContent = '♥'.repeat(Math.max(0, g.lives));
  if (g.mode === 'blitz') {
    $('hud-clock').textContent = `${Math.max(0, Math.ceil((g.endsAt - Date.now()) / 1000))}s`;
  }
}

function tick() {
  if (!g) return;
  if (g.mode === 'blitz' && Date.now() >= g.endsAt) { endGame(); return; }
  paintHud();
  placeCompanion();

  if (g.locked) { $('timer-fill').style.width = '0%'; return; }
  const left = g.questionEndsAt - Date.now();
  const total = g.questionEndsAt - g.questionStartedAt;
  const pct = clamp(left / total, 0, 1);
  $('timer-fill').style.width = `${pct * 100}%`;
  $('timer-fill').classList.toggle('low', pct < 0.25);
  if (left <= 0) answer(null, null);
}

/* -------------------------------- answering -------------------------------- */

function eloUpdate(catId, dq, won) {
  const e = eloState(catId);
  const before = e.r;
  const expected = 1 / (1 + 10 ** ((dq - e.r) / 400));
  // K falls as a trap accumulates evidence — early answers should move the
  // rating fast, the hundredth should barely nudge it.
  const k = Math.max(12, 34 - e.n * 0.5);
  e.r = Math.max(600, e.r + k * ((won ? 1 : 0) - expected));
  e.n += 1;
  g.eloMoves[catId] = (g.eloMoves[catId] || 0) + (e.r - before);
  return e;
}

function bankWord(entry, won) {
  const s = { ...wordState(entry.w) };
  s.seen += 1;
  if (won) {
    s.correct += 1;
    s.run += 1;
    s.miss = 0;
    if (!s.learned && s.run >= LEARN_RUN) { s.learned = true; g.newlyLearned += 1; }
  } else {
    s.run = 0;
    s.miss += 1;
    if (s.learned && s.miss >= UNLEARN_RUN) { s.learned = false; g.newlyLost += 1; }
  }
  store.words[entry.w] = s;
}

function answer(given, btn) {
  if (!g || g.locked) return;
  g.locked = true;

  const { entry, cat, dq } = g.q;
  const ms = Date.now() - g.questionStartedAt;
  const clean = given == null ? '' : String(given).trim().toLowerCase();
  const won = clean === entry.w.toLowerCase();

  g.answered += 1;
  store.answered += 1;
  if (won) { g.correct += 1; store.correct += 1; }

  // Per-trap running stats, then the rating, then the word itself.
  const s = { ...statFor(cat) };
  s.seen += 1;
  s.ms += ms;
  if (won) s.correct += 1;
  store.stats[cat] = s;

  const e = eloUpdate(cat, dq, won);
  bankWord(entry, won);

  let pts = 0;
  if (won) {
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    // Speed matters but never more than being right: the fast bonus tops out
    // at the base score, so a careful correct answer always beats a lucky one.
    const speed = clamp(1 - ms / ((g.questionEndsAt - g.questionStartedAt) || 1), 0, 1);
    pts = Math.round((100 + 100 * speed + Math.min(60, g.streak * 8)) * (g.qdiff.mult || 1));
    g.score += pts;
    if (g.mode === 'ladder' && g.correct % LADDER_STEP === 0) {
      g.rung += 1;
      if (window.Juice) Juice.toast('📈 The words just got harder');
    }
  } else {
    g.streak = 0;
    if (Number.isFinite(g.lives)) g.lives -= 1;
    g.missed.push({ w: entry.w, def: entry.def, given: clean });
  }

  g.log.push({
    item_id: entry.w,
    item_name: entry.w,
    prompt: entry.def,
    given: clean || null,
    correct: won,
    ms,
    answered_at: new Date().toISOString(),
  });

  // Paint the verdict.
  if (!g.q.typed) {
    Array.from($('choices').children).forEach((b) => {
      b.disabled = true;
      if (b.dataset.value.toLowerCase() === entry.w.toLowerCase()) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });
  } else {
    $('type-input').disabled = true;
  }

  const fb = $('feedback');
  fb.className = won ? 'good' : 'bad';
  fb.innerHTML = won
    ? `✓ <b>${esc(entry.w)}</b>`
    : given == null
      ? `Out of time — <b>${esc(entry.w)}</b>`
      : `✕ <b>${esc(entry.w)}</b>${clean ? ` — not <em>${esc(clean)}</em>` : ''}`;

  if (window.Juice) {
    if (won) {
      Juice.good({ points: pts, anchor: btn || $('feedback'), streak: g.streak });
      Juice.streak(g.streak, $('hud-streak'));
    } else {
      Juice.bad();
    }
  }
  flashAll(won ? 'cheer' : 'stumble', 700);

  if (won && store.words[entry.w].learned && store.words[entry.w].run === LEARN_RUN && window.Juice) {
    Juice.toast(`✓ ${entry.w} learned — ${learnedCount()} words`);
  } else if (window.Juice && g.answered % 5 === 0) {
    // Every fifth answer, not every answer: a rating that announces itself
    // constantly stops being read at all.
    Juice.toast(`${catLabel(cat)} rating ${Math.round(e.r)}`);
  }

  saveStore();
  paintHud();

  const dead = Number.isFinite(g.lives) && g.lives <= 0;
  if (dead) g.dead = true;

  const last = dead
    || (Number.isFinite(g.rounds) && g.round >= g.rounds)
    || (g.mode === 'blitz' && Date.now() >= g.endsAt);

  if (last) { setTimeout(() => endGame(), 900); return; }
  $('next-btn').classList.remove('hidden');
  // Blitz is a volume mode — stopping to press Next between every word would
  // eat most of the ninety seconds.
  if (g.mode === 'blitz') setTimeout(() => { if (g && g.locked) nextQuestion(); }, 700);
}

/* -------------------------------- finishing -------------------------------- */

function syncSession(aborted, xpGain) {
  if (!g || !g.log.length) return;
  Sync.record({
    game: 'spelling',
    session: {
      client_session_id: g.id,
      mode: g.mode,
      continent: null,
      difficulty: g.difficulty.id,
      question_type: g.cat,
      score: aborted ? 0 : g.score,
      answered: g.answered,
      correct: g.correct,
      best_streak: g.bestStreak,
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
  ticker = null;
  if (!g) return;

  if (aborted) {
    poseAll('idle');
    syncSession(true, 0);
    saveStore();
    showScreen('menu');
    renderMenu();
    g = null;
    return;
  }

  const levelBefore = levelForXp(store.xp);
  const xpGain = Math.round(g.score / 10);
  store.xp += xpGain;
  store.games += 1;

  const bestKey = `${g.mode}|${g.cat}|${g.difficulty.id}`;
  const isBest = g.score > 0 && g.score > (store.best[bestKey] || 0);
  if (isBest) store.best[bestKey] = g.score;
  saveStore();
  syncSession(false, xpGain);

  Wardrobe.earn(xpGain / 2 + (isBest ? 10 : 0));
  if (g.answered > 0) Wardrobe.awardChest('spelling');
  // A clean sweep of a full typed round is the one thing here worth a
  // legendary — it means spelling from meaning alone, with no letters offered.
  if (g.answered >= QUIZ_ROUNDS && g.correct === g.answered && g.difficulty.id === 'hard') {
    Wardrobe.grantFlag('spelling:clean-hard');
  }

  const levelAfter = levelForXp(store.xp);
  const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
  const avgMs = g.log.length ? Math.round(g.log.reduce((sum, a) => sum + a.ms, 0) / g.log.length) : 0;

  $('results-title').textContent =
    g.mode === 'blitz' ? "Time's up!"
      : g.dead ? `💀 Out of lives — ${g.correct} spelled`
      : g.mode === 'ladder' ? `📈 Reached tier ${g.rung + 1}`
      : g.mode === 'review' ? 'Review done'
      : 'Round complete';

  const sessionNet = Object.values(g.eloMoves).reduce((a, b) => a + b, 0);
  const avgAfter = avgElo();
  $('results-score').innerHTML = avgAfter !== null
    ? `${avgAfter}<span> elo · ${sessionNet >= 0 ? '+' : '−'}${Math.abs(Math.round(sessionNet))} this session</span>`
    : `${g.score.toLocaleString()}<span> pts</span>`;

  $('results-stats').innerHTML =
    tile('🎯', `${g.correct}/${g.answered}`, 'correct') +
    tile('📊', `${acc}%`, 'accuracy') +
    tile('⏱', `${(avgMs / 1000).toFixed(1)}s`, 'avg time') +
    tile('🔥', g.bestStreak, 'best streak') +
    (g.newlyLearned ? tile('🧠', `+${g.newlyLearned}`, 'words learned') : '') +
    (g.newlyLost ? tile('🩹', `−${g.newlyLost}`, 'slipped') : '') +
    (() => {
      const moves = Object.entries(g.eloMoves).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      if (!moves.length || Math.abs(moves[0][1]) < 1) return '';
      const [catId, d] = moves[0];
      return tile(d > 0 ? '📈' : '📉',
        `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}`,
        `${catLabel(catId)} → ${Math.round(eloOf(catId))}`);
    })() +
    tile(isBest ? '🏆' : '🎲', g.score.toLocaleString(), `pts${isBest ? ' · new best!' : ''}`);

  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;

  $('results-missed').innerHTML = g.missed.length
    ? '<h3>Worth a second look</h3>' + g.missed.slice(0, 6).map((m) =>
      `<div class="missed-row"><code>${esc(m.w)}</code><span>${esc(m.def)}${
        m.given ? ` · you wrote <em>${esc(m.given)}</em>` : ''}</span></div>`).join('')
    : '<p class="clean-sweep">Clean sweep — every word spelled.</p>';

  if (acc >= 80) flashAll('cheer', 3000); else poseAll('idle');

  const chests = Wardrobe.pending();
  $('results-chest').classList.toggle('hidden', !chests);
  $('results-chest').textContent = chests > 1 ? `Open ${chests} chests` : 'Open your chest';

  showScreen('results');
  if (window.Juice) {
    const scoreEl = $('results-score');
    if (isBest || acc >= 80) Juice.celebrate(scoreEl);
    if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
  }

  g = null;
}

/* --------------------------------- stats --------------------------------- */

function renderStats() {
  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  $('stats-summary').innerHTML =
    `<span><b>${store.games}</b> rounds</span>` +
    `<span><b>${store.answered}</b> answered</span>` +
    `<span><b>${acc}%</b> accuracy</span>` +
    `<span><b>${learnedCount()}/${WORDS.length}</b> words banked</span>`;

  $('stats-cats').innerHTML = CATEGORIES.map((c) => {
    const s = statFor(c.id);
    const pct = Math.round(masteryOf(c.id) * 100);
    const e = store.elo[c.id];
    return `<div class="topic-row">
      <span class="topic-name"><b>${c.icon}</b> ${esc(c.label)}
        <em class="topic-lv">${e && e.n ? Math.round(e.r) : '—'}</em></span>
      <span class="bar"><i style="width:${s.seen ? pct : 0}%"></i></span>
      <span class="topic-num">${s.seen ? `${pct}% · ${s.correct}/${s.seen}` : '—'}</span>
    </div>`;
  }).join('');

  const stuck = reviewWords()
    .sort((a, b) => {
      const sa = store.words[a.w];
      const sb = store.words[b.w];
      return (sa.correct / sa.seen) - (sb.correct / sb.seen);
    })
    .slice(0, 8);

  $('stats-weakest').innerHTML = stuck.length
    ? '<h3>Still beating you</h3><div class="chips">' + stuck.map((e) => {
      const s = store.words[e.w];
      return `<span class="chip">${esc(e.w)} · ${s.correct}/${s.seen}</span>`;
    }).join('') + '</div>'
    : store.answered ? '<p class="clean-sweep">Nothing outstanding. Try Hard, or a trap you have been avoiding.</p>' : '';
}

/* --------------------------------- rules --------------------------------- */

function renderRules(topicId = 'ieei') {
  const el = $('rules-topics');
  el.innerHTML = '';
  RULE_TOPICS.forEach((t) => {
    const b = document.createElement('button');
    b.className = t.id === topicId ? 'active' : '';
    b.innerHTML = `<span class="opt-icon">${t.icon}</span>${t.label}`;
    b.addEventListener('click', () => renderRules(t.id));
    el.appendChild(b);
  });
  const body = $('rules-body');
  body.innerHTML = RULES[topicId] || '';
  body.classList.remove('fade-in');
  void body.offsetWidth;
  body.classList.add('fade-in');
}

/* --------------------------------- wiring --------------------------------- */

$('start-btn').addEventListener('click', startGame);
$('quit-btn').addEventListener('click', () => endGame(true));
$('next-btn').addEventListener('click', nextQuestion);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('results-chest').addEventListener('click', () => {
  Wardrobe.openChestUI(() => {
    $('results-chest').classList.add('hidden');
    renderMenu();
  });
});
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('rules-btn').addEventListener('click', () => { renderRules(); showScreen('rules'); });
$('rules-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

$('type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('type-input').value.trim();
  if (raw === '' || !g || g.locked) return;
  answer(raw, null);
});

document.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (e.target === $('type-input')) {
    if (e.key === 'Enter' && g && g.locked && !$('next-btn').classList.contains('hidden')) nextQuestion();
    return;
  }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    const btn = $('choices').children[n - 1];
    if (btn && !btn.disabled) btn.click();
  } else if (e.key === 'Enter' && !$('next-btn').classList.contains('hidden')) {
    nextQuestion();
  }
});

/* ---------------------------------- boot ---------------------------------- */

Wardrobe.attach('spelling');
renderMenu();
Sync.mountUI();

// Quick play (hub / next-game links carry ?play=1): arriving means START.
if (new URLSearchParams(location.search).get('play')) startGame();
