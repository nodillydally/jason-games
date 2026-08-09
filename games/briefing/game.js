/* game.js — Briefing v2: the news, kept — and graded.
 *
 * One session per day, laid out as tabs you can jump between freely:
 *
 *   🧠 Yesterday — free recall, cold: one big box, write everything you
 *      remember from yesterday's brief. Graded by AI against the actual
 *      stories. This replaced the multiple-choice quiz because free recall
 *      is the stronger form of the testing effect — retrieval without cues.
 *
 *   1..N Stories — read the what, the details, and the source links, then
 *      write: what happened, why it matters, what you think. The brief's own
 *      "why" stays hidden until after grading, so the writing is committed
 *      first. Graded 0-100 with a letter, strengths, and what was missed.
 *
 *   📈 Markets — key indices, rates, BTC, gold, FX with 1-day and
 *      week-to-date moves plus generated commentary. Prompt is recap + your
 *      read (no "why it matters" — for markets that's the same question).
 *
 * All grading happens server-side (game-grade) against source material the
 * server loads itself; the written takes are stored in Atlas as a
 * longitudinal record of Jason's thinking, not just scores.
 */
'use strict';

const STORE_KEY = 'briefing.profile.v1';
const DAY_KEY = 'briefing.day.v1';   // in-progress day: drafts + grades, per story
const FETCH_DAYS = 14;
const MIN_WORDS = 15;

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const screens = {
  menu: $('screen-menu'),
  day: $('screen-day'),
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
    if (raw) return { xp: 0, sessions: 0, scoreSum: 0, gradedCount: 0, doneDates: {}, best: {}, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { xp: 0, sessions: 0, scoreSum: 0, gradedCount: 0, doneDates: {}, best: {} };
}

const store = loadStore();
const saveStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));

const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

const letterFor = (score) =>
  score >= 97 ? 'A+' : score >= 90 ? 'A' : score >= 85 ? 'A-'
    : score >= 80 ? 'B+' : score >= 75 ? 'B' : score >= 70 ? 'B-'
    : score >= 65 ? 'C+' : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F';

// Consecutive kept days, with one grace day.
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
// Endpoints (private — same credential as sync)
// ---------------------------------------------------------------------------

const url = (fn) => Sync.contentEndpoint().replace(/game-content$/, fn);

async function apiGet(fn, params) {
  const res = await fetch(`${url(fn)}?${new URLSearchParams(params || {})}`, {
    headers: { authorization: `Bearer ${Sync.token()}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${fn} failed (${res.status})`);
  return body;
}

async function apiPost(fn, payload) {
  const res = await fetch(url(fn), {
    method: 'POST',
    headers: { authorization: `Bearer ${Sync.token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${fn} failed (${res.status})`);
  return body;
}

let briefs = null;
let briefsError = null;

async function loadBriefs() {
  if (briefs || briefsError) return;
  try {
    briefs = (await apiGet('game-content', { op: 'news', days: FETCH_DAYS })).briefs;
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

function renderMenu() {
  const level = levelForXp(store.xp);
  $('menu-level').textContent = level;
  const cur = store.xp - xpAtLevel(level);
  const need = xpAtLevel(level + 1) - xpAtLevel(level);
  $('xp-fill').style.width = `${Math.min(100, (cur / need) * 100)}%`;
  $('xp-label').textContent = `${cur} / ${need} XP to level ${level + 1}`;

  const avg = store.gradedCount ? Math.round(store.scoreSum / store.gradedCount) : null;
  $('profile-stats').innerHTML =
    `<span><b>${briefStreak()}</b> day streak</span>` +
    `<span><b>${Object.keys(store.doneDates).length}</b> briefs kept</span>` +
    `<span><b>${avg !== null ? `${letterFor(avg)} (${avg})` : '—'}</b> avg grade</span>`;

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
  const done = store.doneDates[latest.date];
  $('start-btn').disabled = false;
  $('setup-hint').textContent =
    `${weekday(latest.date)} · ${latest.topic} · ${latest.items.length} stories + markets` +
    (briefs[1] ? ` + recall of ${weekday(briefs[1].date)}` : '') +
    (done ? ' · already kept' : '');
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
}

// ---------------------------------------------------------------------------
// The day session
// ---------------------------------------------------------------------------

let g = null;
let markets = null;      // fetched lazily on first Markets tab open
let marketsError = null;

// Every draft keystroke and every landed grade goes straight to localStorage,
// keyed by the brief's date — leaving mid-session loses nothing.
function saveDay() {
  if (!g) return;
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify({
      date: g.brief.date,
      id: g.id,
      startedAt: g.startedAt,
      score: g.score,
      log: g.log,
      finished: g.finished || false,
      tabs: Object.fromEntries(Object.entries(g.tabs).map(([k, t]) =>
        [k, { text: t.text, grade: t.grade, hinted: t.hinted || false }])),
    }));
  } catch { /* storage full/private mode — session still works in memory */ }
}

function loadDay(date) {
  try {
    const s = JSON.parse(localStorage.getItem(DAY_KEY));
    return s && s.date === date ? s : null;
  } catch { return null; }
}

function startDay() {
  if (!briefs || !briefs.length) return;
  const brief = briefs[0];

  const tabs = {};
  if (briefs[1]) tabs.recall = { text: '', grade: null, pending: false, hinted: false, error: null };
  brief.items.forEach((_, i) => { tabs[`s${i}`] = { text: '', grade: null, pending: false, error: null }; });
  tabs.markets = { text: '', grade: null, pending: false, error: null };

  g = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    startedAt: Date.now(),
    log: [],
    brief,
    tabs,
    active: briefs[1] ? 'recall' : 's0',
    score: 0,
    finished: false,
  };

  // Pick up where the day left off.
  const saved = loadDay(brief.date);
  if (saved) {
    g.id = saved.id || g.id;
    g.startedAt = saved.startedAt || g.startedAt;
    g.score = saved.score || 0;
    g.log = saved.log || [];
    g.finished = saved.finished || false;
    for (const [k, t] of Object.entries(saved.tabs || {})) {
      if (g.tabs[k]) Object.assign(g.tabs[k], { text: t.text || '', grade: t.grade || null, hinted: t.hinted || false });
    }
    // Resume on the first thing still unwritten.
    const next = tabKeysOf(g).find((k) => !g.tabs[k].grade);
    if (next) g.active = next;
  }

  $('day-meta').textContent = `${weekday(brief.date)} · ${brief.topic}`;
  showScreen('day');
  renderTabs();
  renderPanel();
}

const tabKeysOf = (session) => Object.keys(session.tabs);

const tabKeys = () => Object.keys(g.tabs);
const gradedCount = () => tabKeys().filter((k) => g.tabs[k].grade).length;
const storiesAllGraded = () => g.brief.items.every((_, i) => g.tabs[`s${i}`].grade);

function tabLabel(key) {
  if (key === 'recall') return '🧠 Yesterday';
  if (key === 'markets') return '📈 Markets';
  return `Story ${Number(key.slice(1)) + 1}`;
}

function renderTabs() {
  const nav = $('day-tabs');
  nav.innerHTML = '';
  tabKeys().forEach((key) => {
    const t = g.tabs[key];
    const b = document.createElement('button');
    b.className = `day-tab${g.active === key ? ' active' : ''}${t.grade ? ' done' : ''}`;
    const mark = t.grade ? ` <em>${t.grade.letter}</em>` : t.pending ? ' <em>…</em>' : t.error ? ' <em>!</em>' : '';
    b.innerHTML = `${tabLabel(key)}${mark}`;
    b.addEventListener('click', () => { saveDraft(); g.active = key; renderTabs(); renderPanel(); });
    nav.appendChild(b);
  });

  $('day-score').textContent = `${g.score} pts`;
  const n = gradedCount();
  const pending = tabKeys().filter((k) => g.tabs[k].pending).length;
  const finish = $('finish-day');
  finish.disabled = n === 0 || pending > 0;
  finish.textContent = pending > 0 ? `Grading ${pending} in the background…`
    : n === 0 ? 'Grade something first'
    : `Finish the day (${n}/${tabKeys().length} graded)`;
}

function saveDraft() {
  const ta = $('take-input');
  if (ta && g) g.tabs[g.active].text = ta.value;
  saveDay();
}

// The first tab after `fromKey` that still needs writing.
function nextUnwritten(fromKey) {
  const keys = tabKeys();
  const start = keys.indexOf(fromKey);
  for (let step = 1; step <= keys.length; step += 1) {
    const k = keys[(start + step) % keys.length];
    if (!g.tabs[k].grade && !g.tabs[k].pending) return k;
  }
  return null;
}

// ---- panel renderers ------------------------------------------------------

function promptBlock(prompts, state, cta, extra = '') {
  if (state.pending) {
    return `
      <p class="take-prompts">${prompts.map((p) => `<span>${esc(p)}</span>`).join('')}</p>
      <div class="pending-note">Grading in the background — keep going.</div>
      <p class="submitted-text">${esc(state.text)}</p>`;
  }
  return `
    <p class="take-prompts">${prompts.map((p) => `<span>${esc(p)}</span>`).join('')}</p>
    ${extra}
    <textarea id="take-input" rows="5" placeholder="">${esc(state.text)}</textarea>
    <button id="grade-btn" class="primary big">${state.error ? 'Retry grade' : cta}</button>
    <div id="grade-error" class="grade-error">${state.error ? esc(state.error) : ''}</div>`;
}

// Bold the load-bearing specifics — figures, magnitudes, acronyms — which are
// also exactly what the grader checks for. Escape first, then mark.
const KEY_RX = /(\$\d[\d,]*(?:\.\d+)?(?:\s?(?:trillion|billion|million|bn|mn|k))?|\d[\d,]*(?:\.\d+)?(?:%|(?:\s?(?:trillion|billion|million|percent|points?|bps)))?|\b[A-Z][A-Z0-9]{1,5}\b)/g;
const emphasize = (s) => esc(s).replace(KEY_RX, '<b>$1</b>');

function gradeCard(grade, revealHtml = '') {
  return `
    <div class="grade-card">
      <div class="grade-head">
        <span class="grade-letter">${esc(grade.letter)}</span>
        <span class="grade-score">${grade.score}<small>/100</small></span>
      </div>
      <p class="grade-summary">${esc(grade.summary)}</p>
      ${grade.strengths.length ? `<div class="grade-list good-list"><b>What landed</b><ul>${grade.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      ${grade.connections_made && grade.connections_made.length ? `<div class="grade-list conn-list"><b>Connections you made</b><ul>${grade.connections_made.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      ${grade.missed.length ? `<div class="grade-list miss-list"><b>${g.active === 'recall' ? 'What you didn\'t recall' : 'What you missed'}</b><ul>${grade.missed.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      ${grade.connection_suggested ? `<div class="conn-suggest"><b>One you could have made</b><p>${esc(grade.connection_suggested)}</p></div>` : ''}
      ${revealHtml}
    </div>`;
}

function renderPanel() {
  const panel = $('day-panel');
  const key = g.active;
  const state = g.tabs[key];

  if (key === 'recall') {
    const y = briefs[1];
    const hintHtml = state.hinted
      ? `<div class="hint-reveal"><b>Headlines (cued recall — caps the grade)</b><ul>${y.items.map((it) => `<li>${esc(it.headline || it.what)}</li>`).join('')}</ul></div>`
      : `<button id="hint-btn" class="ghost">Show headlines (caps the grade at 85)</button>`;
    panel.innerHTML = `
      <div class="card story-card">
        <div class="story-meta">Cold recall · ${weekday(y.date)} ${shortDate(y.date)} · ${esc(y.topic)}</div>
        <h2 class="panel-title">What do you remember from ${weekday(y.date)}'s brief?</h2>
        ${state.grade
          ? gradeCard(state.grade, `<div class="reveal-block"><b>${weekday(y.date)}'s stories were</b><ul>${y.items.map((it) => `<li>${esc(it.headline || it.what)}</li>`).join('')}</ul></div>`)
          : promptBlock([`${y.items.length} stories`, 'What happened?', 'Why did it matter?'], state, 'Save & next', hintHtml)}
      </div>`;
  } else if (key === 'markets') {
    renderMarketsPanel(panel, state);
  } else {
    const i = Number(key.slice(1));
    const it = g.brief.items[i];
    panel.innerHTML = `
      <div class="card story-card">
        <div class="story-meta">${weekday(g.brief.date)} · story ${i + 1} of ${g.brief.items.length}</div>
        <h2 class="panel-title">${esc(it.headline || it.what)}</h2>
        ${it.headline ? `<p class="story-what">${emphasize(it.what)}</p>` : ''}
        <ul class="story-details">${it.details.map((d) => `<li>${emphasize(d)}</li>`).join('')}</ul>
        ${it.sources.length ? `<div class="sources">${it.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('')}</div>` : ''}
        ${state.grade
          ? gradeCard(state.grade, `<div class="reveal-block"><b>The brief's take</b><p>${esc(it.why)}</p></div>`)
          : promptBlock(['What happened?', 'Why does it matter?', 'What do you think?', 'Connect it to anything you know'], state, 'Save & next')}
      </div>`;
  }

  wirePanel();
}

function renderMarketsPanel(panel, state) {
  if (marketsError) {
    panel.innerHTML = `<div class="card story-card"><div class="story-meta">Markets</div><p class="panel-sub">Couldn't load the market pulse: ${esc(marketsError)}</p></div>`;
    return;
  }
  if (!markets) {
    panel.innerHTML = `<div class="card story-card"><div class="story-meta">Markets</div><p class="panel-sub loading-pulse">Pulling today's numbers…</p></div>`;
    apiGet('game-markets').then((m) => { markets = m; }).catch((err) => { marketsError = err.message; })
      .finally(() => { if (g && g.active === 'markets') renderPanel(); });
    return;
  }

  const fmtLevel = (r) => r.kind === 'rate' ? `${r.level.toFixed(2)}%`
    : r.level >= 1000 ? r.level.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : r.level.toFixed(r.level < 10 ? 3 : 2);
  const fmtMove = (v, kind) => v === null ? '—'
    : `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${v}${kind === 'rate' ? 'pt' : '%'}</span>`;

  panel.innerHTML = `
    <div class="card story-card">
      <div class="story-meta">Market pulse · as of ${esc(markets.rows[0]?.as_of || markets.date)}</div>
      <table class="mkt-table">
        <thead><tr><th></th><th>Level</th><th>1D</th><th>WTD</th><th>YTD</th></tr></thead>
        <tbody>
          ${markets.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${fmtLevel(r)}</td><td>${fmtMove(r.d1, r.kind)}</td><td>${fmtMove(r.wtd, r.kind)}</td><td>${fmtMove(r.ytd, r.kind)}</td></tr>`).join('')}
        </tbody>
      </table>
      ${renderCommentary(markets.commentary)}
      ${state.grade
        ? gradeCard(state.grade)
        : promptBlock(['Recap the moves', 'What do you think?', 'Tie them to the week'], state, 'Save & next')}
    </div>`;
}

// Commentary arrives as "- " bullets (weekly context); older cached snapshots
// were a single sentence. Render whichever shape is stored.
function renderCommentary(text) {
  if (!text) return '';
  const bullets = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  if (bullets.length) {
    return `<ul class="mkt-context">${bullets.map((b) => `<li>${emphasize(b)}</li>`).join('')}</ul>`;
  }
  return `<p class="mkt-commentary">${esc(text)}</p>`;
}

function wirePanel() {
  const ta = $('take-input');
  if (ta) ta.addEventListener('input', () => { g.tabs[g.active].text = ta.value; });
  const btn = $('grade-btn');
  if (btn) btn.addEventListener('click', submitTake);
  const hint = $('hint-btn');
  if (hint) hint.addEventListener('click', () => {
    saveDraft();
    g.tabs.recall.hinted = true;
    saveDay();
    renderPanel();
  });
}

// ---- grading --------------------------------------------------------------

// Submit and move on — grading happens in the background while the next story
// is being read. The tab picks up its letter when the grade lands; the full
// feedback waits on the tab and in the end-of-day review.
function submitTake() {
  const session = g;
  const key = session.active;
  const state = session.tabs[key];
  saveDraft();
  const text = state.text.trim();

  if (text.split(/\s+/).length < MIN_WORDS) {
    $('grade-error').textContent = `Give it a real attempt first — at least ${MIN_WORDS} words.`;
    return;
  }

  state.pending = true;
  state.error = null;

  const payload = key === 'recall'
    ? { kind: 'recall', date: briefs[1].date, user_text: text, hinted: Boolean(state.hinted) }
    : key === 'markets'
    ? { kind: 'markets', user_text: text }
    : { kind: 'story', date: session.brief.date, idx: Number(key.slice(1)), user_text: text };

  apiPost('game-grade', payload).then((grade) => {
    state.pending = false;
    state.grade = grade;
    if (g !== session) return;  // day was closed while grading — take is safe server-side
    g.score += grade.score;
    store.scoreSum += grade.score;
    store.gradedCount += 1;
    saveStore();
    g.log.push({
      item_id: key === 'recall' ? `${briefs[1].date}#recall` : key === 'markets' ? `${g.brief.date}#markets` : `${g.brief.date}#${key.slice(1)}`,
      item_name: (key.startsWith('s') ? (g.brief.items[Number(key.slice(1))].headline || '') : tabLabel(key)).slice(0, 120) || tabLabel(key),
      correct: grade.score >= 70,
      ms: 0,
      answered_at: new Date().toISOString(),
    });
    saveDay();
    renderTabs();
    if (g.active === key) renderPanel();
  }).catch((err) => {
    state.pending = false;
    state.error = err.message;
    if (g !== session) return;
    renderTabs();
    if (g.active === key) renderPanel();
  });

  // Straight to the next unwritten thing — no waiting on the grader.
  const next = nextUnwritten(key);
  if (next) g.active = next;
  renderTabs();
  renderPanel();
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
      mode: 'daily',
      continent: null,
      difficulty: null,
      question_type: 'graded',
      score: aborted ? 0 : g.score,
      answered: g.log.length,
      correct: g.log.filter((l) => l.correct).length,
      best_streak: 0,
      duration_ms: Date.now() - g.startedAt,
      xp_gained: xpGain,
      aborted,
      played_at: new Date(g.startedAt).toISOString(),
    },
    answers: g.log,
  });
}

// Leaving mid-day is not quitting — everything is saved per story, and the
// session resumes exactly where it left off.
function leaveDay() {
  saveDraft();
  showScreen('menu');
  renderMenu();
  g = null;
}

function endGame(aborted = false) {
  if (!g) return;

  if (aborted) return leaveDay();

  // Finishing twice (reopening a finished day) must not double-count.
  if (g.finished) {
    renderResults();
    showScreen('results');
    return;
  }

  const levelBefore = levelForXp(store.xp);
  const xpGain = Math.round(g.score / 10);
  store.xp += xpGain;
  store.sessions += 1;

  // The streak is for keeping the whole brief — every story graded. Recall
  // and markets are bonuses, not gates.
  if (storiesAllGraded()) store.doneDates[g.brief.date] = true;

  g.finished = true;
  saveDay();
  saveStore();
  syncSession(false, xpGain);

  const levelAfter = levelForXp(store.xp);
  renderResults(xpGain, levelBefore, levelAfter);

  showScreen('results');
  if (window.Juice) {
    const graded = tabKeys().filter((k) => g.tabs[k].grade);
    const avg = graded.length ? Math.round(graded.reduce((s, k) => s + g.tabs[k].grade.score, 0) / graded.length) : 0;
    if (avg >= 80) Juice.celebrate($('results-score'));
    if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
  }
}

// The end-of-day review: the aggregate up top, then every grade and its
// feedback in one scroll — the "look back at the grades and the thoughts".
function renderResults(xpGain = 0, levelBefore = null, levelAfter = null) {
  const graded = tabKeys().filter((k) => g.tabs[k].grade);
  const avg = graded.length ? Math.round(graded.reduce((s, k) => s + g.tabs[k].grade.score, 0) / graded.length) : 0;

  $('results-title').textContent = storiesAllGraded() ? 'Brief kept' : 'Progress banked';
  $('results-score').innerHTML = `${letterFor(avg)}<span> · ${avg}/100 average</span>`;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${graded.length}/${tabKeys().length}</b><span>graded</span></div>` +
    `<div class="stat"><b>${g.score.toLocaleString()}</b><span>points</span></div>` +
    `<div class="stat"><b>${briefStreak()}</b><span>day streak</span></div>`;
  $('results-xp').innerHTML = (levelAfter !== null && levelAfter > levelBefore)
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : xpGain ? `+${xpGain} XP` : '';
  $('results-note').textContent = storiesAllGraded()
    ? 'Tomorrow opens with cold recall of today.'
    : 'Streak counts full briefs — some stories are still ungraded.';

  $('results-review').innerHTML = graded.map((k) => {
    const grade = g.tabs[k].grade;
    return `<div class="review-item">
      <div class="review-head">
        <span class="review-tab">${tabLabel(k)}</span>
        <span class="review-grade">${esc(grade.letter)} <small>${grade.score}</small></span>
      </div>
      <p>${esc(grade.summary)}</p>
      ${grade.missed && grade.missed.length ? `<ul>${grade.missed.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      ${grade.connection_suggested ? `<div class="conn-suggest"><b>One you could have made</b><p>${esc(grade.connection_suggested)}</p></div>` : ''}
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function renderStats() {
  const avg = store.gradedCount ? Math.round(store.scoreSum / store.gradedCount) : null;
  $('stats-summary').innerHTML =
    `<span><b>Lv ${levelForXp(store.xp)}</b> · ${store.xp.toLocaleString()} XP</span>` +
    `<span><b>${briefStreak()}</b> day streak</span>` +
    `<span><b>${Object.keys(store.doneDates).length}</b> briefs kept</span>` +
    `<span><b>${avg !== null ? `${letterFor(avg)} (${avg})` : '—'}</b> avg grade</span>`;

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

$('start-btn').addEventListener('click', startDay);
$('day-quit').addEventListener('click', () => endGame(true));
$('finish-day').addEventListener('click', () => endGame(false));
$('menu-btn').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

renderMenu();
Sync.mountUI();
if (Sync.isEnabled()) loadBriefs();
