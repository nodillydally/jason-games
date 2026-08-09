/* lib/avatar.js — the runner, shared by every game.
 *
 * The sprite is generated art (PixelLab), imported as PNG frames under
 * lib/sprites/runner/. tools/pixellab-recipe.md records the exact prompt,
 * proportions and endpoints, so the character can be extended or re-derived
 * later without guessing at what produced it.
 *
 * Every frame of every animation is cropped to one shared bounding box rather
 * than each to its own. That matters more than it sounds: cropping per frame
 * re-centres each pose individually and the sprite then jitters as it cycles.
 * The union box keeps the motion that's actually in the animation.
 *
 * Five poses:
 *
 *   idle     standing, breathing          (menus, between things)
 *   run      the run cycle                (a question is live)
 *   strain   the same cycle, faster       (the clock is nearly out)
 *   stumble  tripping forward, plays once (a wrong answer, or a rival's fumble)
 *   cheer    arms up                      (a right answer, or a win)
 *
 * One ticker drives every avatar on the page. Per-instance timers would mean a
 * race screen running three of them out of phase for no benefit.
 *
 * Gear stays vector (lib/gear.js), drawn into one overlay SVG whose transform
 * is updated per frame from that frame's head anchor — so a hat rides the head
 * as it bobs instead of sitting at a fixed height.
 *
 *   Avatar.create(hostEl, { ink, gear, pal, ghost })
 *   av.pose('run') / av.flash('cheer', 900) / av.behind(true) / av.setGear(...)
 */

window.Avatar = (function () {
  'use strict';

  // Resolved against this script's own URL so every game gets the right path
  // without each one hardcoding how deep it sits.
  const BASE = new URL('sprites/runner/', document.currentScript.src).href;

  const W = 29;
  const H = 42;

  // Two facings. `s` faces the viewer and is used for portraits — menus, the
  // shop, the reveal card. `e` is the profile view used wherever the runner is
  // actually travelling: a token sliding rightwards down a race lane should be
  // facing the way it's going, not out at the camera.
  //
  // `top` is the first opaque row of that frame and `cx` the horizontal centre
  // of the hair mass. Both derived at import, not guessed. Both facings share
  // one bounding box so the sprite doesn't resize when it turns.
  const FACINGS = {
    s: {
      idle: [{ f: 's-idle-0', top: 1, cx: 14 }, { f: 's-idle-1', top: 2, cx: 14 }, { f: 's-idle-2', top: 3, cx: 14 }, { f: 's-idle-3', top: 3, cx: 14 }, { f: 's-idle-4', top: 2, cx: 14 }],
      run: [{ f: 's-run-0', top: 1, cx: 14 }, { f: 's-run-1', top: 3, cx: 14 }, { f: 's-run-2', top: 4, cx: 14 }, { f: 's-run-3', top: 3, cx: 15 }, { f: 's-run-4', top: 3, cx: 15 }],
      cheer: [{ f: 's-cheer-0', top: 1, cx: 14 }, { f: 's-cheer-1', top: 2, cx: 14 }, { f: 's-cheer-2', top: 0, cx: 14 }, { f: 's-cheer-3', top: 0, cx: 14 }, { f: 's-cheer-4', top: 2, cx: 14 }],
      stumble: [{ f: 's-stumble-0', top: 1, cx: 14 }, { f: 's-stumble-1', top: 1, cx: 14 }, { f: 's-stumble-2', top: 4, cx: 14 }, { f: 's-stumble-3', top: 7, cx: 14 }, { f: 's-stumble-4', top: 5, cx: 14 }],
    },
    e: {
      idle: [{ f: 'e-idle-0', top: 3, cx: 14 }],
      run: [{ f: 'e-run-0', top: 3, cx: 14 }, { f: 'e-run-1', top: 4, cx: 14 }, { f: 'e-run-2', top: 5, cx: 14 }, { f: 'e-run-3', top: 3, cx: 15 }, { f: 'e-run-4', top: 4, cx: 15 }],
      cheer: [{ f: 'e-cheer-0', top: 3, cx: 14 }, { f: 'e-cheer-1', top: 5, cx: 15 }, { f: 'e-cheer-2', top: 5, cx: 14 }, { f: 'e-cheer-3', top: 4, cx: 13 }, { f: 'e-cheer-4', top: 4, cx: 13 }],
      stumble: [{ f: 'e-stumble-0', top: 3, cx: 14 }, { f: 'e-stumble-1', top: 4, cx: 15 }, { f: 'e-stumble-2', top: 5, cx: 16 }, { f: 'e-stumble-3', top: 5, cx: 17 }, { f: 'e-stumble-4', top: 6, cx: 17 }],
    },
  };
  // The east idle is the character's static profile frame — a standing pose
  // needs no animation and this saved a generation.
  Object.values(FACINGS).forEach((f) => { f.strain = f.run; });

  const FPS = { idle: 4, run: 11, strain: 16, cheer: 9, stumble: 8 };
  const ONCE = { stumble: true };

  // The generated head is 16px across; the hand-drawn gear in lib/gear.js was
  // drawn for a 12px one, so it's scaled to fit rather than redrawn. This is
  // the seam to remove when the gear itself is regenerated.
  const GEAR_SCALE = 1.4;
  const GEAR_GRID = 10; // hats are ten columns wide

  /* ------------------------------ ticker ------------------------------- */

  const live = new Set();
  let raf = null;

  function step(now) {
    live.forEach((a) => a.tick(now));
    raf = live.size ? requestAnimationFrame(step) : null;
  }
  function join(a) { live.add(a); if (!raf) raf = requestAnimationFrame(step); }

  /* ------------------------------ render ------------------------------- */

  function gearSvg(gear, pal) {
    let out = '';
    ['back', 'aura'].forEach((slot) => {
      const g = gear[slot];
      if (g && g.px) out += `<g class="av-under">${Pixel.toSvg(g.px, { ...pal, ...g.pal })}</g>`;
    });
    ['head', 'face', 'hand'].forEach((slot) => {
      const g = gear[slot];
      if (g && g.px) out += `<g class="av-${slot}">${Pixel.toSvg(g.px, { ...pal, ...g.pal })}</g>`;
    });
    return out;
  }

  function create(host, opts = {}) {
    // 's' faces the viewer (portraits), 'e' faces right (anything moving).
    const o = { ink: 'var(--p1)', gear: {}, pal: {}, ghost: false, tint: '', facing: 's', ...opts };
    const anims = FACINGS[o.facing] || FACINGS.s;

    const el = document.createElement('span');
    el.className = `avatar pose-idle${o.ghost ? ' av-ghost' : ''}${o.tint ? ' av-tint-' + o.tint : ''}`;
    el.style.setProperty('--av-ink', o.ink);

    // Every frame is in the DOM from the start and swapped by opacity. Pointing
    // one <img> at a new src instead would flash the first time each frame is
    // shown, which on a race track is every few hundred milliseconds.
    let html = '';
    Object.keys(anims).forEach((name) => {
      if (name === 'strain') return; // shares run's frames
      anims[name].forEach((fr) => {
        html += `<img class="av-f" data-f="${fr.f}" src="${BASE}${fr.f}.png" alt="" draggable="false">`;
      });
    });
    html += `<svg class="av-gearlayer" viewBox="0 0 ${GEAR_GRID} ${H}" shape-rendering="crispEdges" aria-hidden="true"></svg>`;
    el.innerHTML = html;
    host.innerHTML = '';
    host.appendChild(el);

    const imgs = {};
    el.querySelectorAll('.av-f').forEach((n) => { imgs[n.dataset.f] = n; });
    const layer = el.querySelector('.av-gearlayer');

    const api = {
      el,
      _anim: 'idle',
      _i: 0,
      _last: 0,
      _revert: null,
      _until: 0,

      paint() {
        const frames = anims[this._anim];
        const fr = frames[Math.min(this._i, frames.length - 1)];
        Object.keys(imgs).forEach((k) => imgs[k].classList.toggle('on', k === fr.f));
        // Gear follows the head: centred on this frame's hair centre, dropped
        // to this frame's top edge.
        const gw = GEAR_GRID * GEAR_SCALE;
        layer.style.left = `${((fr.cx - gw / 2) / W) * 100}%`;
        layer.style.top = `${(fr.top / H) * 100}%`;
        layer.style.width = `${(gw / W) * 100}%`;
      },

      tick(now) {
        if (this._revert && now >= this._until) {
          this._anim = this._revert; this._revert = null; this._i = 0;
        }
        const gap = 1000 / (FPS[this._anim] || 8);
        if (now - this._last < gap) return;
        this._last = now;
        const frames = anims[this._anim];
        // A stumble is a one-shot: looping it would read as falling over and
        // over rather than as one mistake.
        if (ONCE[this._anim] && this._i >= frames.length - 1) return;
        this._i = (this._i + 1) % frames.length;
        this.paint();
      },

      pose(name) {
        if (!anims[name]) name = 'idle';
        this._revert = null;
        if (this._anim !== name) { this._anim = name; this._i = 0; this.paint(); }
        el.className = el.className.replace(/pose-\w+/, `pose-${name}`);
      },

      flash(name, ms = 800) {
        if (!anims[name]) return;
        this._revert = this._revert || this._anim;
        this._anim = name;
        this._i = 0;
        this._until = performance.now() + ms;
        el.className = el.className.replace(/pose-\w+/, `pose-${name}`);
        this.paint();
      },

      behind(yes) { el.classList.toggle('behind', !!yes); },

      setGear(gear) {
        o.gear = gear || {};
        layer.innerHTML = gearSvg(o.gear, { ...o.pal });
        this.paint();
      },

      setInk(ink) { o.ink = ink; el.style.setProperty('--av-ink', ink); },
    };

    api.setGear(o.gear);
    api.paint();
    join(api);
    return api;
  }

  return { create, W, H, FACINGS };
})();
