/* lib/roam.js — profile roaming: play on any device, be the same person.
 *
 * The sync layer (lib/sync.js) ships session RESULTS to Atlas; this ships the
 * PROFILES — character, wardrobe, XP, learned items, baselines, streaks — so
 * pairing a new device brings everything across instead of starting fresh.
 *
 * Model: last-write-wins per key, one person playing one device at a time.
 *   - On load: pull. Any key whose server timestamp this device hasn't seen
 *     is adopted into localStorage; if anything changed, the page reloads
 *     once so the games boot from the fresh state.
 *   - On session end (Sync.record) and on page hide: push everything local.
 *   - First run against an empty server seeds it from this device.
 *
 * Needs Sync (for the token/endpoint) and does nothing while sync is off.
 */

(function () {
  'use strict';

  const KEYS = [
    'mapmaster-v1',
    'numbers.profile.v1',
    'reader.profile.v1',
    'chronicle.profile.v1',
    'briefing.profile.v1',
    'games.wardrobe.v1',
    'games.streak.v1',
    'games.playlog.v2',
    'chronicle.study.v1',
    'briefing.day.v1',
    'briefing.dump.v1',
  ];
  const META_KEY = 'games.roam.meta.v1';   // key -> server updated_at last seen
  const RELOAD_FLAG = 'games.roam.reloaded';

  const endpoint = () => Sync.contentEndpoint().replace(/game-content(?=[^/]*$)/, 'game-profile');

  const meta = (() => {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; }
  })();
  const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(meta));

  const localData = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch { return undefined; }
  };

  let pushing = false;

  async function push(opts = {}) {
    if (!Sync.isEnabled() || pushing) return;
    const profiles = KEYS
      .map((key) => ({ key, data: localData(key) }))
      .filter((p) => p.data !== undefined);
    if (!profiles.length) return;
    pushing = true;
    try {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { authorization: `Bearer ${Sync.token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ profiles }),
        keepalive: Boolean(opts.keepalive),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.updated) {
        Object.assign(meta, body.updated);
        saveMeta();
      }
    } catch { /* offline — results queue separately, profiles catch up later */ }
    pushing = false;
  }

  async function pull() {
    if (!Sync.isEnabled()) return;
    try {
      const res = await fetch(endpoint(), {
        headers: { authorization: `Bearer ${Sync.token()}` },
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      const rows = body.profiles || [];

      // Nothing in the cloud yet — this device is the seed.
      if (!rows.length) { push(); return; }

      let changed = false;
      rows.forEach((row) => {
        if (!KEYS.includes(row.key)) return;
        if (meta[row.key] === row.updated_at) return;   // already seen
        try {
          localStorage.setItem(row.key, JSON.stringify(row.data));
          meta[row.key] = row.updated_at;
          changed = true;
        } catch { /* quota — skip */ }
      });
      if (changed) saveMeta();

      // The games already booted from the old state — reload once so
      // everything (character, levels, wardrobe) renders from the fresh one.
      if (changed && !sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        location.reload();
        return;
      }
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch { /* offline */ }
  }

  // Session end is the natural push moment — ride along with Sync.record.
  const origRecord = Sync.record.bind(Sync);
  Sync.record = (payload) => {
    origRecord(payload);
    push();
  };

  // Leaving the page (tab switch, close, back to hub) pushes whatever changed
  // since — wardrobe purchases and equips don't go through Sync.record.
  window.addEventListener('pagehide', () => push({ keepalive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') push({ keepalive: true });
  });

  pull();

  window.Roam = { push, pull };
})();
