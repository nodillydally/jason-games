/* game.js — Reader: speed reading with a comprehension check.
 *
 * The core idea is that raw words-per-minute is a vanity metric. Anyone can
 * push the number up by recognising words without assembling them into
 * meaning. So the score that matters here is EFFECTIVE wpm — the speed you
 * read at, multiplied by how much of it you actually retained. Going faster
 * only helps if comprehension holds.
 *
 * Display is RSVP (rapid serial visual presentation): words are flashed one at
 * a time in a fixed position, which removes the eye movement between words.
 * Each word is aligned on its optimal recognition point — the character the eye
 * naturally lands on — so the fixation point stays still while the words move
 * around it.
 */

const STORE_KEY = 'reader.profile.v1';
const LADDER_STEP = 50;        // wpm added per rung
const LADDER_PASS = 0.7;       // comprehension needed to climb
const BASELINE_MIN_COMP = 0.6; // below this, a baseline doesn't count
const RECALL_MIN_WORDS = 20;
const COUNT_IN_MS = 500;       // per digit of the 3-2-1 count-in

const MODES = [
  { id: 'baseline',  label: 'Baseline',   icon: '⏱', hint: 'The test that comes first: read one passage at your natural pace — no flashing, no clock — then write what you remember and get graded on it. This sets your true starting speed.' },
  { id: 'benchmark', label: 'Flash read', icon: '⚡', hint: 'Words flash one at a time at a speed you set, then you write what you remember — graded.' },
  { id: 'timed',     label: 'Timed read', icon: '📜', hint: 'The whole passage on screen, but the clock only gives you enough time for your target speed. Finish before it runs out.' },
  { id: 'ladder',    label: 'Ladder',     icon: '📈', hint: 'Flash speed climbs 50 wpm each passage until comprehension breaks. Finds your ceiling.' },
  { id: 'book',      label: 'Book passages', icon: '📚', hint: 'Hand-picked signature passages from your own library — the mirroring chapter, the weekly scorecard, the Fourth Tuesday — with a fill-the-blank check.' },
  { id: 'free',      label: 'Free read',  icon: '📄', hint: 'Paste your own text and read it at speed. No quiz — practice, not measurement.' },
];

const SCROLL_MODES = new Set(['baseline', 'timed']);

const CHUNKS = [
  { id: 1, label: '1 word' },
  { id: 2, label: '2 words' },
  { id: 3, label: '3 words' },
];

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const screens = {
  menu: $('screen-menu'),
  read: $('screen-read'),
  scroll: $('screen-scroll'),
  recall: $('screen-recall'),
  quiz: $('screen-quiz'),
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
    if (raw) return { xp: 0, sessions: 0, wordsRead: 0, bestEffective: 0, baselineWpm: 0, history: [], byLevel: {}, passagesDone: {}, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { xp: 0, sessions: 0, wordsRead: 0, bestEffective: 0, baselineWpm: 0, history: [], byLevel: {}, passagesDone: {} };
}

const store = loadStore();
const saveStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));

// Same curve as Mapmaster and Numbers, so a level means the same effort in
// every game. XP here is comprehended words: words read × comprehension.
// Reading faster earns XP faster only while understanding holds — the same
// bargain as the effective-wpm score itself.
const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

// The point of all this: a lifetime of books. ~90k words is a typical
// nonfiction book; 30 min/day is the assumed reading habit.
const BOOK_WORDS = 90000;
const DAILY_MINUTES = 30;

// ---------------------------------------------------------------------------
// Text handling
// ---------------------------------------------------------------------------

const tokenize = (text) => text.trim().split(/\s+/).filter(Boolean);

function chunkWords(words, size) {
  const out = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
}

// The optimal recognition point: the character the eye lands on when it
// fixates a word. Holding it still is what makes RSVP readable at speed —
// without it the text appears to jitter left and right.
function orpIndex(text) {
  const n = text.length;
  if (n <= 1) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

// Punctuation is a comprehension boundary, and reading through it at a flat
// rate is what makes fast RSVP feel like noise. These pauses are what let the
// sentence structure survive the speed.
function dwellMultiplier(text) {
  if (/[.!?]["')\]]?$/.test(text)) return 2.2;
  if (/[,;:—]$/.test(text)) return 1.6;
  if (text.length > 12) return 1.3;
  return 1;
}

// ---------------------------------------------------------------------------
// Book library (private — fetched from Atlas, never bundled with the site)
// ---------------------------------------------------------------------------

let passageList = null;   // [{id,book_slug,book_title,author,label,words}]
let passageError = null;

async function contentGet(params) {
  const url = `${Sync.contentEndpoint()}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${Sync.token()}` } });
  if (!res.ok) throw new Error(`library fetch failed (${res.status})`);
  return res.json();
}

async function loadPassageList() {
  if (passageList || passageError) return;
  try {
    passageList = (await contentGet({ op: 'passages' })).passages;
  } catch (err) {
    passageError = err.message;
  }
  if (sel.mode === 'book') renderMenu();
}

// ---------------------------------------------------------------------------
// Cloze quiz generation
// ---------------------------------------------------------------------------

// Real books don't ship with comprehension questions, and hand-writing them
// would defeat the point. Cloze deletion — blank a content word, supply it
// from context — is the classic no-AI comprehension measure: you can only
// fill the blank if you assembled the sentence's meaning, not just saw it.

const STOPWORDS = new Set(('about,above,after,again,against,because,been,before,being,below,between,' +
  'both,could,doing,down,during,each,further,having,into,itself,more,most,other,over,same,should,' +
  'their,there,these,they,this,those,through,under,until,very,were,what,when,where,which,while,' +
  'whom,with,would,your,yours,them,then,than,that,from,have,will,just,like,also,only,even,much,' +
  'many,some,such,here,once,does,came,went,said,told,asked,thing,things,really,little,know,knew,' +
  'think,thought,people,every,never,always,still,being,made,make,want,wanted,going,good,great,' +
  'first,last,back,years,time,himself,herself').split(','));

function clozeCandidates(sentence) {
  return sentence.split(/\s+/)
    .map((raw) => raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
    .filter((w) => w.length >= 5 && /^[a-z]+$/.test(w) && !STOPWORDS.has(w));
}

function makeClozeQuiz(text, n = 5) {
  const sentences = (text.match(/[^.!?]+[.!?]+["')\]]*/g) || [])
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => { const w = s.split(' ').length; return w >= 8 && w <= 45; });
  if (sentences.length < 3) return [];

  // Spread the questions across the whole session so skimming the start
  // and coasting doesn't pass.
  const step = sentences.length / Math.min(n, sentences.length);
  const questions = [];
  const usedAnswers = new Set();

  for (let k = 0; k < Math.min(n, sentences.length); k += 1) {
    const sentence = sentences[Math.floor(k * step)];
    const cands = clozeCandidates(sentence).filter((w) => !usedAnswers.has(w));
    if (!cands.length) continue;
    // The word nearest the middle of the sentence carries the most context.
    const words = sentence.split(' ');
    const answer = cands
      .map((w) => ({ w, d: Math.abs(words.findIndex((x) => x.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '') === w) - words.length / 2) }))
      .sort((a, b) => a.d - b.d)[0].w;
    usedAnswers.add(answer);

    // Blank exactly the answer word, once. The answer is TYPED, not picked
    // from options — four buttons at 25% each made the whole check guessable.
    const rx = new RegExp(`\\b${answer}\\b`);
    const blanked = sentence.replace(rx, '＿＿＿');
    questions.push({ q: `Fill the blank: “${blanked}”`, word: answer });
  }
  return questions;
}

// The authored question bank ships every answer at index 0, so options must
// never be shown in authored order — re-deal them and recompute the index.
function shuffledMcq(questions) {
  return questions.map((q) => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  });
}

// Typed answers get one keystroke of grace on longer words — this tests
// whether the word was read, not whether it was spelled.
function clozeMatch(typed, word) {
  const a = typed.trim().toLowerCase();
  const b = word.toLowerCase();
  if (a === b) return true;
  if (b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  // Edit distance ≤ 1, checked directly rather than with a full DP table.
  if (a.length === b.length) {
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
    return diff <= 1;
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0; let j = 0; let used = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i += 1; j += 1; continue; }
    if (used) return false;
    used = true;
    j += 1;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const sel = { mode: 'benchmark', chunk: 1, wpm: 300, passageId: null };

function optionButton(item, group, active) {
  const b = document.createElement('button');
  b.className = active ? 'active' : '';
  b.innerHTML = item.icon ? `<span class="opt-icon">${item.icon}</span>${item.label}` : item.label;
  b.addEventListener('click', () => { sel[group] = item.id; renderMenu(); });
  return b;
}

function renderMenu() {
  const level = levelForXp(store.xp);
  Wardrobe.check('reader', level);
  $('menu-level').textContent = level;
  const cur = store.xp - xpAtLevel(level);
  const need = xpAtLevel(level + 1) - xpAtLevel(level);
  $('xp-fill').style.width = `${Math.min(100, (cur / need) * 100)}%`;
  $('xp-label').textContent = `${cur} / ${need} XP to level ${level + 1}`;

  $('profile-stats').innerHTML =
    `<span><b>${store.bestEffective || '—'}</b> best ewpm</span>` +
    `<span><b>${store.sessions}</b> sessions</span>` +
    `<span><b>${store.wordsRead.toLocaleString()}</b> words read</span>`;

  const fill = (elId, items, group) => {
    const el = $(elId);
    el.innerHTML = '';
    items.forEach((item) => el.appendChild(optionButton(item, group, sel[group] === item.id)));
  };
  fill('mode-options', MODES, 'mode');
  fill('chunk-options', CHUNKS, 'chunk');

  $('wpm-slider').value = sel.wpm;
  $('wpm-value').textContent = `${sel.wpm} wpm`;

  $('paste-wrap').classList.toggle('hidden', sel.mode !== 'free');
  $('book-wrap').classList.toggle('hidden', sel.mode !== 'book');
  if (sel.mode === 'book') renderBookList();

  // Baseline is self-paced by definition — the slider would be a lie there.
  $('wpm-row').classList.toggle('hidden', sel.mode === 'baseline');
  $('speed-heading').classList.toggle('hidden', sel.mode === 'baseline');

  const mode = MODES.find((m) => m.id === sel.mode);
  let hint = sel.mode === 'ladder' ? `${mode.hint} Starting at ${sel.wpm} wpm.` : mode.hint;
  if (sel.mode === 'baseline' && store.baselineWpm) {
    hint += ` Your last baseline: ${store.baselineWpm} wpm.`;
  }
  if (sel.mode !== 'baseline' && !store.baselineWpm && store.sessions === 0) {
    hint += ' Tip: run Baseline first so you know your natural speed.';
  }
  $('setup-hint').textContent = hint;
}

function renderBookList() {
  const el = $('book-list');
  if (!Sync.isEnabled()) {
    el.innerHTML = '<p class="book-note">Your library rides the same code as cloud sync — turn sync on below and the passages appear here.</p>';
    return;
  }
  if (passageError) {
    el.innerHTML = `<p class="book-note">Couldn’t reach the library: ${esc(passageError)}</p>`;
    return;
  }
  if (!passageList) {
    el.innerHTML = '<p class="book-note">Loading your library…</p>';
    loadPassageList();
    return;
  }
  el.innerHTML = '';
  let lastBook = null;
  passageList.forEach((p) => {
    if (p.book_title !== lastBook) {
      lastBook = p.book_title;
      const h = document.createElement('div');
      h.className = 'book-group';
      h.textContent = p.book_title;
      el.appendChild(h);
    }
    const done = store.passagesDone && store.passagesDone[p.id];
    const btn = document.createElement('button');
    btn.className = `book-item${sel.passageId === p.id ? ' active' : ''}`;
    btn.innerHTML =
      `<span class="book-title">${esc(p.label)}</span>` +
      `<span class="book-meta">${p.words} words</span>` +
      `<span class="book-pct">${done != null ? `✓ ${Math.round(done * 100)}%` : 'new'}</span>`;
    btn.addEventListener('click', () => { sel.passageId = p.id; renderMenu(); });
    el.appendChild(btn);
  });
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

let g = null;
let timer = null;

function unseenPassages(level) {
  const pool = level ? PASSAGES.filter((p) => p.level === level) : PASSAGES;
  const seen = new Set((g && g.usedPassages) || []);
  const fresh = pool.filter((p) => !seen.has(p.id));
  return fresh.length ? fresh : pool;
}

function pickPassage() {
  const pool = unseenPassages(null);
  return pool[Math.floor(Math.random() * pool.length)];
}

async function startGame() {
  const isFree = sel.mode === 'free';
  const pasted = $('paste-input').value.trim();
  if (isFree && !pasted) {
    $('setup-hint').textContent = 'Paste some text first — anything from a paragraph up.';
    return;
  }

  // Book sessions fetch their passage from the private library first.
  let bookSession = null;
  if (sel.mode === 'book') {
    if (!Sync.isEnabled()) { $('setup-hint').textContent = 'Turn on Cloud sync below first — the library needs it.'; return; }
    if (!sel.passageId) { $('setup-hint').textContent = 'Pick a passage from the list.'; return; }
    const startBtn = $('start-btn');
    startBtn.disabled = true;
    startBtn.textContent = 'Fetching…';
    try {
      bookSession = await contentGet({ op: 'passage', id: sel.passageId });
    } catch (err) {
      $('setup-hint').textContent = `Couldn’t fetch the passage: ${err.message}`;
      return;
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
    }
  }

  g = {
    // Client-generated so a retried sync can't double-count this session.
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    startedAt: Date.now(),
    log: [],
    mode: sel.mode,
    chunk: sel.chunk,
    wpm: sel.wpm,
    startWpm: sel.wpm,
    rung: 0,
    usedPassages: [],
    wordsRead: 0,
    rounds: [],
    passage: null,
    customText: isFree ? pasted : null,
    book: bookSession,
  };

  beginRound();
}

function beginRound() {
  if (g.mode === 'free') {
    g.passage = { id: 'custom', title: 'Your text', level: 0, text: g.customText, questions: [] };
  } else if (g.mode === 'book') {
    const p = g.book;
    g.passage = {
      id: `${p.book_slug}:${p.id}`,
      title: `${p.book_title} — ${p.label}`,
      level: 0,
      text: p.content,
      questions: makeClozeQuiz(p.content, 5),
    };
  } else {
    const p = pickPassage();
    g.usedPassages.push(p.id);
    // Typed cloze from the passage text replaces the authored multiple choice:
    // producing the word can't be guessed, while every authored question
    // shipped answer-first (the top option was ALWAYS right). The authored
    // set survives only as a shuffled fallback for fragmented text.
    const cloze = makeClozeQuiz(p.text, 5);
    g.passage = { ...p, questions: cloze.length >= 3 ? cloze : shuffledMcq(p.questions) };
  }

  const words = tokenize(g.passage.text);
  g.words = words;
  g.chunks = chunkWords(words, g.chunk);
  g.index = 0;
  g.paused = false;
  g.readStartedAt = null;

  if (SCROLL_MODES.has(g.mode)) return beginScrollRead();

  $('read-title').textContent = g.mode === 'ladder'
    ? `${g.passage.title} · rung ${g.rung + 1}`
    : g.passage.title;
  $('read-wpm').textContent = `${g.wpm} wpm`;
  $('progress-fill').style.width = '0%';
  $('paused-note').classList.add('hidden');
  $('read-hint').textContent = TOUCH
    ? 'Tap anywhere to pause · ✕ to quit'
    : 'Space to pause · Esc to quit';

  showScreen('read');
  countIn(3);
}

// ---------------------------------------------------------------------------
// Scroll reading (Baseline + Timed) — the whole passage on screen at once
// ---------------------------------------------------------------------------

function beginScrollRead() {
  $('scroll-title').textContent = g.passage.title;
  $('scroll-text').innerHTML = g.passage.text
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
  $('scroll-text').scrollTop = 0;

  g.readStartedAt = Date.now();

  if (g.mode === 'timed') {
    // The clock grants exactly the time your target speed implies. Reading
    // faster banks nothing; the test is whether you finish at all.
    g.allowedMs = (g.words.length / g.wpm) * 60000;
    $('scroll-track').classList.remove('hidden');
    timer = setInterval(scrollTick, 100);
  } else {
    // Baseline: no clock on screen — the point is your natural pace,
    // and a visible countdown would contaminate it.
    g.allowedMs = null;
    $('scroll-track').classList.add('hidden');
    $('scroll-clock').textContent = 'Read normally, then press done';
  }

  showScreen('scroll');
}

function scrollTick() {
  if (!g || !g.allowedMs) return;
  const left = g.allowedMs - (Date.now() - g.readStartedAt);
  if (left <= 0) return finishScrollRead(true);
  $('scroll-clock').textContent = `⏱ ${Math.ceil(left / 1000)}s`;
  const frac = left / g.allowedMs;
  $('scroll-fill').style.width = `${frac * 100}%`;
  $('scroll-fill').className = frac < 0.2 ? 'low' : '';
}

function finishScrollRead(expired = false) {
  clearInterval(timer);
  timer = null;
  // If the clock ran out, the elapsed time is the full allotment; if Done came
  // early, the real elapsed time is what the wpm is computed from.
  if (expired && g.allowedMs) g.readStartedAt = Date.now() - g.allowedMs;
  finishReading();
}

function countIn(n) {
  if (!g) return;
  if (n === 0) {
    g.readStartedAt = Date.now();
    tick();
    return;
  }
  paintWord(String(n), true);
  timer = setTimeout(() => countIn(n - 1), COUNT_IN_MS);
}

function paintWord(text, isCountIn = false) {
  const el = $('word');
  const i = isCountIn ? 0 : orpIndex(text);
  el.querySelector('.pre').textContent = text.slice(0, i);
  el.querySelector('.orp').textContent = text.slice(i, i + 1);
  el.querySelector('.post').textContent = text.slice(i + 1);
  el.classList.toggle('count-in', isCountIn);
}

function tick() {
  if (!g || g.paused) return;

  if (g.index >= g.chunks.length) return finishReading();

  const chunk = g.chunks[g.index];
  const text = chunk.join(' ');
  paintWord(text);

  g.index += 1;
  $('progress-fill').style.width = `${(g.index / g.chunks.length) * 100}%`;

  const base = 60000 / g.wpm;
  const delay = base * chunk.length * dwellMultiplier(text);
  timer = setTimeout(tick, delay);
}

function togglePause() {
  if (!g || !g.readStartedAt) return;
  g.paused = !g.paused;
  $('paused-note').classList.toggle('hidden', !g.paused);
  if (g.paused) {
    clearTimeout(timer);
    g.pausedAt = Date.now();
  } else {
    // Paused time isn't reading time — don't let a break inflate the wpm.
    g.readStartedAt += Date.now() - g.pausedAt;
    tick();
  }
}

function finishReading() {
  clearTimeout(timer);
  g.wordsRead += g.words.length;
  g.lastElapsedMs = Date.now() - g.readStartedAt;

  if (g.mode === 'free') return endGame();
  // The measurement modes — Baseline, Timed, and Flash — get the un-gameable
  // check: free recall, graded by AI against the passage. A quiz can be
  // guessed; a blank box can't. (Ladder keeps typed cloze: recall latency
  // between rungs would kill its rhythm.)
  if ((SCROLL_MODES.has(g.mode) || g.mode === 'benchmark') && Sync.isEnabled()) return beginRecall();
  // Rare: a passage too fragmented for cloze generation. Bank the reading.
  if (g.mode === 'book' && g.passage.questions.length < 3) return endGame();

  g.quizIndex = 0;
  g.quizAnswers = [];
  showScreen('quiz');
  renderQuestion();
}

// ---------------------------------------------------------------------------
// AI recall check (Baseline + Timed read)
// ---------------------------------------------------------------------------

function beginRecall() {
  $('recall-meta').textContent = `${g.passage.title} · ${g.words.length.toLocaleString()} words`;
  $('recall-text').value = '';
  $('recall-error').textContent = '';
  const btn = $('recall-submit');
  btn.disabled = false;
  btn.textContent = 'Grade my recall';
  showScreen('recall');
  $('recall-text').focus();
}

function submitRecall() {
  const text = $('recall-text').value.trim();
  if (text.split(/\s+/).filter(Boolean).length < RECALL_MIN_WORDS) {
    $('recall-error').textContent = `A real attempt first — at least ${RECALL_MIN_WORDS} words.`;
    return;
  }
  const session = g;
  const btn = $('recall-submit');
  btn.disabled = true;
  btn.textContent = 'Grading…';
  $('recall-error').textContent = '';

  fetch(Sync.contentEndpoint().replace(/game-content(?=[^/]*$)/, 'game-grade'), {
    method: 'POST',
    headers: { authorization: `Bearer ${Sync.token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'reading', passage_text: session.passage.text, user_text: text }),
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `grading failed (${res.status})`);
    if (g !== session) return;   // quit while grading
    scoreRecallRound(body, text);
  }).catch((err) => {
    if (g !== session) return;
    btn.disabled = false;
    btn.textContent = 'Grade my recall';
    $('recall-error').textContent = `${err.message} — try again.`;
  });
}

function scoreRecallRound(grade, text) {
  const comprehension = Math.max(0, Math.min(100, grade.score)) / 100;
  const actualWpm = Math.round(g.words.length / (g.lastElapsedMs / 60000));
  const effective = Math.round(actualWpm * comprehension);

  g.rounds.push({
    passage: g.passage.title,
    level: g.passage.level,
    wpm: actualWpm,
    correct: grade.score,
    total: 100,
    comprehension,
    effective,
    ai: grade,
    recallText: text,
  });

  g.log.push({
    item_id: g.passage.id,
    item_name: g.passage.title,
    correct: comprehension >= BASELINE_MIN_COMP,
    ms: Math.round(g.lastElapsedMs),
    answered_at: new Date().toISOString(),
  });

  const lvl = store.byLevel[g.passage.level] || (store.byLevel[g.passage.level] = { rounds: 0, correct: 0, total: 0 });
  lvl.rounds += 1;
  lvl.correct += grade.score;
  lvl.total += 100;

  if (g.mode === 'baseline' && comprehension >= BASELINE_MIN_COMP) {
    // The number every other mode trains against — but only if the recall
    // proves the reading actually happened.
    store.baselineWpm = actualWpm;
  }

  endGame();
}

// ---------------------------------------------------------------------------
// Comprehension quiz
// ---------------------------------------------------------------------------

function renderQuestion() {
  const qs = g.passage.questions;
  const q = qs[g.quizIndex];
  $('quiz-progress').textContent = `Question ${g.quizIndex + 1} of ${qs.length}`;
  $('quiz-question').textContent = q.q;

  const el = $('quiz-options');
  if (q.word) {
    // Generated cloze is TYPED, not multiple choice: producing the word is the
    // test recognition can't fake. Four buttons at 25% each were guessable.
    el.innerHTML = `
      <div class="cloze-row">
        <input id="cloze-input" type="text" placeholder="The missing word" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button id="cloze-submit" class="primary">Answer</button>
      </div>
      <div id="cloze-verdict" class="cloze-verdict"></div>`;
    const input = $('cloze-input');
    const submit = () => answerQuestion(input.value);
    $('cloze-submit').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    input.focus();
    return;
  }
  // Hand-authored questions (built-in passages) stay multiple choice — their
  // wrong options are plausible claims the passage doesn't make, so they
  // can't be answered from sentence grammar alone.
  el.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.textContent = opt;
    b.addEventListener('click', () => answerQuestion(i));
    el.appendChild(b);
  });
}

function answerQuestion(response) {
  const qs = g.passage.questions;
  const q = qs[g.quizIndex];
  if (q.word) return answerCloze(String(response));
  const right = response === q.answer;
  g.quizAnswers.push({ choice: q.options[response], right });

  g.log.push({
    item_id: g.passage.id,
    item_name: g.passage.title,
    correct: right,
    ms: Math.round(g.lastElapsedMs / qs.length),
    answered_at: new Date().toISOString(),
  });

  const opts = [...$('quiz-options').children];
  opts.forEach((b) => { b.disabled = true; });
  if (opts[q.answer]) opts[q.answer].classList.add('correct');
  if (!right && opts[response]) opts[response].classList.add('wrong');
  if (right) Juice.good({ anchor: opts[response] });
  else Juice.bad();

  advanceQuiz(right);
}

function answerCloze(typed) {
  const qs = g.passage.questions;
  const q = qs[g.quizIndex];
  if (!typed.trim()) return;
  const right = clozeMatch(typed, q.word);
  g.quizAnswers.push({ choice: typed.trim(), right });

  g.log.push({
    item_id: g.passage.id,
    item_name: g.passage.title,
    correct: right,
    ms: Math.round(g.lastElapsedMs / qs.length),
    answered_at: new Date().toISOString(),
  });

  // Show the verdict before moving on. The quiz used to advance silently, which
  // gave back neither the correction nor the hit of getting one right.
  const input = $('cloze-input');
  input.disabled = true;
  $('cloze-submit').disabled = true;
  const verdict = $('cloze-verdict');
  verdict.innerHTML = right
    ? `<span class="good">✓ ${esc(q.word)}</span>`
    : `<span class="bad">✗ It was “${esc(q.word)}”</span>`;
  if (right) Juice.good({ anchor: input });
  else Juice.bad();

  advanceQuiz(right);
}

function advanceQuiz(right) {
  const qs = g.passage.questions;
  g.quizIndex += 1;
  setTimeout(() => {
    if (!g || !screens.quiz.classList.contains('active')) return;  // quit mid-pause
    if (g.quizIndex < qs.length) renderQuestion();
    else scoreRound();
  }, right ? 700 : 1500);
}

function scoreRound() {
  const qs = g.passage.questions;
  const correct = g.quizAnswers.filter((a) => a.right).length;
  const comprehension = correct / qs.length;
  // Reading at 700 wpm and retaining a third of it is slower, in any sense
  // that matters, than reading at 300 and retaining all of it.
  const actualWpm = Math.round(g.words.length / (g.lastElapsedMs / 60000));
  const effective = Math.round(actualWpm * comprehension);

  g.rounds.push({
    passage: g.passage.title,
    level: g.passage.level,
    wpm: actualWpm,
    correct,
    total: qs.length,
    comprehension,
    effective,
    answers: g.quizAnswers.slice(),
    questions: qs,
  });

  const lvl = store.byLevel[g.passage.level] || (store.byLevel[g.passage.level] = { rounds: 0, correct: 0, total: 0 });
  lvl.rounds += 1;
  lvl.correct += correct;
  lvl.total += qs.length;

  if (g.mode === 'book') {
    // Track the best comprehension per passage — the ✓ in the library list.
    const prev = store.passagesDone[g.book.id];
    store.passagesDone[g.book.id] = Math.max(prev || 0, comprehension);
  }

  if (g.mode === 'baseline' && comprehension >= BASELINE_MIN_COMP) {
    // The number every other mode trains against — but only when the quiz
    // shows the reading actually happened.
    store.baselineWpm = actualWpm;
  }

  if (g.mode === 'ladder' && comprehension >= LADDER_PASS) {
    g.rung += 1;
    g.wpm += LADDER_STEP;
    beginRound();
    return;
  }
  endGame();
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

// Ship the finished session to Atlas, if cloud sync is on. Abandoned runs are
// sent too — the reading happened — but flagged so they don't distort trends.
function syncSession(aborted) {
  if (!g) return;
  if (!g.log.length && !g.wordsRead) return;
  const last = g.rounds[g.rounds.length - 1];
  Sync.record({
    game: 'reader',
    session: {
      client_session_id: g.id,
      mode: g.mode,
      continent: null,
      difficulty: String(g.wpm),
      question_type: `chunk-${g.chunk}`,
      score: last ? last.effective : 0,
      answered: g.log.length,
      correct: g.log.filter((a) => a.correct).length,
      best_streak: g.rung,
      duration_ms: Date.now() - g.startedAt,
      xp_gained: g.xpGain || 0,
      aborted,
      played_at: new Date(g.startedAt).toISOString(),
    },
    answers: g.log,
  });
}

function endGame(aborted = false) {
  clearTimeout(timer);
  timer = null;
  if (!g) return;

  store.sessions += 1;
  store.wordsRead += g.wordsRead;

  // XP = comprehended words / 10. Free reads earn at half rate since nothing
  // verifies the comprehension. AI-graded rounds use the graded percentage
  // directly instead of the pass/fail log.
  const answered = g.log.length;
  const lastRound = g.rounds[g.rounds.length - 1];
  const compFactor = lastRound && lastRound.ai
    ? lastRound.comprehension
    : answered ? g.log.filter((a) => a.correct).length / answered : 0;
  g.xpGain = g.mode === 'free'
    ? Math.round(g.wordsRead / 20)
    : Math.round((g.wordsRead / 10) * compFactor);
  const levelBefore = levelForXp(store.xp);
  store.xp += g.xpGain;
  Wardrobe.earn(g.xpGain / 2);
  const levelAfter = levelForXp(store.xp);

  const last = g.rounds[g.rounds.length - 1];
  const best = g.rounds.reduce((m, r) => Math.max(m, r.effective), 0);
  if (best > store.bestEffective) store.bestEffective = best;
  g.rounds.forEach((r) => {
    store.history.push({ t: Date.now(), wpm: r.wpm, comp: r.comprehension, ewpm: r.effective });
  });
  store.history = store.history.slice(-60);
  saveStore();
  syncSession(aborted);

  if (aborted) {
    showScreen('menu');
    renderMenu();
    g = null;
    return;
  }

  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${g.xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${g.xpGain} XP`;

  if (g.mode === 'free') {
    const wpm = Math.round(g.words.length / (g.lastElapsedMs / 60000));
    $('results-title').textContent = 'Done';
    $('results-score').innerHTML = `${g.words.length.toLocaleString()}<span> words</span>`;
    $('results-stats').innerHTML =
      `<div class="stat"><b>${wpm}</b><span>wpm</span></div>` +
      `<div class="stat"><b>${(g.lastElapsedMs / 60000).toFixed(1)}m</b><span>elapsed</span></div>`;
    $('results-note').textContent = 'Free reads aren\'t scored — run a Benchmark to see whether that speed is holding.';
    $('results-review').innerHTML = '';
  } else if (!last) {
    // A passage too fragmented to quiz — banked without a score.
    $('results-title').textContent = g.book ? `${g.book.book_title} — ${g.book.label}` : 'Done';
    $('results-score').innerHTML = `${g.words.length.toLocaleString()}<span> words</span>`;
    $('results-stats').innerHTML = '';
    $('results-note').textContent = 'That stretch was too fragmented to quiz — banked without a score.';
    $('results-review').innerHTML = '';
  } else {
    const comp = Math.round(last.comprehension * 100);
    $('results-title').textContent = g.mode === 'ladder'
      ? `📈 Stopped at ${g.wpm} wpm`
      : last.passage;
    $('results-score').innerHTML = `${last.effective}<span> effective wpm</span>`;
    $('results-stats').innerHTML =
      `<div class="stat"><b>${last.wpm}</b><span>raw wpm</span></div>` +
      `<div class="stat"><b>${comp}%</b><span>comprehension</span></div>` +
      (last.ai
        ? `<div class="stat"><b>${last.ai.letter}</b><span>recall grade</span></div>`
        : `<div class="stat"><b>${last.correct}/${last.total}</b><span>correct</span></div>`) +
      (g.mode === 'ladder' ? `<div class="stat"><b>${g.rung}</b><span>rungs climbed</span></div>` : '');

    if (g.mode === 'baseline' && last.comprehension < BASELINE_MIN_COMP) {
      $('results-title').textContent = '⏱ Baseline not set';
      $('results-note').textContent =
        `You covered the words at ${last.wpm} wpm, but the recall only proved ${comp}% comprehension — ` +
        `that's not a reading speed, so it wasn't recorded. Read one again at whatever pace lets you actually keep it.`;
    } else if (g.mode === 'baseline') {
      $('results-title').textContent = '⏱ Your baseline';
      // Train slightly above natural pace — pressure without collapse.
      const train = Math.round((last.wpm + 50) / 25) * 25;
      sel.wpm = Math.min(900, Math.max(150, train));
      $('results-note').textContent =
        `Your natural pace is ${last.wpm} wpm at ${comp}% comprehension. ` +
        `I've set the speed slider to ${sel.wpm} — training just above natural is where the gains are.`;
    } else if (g.mode === 'book') {
      $('results-note').textContent =
        comp >= 85 ? 'You own this passage. It\'s marked ✓ in the library.'
          : comp >= 60 ? 'Decent hold — worth one more pass at the same speed.'
          : 'That one slipped past you — reread it slower. These passages are the ones worth actually keeping.';
    } else {
      $('results-note').textContent =
        comp >= 85 ? 'Comprehension is holding. Push the speed up 50 and see if it still does.'
          : comp >= 60 ? 'You are near the edge — this is roughly your working ceiling right now.'
          : 'Too fast. At this speed you are recognising words rather than reading sentences.';
    }

    if (last.ai) {
      const a = last.ai;
      $('results-review').innerHTML =
        `<h3>The grader's read</h3><p class="grade-summary">${esc(a.summary || '')}</p>` +
        ((a.strengths || []).length
          ? '<ul class="grade-good">' + a.strengths.map((s) => `<li>${esc(s)}</li>`).join('') + '</ul>' : '') +
        ((a.missed || []).length
          ? '<h3>What you missed</h3><ul class="grade-missed">' + a.missed.map((m) => `<li>${esc(m)}</li>`).join('') + '</ul>'
          : '<p class="clean-sweep">Nothing major missed.</p>');
    } else {
      $('results-review').innerHTML = '<h3>What you missed</h3>' + (
        last.answers.every((a) => a.right)
          ? '<p class="clean-sweep">Nothing — full marks.</p>'
          : last.answers.map((a, i) => a.right ? '' : `
              <div class="missed-row">
                <code>${esc(last.questions[i].q)}</code>
                <span>Your answer: ${esc(a.choice)} · It was: ${esc(last.questions[i].word || last.questions[i].options[last.questions[i].answer])}</span>
              </div>`).join('')
      );
    }
  }

  showScreen('results');

  // Full marks or a new personal best is the moment worth celebrating; a
  // level-up gets its own beat after it.
  const scoreEl = $('results-score');
  Juice.replay(scoreEl, 'pop');
  const perfect = last && (last.ai ? last.comprehension >= 0.9 : last.answers.every((a) => a.right));
  if (perfect || (last && last.effective >= store.bestEffective)) Juice.celebrate(scoreEl);
  if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 500);

  g = null;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function renderStats() {
  const h = store.history;
  const avgEwpm = h.length ? Math.round(h.reduce((s, r) => s + r.ewpm, 0) / h.length) : 0;
  $('stats-summary').innerHTML =
    `<span><b>Lv ${levelForXp(store.xp)}</b> · ${store.xp.toLocaleString()} XP</span>` +
    `<span><b>${store.baselineWpm || '—'}</b> baseline</span>` +
    `<span><b>${store.bestEffective || '—'}</b> best ewpm</span>` +
    `<span><b>${avgEwpm || '—'}</b> average</span>` +
    `<span><b>${store.wordsRead.toLocaleString()}</b> words</span>`;

  // The number this whole game exists to move. A typical nonfiction book is
  // ~90k words; the projection assumes 30 minutes of reading a day.
  if (avgEwpm) {
    const booksPerYear = (avgEwpm * DAILY_MINUTES * 365) / BOOK_WORDS;
    const lifetimeBooks = booksPerYear * 50;
    const nextEwpm = avgEwpm + 50;
    const extraBooks = ((nextEwpm * DAILY_MINUTES * 365) / BOOK_WORDS) - booksPerYear;
    $('stats-projection').innerHTML =
      `At your average effective speed, ${DAILY_MINUTES} min/day ≈ ` +
      `<b>${booksPerYear.toFixed(1)} books a year</b> — about ` +
      `<b>${Math.round(lifetimeBooks).toLocaleString()} over the next 50 years</b>. ` +
      `Raising your effective speed by 50 wpm adds ~${extraBooks.toFixed(1)} books a year.`;
  } else {
    $('stats-projection').textContent = '';
  }

  const recent = h.slice(-20);
  const peak = Math.max(1, ...recent.map((r) => r.ewpm));
  $('stats-history').innerHTML = recent.length
    ? '<h3>Effective wpm, recent sessions</h3><div class="spark">' +
      recent.map((r) => `<i style="height:${Math.max(4, (r.ewpm / peak) * 100)}%" title="${r.ewpm} ewpm at ${r.wpm} wpm"></i>`).join('') +
      '</div>'
    : '<p class="clean-sweep">No sessions yet — run a Benchmark.</p>';

  const rows = Object.entries(store.byLevel).sort((a, b) => a[0] - b[0]).map(([level, s]) => {
    const pct = Math.round((s.correct / s.total) * 100);
    const name = level === '0' ? 'Your books' : level === '1' ? 'Plain prose' : level === '2' ? 'Denser' : 'Complex';
    return `<div class="topic-row">
      <span class="topic-name">${name}</span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="topic-num">${pct}%</span>
    </div>`;
  }).join('');
  $('stats-levels').innerHTML = rows ? '<h3>Comprehension by text difficulty</h3>' + rows : '';
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$('start-btn').addEventListener('click', startGame);
$('quit-btn').addEventListener('click', () => endGame(true));
$('scroll-quit').addEventListener('click', () => endGame(true));
$('scroll-done').addEventListener('click', () => finishScrollRead(false));
$('recall-quit').addEventListener('click', () => endGame(true));
$('recall-submit').addEventListener('click', submitRecall);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

$('wpm-slider').addEventListener('input', (e) => {
  sel.wpm = Number(e.target.value);
  $('wpm-value').textContent = `${sel.wpm} wpm`;
});

// A phone has no space bar, so on touch the whole reading stage is the pause
// control. Without this the RSVP screen simply can't be paused on mobile.
const TOUCH = window.matchMedia('(hover: none)').matches;

screens.read.addEventListener('click', (e) => {
  if (e.target.closest('#quit-btn')) return;
  togglePause();
});

document.addEventListener('keydown', (e) => {
  if (screens.read.classList.contains('active')) {
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === 'Escape') endGame(true);
  } else if (screens.scroll.classList.contains('active')) {
    if (e.key === 'Escape') endGame(true);
    else if (e.key === 'Enter') finishScrollRead(false);
  } else if (screens.recall.classList.contains('active')) {
    if (e.key === 'Escape') endGame(true);
  } else if (screens.quiz.classList.contains('active') && !$('cloze-input')) {
    // Number keys pick multiple-choice options; typed cloze keeps its input.
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const btn = $('quiz-options').children[n - 1];
      if (btn) btn.click();
    }
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

Wardrobe.attach('reader');
renderMenu();
Sync.mountUI();

// Quick play (hub / next-game links carry ?play=1): arriving means START.
// No baseline yet -> the audit comes first; otherwise a flash read just above
// the natural pace — the same recommendation the menu would make.
if (new URLSearchParams(location.search).has('play')) {
  if (store.baselineWpm) {
    sel.mode = 'benchmark';
    sel.wpm = Math.min(900, Math.max(150, Math.round((store.baselineWpm + 50) / 25) * 25));
  } else {
    sel.mode = 'baseline';
  }
  startGame();
}
