/* game.js — Marginalia: the passages Jason marked by hand, given back to him.
 *
 * The cards come from book_notes: things he bracketed, quoted, underlined or
 * circled in a physical book, photographed at the Reading bot and lifted off the
 * page. THE MARK DECIDES THE QUESTION, because the mark is how he recorded what
 * he wanted from the passage in the first place:
 *
 *   verbatim   (a quoted or underlined line)  -> fill the gaps in it
 *   recall     (a bracketed passage)          -> say what it argued, graded by AI
 *   definition (a circled term)               -> define it, graded by AI
 *
 * Asking every card the same way would flatten that back out. A bracket around
 * three paragraphs means "I want this idea back", not "I want to recite it".
 *
 * NOTHING IS GRADED HERE. The card arrives as a cue with the answer withheld and
 * the answer is posted back to /api/book-notes to be marked. Two reasons: free
 * recall needs a model call, which spends his credits and so has to be
 * server-side regardless; and once it is, shipping the text to a browser that is
 * about to ask him to recall it is just handing over the answer sheet.
 *
 * Owner-only. The API returns 403 to anyone else, and the menu says so rather
 * than offering a review that cannot load.
 */

const STORE_KEY = 'marginalia.profile.v1';
// The hub is a static page with no session of its own, so it can't ask the API
// how many cards are due. It reads this cache instead — same trick it already
// uses to read the other games' profiles — and only shows the Marginalia duty
// when there is actually something to review.
const DUE_KEY = 'marginalia.due.v1';
const DEFAULT_BATCH = 10;

// The books are Jason's private library, so this rides the same owner-gated
// endpoint family as the Reader's book text. Derived from Sync's endpoint so a
// local Atlas dev server (games.sync.endpoint in localStorage) is picked up here
// too, instead of this one file silently still pointing at production.
const API = (window.Sync && Sync.contentEndpoint
  ? Sync.contentEndpoint()
  : 'https://jason-atlas.vercel.app/api/game-content'
).replace(/game-content(?=[^/]*$)/, 'book-notes');

const $ = (id) => document.getElementById(id);

const ASK = {
  verbatim: 'Fill the gaps',
  recall: 'What did this passage argue?',
  definition: 'What does this mean?',
};

const MARK_GLYPH = {
  quote: '“ ”',
  bracket: '[ ]',
  underline: '＿',
  circle: '◯',
  squiggle: '◯',
  unknown: '·',
};

// ---------------------------------------------------------------------------
// Local profile — just enough to make progress visible between sessions. The
// real record is the streak on each card, which lives server-side.
// ---------------------------------------------------------------------------

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
};
// xp is here because the hub sums it across every game's profile for the
// combined level. Without it Marginalia would be the one game that never moves
// that number. Same 10-per-correct rate it reports to Sync.
const profile = Object.assign({ reviewed: 0, correct: 0, sessions: 0, xp: 0, lastPlayed: null }, load());
const saveProfile = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch {}
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cards = [];
let idx = 0;
let run = null;      // { started, results: [] }
let current = null;
let verdict = null;
let busy = false;

const show = (name) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, init) {
  const token = window.Sync ? Sync.token() : '';
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
  return body;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function srcLine(c) {
  const bits = [c.book];
  if (c.chapter) bits.push(c.chapter);
  if (c.page) bits.push(`p${c.page}`);
  return bits.filter(Boolean).join(' · ');
}

async function refreshMenu() {
  const signedIn = window.Auth && Auth.isSignedIn();
  if (!signedIn) {
    $('due-count').textContent = '—';
    $('due-label').textContent = 'sign in to load your notes';
    $('start-btn').disabled = true;
    return;
  }
  try {
    const s = await api('?op=stats');
    $('due-count').textContent = s.due;
    $('due-label').textContent = s.due === 1 ? 'card due' : 'cards due';
    $('start-btn').disabled = s.due === 0;
    $('start-btn').textContent = s.due === 0 ? 'Nothing due' : 'Review';
    $('lib-stats').innerHTML =
      `<span><b>${s.total}</b> marked</span>` +
      `<span><b>${s.mastered}</b> owned</span>` +
      `<span><b>${s.books.length}</b> book${s.books.length === 1 ? '' : 's'}</span>`;
    $('books').textContent = s.books.length ? s.books.join(' · ') : 'No notes yet — snap a marked page at the Reading bot.';
    try {
      localStorage.setItem(DUE_KEY, JSON.stringify({ due: s.due, on: new Date().toISOString().slice(0, 10) }));
    } catch {}
  } catch (e) {
    $('due-count').textContent = '—';
    $('due-label').textContent = e.status === 403
      ? 'this one is Jason’s own library'
      : `couldn’t load (${e.message})`;
    $('start-btn').disabled = true;
  }
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

async function startRun() {
  $('start-btn').disabled = true;
  try {
    const out = await api(`?op=due&limit=${DEFAULT_BATCH}`);
    cards = out.cards || [];
  } catch (e) {
    $('due-label').textContent = `couldn’t load (${e.message})`;
    $('start-btn').disabled = false;
    return;
  }
  if (!cards.length) { refreshMenu(); return; }
  idx = 0;
  run = { started: Date.now(), results: [] };
  show('review');
  paintCard();
}

function paintCard() {
  current = cards[idx];
  busy = false;

  $('run-progress').textContent = `${idx + 1} / ${cards.length}`;
  $('run-fill').style.width = `${(idx / cards.length) * 100}%`;

  $('card-src').innerHTML =
    `<span class="mark" title="${esc(current.mark)}">${MARK_GLYPH[current.mark] || '·'}</span> ${esc(srcLine(current))}` +
    (current.streak ? `<span class="streak">streak ${current.streak}</span>` : '');
  $('card-ask').textContent = ASK[current.kind] || 'Recall it';

  const isLine = current.kind === 'verbatim';
  $('card-prompt').className = `prompt ${current.kind}`;
  $('card-prompt').textContent = current.prompt;

  // A bracketed passage has no text on screen to lean on, so say how long the
  // thing he's reaching for was — "two sentences" and "two pages" are different
  // recall jobs and he should know which one he's being asked for.
  if (current.kind === 'recall') {
    $('card-prompt').innerHTML =
      `${esc(current.prompt)}<span class="len">${current.words} words you bracketed</span>`;
  }

  $('answer-line').classList.toggle('on', isLine);
  $('answer-box').classList.toggle('on', !isLine);
  const field = isLine ? $('answer-line') : $('answer-box');
  field.value = '';
  setTimeout(() => field.focus(), 60);

  $('submit-btn').disabled = false;
  $('submit-btn').textContent = 'Check';
}

async function submit(blank) {
  if (busy) return;
  busy = true;
  const field = current.kind === 'verbatim' ? $('answer-line') : $('answer-box');
  const answer = blank ? '' : field.value.trim();
  if (!blank && !answer) { busy = false; field.focus(); return; }

  $('submit-btn').disabled = true;
  $('submit-btn').textContent = 'Checking…';

  try {
    verdict = await api('', {
      method: 'POST',
      body: JSON.stringify({ op: 'review', id: current.id, answer }),
    });
  } catch (e) {
    $('submit-btn').disabled = false;
    $('submit-btn').textContent = 'Check';
    $('card-ask').textContent = `couldn’t grade that — ${e.message}`;
    busy = false;
    return;
  }

  run.results.push({
    id: current.id, kind: current.kind, correct: verdict.correct,
    score: verdict.score, book: current.book,
  });
  profile.reviewed++;
  if (verdict.correct) { profile.correct++; profile.xp += 10; }
  saveProfile();

  paintVerdict();
}

function paintVerdict() {
  const ok = verdict.correct;
  $('verdict-head').innerHTML =
    `<span class="badge ${ok ? 'good' : 'bad'}">${ok ? 'Held' : 'Gone'}</span>` +
    `<span class="score">${verdict.score}</span>` +
    (verdict.mastered ? '<span class="badge own">owned</span>' : '');
  $('verdict-feedback').textContent = verdict.feedback || '';

  $('actual-label').textContent = current.kind === 'definition' ? 'Where you circled it' : 'On the page';
  $('actual-text').innerHTML = (verdict.term ? `<b class="term">${esc(verdict.term)}</b> — ` : '') + esc(verdict.answer);
  $('actual-src').textContent = srcLine(current);
  $('own-note').textContent = current.note ? `your note: ${current.note}` : '';
  $('own-note').style.display = current.note ? '' : 'none';

  const when = new Date(`${verdict.next_review}T12:00:00Z`);
  const days = Math.round((when - Date.now()) / 86400000);
  $('sched-hint').textContent = ok
    ? `back in ${days} day${days === 1 ? '' : 's'}.`
    : 'back tomorrow.';

  $('next-btn').textContent = idx + 1 >= cards.length ? 'Finish' : 'Next';
  show('verdict');
  setTimeout(() => $('next-btn').focus(), 60);
}

async function archiveCurrent() {
  $('archive-btn').disabled = true;
  try {
    await api('', { method: 'POST', body: JSON.stringify({ op: 'archive', id: current.id }) });
    // It was never a real card, so it shouldn't count against the session.
    run.results = run.results.filter((r) => r.id !== current.id);
    $('archive-btn').textContent = 'dropped';
  } catch {
    $('archive-btn').textContent = 'couldn’t drop';
  }
  advance();
}

function advance() {
  idx++;
  if (idx >= cards.length) { finish(); return; }
  $('archive-btn').disabled = false;
  $('archive-btn').textContent = 'Bad read';
  show('review');
  paintCard();
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

function finish() {
  const r = run.results;
  const held = r.filter((x) => x.correct).length;
  const pct = r.length ? Math.round((held / r.length) * 100) : 0;

  profile.sessions++;
  profile.lastPlayed = new Date().toISOString().slice(0, 10);
  saveProfile();

  $('done-title').textContent = r.length === 0 ? 'Nothing scored'
    : pct === 100 ? 'All of it held'
    : pct >= 60 ? 'Most of it held'
    : 'That one needed the reread';
  $('done-sub').textContent = r.length ? `${held} of ${r.length} came back.` : 'No cards were graded.';

  const tile = (v, l) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`;
  const secs = Math.round((Date.now() - run.started) / 1000);
  $('done-tiles').innerHTML =
    tile(`${pct}%`, 'held') +
    tile(held, 'correct') +
    tile(r.length, 'reviewed') +
    tile(secs < 90 ? `${secs}s` : `${Math.round(secs / 60)}m`, 'time');

  // Same pipe every other game uses, so Marginalia shows up in Atlas's Games tab
  // beside the rest instead of being a private side loop.
  if (window.Sync && r.length) {
    Sync.record({
      game: 'marginalia',
      session: {
        client_session_id: `marg-${run.started}`,
        mode: 'review',
        score: pct,
        answered: r.length,
        correct: held,
        best_streak: 0,
        duration_ms: Date.now() - run.started,
        xp_gained: held * 10,
        aborted: false,
        played_at: new Date(run.started).toISOString(),
      },
      answers: r.map((x) => ({
        item_id: String(x.id),
        item_name: `${x.book} (${x.kind})`,
        correct: x.correct,
        ms: 0,
        answered_at: new Date().toISOString(),
      })),
    });
  }

  show('done');
  refreshMenu();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$('start-btn').addEventListener('click', startRun);
$('submit-btn').addEventListener('click', () => submit(false));
$('blank-btn').addEventListener('click', () => submit(true));
$('next-btn').addEventListener('click', advance);
$('archive-btn').addEventListener('click', archiveCurrent);
$('again-btn').addEventListener('click', () => { show('menu'); refreshMenu(); });
$('quit-btn').addEventListener('click', () => { finish(); });

// Enter submits the one-line cloze; Ctrl/Cmd+Enter submits the long answers, so
// a newline in a recalled paragraph doesn't fire the grade.
$('answer-line').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(false); });
$('answer-box').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && $('screen-verdict').classList.contains('active')) advance();
});

if (window.Sync) Sync.mountUI('account-card');
if (window.Auth) Auth.ready.then(refreshMenu);
else refreshMenu();
