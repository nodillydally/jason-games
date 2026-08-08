/* game.js — Numbers: mental math practice.
 *
 * Progress (XP, level, best scores, per-topic accuracy and speed) persists in
 * localStorage. Topic selection is adaptive: topics you get wrong, or answer
 * slowly, come up more often. Cloud sync is optional and handled by lib/sync.js.
 */

const STORE_KEY = 'numbers.profile.v1';
const QUIZ_ROUNDS = 10;
const MARATHON_LIVES = 3;
const BLITZ_SECONDS = 60;
const LADDER_STEP = 5; // correct answers per difficulty step

const MODES = [
  { id: 'classic',  label: 'Classic',  icon: '🎯', hint: '10 questions.' },
  { id: 'blitz',    label: 'Blitz',    icon: '⏱',  hint: '60 seconds — answer as many as you can.' },
  { id: 'marathon', label: 'Marathon', icon: '💀', hint: '3 lives. Questions keep coming until you miss three.' },
  { id: 'ladder',   label: 'Ladder',   icon: '📈', hint: 'Starts easy and ramps up every 5 correct. 3 lives.' },
  { id: 'review',   label: 'Review',   icon: '📚', hint: 'Drills only the topics you keep getting wrong.' },
];

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   level: 1, choices: 4, seconds: 20, mult: 1 },
  { id: 'normal', label: 'Normal', level: 2, choices: 4, seconds: 15, mult: 1.6 },
  { id: 'hard',   label: 'Hard',   level: 3, choices: 0, seconds: 25, mult: 2.4 },
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
};

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

const statFor = (id) => store.stats[id] || { seen: 0, correct: 0, ms: 0 };
const masteryOf = (id) => { const s = statFor(id); return s.seen ? s.correct / s.seen : 0; };
const avgMsOf = (id) => { const s = statFor(id); return s.seen ? Math.round(s.ms / s.seen) : 0; };

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

// ---------------------------------------------------------------------------
// Adaptive topic selection
// ---------------------------------------------------------------------------

// Topics you've never tried, or often miss, get a higher weight.
function weightFor(id) {
  const s = statFor(id);
  if (!s.seen) return 2.5;
  return 1 + 3 * (1 - s.correct / s.seen);
}

// Topics you've seen but haven't got comfortable with yet.
function reviewTopics() {
  return TOPICS.filter((t) => {
    const s = statFor(t.id);
    return s.seen > 0 && s.correct / s.seen < 0.85;
  });
}

function drawTopic() {
  const pool = g.topicPool;
  if (pool.length === 1) return pool[0].id;
  const weights = pool.map((t) => weightFor(t.id));
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return pool[i].id;
  }
  return pool[pool.length - 1].id;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const sel = { mode: 'classic', topic: 'mixed', difficulty: 'normal' };

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

  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  $('profile-stats').innerHTML =
    `<span><b>${store.games}</b> games</span>` +
    `<span><b>${store.correct}</b> correct</span>` +
    `<span><b>${acc}%</b> accuracy</span>`;

  const fill = (elId, items, group) => {
    const el = $(elId);
    el.innerHTML = '';
    items.forEach((item) => el.appendChild(optionButton(item, group, sel[group] === item.id)));
  };

  fill('mode-options', MODES, 'mode');
  fill('topic-options', [{ id: 'mixed', label: 'Mixed', icon: '🎲' }, ...TOPICS], 'topic');
  fill('difficulty-options', DIFFICULTIES, 'difficulty');

  const mode = MODES.find((m) => m.id === sel.mode);
  const reviewCount = sel.mode === 'review' ? reviewTopics().length : null;
  const isLadder = sel.mode === 'ladder';

  $('start-btn').disabled = reviewCount === 0;
  $('setup-hint').textContent =
    reviewCount === 0 ? 'Nothing to review yet — play a round first and come back.'
      : isLadder ? `${mode.hint} Difficulty is set by the ladder, not the picker.`
      : `${mode.hint}${sel.difficulty === 'hard' ? ' Hard means typing the answer.' : ''}`;
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
  const difficulty = DIFFICULTIES.find((d) => d.id === sel.difficulty);
  const endless = sel.mode === 'blitz' || sel.mode === 'marathon' || sel.mode === 'ladder';

  const topicPool = sel.mode === 'review' ? reviewTopics()
    : sel.topic === 'mixed' ? TOPICS
    : TOPICS.filter((t) => t.id === sel.topic);
  if (!topicPool.length) return;

  g = {
    // Client-generated so a retried sync can't double-count this session.
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    startedAt: Date.now(),
    questionStartedAt: Date.now(),
    log: [],
    mode: sel.mode,
    topic: sel.topic,
    topicPool,
    difficulty,
    // Ladder ignores the picker and climbs on its own.
    level: sel.mode === 'ladder' ? 1 : difficulty.level,
    round: 0,
    rounds: endless ? Infinity : QUIZ_ROUNDS,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    correctSinceStep: 0,
    missed: [],
    lives: (sel.mode === 'marathon' || sel.mode === 'ladder') ? MARATHON_LIVES : null,
    dead: false,
    locked: false,
    current: null,
    endsAt: sel.mode === 'blitz' ? Date.now() + BLITZ_SECONDS * 1000 : null,
  };

  showScreen('game');
  $('hud-clock').classList.toggle('hidden', sel.mode !== 'blitz');
  $('hud-lives').classList.toggle('hidden', g.lives === null);
  startTicker();
  nextQuestion();
}

// One timer drives both the blitz clock and the per-question countdown.
function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(tick, 100);
}

function tick() {
  if (!g) return;

  if (g.endsAt) {
    const left = Math.max(0, g.endsAt - Date.now());
    $('hud-clock').textContent = `⏱ ${Math.ceil(left / 1000)}s`;
    if (left <= 0) return endGame();
  }

  if (g.locked) return;

  const limit = g.difficulty.seconds * 1000;
  const spent = Date.now() - g.questionStartedAt;
  const frac = Math.max(0, 1 - spent / limit);
  const fill = $('timer-fill');
  fill.style.width = `${frac * 100}%`;
  fill.className = frac < 0.25 ? 'low' : '';
  // Running out of time counts as a miss — hesitating is the thing being trained.
  if (spent >= limit) answer(null);
}

function nextQuestion() {
  if (!g) return;
  if (g.dead || g.round >= g.rounds) return endGame();

  g.round += 1;
  g.locked = false;
  g.current = makeQuestion(drawTopic(), g.level);
  g.questionStartedAt = Date.now();

  const topic = TOPICS.find((t) => t.id === g.current.topic);
  $('topic-tag').textContent = g.mode === 'ladder' ? `${topic.label} · level ${g.level}` : topic.label;
  $('question').textContent = g.current.text;
  $('feedback').textContent = '';
  $('feedback').className = '';
  $('next-btn').classList.add('hidden');
  $('timer-fill').style.width = '100%';
  $('timer-fill').className = '';

  if (g.difficulty.choices) {
    $('type-form').classList.add('hidden');
    renderChoices();
  } else {
    $('choices').innerHTML = '';
    $('type-form').classList.remove('hidden');
    const input = $('type-input');
    input.value = '';
    input.disabled = false;
    input.focus();
  }

  updateHud();
}

function renderChoices() {
  const el = $('choices');
  el.innerHTML = '';
  const wrong = wrongAnswers(g.current, g.difficulty.choices - 1);
  const options = shuffle([g.current.answer, ...wrong]);
  options.forEach((value, i) => {
    const b = document.createElement('button');
    // The value lives in a data attribute, not the label: the label also carries
    // the keyboard-hint digit, so parsing it back would read "1" + "234".
    b.dataset.value = String(value);
    b.innerHTML = `<span class="key">${i + 1}</span>${value.toLocaleString()}`;
    b.addEventListener('click', () => answer(value, b));
    el.appendChild(b);
  });
}

function updateHud() {
  $('hud-progress').textContent = Number.isFinite(g.rounds)
    ? `Q ${Math.min(g.round, g.rounds)}/${g.rounds}`
    : `${g.answered} answered`;
  $('hud-score').textContent = `${g.score.toLocaleString()} pts`;
  $('hud-streak').textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
  if (g.lives !== null) $('hud-lives').textContent = '❤'.repeat(Math.max(0, g.lives));
}

// `given` is null when the clock ran out.
function answer(given, btn) {
  if (!g || g.locked) return;
  g.locked = true;

  const q = g.current;
  const elapsed = Date.now() - g.questionStartedAt;
  const right = given !== null && Number(given) === q.answer;

  recordAnswer(q, right, elapsed);

  if (right) {
    const pts = awardPoints(elapsed);
    if (btn) btn.classList.add('correct');
    showFeedback(true, `✓ +${pts} pts`);
  } else {
    g.streak = 0;
    g.missed.push({ ...q, given });
    if (btn) btn.classList.add('wrong');
    if (g.lives !== null) g.lives -= 1;
    const lead = given === null ? "⏱ Time's up —" : '✗';
    showFeedback(false, `${lead} ${q.text} = <b>${q.answer.toLocaleString()}</b>. ${esc(q.why)}`);
  }

  // Show which one was right when they picked wrong.
  if (g.difficulty.choices && !right) {
    [...$('choices').children].forEach((b) => {
      if (Number(b.dataset.value) === q.answer) b.classList.add('correct');
    });
  }
  if (g.difficulty.choices) [...$('choices').children].forEach((b) => { b.disabled = true; });
  $('type-input').disabled = true;

  if (g.lives !== null && g.lives <= 0) g.dead = true;
  $('timer-fill').style.width = '0%';
  updateHud();

  // Blitz keeps moving on its own; every other mode waits so the explanation
  // can actually be read.
  if (g.mode === 'blitz') setTimeout(nextQuestion, right ? 450 : 1400);
  else $('next-btn').classList.remove('hidden');
}

function recordAnswer(q, wasCorrect, elapsedMs) {
  g.answered += 1;
  store.answered += 1;

  const s = store.stats[q.topic] || (store.stats[q.topic] = { seen: 0, correct: 0, ms: 0 });
  s.seen += 1;
  s.ms += elapsedMs;
  if (wasCorrect) {
    g.correct += 1;
    store.correct += 1;
    s.correct += 1;
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    g.correctSinceStep += 1;
    if (g.mode === 'ladder' && g.correctSinceStep >= LADDER_STEP && g.level < 3) {
      g.level += 1;
      g.correctSinceStep = 0;
    }
  }

  // Per-answer detail is what makes "am I actually getting faster at
  // percentages?" answerable later; session totals alone can't show that.
  g.log.push({
    item_id: q.topic,
    item_name: TOPICS.find((t) => t.id === q.topic).label,
    correct: wasCorrect,
    ms: elapsedMs,
    answered_at: new Date().toISOString(),
  });
}

function awardPoints(elapsedMs) {
  const limit = g.difficulty.seconds * 1000;
  const speed = Math.max(0, 1 - elapsedMs / limit);
  const base = 60 + Math.round(60 * speed);
  const streakBonus = 10 * Math.min(g.streak, 10);
  const ladderBonus = g.mode === 'ladder' ? 1 + (g.level - 1) * 0.3 : 1;
  const pts = Math.round((base + streakBonus) * g.difficulty.mult * ladderBonus);
  g.score += pts;
  return pts;
}

function showFeedback(good, html) {
  const el = $('feedback');
  el.innerHTML = html;
  el.className = good ? 'good' : 'bad';
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

// Ship the finished session to Atlas, if cloud sync is on. Abandoned runs are
// sent too — those answers were real practice — but flagged so half-finished
// runs don't distort score and accuracy trends.
function syncSession(aborted, xpGain) {
  if (!g || !g.log.length) return;
  Sync.record({
    game: 'numbers',
    session: {
      client_session_id: g.id,
      mode: g.mode,
      continent: null,
      difficulty: g.difficulty.id,
      question_type: g.topic,
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

  const bestKey = `${g.mode}|${g.topic}|${g.difficulty.id}`;
  const isBest = g.score > 0 && g.score > (store.best[bestKey] || 0);
  if (isBest) store.best[bestKey] = g.score;
  saveStore();
  syncSession(false, xpGain);

  const levelAfter = levelForXp(store.xp);
  const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
  const avgMs = g.log.length ? Math.round(g.log.reduce((sum, a) => sum + a.ms, 0) / g.log.length) : 0;

  $('results-title').textContent =
    g.mode === 'blitz' ? "Time's up!"
      : g.dead ? `💀 Out of lives — ${g.correct} correct`
      : g.mode === 'ladder' ? `📈 Reached level ${g.level}`
      : 'Round complete';

  $('results-score').innerHTML = `${g.score.toLocaleString()}<span> pts</span>${isBest ? ' <em>new best!</em>' : ''}`;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${g.correct}/${g.answered}</b><span>correct</span></div>` +
    `<div class="stat"><b>${acc}%</b><span>accuracy</span></div>` +
    `<div class="stat"><b>${(avgMs / 1000).toFixed(1)}s</b><span>avg time</span></div>` +
    `<div class="stat"><b>${g.bestStreak}</b><span>best streak</span></div>`;

  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;

  $('results-missed').innerHTML = g.missed.length
    ? '<h3>Worth a second look</h3>' + g.missed.slice(0, 6).map((m) =>
      `<div class="missed-row"><code>${esc(m.text)} = ${m.answer.toLocaleString()}</code><span>${esc(m.why)}</span></div>`).join('')
    : '<p class="clean-sweep">Clean sweep — nothing missed.</p>';

  showScreen('results');
  g = null;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function renderStats() {
  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  $('stats-summary').innerHTML =
    `<span><b>${store.games}</b> games</span>` +
    `<span><b>${store.answered}</b> answered</span>` +
    `<span><b>${acc}%</b> accuracy</span>`;

  $('stats-topics').innerHTML = TOPICS.map((t) => {
    const s = statFor(t.id);
    const pct = Math.round(masteryOf(t.id) * 100);
    const time = avgMsOf(t.id);
    return `<div class="topic-row">
      <span class="topic-name"><b>${t.icon}</b> ${t.label}</span>
      <span class="bar"><i style="width:${s.seen ? pct : 0}%"></i></span>
      <span class="topic-num">${s.seen ? `${pct}% · ${(time / 1000).toFixed(1)}s` : '—'}</span>
    </div>`;
  }).join('');

  const weakest = TOPICS
    .filter((t) => statFor(t.id).seen > 0 && masteryOf(t.id) < 1)
    .sort((a, b) => masteryOf(a) - masteryOf(b))
    .slice(0, 4);
  $('stats-weakest').innerHTML = weakest.length
    ? '<h3>Your trouble spots</h3><div class="chips">' + weakest.map((t) => {
      const s = statFor(t.id);
      return `<span class="chip">${t.icon} ${t.label} · ${s.correct}/${s.seen}</span>`;
    }).join('') + '</div>'
    : store.answered ? '<p class="clean-sweep">Nothing weak enough to flag. Try Hard.</p>' : '';
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$('start-btn').addEventListener('click', startGame);
$('quit-btn').addEventListener('click', () => endGame(true));
$('next-btn').addEventListener('click', nextQuestion);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

$('type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('type-input').value.trim();
  if (raw === '' || !g || g.locked) return;
  answer(Number(raw.replace(/[^\d-]/g, '')));
});

document.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (e.target === $('type-input')) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    const btn = $('choices').children[n - 1];
    if (btn && !btn.disabled) btn.click();
  } else if (e.key === 'Enter' && !$('next-btn').classList.contains('hidden')) {
    nextQuestion();
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

renderMenu();
Sync.mountUI();
