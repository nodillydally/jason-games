/* lib/theme.js — light / dark, and the control that switches them.
 *
 * This has to load in <head>, before any paint: setting data-theme from a
 * script at the end of <body> means one frame of cream before the page snaps
 * to dark, which is worse than having no dark mode at all.
 *
 * Three states, cycled in this order: system → dark → light → system. The
 * default is system, so the games follow the phone's own schedule until Jason
 * says otherwise; an explicit choice sticks in localStorage and wins.
 *
 * All of the actual colour lives in lib/theme.css under
 * :root[data-theme="dark"] — this file only decides which one is on.
 */

window.Theme = (function () {
  'use strict';

  const KEY = 'games.theme.v1';
  const ORDER = ['system', 'dark', 'light'];
  const LABEL = { system: '◐', dark: '☾', light: '☀' };
  const TITLE = { system: 'Theme: follows your system', dark: 'Theme: dark', light: 'Theme: light' };

  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return ORDER.includes(v) ? v : 'system';
    } catch { return 'system'; }
  }

  const resolved = (pref) => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);

  function apply(pref) {
    const dark = resolved(pref) === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // Keep the browser chrome in step — on a phone this is half the effect.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#14120E' : '#F6EFE2');
    paint(pref);
  }

  let btn = null;
  function paint(pref) {
    if (!btn) return;
    btn.textContent = LABEL[pref];
    btn.title = TITLE[pref];
    btn.setAttribute('aria-label', TITLE[pref]);
  }

  function set(pref) {
    try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
    apply(pref);
  }

  function cycle() {
    const next = ORDER[(ORDER.indexOf(stored()) + 1) % ORDER.length];
    set(next);
    return next;
  }

  function mountButton() {
    if (btn || !document.body) return;
    btn = document.createElement('button');
    btn.className = 'fx-theme';
    btn.type = 'button';
    btn.addEventListener('click', cycle);
    document.body.appendChild(btn);
    paint(stored());
  }

  // Paint immediately — this runs before <body> exists, which is the point.
  apply(stored());

  // While the preference is "system", follow the OS if it flips mid-session.
  media.addEventListener('change', () => { if (stored() === 'system') apply('system'); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }

  return { set, cycle, mountButton, get pref() { return stored(); }, get isDark() { return resolved(stored()) === 'dark'; } };
})();
