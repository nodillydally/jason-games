/* lib/next.js — the "next best game" picker, shared by the hub and every game.
 *
 * One answer to one question: if Jason wants to play something right now,
 * which game moves him forward most? The pick is the ROTATION game with the
 * lowest XP (all games share one XP curve, so lowest XP = least developed
 * skill), preferring games not yet played today. Briefing is excluded — it's
 * the standing daily duty, not a rotation game.
 *
 * On a game page it mounts two things automatically:
 *   - a small fixed "next game" chip (bottom-right), for switching it up
 *     mid-anything without hunting for the hub
 *   - a "Next: <game>" button inside the results screen's actions, so
 *     finishing a session always offers the next move
 *
 * On the hub it mounts nothing — hub.js calls NextGame.pick() itself.
 */

const NextGame = (() => {
  // Rotation games only. Store keys must match each game's localStorage.
  const GAMES = {
    mapmaster: { name: 'Mapmaster', icon: '🌍', store: 'mapmaster-v1' },
    numbers: { name: 'Numbers', icon: '🔢', store: 'numbers.profile.v1' },
    reader: { name: 'Reader', icon: '📖', store: 'reader.profile.v1' },
    chronicle: { name: 'Chronicle', icon: '🏛️', store: 'chronicle.profile.v1' },
  };

  // Root of the site, derived from this script's own URL so the same file
  // works from the hub (lib/next.js) and from any game (../../lib/next.js).
  const BASE = (() => {
    const src = document.currentScript && document.currentScript.src;
    return src ? src.replace(/lib\/next\.js.*$/, '') : '../../';
  })();

  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  };

  const xpOf = (key) => {
    const s = read(GAMES[key].store);
    return s && Number(s.xp) ? Number(s.xp) : 0;
  };

  const playedToday = () => {
    const log = read('games.playlog.v2') || {};
    return log[new Date().toISOString().slice(0, 10)] || [];
  };

  // The game currently on screen (from the URL), so it never suggests itself.
  const currentKey = () => {
    const m = location.pathname.match(/games\/([^/]+)\//);
    return m ? m[1] : null;
  };

  function pick(exclude = currentKey()) {
    const done = playedToday();
    const ranked = Object.keys(GAMES)
      .filter((k) => k !== exclude)
      .sort((a, b) =>
        (done.includes(a) - done.includes(b))   // not-yet-played first
        || (xpOf(a) - xpOf(b)));                // then lowest XP — weakest skill
    const key = ranked[0];
    if (!key) return null;
    const href = `${BASE}games/${key}/`;
    // playHref auto-starts a session on arrival — quick play means playing,
    // not landing on a menu.
    return { key, ...GAMES[key], href, playHref: `${href}?play=1`, xp: xpOf(key) };
  }

  /* ------------------------- auto-mount on games ------------------------- */

  function mount() {
    if (!currentKey()) return;   // hub renders its own quick-play
    const next = pick();
    if (!next) return;

    const style = document.createElement('style');
    style.textContent = `
      #next-game-chip {
        /* Positioned by the shared .fx-dock row in lib/theme.css, not by this
           chip — it used to pin itself to the same corner as the toggles. */
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 13px;
        border: 1px solid var(--rule, #ccc);
        border-radius: 99px;
        background: var(--card, var(--paper, #fff));
        color: var(--ink-soft, inherit);
        font-family: var(--mono, monospace);
        font-size: 11px;
        letter-spacing: .06em;
        text-decoration: none;
        opacity: .75;
        transition: opacity .15s, transform .15s;
      }
      #next-game-chip:hover { opacity: 1; transform: translateY(-1px); }
      #next-game-chip b { font-weight: 600; }
      .next-game-btn { white-space: nowrap; }
      @media (max-width: 560px) { #next-game-chip { font-size: 10.5px; padding: 7px 11px; } }
    `;
    document.head.appendChild(style);

    const chip = document.createElement('a');
    chip.id = 'next-game-chip';
    chip.href = next.playHref;
    chip.title = `Lowest level of your games — the one to grow`;
    chip.innerHTML = `↷ next <b>${next.icon} ${next.name}</b>`;
    (window.Theme && window.Theme.dock ? window.Theme.dock() : document.body).appendChild(chip);

    // A proper button on every results screen: finishing always offers the
    // next move. Injected once; the href is refreshed each click-through.
    document.querySelectorAll('.results-actions').forEach((actions) => {
      const a = document.createElement('a');
      a.className = 'next-game-btn';
      a.href = next.playHref;
      a.innerHTML = `${next.icon} Next: ${next.name}`;
      // Match the sibling buttons' look without knowing each game's skin:
      // borrow the menu button's classes when it has any, otherwise paint a
      // plain themed button by hand.
      const menuBtn = actions.querySelector('#menu-btn');
      a.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;color:inherit;';
      if (menuBtn && menuBtn.className) {
        a.className += ` ${menuBtn.className}`;
      } else {
        a.style.cssText += 'padding:12px 18px;border:1px solid var(--rule,#ccc);border-radius:10px;background:var(--paper,transparent);font:inherit;';
      }
      actions.appendChild(a);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  return { pick, GAMES };
})();

// A top-level const is NOT a window property, and hub.js feature-detects via
// window.NextGame — without this line the hub's quick-play button stays dead.
window.NextGame = NextGame;
