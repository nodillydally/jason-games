/**
 * Mapmaster — world map learning game.
 *
 * Modes:
 *   quiz    — a country is highlighted, name it (MCQ or typing). 10 rounds.
 *   blitz   — 60-second timer, name as many highlighted countries as you can.
 *   find    — reverse mode: given a name, click the country on the map.
 *   explore — no scoring, browse the map and learn names.
 *
 * Difficulty: easy = 3 choices / 3 find attempts, medium = 6 harder choices
 * (neighbouring countries as distractors) / 2 attempts, hard = type the
 * name yourself / 1 attempt.
 *
 * Progress (XP, level, best scores, per-country accuracy) persists in
 * localStorage. Question selection is adaptive: countries you get wrong
 * show up more often.
 */
'use strict';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RACE_LEGS = 10;

const MODES = [
  { id: 'quiz', label: 'Classic quiz', sub: 'Ten rounds, take your time' },
  { id: 'blitz', label: 'Blitz ⏱', sub: '60 seconds, go fast' },
  { id: 'marathon', label: 'Marathon 💀', sub: '3 lives — how far can you go?' },
  { id: 'race', label: 'Race 🏁', sub: `First to ${RACE_LEGS} — beat your rival` },
  { id: 'find', label: 'Find it 🎯', sub: 'Spot it on the map' },
  { id: 'review', label: 'Review 📚', sub: 'Drill the ones you miss' },
  { id: 'explore', label: 'Explore 🧭', sub: 'Browse & learn, no score' },
];

const QUESTIONS = [
  { id: 'location', label: 'Locations 🗺️', sub: 'Name what\'s highlighted' },
  { id: 'capital', label: 'Capitals 🏛️', sub: 'Name the capital' },
  { id: 'flag', label: 'Flags 🚩', sub: 'Whose flag is it?' },
  { id: 'mix', label: 'Mix 🎲', sub: 'A bit of everything' },
];

// Quiz-style modes share the highlight-and-answer round loop.
const QUIZ_LIKE = ['quiz', 'blitz', 'marathon', 'review', 'race'];

const CONTINENTS = [
  'World', 'Africa', 'Americas', 'Asia',
  'Europe', 'North America', 'Oceania', 'South America',
];

const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', sub: '3 choices', choices: 3, attempts: 3, points: 100 },
  { id: 'medium', label: 'Medium', sub: '6 tricky choices', choices: 6, attempts: 2, points: 150 },
  { id: 'hard', label: 'Hard', sub: 'Type the name', choices: 0, attempts: 1, points: 200 },
];

const QUIZ_ROUNDS = 10;
const BLITZ_SECONDS = 60;
const MARATHON_LIVES = 3;
const STORE_KEY = 'mapmaster-v1';

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const screens = {
  menu: $('screen-menu'),
  game: $('screen-game'),
  results: $('screen-results'),
  stats: $('screen-stats'),
};
const svg = $('map');
const tip = $('map-tip');

// ---------------------------------------------------------------------------
// Persistent profile
// ---------------------------------------------------------------------------

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {}, pace: {}, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {}, pace: {} };
}

const store = loadStore();
const saveStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));

const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

// Flag emoji are not usable here: Windows ships no flag-emoji font, so 🇵🇪
// renders as the bare letters "PE" in Chrome/Edge — which in flag-guessing mode
// spells out the answer. Vendored PNGs render identically everywhere.
// See tools/fetch-flags.mjs.
const flagImg = (c, cls, alt = '') =>
  `<img class="${cls}" src="data/flags/${c.cca2.toLowerCase()}.png" alt="${esc(alt)}" draggable="false">`;

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

// ---------------------------------------------------------------------------
// Country pools & adaptive selection
// ---------------------------------------------------------------------------

function poolFor(continent) {
  if (continent === 'World') return COUNTRIES.slice();
  if (continent === 'Americas') {
    return COUNTRIES.filter((c) => c.continent === 'North America' || c.continent === 'South America');
  }
  return COUNTRIES.filter((c) => c.continent === continent);
}

// Learned/unlearned: three right in a row marks a country learned; two wrong
// in a row takes it back. Runs, not lifetime accuracy — a country you missed
// ten times in June but nail now IS learned, and one you aced early but keep
// fumbling now is NOT.
const LEARN_RUN = 3;
const UNLEARN_RUN = 2;
const learnedCount = () => Object.values(store.stats).filter((s) => s.learned).length;

// Countries you've never seen or often miss get a higher weight. Learned ones
// still appear occasionally — a claim you never have to defend isn't held.
function weightFor(c) {
  const s = store.stats[c.id];
  if (!s || !s.seen) return 2;
  if (s.learned) return 0.4;
  return 1 + 3 * (1 - s.correct / s.seen) + (s.run < 0 ? 1 : 0);
}

function weightedSample(pool, n) {
  const items = pool.map((c) => ({ c, w: weightFor(c) }));
  const out = [];
  while (out.length < n && items.length) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < items.length - 1; idx++) {
      r -= items[idx].w;
      if (r <= 0) break;
    }
    out.push(items.splice(idx, 1)[0].c);
  }
  return out;
}

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const centerOf = (c) => [(c.box[0] + c.box[2]) / 2, (c.box[1] + c.box[3]) / 2];

// Distractors always come from the target's own NEIGHBOURHOOD — Jamaica next
// to Sweden and Australia is process of elimination, not geography. Easy
// draws from a regional band (the ~16 nearest in the same continent), medium
// from the 12 nearest outright.
function pickChoices(target, pool, count) {
  let candidates = pool.filter((c) => c.id !== target.id && c.continent === target.continent);
  if (candidates.length < count - 1) {
    candidates = COUNTRIES.filter((c) => c.id !== target.id && c.continent === target.continent);
  }
  if (candidates.length < count - 1) {
    candidates = COUNTRIES.filter((c) => c.id !== target.id);
  }

  const [tx, ty] = centerOf(target);
  const byDistance = candidates
    .map((c) => {
      const [x, y] = centerOf(c);
      return { c, d: (x - tx) ** 2 + (y - ty) ** 2 };
    })
    .sort((a, b) => a.d - b.d)
    .map((o) => o.c);

  const band = byDistance.slice(0, count >= 6 ? 12 : 16);
  const distractors = shuffle(band).slice(0, count - 1);
  return shuffle([target, ...distractors]);
}

// ---------------------------------------------------------------------------
// Typed-answer matching (accent-insensitive, small typo tolerance)
// ---------------------------------------------------------------------------

function normalizeName(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

function answerMatches(guess, country) {
  const g = normalizeName(guess);
  if (!g) return false;
  const names = [country.name, ...(country.alt || [])].map(normalizeName);
  if (names.includes(g)) return true;
  const tol = g.length > 8 ? 2 : g.length > 4 ? 1 : 0;
  if (!tol) return false;
  return levenshtein(g, normalizeName(country.name)) <= tol;
}

// ---------------------------------------------------------------------------
// Map rendering & camera
// ---------------------------------------------------------------------------

const pathEls = new Map();

function buildMap() {
  svg.setAttribute('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (const c of COUNTRIES) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', c.d);
    p.setAttribute('class', 'country');
    p.dataset.id = c.id;
    g.appendChild(p);
    pathEls.set(c.id, p);
  }
  svg.appendChild(g);
}

let camAnim = null;
let camCurrent = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };

function setViewBox(v) {
  camCurrent = v;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
}

function animateCamera(target, ms = 650) {
  if (camAnim) cancelAnimationFrame(camAnim);
  const from = { ...camCurrent };
  const start = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const e = ease(t);
    setViewBox({
      x: from.x + (target.x - from.x) * e,
      y: from.y + (target.y - from.y) * e,
      w: from.w + (target.w - from.w) * e,
      h: from.h + (target.h - from.h) * e,
    });
    if (t < 1) camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}

function fitBox(x0, y0, x1, y1, pad) {
  let w = x1 - x0 + pad * 2;
  let h = y1 - y0 + pad * 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const aspect = MAP_WIDTH / MAP_HEIGHT;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  w = Math.min(w, MAP_WIDTH);
  h = Math.min(h, MAP_HEIGHT);
  let x = cx - w / 2;
  let y = cy - h / 2;
  x = Math.max(0, Math.min(MAP_WIDTH - w, x));
  y = Math.max(0, Math.min(MAP_HEIGHT - h, y));
  return { x, y, w, h };
}

function regionCamera(pool) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of pool) {
    x0 = Math.min(x0, c.box[0]);
    y0 = Math.min(y0, c.box[1]);
    x1 = Math.max(x1, c.box[2]);
    y1 = Math.max(y1, c.box[3]);
  }
  return fitBox(x0, y0, x1, y1, 15);
}

// Zoom to a country with enough surrounding context to recognise the
// region; tiny countries get a minimum window so they stay visible.
function countryCamera(c) {
  const [x0, y0, x1, y1] = c.box;
  const w = x1 - x0;
  const h = y1 - y0;
  const grow = Math.max(w, h) * 1.3 + 28;
  return fitBox(x0 - grow, y0 - grow, x1 + grow, y1 + grow, 0);
}

// ---------------------------------------------------------------------------
// Map navigation — pan / pinch / wheel, for modes where the map itself is
// the controller (find, explore). Small countries need it on touch screens.
// ---------------------------------------------------------------------------

const pointers = new Map();
let gestureStart = null;
let didPan = false;

const mapNavigable = () => !!g && (g.mode === 'find' || g.mode === 'explore');

const MIN_VIEW_W = 36;

function clampView(v) {
  const w = Math.max(MIN_VIEW_W, Math.min(MAP_WIDTH, v.w));
  const h = w * (MAP_HEIGHT / MAP_WIDTH);
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - w, v.x)),
    y: Math.max(0, Math.min(MAP_HEIGHT - h, v.y)),
    w,
    h,
  };
}

// Snapshot the viewBox and finger positions so pan/pinch math works from a
// stable reference instead of accumulating drift.
function startGesture() {
  gestureStart = {
    vb: { ...camCurrent },
    pts: [...pointers.values()].map((p) => ({ ...p })),
  };
}

svg.addEventListener('pointerdown', (e) => {
  if (!mapNavigable()) return;
  if (pointers.size === 0) didPan = false;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (camAnim) cancelAnimationFrame(camAnim);
  startGesture();
});

window.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !gestureStart) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const rect = svg.getBoundingClientRect();
  const start = gestureStart;
  const pts = [...pointers.values()];

  if (pts.length === 1) {
    const dxPx = pts[0].x - start.pts[0].x;
    const dyPx = pts[0].y - start.pts[0].y;
    if (Math.abs(dxPx) + Math.abs(dyPx) > 8) didPan = true;
    setViewBox(clampView({
      x: start.vb.x - (dxPx / rect.width) * start.vb.w,
      y: start.vb.y - (dyPx / rect.height) * start.vb.h,
      w: start.vb.w,
      h: start.vb.h,
    }));
  } else if (pts.length >= 2 && start.pts.length >= 2) {
    didPan = true;
    const d0 = Math.hypot(start.pts[0].x - start.pts[1].x, start.pts[0].y - start.pts[1].y) || 1;
    const d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    const w = Math.max(MIN_VIEW_W, Math.min(MAP_WIDTH, start.vb.w * (d0 / d1)));
    const h = w * (MAP_HEIGHT / MAP_WIDTH);
    // keep the map point that was under the fingers' midpoint under it still
    const mid0 = { x: (start.pts[0].x + start.pts[1].x) / 2, y: (start.pts[0].y + start.pts[1].y) / 2 };
    const mid1 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const mapMidX = start.vb.x + ((mid0.x - rect.left) / rect.width) * start.vb.w;
    const mapMidY = start.vb.y + ((mid0.y - rect.top) / rect.height) * start.vb.h;
    setViewBox(clampView({
      x: mapMidX - ((mid1.x - rect.left) / rect.width) * w,
      y: mapMidY - ((mid1.y - rect.top) / rect.height) * h,
      w,
      h,
    }));
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size) startGesture();
  else gestureStart = null;
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

svg.addEventListener('wheel', (e) => {
  if (!mapNavigable()) return;
  e.preventDefault();
  if (camAnim) cancelAnimationFrame(camAnim);
  const rect = svg.getBoundingClientRect();
  const w = Math.max(MIN_VIEW_W, Math.min(MAP_WIDTH, camCurrent.w * (e.deltaY > 0 ? 1.18 : 1 / 1.18)));
  const h = w * (MAP_HEIGHT / MAP_WIDTH);
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  setViewBox(clampView({
    x: camCurrent.x + fx * camCurrent.w - fx * w,
    y: camCurrent.y + fy * camCurrent.h - fy * h,
    w,
    h,
  }));
}, { passive: false });

function clearMapClasses() {
  for (const p of pathEls.values()) p.setAttribute('class', 'country');
}

function markCountry(id, cls) {
  const p = pathEls.get(id);
  if (p) p.setAttribute('class', `country ${cls}`);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const sel = { mode: 'quiz', continent: 'World', difficulty: 'easy', question: 'location', rival: 'kid' };

// Countries you've missed and haven't yet mastered: accuracy < 85%, or ones
// that flipped back to unlearned — lost ground is exactly what Review is for.
function reviewPool(pool) {
  return pool.filter((c) => {
    const s = store.stats[c.id];
    if (!s || !s.seen) return false;
    if (s.learned === false) return true;
    return !s.learned && s.correct < s.seen && s.correct / s.seen < 0.85;
  });
}

function renderOptionGroup(el, options, selectedId, onPick) {
  el.innerHTML = '';
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = opt.sub
      ? `${opt.label}<span class="sub">${opt.sub}</span>`
      : opt.label;
    if (opt.id === selectedId) b.classList.add('selected');
    b.addEventListener('click', () => onPick(opt.id));
    el.appendChild(b);
  }
}

function renderMenu() {
  const level = levelForXp(store.xp);
  Wardrobe.check('mapmaster', level);
  $('menu-level').textContent = level;
  const cur = store.xp - xpAtLevel(level);
  const need = xpAtLevel(level + 1) - xpAtLevel(level);
  $('xp-fill').style.width = `${Math.min(100, (cur / need) * 100)}%`;
  $('xp-label').textContent = `${cur} / ${need} XP to level ${level + 1}`;

  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  $('profile-stats').innerHTML =
    `<span><b>${store.games}</b> games</span>` +
    `<span><b>${learnedCount()}</b> learned</span>` +
    `<span><b>${acc}%</b> accuracy</span>`;

  renderOptionGroup($('mode-options'), MODES, sel.mode, (id) => { sel.mode = id; renderMenu(); });
  renderOptionGroup($('question-options'), QUESTIONS, sel.question, (id) => { sel.question = id; renderMenu(); });
  renderOptionGroup(
    $('continent-options'),
    CONTINENTS.map((c) => ({ id: c, label: c, sub: `${poolFor(c).length} countries` })),
    sel.continent,
    (id) => { sel.continent = id; renderMenu(); }
  );
  renderOptionGroup($('difficulty-options'), DIFFICULTIES, sel.difficulty, (id) => { sel.difficulty = id; renderMenu(); });

  const isRace = sel.mode === 'race';
  $('rival-block').classList.toggle('hidden', !isRace);
  if (isRace && window.Rival) {
    const rivalOpts = [...Rival.list().map((r) => ({ id: r.id, label: `${r.icon} ${r.label}` })), { id: 'random', label: '🎲 Random' }];
    renderOptionGroup($('rival-options'), rivalOpts, sel.rival, (id) => { sel.rival = id; renderMenu(); });
    $('rival-blurb').textContent = sel.rival === 'random'
      ? 'Take whoever shows up at the line — the rival is revealed when the race starts.'
      : Rival.find(sel.rival).blurb;
  }

  const isExplore = sel.mode === 'explore';
  $('difficulty-heading').style.opacity = isExplore ? .35 : 1;
  for (const b of $('difficulty-options').children) b.disabled = isExplore;
  $('question-heading').style.opacity = isExplore ? .35 : 1;
  for (const b of $('question-options').children) b.disabled = isExplore;

  const reviewCount = sel.mode === 'review' ? reviewPool(poolFor(sel.continent)).length : null;
  const bestKey = `${sel.mode}|${sel.continent}|${sel.difficulty}|${sel.question}`;
  const best = store.best[bestKey];
  $('start-btn').disabled = reviewCount === 0;
  $('setup-hint').textContent =
    isExplore ? 'Free browsing — questions and difficulty don\'t apply.'
      : reviewCount === 0 ? 'Review deck is empty here — miss a few countries in other modes first!'
      : reviewCount ? `${reviewCount} countr${reviewCount === 1 ? 'y' : 'ies'} in your review deck.`
      : best ? `Your best for these settings: ${best} pts`
      : 'No score yet for these settings — set the bar!';
}

// ---------------------------------------------------------------------------
// Stats screen
// ---------------------------------------------------------------------------

// Mastery of one country: its lifetime accuracy, 0 if never quizzed.
function masteryOf(c) {
  const s = store.stats[c.id];
  return s && s.seen ? s.correct / s.seen : 0;
}

function badgeFor(pct) {
  if (pct >= 90) return '🥇';
  if (pct >= 70) return '🥈';
  if (pct >= 40) return '🥉';
  return '';
}

function renderStats() {
  const realContinents = CONTINENTS.filter((c) => c !== 'World' && c !== 'Americas');
  const rows = realContinents.map((name) => {
    const pool = poolFor(name);
    const seen = pool.filter((c) => store.stats[c.id] && store.stats[c.id].seen).length;
    const learned = pool.filter((c) => store.stats[c.id] && store.stats[c.id].learned).length;
    const mastery = Math.round(
      (pool.reduce((sum, c) => sum + masteryOf(c), 0) / pool.length) * 100
    );
    return `
      <div class="continent-row">
        <div class="ring" style="--p:${mastery}"><span>${mastery}%</span></div>
        <div class="continent-info">
          <b>${badgeFor(mastery)} ${name}</b>
          <span>${learned} learned · ${seen}/${pool.length} seen</span>
        </div>
      </div>`;
  });
  $('stats-continents').innerHTML = rows.join('');

  const weakest = COUNTRIES
    .filter((c) => store.stats[c.id] && store.stats[c.id].seen > 0 && masteryOf(c) < 1)
    .sort((a, b) => masteryOf(a) - masteryOf(b) || store.stats[b.id].seen - store.stats[a.id].seen)
    .slice(0, 8);
  $('stats-weakest').innerHTML = weakest.length
    ? '<h3>Your trouble spots</h3><div class="chips">' +
      weakest.map((c) => {
        const s = store.stats[c.id];
        return `<span class="chip">${flagImg(c, 'flag-inline')} ${c.name} · ${s.correct}/${s.seen}</span>`;
      }).join('') + '</div>'
    : store.answered
      ? '<h3>No trouble spots — everything you\'ve seen, you\'ve nailed 🎉</h3>'
      : '<h3>Play a few rounds and your stats will show up here.</h3>';
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

let g = null;
let blitzInterval = null;
let raceInterval = null;
let autoNextTimer = null;

function startGame() {
  const difficulty = DIFFICULTIES.find((d) => d.id === sel.difficulty);
  let pool = poolFor(sel.continent);
  if (sel.mode === 'review') {
    pool = reviewPool(pool);
    if (!pool.length) return; // Start is disabled, but guard anyway
  }
  const endless = sel.mode === 'blitz' || sel.mode === 'marathon' || sel.mode === 'race';
  g = {
    // Client-generated so a retried sync can't double-count this session.
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    startedAt: Date.now(),
    roundStartedAt: Date.now(),
    log: [],
    mode: sel.mode,
    continent: sel.continent,
    difficulty,
    question: sel.question,
    qtype: 'location',
    pool,
    queue: [],
    queuePos: 0,
    round: 0,
    rounds: endless ? Infinity : Math.min(QUIZ_ROUNDS, pool.length),
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    missed: [],
    target: null,
    attemptsLeft: 0,
    locked: false,
    lives: sel.mode === 'marathon' ? MARATHON_LIVES : null,
    dead: false,
    zoomedOut: false,
    endsAt: null,
  };

  if (endless) {
    g.queue = shuffle(pool.slice());
  } else if (g.mode !== 'explore') {
    g.queue = weightedSample(pool, g.rounds);
  }

  clearMapClasses();
  showScreen('game');
  $('feedback').textContent = '';
  $('feedback').className = '';
  $('explore-info').classList.add('hidden');
  $('next-btn').classList.add('hidden');
  $('explore-done').classList.toggle('hidden', g.mode !== 'explore');
  $('hud-timer').classList.toggle('hidden', g.mode !== 'blitz');
  $('hud-timer').classList.remove('urgent');
  svg.classList.toggle('clickable', g.mode === 'find' || g.mode === 'explore');
  updateHud();

  setViewBox({ x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT });
  if (g.mode === 'explore') {
    animateCamera(regionCamera(pool));
    $('prompt').innerHTML = 'Hover to see names, click a country to zoom in.';
    $('choices').innerHTML = '';
    $('type-form').classList.add('hidden');
    $('zoom-toggle').classList.remove('hidden');
    setZoomToggle(true);
    return;
  }

  if (g.mode === 'blitz') {
    g.endsAt = Date.now() + BLITZ_SECONDS * 1000;
    blitzInterval = setInterval(tickBlitz, 150);
    tickBlitz();
  }

  if (g.mode === 'race') {
    $('racer-you').innerHTML = '';
    const you = Avatar.create($('racer-you'), { ink: Wardrobe.ink(), gear: Wardrobe.gear(), facing: 'e' });
    you.pose('run');
    const rivalId = sel.rival === 'random'
      ? Rival.list()[Math.floor(Math.random() * Rival.list().length)].id
      : sel.rival;
    if (sel.rival === 'random' && window.Juice) {
      const def = Rival.find(rivalId);
      Juice.toast(`🎲 ${def.icon} ${def.name} steps up`);
    }
    Rival.start({
      rivalId,
      legs: RACE_LEGS,
      difficultyId: sel.difficulty,
      // Mapmaster has no question clock; this only feeds the no-history
      // fallback pace (~5.4s a question).
      difficultySeconds: 12,
      drawTopic: () => g.pool[Math.floor(Math.random() * g.pool.length)].continent,
      baseMsFor: (cont) => {
        const p = store.pace[cont];
        return p && p.n ? p.ms / p.n : 0;
      },
      missRateFor: (cont) => {
        const p = store.pace[cont];
        return p && p.n >= 3 ? p.miss / p.n : null;
      },
      playerInk: Wardrobe.ink(),
      playerGear: Wardrobe.gear(),
    });
    raceInterval = setInterval(() => {
      // The rival can cross the line while you're mid-question; the round in
      // progress still resolves, then nextRound routes to the results.
      if (Rival.tick() && g && g.locked === false) updateHud();
    }, 100);
  }

  nextRound();
}

// Ship the finished session to Atlas, if cloud sync is switched on. Abandoned
// runs are sent too — those answers were real practice and already count toward
// local mastery — but flagged so half-finished runs don't distort score and
// accuracy trends.
function syncSession(aborted, xpGain) {
  if (!g || !g.log.length) return;
  Sync.record({
    game: 'mapmaster',
    session: {
      client_session_id: g.id,
      mode: g.mode,
      continent: g.continent,
      difficulty: g.difficulty.id,
      question_type: g.question,
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
  clearInterval(blitzInterval);
  blitzInterval = null;
  clearInterval(raceInterval);
  raceInterval = null;
  clearTimeout(autoNextTimer);

  let race = null;
  if (g.mode === 'race') {
    race = Rival.result();
    Rival.stop();
  }

  if (aborted || g.mode === 'explore') {
    syncSession(true, 0);
    showScreen('menu');
    renderMenu();
    g = null;
    return;
  }

  // Winning the race is worth a fat bonus, scaled by how it was won.
  if (race && race.won) {
    g.score += Math.round(2.5 * g.difficulty.points + 100 * Math.min(3, Math.max(0, race.margin)));
  }

  const xpBefore = store.xp;
  const levelBefore = levelForXp(xpBefore);
  const xpGain = Math.round(g.score / 10);
  store.xp += xpGain;
  Wardrobe.earn(xpGain / 2);
  store.games += 1;

  const bestKey = `${g.mode}|${g.continent}|${g.difficulty.id}|${g.question}`;
  const isBest = g.score > 0 && g.score > (store.best[bestKey] || 0);
  if (isBest) store.best[bestKey] = g.score;
  saveStore();
  syncSession(false, xpGain);

  const levelAfter = levelForXp(store.xp);
  $('results-title').textContent =
    race ? (race.won
      ? (race.photoFinish ? `🏁 Photo finish — you got ${race.rival.name}!` : `🏁 You beat ${race.rival.name}!`)
      : `${race.rival.icon} ${race.rival.name} took it — ${race.you}/${race.legs} when it crossed`)
      : g.mode === 'blitz' ? "Time's up!"
      : g.mode === 'marathon' ? `💀 Out of lives — ${g.correct} correct!`
      : 'Round complete!';
  $('results-score').innerHTML = `${g.score}<small>points · +${xpGain} XP</small>`;
  $('results-best').classList.toggle('hidden', !isBest);
  const lvUp = levelAfter > levelBefore;
  $('results-levelup').classList.toggle('hidden', !lvUp);
  if (lvUp) $('results-levelup').textContent = `⬆ Level up! You reached level ${levelAfter}`;

  const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${g.correct}/${g.answered}</b><span>correct</span></div>` +
    `<div class="stat"><b>${acc}%</b><span>accuracy</span></div>` +
    `<div class="stat"><b>${g.bestStreak}</b><span>best streak</span></div>` +
    `<div class="stat"><b>${store.best[bestKey] || 0}</b><span>best score</span></div>` +
    (g.newlyLearned ? `<div class="stat"><b>+${g.newlyLearned}</b><span>learned 🎉</span></div>` : '') +
    (g.newlyLost ? `<div class="stat"><b>−${g.newlyLost}</b><span>slipped — review them</span></div>` : '');

  const missedEl = $('results-missed');
  if (g.missed.length) {
    const chips = g.missed.map((c) => `<span class="chip">${c.name}</span>`).join('');
    missedEl.innerHTML = `<h3>Ones to review</h3><div class="chips">${chips}</div>`;
  } else {
    missedEl.innerHTML = g.answered ? '<h3>Nothing missed — perfect run 🎉</h3>' : '';
  }

  showScreen('results');

  // The end-of-round payoff. A level-up outranks everything else on screen, so
  // it gets its own beat after the confetti.
  const scoreEl = $('results-score');
  Juice.replay(scoreEl, 'pop');
  const clean = g.answered > 0 && !g.missed.length;
  if (isBest || clean) Juice.celebrate(scoreEl);
  if (lvUp) setTimeout(() => Juice.levelUp(levelAfter), 500);
}

function recordAnswer(country, wasCorrect) {
  g.answered += 1;
  store.answered += 1;

  // Per-continent pace — what the rival racer is calibrated from.
  const elapsed = Math.max(0, Date.now() - g.roundStartedAt);
  const pace = store.pace[country.continent] || (store.pace[country.continent] = { ms: 0, n: 0, miss: 0 });
  pace.ms += elapsed;
  pace.n += 1;
  if (!wasCorrect) pace.miss += 1;

  if (g.mode === 'race') {
    if (wasCorrect) Rival.advanceYou();
    else Rival.missedLeg();
  }

  // Per-answer detail is what makes "am I actually getting better at Central
  // Asia?" answerable later; session totals alone can't show that.
  g.log.push({
    item_id: country.cca2,
    item_name: country.name,
    correct: wasCorrect,
    ms: Math.max(0, Date.now() - g.roundStartedAt),
    answered_at: new Date().toISOString(),
  });
  const s = store.stats[country.id] || (store.stats[country.id] = { seen: 0, correct: 0, run: 0 });
  s.seen += 1;
  if (wasCorrect) {
    g.correct += 1;
    store.correct += 1;
    s.correct += 1;
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    s.run = (s.run || 0) > 0 ? s.run + 1 : 1;
    if (!s.learned && s.run >= LEARN_RUN) {
      s.learned = true;
      g.newlyLearned = (g.newlyLearned || 0) + 1;
      // The flip is the reward moment — name it the instant it happens.
      if (window.Juice) Juice.toast(`✓ ${country.name} learned — ${learnedCount()} total`);
    }
  } else {
    g.streak = 0;
    g.missed.push(country);
    s.run = (s.run || 0) < 0 ? s.run - 1 : -1;
    if (s.learned && -s.run >= UNLEARN_RUN) {
      s.learned = false;
      g.newlyLost = (g.newlyLost || 0) + 1;
    }
  }
  saveStore();
  updateHud();
}

// `anchor` is whatever the player just touched — the confetti and the "+40"
// come out of it, so the reward is attached to the action that earned it.
function awardPoints(multiplier = 1, anchor = null) {
  const streakBonus = Math.min(g.streak, 5) * 10;
  const gained = Math.round(g.difficulty.points * multiplier) + streakBonus;
  g.score += gained;
  updateHud();
  Juice.good({ points: gained, anchor: anchor || $('prompt'), streak: g.streak });
}

function updateHud() {
  $('hud-score').textContent = `${g.score} pts`;
  const streakEl = $('hud-streak');
  const wasStreak = streakEl.textContent;
  streakEl.textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
  if (streakEl.textContent && streakEl.textContent !== wasStreak) {
    Juice.replay(streakEl, 'flare');
    Juice.streak(g.streak, streakEl);
  }
  if (g.mode === 'blitz') {
    $('hud-progress').textContent = `${g.answered} answered`;
  } else if (g.mode === 'race') {
    $('hud-progress').textContent = `🏁 First to ${RACE_LEGS}`;
  } else if (g.mode === 'marathon') {
    const hearts = '❤️'.repeat(g.lives) + '🖤'.repeat(MARATHON_LIVES - g.lives);
    $('hud-progress').textContent = `Question ${Math.max(g.round, 1)} · ${hearts}`;
  } else if (g.mode === 'explore') {
    $('hud-progress').textContent = 'Explore';
    $('hud-score').textContent = '';
  } else {
    $('hud-progress').textContent = `Round ${Math.min(g.round, g.rounds)}/${g.rounds}`;
  }
}

function tickBlitz() {
  if (!g) return;
  const left = Math.max(0, g.endsAt - Date.now());
  const secs = Math.ceil(left / 1000);
  $('hud-timer').textContent = `⏱ ${secs}s`;
  $('hud-timer').classList.toggle('urgent', secs <= 10);
  if (left <= 0) endGame();
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

function drawNextTarget() {
  if (g.rounds === Infinity) {
    if (g.queuePos >= g.queue.length) {
      const last = g.queue[g.queue.length - 1];
      shuffle(g.queue);
      // avoid the same country twice in a row across the reshuffle
      if (g.queue.length > 1 && g.queue[0] === last) {
        [g.queue[0], g.queue[1]] = [g.queue[1], g.queue[0]];
      }
      g.queuePos = 0;
    }
    return g.queue[g.queuePos++];
  }
  return g.queue[g.round - 1];
}

function nextRound() {
  clearTimeout(autoNextTimer);
  if (g.dead) return endGame();
  if (g.mode === 'race' && Rival.active() && Rival.result().finishedBy) return endGame();
  if (g.round >= g.rounds) return endGame();
  g.round += 1;
  g.locked = false;
  g.target = drawNextTarget();
  g.qtype = g.question === 'mix'
    ? ['location', 'capital', 'flag'][Math.floor(Math.random() * 3)]
    : g.question;
  g.attemptsLeft = g.difficulty.attempts;
  g.roundStartedAt = Date.now();
  $('feedback').textContent = '';
  $('feedback').className = '';
  $('next-btn').classList.add('hidden');
  clearMapClasses();
  updateHud();

  if (g.mode === 'find') {
    animateCamera(regionCamera(g.pool));
    $('choices').innerHTML = '';
    $('type-form').classList.add('hidden');
    $('zoom-toggle').textContent = '🌐 Recenter';
    $('zoom-toggle').classList.remove('hidden');
    renderFindPrompt();
    return;
  }

  // quiz-like rounds: pose the question, then MCQ or typing
  g.zoomedOut = false;
  if (g.qtype === 'flag') {
    // don't highlight — the map position would give context away for free;
    // the country is revealed after answering
    $('zoom-toggle').classList.add('hidden');
    animateCamera(regionCamera(g.pool));
    $('prompt').innerHTML =
      `${flagImg(g.target, 'flag-big', 'Flag to identify')}Which country's flag is this?`;
  } else if (g.qtype === 'capital') {
    markCountry(g.target.id, 'target');
    $('zoom-toggle').classList.remove('hidden');
    setZoomToggle(false);
    animateCamera(countryCamera(g.target));
    $('prompt').innerHTML = `What's the capital of <b>${g.target.name}</b>?`;
  } else {
    markCountry(g.target.id, 'target');
    $('zoom-toggle').classList.remove('hidden');
    setZoomToggle(false);
    animateCamera(countryCamera(g.target));
    $('prompt').textContent = 'Which country is highlighted?';
  }

  if (g.difficulty.id === 'hard') {
    $('choices').innerHTML = '';
    $('type-form').classList.remove('hidden');
    const input = $('type-input');
    input.placeholder = g.qtype === 'capital' ? 'Type the capital city…' : 'Type the country name…';
    input.value = '';
    input.disabled = false;
    input.focus();
  } else {
    $('type-form').classList.add('hidden');
    renderChoices();
  }
}

function renderFindPrompt() {
  const dots = '●'.repeat(g.attemptsLeft) + '○'.repeat(g.difficulty.attempts - g.attemptsLeft);
  const ask =
    g.qtype === 'capital' ? `Find the country whose capital is <b>${g.target.capital}</b>`
      : g.qtype === 'flag' ? `Find this flag's country: ${flagImg(g.target, 'flag-mid', 'Flag to find')}`
      : `Find on the map: <b>${g.target.name}</b>`;
  $('prompt').innerHTML = `${ask}<span class="attempts" title="attempts left">${dots}</span>`;
}

function renderChoices() {
  const el = $('choices');
  el.innerHTML = '';
  // For capital questions the pool may repeat a distractor capital label
  // only if two countries share a capital name — which none do at this scale.
  const options = pickChoices(g.target, g.pool, g.difficulty.choices);
  options.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const label = g.qtype === 'capital' ? c.capital : c.name;
    b.innerHTML = `<span class="key">${i + 1}</span>${label}`;
    b.dataset.id = c.id;
    b.addEventListener('click', () => submitChoice(c, b));
    el.appendChild(b);
  });
}

// What the player was asked to produce, for feedback lines.
function answerLabel(c) {
  return g.qtype === 'capital'
    ? `${c.capital} — the capital of ${flagImg(c, 'flag-inline')} ${c.name}`
    : `${flagImg(c, 'flag-inline')} ${c.name}`;
}

// After any quiz-like answer, make sure the target is visible and marked —
// flag questions hide it until now.
function revealTarget() {
  markCountry(g.target.id, 'correct');
  if (g.qtype === 'flag') animateCamera(countryCamera(g.target));
}

function maybeDie(right) {
  if (right || g.mode !== 'marathon') return;
  g.lives -= 1;
  if (g.lives <= 0) g.dead = true;
  updateHud();
}

function finishRound(delayMs) {
  g.locked = true;
  if (g.mode === 'blitz' || g.mode === 'race') {
    autoNextTimer = setTimeout(nextRound, g.mode === 'race' ? 900 : 700);
  } else if (delayMs) {
    autoNextTimer = setTimeout(nextRound, delayMs);
  } else {
    $('next-btn').textContent = g.dead ? 'See results' : 'Next →';
    $('next-btn').classList.remove('hidden');
    $('next-btn').focus();
  }
}

// `html` may contain markup (flag images), so anything player-typed that reaches
// here must be run through esc() by the caller.
function showFeedback(good, html) {
  const el = $('feedback');
  el.innerHTML = html;
  el.className = good ? 'good' : 'bad';
  // Correct answers get their celebration from awardPoints(), which knows what
  // the answer was worth. A miss has nothing to count, so it lands here.
  if (!good) Juice.bad();
}

// --- quiz/blitz answers ----------------------------------------------------

function submitChoice(country, btn) {
  if (g.locked) return;
  const right = country.id === g.target.id;
  recordAnswer(g.target, right);
  maybeDie(right);
  for (const b of $('choices').children) {
    b.disabled = true;
    if (b.dataset.id === g.target.id) b.classList.add('correct');
  }
  revealTarget();
  if (right) {
    awardPoints(1, btn);
    showFeedback(true, `✓ ${answerLabel(g.target)}!`);
    finishRound(900);
  } else {
    btn.classList.add('wrong');
    showFeedback(false, `✗ It's ${answerLabel(g.target)}`);
    finishRound(0);
  }
}

function capitalMatches(guess, country) {
  const gNorm = normalizeName(guess);
  if (!gNorm) return false;
  const cap = normalizeName(country.capital);
  if (gNorm === cap) return true;
  const tol = gNorm.length > 8 ? 2 : gNorm.length > 4 ? 1 : 0;
  return tol > 0 && levenshtein(gNorm, cap) <= tol;
}

function submitTyped() {
  if (g.locked) return;
  const guess = $('type-input').value;
  if (!guess.trim()) return;
  const right = g.qtype === 'capital'
    ? capitalMatches(guess, g.target)
    : answerMatches(guess, g.target);
  recordAnswer(g.target, right);
  maybeDie(right);
  $('type-input').disabled = true;
  revealTarget();
  if (right) {
    awardPoints();
    showFeedback(true, `✓ ${answerLabel(g.target)}!`);
    finishRound(900);
  } else {
    showFeedback(false, `✗ It's ${answerLabel(g.target)} — you typed “${esc(guess.trim())}”`);
    finishRound(0);
  }
}

function revealTyped() {
  if (g.locked) return;
  recordAnswer(g.target, false);
  maybeDie(false);
  $('type-input').disabled = true;
  revealTarget();
  showFeedback(false, `It's ${answerLabel(g.target)}`);
  finishRound(0);
}

// --- find-it answers -------------------------------------------------------

function handleFindClick(clicked) {
  if (g.locked) return;
  if (clicked.id === g.target.id) {
    const attemptIndex = g.difficulty.attempts - g.attemptsLeft;
    const multiplier = [1, 0.6, 0.3][attemptIndex] || 0.3;
    recordAnswer(g.target, attemptIndex === 0);
    const hit = pathEls.get(g.target.id) || $('map');
    if (attemptIndex > 0) {
      // found it, but not first try — no streak, partial points
      const partial = Math.round(g.difficulty.points * multiplier);
      g.score += partial;
      updateHud();
      Juice.good({ points: partial, anchor: hit, streak: 0 });
    } else {
      awardPoints(1, hit);
    }
    markCountry(g.target.id, 'correct');
    animateCamera(countryCamera(g.target));
    showFeedback(true, `✓ That's ${flagImg(g.target, 'flag-inline')} ${g.target.name}!`);
    finishRound(900);
    return;
  }
  g.attemptsLeft -= 1;
  const p = pathEls.get(clicked.id);
  if (p) {
    p.setAttribute('class', 'country wrong');
    setTimeout(() => {
      if (p.getAttribute('class') === 'country wrong') p.setAttribute('class', 'country');
    }, 900);
  }
  if (g.attemptsLeft <= 0) {
    recordAnswer(g.target, false);
    markCountry(g.target.id, 'correct');
    animateCamera(countryCamera(g.target));
    showFeedback(false, `That was ${clicked.name}. ${flagImg(g.target, 'flag-inline')} ${g.target.name} is here.`);
    finishRound(0);
  } else {
    renderFindPrompt();
    showFeedback(false, `That's ${clicked.name} — try again!`);
  }
}

// --- explore ---------------------------------------------------------------

function handleExploreClick(country) {
  tip.classList.add('hidden'); // stale once the camera moves
  clearMapClasses();
  markCountry(country.id, 'target');
  animateCamera(countryCamera(country));
  const s = store.stats[country.id];
  const seen = s ? `You've answered it ${s.seen} time${s.seen === 1 ? '' : 's'} (${s.correct} correct).`
    : 'You haven\'t been quizzed on it yet.';
  const info = $('explore-info');
  info.classList.remove('hidden');
  info.innerHTML =
    `<h3>${flagImg(country, 'flag-inline')} ${country.name}</h3>` +
    `<p>Capital: ${country.capital} · ${country.continent} · ${seen}</p>`;
  setZoomToggle(false);
}

// ---------------------------------------------------------------------------
// Camera toggle & map events
// ---------------------------------------------------------------------------

function setZoomToggle(zoomedOut) {
  g.zoomedOut = zoomedOut;
  $('zoom-toggle').textContent = zoomedOut ? '🔍 Zoom in' : '🌐 Zoom out';
}

$('zoom-toggle').addEventListener('click', () => {
  if (!g) return;
  if (g.mode === 'find') {
    animateCamera(regionCamera(g.pool));
    return;
  }
  if (g.mode === 'explore') {
    // explore: the button always resets to the region view; zooming back
    // in happens by clicking a country
    clearMapClasses();
    $('explore-info').classList.add('hidden');
    animateCamera(regionCamera(g.pool));
    setZoomToggle(true);
    return;
  }
  if (g.zoomedOut) {
    animateCamera(countryCamera(g.target));
    setZoomToggle(false);
  } else {
    animateCamera(g.continent !== 'World'
      ? regionCamera(g.pool)
      : { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT });
    setZoomToggle(true);
  }
});

const countryFromEvent = (e) => {
  const id = e.target.dataset && e.target.dataset.id;
  return id ? COUNTRIES.find((c) => c.id === id) : null;
};

svg.addEventListener('click', (e) => {
  if (!g) return;
  if (didPan) { didPan = false; return; } // that was a drag, not a tap
  const c = countryFromEvent(e);
  if (!c) return;
  if (g.mode === 'find') handleFindClick(c);
  else if (g.mode === 'explore') handleExploreClick(c);
});

// Hover tooltip — explore mode only (in find mode it would give the answer away).
svg.addEventListener('mousemove', (e) => {
  if (!g || g.mode !== 'explore') { tip.classList.add('hidden'); return; }
  const c = countryFromEvent(e);
  if (!c) { tip.classList.add('hidden'); return; }
  const rect = $('map').parentElement.getBoundingClientRect();
  tip.textContent = c.name;
  tip.style.left = `${e.clientX - rect.left}px`;
  tip.style.top = `${e.clientY - rect.top}px`;
  tip.classList.remove('hidden');
});
svg.addEventListener('mouseleave', () => tip.classList.add('hidden'));

// ---------------------------------------------------------------------------
// Screen wiring
// ---------------------------------------------------------------------------

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('active', key === name);
  }
}

$('start-btn').addEventListener('click', startGame);
$('quit-btn').addEventListener('click', () => endGame(true));
$('next-btn').addEventListener('click', nextRound);
$('explore-done').addEventListener('click', () => endGame(true));
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

$('type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitTyped();
});
$('reveal-btn').addEventListener('click', revealTyped);

document.addEventListener('keydown', (e) => {
  if (!g || screens.game.classList.contains('active') === false) return;
  if (e.target === $('type-input')) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    const btn = $('choices').children[n - 1];
    if (btn && !btn.disabled) btn.click();
  } else if (e.key === 'Enter' && !$('next-btn').classList.contains('hidden')) {
    nextRound();
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

buildMap();
Wardrobe.attach('mapmaster');
renderMenu();
Sync.mountUI();

// Quick play (hub / next-game links carry ?play=1): arriving means START —
// straight into a session with the defaults, no menu stop.
if (new URLSearchParams(location.search).has('play')) startGame();
