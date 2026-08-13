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
const RACE_LEGS = 10;  // first past this many correct answers wins

const MODES = [
  { id: 'classic',  label: 'Classic',  icon: '🎯', hint: '10 questions.' },
  { id: 'blitz',    label: 'Blitz',    icon: '⏱',  hint: '60 seconds — answer as many as you can.' },
  { id: 'marathon', label: 'Marathon', icon: '💀', hint: '3 lives. Questions keep coming until you miss three.' },
  { id: 'ladder',   label: 'Ladder',   icon: '📈', hint: 'Starts easy and ramps up every 5 correct. 3 lives.' },
  { id: 'race',     label: 'Race',     icon: '🏁', hint: `First to ${RACE_LEGS} correct. A wrong answer costs you the leg.` },
  { id: 'versus',   label: 'Versus',   icon: '🤝', hint: 'Two players, one device — pass it back and forth.' },
  { id: 'review',   label: 'Review',   icon: '📚', hint: 'Drills only the topics you keep getting wrong.' },
];

// ---------------------------------------------------------------------------
// Versus — two people on one device
// ---------------------------------------------------------------------------

// A party mode, and deliberately sealed off from the record: a friend
// answering on your device must never move your topic ratings, learned facts,
// per-topic stats, XP or sync. Nothing here is evidence about YOUR arithmetic.
const VERSUS_TURNS = 5;      // Turns: questions each
const VERSUS_SECONDS = 45;   // Timed: clock per player
const VERSUS_LIVES = 3;
// Climb: every question is bigger than the last. Five questions in, the two of
// you are a full tier past where you started; there is no ceiling, so the
// match ends when both players have spent their lives rather than on a clock.
const CLIMB_PER_Q = 0.2;

const VERSUS_FORMATS = [
  { id: 'turns', icon: '🔄', label: 'Turns', hint: `${VERSUS_TURNS} questions each, alternating.` },
  { id: 'timed', icon: '⏱', label: 'Timed', hint: `${VERSUS_SECONDS} seconds each — most points wins.` },
  { id: 'climb', icon: '📈', label: 'Climb', hint: `Alternating, and every question is bigger than the last. ${VERSUS_LIVES} lives each — last one standing.` },
  { id: 'lives', icon: '💀', label: 'Lives', hint: `${VERSUS_LIVES} lives each, played in one go. A miss costs one.` },
];

const isVersus = () => g && g.mode === 'versus';
const vsFormat = () => (g && g.vs ? g.vs.format : 'turns');
const versusPlayer = () => g.vs.players[g.vs.turn];

// Both players face the SAME size of number, so the match is a contest and not
// a handicap: versus ignores Jason's per-topic ratings and runs off the picked
// difficulty. Climb walks that up a full tier every 15 seconds.
function versusT() {
  if (vsFormat() !== 'climb') return g.vs.baseT;
  // Keyed to the PLAYER's own count, so both climb the identical ladder no
  // matter who is ahead.
  return g.vs.baseT + versusPlayer().answered * CLIMB_PER_Q;
}

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   level: 1, choices: 4, seconds: 20, mult: 1 },
  { id: 'normal', label: 'Normal', level: 2, choices: 4, seconds: 15, mult: 1.6 },
  { id: 'hard',   label: 'Hard',   level: 3, choices: 0, seconds: 25, mult: 2.4 },
];

// Adaptive is the default, and it runs on ELO: every topic carries a chess-
// style rating (start 1000). Each question's difficulty is a rating too —
// derived from the operand sizes it was generated at — and answering is a
// match: beat a question above your rating and yours jumps; drop one below it
// and yours falls hard. Questions are served just above your rating, so the
// game always sits at your edge, and there's no level cap — the generators
// scale continuously, so a 1900 in multiplication is genuinely brutal.
//
// Rating <-> difficulty scalar: t = (R - 1000) / 300. Rating updates happen in
// EVERY mode (each question knows its own difficulty); manual Easy/Normal/Hard
// just serve at fixed t instead of tracking you.
const ADAPTIVE = { id: 'adaptive', label: 'Adaptive', icon: '🎚' };
const ELO_START = 1000;
const ELO_PER_T = 300;
const tOf = (r) => Math.max(0, (r - ELO_START) / ELO_PER_T);
const dqOf = (t) => ELO_START + ELO_PER_T * t;
// Continuous pacing: harder questions get more clock; past t≈1.6 the choices
// disappear and answers are typed (recognition stops being worth anything).
const pacingFor = (t) => ({
  id: 'adaptive',
  seconds: Math.min(30, Math.round(14 + 5 * t)),
  choices: t < 1.6 ? 4 : 0,
  mult: 1 + 0.6 * t,
});

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

// Each results tile leads with its own mark, so the row reads by shape before
// any of the numbers do. Module scope: results rows get built from more than
// one place in some games, and a function-scoped helper is a ReferenceError
// waiting for whichever branch was not the one you tested.
const tile = (icon, value, label) =>
  `<div class="stat"><i class="ic">${icon}</i><b>${value}</b><span>${label}</span></div>`;
const screens = {
  menu: $('screen-menu'),
  game: $('screen-game'),
  results: $('screen-results'),
  stats: $('screen-stats'),
  learn: $('screen-learn'),
};

// ---------------------------------------------------------------------------
// Persistent profile
// ---------------------------------------------------------------------------

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {}, facts: {}, levels: {}, elo: {}, ...JSON.parse(raw) };
  } catch (err) { /* corrupted storage — start fresh */ }
  return { xp: 0, games: 0, correct: 0, answered: 0, best: {}, stats: {}, facts: {}, levels: {}, elo: {}, head: 'none' };
}

const store = loadStore();
const saveStore = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));

const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

const statFor = (id) => store.stats[id] || { seen: 0, correct: 0, ms: 0 };
const masteryOf = (id) => { const s = statFor(id); return s.seen ? s.correct / s.seen : 0; };
const avgMsOf = (id) => { const s = statFor(id); return s.seen ? Math.round(s.ms / s.seen) : 0; };

// Learned facts — same rule as Mapmaster and Chronicle: 3 right in a row
// learns it, 2 wrong in a row takes it back. Only Powers & roots qualifies:
// its questions are a finite set of FACTS (17², √289, 7³, 2⁸) that repeat
// verbatim, unlike the other topics' randomly generated arithmetic, where the
// skill is the thing being trained rather than any single item.
const LEARN_RUN = 3;
const UNLEARN_RUN = 2;
const isFact = (q) => q.topic === 'pow';
const learnedFactCount = () => Object.values(store.facts).filter((f) => f.learned).length;

// Per-topic Elo. A topic that lived under the old run-based level system is
// seeded from its level (lv1 -> 1000, lv2 -> 1300, lv3 -> 1600) so nobody
// restarts at the bottom of a hill they already climbed.
function eloState(id) {
  if (!store.elo[id]) {
    const legacy = store.levels && store.levels[id] ? store.levels[id].lv : 1;
    store.elo[id] = { r: ELO_START + ELO_PER_T * (legacy - 1), n: 0 };
  }
  return store.elo[id];
}
const eloOf = (id) => (store.elo[id] ? store.elo[id].r
  : ELO_START + ELO_PER_T * ((store.levels && store.levels[id] ? store.levels[id].lv : 1) - 1));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

// Fractions used a U+2044 FRACTION SLASH, which only becomes a real fraction if
// the font ships OpenType `frac` shaping. Instrument Serif doesn't, so "1/5"
// came out as two full-size digits either side of an upright stroke — at 68px
// it read as "175 of 30". The text is now a plain slash, and the display stage
// builds a properly stacked fraction out of markup, which no font can refuse.
// Only the big question stage does this; the feedback line and the missed list
// keep the plain "1/5", which is perfectly legible at body size.
const questionHtml = (text) => esc(text).replace(
  /(\d+)\/(\d+)/g,
  '<span class="frac"><b>$1</b><i>$2</i></span>'
);

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

// One figure, mounted wherever the current mode wants it: on the race track in
// Race, on a hairline above the question everywhere else. Poses are broadcast
// rather than addressed, so the game loop never has to know which is on screen.

let avatars = [];

const poseAll = (name) => avatars.forEach((a) => a.pose(name));
const flashAll = (name, ms) => avatars.forEach((a) => a.flash(name, ms));

function mountAvatars() {
  avatars = [];
  const isRace = g && g.mode === 'race';
  $('companion').classList.toggle('hidden', isRace);
  const host = isRace ? $('racer-you') : $('companion-avatar');
  // Both hosts are lanes the runner travels along, so it runs in profile.
  avatars.push(Avatar.create(host, { ink: Wardrobe.ink(), gear: Wardrobe.gear(), facing: 'e', sprite: Wardrobe.character(), extras: Wardrobe.extras() }));
  poseAll('idle');
}

// How far along its rail the companion should stand. Modes with a known end
// measure against it; Marathon and Ladder have no finish, so they return null
// and the runner simply runs on the spot.
function companionProgress() {
  if (!g) return 0;
  if (g.mode === 'blitz') {
    const left = Math.max(0, g.endsAt - Date.now());
    return 1 - left / (BLITZ_SECONDS * 1000);
  }
  if (!Number.isFinite(g.rounds)) return null;
  return (g.round - 1 + (g.locked ? 1 : 0)) / g.rounds;
}

function placeCompanion() {
  if (!g || g.mode === 'race') return;
  const p = companionProgress();
  $('companion-rail').classList.toggle('open', p === null);
  $('companion-avatar').style.left = `${clamp(p === null ? 0 : p, 0, 1) * 100}%`;
}

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

const sel = { mode: 'classic', topic: 'mixed', difficulty: 'adaptive', rival: 'kid', vsFormat: 'turns' };

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

  Wardrobe.check('numbers', level);

  const acc = store.answered ? Math.round((store.correct / store.answered) * 100) : 0;
  const ratedTopics = Object.values(store.elo).filter((e) => e && e.n > 0).map((e) => e.r);
  const avgElo = ratedTopics.length ? Math.round(ratedTopics.reduce((a, b) => a + b, 0) / ratedTopics.length) : null;
  $('profile-stats').innerHTML =
    (avgElo !== null ? `<span><b>${avgElo}</b> avg elo</span>` : `<span><b>${store.games}</b> games</span>`) +
    `<span><b>${learnedFactCount()}</b> facts learned</span>` +
    `<span><b>${acc}%</b> accuracy</span>`;

  const fill = (elId, items, group) => {
    const el = $(elId);
    el.innerHTML = '';
    items.forEach((item) => el.appendChild(optionButton(item, group, sel[group] === item.id)));
  };

  fill('mode-options', MODES, 'mode');
  fill('topic-options', [{ id: 'mixed', label: 'Mixed', icon: '🎲' }, ...TOPICS], 'topic');
  fill('difficulty-options', [ADAPTIVE, ...DIFFICULTIES], 'difficulty');

  const isVs = sel.mode === 'versus';
  $('versus-block').classList.toggle('hidden', !isVs);
  if (isVs) {
    fill('vsformat-options', VERSUS_FORMATS, 'vsFormat');
    const f = VERSUS_FORMATS.find((x) => x.id === sel.vsFormat) || VERSUS_FORMATS[0];
    $('vsformat-blurb').textContent =
      `${f.hint} Difficulty applies to both players; Adaptive falls back to Normal so nobody gets a handicap.`;
  }

  const isRace = sel.mode === 'race';
  $('rival-block').classList.toggle('hidden', !isRace);
  if (isRace) {
    fill('rival-options', [...Rival.list(), { id: 'random', label: 'Random', icon: '🎲' }], 'rival');
    $('rival-blurb').textContent = sel.rival === 'random'
      ? 'Take whoever shows up at the line — the rival is revealed when the race starts.'
      : Rival.find(sel.rival).blurb;
  }

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
  // Ladder has its own global ramp, so adaptive per-topic levels don't apply
  // there — it falls back to the normal preset for pacing and scoring.
  const adaptive = sel.difficulty === 'adaptive' && sel.mode !== 'ladder' && sel.mode !== 'versus';
  const preset = DIFFICULTIES.find((d) => d.id === sel.difficulty) || DIFFICULTIES[1];
  const difficulty = adaptive ? ADAPTIVE : preset;
  const versus = sel.mode === 'versus';
  const endless = versus || sel.mode === 'blitz' || sel.mode === 'marathon'
    || sel.mode === 'ladder' || sel.mode === 'race';

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
    adaptive,
    // qdiff is the preset governing the CURRENT question (timer, choices,
    // points). Fixed difficulties keep it constant; adaptive re-picks it per
    // question from the drawn topic's level.
    qdiff: preset,
    // Ladder ignores the picker and climbs on its own.
    level: sel.mode === 'ladder' ? 1 : preset.level,
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
    vs: versus ? {
      format: sel.vsFormat,
      turn: 0,
      turnsEach: VERSUS_TURNS,
      turnRounds: 0,
      lives: VERSUS_LIVES,
      tier: 0,
      turnStartedAt: 0,
      turnEndsAt: 0,
      // Adaptive is meaningless with two players, so versus runs off the
      // picked preset (Adaptive falls back to Normal) and both face the same.
      baseT: Math.max(0, (preset.level || 2) - 1),
      players: [
        { name: ($('p1-name').value.trim() || 'Player 1').slice(0, 12), score: 0, correct: 0, answered: 0, streak: 0, lives: VERSUS_LIVES },
        { name: ($('p2-name').value.trim() || 'Player 2').slice(0, 12), score: 0, correct: 0, answered: 0, streak: 0, lives: VERSUS_LIVES },
      ],
    } : null,
  };

  if (versus) beginVersusTurn();

  showScreen('game');
  if (!versus) $('hud-clock').classList.toggle('hidden', sel.mode !== 'blitz');
  $('hud-lives').classList.toggle('hidden', g.lives === null);

  // The rival paces itself off your own history, so it needs read access to
  // the same numbers the stats screen shows — not to the store itself.
  if (g.mode === 'race') {
    // Random resolves at the line — g.rivalId always holds the REAL rival, so
    // the ghost/metronome achievements stay earnable through a lucky draw.
    g.rivalId = sel.rival === 'random'
      ? Rival.list()[Math.floor(Math.random() * Rival.list().length)].id
      : sel.rival;
    if (sel.rival === 'random' && window.Juice) {
      const def = Rival.find(g.rivalId);
      Juice.toast(`🎲 ${def.icon} ${def.name} steps up`);
    }
    Rival.start({
      rivalId: g.rivalId,
      legs: RACE_LEGS,
      difficultyId: difficulty.id,
      difficultySeconds: difficulty.seconds,
      drawTopic,
      playerGear: Wardrobe.gear(),
      playerSprite: Wardrobe.character(),
      playerInk: Wardrobe.ink(),
      baseMsFor: avgMsOf,
      missRateFor: (id) => {
        const s = statFor(id);
        return s.seen ? 1 - s.correct / s.seen : null;
      },
    });
  } else {
    Rival.stop();
  }

  mountAvatars();
  placeCompanion();
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
    // In versus the clock ends a TURN, not the match.
    if (left <= 0) return isVersus() ? endVersusTurn() : endGame();
  }

  // Deliberately ahead of the `locked` guard: the rival keeps running while
  // you read why you got one wrong. That pause is the cost of the mistake.
  if (g.mode === 'race' && Rival.tick() === 'rival') return endGame();
  placeCompanion();

  if (g.locked || g.hintOpen) return;

  const limit = g.qdiff.seconds * 1000;
  const spent = Date.now() - g.questionStartedAt;
  const frac = Math.max(0, 1 - spent / limit);
  const fill = $('timer-fill');
  fill.style.width = `${frac * 100}%`;
  fill.className = frac < 0.25 ? 'low' : '';

  // The runner leans into it before the clock is out, not after — reaction
  // reads as decoration, anticipation reads as a companion.
  if (!g.strained && frac < 0.3) { g.strained = true; poseAll('strain'); }
  if (g.mode === 'race') avatars.forEach((a) => a.behind(Rival.gap() < -0.2));
  // Running out of time counts as a miss — hesitating is the thing being trained.
  if (spent >= limit) answer(null);
}

// A turn is over when the format says so; the match when nobody has one left.
function versusTurnOver() {
  switch (vsFormat()) {
    case 'timed': return Date.now() >= g.vs.turnEndsAt;
    case 'lives': return versusPlayer().lives <= 0;
    // Turns and Climb both hand the device over after every single question.
    default:      return g.vs.turnRounds >= 1;
  }
}

function versusMatchOver() {
  if (vsFormat() === 'turns') return g.vs.players.every((p) => p.answered >= g.vs.turnsEach);
  // Climb runs until nobody has a life left; whoever climbed furthest wins.
  if (vsFormat() === 'climb') return g.vs.players.every((p) => p.lives <= 0);
  return g.vs.turn === 1;
}

// The next seat is the other player — unless they're already out, in which
// case the survivor keeps climbing alone until their own lives run out.
function nextVersusSeat() {
  const other = g.vs.turn === 0 ? 1 : 0;
  if (vsFormat() !== 'climb') return other;
  if (g.vs.players[other].lives > 0) return other;
  return versusPlayer().lives > 0 ? g.vs.turn : other;
}

// A streak belongs to the player, not the seat — it survives the opponent's go.
function beginVersusTurn() {
  g.streak = versusPlayer().streak || 0;
  g.vs.turnStartedAt = Date.now();
  g.vs.turnEndsAt = Date.now() + VERSUS_SECONDS * 1000;
  if (vsFormat() === 'lives') versusPlayer().lives = VERSUS_LIVES;
  g.vs.turnRounds = 0;
  g.endsAt = vsFormat() === 'timed' ? g.vs.turnEndsAt : null;
  $('hud-clock').classList.toggle('hidden', !g.endsAt);
  $('hud-lives').classList.add('hidden');   // lives live in the progress slot here
}

function endVersusTurn() {
  if (versusMatchOver()) return endGame();
  const seat = nextVersusSeat();
  // Nobody to pass to — the survivor just carries on.
  if (seat === g.vs.turn) { g.vs.turnRounds = 0; return nextQuestion(); }
  showHandoff(seat);
}

function showHandoff(nextTurn) {
  const up = g.vs.players[nextTurn];
  const other = g.vs.players[nextTurn === 0 ? 1 : 0];
  const alternating = vsFormat() === 'turns';
  $('handoff-title').textContent = `${up.name}, you're up`;
  $('handoff-sub').innerHTML = alternating
    ? `${esc(up.name)} <b>${up.score.toLocaleString()}</b> · ${esc(other.name)} <b>${other.score.toLocaleString()}</b>`
      + `<br>Question ${Math.min(up.answered + 1, g.vs.turnsEach)} of ${g.vs.turnsEach}. Pass the device.`
    : `${esc(other.name)} scored <b>${other.score.toLocaleString()}</b> — ${other.correct}/${other.answered} correct.`
      + `<br>Beat it. Hand the device over.`;
  $('handoff').classList.remove('hidden');
  $('handoff-go').onclick = () => {
    $('handoff').classList.add('hidden');
    g.vs.turn = nextTurn;
    beginVersusTurn();
    nextQuestion();
  };
}

function endVersus() {
  const [a, b] = g.vs.players;
  const winner = a.score === b.score ? null : (a.score > b.score ? a : b);
  const fmt = VERSUS_FORMATS.find((f) => f.id === g.vs.format) || VERSUS_FORMATS[0];

  $('results-title').textContent = winner ? `🏆 ${winner.name} wins` : '🤝 Dead heat';
  $('results-score').innerHTML =
    `${a.score.toLocaleString()}<span> ${esc(a.name)} · ${esc(b.name)} ${b.score.toLocaleString()}</span>`;
  $('results-stats').innerHTML =
    `<div class="stat"><b>${a.correct}/${a.answered}</b><span>${esc(a.name)}</span></div>` +
    `<div class="stat"><b>${b.correct}/${b.answered}</b><span>${esc(b.name)}</span></div>` +
    `<div class="stat"><b>${Math.abs(a.score - b.score).toLocaleString()}</b><span>margin</span></div>` +
    (g.vs.format === 'climb'
      ? `<div class="stat"><b>${a.answered} · ${b.answered}</b><span>questions deep</span></div>`
      : `<div class="stat"><b>${fmt.label}</b><span>format</span></div>`);
  $('results-xp').innerHTML = '';
  $('results-missed').innerHTML =
    '<p class="versus-note">Versus doesn\'t touch your ratings, learned facts or stats — someone else was answering.</p>';

  showScreen('results');
  replay($('results-score'), 'pop');
  if (winner) Juice.celebrate($('results-score'));
  g = null;
}

function nextQuestion() {
  if (!g) return;
  if (isVersus() && versusTurnOver()) return endVersusTurn();
  if (g.dead || g.round >= g.rounds) return endGame();

  g.round += 1;
  g.locked = false;
  // Adaptive: the drawn topic brings its own level, and the level brings its
  // own pacing preset — fractions can play at level 1 in the same session
  // where multiplication plays at level 3.
  // Adaptive serves each topic at its own rating, with a small spread that
  // averages slightly ABOVE it — training just past the edge, chess-style.
  // Manual difficulties and Ladder serve at fixed t (old level − 1).
  const draw = () => {
    const topicId = drawTopic();
    const t = isVersus() ? versusT()
      : g.adaptive ? tOf(eloOf(topicId)) + (Math.random() * 0.5 - 0.2)
      : g.level - 1;
    return makeQuestion(topicId, t);
  };
  g.current = draw();
  // Learned facts mostly stop appearing: re-roll up to twice when the draw
  // lands on one. A third landing gets through — occasional defense reps.
  for (let reroll = 0; reroll < 2; reroll += 1) {
    const f = isFact(g.current) && store.facts[g.current.text];
    if (!f || !f.learned) break;
    g.current = draw();
  }
  if (g.adaptive || isVersus()) g.qdiff = pacingFor(g.current.t);
  if (isVersus() && vsFormat() === 'climb') {
    const tier = Math.floor(g.current.t - g.vs.baseT);
    if (tier !== g.vs.tier) {
      g.vs.tier = tier;
      Juice.toast(`📈 The numbers just grew`);
    }
  }
  g.questionStartedAt = Date.now();
  g.hinted = false;
  g.strained = false;
  poseAll('run');
  closeHint();

  const topic = TOPICS.find((t) => t.id === g.current.topic);
  $('topic-tag').textContent = g.mode === 'ladder' ? `${topic.label} · level ${g.level}`
    : g.adaptive ? `${topic.label} · ${Math.round(eloOf(g.current.topic))}`
    : topic.label;
  $('question').innerHTML = questionHtml(g.current.text);
  replay($('question'), 'enter');
  $('feedback').textContent = '';
  $('feedback').className = '';
  $('next-btn').classList.add('hidden');
  $('timer-fill').style.width = '100%';
  $('timer-fill').className = '';

  if (g.qdiff.choices) {
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
  const wrong = wrongAnswers(g.current, g.qdiff.choices - 1);
  const options = shuffle([g.current.answer, ...wrong]);
  options.forEach((value, i) => {
    const b = document.createElement('button');
    // The value lives in a data attribute, not the label: the label also carries
    // the keyboard-hint digit, so parsing it back would read "1" + "234".
    b.dataset.value = String(value);
    b.innerHTML = `<span class="key">${i + 1}</span>${value.toLocaleString()}`;
    // Staggered entrance so the options arrive in sequence rather than all at
    // once — reads as deliberate instead of a flash.
    b.style.animationDelay = `${i * 45}ms`;
    b.classList.add('enter');
    b.addEventListener('click', () => answer(value, b));
    el.appendChild(b);
  });
}

// Counts the displayed score up to its new value rather than snapping, so
// points feel earned. Eases out, and always lands exactly on the target.
function animateScore(from, to) {
  const el = $('hud-score');
  const start = performance.now();
  const dur = 420;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${Math.round(from + (to - from) * eased).toLocaleString()} pts`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// The "+120" that used to drift up from the answer now comes from Juice.good(),
// which fires the confetti, the haptic and the rising pitch in the same beat.

function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(cls);
}

function updateHud(scoreFrom = null) {
  if (isVersus()) {
    const [a, b] = g.vs.players;
    const f = vsFormat();
    $('hud-progress').textContent =
      f === 'lives' ? `${versusPlayer().name} · ${'❤'.repeat(Math.max(0, versusPlayer().lives))}`
      : f === 'climb' ? `${versusPlayer().name} · ${'❤'.repeat(Math.max(0, versusPlayer().lives))} · Q${versusPlayer().answered + 1}`
      : f === 'timed' ? versusPlayer().name
      : `${versusPlayer().name} · ${Math.min(versusPlayer().answered + 1, g.vs.turnsEach)}/${g.vs.turnsEach}`;
    $('hud-score').innerHTML =
      `<span class="${g.vs.turn === 0 ? 'vs-on' : ''}">${esc(a.name)} ${a.score.toLocaleString()}</span>`
      + `<span class="vs-sep"> · </span>`
      + `<span class="${g.vs.turn === 1 ? 'vs-on' : ''}">${esc(b.name)} ${b.score.toLocaleString()}</span>`;
    const streakEl = $('hud-streak');
    streakEl.textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
    return;
  }

  $('hud-progress').textContent = Number.isFinite(g.rounds)
    ? `Q ${Math.min(g.round, g.rounds)}/${g.rounds}`
    : `${g.answered} answered`;

  if (scoreFrom !== null && scoreFrom !== g.score) animateScore(scoreFrom, g.score);
  else $('hud-score').textContent = `${g.score.toLocaleString()} pts`;

  const streakEl = $('hud-streak');
  const wasStreak = streakEl.textContent;
  streakEl.textContent = g.streak >= 2 ? `🔥 ${g.streak}` : '';
  if (streakEl.textContent && streakEl.textContent !== wasStreak) {
    replay(streakEl, 'flare');
    Juice.streak(g.streak, streakEl);
  }

  if (g.lives !== null) $('hud-lives').textContent = '❤'.repeat(Math.max(0, g.lives));
}

// `given` is null when the clock ran out.
function answer(given, btn) {
  if (!g || g.locked) return;
  g.locked = true;

  const q = g.current;
  const elapsed = Date.now() - g.questionStartedAt;
  const right = given !== null && Number(given) === q.answer;
  const scoreBefore = g.score;

  recordAnswer(q, right, elapsed);

  if (right) {
    const pts = awardPoints(elapsed);
    if (btn) btn.classList.add('correct');
    Juice.good({ points: pts, anchor: btn || $('question'), streak: g.streak });
    flashAll('cheer', 900);
    replay($('question'), 'pop');
    showFeedback(true, `✓ +${pts} pts${g.hinted ? ' (method used)' : ''}`);
  } else {
    g.streak = 0;
    g.missed.push({ ...q, given });
    if (btn) btn.classList.add('wrong');
    if (g.lives !== null) g.lives -= 1;
    const lead = given === null ? "⏱ Time's up —" : '✗';
    Juice.bad();
    flashAll('stumble', 1100);
    replay($('question'), 'shake');
    showFeedback(false, `${lead} ${q.text} = <b>${q.answer.toLocaleString()}</b>. ${esc(q.why)}`);
  }

  // Show which one was right when they picked wrong.
  if (g.qdiff.choices && !right) {
    [...$('choices').children].forEach((b) => {
      if (Number(b.dataset.value) === q.answer) b.classList.add('correct');
    });
  }
  if (g.qdiff.choices) [...$('choices').children].forEach((b) => { b.disabled = true; });
  $('type-input').disabled = true;

  if (g.lives !== null && g.lives <= 0) g.dead = true;
  $('timer-fill').style.width = '0%';
  updateHud(scoreBefore);

  if (g.mode === 'race') {
    if (right) {
      // Let the winning stride land before the screen changes.
      if (Rival.advanceYou() === 'you') { setTimeout(() => endGame(), 700); return; }
    } else {
      Rival.missedLeg();
    }
  }

  // Blitz and Race keep moving on their own; every other mode waits so the
  // explanation can actually be read.
  if (isVersus()) setTimeout(nextQuestion, right ? 900 : 2000);
  else if (g.mode === 'blitz' || g.mode === 'race') setTimeout(nextQuestion, right ? 450 : 1400);
  else $('next-btn').classList.remove('hidden');
}

function recordAnswer(q, wasCorrect, elapsedMs) {
  g.answered += 1;

  // Versus: score the turn, then stop. Everything below this line is
  // measurement of Jason, and the person answering might not be him.
  if (isVersus()) {
    const p = versusPlayer();
    p.answered += 1;
    g.vs.turnRounds += 1;
    if (wasCorrect) {
      p.correct += 1;
      p.streak = (p.streak || 0) + 1;
    } else {
      p.streak = 0;
      if (vsFormat() === 'lives' || vsFormat() === 'climb') {
        p.lives -= 1;
        if (p.lives <= 0 && vsFormat() === 'climb' && window.Juice) {
          Juice.toast(`💀 ${p.name} is out — ${p.answered} questions deep`);
        }
      }
    }
    g.streak = p.streak;
    return;
  }

  store.answered += 1;

  const s = store.stats[q.topic] || (store.stats[q.topic] = { seen: 0, correct: 0, ms: 0 });
  s.seen += 1;
  s.ms += elapsedMs;

  if (isFact(q)) {
    const f = store.facts[q.text] || (store.facts[q.text] = { run: 0 });
    if (wasCorrect) {
      f.run = f.run > 0 ? f.run + 1 : 1;
      if (!f.learned && f.run >= LEARN_RUN) {
        f.learned = true;
        g.newlyLearned = (g.newlyLearned || 0) + 1;
        if (window.Juice) Juice.toast(`✓ ${q.text} learned — ${learnedFactCount()} facts`);
      }
    } else {
      f.run = f.run < 0 ? f.run - 1 : -1;
      if (f.learned && -f.run >= UNLEARN_RUN) {
        f.learned = false;
        g.newlyLost = (g.newlyLost || 0) + 1;
      }
    }
  }

  // The Elo match: this question carried a rating (from the size it was
  // generated at); win or lose, the topic's rating moves by the SURPRISE.
  // Beating a question you were expected to beat pays almost nothing; losing
  // one costs a lot. K shrinks once the rating has settled (30+ answers).
  if (q.t !== undefined) {
    const e = eloState(q.topic);
    const dq = dqOf(q.t);
    const expected = 1 / (1 + Math.pow(10, (dq - e.r) / 400));
    const K = e.n < 30 ? 32 : 16;
    const before = e.r;
    e.r = Math.round((e.r + K * ((wasCorrect ? 1 : 0) - expected)) * 10) / 10;
    e.n += 1;
    g.eloMoves = g.eloMoves || {};
    g.eloMoves[q.topic] = (g.eloMoves[q.topic] || 0) + (e.r - before);
    // Century crossings are the milestone moments.
    if (Math.floor(before / 100) !== Math.floor(e.r / 100) && window.Juice) {
      const label = TOPICS.find((t) => t.id === q.topic).label;
      Juice.toast(`${e.r > before ? '➚' : '➘'} ${label} rating ${Math.round(e.r)}`);
    }
  }

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
  const limit = g.qdiff.seconds * 1000;
  // A hinted question still counts as correct — the point is learning the
  // method — but it forfeits the speed bonus rather than being penalised.
  const speed = g.hinted ? 0 : Math.max(0, 1 - elapsedMs / limit);
  const base = 60 + Math.round(60 * speed);
  const streakBonus = 10 * Math.min(g.streak, 10);
  const ladderBonus = g.mode === 'ladder' ? 1 + (g.level - 1) * 0.3 : 1;
  const pts = Math.round((base + streakBonus) * g.qdiff.mult * ladderBonus);
  if (isVersus()) versusPlayer().score += pts;
  g.score += pts;
  return pts;
}

function showFeedback(good, html) {
  const el = $('feedback');
  el.innerHTML = html;
  el.className = good ? 'good' : 'bad';
}

// ---------------------------------------------------------------------------
// Methods — how to do it, never what the answer is
// ---------------------------------------------------------------------------

// Renders a technique card. Deliberately built from the METHODS data only and
// never from the live question, so opening a hint can't leak the answer.
function methodCardHTML(topicId) {
  const m = METHODS[topicId];
  if (!m) return '';
  const topic = TOPICS.find((t) => t.id === topicId);
  return `
    <h3 class="method-title"><b>${topic.icon}</b> ${esc(m.title)}</h3>
    <p class="method-idea">${esc(m.idea)}</p>
    <ol class="method-steps">${m.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="method-example">
      <div class="method-problem">${esc(m.example.problem)}</div>
      ${m.example.lines.map((l) => `<div class="method-line">${esc(l)}</div>`).join('')}
    </div>
    ${m.extras ? `<ul class="method-extras">${m.extras.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  `;
}

function openHint() {
  if (!g || !g.current) return;
  $('hint-body').innerHTML = methodCardHTML(g.current.topic);
  $('hint-sheet').classList.remove('hidden');
  // Reading the method shouldn't cost the question — hold the clock while it's
  // open, otherwise the hint is a trap rather than a help.
  if (!g.hintOpen) {
    g.hintOpen = true;
    g.hintOpenedAt = Date.now();
    g.hinted = true;
    if (g.mode === 'race') Rival.pause();
  }
}

function closeHint() {
  const sheet = $('hint-sheet');
  if (sheet) sheet.classList.add('hidden');
  if (g && g.hintOpen) {
    g.questionStartedAt += Date.now() - g.hintOpenedAt;
    g.hintOpen = false;
    if (g.mode === 'race') Rival.resume();
  }
}

function renderLearn(topicId = 'pow') {
  const el = $('learn-topics');
  el.innerHTML = '';
  TOPICS.forEach((t) => {
    const b = document.createElement('button');
    b.className = t.id === topicId ? 'active' : '';
    b.innerHTML = `<span class="opt-icon">${t.icon}</span>${t.label}`;
    b.addEventListener('click', () => renderLearn(t.id));
    el.appendChild(b);
  });
  const body = $('learn-body');
  body.innerHTML = methodCardHTML(topicId);
  body.classList.remove('fade-in');
  void body.offsetWidth; // restart the animation on every switch
  body.classList.add('fade-in');
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

// The scoreline in the terms the race was actually run in: legs, margin, and
// whether the rival handed it to you rather than you taking it.
function raceVerdictHTML(race, bonus) {
  const parts = [`${race.you}–${race.rivalLegs} on legs`];
  if (race.stumbles) {
    parts.push(`${race.stumbles} fumble${race.stumbles > 1 ? 's' : ''} from ${race.rival.name}`);
  }
  if (bonus) parts.push(`+${bonus.toLocaleString()} win bonus`);

  return `
    <div class="race-verdict ${race.won ? 'won' : 'lost'}">
      <span class="verdict-head">${race.rival.icon} ${race.won ? 'Beat' : 'Lost to'}
        ${esc(race.rival.name)} by ${Math.abs(race.margin).toFixed(1)}</span>
      <span class="verdict-sub">${esc(parts.join(' · '))}</span>
    </div>`;
}

function endGame(aborted = false) {
  clearInterval(ticker);
  ticker = null;

  // Read the race off before tearing the track down — the results screen is
  // the only place the margin ever gets stated.
  const race = g && g.mode === 'race' ? Rival.result() : null;
  Rival.stop();

  if (g && isVersus() && !aborted) return endVersus();

  if (aborted) {
    poseAll('idle');
    syncSession(true, 0);
    saveStore();
    showScreen('menu');
    renderMenu();
    g = null;
    return;
  }

  // A win pays out, and a comfortable win pays more than a scrape — but the
  // margin is capped, so thrashing a rival can't dwarf the round itself.
  const raceBonus = race && race.won
    ? Math.round((250 + 70 * clamp(race.margin, 0, 3)) * g.qdiff.mult)
    : 0;
  g.score += raceBonus;

  const levelBefore = levelForXp(store.xp);
  const xpGain = Math.round(g.score / 10);
  store.xp += xpGain;
  store.games += 1;

  // Bests are per rival — beating The Metronome and beating Kid Lightning are
  // not the same achievement, so they don't share a record.
  const bestKey = `${g.mode}|${g.topic}|${g.difficulty.id}${race ? `|${g.rivalId}` : ''}`;
  const isBest = g.score > 0 && g.score > (store.best[bestKey] || 0);
  if (isBest) store.best[bestKey] = g.score;
  saveStore();
  syncSession(false, xpGain);

  // Coins ride on XP so there's no second scoring system to reason about,
  // with a small bump for the things that took some doing.
  Wardrobe.earn(xpGain / 2 + (isBest ? 10 : 0) + (race && race.won ? 10 : 0));

  // Finishing a round is what earns a chest. What's in it is the roll.
  if (g.answered > 0) Wardrobe.awardChest('numbers');

  if (race && race.won) {
    if (g.rivalId === 'ghost') Wardrobe.grantFlag('numbers:beat-ghost');
    if (g.rivalId === 'metronome' && g.difficulty.id === 'hard') {
      Wardrobe.grantFlag('numbers:metronome-hard');
    }
  }

  const levelAfter = levelForXp(store.xp);
  const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
  const avgMs = g.log.length ? Math.round(g.log.reduce((sum, a) => sum + a.ms, 0) / g.log.length) : 0;

  $('results-title').textContent =
    race ? (race.won
      ? (race.photoFinish ? '🏁 Photo finish — you took it!' : '🏁 You won!')
      : `🏁 ${race.rival.name} took it`)
      : g.mode === 'blitz' ? "Time's up!"
      : g.dead ? `💀 Out of lives — ${g.correct} correct`
      : g.mode === 'ladder' ? `📈 Reached level ${g.level}`
      : 'Round complete';

  $('results-race').innerHTML = race ? raceVerdictHTML(race, raceBonus) : '';
  // The headline is the rating — the number that can go DOWN, which is what
  // makes it worth reading. Points are demoted to a footnote: they only exist
  // to feed XP and the wardrobe economy.
  const sessionNet = Object.values(g.eloMoves || {}).reduce((a, b) => a + b, 0);
  const rated = Object.values(store.elo).filter((e) => e && e.n > 0).map((e) => e.r);
  const avgAfter = rated.length ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length) : null;
  $('results-score').innerHTML = avgAfter !== null
    ? `${avgAfter}<span> elo · ${sessionNet >= 0 ? '+' : '−'}${Math.abs(Math.round(sessionNet))} this session</span>`
    : `${g.score.toLocaleString()}<span> pts</span>`;
  $('results-stats').innerHTML =
    tile('🎯', `${g.correct}/${g.answered}`, 'correct') +
    tile('📊', `${acc}%`, 'accuracy') +
    tile('⏱', `${(avgMs / 1000).toFixed(1)}s`, 'avg time') +
    tile('🔥', g.bestStreak, 'best streak') +
    (g.newlyLearned ? tile('🧠', `+${g.newlyLearned}`, 'facts learned') : '') +
    (g.newlyLost ? tile('🩹', `−${g.newlyLost}`, 'slipped') : '') +
    // The session's biggest single-topic move, then the points footnote.
    (() => {
      const moves = Object.entries(g.eloMoves || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      if (!moves.length || Math.abs(moves[0][1]) < 1) return '';
      const [topicId, d] = moves[0];
      const label = TOPICS.find((t) => t.id === topicId).label;
      // The mark carries the direction, so a drop is legible before the sign.
      return tile(d > 0 ? '📈' : '📉',
        `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}`,
        `${label} → ${Math.round(eloOf(topicId))}`);
    })() +
    tile(isBest ? '🏆' : '🎲', g.score.toLocaleString(), `pts${isBest ? ' · new best!' : ''}`);

  $('results-xp').innerHTML = levelAfter > levelBefore
    ? `+${xpGain} XP — <b>level ${levelAfter}!</b>`
    : `+${xpGain} XP`;

  $('results-missed').innerHTML = g.missed.length
    ? '<h3>Worth a second look</h3>' + g.missed.slice(0, 6).map((m) =>
      `<div class="missed-row"><code>${esc(m.text)} = ${m.answer.toLocaleString()}</code><span>${esc(m.why)}</span></div>`).join('')
    : '<p class="clean-sweep">Clean sweep — nothing missed.</p>';

  avatars.forEach((a) => a.behind(false));
  if (race && race.won) flashAll('cheer', 3200); else poseAll('idle');

  // The chest waits on the results screen rather than interrupting the score.
  const chests = Wardrobe.pending();
  $('results-chest').classList.toggle('hidden', !chests);
  $('results-chest').textContent = chests > 1 ? `Open ${chests} chests` : 'Open your chest';

  showScreen('results');
  // Count the final score up from zero — the one moment in the game where a
  // flourish is clearly earned.
  const scoreEl = $('results-score');
  const finalHTML = scoreEl.innerHTML;
  const target = g.score;
  const started = performance.now();
  const countUp = (now) => {
    const t = Math.min(1, (now - started) / 900);
    const eased = 1 - Math.pow(1 - t, 3);
    if (t < 1) {
      scoreEl.innerHTML = `${Math.round(target * eased).toLocaleString()}<span> pts</span>`;
      requestAnimationFrame(countUp);
    } else {
      scoreEl.innerHTML = finalHTML;
      replay(scoreEl, 'pop');
      // The payoff lands on the number, not on the screen change: confetti for
      // a clean round or a new best, and the level-up takes the whole screen.
      if (isBest || acc >= 80 || (race && race.won)) Juice.celebrate(scoreEl);
      if (levelAfter > levelBefore) setTimeout(() => Juice.levelUp(levelAfter), 450);
    }
  };
  requestAnimationFrame(countUp);

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
      <span class="topic-name"><b>${t.icon}</b> ${t.label} <em class="topic-lv">${Math.round(eloOf(t.id))}</em></span>
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
$('results-chest').addEventListener('click', () => {
  Wardrobe.openChestUI(() => {
    $('results-chest').classList.add('hidden');
    renderMenu();
  });
});
$('stats-btn').addEventListener('click', () => { renderStats(); showScreen('stats'); });
$('stats-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('learn-btn').addEventListener('click', () => { renderLearn(); showScreen('learn'); });
$('learn-back').addEventListener('click', () => { showScreen('menu'); renderMenu(); });
$('hint-btn').addEventListener('click', openHint);
$('hint-close').addEventListener('click', closeHint);
$('hint-sheet').addEventListener('click', (e) => { if (e.target === $('hint-sheet')) closeHint(); });

$('type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('type-input').value.trim();
  if (raw === '' || !g || g.locked) return;
  answer(Number(raw.replace(/[^\d-]/g, '')));
});

document.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (e.key === 'Escape' && g && g.hintOpen) { closeHint(); return; }
  if (e.key === '?' || e.key === 'h') { openHint(); return; }
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

Wardrobe.attach('numbers');
renderMenu();
Sync.mountUI();

// Quick play (hub / next-game links carry ?play=1): arriving means START —
// straight into a session with the defaults, no menu stop.
if (new URLSearchParams(location.search).has('play')) startGame();
