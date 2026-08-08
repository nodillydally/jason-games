/* sync.js — optional cloud sync for Mapmaster.
 *
 * Finished sessions POST to Atlas (/api/game-sync), which writes them to
 * Supabase so geography progress is trackable over time — accuracy per country,
 * per continent, per week. Entirely optional: with no token set, the game
 * behaves exactly as before and everything stays in localStorage.
 *
 * The token is deliberately NOT in this repo, because the repo is public. Paste
 * it once into the "Cloud sync" card on the menu; it lives in this browser's
 * localStorage only.
 *
 * Sessions are queued before sending, so a failed or offline sync retries on the
 * next launch rather than being lost.
 */

const Sync = (() => {
  const ENDPOINT = 'https://jason-atlas.vercel.app/api/game-sync';
  const TOKEN_KEY = 'mapmaster.sync.token';
  const QUEUE_KEY = 'mapmaster.sync.queue';
  // Enough to cover a long offline stretch; beyond this the oldest are dropped
  // rather than growing localStorage without bound.
  const MAX_QUEUE = 100;

  let listener = null;
  let flushing = false;

  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  };

  const queue = () => load(QUEUE_KEY, []);
  const setQueue = (q) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const enabled = () => Boolean(token());

  function emit(status, message = '') {
    if (listener) listener({ status, pending: queue().length, message });
  }

  async function post(payload) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      // Retrying a bad token forever would just spin — stop and tell the player.
      throw Object.assign(new Error('Sync code rejected'), { fatal: true });
    }
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
    return res.json();
  }

  async function flush() {
    if (flushing || !enabled()) return;
    if (!queue().length) { emit('idle'); return; }

    flushing = true;
    emit('syncing');
    try {
      while (queue().length) {
        await post(queue()[0]);
        // Re-read rather than reusing a stale copy: a game can finish mid-flush.
        setQueue(queue().slice(1));
      }
      emit('ok', 'Up to date');
    } catch (err) {
      emit(err.fatal ? 'unauthorized' : 'error', err.message);
    } finally {
      flushing = false;
    }
  }

  return {
    isEnabled: enabled,
    pending: () => queue().length,

    onChange(fn) { listener = fn; },

    setToken(value) {
      const t = String(value || '').trim();
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
      emit(t ? 'idle' : 'off');
      if (t) flush();
    },

    clearToken() {
      localStorage.removeItem(TOKEN_KEY);
      emit('off');
    },

    // Queue first, then try to send. Queuing unconditionally means a session is
    // never lost to a dropped connection.
    record(payload) {
      if (!enabled()) return;
      setQueue([...queue(), payload]);
      emit('syncing');
      flush();
    },

    flush,
  };
})();
