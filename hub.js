/* hub.js — the daily recommender, plus the progress the hub itself owns.
 *
 * The games only compound if they're played on a schedule that covers every
 * domain, so the hub decides what today's session is instead of leaving it to
 * whim. The rotation encodes the Intellect Plan's weights (reading 3×/week —
 * the lifetime-books goal — math 2×, geography 2×) and re-cuts automatically
 * as new games ship: each ROTATION entry lists games in priority order, and
 * the first one that exists in GAMES wins. So when Chronicle (history) ships,
 * it takes its slots without this file needing a redesign.
 *
 * It also reads the games' own localStorage (same origin) to sharpen the
 * recommendation — no reading baseline yet → the audit comes first — and to
 * surface the two numbers that make opening this page feel like progress: a
 * combined level across every game, and a day streak that only moves if a
 * session actually gets started.
 */

(function () {
  const GAMES = {
    mapmaster: { name: 'Mapmaster', href: 'games/mapmaster/', icon: '🌍', store: 'mapmaster-v1' },
    numbers: { name: 'Numbers', href: 'games/numbers/', icon: '🔢', store: 'numbers.profile.v1' },
    reader: { name: 'Reader', href: 'games/reader/', icon: '📖', store: 'reader.profile.v1' },
    chronicle: { name: 'Chronicle', href: 'games/chronicle/', icon: '🏛️', store: 'chronicle.profile.v1' },
    // elements:  { name: 'Elements',  href: 'games/elements/',  icon: '🧪' },  // science
    briefing: { name: 'Briefing', href: 'games/briefing/', icon: '📰', store: 'briefing.profile.v1' },
  };

  // Mon..Sun. Each slot lists candidates in priority order, each carrying its
  // own mode — the first candidate whose game exists in GAMES wins. Slots
  // point at unbuilt games on purpose: the day one ships and is uncommented,
  // it takes its slots without this table needing a redesign.
  const ROTATION = [
    [{ g: 'numbers', mode: 'Ladder', why: 'Start the week where the ceiling is — climb until it breaks.' }],
    [{ g: 'chronicle', mode: 'Classic', why: 'History day — place the eras, learn the whys.' },
     { g: 'reader', mode: 'Flash read', why: 'Speed with comprehension held — train just above baseline.' }],
    [{ g: 'mapmaster', mode: 'Review', why: 'Spaced repetition day — clear the trouble spots.' }],
    [{ g: 'elements', mode: 'Decks', why: 'Science day — spaced repetition on the fundamentals.' },
     { g: 'numbers', mode: 'Blitz', why: 'Volume day — as many as the clock allows.' }],
    [{ g: 'reader', mode: 'Book passages', why: 'Friday is books — one signature passage, kept for good.' }],
    [{ g: 'chronicle', mode: 'Sequence', why: 'Order four events — the drill that builds the actual timeline.' },
     { g: 'mapmaster', mode: 'Find it', why: 'The reverse drill — recall is stronger than recognition.' }],
    [{ g: 'reader', mode: 'Timed read', why: 'Whole-page reading under a clock — closest to real reading.' }],
  ];
  // Briefing isn't in the rotation — it's the standing daily duty alongside
  // whatever game the rotation picks.

  const STREAK_KEY = 'games.streak.v1';

  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  };
  const write = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ }
  };

  // Same XP curve the games use, so the combined level means the same thing.
  const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(xp / 100));
  const xpAtLevel = (lv) => 100 * (lv - 1) * (lv - 1);

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const dayKeyOffset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  /* --------------------------- today's pick --------------------------- */

  function todaysPick() {
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Monday = 0

    // The audit outranks the rotation: no baseline means we don't yet know
    // your natural reading speed, and every Reader mode trains against it.
    const reader = read('reader.profile.v1');
    if (!reader || !reader.baselineWpm) {
      return { key: 'reader', game: GAMES.reader, mode: 'Baseline', why: 'The audit comes first — one passage at your natural pace sets the number everything else trains against.' };
    }

    // First Sunday of the month: re-baseline. The trend is the score.
    if (dayIdx === 6 && now.getDate() <= 7) {
      return { key: 'reader', game: GAMES.reader, mode: 'Baseline', why: 'First Sunday — monthly re-baseline. The trend over months is the real score.' };
    }

    const cand = ROTATION[dayIdx].find((c) => GAMES[c.g]) || { g: 'reader', mode: 'Flash read', why: 'Speed with comprehension held.' };
    const gameKey = cand.g;
    const pick = { key: gameKey, game: GAMES[gameKey], mode: cand.mode, why: cand.why };

    // Sharpen with what the games already know about you.
    if (gameKey === 'mapmaster') {
      const mm = read('mapmaster-v1');
      if (mm && mm.stats) {
        let worst = null;
        for (const [id, s] of Object.entries(mm.stats)) {
          if (!s.seen) continue;
          const acc = s.correct / s.seen;
          if (!worst || acc < worst.acc) worst = { id, acc };
        }
        if (worst && worst.acc < 0.85) pick.why = 'Spaced repetition day — Review mode drills what you keep missing until it sticks.';
      }
    }
    if (gameKey === 'reader' && cand.mode === 'Flash read' && reader.baselineWpm) {
      pick.why = `Train just above your natural pace — baseline is ${reader.baselineWpm} wpm, so set the slider ~${reader.baselineWpm + 50}.`;
    }
    return pick;
  }

  // Written by lib/sync.js when a game records a finished (non-aborted)
  // session — launching a game does NOT check it off; logging a session does.
  // Keyed by UTC ISO date, matching what sync.js writes.
  const PLAYLOG_KEY = 'games.playlog.v2';
  const playedToday = () => (read(PLAYLOG_KEY) || {})[new Date().toISOString().slice(0, 10)] || [];

  // The Brief's own definition of "kept": every story graded. Read straight
  // from Briefing's store (it keys days by UTC date, so match that).
  function briefDoneToday() {
    const b = read('briefing.profile.v1');
    return Boolean(b && b.doneDates && b.doneDates[new Date().toISOString().slice(0, 10)]);
  }

  // Mon..Sun of the current week as ISO dates, so the strip can look each day
  // up in the playlog. UTC to match what sync.js writes.
  function weekDates() {
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Monday = 0
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - dayIdx + i);
      return d.toISOString().slice(0, 10);
    });
  }

  // A day is complete on the same terms the duty list uses: the Brief kept and
  // the rotation's game played. Anything less is a day in progress.
  // The playlog only keeps 14 days, so older weeks quietly stop showing fire.
  function completedDays() {
    const log = read(PLAYLOG_KEY) || {};
    const brief = read('briefing.profile.v1');
    const kept = (brief && brief.doneDates) || {};
    const done = new Set();
    for (const iso of weekDates()) {
      const played = log[iso] || [];
      if (kept[iso] && played.some((k) => k !== 'briefing')) done.add(iso);
    }
    return done;
  }

  function renderToday() {
    const host = document.getElementById('today');
    if (!host) return;
    const pick = todaysPick();
    const dayIdx = (new Date().getDay() + 6) % 7;
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // A finished day trades its game icon for a flame — the row then reads as
    // the week's actual record rather than as a fixed timetable.
    const dates = weekDates();
    const done = completedDays();
    const strip = ROTATION.map((slot, i) => {
      const c = slot.find((x) => GAMES[x.g]) || { g: 'reader', mode: 'Flash read' };
      const g = GAMES[c.g];
      const lit = done.has(dates[i]);
      const cls = `day${i === dayIdx ? ' now' : ''}${lit ? ' done' : ''}`;
      const title = lit ? `${dayNames[i]} — day complete` : `${g.name} — ${c.mode}`;
      return `<span class="${cls}" title="${title}">${dayNames[i]}<em>${lit ? '🔥' : g.icon}</em></span>`;
    }).join('');

    // Two things, every day: the Brief, and the rotation's game.
    const briefDone = briefDoneToday();
    const briefStarted = playedToday().includes('briefing');
    const gameDone = playedToday().some((k) => k !== 'briefing');
    const bothDone = briefDone && gameDone;

    const duty = (key, game, title, sub, done, doneLabel) => `
      <a class="duty${done ? ' done' : ''}" href="${game.href}" data-key="${key}">
        <span class="check">${done ? '✓' : ''}</span>
        <span class="d-icon">${game.icon}</span>
        <span class="d-body"><b>${title}</b><small>${sub}</small></span>
        <span class="d-go">${done ? doneLabel : 'Play →'}</span>
      </a>`;

    host.innerHTML = `
      <div class="today-label">${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayIdx]}${bothDone ? ' — day complete' : ''}</div>
      ${duty('briefing', GAMES.briefing, 'The Brief',
        briefDone ? 'Kept — every story graded.' : briefStarted ? 'Started — some stories still ungraded.' : 'Recall yesterday · keep today · graded.',
        briefDone, 'Kept ✓')}
      ${duty(pick.key, pick.game, `${pick.game.name} · ${pick.mode}`, pick.why, gameDone, 'Played ✓')}
      <div class="week-strip">${strip}</div>`;
  }

  /* ------------------------- combined progress ------------------------- */

  function renderRank() {
    let totalXp = 0;
    for (const [key, g] of Object.entries(GAMES)) {
      const s = read(g.store);
      const xp = s && Number(s.xp) ? Number(s.xp) : 0;
      totalXp += xp;

      // Stamp each card with the level it's actually at.
      const card = document.querySelector(`.game[data-game="${key}"] h2`);
      if (card && xp > 0) {
        const lv = document.createElement('span');
        lv.className = 'lv';
        lv.textContent = `Lv ${levelForXp(xp)}`;
        card.appendChild(lv);
      }
    }

    const level = levelForXp(totalXp);
    const floor = xpAtLevel(level);
    const ceil = xpAtLevel(level + 1);
    const pct = ceil > floor ? Math.round(((totalXp - floor) / (ceil - floor)) * 100) : 0;

    const lvEl = document.getElementById('rank-level');
    const fill = document.getElementById('xp-fill');
    const label = document.getElementById('rank-label');
    if (lvEl) lvEl.textContent = level;
    if (label) {
      label.textContent = totalXp
        ? `${totalXp.toLocaleString()} XP total · ${(ceil - totalXp).toLocaleString()} to level ${level + 1}`
        : 'No XP yet — play a round and this fills up.';
    }
    // Paint on the next frame so the bar visibly grows rather than appearing full.
    if (fill) requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  }

  /* ----------------------------- day streak ----------------------------- */
  /* Counts days a session was *started* from this hub. Opening the page isn't
     enough — the click on a game is what moves it, so the number stays honest. */

  function loadStreak() {
    const s = read(STREAK_KEY);
    if (!s || !s.last) return { last: null, streak: 0, best: 0 };
    // A gap of more than one day means the run is over.
    if (s.last !== todayKey() && s.last !== dayKeyOffset(1)) {
      return { ...s, streak: 0 };
    }
    return s;
  }

  function renderStreak() {
    const s = loadStreak();
    const chip = document.getElementById('streak');
    const n = document.getElementById('streak-n');
    if (!chip || !n) return;
    n.textContent = s.streak;
    chip.classList.toggle('cold', s.streak < 1);
    chip.title = s.streak
      ? `${s.streak}-day streak${s.best ? ` · best ${s.best}` : ''}`
      : 'Start a session to light this up';
  }

  function bumpStreak() {
    const s = loadStreak();
    if (s.last === todayKey()) return s;          // already counted today
    const next = {
      last: todayKey(),
      streak: s.streak + 1,
      best: Math.max(s.best || 0, s.streak + 1),
    };
    write(STREAK_KEY, next);
    return next;
  }

  /* -------------------------------- wire -------------------------------- */

  renderToday();
  renderRank();
  renderStreak();

  // Back-navigating from a game often restores the hub from the bfcache, so
  // re-read the duties — a session logged in the game must show immediately.
  window.addEventListener('pageshow', (e) => { if (e.persisted) renderToday(); });

  // Launching a game is the thing that counts. Delay the navigation just long
  // enough for the streak to light up — the payoff has to be visible.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a.game:not(.soon), a.duty, a.today-play');
    if (!link) return;
    const before = loadStreak().streak;
    const after = bumpStreak().streak;
    if (after === before) return;                 // already played today

    e.preventDefault();
    renderStreak();
    if (window.Juice) {
      const chip = document.getElementById('streak');
      Juice.streak(after, chip);
      Juice.spawn(
        chip.getBoundingClientRect().left + chip.offsetWidth / 2,
        chip.getBoundingClientRect().top + chip.offsetHeight / 2,
        36, { spread: Math.PI * 2, speed: 9, colors: ['#ffc53d', '#ff6b9d', '#ffffff'] }
      );
      Juice.chord([523, 784, 1046], { dur: .2, type: 'triangle', gain: .05, stagger: .06 });
    }
    setTimeout(() => { window.location.href = link.href; }, 480);
  });
})();
