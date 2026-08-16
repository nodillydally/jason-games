/* lib/auth.js — who is playing.
 *
 * Every game used to share one pasted sync code, which was fine when there was
 * one player. It is not fine with friends: two people on the same code overwrite
 * each other's character, wardrobe and history, because the server stored one
 * row per profile key with nobody's name on it.
 *
 * So the credential stops being a shared secret and becomes a person. Sign in
 * and you hold a short-lived access token that says which player you are; the
 * API reads the player id out of it and scopes every row to you. Nothing else in
 * the stack had to learn about accounts — sync.js, roam.js, reader and briefing
 * all ask Sync.token() for a bearer, and they still do. Only what it returns
 * changed.
 *
 * Hand-rolled against the Supabase Auth REST API rather than pulling in the
 * supabase-js bundle: the whole surface used here is four POSTs, and the site is
 * a dependency-free set of <script> tags served off GitHub Pages. A CDN import
 * would be the single heaviest thing on the page and the only part of it that
 * can fail from someone else's outage.
 *
 * The publishable key below is meant to be public. It identifies the project and
 * grants nothing on its own — every table is behind row-level security keyed to
 * the signed-in user, so a token that isn't yours reads nothing of yours.
 *
 * Usage:
 *   Auth.ready.then(() => ...)   // initial session restore finished
 *   Auth.isSignedIn() / Auth.user() / Auth.token()
 *   Auth.mountUI('account-card')
 */

window.Auth = (function () {
  'use strict';

  const PROJECT_URL = 'https://nurofafxsbgndpnmmqds.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_C0WJdU4ni88p-yojRgW0rw_uNxrY064';

  const SESSION_KEY = 'games.auth.session.v1';
  // Whether this player owns the private content (book library, news feed, AI
  // grading). The server decides and enforces it; this cache only exists so the
  // games can hide those modes instead of offering them and failing at the
  // fetch. Treating it as a permission rather than a hint would be a mistake —
  // editing it in devtools buys nothing but a 403.
  const CAPS_KEY = 'games.auth.caps.v1';
  // Which player this browser last held. A different one signing in means the
  // local profile belongs to somebody else — see adoptUser().
  const LAST_USER_KEY = 'games.auth.lastUser.v1';

  // Refresh this far before expiry rather than on failure: token() is
  // synchronous and callers expect it to be usable the moment they read it.
  const REFRESH_MARGIN_MS = 120_000;

  // Cleared when a different person signs in on this browser. Mirrors the roam
  // key list — profile state that belongs to a specific player.
  const PLAYER_KEYS = [
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
    'games.roam.meta.v1',
    'games.roam.status.v1',
    'games.sync.queue',
  ];

  let session = null;      // { access_token, refresh_token, expires_at, user }
  let refreshTimer = null;
  let caps = null;         // { owner: bool } once asked
  const listeners = [];

  const read = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const write = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ }
  };

  function emit() {
    const snapshot = api.user();
    listeners.forEach((fn) => { try { fn(snapshot); } catch { /* a bad listener isn't fatal */ } });
  }

  // ---------------------------------------------------------------------------
  // Session plumbing
  // ---------------------------------------------------------------------------

  async function authFetch(path, body, bearer) {
    const res = await fetch(`${PROJECT_URL}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await res.json(); } catch { /* logout returns no body */ }
    if (!res.ok) {
      // Supabase spells the message differently across endpoints and versions.
      const msg = data.error_description || data.msg || data.message || data.error
        || `Request failed (${res.status})`;
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return data;
  }

  function store(raw) {
    if (!raw || !raw.access_token) return null;
    session = {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      // expires_at is seconds since epoch when present; fall back to expires_in.
      expires_at: (raw.expires_at ? raw.expires_at * 1000 : Date.now() + (raw.expires_in || 3600) * 1000),
      user: {
        id: raw.user?.id,
        email: raw.user?.email,
        name: raw.user?.user_metadata?.display_name
          || String(raw.user?.email || '').split('@')[0],
      },
    };
    write(SESSION_KEY, session);
    scheduleRefresh();
    return session;
  }

  function clear() {
    session = null;
    caps = null;
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(CAPS_KEY);
    } catch { /* private mode */ }
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  }

  // The same source of truth lib/sync.js uses for its endpoint, duplicated here
  // on purpose. This file loads FIRST — roam.js pulls on load and needs a bearer
  // — so asking Sync for the base at boot means asking a script that has not run
  // yet. That is not hypothetical: reading `window.Sync` here once made every
  // owner look like a guest, because the check bailed before it could ask.
  const contentEndpoint = () =>
    (localStorage.getItem('games.sync.endpoint') || 'https://jason-atlas.vercel.app/api/game-sync')
      .replace(/game-sync(?=[^/]*$)/, 'game-content');

  // Asks the API what this player is allowed to reach.
  async function loadCaps() {
    if (!api.isSignedIn()) {
      caps = { owner: false };
      write(CAPS_KEY, caps);
      emit();
      return caps;
    }
    try {
      const res = await fetch(`${contentEndpoint()}?op=capabilities`, {
        headers: { authorization: `Bearer ${api.token()}` },
      });
      caps = res.ok ? await res.json() : { owner: false };
    } catch {
      // Offline: keep whatever was last known rather than demoting a player
      // mid-flight and hiding modes that will work again in a moment.
      caps = caps || read(CAPS_KEY) || { owner: false };
    }
    write(CAPS_KEY, caps);
    emit();
    return caps;
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!session) return;
    const due = Math.max(5_000, session.expires_at - Date.now() - REFRESH_MARGIN_MS);
    refreshTimer = setTimeout(refresh, due);
  }

  async function refresh() {
    if (!session?.refresh_token) return null;
    try {
      return store(await authFetch('token?grant_type=refresh_token', {
        refresh_token: session.refresh_token,
      }));
    } catch (err) {
      // A refresh token is only rejected if it's been revoked or replaced —
      // retrying won't fix it, so drop to signed-out rather than spinning.
      if (err.status >= 400 && err.status < 500) { clear(); emit(); }
      return null;
    }
  }

  // A browser is a place, not a person. If someone else signs in here, the
  // profile sitting in localStorage is not theirs, and roam.js would happily
  // push it into their account as their first act. Wipe the player-scoped keys
  // and let the pull repopulate from whatever the cloud holds for them.
  function adoptUser(userId) {
    const previous = localStorage.getItem(LAST_USER_KEY);
    if (previous && previous !== userId) {
      PLAYER_KEYS.forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* private mode */ }
      });
    }
    try { localStorage.setItem(LAST_USER_KEY, userId); } catch { /* private mode */ }
    return Boolean(previous) && previous !== userId;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const api = {
    isSignedIn: () => Boolean(session?.access_token),

    user: () => (session ? { ...session.user } : null),

    // Synchronous by contract — every existing caller reads it inline while
    // building a request. The scheduled refresh is what keeps it valid.
    token: () => session?.access_token || '',

    // Reader's book library, Briefing's news feed and AI grading are Jason's
    // alone. Games ask this to hide those modes rather than offer them and fail.
    isOwner: () => Boolean(api.isSignedIn() && (caps || read(CAPS_KEY) || {}).owner),

    onChange(fn) {
      listeners.push(fn);
      if (typeof fn === 'function') fn(api.user());
    },

    async signUp(email, password, displayName) {
      const data = await authFetch('signup', {
        email: String(email || '').trim(),
        password: String(password || ''),
        data: displayName ? { display_name: String(displayName).trim() } : undefined,
      });
      // With email confirmation switched on, signup returns a user and no
      // session — they have to click the link before they can play.
      if (!data.access_token) return { confirmationRequired: true };
      const switched = adoptUser(data.user.id);
      store(data);
      emit();
      await loadCaps();
      return { confirmationRequired: false, switched };
    },

    async signIn(email, password) {
      const data = await authFetch('token?grant_type=password', {
        email: String(email || '').trim(),
        password: String(password || ''),
      });
      const switched = adoptUser(data.user.id);
      store(data);
      emit();
      await loadCaps();
      return { switched };
    },

    // PATCH /user with the bearer already held — no old password required,
    // because holding a live session already proves it.
    async changePassword(next) {
      const password = String(next || '');
      if (password.length < 6) throw new Error('Password needs at least 6 characters.');
      const res = await fetch(`${PROJECT_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: PUBLISHABLE_KEY,
          'content-type': 'application/json',
          authorization: `Bearer ${api.token()}`,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || data.error_description || 'Could not change the password.');
      return true;
    },

    async signOut() {
      const bearer = api.token();
      clear();
      emit();
      // Best-effort server-side revoke; the local session is already gone.
      if (bearer) { try { await authFetch('logout', {}, bearer); } catch { /* offline */ } }
    },

    /* Renders the whole account card into a container, so the five game pages
       and the hub carry one empty div instead of five copies of this markup. */
    mountUI(containerId) {
      const host = document.getElementById(containerId || 'account-card');
      if (!host) return;

      host.innerHTML = `
        <div class="account-row">
          <span class="account-status" data-role="status">Not signed in</span>
          <button class="account-btn" data-role="toggle" type="button">Sign in</button>
        </div>
        <div class="account-sync" data-role="sync"></div>
        <button class="account-link hidden" data-role="pwlink" type="button">Change password</button>
        <div class="account-panel hidden" data-role="panel">
          <p data-role="blurb"></p>
          <div class="account-form">
            <input data-role="name" type="text" placeholder="Display name" autocomplete="nickname" spellcheck="false" hidden>
            <input data-role="email" type="email" placeholder="Email" autocomplete="email" spellcheck="false">
            <input data-role="password" type="password" placeholder="Password" autocomplete="current-password">
            <button data-role="submit" class="primary" type="button">Sign in</button>
          </div>
          <p class="account-msg" data-role="msg"></p>
          <button class="account-link" data-role="mode" type="button">New here? Create an account</button>
        </div>
        <div class="account-panel hidden" data-role="pwpanel">
          <p>Pick a new password. You stay signed in on this device.</p>
          <div class="account-form">
            <input data-role="newpw" type="password" placeholder="New password" autocomplete="new-password">
            <button data-role="pwsave" class="primary" type="button">Save</button>
          </div>
          <p class="account-msg" data-role="pwmsg"></p>
        </div>`;

      const el = (role) => host.querySelector(`[data-role="${role}"]`);
      let creating = false;
      let busy = false;

      const setMsg = (text, bad) => {
        el('msg').textContent = text || '';
        el('msg').className = `account-msg${bad ? ' bad' : ''}`;
      };

      const renderMode = () => {
        el('name').hidden = !creating;
        el('password').setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
        el('submit').textContent = creating ? 'Create account' : 'Sign in';
        el('mode').textContent = creating
          ? 'Already have an account? Sign in'
          : 'New here? Create an account';
        el('blurb').textContent = creating
          ? 'An account keeps your character, wardrobe, XP and history — and brings them with you to any device you play on.'
          : 'Sign in to pick up your character and history on this device.';
        setMsg('');
      };

      const render = (user) => {
        el('status').textContent = user ? `Signed in as ${user.name}` : 'Not signed in';
        el('status').className = `account-status${user ? ' ok' : ''}`;
        el('toggle').textContent = user ? 'Sign out' : 'Sign in';
        el('pwlink').classList.toggle('hidden', !user);
        if (user) el('panel').classList.add('hidden');
        if (!user) el('pwpanel').classList.add('hidden');
      };

      el('pwlink').addEventListener('click', () => {
        el('pwpanel').classList.toggle('hidden');
        if (!el('pwpanel').classList.contains('hidden')) el('newpw').focus();
      });

      const savePw = async () => {
        const msg = el('pwmsg');
        try {
          await api.changePassword(el('newpw').value);
          el('newpw').value = '';
          msg.className = 'account-msg';
          msg.textContent = 'Password changed.';
        } catch (err) {
          msg.className = 'account-msg bad';
          msg.textContent = err.message;
        }
      };
      el('pwsave').addEventListener('click', savePw);
      el('newpw').addEventListener('keydown', (e) => { if (e.key === 'Enter') savePw(); });

      el('toggle').addEventListener('click', async () => {
        if (api.isSignedIn()) { await api.signOut(); return; }
        el('panel').classList.toggle('hidden');
        if (!el('panel').classList.contains('hidden')) el('email').focus();
      });

      el('mode').addEventListener('click', () => { creating = !creating; renderMode(); });

      const submit = async () => {
        if (busy) return;
        const email = el('email').value.trim();
        const password = el('password').value;
        if (!email || !password) { setMsg('Email and password, please.', true); return; }
        if (creating && password.length < 6) {
          setMsg('Password needs at least 6 characters.', true);
          return;
        }
        busy = true;
        el('submit').disabled = true;
        setMsg(creating ? 'Creating…' : 'Signing in…');
        try {
          const res = creating
            ? await api.signUp(email, password, el('name').value)
            : await api.signIn(email, password);
          el('password').value = '';
          if (res.confirmationRequired) {
            setMsg('Check your email for a confirmation link, then sign in.');
          } else {
            // A different player on this browser means the local profile was
            // just cleared; reload so every game boots from the new one.
            location.reload();
            return;
          }
        } catch (err) {
          setMsg(err.message || 'That did not work.', true);
        }
        busy = false;
        el('submit').disabled = false;
      };

      el('submit').addEventListener('click', submit);
      [el('email'), el('password'), el('name')].forEach((input) => {
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      });

      renderMode();
      api.onChange(render);
      // Returned so sync.js can hang its status line in the slot above rather
      // than owning a second card that says almost the same thing.
      return host;
    },
  };

  // ---------------------------------------------------------------------------
  // Boot: restore, and refresh straight away if the stored token is stale.
  // Everything that syncs waits on this so nothing fires with a dead bearer.
  // ---------------------------------------------------------------------------

  api.ready = (async () => {
    const stored = read(SESSION_KEY);
    if (!stored?.access_token) return null;
    session = stored;
    if (session.expires_at - Date.now() < REFRESH_MARGIN_MS) await refresh();
    else scheduleRefresh();
    caps = read(CAPS_KEY);
    emit();
    // Not awaited: nothing that blocks a page load depends on it, and the
    // cached answer above is already correct for every load after the first.
    loadCaps();
    return api.user();
  })();

  return api;
})();
