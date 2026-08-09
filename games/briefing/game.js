/* game.js — Briefing: the news, kept.
 *
 * Two loops, built on the daily brief that already lands in Jason's inbox
 * (the structured version lives in Atlas and is fetched here):
 *
 *   Today  — read each story, then commit to your own "why it matters"
 *            BEFORE seeing the brief's take, and self-score the match.
 *            Committing first is the whole mechanic: it converts reading
 *            into prediction, and prediction error is what teaches.
 *
 *   Recall — quizzed on the PREVIOUS days' stories: match the what to the
 *            why and back. This is the part that makes news stick past
 *            lunchtime — retention, not consumption.
 *
 * Self-scoring is honest here for the same reason it works for flashcards:
 * you're the only player, and lying to the scoreboard only burns your own
 * signal. (Grading the written take with an LLM is the obvious upgrade —
 * ~1¢ a session — but the commit-then-compare loop works without it.)
 */
'use strict';

const STORE_KEY = 'briefing.profile.v1';
const RECALL_QUESTIONS = 8;
const FETCH_DAYS = 14;

const MODES = [
  { id: 'today', label: "Today's brief", icon: '📰', hint: 'Read each story, write the why before seeing the brief\'s why, self-score the match.' },
  { id: 'recall', label: 'Recall', icon: '🧠', hint: 'Quizzed on the previous days\' stories. The news you read is only yours if it survives the night.' },
];

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const screens = {
  menu: $('screen-menu'),
  today: $('screen-today'),
  recall: $('screen-recall'),
  results: $('screen-results'),
  stats: $('screen-stats'),
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
    if (raw) return { xp: 0, sessions: 0, correct: 0, answered: 0, doneDates: {}, best: {}, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { xp: 0, sessions: 0, correct: 0, answered: 0, doneDates: {}, best: {} };
}

const store = loadStore();
const saveStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));

const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

// Consecutive briefed days, counting back from today or yesterday — one grace
// day so a late-evening miss doesn't zero the run at midnight.
function briefStreak() {
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  let start = store.doneDates[day(0)] ? 0 : store.doneDates[day(1)] ? 1 : null;
  if (start === null) return 0;
  let n = 0;
  while (store.doneDates[day(start + n)]) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// News fetch (private — from Atlas, same credential as sync)
// ---------------------------------------------------------------------------

let briefs = null;        // [{date, topic, items:[{headline,what,why,details}]}], newest first
let briefsError = null;

async function loadBriefs() {
  if (briefs || briefsError) return;
  try {
    const url = `${Sync.contentEndpoint()}?${new URLSearchParams({ op: 'news', days: FETCH_DAYS })}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${Sync.token()}` } });
    if (!res.ok) throw new Error(`news fetch failed (${res.status})`);
    briefs = (await res.json()).briefs;
  } catch (err) {
    briefsError = err.message;
  }
  renderMenu();
}

const weekday = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
const shortDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const sel = { mode: 'today' };

function renderMenu() {
  const level = levelForXp(store.xp);
  $('menu-level').textContent = level;
  const cur = store.xp - xpAtLevel(level);
  const need = xpAtLevel(level + 1) - xpAtLevel(level);
  $('xp-fill').style.width = `${Math.min(100, (cur / need) * 100)}%`;
  $('xp-label').textContent = `${cur} / ${need} XP to level ${level + 1}`;

  const streak = briefStreak();
  $('profile-stats').innerHTML =
    `<span><b>${streak}</b> day streak</span>` +
    `<span><b>${Object.keys(store.doneDates).length}</b> briefs kept</span>` +
    `<span><b>${store.answered ? Math.round((store.correct / store.answered) * 100) : 0}%</b> accuracy</span>`;

  const modes = $('mode-options');
  modes.innerHTML = '';
  MODES.forEach((m) => {
    const b = document.createElement('button');
    b.className = sel.mode === m.id ? 'active' : '';
    b.innerHTML = `<span class="opt-icon">${m.icon}</span>${m.label}`;
    b.addEventListener('click', () => { sel.mode = m.id; renderMenu(); });
    modes.appendChild(b);
  });

  // Hint reflects the live state of the data, not just the mode.
  if (!Sync.isEnabled()) {
    $('setup-hint').textContent = 'Briefing reads your private news feed — turn on Cloud sync below first.';
    $('start-btn').disabled = true;
    return;
  }
  if (briefsError) {
    $('setup-hint').textContent = `Couldn't reach the news feed: ${briefsError}`;
    $('start-btn').disabled = true;
    return;
  }
  if (!briefs) {
    $('setup-hint').textContent = 'Loading your briefs…';
    $('start-btn').disabled = true;
    loadBriefs();
    return;
  }

  const latest = briefs[0];
  const mode = MODES.find((m) => m.id === sel.mode);
  if (sel.mode === 'today') {
    const done = store.doneDates[latest.date];
    $('start-btn').disabled = false;
    $('setup-hint').textContent = done
      ? `${mode.hint} You've already kept ${weekday(latest.date)}'s brief (${latest.topic}) — replaying won't re-count the streak.`
      : `Latest brief: ${weekday(latest.date)}, ${latest.topic} — ${latest.items.length} stories. ${mode.hint}`;
  } else {
    const pastStories = briefs.slice(1).reduce((n, b) => n + b.items.length, 0);
    $('start-btn').disabled = pastStories < 4;
    $('setup-hint').textContent = pastStories < 4
      ? 'Not enough past briefs to quiz yet — do a few days of Today first.'
      : `${mode.hint} ${pastStories} stories from the last ${briefs.length - 1} briefs in the pool.`;
  }
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

let g = null;

function startGame() {
  if (!briefs || !briefs.length) return;
  if (sel.mode === 'today') startToday();
  else startRecall();
}

function baseSession(mode) {
  return {
    // Client-generated so a retried sync can't double-count this session.
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    startedAt: Date.now(),
    log: [],
    mode,
    score: 0,
    correct: 0,
    answered: 0,
    streak: 0,
    bestStreak: 0,
  };
}

// ---------------------------------------------------------------------------
// Today — read, commit, compare
// ---------------------------------------------------------------------------

function startToday() {
  g = { ...baseSession('today'), brief: briefs[0], idx: 0 };
  showScreen('today');
  renderStory();
}

function renderStory() {
  const b = g.brief;
  const it = b.items[g.idx];

  $('today-progress').textContent = `Story ${g.idx + 1} of ${b.items.length} · ${b.topic}`;
  $('today-score').textContent = `${g.score} pts`;
  $('story-meta').textContent = `${weekday(b.date)} · ${shortDate(b.date)}`;
  $('story-headline').textContent = it.headline || it.what;
  $('story-what').textContent = it.headline ? it.what : '';
  $('story-details').innerHTML = it.details.map((d) => `<li>${esc(d)}</li>`).join('');

  $('why-input').value = '';
  $('why-ask').classList.remove('hidden');
  $('why-reveal').classList.add('hidden');
  window.scrollTo({ top: 0 });
}

function reveal() {
  const it = g.brief.items[g.idx];
  $('story-why').textContent = it.why;
  const written = $('why-input').value.trim();
  const echo = $('your-why-echo');
  if (written) {
    echo.innerHTML = `<b>You said:</b> ${esc(written)}`;
    echo.classList.remove('hidden');
  } else {
    echo.classList.add('hidden');
  }
  $('why-ask').classList.add('hidden');
  $('why-reveal').classList.remove('hidden');
}

function selfScore(kind) {
  const it = g.brief.items[g.idx];
  const pts = kind === 'nailed' ? 100 : kind === 'close' ? 60 : 0;
  const right = kind !== 'missed';

  g.score += pts;
  g.answered += 1;
  store.answered += 1;
  if (right) { g.correct += 1; store.correct += 1; }
  g.log.push({
    item_id: `${g.brief.date}#${g.idx}`,
    item_name: (it.headline || it.what).slice(0, 120),
    correct: right,
    ms: 0,
    answered_at: new Date().toISOString(),
  });

  if (window.Juice) {
    if (right) Juice.good({ points: pts, anchor: $('score-nailed') });
    else Juice.bad();
  }

  g.idx += 1;
  if (g.idx < g.brief.items.length) renderStory();
  else endGame();
}

// ---------------------------------------------------------------------------
// Recall — the previous days, quizzed
// ---------------------------------------------------------------------------

// Build the question pool from every brief EXCEPT the latest: recall means
// testing what should have survived at least one night's sleep.
function buildRecall() {
  const pool = [];
  briefs.slice(1).forEach((b) => b.items.forEach((it, i) => {
    pool.push({ date: b.date, topic: b.topic, idx: i, ...it });
  }));

  const questions = [];
  const used = new Set();
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  for (const story of shuffled) {
    if (questions.length >= RECALL_QUESTIONS) break;
    const key = `${story.date}#${story.idx}`;
    if (used.has(key)) continue;
    used.add(key);

    const others = pool.filter((s) => s !== story);
    // Alternate direction: what→why tests significance, why→what tests recall.
    const dir = questions.length % 2 === 0 ? 'why' : 'what';
    const answerText = dir === 'why' ? story.why : (story.headline || story.what);
    const distractors = [];
    const seen = new Set([answerText]);
    for (const o of others.sort(() => Math.random() - 0.5)) {
      const t = dir === 'why' ? o.why : (o.headline || o.what);
      if (!seen.has(t)) { seen.add(t); distractors.push(t); }
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) continue;

    const options = [answerText, ...distractors].sort(() => Math.random() - 0.5);
    questions.push({
      story,
      dir,
      text: dir === 'why'
        ? `Why did this matter?\n${story.headline || story.what}`
        : `Which story was this the significance of?\n“${story.why}”`,
      options,
      answer: options.indexOf(answerText),
    });
  }
  return questions;
}

function startRecall() {
  const questions = buildRecall();
  if (!questions.length) return;
  g = { ...baseSession('recall'), questions, qi: 0, locked: false };
  showScreen('recall');
  renderRecall();
}

function renderRecall() {
  const q = g.questions[g.qi];
  g.locked = false;
  $('recall-progress').textContent = `Q ${g.qi + 1}/${g.questions.length}`;
  $('recall-score').textContent = `${g.score} pts`;
  $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
  $('recall-meta').textContent = `${weekday(q.story.date)} · ${q.story.topic}`;

  const [lead, body] = q.text.split('\n');
  $('recall-question').innerHTML =
    `<span class="q-lead">${esc(lead)}</span><span class="q-body">${esc(body)}</span>`;

  $('recall-feedback').textContent = '';
  $('recall-feedback').className = '';
  $('recall-next').classList.add('hidden');

  const el = $('recall-choices');
  el.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="key">${i + 1}</span>${esc(opt)}`;
    b.style.animationDelay = `${i * 45}ms`;
    b.classList.add('enter');
    b.addEventListener('click', () => answerRecall(i, b));
    el.appendChild(b);
  });
}

function answerRecall(choice, btn) {
  if (!g || g.locked) return;
  g.locked = true;
  const q = g.questions[g.qi];
  const right = choice === q.answer;

  g.answered += 1;
  store.answered += 1;
  if (right) {
    g.correct += 1;
    store.correct += 1;
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    const pts = 80 + 10 * Math.min(g.streak, 10);
    g.score += pts;
    btn.classList.add('correct');
    if (window.Juice) {
      if (g.streak >= 2) Juice.streak(g.streak, $('hud-streak'));
      Juice.good({ points: pts, anchor: btn, streak: g.streak });
    }
  } else {
    g.streak = 0;
    btn.classList.add('wrong');
    if (window.Juice) Juice.bad();
  }
  g.log.push({
    item_id: `${q.story.date}#${q.story.idx}`,
    item_name: (q.story.headline || q.story.what).slice(0, 120),
    correct: right,
    ms: 0,
    answered_at: new Date().toISOString(),
  });

  [...$('recall-choices').children].forEach((b, i) => {
    if (i === q.answer) b.classList.add('correct');
    b.disabled = true;
  });
  const fb = $('recall-feedback');
  fb.innerHTML = right
    ? '✓'
    : `✗ It was: <b>${esc(q.options[q.answer])}</b>`;
  fb.className = right ? 'good' : 'bad';
  $('recall-next').classList.remove('hidden');
}

function nextRecall() {
  g.qi += 1;
  if (g.qi < g.questions.length) renderRecall();
  else endGame();
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

function syncSession(aborted, xpGain) {
  if (!g || !g.log.length) return;
  Sync.record({
    game: 'briefing',
    session: {
      client_session_id: g.id,
      mode: g.mode,
      continent: null,
      difficulty: null,
      question_type: g.mode,
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
  store.sessions += 1;

  // Completing Today's brief is what keeps the streak — a full read-through,
  // not just opening the page.
  if (g.mode === 'today') store.doneDates[g.brief.date] = true;

  const bestKey = g.mode;
  const isBest = g.score > 0 && g.score > (store.best[bestKey] || 0);
  if (isBest) store.best[bestKey] = g.score;
  saveStore();
  syncSession(false, xpGain);

  const levelAfter = levelForXp(store.xp);
  const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
  const streak = briefStreak();

  $('results-title').textContent = g.mode === 'today' ? 'Brief kept' : 'Recall round done';
  $('results-score').innerHTML = `${g.score.toLocaleString()}<span> pts</span>${isBest ? ' <em>new best!</em>' : ''}`;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${g.correct}/${g.answered}</b><span>${g.mode === 'today' ? 'whys matched' : 'recalled'}</span></div>` +
    `<div class="stat"><b>${acc}%</b><span>accuracy</span></div>` +
    (g.mode === 'today' ? `<div class="stat"><b>${streak}</b><span>day streak</span></div>` : `<div class="stat"><b>${g.bestStreak}</b><span>best run</span></div>`);
  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;
  $('results-note').textContent = g.mode === 'today'
    ? 'Tomorrow, Recall will quiz you on what you just read. That second pass is where it becomes yours.'
    : acc >= 75 ? 'The week is sticking. This is what "informed" actually means.'
    : 'Rough — but this is exactly the forgetting curve doing its thing. It flattens with reps.';

  showScreen('results');
  if (window.Juice) {
    if (isBest || acc >= 80) Juice.celebrate($('results-score'));
    if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
  }
  g = null;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function renderStats() {
  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  $('stats-summary').innerHTML =
    `<span><b>Lv ${levelForXp(store.xp)}</b> · ${store.xp.toLocaleString()} XP</span>` +
    `<span><b>${briefStreak()}</b> day streak</span>` +
    `<span><b>${Object.keys(store.doneDates).length}</b> briefs kept</span>` +
    `<span><b>${acc}%</b> accuracy</span>`;

  // The last 14 days as kept / missed marks.
  const cells = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const done = Boolean(store.doneDates[key]);
    cells.push(`<span class="daycell${done ? ' done' : ''}" title="${key}">${done ? '●' : '·'}</span>`);
  }
  $('stats-week').innerHTML = `<h3>Last 14 days</h3><div class="daygrid">${cells.join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$('start-btn').addEventListener('click', startGame);
$('today-quit').addEventListener('click', () => endGame(true));
$('recall-quit').addEventListener('click', () => endGame(true));
$('reveal-btn').addEventListener('click', reveal);
$('score-nailed').addEventListener('click', () => selfScore('nailed'));
$('score-close').addEventListener('click', () => selfScore('close'));
$('score-missed').addEventListener('click', () => selfScore('missed'));
$('recall-next').addEventListener('click', nextRecall);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

document.addEventListener('keydown', (e) => {
  if (screens.recall.classList.contains('active')) {
    if (e.key === 'Escape') return endGame(true);
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) {
      const btn = $('recall-choices').children[n - 1];
      if (btn && !btn.disabled) btn.click();
    } else if (e.key === 'Enter' && !$('recall-next').classList.contains('hidden')) {
      nextRecall();
    }
  } else if (screens.today.classList.contains('active')) {
    if (e.key === 'Escape' && e.target !== $('why-input')) endGame(true);
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

renderMenu();
Sync.mountUI();
if (Sync.isEnabled()) loadBriefs();
