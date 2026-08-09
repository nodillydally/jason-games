/* lib/sync.js — optional cloud sync, shared by every game.
 *
 * Finished sessions POST to Atlas (/api/game-sync), which writes them to
 * Supabase so progress is trackable over time. Entirely optional: with no token
 * set, a game behaves exactly as it would standalone and everything stays in
 * localStorage.
 *
 * The token is deliberately NOT in this repo, because this repo is public. It's
 * pasted into the "Cloud sync" card once and lives in that browser's
 * localStorage. Because every game is served from the same origin, setting it in
 * one game switches it on for all of them.
 *
 * Sessions are queued before sending, so a failed or offline sync retries on the
 * next launch rather than being lost.
 *
 * Usage from a game:
 *   Sync.record({ game: 'numbers', session: {...}, answers: [...] })
 *   Sync.mountUI()   // binds the standard Cloud sync card markup
 */

const Sync = (() => {
  // Overridable so a local Atlas dev server can be targeted without editing
  // code: localStorage.setItem('games.sync.endpoint', 'http://localhost:8888/api/game-sync')
  const ENDPOINT = localStorage.getItem('games.sync.endpoint')
    || 'https://jason-atlas.vercel.app/api/game-sync';
  const TOKEN_KEY = 'games.sync.token';
  const QUEUE_KEY = 'games.sync.queue';
  // Enough to cover a long offline stretch; past this the oldest are dropped
  // rather than growing localStorage without bound.
  const MAX_QUEUE = 100;

  // One-tap provisioning: opening any page with #sync=<code> stores the code
  // and scrubs it from the URL. A single shared link arms every game on a new
  // device — no typing, no settings screen.
  const provision = location.hash.match(/^#sync=([A-Za-z0-9_-]{16,})$/);
  if (provision) {
    localStorage.setItem(TOKEN_KEY, provision[1]);
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Mapmaster shipped first with its own key. Adopt it once so switching on
  // sync there doesn't have to be redone after this move to lib/.
  const LEGACY_TOKEN_KEY = 'mapmaster.sync.token';
  if (!localStorage.getItem(TOKEN_KEY) && localStorage.getItem(LEGACY_TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, localStorage.getItem(LEGACY_TOKEN_KEY));
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

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
      // Retrying a bad token forever would just spin — stop and say so.
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

  const api = {
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

    /* Binds the shared Cloud sync card. Expects this markup (see any game's
       index.html) and the styles in lib/sync.css:

         #sync-status  #sync-btn  #sync-panel  #sync-input  #sync-save  #sync-clear

       Safe to call from a game that omits the card — it simply does nothing. */
    mountUI() {
      const $ = (id) => document.getElementById(id);
      const statusEl = $('sync-status');
      const btn = $('sync-btn');
      const panel = $('sync-panel');
      if (!statusEl || !btn || !panel) return;

      const render = ({ status, pending, message } = {}) => {
        const on = enabled();
        const queued = pending ?? api.pending();

        const view = !on ? { text: '☁ Cloud sync off', cls: '' }
          : status === 'syncing' ? { text: `☁ Syncing${queued ? ` (${queued})` : ''}…`, cls: 'busy' }
          : status === 'unauthorized' ? { text: `⚠ ${message}`, cls: 'bad' }
          : status === 'error' ? { text: `⚠ ${message} — ${queued} waiting`, cls: 'bad' }
          : queued ? { text: `☁ ${queued} session${queued === 1 ? '' : 's'} waiting to sync`, cls: 'busy' }
          : { text: '☁ Cloud sync on', cls: 'ok' };

        statusEl.textContent = view.text;
        statusEl.className = `sync-status ${view.cls}`;
        btn.textContent = on ? 'Change' : 'Set up';
      };

      listener = render;

      btn.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) $('sync-input')?.focus();
      });

      $('sync-save')?.addEventListener('click', () => {
        api.setToken($('sync-input').value);
        $('sync-input').value = '';
        panel.classList.add('hidden');
        render();
      });

      $('sync-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('sync-save').click();
      });

      $('sync-clear')?.addEventListener('click', () => {
        api.clearToken();
        $('sync-input').value = '';
        panel.classList.add('hidden');
        render();
      });

      render();
      // Retry anything stranded by a closed tab or a dead connection last time.
      flush();
    },
  };

  return api;
})();
