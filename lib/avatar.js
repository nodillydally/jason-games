/* lib/avatar.js — the runner, shared by every game.
 *
 * A line-art figure drawn as inline SVG, so it takes the page's ink colour,
 * scales to any size and ships no assets. Five poses, switched by a class:
 *
 *   idle     standing, breathing        (menus, between things)
 *   run      legs and arms swinging     (a question is live)
 *   strain   leaning hard into it       (the clock is nearly out)
 *   stumble  pitched forward, arms out  (a wrong answer, or a rival's fumble)
 *   cheer    arms up, off the ground    (a right answer, or a win)
 *
 * The important half is *anticipation*, not reaction. A character that only
 * responds after the fact reads as decoration; one that leans in as your clock
 * drains, and glances back when it's being caught, reads as a companion.
 *
 * Six equipment slots hang off the figure. `hand` rides inside the right arm
 * group so a held sword swings with the arm rather than floating beside it,
 * and `face`/`head` ride inside the head group so a hat turns when the runner
 * glances back. `back` and `aura` render behind the body.
 *
 *   Avatar.create(hostEl, { ink, gear })   gear = { head, face, back, hand, aura }
 *   av.pose('run')                         base pose, persists
 *   av.flash('cheer', 900)                 transient, reverts to the base
 *   av.behind(true)                        glance back over the shoulder
 *   av.setGear({ ... })                    re-dress without resetting the pose
 *
 * The catalogue of what can fill those slots lives in lib/wardrobe.js. This
 * file knows how to wear things, not what things exist.
 */

window.Avatar = (function () {
  'use strict';

  // Where a held item sits, and which way it points. Items are drawn in their
  // own little coordinate space and translated onto the hand.
  const HAND = 'translate(27.4 26.2)';

  const gearSvg = (gear, slot) => (gear && gear[slot] && gear[slot].svg) || '';

  function markup(o) {
    const g = o.gear || {};
    return `
      <svg class="av-svg" viewBox="0 0 40 52" aria-hidden="true">
        <g class="av-lean"><g class="av-body">
          <g class="av-slot-aura">${gearSvg(g, 'aura')}</g>
          <g class="av-slot-back">${gearSvg(g, 'back')}</g>

          <path class="av-leg av-leg-l" d="M20 33L14.2 45.5"/>
          <path class="av-leg av-leg-r" d="M20 33L25.8 45.5"/>
          <path class="av-torso" d="M20 16.5V33"/>
          <path class="av-arm av-arm-l" d="M20 20L12.6 26.2"/>

          <g class="av-arm av-arm-r">
            <path class="av-limb" d="M20 20L27.4 26.2"/>
            <g class="av-slot-hand" transform="${HAND}">${gearSvg(g, 'hand')}</g>
          </g>

          <g class="av-head-group">
            <circle class="av-head" cx="20" cy="9.5" r="6.3"/>
            <circle class="av-eye" cx="22.4" cy="8.9" r=".95"/>
            <g class="av-slot-face">${gearSvg(g, 'face')}</g>
            <g class="av-slot-head">${gearSvg(g, 'head')}</g>
          </g>
        </g></g>
      </svg>`;
  }

  function create(host, opts = {}) {
    const o = { ink: 'var(--p1)', gear: {}, ghost: false, ...opts };
    const el = document.createElement('span');
    el.className = `avatar pose-idle${o.ghost ? ' av-ghost' : ''}`;
    el.style.setProperty('--av-ink', o.ink);
    el.innerHTML = markup(o);
    host.innerHTML = '';
    host.appendChild(el);

    let base = 'idle';
    let timer = null;

    const apply = (name) => {
      el.className = el.className.replace(/pose-\w+/, `pose-${name}`);
    };

    return {
      el,

      pose(name) {
        base = name;
        clearTimeout(timer);
        timer = null;
        apply(name);
      },

      // A transient pose that falls back to whatever the base was — used for
      // the beats (a cheer, a stumble) that shouldn't become a state.
      flash(name, ms = 800) {
        clearTimeout(timer);
        apply(name);
        timer = setTimeout(() => { timer = null; apply(base); }, ms);
      },

      behind(yes) { el.classList.toggle('behind', !!yes); },

      // Re-dressing keeps the live pose, so changing hats in the wardrobe
      // doesn't restart the animation underneath the preview.
      setGear(gear) {
        o.gear = gear || {};
        const live = (el.className.match(/pose-(\w+)/) || [])[1] || base;
        el.innerHTML = markup(o);
        apply(live);
      },

      setInk(ink) {
        o.ink = ink;
        el.style.setProperty('--av-ink', ink);
      },
    };
  }

  return { create };
})();
