/* lib/roster.js — the other people playing.
 *
 * Every table in this project is private to its player, which is the right
 * default and makes a leaderboard impossible by accident. So there is exactly
 * one deliberate opening: player_cards, holding what someone chooses to show —
 * their name, their character, their ratings. Nothing about what they answered,
 * how long they took, or which questions beat them.
 *
 * Two halves, and they are trusted differently:
 *
 *   publish()  writes YOUR card. Cosmetic and self-reported: the sprite you
 *              wear and the Elo lib/elo.js computed on this device. A player
 *              could inflate it. That is an accepted trade — the ratings live
 *              inside each game's profile blob, and re-deriving them in SQL
 *              would mean two implementations of the same formula drifting
 *              apart, which is a worse bug than a friend fibbing about chess.
 *
 *   fetch()    calls the leaderboard() function, whose COUNTS come from the
 *              server's own game_sessions rows. Sessions, answers, accuracy and
 *              XP are what actually synced. Those are the numbers worth ranking
 *              on, and they are the ones nobody can type.
 *
 * Signed out, both are no-ops: the games stay playable, the people stay hidden.
 */

window.Roster = (function () {
  'use strict';

  // Same project the account card signs into. Publishable by design — RLS is
  // what decides who may read what, and the roster policy is the only one that
  // lets a player see a row that is not theirs.
  const PROJECT_URL = 'https://nurofafxsbgndpnmmqds.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_C0WJdU4ni88p-yojRgW0rw_uNxrY064';

  // A card is worth rewriting only when something on it changed. Without this
  // every page load would write a row, which is a lot of noise for a number
  // that moves once a session.
  const LAST_KEY = 'games.roster.last.v1';

  const headers = () => ({
    apikey: PUBLISHABLE_KEY,
    authorization: `Bearer ${Auth.token()}`,
    'content-type': 'application/json',
  });

  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  };

  /* Builds the card from what the other libraries already know. Nothing is
     computed here that isn't already on screen somewhere else. */
  function build() {
    const board = window.EloBoard ? EloBoard.board() : { domains: [], overall: null };
    const streak = read('games.streak.v1') || {};
    const wardrobe = window.Wardrobe ? Wardrobe.card() : null;

    // Per-game level, the same number each game's menu shows.
    const levels = {};
    [['numbers', 'numbers.profile.v1'], ['mapmaster', 'mapmaster-v1'],
     ['chronicle', 'chronicle.profile.v1'], ['reader', 'reader.profile.v1'],
     ['briefing', 'briefing.profile.v1']].forEach(([game, key]) => {
      const p = read(key);
      if (p && typeof p.xp === 'number') levels[game] = 1 + Math.floor(Math.sqrt(p.xp / 100));
    });

    return {
      wardrobe,
      overall: board.overall,
      domains: board.domains
        .filter((d) => d.rating !== null)
        .map((d) => ({ key: d.key, label: d.label, icon: d.icon, rating: Math.round(d.rating), detail: d.detail || '' })),
      levels,
      streak: streak.streak || 0,
      bestStreak: streak.best || 0,
    };
  }

  const api = {
    /* Upsert this player's card. Quiet on failure — a roster that can't be
       written is not a reason for a game to complain at anybody. */
    async publish(opts = {}) {
      if (!window.Auth || !Auth.isSignedIn()) return false;
      const card = build();
      const fingerprint = JSON.stringify(card);
      if (!opts.force && fingerprint === localStorage.getItem(LAST_KEY)) return false;

      const user = Auth.user();
      try {
        const res = await fetch(`${PROJECT_URL}/rest/v1/player_cards`, {
          method: 'POST',
          headers: { ...headers(), prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            player_id: user.id,
            display_name: user.name,
            card,
            updated_at: new Date().toISOString(),
          }),
        });
        if (!res.ok) return false;
        localStorage.setItem(LAST_KEY, fingerprint);
        return true;
      } catch {
        return false;   // offline; the next session end tries again
      }
    },

    /* Every player, with server-side counts. Sorted by the caller. */
    async fetch() {
      if (!window.Auth || !Auth.isSignedIn()) return [];
      const res = await fetch(`${PROJECT_URL}/rest/v1/rpc/leaderboard`, {
        method: 'POST',
        headers: headers(),
        body: '{}',
      });
      if (!res.ok) throw new Error(`Roster unavailable (${res.status})`);
      const rows = await res.json();
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: r.player_id,
        name: r.display_name || 'Player',
        card: r.card || {},
        sessions: Number(r.sessions) || 0,
        answered: Number(r.answered) || 0,
        correct: Number(r.correct) || 0,
        xp: Number(r.xp) || 0,
        accuracy: r.accuracy_pct === null ? null : Number(r.accuracy_pct),
        lastPlayed: r.last_played,
      }));
    },
  };

  // A card is only interesting once something has changed, and the moments that
  // change it are the moments a session ends or gear gets equipped — exactly
  // when roam.js already pushes. Ride along rather than inventing a schedule.
  if (window.Sync && typeof Sync.record === 'function') {
    const original = Sync.record.bind(Sync);
    Sync.record = (payload) => {
      original(payload);
      api.publish();
    };
  }
  window.addEventListener('pagehide', () => { api.publish(); });

  return api;
})();
