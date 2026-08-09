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
  study: $('screen-study'),
};

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

// ---------------------------------------------------------------------------
// Persistent profile
// ---------------------------------------------------------------------------

// `pinned` is the timeline you have built: an event pins the first time you
// finish the passage that taught it, and never unpins. It is deliberately not
// the same thing as `stats[id].learned` — one records that you were shown where
// this sits, the other that you can retrieve it. The strip draws both.
const BLANK_STORE = {
  xp: 0, games: 0, correct: 0, answered: 0,
  best: {}, stats: {}, studied: {}, studiedAt: {}, pinned: {},
};

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...BLANK_STORE, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { ...BLANK_STORE };
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
// The timeline strip
// ---------------------------------------------------------------------------
// A game about owning the timeline never drew one. This is it: eight era bands,
// every event in the bank a dot at its own year inside its band. A cold dot is
// history you have never been shown; it fills the first time you finish the
// passage that teaches it, and turns gold once you can actually retrieve it.
//
// Bands are equal width but dots sit at their true year within the band, so the
// Ancient World reads as empty road and the Information Age as a pile-up —
// which is the one thing about the shape of history that a list cannot say.

const isPinned = (id) => Boolean(store.pinned && store.pinned[id]);
const pinnedCount = () => EVENTS.filter((e) => isPinned(e.id)).length;

function dotClass(ev) {
  if (statFor(ev.id).learned) return 'learned';
  if (isPinned(ev.id)) return 'pinned';
  return 'cold';
}

function stripHtml(opts = {}) {
  const bands = ERAS.map((era) => {
    const span = era.to - era.from;
    const dots = EVENTS.filter((e) => e.era === era.id).map((ev) => {
      const at = span > 0 ? ((ev.y - era.from) / span) * 100 : 50;
      const pos = Math.min(96, Math.max(4, at));
      const fresh = opts.fresh && opts.fresh.includes(ev.id) ? ' fresh' : '';
      return `<i class="tl-dot ${dotClass(ev)}${fresh}" style="left:${pos.toFixed(2)}%"></i>`;
    }).join('');
    // The label is the era's opening year, not its name. Eight names do not fit
    // across a phone — "Age of Discovery" and "Age of Revolutions" both
    // ellipsize to "AGE OF …" — and on a timeline the axis wants years anyway.
    // The name lives in the tooltip and on the course card.
    return `<span class="tl-era${opts.focus === era.id ? ' focus' : ''}" title="${esc(era.name)} · ${fmtEraSpan(era)}">`
      + `<span class="tl-band">${dots}</span>`
      + `<span class="tl-era-name">${esc(fmtYear(era.from))}</span>`
      + '</span>';
  }).join('');
  return `<div class="tl-strip${opts.compact ? ' compact' : ''}">${bands}</div>`;
}

function renderStrip(host, opts = {}) {
  if (!host) return;
  const legend = opts.compact ? '' : '<div class="tl-legend">'
    + `<b>${pinnedCount()}</b> of ${EVENTS.length} placed`
    + `<span><i class="tl-dot pinned"></i> placed</span>`
    + `<span><i class="tl-dot learned"></i> held</span>`
    + '</div>';
  host.innerHTML = stripHtml(opts) + legend;
}

// Pinning is what finishing a passage buys you. Returns only the ones that were
// new, so the moment can be shown rather than merely recorded.
function pinEvents(ids) {
  store.pinned = store.pinned || {};
  const fresh = ids.filter((id) => !store.pinned[id]);
  fresh.forEach((id) => { store.pinned[id] = true; });
  return fresh;
}

// ---------------------------------------------------------------------------
// Pools & adaptive selection
// ---------------------------------------------------------------------------

function poolFor(eraId) {
  return eraId === 'all' ? EVENTS.slice() : EVENTS.filter((e) => e.era === eraId);
}

// Learned/unlearned, same rule as Mapmaster: three right in a row marks an
// event learned, two wrong in a row takes it back. Runs, not lifetime
// accuracy — current ability is what counts.
const LEARN_RUN = 3;
const UNLEARN_RUN = 2;
const learnedCount = () => Object.values(store.stats).filter((s) => s.learned).length;

// Events you've never seen, or often miss, get a higher weight. Learned ones
// still appear occasionally — a date you never have to defend isn't held.
function weightFor(ev) {
  const s = statFor(ev.id);
  if (!s.seen) return 2.5;
  if (s.learned) return 0.4;
  return 1 + 3 * (1 - s.correct / s.seen) + (s.run < 0 ? 1 : 0);
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
    if (!s.seen) return false;
    if (s.learned === false) return true;   // slipped — exactly what Review is for
    return !s.learned && s.correct / s.seen < MASTERY;
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
  Wardrobe.check('chronicle', level);
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

  renderStrip($('menu-strip'));

  const modes = $('mode-options');
  modes.innerHTML = '';
  MODES.forEach((m) => modes.appendChild(
    optionButton(`<span class="opt-icon">${m.icon}</span>${m.label}`, sel.mode === m.id,
      () => { sel.mode = m.id; renderMenu(); })
  ));

  const eras = $('era-options');
  eras.innerHTML = '';
  // The span is the whole point of the label: "Age of Discovery" tells you
  // nothing on its own; "Age of Discovery / 1450 – 1700" places it immediately.
  const eraChip = (e) => esc(e.name) +
    `<span class="sub">${e.id === 'all' ? '3200 BC – today' : fmtEraSpan(e)}</span>`;
  [{ id: 'all', name: 'All of history' }, ...ERAS].forEach((e) => eras.appendChild(
    optionButton(eraChip(e), sel.era === e.id, () => { sel.era = e.id; renderMenu(); })
  ));

  const mode = MODES.find((m) => m.id === sel.mode);
  const rCount = sel.mode === 'review' ? reviewPool().length : null;
  $('start-btn').disabled = rCount === 0;
  // You can't retrieve what was never stored — until something has been
  // answered, the honest recommendation is input first, quiz second.
  const firstRun = store.answered === 0
    ? 'New here? Study “The shape of history” below — it teaches what the ages actually are. '
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
  const s = store.stats[ev.id] || (store.stats[ev.id] = { seen: 0, correct: 0, run: 0 });
  s.seen += 1;
  if (wasCorrect) {
    store.correct += 1;
    s.correct += 1;
    s.run = (s.run || 0) > 0 ? s.run + 1 : 1;
    if (!s.learned && s.run >= LEARN_RUN) {
      s.learned = true;
      g.newlyLearned = (g.newlyLearned || 0) + 1;
      if (window.Juice) Juice.toast(`✓ ${ev.name} learned — ${learnedCount()} total`);
    }
  } else {
    s.run = (s.run || 0) < 0 ? s.run - 1 : -1;
    if (s.learned && -s.run >= UNLEARN_RUN) {
      s.learned = false;
      g.newlyLost = (g.newlyLost || 0) + 1;
    }
  }
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
  Wardrobe.earn(xpGain / 2);
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
    `<div class="stat"><b>${g.bestStreak}</b><span>best streak</span></div>` +
    (g.newlyLearned ? `<div class="stat"><b>+${g.newlyLearned}</b><span>learned 🎉</span></div>` : '') +
    (g.newlyLost ? `<div class="stat"><b>−${g.newlyLost}</b><span>slipped — review them</span></div>` : '');

  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;

  // The strip belongs to Study; a quiz round leaves it alone.
  $('results-strip').innerHTML = '';

  $('results-missed').innerHTML = g.missed.length
    ? '<h3>Worth pinning down</h3>' + g.missed.slice(0, 6).map((ev) =>
      `<div class="missed-row"><code>${fmtYear(ev.y)} · ${esc(ev.name)}</code><span>${esc(ev.why)}</span></div>`).join('')
    : '<p class="clean-sweep">Clean sweep — the timeline held.</p>';

  $('again-btn').textContent = 'Play again';
  showScreen('results');
  if (window.Juice) {
    if (isBest || acc >= 80) Juice.celebrate($('results-score'));
    if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
  }
  g = null;
}

// ---------------------------------------------------------------------------
// Study — guess it cold, read it, then climb back up
// ---------------------------------------------------------------------------
// The previous loop was a wall of text and a pop quiz: read five events, watch
// the passage vanish, then answer three questions generated by exactly the same
// code the quiz modes use. That is a quiz with a preamble, which is no use at
// all to somebody who cannot do the quiz yet — and that is who Study is for.
//
// Each passage now runs a ladder over the same handful of events:
//
//   PREDICT  order them cold, before reading a word. Unscored, and you are
//            meant to be bad at it: a wrong guess makes the right answer stick
//            better than reading it does, and it gives the section a "before".
//   READ     the reveal *is* the passage — true order, years, and the why.
//   SPOT     questions with the passage still on screen. You cannot fail this.
//   RECALL   the passage goes away. Same events, real retrieval.
//   PLACE    order them again, scored, measured against your opening guess.
//
// The bookend is the whole point. "1/4 cold, 4/4 now" is something you can feel
// inside three minutes, and it is the only part of this game that shows you
// learning rather than testing you.
//
// Two kinds of syllabus share the loop:
//   AGES  — the overview course, with hand-written questions about the ages
//           themselves. A new player should start here, because a date means
//           nothing until you know which age it lands in. It carries no event
//           ids, so it runs the two rungs it can: SPOT open-book, then RECALL.
//   eras  — an era's story split into its paragraphs, with questions generated
//           from exactly the events that paragraph named, and the full ladder.

function syllabusFor(id) {
  const card = ERA_CARDS[id] || {};
  if (id === AGES.id) return { ...AGES, icon: card.icon, what: card.what };
  const era = ERAS.find((e) => e.id === id);
  if (!era) return null;
  const parts = ERA_SECTIONS[era.id] || [];
  return {
    id: era.id,
    name: era.name,
    blurb: fmtEraSpan(era),
    icon: card.icon,
    what: card.what,
    era,
    sections: parts.map((p, i) => ({
      title: `${era.name} · part ${i + 1} of ${parts.length}`,
      headline: p.headline,
      lead: p.lead,
      ids: p.ids,
    })),
  };
}

// Era passages don't spell their bullets out — they name events, and the list
// is built from the bank. The passage and the quiz therefore cannot drift.
function bulletsFor(sec) {
  if (sec.bullets) return sec.bullets;
  return (sec.ids || [])
    .map((id) => EVENTS.find((e) => e.id === id))
    .filter(Boolean)
    .sort((a, b) => a.y - b.y)
    .map((ev) => ({ k: fmtYear(ev.y), v: ev.name, w: ev.why }));
}

const SYLLABUS_IDS = [AGES.id, ...ERAS.map((e) => e.id)];

let st = null;

const sectionEvents = (sec) => (sec.ids || [])
  .map((id) => EVENTS.find((e) => e.id === id))
  .filter(Boolean);

const show = (id, yes) => { const el = $(id); if (el) el.classList.toggle('hidden', !yes); };

// "Studied" is not a permanent tick — it is when you last looked. A course you
// read six weeks ago and a course you read this morning are not the same thing,
// and the picker is the only place that can say so.
function agoLabel(ts) {
  if (!ts) return '✓ studied';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return '✓ studied today';
  if (days === 1) return '✓ yesterday';
  if (days < 30) return `✓ ${days}d ago`;
  return `✓ ${Math.floor(days / 30)}mo ago`;
}

function renderStudyList() {
  const host = $('study-list');
  if (!host) return;
  host.innerHTML = '';
  SYLLABUS_IDS.forEach((id) => {
    const syl = syllabusFor(id);
    const done = store.studied && store.studied[id];
    const b = document.createElement('button');
    b.className = `study-row${id === AGES.id ? ' primer' : ''}${done ? ' done' : ''}`;
    // How much of this era you have placed is the honest progress line — parts
    // remaining tells you the length of the reading, not the state of the work.
    const pool = syl.era ? EVENTS.filter((e) => e.era === syl.id) : [];
    const placed = pool.filter((e) => isPinned(e.id)).length;
    const mark = done
      ? agoLabel(store.studiedAt && store.studiedAt[id])
      : `${syl.sections.length} parts`;
    b.innerHTML =
      `<span class="syl-icon">${syl.icon || ''}</span>`
      + '<span class="study-row-body">'
        + `<b>${esc(syl.name)}</b>`
        + `<em>${esc(id === AGES.id ? 'Start here' : syl.blurb || '')}</em>`
        + `<i>${esc(syl.what || '')}</i>`
      + '</span>'
      + `<span class="study-row-mark">${mark}`
        + (pool.length ? `<span class="row-placed">${placed}/${pool.length} placed</span>` : '')
      + '</span>';
    b.addEventListener('click', () => startStudy(id));
    host.appendChild(b);
  });
}

function startStudy(id) {
  const syl = syllabusFor(id);
  if (!syl) return;
  st = {
    syl, si: 0, qi: 0, questions: [], rungs: null, locked: false,
    phase: 'read', events: [], order: null, canOrder: false,
    correct: 0, answered: 0, missed: [], log: [],
    // Ordering before and after the passage, kept apart: the cold guess is a
    // measurement, never a score.
    predictScore: 0, predictOf: 0, placeScore: 0, placeOf: 0, sectionPredict: 0,
    pinned: [],
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: Date.now(),
  };
  showScreen('study');
  enterSection(0);
}

const totalSections = () => st.syl.sections.length;
const curSection = () => st.syl.sections[st.si];

function enterSection(i) {
  st.si = i;
  const sec = curSection();
  st.events = sectionEvents(sec);
  st.rungs = buildRungs(sec);
  st.questions = [];
  st.qi = 0;
  st.locked = false;
  st.sectionPredict = 0;
  // Ordering needs at least three things to order; below that it isn't a
  // question. The overview course has no events at all and skips to reading.
  st.canOrder = st.events.length >= 3;
  st.phase = st.canOrder ? 'predict' : 'read';
  renderPhase();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// The five phases, and what is on screen during each.
function renderPhase() {
  const sec = curSection();
  $('study-tag').textContent = sec.title || `${st.syl.name} · part ${st.si + 1} of ${totalSections()}`;
  $('study-feedback').textContent = '';
  $('study-feedback').className = '';

  const ordering = st.phase === 'predict' || st.phase === 'place';
  show('study-order', ordering);
  show('study-passage', st.phase === 'read' || st.phase === 'spot');
  show('study-quiz', st.phase === 'spot' || st.phase === 'recall');
  show('study-ready', st.phase === 'read');
  show('study-check', false);
  show('study-next', false);
  show('study-reread', false);

  if (ordering) return renderOrder();
  if (st.phase === 'read') return renderPassage();
  return showStudyQuestion();
}

function advancePhase() {
  if (!st) return;
  switch (st.phase) {
    case 'predict': st.phase = 'read'; return renderPhase();
    case 'read':    return enterRung('spot');
    case 'spot':    return enterRung('recall');
    case 'recall':  return toPlaceOrDone();
    default:        return finishSection();
  }
}

// A rung with nothing to ask is skipped rather than shown empty.
function enterRung(name) {
  const qs = st.rungs[name];
  if (!qs.length) return name === 'spot' ? enterRung('recall') : toPlaceOrDone();
  st.phase = name;
  st.questions = qs;
  st.qi = 0;
  return renderPhase();
}

function toPlaceOrDone() {
  if (st.canOrder) { st.phase = 'place'; return renderPhase(); }
  return finishSection();
}

// Finishing a passage is what pins its events onto the strip.
function finishSection() {
  const fresh = pinEvents(st.events.map((e) => e.id));
  st.pinned.push(...fresh);
  saveStore();
  if (fresh.length && window.Juice) {
    Juice.toast(`📍 ${fresh.length} placed — ${pinnedCount()} of ${EVENTS.length} on your timeline`);
  }
  if (st.si + 1 < totalSections()) return enterSection(st.si + 1);
  finishStudy();
}

function updateStudyHud() {
  $('study-progress').textContent = `Part ${st.si + 1} of ${totalSections()}`;
  $('study-score').textContent = st.answered ? `${st.correct}/${st.answered}` : '';
  const stages = ['predict', 'read', 'spot', 'recall', 'place'];
  const within = Math.max(0, stages.indexOf(st.phase)) / stages.length;
  $('study-fill').style.width = `${Math.min(100, ((st.si + within) / totalSections()) * 100)}%`;
  renderStrip($('study-strip'), {
    compact: true,
    focus: st.syl.era ? st.syl.id : null,
    fresh: st.pinned,
  });
}

function renderPassage() {
  const sec = curSection();
  st.locked = false;
  $('study-passage').innerHTML =
    `<h2 class="panel-title">${esc(sec.headline)}</h2>`
    + `<p class="story-what">${esc(sec.lead)}</p>`
    + '<ul class="story-details">'
    + bulletsFor(sec).map((b) => (b.w
      ? `<li class="ev"><b>${esc(b.k)}</b><span>${esc(b.v)}<em>${esc(b.w)}</em></span></li>`
      : `<li class="pt"><b>${esc(b.k)}</b><span>${esc(b.v)}</span></li>`)).join('')
    + '</ul>';
  const n = st.rungs.spot.length + st.rungs.recall.length;
  $('study-ready').textContent = n
    ? `Got it — ask me ${n} question${n === 1 ? '' : 's'}`
    : 'Continue';
  updateStudyHud();
}

// A study question can only ask about what the passage just said — that is the
// contract of this mode, and why era sections carry an explicit event list.
// The split is the ladder: one asked with the book open, the rest with it shut.
function buildRungs(sec) {
  if (sec.questions) {
    const all = sec.questions.map((sq) => ({
      qtype: 'age',
      text: sq.q,
      // The written answer is always index 0 in the data; shuffling here is
      // what stops "it's the first one" from being a winning strategy.
      options: shuffle(sq.options.map((label, i) => ({ label, right: i === sq.answer }))),
      why: sq.why,
      events: [],
    }));
    return { spot: all.slice(0, 1), recall: all.slice(1) };
  }
  const pool = sectionEvents(sec);
  if (pool.length < 2) return { spot: [], recall: [] };
  const asked = new Set();
  const draw = (n) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const q = makeQuestion(pool, asked);
      q.events.forEach((e) => asked.add(e.id));
      if (asked.size >= pool.length) asked.clear();
      out.push(q);
    }
    return out;
  };
  return { spot: draw(1), recall: draw(2) };
}

// ---------------------------------------------------------------------------
// The order builder — the same task cold and warm
// ---------------------------------------------------------------------------

function renderOrder() {
  const predicting = st.phase === 'predict';
  const n = st.events.length;
  st.order = { events: shuffle(st.events), placed: [], done: false };
  st.qStartedAt = Date.now();

  $('order-head').innerHTML = predicting
    ? '<span class="q-lead">Before you read</span>'
      + '<span class="q-event">Put these in order</span>'
      + '<p class="order-note">Guess — earliest first. Being wrong here is the point:'
      + ' you get the same list back once you have read the passage.</p>'
    : '<span class="q-lead">Book closed</span>'
      + '<span class="q-event">Now place them for real</span>'
      + `<p class="order-note">You had ${st.sectionPredict} of ${n} before you read it.</p>`;

  $('study-check').textContent = predicting ? 'Lock in my guess' : 'Check order';
  drawOrder();
  updateStudyHud();
}

function drawOrder() {
  const n = st.events.length;
  const slots = $('order-slots');
  slots.innerHTML = '';
  st.order.placed.forEach((ev, i) => {
    const chip = document.createElement('button');
    chip.className = 'seq-chip';
    chip.innerHTML = `<b>${i + 1}</b>${esc(ev.name)}`;
    chip.title = 'Tap to remove';
    chip.addEventListener('click', () => {
      if (st.order.done) return;
      st.order.placed.splice(i, 1);
      drawOrder();
    });
    slots.appendChild(chip);
  });
  for (let i = st.order.placed.length; i < n; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'seq-empty';
    empty.textContent = i + 1;
    slots.appendChild(empty);
  }

  const pool = $('order-pool');
  pool.innerHTML = '';
  st.order.events.filter((e) => !st.order.placed.includes(e)).forEach((ev) => {
    const b = document.createElement('button');
    b.textContent = ev.name;
    b.addEventListener('click', () => {
      if (st.order.done || st.order.placed.length >= n) return;
      st.order.placed.push(ev);
      drawOrder();
    });
    pool.appendChild(b);
  });

  show('study-check', true);
  $('study-check').disabled = st.order.placed.length !== n;
}

function checkOrder() {
  if (!st || !st.order || st.order.done) return;
  const n = st.events.length;
  if (st.order.placed.length !== n) return;
  st.order.done = true;

  const truth = st.events.slice().sort((a, b) => a.y - b.y);
  let right = 0;
  st.order.placed.forEach((ev, i) => { if (truth[i] === ev) right += 1; });

  // The reveal is the same in both phases: true order, years attached. In the
  // predict phase this reveal *is* the first thing you read about the passage.
  const slots = $('order-slots');
  slots.innerHTML = '';
  truth.forEach((ev, i) => {
    const chip = document.createElement('div');
    chip.className = `seq-chip reveal ${st.order.placed[i] === ev ? 'right' : 'wrong'}`;
    chip.innerHTML = `<b>${fmtYear(ev.y)}</b>${esc(ev.name)}`;
    slots.appendChild(chip);
  });
  $('order-pool').innerHTML = '';
  show('study-check', false);

  if (st.phase === 'predict') {
    // Unscored on purpose. A cold guess must not be able to dent your accuracy
    // or mark an event missed in Review — nobody had told you yet.
    st.sectionPredict = right;
    st.predictScore += right;
    st.predictOf += n;
    showStudyFeedback(right === n, right === n
      ? `${right}/${n} cold — you already had this one.`
      : `${right}/${n} cold. Now read why, and you'll get them straight back.`);
    $('study-next').textContent = 'Read the passage →';
  } else {
    st.placeScore += right;
    st.placeOf += n;
    const elapsed = Date.now() - (st.qStartedAt || Date.now());
    st.order.placed.forEach((ev, i) => {
      recordStudyAnswer(ev, truth[i] === ev, Math.round(elapsed / n));
    });
    const gained = right - st.sectionPredict;
    showStudyFeedback(right === n, right === n
      ? (gained > 0 ? `${right}/${n} — up from ${st.sectionPredict} before you read it.` : `${right}/${n}. Held it.`)
      : `${right}/${n} placed${gained > 0 ? ` — up from ${st.sectionPredict}` : ''}.`);
    $('study-next').textContent = st.si + 1 < totalSections() ? 'Next passage →' : 'Finish';
    if (window.Juice) {
      if (right === n) Juice.good({ anchor: $('study-next') });
      else Juice.bad();
    }
  }

  show('study-next', true);
  saveStore();
  updateStudyHud();
}

function showStudyFeedback(good, text) {
  const el = $('study-feedback');
  el.textContent = text;
  el.className = good ? 'good' : 'bad';
}

// Study answers feed the same per-event mastery the quiz modes use, so studying
// an era genuinely moves Review and the stats screen. The cold prediction is
// the one thing that never lands here.
function recordStudyAnswer(ev, right, elapsedMs) {
  if (!ev) return;
  st.answered += 1;
  if (right) st.correct += 1;
  store.answered += 1;
  const rec = store.stats[ev.id] || (store.stats[ev.id] = { seen: 0, correct: 0, run: 0 });
  rec.seen += 1;
  if (right) {
    store.correct += 1;
    rec.correct += 1;
    rec.run = (rec.run || 0) > 0 ? rec.run + 1 : 1;
    if (!rec.learned && rec.run >= LEARN_RUN) rec.learned = true;
  } else {
    rec.run = (rec.run || 0) < 0 ? rec.run - 1 : -1;
    if (rec.learned && -rec.run >= UNLEARN_RUN) rec.learned = false;
    st.missed.push(ev.name);
  }
  st.log.push({
    item_id: ev.id,
    item_name: ev.name,
    correct: right,
    ms: elapsedMs,
    answered_at: new Date().toISOString(),
  });
}

function showStudyQuestion() {
  const q = st && st.questions[st.qi];
  if (!st) return;
  if (!q) return advancePhase();

  // The rung is the difference between these two screens, so it is stated. On
  // SPOT the passage stays up and the answer is findable — that rung exists so
  // there is a step between reading a thing and being expected to hold it. On
  // RECALL it goes away, because retrieval is the part that does the work.
  const spotting = st.phase === 'spot';
  show('study-passage', spotting);
  show('study-ready', false);
  show('study-quiz', true);
  show('study-reread', !spotting);
  $('study-reread').textContent = 'Re-read the passage';

  $('study-rung').innerHTML = spotting
    ? '<b>Open book</b> it\'s on the page above'
    : '<b>Book closed</b> from memory now';
  $('study-rung').className = `rung-tag ${spotting ? 'open' : 'closed'}`;

  // Event questions are a lead-in plus the event ("When was this? / Hastings"),
  // so the lead is small and the event is the headline. An overview question is
  // a single sentence and *is* the headline.
  const qLines = q.text.split('\n');
  $('study-q').innerHTML = qLines
    .map((line, i) => (qLines.length > 1 && i === 0
      ? `<span class="q-lead">${esc(line)}</span>`
      : `<span class="q-event">${esc(line)}</span>`))
    .join('');

  const el = $('study-choices');
  el.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.textContent = opt.label;
    b.style.animationDelay = `${i * 45}ms`;
    b.classList.add('enter');
    b.addEventListener('click', () => answerStudy(opt, b));
    el.appendChild(b);
  });

  $('study-feedback').textContent = '';
  $('study-feedback').className = '';
  show('study-next', false);
  st.locked = false;
  st.qStartedAt = Date.now();
  updateStudyHud();

  // On the open-book rung the question sits under the full passage, which on a
  // phone is a screen and a half below the fold — without this you are looking
  // at a passage you have already read with no sign anything has changed.
  if (spotting) {
    $('study-quiz').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function toggleReread() {
  const p = $('study-passage');
  const hidden = p.classList.toggle('hidden');
  $('study-reread').textContent = hidden ? 'Re-read the passage' : 'Hide the passage';
}

function answerStudy(opt, btn) {
  if (!st || st.locked) return;
  st.locked = true;

  const q = st.questions[st.qi];
  const right = Boolean(opt && opt.right);
  const elapsed = Date.now() - st.qStartedAt;

  const primary = q.qtype === 'first'
    ? q.options.find((o) => o.right).ev
    : q.events[0];
  if (primary) {
    recordStudyAnswer(primary, right, elapsed);
  } else {
    // Overview questions have no event behind them — they count for the session
    // but there is nothing to attribute them to.
    st.answered += 1;
    if (right) st.correct += 1;
    else st.missed.push(q.text.split('\n')[0]);
  }

  [...$('study-choices').children].forEach((b, i) => {
    if (q.options[i] && q.options[i].right) b.classList.add('correct');
    b.disabled = true;
  });
  if (!right && btn) btn.classList.add('wrong');

  const why = q.qtype === 'age' ? q.why : `${fmtYear(primary.y)} — ${primary.why}`;
  const fb = $('study-feedback');
  fb.className = right ? 'good' : 'bad';
  fb.innerHTML = `${right ? '✓' : '✗'} ${esc(why)}`;

  if (window.Juice) {
    if (right) Juice.good({ anchor: btn });
    else Juice.bad();
  }

  // The button says what actually happens next, because the next thing is
  // sometimes a different rung rather than another question.
  const last = st.qi + 1 >= st.questions.length;
  $('study-next').textContent = !last ? 'Next question'
    : st.phase === 'spot' ? 'Close the book →'
    : st.canOrder ? 'Place them →'
    : (st.si + 1 < totalSections() ? 'Next passage →' : 'Finish');
  show('study-next', true);
  saveStore();
  updateStudyHud();
}

function studyNext() {
  if (!st) return;
  // Ordering phases have a single step; question phases walk their list first.
  if (st.phase === 'predict' || st.phase === 'place') return advancePhase();
  st.qi += 1;
  if (st.qi < st.questions.length) return showStudyQuestion();
  advancePhase();
}

// Reading is worth something on its own — you can't retrieve what was never
// stored — so passages pay a flat rate and recall pays the rest. Pins pay too:
// placing an event on the strip for the first time is real progress.
const studyXp = () => Math.round(st.correct * 12 + totalSections() * 10 + st.pinned.length * 4);

function syncStudy(aborted) {
  if (!st || !st.log.length) return;
  Sync.record({
    game: 'chronicle',
    session: {
      client_session_id: st.id,
      mode: 'study',
      continent: st.syl.era ? st.syl.id : null,
      difficulty: null,
      question_type: 'study',
      score: aborted ? 0 : st.correct * 100,
      answered: st.answered,
      correct: st.correct,
      best_streak: 0,
      duration_ms: Date.now() - st.startedAt,
      xp_gained: aborted ? 0 : studyXp(),
      aborted: Boolean(aborted),
      played_at: new Date(st.startedAt).toISOString(),
    },
    answers: st.log,
  });
}

function finishStudy() {
  const xpGain = studyXp();
  const levelBefore = levelForXp(store.xp);
  store.xp += xpGain;
  store.games += 1;
  store.studied = store.studied || {};
  store.studied[st.syl.id] = true;
  store.studiedAt = store.studiedAt || {};
  store.studiedAt[st.syl.id] = Date.now();
  saveStore();
  const levelAfter = levelForXp(store.xp);
  syncStudy(false);

  const acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;
  // The headline number is the one the ladder exists to produce: how much
  // better you order these events after reading than you did cold.
  const cold = st.predictOf ? Math.round((st.predictScore / st.predictOf) * 100) : null;
  const warm = st.placeOf ? Math.round((st.placeScore / st.placeOf) * 100) : null;

  $('results-title').textContent = `${st.syl.name} — studied`;
  // `span` is a block caption in the shared theme, so the arrow can't be one.
  $('results-score').innerHTML = cold !== null
    ? `${cold}%<i class="score-arrow">→</i>${warm}%<span>ordering — cold, then after reading</span>`
    : `${st.correct}/${st.answered}<span>recalled</span>`;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${totalSections()}</b><span>passages</span></div>`
    + `<div class="stat"><b>${acc}%</b><span>accuracy</span></div>`
    + (st.pinned.length ? `<div class="stat"><b>+${st.pinned.length}</b><span>placed 📍</span></div>` : '')
    + `<div class="stat"><b>+${xpGain}</b><span>XP</span></div>`;
  renderStrip($('results-strip'), { fresh: st.pinned, focus: st.syl.era ? st.syl.id : null });
  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;
  // An event missed on both the recall question and the placement is one event
  // to look at again, not two.
  const missedOnce = [...new Set(st.missed)];
  $('results-missed').innerHTML = missedOnce.length
    ? '<h3>Worth another pass</h3><div class="chips">'
      + missedOnce.slice(0, 8).map((m) => `<span class="chip">${esc(m)}</span>`).join('')
      + '</div>'
    : '<p class="clean-sweep">Everything held on the first ask.</p>';

  // Straight from reading into testing: the repeat button becomes a quiz on
  // exactly what was just studied.
  sel.mode = 'classic';
  sel.era = st.syl.era ? st.syl.id : 'all';
  $('again-btn').textContent = st.syl.era ? 'Quiz me on this era' : 'Quiz me on all of it';

  showScreen('results');
  if (window.Juice) {
    if (acc >= 80) Juice.celebrate($('results-score'));
    if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
  }
  st = null;
}

function quitStudy() {
  if (!st) return;
  syncStudy(true);
  saveStore();
  st = null;
  showScreen('menu');
  renderMenu();
  renderStudyList();
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
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); renderStudyList(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('study-ready').addEventListener('click', advancePhase);
$('study-check').addEventListener('click', checkOrder);
$('study-next').addEventListener('click', studyNext);
$('study-reread').addEventListener('click', toggleReread);
$('study-quit').addEventListener('click', quitStudy);

document.addEventListener('keydown', (e) => {
  if (screens.study.classList.contains('active')) {
    if (e.key === 'Escape') return quitStudy();
    const sn = parseInt(e.key, 10);
    if (sn >= 1 && sn <= 9) {
      // In an ordering phase the number keys pick off the pool, which is the
      // only way to do this drill on a keyboard.
      if (!$('study-order').classList.contains('hidden')) {
        const p = $('order-pool').children[sn - 1];
        if (p) p.click();
        return;
      }
      const b = $('study-choices').children[sn - 1];
      if (b && !b.disabled && !$('study-quiz').classList.contains('hidden')) b.click();
    } else if (e.key === 'Enter') {
      // Whichever of the three advance buttons is currently live.
      const live = ['study-next', 'study-check', 'study-ready']
        .map((id) => $(id))
        .find((el) => el && !el.classList.contains('hidden') && !el.disabled);
      if (live) live.click();
    } else if (e.key === 'Backspace') {
      const last = $('order-slots').querySelector('button.seq-chip:last-of-type');
      if (last) { e.preventDefault(); last.click(); }
    }
    return;
  }
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

Wardrobe.attach('chronicle');
renderMenu();
renderStudyList();
Sync.mountUI();

// Quick play (hub / next-game links carry ?play=1): arriving means START —
// straight into a session with the defaults, no menu stop.
if (new URLSearchParams(location.search).has('play')) startGame();
