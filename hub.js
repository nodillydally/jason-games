/* hub.js — the daily recommender.
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
 * recommendation: no reading baseline yet → the audit comes first; a weakest
 * continent in Mapmaster → name it.
 */

(function () {
  const GAMES = {
    mapmaster: { name: 'Mapmaster', href: 'games/mapmaster/', icon: '🌍' },
    numbers: { name: 'Numbers', href: 'games/numbers/', icon: '🔢' },
    reader: { name: 'Reader', href: 'games/reader/', icon: '📖' },
    // chronicle: { name: 'Chronicle', href: 'games/chronicle/', icon: '🏛️' },  // history — next build
    // elements:  { name: 'Elements',  href: 'games/elements/',  icon: '🧪' },  // science
    // briefing:  { name: 'Briefing',  href: 'games/briefing/',  icon: '📰' },  // news + expression
  };

  // Mon..Sun. Each slot: candidate games in priority order + a mode hint.
  // Priorities point at unbuilt games on purpose — the day a game ships and
  // is uncommented in GAMES, the rotation adopts it.
  const ROTATION = [
    { games: ['numbers'], mode: 'Ladder', why: 'Start the week where the ceiling is — climb until it breaks.' },
    { games: ['chronicle', 'reader'], mode: 'Flash read', why: 'Speed with comprehension held — train just above baseline.' },
    { games: ['mapmaster'], mode: 'Review', why: 'Spaced repetition day — clear the trouble spots.' },
    { games: ['elements', 'numbers'], mode: 'Blitz', why: 'Volume day — as many as the clock allows.' },
    { games: ['reader'], mode: 'Book passages', why: 'Friday is books — one signature passage, kept for good.' },
    { games: ['chronicle', 'mapmaster'], mode: 'Find it', why: 'The reverse drill — recall is stronger than recognition.' },
    { games: ['briefing', 'reader'], mode: 'Timed read', why: 'Whole-page reading under a clock — closest to real reading.' },
  ];

  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  };

  function todaysPick() {
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Monday = 0

    // The audit outranks the rotation: no baseline means we don't yet know
    // your natural reading speed, and every Reader mode trains against it.
    const reader = read('reader.profile.v1');
    if (!reader || !reader.baselineWpm) {
      return { game: GAMES.reader, mode: 'Baseline', why: 'The audit comes first — one passage at your natural pace sets the number everything else trains against.' };
    }

    // First Sunday of the month: re-baseline. The trend is the score.
    if (dayIdx === 6 && now.getDate() <= 7) {
      return { game: GAMES.reader, mode: 'Baseline', why: 'First Sunday — monthly re-baseline. The trend over months is the real score.' };
    }

    const slot = ROTATION[dayIdx];
    const gameKey = slot.games.find((g) => GAMES[g]) || 'reader';
    const pick = { game: GAMES[gameKey], mode: slot.mode, why: slot.why };

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
    if (gameKey === 'reader' && slot.mode === 'Flash read' && reader.baselineWpm) {
      pick.why = `Train just above your natural pace — baseline is ${reader.baselineWpm} wpm, so set the slider ~${reader.baselineWpm + 50}.`;
    }
    return pick;
  }

  function render() {
    const host = document.getElementById('today');
    if (!host) return;
    const pick = todaysPick();
    const dayIdx = (new Date().getDay() + 6) % 7;
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const strip = ROTATION.map((slot, i) => {
      const g = GAMES[slot.games.find((k) => GAMES[k]) || 'reader'];
      return `<span class="day${i === dayIdx ? ' now' : ''}" title="${g.name} — ${slot.mode}">${dayNames[i]} ${g.icon}</span>`;
    }).join('');

    host.innerHTML = `
      <div class="today-label">Today's session</div>
      <div class="today-row">
        <div class="today-icon">${pick.game.icon}</div>
        <div class="today-body">
          <div class="today-pick">${pick.game.name} · ${pick.mode}</div>
          <div class="today-why">${pick.why}</div>
        </div>
        <a class="today-play" href="${pick.game.href}">Play</a>
      </div>
      <div class="week-strip">${strip}</div>`;
  }

  render();
})();
