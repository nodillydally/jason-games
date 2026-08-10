/* lib/sync.js — cloud sync, shared by every game.
 *
 * Finished sessions POST to Atlas (/api/game-sync), which writes them to
 * Supabase so progress is trackable over time. Entirely optional: signed out, a
 * game behaves exactly as it would standalone and everything stays in
 * localStorage.
 *
 * The credential is the signed-in player's access token (see lib/auth.js). It
 * used to be one shared secret pasted into a card, which worked only while
 * there was exactly one player — two people on the same code wrote over each
 * other's history. Every request now carries who is making it, and the API
 * scopes the rows it touches accordingly.
 *
 * Sessions are queued before sending, so a failed or offline sync retries on the
 * next launch rather than being lost.
 *
 * Usage from a game:
 *   Sync.record({ game: 'numbers', session: {...}, answers: [...] })
 *   Sync.mountUI()   // renders the account card
 */

const Sync = (() => {
  // Overridable so a local Atlas dev server can be targeted without editing
  // code: localStorage.setItem('games.sync.endpoint', 'http://localhost:8888/api/game-sync')
  const ENDPOINT = localStorage.getItem('games.sync.endpoint')
    || 'https://jason-atlas.vercel.app/api/game-sync';
  const QUEUE_KEY = 'games.sync.queue';
  // Enough to cover a long offline stretch; past this the oldest are dropped
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

  // Identity lives in lib/auth.js; everything here just carries whatever bearer
  // the current player has. Signed out, that's an empty string and sync is off.
  const token = () => (window.Auth ? Auth.token() : '');
  const enabled = () => Boolean(window.Auth && Auth.isSignedIn());

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
      // Retrying a rejected bearer forever would just spin. Auth refreshes
      // ahead of expiry, so a 401 here means the session is genuinely gone.
      throw Object.assign(new Error('Signed out — sign in to sync'), { fatal: true });
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

  const api = {
    isEnabled: enabled,
    pending: () => queue().length,
    // For games that fetch private content (Reader's book library) with the
    // same credential. Same origin, so exposing the token to game code adds
    // no surface beyond what localStorage already allows.
    token,
    contentEndpoint: () => ENDPOINT.replace(/game-sync(?=[^/]*$)/, 'game-content'),

    onChange(fn) { listener = fn; },

    // Queue first, then try to send. Queuing unconditionally means a session is
    // never lost to a dropped connection.
    record(payload) {
      // The hub's daily checkoffs read this: a game counts as played only when
      // it logs a finished session, not when it's merely opened. Kept even with
      // sync off, since it's local bookkeeping rather than cloud data.
      if (payload && payload.game && payload.session && !payload.session.aborted) {
        try {
          const KEY = 'games.playlog.v2';
          const day = new Date().toISOString().slice(0, 10);
          const log = load(KEY, {});
          const today = log[day] || [];
          if (!today.includes(payload.game)) log[day] = [...today, payload.game];
          const keep = Object.keys(log).sort().slice(-14);
          localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, log[k]]))));
        } catch { /* bookkeeping only — never block the sync itself */ }
      }
      if (!enabled()) return;
      setQueue([...queue(), payload]);
      emit('syncing');
      flush();
    },

    flush,

    /* Renders the account card (lib/auth.js owns the sign-in half) and hangs the
       sync status line inside it. Safe to call from a page without the card —
       Auth.mountUI simply does nothing and there's no slot to write to. */
    mountUI(containerId) {
      const host = window.Auth ? Auth.mountUI(containerId) : null;
      const slot = host && host.querySelector('[data-role="sync"]');
      if (!slot) return;

      const render = ({ status, pending, message } = {}) => {
        const queued = pending ?? api.pending();

        // Signed out is not an error state — the games are fully playable that
        // way, and the card above already says nobody is signed in.
        const view = !enabled() ? { text: 'Progress stays on this device.', cls: '' }
          : status === 'syncing' ? { text: `☁ Syncing${queued ? ` (${queued})` : ''}…`, cls: 'busy' }
          : status === 'unauthorized' ? { text: `⚠ ${message}`, cls: 'bad' }
          : status === 'error' ? { text: `⚠ ${message} — ${queued} waiting`, cls: 'bad' }
          : queued ? { text: `☁ ${queued} session${queued === 1 ? '' : 's'} waiting to sync`, cls: 'busy' }
          : { text: '☁ Synced — your progress follows you to any device.', cls: 'ok' };

        slot.textContent = view.text;
        slot.className = `account-sync ${view.cls}`;
      };

      listener = render;
      // Fires once on mount and again whenever the player signs in or out. The
      // flush is how anything stranded by a closed tab or a dead connection
      // last time gets retried.
      Auth.onChange(() => { render(); flush(); });
    },
  };

  return api;
})();

// A top-level `const` in a classic script is script-scoped, not a property of
// window — so bare `Sync` resolved fine inside the games while `window.Sync`
// was quietly undefined, and every `if (window.Sync)` guard took the wrong
// branch in silence. Publish it explicitly.
window.Sync = Sync;
