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
    'spelling.profile.v1',
    'memory.profile.v1',
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

  // "Is my phone actually syncing?" should be answerable without reading a
  // database, so every successful exchange leaves a timestamp the hub shows.
  const STAMP_KEY = 'games.roam.status.v1';
  function stamp(kind) {
    try {
      const s = JSON.parse(localStorage.getItem(STAMP_KEY)) || {};
      s[kind] = Date.now();
      localStorage.setItem(STAMP_KEY, JSON.stringify(s));
    } catch { /* private mode */ }
  }

  const localData = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch { return undefined; }
  };

  // Last-write-wins is right for scores and settings, but WRONG for records of
  // things that happened: days you kept the brief, items you own, games you
  // played. Those only ever grow, so when a cloud copy is adopted these maps
  // are unioned with whatever this device already had — a day's work can never
  // be erased by a device that hadn't heard about it yet.
  const ADDITIVE = {
    'briefing.profile.v1': ['keptDays', 'doneDates'],
    'games.wardrobe.v1': ['owned', 'flags'],
    'chronicle.profile.v1': ['pinned', 'studied'],
  };

  function mergeAdditive(key, incoming) {
    const local = localData(key);
    if (!local || !incoming || typeof incoming !== 'object') return incoming;

    // Per-date lists of games played: union the lists, keep every date.
    if (key === 'games.playlog.v2') {
      const out = { ...incoming };
      for (const [day, games] of Object.entries(local)) {
        out[day] = [...new Set([...(out[day] || []), ...(games || [])])];
      }
      return out;
    }

    const fields = ADDITIVE[key];
    if (!fields) return incoming;
    const out = { ...incoming };
    fields.forEach((f) => {
      if (typeof local[f] === 'object' && local[f]) {
        out[f] = { ...(incoming[f] || {}), ...local[f] };
      }
    });
    return out;
  }

  // Session state (an in-progress brief, a half-read course) is not a value to
  // be overwritten — it's a point in time. A device holding YESTERDAY's session
  // must never push it over today's, so these keys compare recency and the
  // newer one wins regardless of which device wrote last.
  function localIsNewer(key, incoming, local) {
    if (!local) return false;
    if (key === 'briefing.day.v1' || key === 'briefing.dump.v1') {
      const ld = String(local.date || '');
      const id = String((incoming && incoming.date) || '');
      if (ld !== id) return ld > id;
      return (local.startedAt || 0) > ((incoming && incoming.startedAt) || 0);
    }
    if (key === 'chronicle.study.v1') {
      return (local.startedAt || 0) > ((incoming && incoming.startedAt) || 0);
    }
    return false;
  }

  let pushing = false;
  // Nothing is ever pushed before this device has reconciled with the cloud.
  // Pushing first is how a stale tab erases another device's day: the pull is
  // async, and hiding the tab a second after load used to fire a push carrying
  // whatever this device happened to still believe.
  let pulled = false;
  let pushQueued = false;

  async function push(opts = {}) {
    if (!Sync.isEnabled() || pushing) return;
    if (!pulled) { pushQueued = true; return; }
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
        stamp('push');
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
      if (!rows.length) { pulled = true; push(); return; }

      let changed = false;
      let mergedBack = false;
      rows.forEach((row) => {
        if (!KEYS.includes(row.key)) return;
        if (meta[row.key] === row.updated_at) return;   // already seen
        try {
          // An older session in the cloud never replaces a newer one here.
          if (localIsNewer(row.key, row.data, localData(row.key))) {
            meta[row.key] = row.updated_at;
            mergedBack = true;   // send ours back instead
            return;
          }
          const merged = mergeAdditive(row.key, row.data);
          localStorage.setItem(row.key, JSON.stringify(merged));
          meta[row.key] = row.updated_at;
          changed = true;
          // A merge means this device now holds more than the cloud does —
          // send the union straight back so the other device sees it too.
          if (JSON.stringify(merged) !== JSON.stringify(row.data)) mergedBack = true;
        } catch { /* quota — skip */ }
      });
      if (changed) saveMeta();
      stamp('pull');
      pulled = true;
      if (mergedBack || pushQueued) { pushQueued = false; push(); }

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

  // Auth restores (and may refresh) the session asynchronously, so pulling
  // immediately would fire with an empty or stale bearer and silently no-op.
  // Every later push is gated behind `pulled`, so waiting here delays nothing.
  (window.Auth ? Auth.ready : Promise.resolve()).then(pull);

  window.Roam = { push, pull };
})();
