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
const COUNT_IN_MS = 500;       // per digit of the 3-2-1 count-in

const MODES = [
  { id: 'benchmark', label: 'Benchmark', icon: '🎯', hint: 'One passage at your chosen speed, then a comprehension check.' },
  { id: 'ladder',    label: 'Ladder',    icon: '📈', hint: 'Speed climbs 50 wpm each passage until comprehension breaks. Finds your real ceiling.' },
  { id: 'book',      label: 'My books',  icon: '📚', hint: 'Read your own library a session at a time, with a fill-the-blank check on what you just read. Progress is bookmarked.' },
  { id: 'free',      label: 'Free read', icon: '📄', hint: 'Paste your own text and read it at speed. No quiz — practice, not measurement.' },
];

// How much of a book one session covers (~1200 words ≈ 4 min at 300 wpm).
const BOOK_CHUNKS_PER_SESSION = 3;
const BOOKMARKS_KEY = 'reader.books.v1';

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
    if (raw) return { xp: 0, sessions: 0, wordsRead: 0, bestEffective: 0, history: [], byLevel: {}, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { xp: 0, sessions: 0, wordsRead: 0, bestEffective: 0, history: [], byLevel: {} };
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

const loadBookmarks = () => {
  try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY)) || {}; } catch { return {}; }
};
const bookmarks = loadBookmarks();
const saveBookmarks = () => localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));

let catalog = null;      // [{slug,title,author,chunks,words}]
let catalogError = null;

async function contentGet(params) {
  const url = `${Sync.contentEndpoint()}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${Sync.token()}` } });
  if (!res.ok) throw new Error(`library fetch failed (${res.status})`);
  return res.json();
}

async function loadCatalog() {
  if (catalog || catalogError) return;
  try {
    catalog = (await contentGet({ op: 'books' })).books;
  } catch (err) {
    catalogError = err.message;
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
  const allCandidates = [...new Set(sentences.flatMap(clozeCandidates))];

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

    const distractors = shuffleArr(allCandidates
      .filter((w) => w !== answer && !sentence.includes(w) && Math.abs(w.length - answer.length) <= 3))
      .slice(0, 3);
    if (distractors.length < 3) continue;

    // Blank exactly the answer word, once.
    const rx = new RegExp(`\\b${answer}\\b`);
    const blanked = sentence.replace(rx, '＿＿＿');
    const options = shuffleArr([answer, ...distractors]);
    questions.push({ q: `Fill the blank: “${blanked}”`, options, answer: options.indexOf(answer) });
  }
  return questions;
}

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const sel = { mode: 'benchmark', chunk: 1, wpm: 300, book: null };

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

  const mode = MODES.find((m) => m.id === sel.mode);
  $('setup-hint').textContent = sel.mode === 'ladder'
    ? `${mode.hint} Starting at ${sel.wpm} wpm.`
    : mode.hint;
}

function renderBookList() {
  const el = $('book-list');
  if (!Sync.isEnabled()) {
    el.innerHTML = '<p class="book-note">Your library rides the same code as cloud sync — turn sync on below and the books appear here.</p>';
    return;
  }
  if (catalogError) {
    el.innerHTML = `<p class="book-note">Couldn’t reach the library: ${esc(catalogError)}</p>`;
    return;
  }
  if (!catalog) {
    el.innerHTML = '<p class="book-note">Loading your library…</p>';
    loadCatalog();
    return;
  }
  el.innerHTML = '';
  catalog.forEach((b) => {
    const at = (bookmarks[b.slug] && bookmarks[b.slug].chunk) || 0;
    const pct = Math.min(100, Math.round((at / b.chunks) * 100));
    const btn = document.createElement('button');
    btn.className = `book-item${sel.book === b.slug ? ' active' : ''}`;
    btn.innerHTML =
      `<span class="book-title">${esc(b.title)}</span>` +
      `<span class="book-meta">${esc(b.author || '')} · ${(b.words / 1000).toFixed(0)}k words</span>` +
      `<span class="book-progress"><i style="width:${pct}%"></i></span>` +
      `<span class="book-pct">${pct === 100 ? '✓ finished' : pct === 0 ? 'not started' : pct + '%'}</span>`;
    btn.addEventListener('click', () => { sel.book = b.slug; renderMenu(); });
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

  // Book sessions fetch their text from the private library first.
  let bookSession = null;
  if (sel.mode === 'book') {
    if (!Sync.isEnabled()) { $('setup-hint').textContent = 'Turn on Cloud sync below first — the library needs it.'; return; }
    if (!sel.book) { $('setup-hint').textContent = 'Pick a book from the list.'; return; }
    const meta = (catalog || []).find((b) => b.slug === sel.book);
    const from = (bookmarks[sel.book] && bookmarks[sel.book].chunk) || 0;
    if (meta && from >= meta.chunks) { $('setup-hint').textContent = 'You’ve finished that one — pick another, or reread it by resetting below.'; return; }
    const startBtn = $('start-btn');
    startBtn.disabled = true;
    startBtn.textContent = 'Fetching…';
    try {
      const r = await contentGet({ op: 'chunks', book: sel.book, from, count: BOOK_CHUNKS_PER_SESSION });
      bookSession = { meta, from, total: r.total, text: r.chunks.map((c) => c.content).join('\n\n'), got: r.chunks.length };
    } catch (err) {
      $('setup-hint').textContent = `Couldn’t fetch the book: ${err.message}`;
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
    const b = g.book;
    g.passage = {
      id: b.meta.slug,
      title: b.meta.title,
      level: 0,
      text: b.text,
      questions: makeClozeQuiz(b.text, 5),
    };
  } else {
    g.passage = pickPassage();
    g.usedPassages.push(g.passage.id);
  }

  const words = tokenize(g.passage.text);
  g.words = words;
  g.chunks = chunkWords(words, g.chunk);
  g.index = 0;
  g.paused = false;
  g.readStartedAt = null;

  $('read-title').textContent = g.mode === 'ladder'
    ? `${g.passage.title} · rung ${g.rung + 1}`
    : g.mode === 'book'
    ? `${g.passage.title} · ${Math.round((g.book.from / g.book.total) * 100)}% in`
    : g.passage.title;
  $('read-wpm').textContent = `${g.wpm} wpm`;
  $('progress-fill').style.width = '0%';
  $('paused-note').classList.add('hidden');
  $('read-hint').textContent = 'Space to pause · Esc to quit';

  showScreen('read');
  countIn(3);
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
  // Rare: a book stretch too fragmented for cloze generation (front matter,
  // tables). Bank the reading and move the bookmark rather than blocking.
  if (g.mode === 'book' && g.passage.questions.length < 3) {
    advanceBookmark();
    return endGame();
  }

  g.quizIndex = 0;
  g.quizAnswers = [];
  showScreen('quiz');
  renderQuestion();
}

function advanceBookmark() {
  if (!g || g.mode !== 'book') return;
  const b = g.book;
  bookmarks[b.meta.slug] = { chunk: Math.min(b.from + b.got, b.total), t: Date.now() };
  saveBookmarks();
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
  el.innerHTML = '';
  // Options stay in their authored order: the correct answer is not always
  // first, and shuffling would only re-randomise an already-fixed layout.
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.textContent = opt;
    b.addEventListener('click', () => answerQuestion(i));
    el.appendChild(b);
  });
}

function answerQuestion(choice) {
  const qs = g.passage.questions;
  const q = qs[g.quizIndex];
  const right = choice === q.answer;
  g.quizAnswers.push({ choice, right });

  g.log.push({
    item_id: g.passage.id,
    item_name: g.passage.title,
    correct: right,
    ms: Math.round(g.lastElapsedMs / qs.length),
    answered_at: new Date().toISOString(),
  });

  g.quizIndex += 1;
  if (g.quizIndex < qs.length) renderQuestion();
  else scoreRound();
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

  // Finishing the quiz banks the reading — the bookmark advances regardless
  // of the score. You read it; the score just tells you how well.
  if (g.mode === 'book') advanceBookmark();

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
  // verifies the comprehension.
  const answered = g.log.length;
  const compFactor = answered ? g.log.filter((a) => a.correct).length / answered : 0;
  g.xpGain = g.mode === 'free'
    ? Math.round(g.wordsRead / 20)
    : Math.round((g.wordsRead / 10) * compFactor);
  const levelBefore = levelForXp(store.xp);
  store.xp += g.xpGain;
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
    // A book stretch too fragmented to quiz — banked without a score.
    $('results-title').textContent = g.book ? g.book.meta.title : 'Done';
    $('results-score').innerHTML = `${g.words.length.toLocaleString()}<span> words</span>`;
    $('results-stats').innerHTML = '';
    $('results-note').textContent = 'That stretch was too fragmented to quiz (front matter, most likely) — bookmarked and moving on.';
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
      `<div class="stat"><b>${last.correct}/${last.total}</b><span>correct</span></div>` +
      (g.mode === 'ladder' ? `<div class="stat"><b>${g.rung}</b><span>rungs climbed</span></div>` : '');

    if (g.mode === 'book') {
      const b = g.book;
      const done = Math.min(b.from + b.got, b.total);
      const pct = Math.round((done / b.total) * 100);
      const wordsLeft = ((b.total - done) / b.total) * b.meta.words;
      const hoursLeft = last.effective > 0 ? wordsLeft / last.effective / 60 : null;
      $('results-title').textContent = `${b.meta.title} — ${pct}%`;
      $('results-note').textContent = done >= b.total
        ? '📕 Finished. That\'s a whole book banked.'
        : `Bookmarked. ${hoursLeft !== null ? `About ${hoursLeft.toFixed(1)}h of reading left at this effective speed — "Go again" continues from here.` : '"Go again" continues from here.'}`;
    } else {
      $('results-note').textContent =
        comp >= 85 ? 'Comprehension is holding. Push the speed up 50 and see if it still does.'
          : comp >= 60 ? 'You are near the edge — this is roughly your working ceiling right now.'
          : 'Too fast. At this speed you are recognising words rather than reading sentences.';
    }

    $('results-review').innerHTML = '<h3>What you missed</h3>' + (
      last.answers.every((a) => a.right)
        ? '<p class="clean-sweep">Nothing — full marks.</p>'
        : last.answers.map((a, i) => a.right ? '' : `
            <div class="missed-row">
              <code>${esc(last.questions[i].q)}</code>
              <span>Answer: ${esc(last.questions[i].options[last.questions[i].answer])}</span>
            </div>`).join('')
    );
  }

  showScreen('results');
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
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

$('wpm-slider').addEventListener('input', (e) => {
  sel.wpm = Number(e.target.value);
  $('wpm-value').textContent = `${sel.wpm} wpm`;
});

document.addEventListener('keydown', (e) => {
  if (screens.read.classList.contains('active')) {
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === 'Escape') endGame(true);
  } else if (screens.quiz.classList.contains('active')) {
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

renderMenu();
Sync.mountUI();
