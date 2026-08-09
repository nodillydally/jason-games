/* avatar.js — the runner.
 *
 * A small line-art figure, drawn as inline SVG rather than sprites so it takes
 * the page's ink colour, scales to any size, and costs nothing to ship. Five
 * poses, switched by a class on the wrapper:
 *
 *   idle     standing, breathing        (menus, between things)
 *   run      legs and arms swinging     (a question is live)
 *   strain   leaning hard into it       (the question clock is nearly out)
 *   stumble  pitched forward, arms out  (a wrong answer, or a rival's fumble)
 *   cheer    arms up, off the ground    (a right answer, or a win)
 *
 * The important half of this is *anticipation*, not reaction. A character that
 * only responds after the fact reads as decoration; one that leans in as your
 * clock drains, and glances back when it's being caught, reads as a companion.
 * That's `strain` and the `behind` modifier, and they're what make the thing
 * feel alive rather than animated.
 *
 * Cosmetics hang off the same figure and unlock by level, which is the point:
 * before this, levelling up made a number go up and nothing else.
 *
 * Usage:
 *   const av = Avatar.create(hostEl, { color: 'var(--p1)', head: 'cap' });
 *   av.pose('run');            // base pose, persists
 *   av.flash('cheer', 900);    // transient, reverts to the base pose
 *   av.behind(true);           // glance back over the shoulder
 */

window.Avatar = (function () {
  'use strict';

  // `level: 1` is always available. The rest are earned, and the gaps widen so
  // the later ones stay worth chasing.
  const COSMETICS = [
    { id: 'none',   label: 'Plain',     level: 1 },
    { id: 'cap',    label: 'Cap',       level: 3,  head: '<path class="av-fill" d="M13.8 7.8a6.3 6.3 0 0 1 12.4 0z"/><path d="M26.2 7.8h5"/>' },
    { id: 'band',   label: 'Headband',  level: 5,  head: '<path class="av-thick" d="M14.2 6.4h11.6"/><path d="M25.8 6.4l3.4 2.2"/>' },
    { id: 'cape',   label: 'Cape',      level: 8,  cape: '<path class="av-cape" d="M20 17c-5.4 2.8-7.3 9.4-8.7 15.2 4.6 1.4 12.8 1.4 17.4 0C27.3 26.4 25.4 19.8 20 17z"/>' },
    { id: 'shades', label: 'Shades',    level: 11, head: '<path class="av-fill" d="M14.6 7.4h4.4v2.8h-4.4zM21 7.4h4.4v2.8h-4.4z"/><path d="M19 8.4h2"/>' },
    { id: 'crown',  label: 'Crown',     level: 15, head: '<path class="av-fill" d="M14.2 4.6l1.4-3.8 2.3 2.6 2.1-3.6 2.1 3.6 2.3-2.6 1.4 3.8z"/>' },
  ];

  // Not player-unlockable — these belong to specific rivals so a race is two
  // characters rather than a character and a dot.
  const RIVAL_COSMETICS = {
    mortar: { head: '<path class="av-fill" d="M9.6 4.2h20.8L20 8z"/><path d="M27.4 5.2v5"/>' },
    tick:   { head: '<path d="M20 3.2V1.4"/><circle class="av-fill" cx="20" cy=".9" r="1.2"/>' },
    bolt:   { head: '<path class="av-fill" d="M25.8.6l-4.6 5.4h3l-2.3 4.4 5.2-5.8h-3.1z"/>' },
  };

  const cosmeticFor = (id) => COSMETICS.find((c) => c.id === id)
    || RIVAL_COSMETICS[id] && { id, ...RIVAL_COSMETICS[id] }
    || COSMETICS[0];

  // Two nested groups on purpose: `av-lean` owns the whole-body rotation (the
  // forward pitch of strain and stumble) and `av-body` owns the bob and hop.
  // One group can't hold both — the second `transform` would replace the first.
  function markup(opts) {
    const cos = cosmeticFor(opts.head);
    return `
      <svg class="av-svg" viewBox="0 0 40 52" aria-hidden="true">
        <g class="av-lean"><g class="av-body">
          ${cos.cape || ''}
          <path class="av-leg av-leg-l" d="M20 33L14.2 45.5"/>
          <path class="av-leg av-leg-r" d="M20 33L25.8 45.5"/>
          <path class="av-torso" d="M20 16.5V33"/>
          <path class="av-arm av-arm-l" d="M20 20L12.6 26.2"/>
          <path class="av-arm av-arm-r" d="M20 20L27.4 26.2"/>
          <g class="av-head-group">
            <circle class="av-head" cx="20" cy="9.5" r="6.3"/>
            <circle class="av-eye" cx="22.4" cy="8.9" r=".95"/>
            ${cos.head || ''}
          </g>
        </g></g>
      </svg>`;
  }

  function create(host, opts = {}) {
    const o = { color: 'var(--ink)', head: 'none', ghost: false, ...opts };
    const el = document.createElement('span');
    el.className = `avatar pose-idle${o.ghost ? ' av-ghost' : ''}`;
    el.style.setProperty('--av-ink', o.color);
    el.innerHTML = markup(o);
    host.innerHTML = '';
    host.appendChild(el);

    let base = 'idle';
    let timer = null;

    const apply = (name) => {
      el.className = el.className.replace(/pose-\w+/, `pose-${name}`);
    };

    const api = {
      el,

      pose(name) {
        base = name;
        clearTimeout(timer);
        timer = null;
        apply(name);
      },

      // A transient pose that falls back to whatever the base was. Used for
      // the beats — a cheer, a stumble — that shouldn't become a state.
      flash(name, ms = 800) {
        clearTimeout(timer);
        apply(name);
        timer = setTimeout(() => { timer = null; apply(base); }, ms);
      },

      behind(yes) { el.classList.toggle('behind', !!yes); },

      // Swapping a cosmetic re-renders the figure but keeps the live pose, so
      // changing hats in the menu doesn't reset the animation.
      setHead(id) {
        o.head = id;
        el.innerHTML = markup(o);
        apply(timer ? el.className.match(/pose-(\w+)/)[1] : base);
      },
    };

    return api;
  }

  return {
    create,
    cosmetics: () => COSMETICS.map((c) => ({ id: c.id, label: c.label, level: c.level })),
    unlockedAt: (level) => COSMETICS.filter((c) => c.level <= level).map((c) => c.id),
    nextUnlock: (level) => COSMETICS.find((c) => c.level > level) || null,
  };
})();
