/* game.js — Chronicle: learn the timeline of history.
 *
 * The journal goal behind this game: be able to say what was happening in
 * 50 BC, 0–1000, the 1500s, the 1700s, the 1900s, and the 2000s. So every
 * question is some form of "place this in time" — which era, which came first,
 * which year — and every answer teaches the why, not just the when.
 *
 * Selection is adaptive (events you miss come back more often), progress and
 * per-event accuracy persist in localStorage, and sessions sync to Atlas like
 * every other game.
 */
'use strict';

const STORE_KEY = 'chronicle.profile.v1';
const QUIZ_ROUNDS = 10;
const SEQ_ROUNDS = 5;
const BLITZ_SECONDS = 60;
const QUESTION_SECONDS = 20;
const MASTERY = 0.85;

const MODES = [
  { id: 'classic', label: 'Classic', icon: '🎯', hint: 'Ten questions — eras, which-came-first, and years.' },
  { id: 'sequence', label: 'Sequence', icon: '🔗', hint: 'Put four events in chronological order. The drill that builds the timeline itself.' },
  { id: 'blitz', label: 'Blitz', icon: '⏱', hint: '60 seconds of era-spotting — as many as you can.' },
  { id: 'review', label: 'Review', icon: '📚', hint: 'Drills only the events you keep missing, until you don\'t.' },
];

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const screens = {
  menu: $('screen-menu'),
  game: $('screen-game'),
  results: $('screen-results'),
  stats: $('screen-stats'),
  learn: $('screen-learn'),
};

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

// ---------------------------------------------------------------------------
// Persistent profile
// ---------------------------------------------------------------------------

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {}, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {} };
}

const store = loadStore();
const saveStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));

const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

const statFor = (id) => store.stats[id] || { seen: 0, correct: 0 };
const masteryOf = (id) => { const s = statFor(id); return s.seen ? s.correct / s.seen : 0; };

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const eraOf = (ev) => ERAS.find((e) => e.id === ev.era);
const eraName = (id) => ERAS.find((e) => e.id === id).name;

function fmtYear(y) {
  if (y < 0) return `${-y} BC`;
  if (y < 1000) return `AD ${y}`;
  return String(y);
}

function fmtEraSpan(era) {
  const to = era.to >= 2100 ? 'today' : fmtYear(era.to);
  return `${fmtYear(era.from)} – ${to}`;
}

// ---------------------------------------------------------------------------
// Pools & adaptive selection
// ---------------------------------------------------------------------------

function poolFor(eraId) {
  return eraId === 'all' ? EVENTS.slice() : EVENTS.filter((e) => e.era === eraId);
}

// Events you've never seen, or often miss, get a higher weight.
function weightFor(ev) {
  const s = statFor(ev.id);
  if (!s.seen) return 2.5;
  return 1 + 3 * (1 - s.correct / s.seen);
}

function weightedDraw(pool, exclude = new Set()) {
  const items = pool.filter((e) => !exclude.has(e.id));
  if (!items.length) return pool[Math.floor(Math.random() * pool.length)];
  let total = 0;
  const weights = items.map((e) => { const w = weightFor(e); total += w; return w; });
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function reviewPool() {
  return EVENTS.filter((e) => {
    const s = statFor(e.id);
    return s.seen > 0 && s.correct / s.seen < MASTERY;
  });
}

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------
// Every question returns { qtype, text, options: [{label, right, ev}], events }
// — options carry the event(s) they implicate so answers are logged per event.

// "When was X?" — era options, with the neighbouring eras preferred as
// distractors because "one era off" is the actual failure mode.
function qEra(ev) {
  const idx = ERAS.findIndex((e) => e.id === ev.era);
  const neighbours = ERAS.filter((_, i) => i !== idx)
    .sort((a, b) => Math.abs(ERAS.indexOf(a) - idx) - Math.abs(ERAS.indexOf(b) - idx));
  const distractors = shuffle(neighbours.slice(0, 4)).slice(0, 3);
  const options = shuffle([
    { label: `${eraName(ev.era)} (${fmtEraSpan(eraOf(ev))})`, right: true, ev },
    ...distractors.map((e) => ({ label: `${e.name} (${fmtEraSpan(e)})`, right: false, ev })),
  ]);
  return { qtype: 'era', text: `When was this?\n${ev.name}`, options, events: [ev] };
}

// "Which came first?" — two events at least a generation apart, so the answer
// is knowable rather than a coin flip on trivia.
function qFirst(pool, exclude) {
  const a = weightedDraw(pool, exclude);
  const candidates = pool.filter((e) => e.id !== a.id && Math.abs(e.y - a.y) >= 25);
  const b = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : weightedDraw(pool, new Set([...exclude, a.id]));
  const first = a.y <= b.y ? a : b;
  const options = shuffle([
    { label: a.name, right: a === first, ev: a },
    { label: b.name, right: b === first, ev: b },
  ]);
  return { qtype: 'first', text: 'Which came first?', options, events: [a, b] };
}

// "Which of these happened during [era]?" — the reverse of qEra.
function qInEra(ev) {
  const others = shuffle(EVENTS.filter((e) => e.era !== ev.era)).slice(0, 3);
  const options = shuffle([
    { label: ev.name, right: true, ev },
    ...others.map((e) => ({ label: e.name, right: false, ev })),
  ]);
  return {
    qtype: 'inera',
    text: `Which of these happened in the ${eraName(ev.era)} (${fmtEraSpan(eraOf(ev))})?`,
    options,
    events: [ev],
  };
}

// "What year?" — only for events from 1450 on, where exact years are fair game.
function qYear(ev) {
  const offsets = shuffle([4, 7, 9, 12, 15, 19, 23, 28, 34, 41]);
  const years = new Set([ev.y]);
  for (const off of offsets) {
    if (years.size >= 4) break;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const y = ev.y + sign * off;
    if (y <= new Date().getFullYear() + 1) years.add(y);
  }
  const options = shuffle([...years].map((y) => ({ label: String(y), right: y === ev.y, ev })));
  return { qtype: 'year', text: `What year?\n${ev.name}`, options, events: [ev] };
}

function makeQuestion(pool, exclude) {
  const ev = weightedDraw(pool, exclude);
  const kinds = ['era', 'first', 'inera'];
  if (ev.y >= 1450) kinds.push('year', 'year'); // exact years only where fair
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  if (kind === 'first') return qFirst(pool, exclude);
  if (kind === 'inera') return qInEra(ev);
  if (kind === 'year') return qYear(ev);
  return qEra(ev);
}

// Four events for ordering, pairwise at least 25 years apart.
function makeSequence(pool) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const picked = [];
    const used = new Set();
    while (picked.length < 4 && used.size < pool.length) {
      const ev = weightedDraw(pool, used);
      used.add(ev.id);
      if (picked.every((p) => Math.abs(p.y - ev.y) >= 25)) picked.push(ev);
    }
    if (picked.length === 4) return shuffle(picked);
  }
  return shuffle(pool.slice(0, 4));
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const sel = { mode: 'classic', era: 'all' };

function optionButton(label, active, onPick) {
  const b = document.createElement('button');
  b.className = active ? 'active' : '';
  b.innerHTML = label;
  b.addEventListener('click', onPick);
  return b;
}

function renderMenu() {
  const level = levelForXp(store.xp);
  $('menu-level').textContent = level;
  const cur = store.xp - xpAtLevel(level);
  const need = xpAtLevel(level + 1) - xpAtLevel(level);
  $('xp-fill').style.width = `${Math.min(100, (cur / need) * 100)}%`;
  $('xp-label').textContent = `${cur} / ${need} XP to level ${level + 1}`;

  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  $('profile-stats').innerHTML =
    `<span><b>${store.games}</b> games</span>` +
    `<span><b>${store.correct}</b> correct</span>` +
    `<span><b>${acc}%</b> accuracy</span>`;

  const modes = $('mode-options');
  modes.innerHTML = '';
  MODES.forEach((m) => modes.appendChild(
    optionButton(`<span class="opt-icon">${m.icon}</span>${m.label}`, sel.mode === m.id,
      () => { sel.mode = m.id; renderMenu(); })
  ));

  const eras = $('era-options');
  eras.innerHTML = '';
  [{ id: 'all', name: 'All of history' }, ...ERAS].forEach((e) => eras.appendChild(
    optionButton(e.name, sel.era === e.id, () => { sel.era = e.id; renderMenu(); })
  ));

  const mode = MODES.find((m) => m.id === sel.mode);
  const rCount = sel.mode === 'review' ? reviewPool().length : null;
  $('start-btn').disabled = rCount === 0;
  // You can't retrieve what was never stored — until something has been
  // answered, the honest recommendation is input first, quiz second.
  const firstRun = store.answered === 0
    ? 'New here? Start with 📖 Learn an era — read the story, then quiz exactly what you read. '
    : '';
  $('setup-hint').textContent = rCount === 0
    ? 'Nothing to review yet — play a round first and come back.'
    : firstRun + (rCount !== null ? `${mode.hint} ${rCount} event${rCount === 1 ? '' : 's'} in the deck.` : mode.hint);
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

let g = null;
let ticker = null;

function startGame() {
  const pool = sel.mode === 'review' ? reviewPool() : poolFor(sel.era);
  if (pool.length < 4) return;

  g = {
    // Client-generated so a retried sync can't double-count this session.
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    startedAt: Date.now(),
    questionStartedAt: Date.now(),
    log: [],
    mode: sel.mode,
    era: sel.era,
    pool,
    asked: new Set(),
    round: 0,
    rounds: sel.mode === 'blitz' ? Infinity : sel.mode === 'sequence' ? SEQ_ROUNDS : QUIZ_ROUNDS,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    missed: [],
    current: null,
    seq: null,
    locked: false,
    endsAt: sel.mode === 'blitz' ? Date.now() + BLITZ_SECONDS * 1000 : null,
  };

  showScreen('game');
  $('hud-clock').classList.toggle('hidden', sel.mode !== 'blitz');
  clearInterval(ticker);
  ticker = setInterval(tick, 100);
  nextRound();
}

function tick() {
  if (!g) return;
  if (g.endsAt) {
    const left = Math.max(0, g.endsAt - Date.now());
    $('hud-clock').textContent = `⏱ ${Math.ceil(left / 1000)}s`;
    if (left <= 0) return endGame();
  }
  if (g.locked || g.mode === 'sequence') return;

  const limit = QUESTION_SECONDS * 1000;
  const spent = Date.now() - g.questionStartedAt;
  const frac = Math.max(0, 1 - spent / limit);
  const fill = $('timer-fill');
  fill.style.width = `${frac * 100}%`;
  fill.className = frac < 0.25 ? 'low' : '';
  // Running out of time is a miss — hesitating over a date you don't know
  // is the thing spaced repetition exists to fix.
  if (g.mode !== 'blitz' && spent >= limit) answer(null);
}

function nextRound() {
  if (!g) return;
  if (g.round >= g.rounds) return endGame();
  g.round += 1;
  g.locked = false;
  g.questionStartedAt = Date.now();
  $('feedback').textContent = '';
  $('feedback').className = '';
  $('next-btn').classList.add('hidden');
  $('timer-fill').style.width = '100%';
  $('timer-fill').className = '';

  if (g.mode === 'sequence') return renderSequence();

  g.current = g.mode === 'blitz'
    ? qEra(weightedDraw(g.pool, g.asked))
    : makeQuestion(g.pool, g.asked);
  g.current.events.forEach((e) => g.asked.add(e.id));
  // Recycle once the pool is exhausted rather than repeating back-to-back.
  if (g.asked.size >= g.pool.length) g.asked.clear();

  const tagNames = { era: 'Place the era', first: 'Order', inera: 'Era spotting', year: 'Exact year' };
  $('topic-tag').textContent = tagNames[g.current.qtype];
  $('question').innerHTML = g.current.text.split('\n')
    .map((line, i) => i === 0 ? `<span class="q-lead">${esc(line)}</span>` : `<span class="q-event">${esc(line)}</span>`)
    .join('');
  $('seq-area').classList.add('hidden');

  const el = $('choices');
  el.innerHTML = '';
  el.classList.remove('hidden');
  g.current.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="key">${i + 1}</span>${esc(opt.label)}`;
    b.style.animationDelay = `${i * 45}ms`;
    b.classList.add('enter');
    b.addEventListener('click', () => answer(opt, b));
    el.appendChild(b);
  });

  updateHud();
}

function updateHud() {
  $('hud-progress').textContent = Number.isFinite(g.rounds)
    ? `Q ${Math.min(g.round, g.rounds)}/${g.rounds}`
    : `${g.answered} answered`;
  $('hud-score').textContent = `${g.score.toLocaleString()} pts`;
  $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
}

// ---------------------------------------------------------------------------
// Answering (choice questions)
// ---------------------------------------------------------------------------

function recordAnswer(ev, wasCorrect, elapsedMs) {
  g.answered += 1;
  store.answered += 1;
  const s = store.stats[ev.id] || (store.stats[ev.id] = { seen: 0, correct: 0 });
  s.seen += 1;
  if (wasCorrect) { store.correct += 1; s.correct += 1; }
  g.log.push({
    item_id: ev.id,
    item_name: ev.name,
    correct: wasCorrect,
    ms: elapsedMs,
    answered_at: new Date().toISOString(),
  });
}

function awardPoints(elapsedMs) {
  const speed = Math.max(0, 1 - elapsedMs / (QUESTION_SECONDS * 1000));
  const pts = Math.round((60 + 60 * speed) + 10 * Math.min(g.streak, 10));
  g.score += pts;
  return pts;
}

// `opt` is null when the clock ran out.
function answer(opt, btn) {
  if (!g || g.locked) return;
  g.locked = true;

  const q = g.current;
  const elapsed = Date.now() - g.questionStartedAt;
  const right = Boolean(opt && opt.right);
  // "Which came first" implicates both events; the others implicate one.
  const primary = q.qtype === 'first'
    ? q.options.find((o) => o.right).ev
    : q.events[0];
  recordAnswer(primary, right, elapsed);

  const whyLine = (ev) => `${fmtYear(ev.y)} — ${esc(ev.why)}`;

  if (right) {
    g.correct += 1;
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    const pts = awardPoints(elapsed);
    if (btn) btn.classList.add('correct');
    if (window.Juice) {
      if (g.streak >= 2) Juice.streak(g.streak, $('hud-streak'));
      Juice.good({ points: pts, anchor: btn || $('question'), streak: g.streak });
    }
    showFeedback(true, `✓ ${whyLine(primary)}`);
  } else {
    g.streak = 0;
    g.missed.push(primary);
    if (btn) btn.classList.add('wrong');
    if (window.Juice) Juice.bad();
    const lead = opt === null ? '⏱ Time\'s up —' : '✗';
    showFeedback(false, `${lead} <b>${esc(primary.name)}</b>: ${whyLine(primary)}`);
  }

  [...$('choices').children].forEach((b, i) => {
    if (q.options[i] && q.options[i].right) b.classList.add('correct');
    b.disabled = true;
  });

  $('timer-fill').style.width = '0%';
  updateHud();

  if (g.mode === 'blitz') setTimeout(nextRound, right ? 600 : 1600);
  else $('next-btn').classList.remove('hidden');
}

function showFeedback(good, html) {
  const el = $('feedback');
  el.innerHTML = html;
  el.className = good ? 'good' : 'bad';
}

// ---------------------------------------------------------------------------
// Sequence rounds
// ---------------------------------------------------------------------------

function renderSequence() {
  g.seq = { events: makeSequence(g.pool), placed: [] };
  g.seq.events.forEach((e) => g.asked.add(e.id));

  $('topic-tag').textContent = 'Chronological order';
  $('question').innerHTML = '<span class="q-lead">Earliest first — tap in order</span>';
  $('choices').classList.add('hidden');
  $('seq-area').classList.remove('hidden');
  $('seq-check').disabled = true;
  drawSequence();
  updateHud();
}

function drawSequence() {
  const slots = $('seq-slots');
  slots.innerHTML = '';
  g.seq.placed.forEach((ev, i) => {
    const chip = document.createElement('button');
    chip.className = 'seq-chip';
    chip.innerHTML = `<b>${i + 1}</b>${esc(ev.name)}`;
    chip.title = 'Tap to remove';
    chip.addEventListener('click', () => {
      if (g.locked) return;
      g.seq.placed.splice(i, 1);
      drawSequence();
    });
    slots.appendChild(chip);
  });
  for (let i = g.seq.placed.length; i < 4; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'seq-empty';
    empty.textContent = i + 1;
    slots.appendChild(empty);
  }

  const pool = $('seq-pool');
  pool.innerHTML = '';
  g.seq.events.filter((e) => !g.seq.placed.includes(e)).forEach((ev) => {
    const b = document.createElement('button');
    b.textContent = ev.name;
    b.addEventListener('click', () => {
      if (g.locked || g.seq.placed.length >= 4) return;
      g.seq.placed.push(ev);
      drawSequence();
    });
    pool.appendChild(b);
  });

  $('seq-check').disabled = g.seq.placed.length !== 4;
}

function checkSequence() {
  if (!g || g.locked || g.seq.placed.length !== 4) return;
  g.locked = true;

  const correctOrder = g.seq.events.slice().sort((a, b) => a.y - b.y);
  const elapsed = Date.now() - g.questionStartedAt;
  let rightCount = 0;

  g.seq.placed.forEach((ev, i) => {
    const right = correctOrder[i] === ev;
    if (right) rightCount += 1;
    recordAnswer(ev, right, Math.round(elapsed / 4));
    if (!right && !g.missed.includes(ev)) g.missed.push(ev);
  });

  const allRight = rightCount === 4;
  if (allRight) {
    g.correct += 4;
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    const pts = 200 + 10 * Math.min(g.streak, 10);
    g.score += pts;
    if (window.Juice) Juice.good({ points: pts, anchor: $('seq-check'), streak: g.streak });
  } else {
    g.correct += rightCount;
    g.score += rightCount * 30;
    g.streak = 0;
    if (window.Juice) Juice.bad();
  }

  // Reveal the true order, years attached — the teaching moment.
  const slots = $('seq-slots');
  slots.innerHTML = '';
  correctOrder.forEach((ev, i) => {
    const chip = document.createElement('div');
    const placedRight = g.seq.placed[i] === ev;
    chip.className = `seq-chip reveal ${placedRight ? 'right' : 'wrong'}`;
    chip.innerHTML = `<b>${fmtYear(ev.y)}</b>${esc(ev.name)}`;
    slots.appendChild(chip);
  });
  $('seq-pool').innerHTML = '';

  showFeedback(allRight, allRight
    ? `✓ Perfect order — +${200 + 10 * Math.min(g.streak, 10)} pts`
    : `${rightCount}/4 in the right place`);
  $('next-btn').classList.remove('hidden');
  updateHud();
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

// Ship the finished session to Atlas, if cloud sync is on. Abandoned runs sync
// too — the answers were real practice — but flagged so they don't skew trends.
function syncSession(aborted, xpGain) {
  if (!g || !g.log.length) return;
  Sync.record({
    game: 'chronicle',
    session: {
      client_session_id: g.id,
      mode: g.mode,
      continent: g.era === 'all' ? null : g.era,
      difficulty: null,
      question_type: g.mode === 'sequence' ? 'sequence' : 'mix',
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

  const bestKey = `${g.mode}|${g.era}`;
  const isBest = g.score > 0 && g.score > (store.best[bestKey] || 0);
  if (isBest) store.best[bestKey] = g.score;
  saveStore();
  syncSession(false, xpGain);

  const levelAfter = levelForXp(store.xp);
  const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;

  $('results-title').textContent =
    g.mode === 'blitz' ? "Time's up!"
      : g.mode === 'sequence' ? 'Sequences done'
      : g.mode === 'review' ? 'Review round done'
      : 'Round complete';

  $('results-score').innerHTML = `${g.score.toLocaleString()}<span> pts</span>${isBest ? ' <em>new best!</em>' : ''}`;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${g.correct}/${g.answered}</b><span>correct</span></div>` +
    `<div class="stat"><b>${acc}%</b><span>accuracy</span></div>` +
    `<div class="stat"><b>${g.bestStreak}</b><span>best streak</span></div>`;

  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;

  $('results-missed').innerHTML = g.missed.length
    ? '<h3>Worth pinning down</h3>' + g.missed.slice(0, 6).map((ev) =>
      `<div class="missed-row"><code>${fmtYear(ev.y)} · ${esc(ev.name)}</code><span>${esc(ev.why)}</span></div>`).join('')
    : '<p class="clean-sweep">Clean sweep — the timeline held.</p>';

  showScreen('results');
  if (window.Juice) {
    if (isBest || acc >= 80) Juice.celebrate($('results-score'));
    if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
  }
  g = null;
}

// ---------------------------------------------------------------------------
// Learn — the input layer
// ---------------------------------------------------------------------------

let learnEra = ERAS[0].id;

function renderLearn(eraId) {
  learnEra = eraId;
  const era = ERAS.find((e) => e.id === eraId);

  const chips = $('learn-eras');
  chips.innerHTML = '';
  ERAS.forEach((e) => chips.appendChild(
    optionButton(e.name, e.id === eraId, () => renderLearn(e.id))
  ));

  const events = EVENTS.filter((e) => e.era === eraId).sort((a, b) => a.y - b.y);
  $('learn-body').innerHTML =
    `<div class="story-head"><b>${esc(era.name)}</b><small>${fmtEraSpan(era)}</small></div>` +
    `<div class="story">${era.story.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div>` +
    `<div class="story-events"><h3>The events, in order</h3>` +
    events.map((ev) => {
      const s = statFor(ev.id);
      const mark = s.seen ? (masteryOf(ev.id) >= MASTERY ? ' ✓' : '') : '';
      return `<div class="learn-event">
        <b>${fmtYear(ev.y)}</b>
        <span><strong>${esc(ev.name)}${mark}</strong><em>${esc(ev.why)}</em></span>
      </div>`;
    }).join('') + '</div>';
}

// Quiz exactly what was just read — the read → retrieve loop in one tap.
function quizLearnedEra() {
  sel.era = learnEra;
  sel.mode = 'classic';
  renderMenu();
  startGame();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function renderStats() {
  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  const mastered = EVENTS.filter((e) => statFor(e.id).seen > 0 && masteryOf(e.id) >= MASTERY).length;
  $('stats-summary').innerHTML =
    `<span><b>Lv ${levelForXp(store.xp)}</b> · ${store.xp.toLocaleString()} XP</span>` +
    `<span><b>${acc}%</b> accuracy</span>` +
    `<span><b>${mastered}/${EVENTS.length}</b> events mastered</span>`;

  $('stats-eras').innerHTML = '<h3>The timeline</h3>' + ERAS.map((era) => {
    const pool = EVENTS.filter((e) => e.era === era.id);
    const pct = Math.round(
      (pool.reduce((sum, e) => sum + masteryOf(e.id), 0) / pool.length) * 100
    );
    const seen = pool.filter((e) => statFor(e.id).seen > 0).length;
    return `<div class="era-row">
      <span class="era-name"><b>${esc(era.name)}</b><small>${fmtEraSpan(era)} · ${seen}/${pool.length} seen</small></span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="era-num">${pct}%</span>
    </div>`;
  }).join('');

  const weakest = EVENTS
    .filter((e) => statFor(e.id).seen > 0 && masteryOf(e.id) < 1)
    .sort((a, b) => masteryOf(a.id) - masteryOf(b.id))
    .slice(0, 8);
  $('stats-weakest').innerHTML = weakest.length
    ? '<h3>Your blind spots</h3><div class="chips">' + weakest.map((e) => {
      const s = statFor(e.id);
      return `<span class="chip">${fmtYear(e.y)} ${esc(e.name)} · ${s.correct}/${s.seen}</span>`;
    }).join('') + '</div>'
    : '';
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$('start-btn').addEventListener('click', startGame);
$('quit-btn').addEventListener('click', () => endGame(true));
$('next-btn').addEventListener('click', nextRound);
$('seq-check').addEventListener('click', checkSequence);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('learn-btn').addEventListener('click', () => { renderLearn(learnEra); showScreen('learn'); });
$('learn-quiz').addEventListener('click', quizLearnedEra);
$('learn-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

document.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (e.key === 'Escape') return endGame(true);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    const btn = $('choices').children[n - 1];
    if (btn && !btn.disabled && !$('choices').classList.contains('hidden')) btn.click();
  } else if (e.key === 'Enter' && !$('next-btn').classList.contains('hidden')) {
    nextRound();
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

renderMenu();
Sync.mountUI();
