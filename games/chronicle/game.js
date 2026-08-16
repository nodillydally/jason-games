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

const VERSUS_TURNS = 5;      // Turns format: questions each
const VERSUS_SECONDS = 45;   // Timed: clock per player
const VERSUS_LIVES = 3;
const CLIMB_PER_Q = 2;       // Climb: a harder question type every N, per player

const MODES = [
  { id: 'classic', label: 'Classic', icon: '🎯', hint: 'Ten questions — eras, which-came-first, and years.' },
  { id: 'sequence', label: 'Sequence', icon: '🔗', hint: 'Put four events in chronological order. The drill that builds the timeline itself.' },
  { id: 'blitz', label: 'Blitz', icon: '⏱', hint: '60 seconds of era-spotting — as many as you can.' },
  { id: 'review', label: 'Review', icon: '📚', hint: 'Drills only the events you keep missing, until you don\'t.' },
  { id: 'versus', label: 'Versus', icon: '🤝', hint: 'Two players, one device. Nothing you do here touches your own record.' },
];

const VERSUS_FORMATS = [
  { id: 'turns', icon: '🔄', label: 'Turns', sub: `${VERSUS_TURNS} each, alternating` },
  { id: 'timed', icon: '⏱', label: 'Timed', sub: `${VERSUS_SECONDS}s each` },
  { id: 'climb', icon: '📈', label: 'Climb', sub: `Harder each turn, ${VERSUS_LIVES} lives` },
  { id: 'lives', icon: '💀', label: 'Lives', sub: `${VERSUS_LIVES} lives, one go` },
];

// Versus is a party mode: somebody else is answering on your device, so none of
// it may reach your rating, your learned events or your stats.
const isVersus = () => Boolean(g && g.mode === 'versus');
const vsFormat = () => (g && g.vs ? g.vs.format : 'turns');

// Climb walks up Chronicle's own difficulty ladder — the same ordering the
// rating uses, so "harder" means harder by the game's own measure rather than
// by a number someone picked.
const CLIMB_KINDS = ['era', 'inera', 'first', 'year'];

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

// Each results tile leads with its own mark, so the row reads by shape before
// any of the numbers do. Module scope because both endGame() and finishStudy()
// build a results row.
const tile = (icon, value, label) =>
  `<div class="stat"><i class="ic">${icon}</i><b>${value}</b><span>${label}</span></div>`;

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
  elo: { r: 1000, n: 0 },
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

// "Which came first?" — two events close in time, so the order has to be
// actually known rather than deduced from a millennium of daylight.
function qFirst(pool, exclude) {
  const a = weightedDraw(pool, exclude);
  // Which-came-first is only a question when the two are NEIGHBOURS in time —
  // the old filter demanded a 25+ year gap, which is how the iPhone ended up
  // against the sack of Rome. Draw from the handful of chronologically
  // nearest events instead (with just enough gap for a defensible order);
  // nearness self-scales: sparse ancient stretches pair across centuries,
  // dense modern ones across a few years.
  const candidates = pool
    .filter((e) => e.id !== a.id && Math.abs(e.y - a.y) >= 3)
    .sort((x, y) => Math.abs(x.y - a.y) - Math.abs(y.y - a.y))
    .slice(0, 6);
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

// "Which of these happened during [era]?" — the reverse of qEra. Distractors
// come from NEIGHBOURING eras: an iPhone among medieval options eliminates
// itself, which tests reading, not history.
function qInEra(ev) {
  const idx = ERAS.findIndex((e) => e.id === ev.era);
  const others = shuffle(
    shuffle(EVENTS.filter((e) => e.era !== ev.era))
      .sort((a, b) =>
        Math.abs(ERAS.findIndex((x) => x.id === a.era) - idx)
        - Math.abs(ERAS.findIndex((x) => x.id === b.era) - idx))
      .slice(0, 8)
  ).slice(0, 3);
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

function makeQuestion(pool, exclude, forceKind) {
  const ev = weightedDraw(pool, exclude);
  const kinds = ['era', 'first', 'inera'];
  if (ev.y >= 1450) kinds.push('year', 'year'); // exact years only where fair
  // Climb asks for a rung by name. Exact years stay off the table for events
  // before 1450 whoever is asking — an unfair question is unfair in Versus too.
  const kind = (forceKind && (forceKind !== 'year' || ev.y >= 1450))
    ? forceKind
    : kinds[Math.floor(Math.random() * kinds.length)];
  if (kind === 'first') return qFirst(pool, exclude);
  if (kind === 'inera') return qInEra(ev);
  if (kind === 'year') return qYear(ev);
  return qEra(ev);
}

// Four events for ordering, pairwise at least 25 years apart.
function makeSequence(pool) {
  // Four events scattered across millennia order themselves — the drill only
  // bites inside a chronological neighbourhood. Anchor on one event, take the
  // dozen nearest in time, and pick four with just enough pairwise gap for
  // the true order to be defensible.
  const anchor = weightedDraw(pool);
  const hood = pool
    .filter((e) => e.id !== anchor.id)
    .sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y))
    .slice(0, 11);
  const candidates = [anchor, ...hood];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const picked = [];
    for (const ev of shuffle(candidates)) {
      if (picked.length === 4) break;
      if (picked.every((p) => Math.abs(p.y - ev.y) >= 3)) picked.push(ev);
    }
    if (picked.length === 4) return shuffle(picked);
  }
  return shuffle(pool.slice(0, 4));
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const sel = { mode: 'classic', era: 'all', vsFormat: 'turns' };

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

  const isVs = sel.mode === 'versus';
  $('versus-block').classList.toggle('hidden', !isVs);
  if (isVs) {
    const host = $('vsformat-options');
    host.innerHTML = '';
    VERSUS_FORMATS.forEach((f) => host.appendChild(optionButton(
      `${f.icon} ${esc(f.label)}<span class="sub">${esc(f.sub)}</span>`,
      sel.vsFormat === f.id,
      () => { sel.vsFormat = f.id; renderMenu(); },
    )));
  }

  const mode = MODES.find((m) => m.id === sel.mode);
  const rCount = sel.mode === 'review' ? reviewPool().length : null;
  $('start-btn').disabled = rCount === 0;
  // You can't retrieve what was never stored — until something has been
  // answered, the honest recommendation is input first, quiz second.
  // Study advice is for someone building their own timeline. In Versus the
  // person answering may never have opened this site before, and telling them
  // to go study first is advice for the wrong person.
  const firstRun = (store.answered === 0 && !isVs)
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
  const versus = sel.mode === 'versus';

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
    rounds: (sel.mode === 'blitz' || versus) ? Infinity : sel.mode === 'sequence' ? SEQ_ROUNDS : QUIZ_ROUNDS,
    vs: versus ? {
      format: sel.vsFormat,
      turn: 0,
      turnsEach: VERSUS_TURNS,
      turnRounds: 0,
      turnEndsAt: 0,
      players: [
        { name: ($('p1-name').value.trim() || 'Player 1').slice(0, 12), score: 0, correct: 0, answered: 0, streak: 0, lives: VERSUS_LIVES },
        { name: ($('p2-name').value.trim() || 'Player 2').slice(0, 12), score: 0, correct: 0, answered: 0, streak: 0, lives: VERSUS_LIVES },
      ],
    } : null,
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
  // The opening card starts the first turn when it's dismissed. Starting the
  // clock here instead would run it while the handoff is still on screen.
  if (versus) return showHandoff(0, true);
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
  // The one place a turn can end. Every route to the next question comes
  // through here — the Next button, the blitz auto-advance, the keyboard —
  // so the handoff can't be reached by one path and missed by another.
  if (isVersus()) {
    versusPlayer().streak = g.streak;
    if (versusTurnOver()) return endVersusTurn();
  }
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
    : makeQuestion(g.pool, g.asked, isVersus() && vsFormat() === 'climb' ? climbKind() : undefined);
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
  // In Versus the HUD has to answer "whose go is it and how am I doing" — a
  // shared running total would belong to nobody.
  if (isVersus()) {
    const me = versusPlayer();
    const them = g.vs.players[g.vs.turn === 0 ? 1 : 0];
    const lives = (vsFormat() === 'lives' || vsFormat() === 'climb')
      ? ` · ${'♥'.repeat(Math.max(0, me.lives))}` : '';
    const progress = vsFormat() === 'turns'
      ? `Q ${Math.min(me.answered + 1, g.vs.turnsEach)}/${g.vs.turnsEach}` : '';
    $('hud-progress').textContent = `${me.name}${lives} ${progress}`.trim();
    $('hud-score').textContent = `${me.score.toLocaleString()} · ${them.score.toLocaleString()}`;
    $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
    return;
  }
  $('hud-progress').textContent = Number.isFinite(g.rounds)
    ? `Q ${Math.min(g.round, g.rounds)}/${g.rounds}`
    : `${g.answered} answered`;
  $('hud-score').textContent = `${g.score.toLocaleString()} pts`;
  $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
}

// ---------------------------------------------------------------------------
// Versus — two people, one device, taking turns
// ---------------------------------------------------------------------------
//
// The whole mode is a wrapper around the ordinary question loop. It changes who
// the score belongs to and when the device changes hands; it never changes what
// a question is. That is why recordAnswer() is the only place that had to learn
// about it — everything else is unchanged.

let versusTimer = null;

function versusPlayer() { return g.vs.players[g.vs.turn]; }

// A streak belongs to the PLAYER, not the seat: it has to survive the
// opponent's question and pick up where that player left off.
function beginVersusTurn() {
  g.streak = versusPlayer().streak || 0;
  g.vs.turnEndsAt = Date.now() + VERSUS_SECONDS * 1000;
  if (vsFormat() === 'lives') versusPlayer().lives = VERSUS_LIVES;
  g.vs.turnRounds = 0;
  const clocked = vsFormat() === 'timed';
  $('hud-clock').classList.toggle('hidden', !clocked);
  clearInterval(versusTimer);
  versusTimer = clocked ? setInterval(tickVersus, 150) : null;
}

// One place decides a turn is over, so each format stays a single line.
function versusTurnOver() {
  switch (vsFormat()) {
    case 'timed': return Date.now() >= g.vs.turnEndsAt;
    case 'lives': return versusPlayer().lives <= 0;
    // Turns and Climb hand the device over after every single question, which
    // is what makes it feel like a board game rather than two solo runs.
    default:      return g.vs.turnRounds >= 1;
  }
}

function versusMatchOver() {
  if (vsFormat() === 'turns') return g.vs.players.every((p) => p.answered >= g.vs.turnsEach);
  if (vsFormat() === 'climb') return g.vs.players.every((p) => p.lives <= 0);
  return g.vs.turn === 1;
}

// The other player — unless they're already out, in which case the survivor
// climbs on alone until their own lives are gone.
function nextVersusSeat() {
  const other = g.vs.turn === 0 ? 1 : 0;
  if (vsFormat() !== 'climb') return other;
  if (g.vs.players[other].lives > 0) return other;
  return versusPlayer().lives > 0 ? g.vs.turn : other;
}

// Which rung of the ladder this player has climbed to.
function climbKind() {
  const tier = Math.floor(versusPlayer().answered / CLIMB_PER_Q);
  return CLIMB_KINDS[Math.min(tier, CLIMB_KINDS.length - 1)];
}

function tickVersus() {
  if (!g || !isVersus()) return;
  const left = Math.max(0, g.vs.turnEndsAt - Date.now());
  const secs = Math.ceil(left / 1000);
  $('hud-clock').textContent = `⏱ ${secs}s`;
  $('hud-clock').classList.toggle('urgent', secs <= 10);
  if (left <= 0) {
    clearInterval(versusTimer);
    versusTimer = null;
    endVersusTurn();
  }
}

function endVersusTurn() {
  clearInterval(versusTimer);
  versusTimer = null;
  if (versusMatchOver()) return endGame();
  const seat = nextVersusSeat();
  // The survivor keeps climbing — no handoff card for a player passing to
  // themselves, which would just be a button to press.
  if (seat === g.vs.turn) { g.vs.turnRounds = 0; return nextRound(); }
  showHandoff(seat);
}

function showHandoff(nextTurn, opening = false) {
  const up = g.vs.players[nextTurn];
  const other = g.vs.players[nextTurn === 0 ? 1 : 0];
  const alternating = vsFormat() === 'turns' || vsFormat() === 'climb';

  $('handoff-title').textContent = opening ? `${up.name}, you start` : `${up.name}, you're up`;
  $('handoff-sub').innerHTML = opening
    ? 'Answer on this device, then pass it over.'
    : alternating
      // Mid-match state is the interesting thing when turns swap constantly.
      ? `${esc(up.name)} <b>${up.score}</b> · ${esc(other.name)} <b>${other.score}</b>`
        + `<br>Pass the device — no peeking at the last answer.`
      : `${esc(other.name)} scored <b>${other.score}</b> — ${other.correct}/${other.answered} correct.`
        + `<br>Beat it. Hand the device over.`;

  $('handoff').classList.remove('hidden');
  $('handoff-go').onclick = () => {
    $('handoff').classList.add('hidden');
    g.vs.turn = nextTurn;
    beginVersusTurn();
    nextRound();
  };
}

function endVersus() {
  clearInterval(versusTimer);
  versusTimer = null;
  const [a, b] = g.vs.players;
  const winner = a.score === b.score ? null : (a.score > b.score ? a : b);

  $('results-title').textContent = winner
    ? `🏆 ${winner.name} wins`
    : "🤝 Dead heat — nobody's giving that up";
  $('results-score').innerHTML =
    `${a.score.toLocaleString()}<span> ${esc(a.name)} · ${esc(b.name)} ${b.score.toLocaleString()}</span>`;
  $('results-stats').innerHTML =
    tile('🎯', `${a.correct}/${a.answered}`, esc(a.name)) +
    tile('🎯', `${b.correct}/${b.answered}`, esc(b.name));
  // Nothing was earned and nothing was learned — say so rather than showing a
  // level bar that didn't move.
  $('results-xp').textContent = 'Versus is off the record — no XP, no rating, no stats.';
  $('results-strip').innerHTML = '';
  $('results-missed').innerHTML = '';
  $('again-btn').textContent = 'Rematch';
  showScreen('results');
  if (window.Juice && winner) Juice.celebrate($('results-score'));
  g = null;
}

// ---------------------------------------------------------------------------
// Answering (choice questions)
// ---------------------------------------------------------------------------

// One History rating, same scale as Numbers and Mapmaster (1000 baseline).
// Question difficulty by type: spotting an era is entry work, which-came-first
// on neighbouring events is genuinely hard, exact years hardest.
const Q_RATING = { era: 1000, inera: 1150, first: 1300, seq: 1250, year: 1550 };

function updateElo(qtype, wasCorrect) {
  const e = store.elo && typeof store.elo.r === 'number' ? store.elo : (store.elo = { r: 1000, n: 0 });
  const dq = Q_RATING[qtype] || 1150;
  const expected = 1 / (1 + Math.pow(10, (dq - e.r) / 400));
  const K = e.n < 30 ? 32 : 16;
  const before = e.r;
  e.r = Math.round((e.r + K * ((wasCorrect ? 1 : 0) - expected)) * 10) / 10;
  e.n += 1;
  if (g) g.eloDelta = (g.eloDelta || 0) + (e.r - before);
  if (Math.floor(before / 100) !== Math.floor(e.r / 100) && window.Juice) {
    Juice.toast(`${e.r > before ? '➚' : '➘'} History rating ${Math.round(e.r)}`);
  }
}

function recordAnswer(ev, wasCorrect, elapsedMs, qtype) {
  g.answered += 1;

  // The single gate that keeps Versus off your record. Someone else is
  // answering, so their misses must not unlearn your events, move your rating,
  // or land in the synced answer log. Everything below this line is yours.
  if (isVersus()) {
    const p = versusPlayer();
    p.answered += 1;
    if (wasCorrect) p.correct += 1;
    else if (vsFormat() === 'lives' || vsFormat() === 'climb') p.lives -= 1;
    g.vs.turnRounds += 1;
    return;
  }

  store.answered += 1;
  updateElo(qtype, wasCorrect);
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
  if (isVersus()) versusPlayer().score += pts;
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
  recordAnswer(primary, right, elapsed, q.qtype);

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
    recordAnswer(ev, right, Math.round(elapsed / 4), 'seq');
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

  // Versus has its own ending, and quitting one simply drops it — there is no
  // session to bank and no store to save.
  if (isVersus()) {
    clearInterval(versusTimer);
    versusTimer = null;
    if (aborted) { showScreen('menu'); renderMenu(); g = null; return; }
    return endVersus();
  }

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

  // Rating leads; points are the footnote.
  const netDelta = g.eloDelta || 0;
  $('results-score').innerHTML = store.elo && store.elo.n
    ? `${Math.round(store.elo.r)}<span> elo · ${netDelta >= 0 ? '+' : '−'}${Math.abs(Math.round(netDelta))} this session · ${g.score.toLocaleString()} pts${isBest ? ' · new best!' : ''}</span>`
    : `${g.score.toLocaleString()}<span> pts</span>${isBest ? ' <em>new best!</em>' : ''}`;
  $('results-stats').innerHTML =
    tile('🎯', `${g.correct}/${g.answered}`, 'correct') +
    tile('📊', `${acc}%`, 'accuracy') +
    tile('🔥', g.bestStreak, 'best streak') +
    (g.newlyLearned ? tile('🧠', `+${g.newlyLearned}`, 'learned') : '') +
    (g.newlyLost ? tile('🩹', `−${g.newlyLost}`, 'slipped — review them') : '');

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
    const saved = loadStudySave();
    const inProgress = saved && saved.syl === id && saved.si > 0 && saved.si < syl.sections.length;
    const mark = inProgress
      ? `▶ part ${saved.si + 1} of ${syl.sections.length}`
      : done
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

// A study course is long by design — progress survives leaving. The
// checkpoint is the section: each part entered is saved, so coming back
// resumes at the part you were on with your counters intact.
const STUDY_SAVE_KEY = 'chronicle.study.v1';

function loadStudySave() {
  try { return JSON.parse(localStorage.getItem(STUDY_SAVE_KEY)); } catch { return null; }
}

function saveStudy() {
  if (!st) return;
  try {
    localStorage.setItem(STUDY_SAVE_KEY, JSON.stringify({
      syl: st.syl.id,
      si: st.si,
      correct: st.correct,
      answered: st.answered,
      predictScore: st.predictScore,
      predictOf: st.predictOf,
      placeScore: st.placeScore,
      placeOf: st.placeOf,
      log: st.log,
      id: st.id,
      startedAt: st.startedAt,
    }));
  } catch { /* private mode — resume just won't survive */ }
}

const clearStudySave = () => localStorage.removeItem(STUDY_SAVE_KEY);

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

  // Pick up where this course was left. Counters carry over; the part being
  // read when you left restarts from its top (a checkpoint, not a bookmark).
  const saved = loadStudySave();
  let from = 0;
  if (saved && saved.syl === id && saved.si > 0 && saved.si < syl.sections.length) {
    st.correct = saved.correct || 0;
    st.answered = saved.answered || 0;
    st.predictScore = saved.predictScore || 0;
    st.predictOf = saved.predictOf || 0;
    st.placeScore = saved.placeScore || 0;
    st.placeOf = saved.placeOf || 0;
    st.log = saved.log || [];
    st.id = saved.id || st.id;
    st.startedAt = saved.startedAt || st.startedAt;
    from = saved.si;
    if (window.Juice) Juice.toast(`▶ Resuming — part ${from + 1} of ${syl.sections.length}`);
  }

  showScreen('study');
  enterSection(from);
}

const totalSections = () => st.syl.sections.length;
const curSection = () => st.syl.sections[st.si];

function enterSection(i) {
  st.si = i;
  saveStudy();
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
  clearStudySave();
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
    tile('📖', totalSections(), 'passages')
    + tile('📊', `${acc}%`, 'accuracy')
    + (st.pinned.length ? tile('📍', `+${st.pinned.length}`, 'placed') : '')
    + tile('⭐', `+${xpGain}`, 'XP');
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
    (store.elo && store.elo.n ? `<span><b>${Math.round(store.elo.r)}</b> history elo</span>` : '') +
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
