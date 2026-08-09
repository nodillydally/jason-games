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
  const ROOT = new URL('sprites/', document.currentScript.src).href;

  // Two facings. `s` faces the viewer and is used for portraits — menus, the
  // shop, the reveal card. `e` is the profile view used wherever the runner is
  // actually travelling: a token sliding rightwards down a race lane should be
  // facing the way it's going, not out at the camera.
  //
  // `top` is the first opaque row of that frame and `cx` the horizontal centre
  // of the hair mass. Both derived at import, not guessed. Both facings share
  // one bounding box so the sprite doesn't resize when it turns.
  const RUNNER_FACINGS = {
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
  // Bane is an imported PixelLab web export (animated GIF, walk cycle only).
  // He has no cheer or stumble of his own, so those fall back to the walk —
  // fine for a rival, who is running for almost the whole race.
  const BANE_FACINGS = {
    s: { walk: [{ f: 's-walk-0', top: 1, cx: 16 }, { f: 's-walk-1', top: 0, cx: 16 }, { f: 's-walk-2', top: 0, cx: 16 }, { f: 's-walk-3', top: 1, cx: 15 }, { f: 's-walk-4', top: 1, cx: 14 }, { f: 's-walk-5', top: 0, cx: 15 }, { f: 's-walk-6', top: 0, cx: 15 }, { f: 's-walk-7', top: 0, cx: 16 }] },
    e: { walk: [{ f: 'e-walk-0', top: 2, cx: 16 }, { f: 'e-walk-1', top: 1, cx: 16 }, { f: 'e-walk-2', top: 1, cx: 16 }, { f: 'e-walk-3', top: 1, cx: 16 }, { f: 'e-walk-4', top: 2, cx: 16 }, { f: 'e-walk-5', top: 2, cx: 16 }, { f: 'e-walk-6', top: 1, cx: 16 }, { f: 'e-walk-7', top: 1, cx: 16 }] },
  };

  const SPRITES = {
    runner: { dir: 'runner', w: 29, h: 42, facings: RUNNER_FACINGS },
    bane:   { dir: 'bane',   w: 31, h: 49, facings: BANE_FACINGS },
    // The playable roster. Cropped free from the bulk sheets, then one
    // generation each for a run cycle. They have no other pose, so every pose
    // falls back to the run — which is what the fallback below is for.
    wizard:  { dir: 'wizard', w: 21, h: 27, facings: { s: { run: [{ f: 's-run-0', top: 1, cx: 11 }, { f: 's-run-1', top: 1, cx: 11 }, { f: 's-run-2', top: 0, cx: 11 }, { f: 's-run-3', top: 1, cx: 11 }, { f: 's-run-4', top: 1, cx: 11 }] } } },
    reaper:  { dir: 'reaper', w: 21, h: 26, facings: { s: { run: [{ f: 's-run-0', top: 0, cx: 10 }, { f: 's-run-1', top: 0, cx: 10 }, { f: 's-run-2', top: 0, cx: 10 }, { f: 's-run-3', top: 0, cx: 10 }, { f: 's-run-4', top: 0, cx: 10 }] } } },
    frost:   { dir: 'frost', w: 22, h: 27, facings: { s: { run: [{ f: 's-run-0', top: 1, cx: 10 }, { f: 's-run-1', top: 1, cx: 10 }, { f: 's-run-2', top: 1, cx: 10 }, { f: 's-run-3', top: 0, cx: 10 }, { f: 's-run-4', top: 1, cx: 10 }] } } },
    catfolk: { dir: 'catfolk', w: 23, h: 27, facings: { s: { run: [{ f: 's-run-0', top: 2, cx: 9 }, { f: 's-run-1', top: 1, cx: 9 }, { f: 's-run-2', top: 0, cx: 9 }, { f: 's-run-3', top: 0, cx: 9 }, { f: 's-run-4', top: 1, cx: 9 }] } } },
    fairy:   { dir: 'fairy', w: 27, h: 26, facings: { s: { run: [{ f: 's-run-0', top: 1, cx: 13 }, { f: 's-run-1', top: 0, cx: 13 }, { f: 's-run-2', top: 0, cx: 13 }, { f: 's-run-3', top: 0, cx: 14 }, { f: 's-run-4', top: 1, cx: 14 }] } } },
    ember:   { dir: 'ember', w: 20, h: 25, facings: { s: { run: [{ f: 's-run-0', top: 0, cx: 7 }, { f: 's-run-1', top: 2, cx: 10 }, { f: 's-run-2', top: 2, cx: 10 }, { f: 's-run-3', top: 4, cx: 9 }, { f: 's-run-4', top: 3, cx: 9 }] } } },

    // Rivals: static sheet art animated from a single reference frame, so
    // each has one run cycle and borrows it for every other pose. They face
    // the viewer because their source art does.
    metronome: { dir: 'metronome', w: 20, h: 27, facings: { s: { run: [{ f: 's-run-0', top: 0, cx: 9 }, { f: 's-run-1', top: 1, cx: 9 }, { f: 's-run-2', top: 1, cx: 9 }, { f: 's-run-3', top: 0, cx: 9 }, { f: 's-run-4', top: 1, cx: 9 }] } } },
    professor: { dir: 'professor', w: 22, h: 27, facings: { s: { run: [{ f: 's-run-0', top: 0, cx: 11 }, { f: 's-run-1', top: 1, cx: 11 }, { f: 's-run-2', top: 1, cx: 11 }, { f: 's-run-3', top: 0, cx: 11 }, { f: 's-run-4', top: 0, cx: 11 }] } } },
    kid: { dir: 'kid', w: 21, h: 27, facings: { s: { run: [{ f: 's-run-0', top: 1, cx: 8 }, { f: 's-run-1', top: 1, cx: 8 }, { f: 's-run-2', top: 0, cx: 8 }, { f: 's-run-3', top: 0, cx: 8 }, { f: 's-run-4', top: 1, cx: 8 }] } } },
  };

  // Anything missing an animation borrows the closest one it does have, so a
  // sprite with only a walk cycle still answers to every pose the game asks for.
  Object.values(SPRITES).forEach((sp) => {
    Object.values(sp.facings).forEach((f) => {
      const base = f.run || f.walk || f.idle;
      ['idle', 'run', 'strain', 'cheer', 'stumble'].forEach((k) => { f[k] = f[k] || base; });
      f.strain = f.run;
    });
  });

  const FPS = { idle: 4, run: 11, strain: 16, cheer: 9, stumble: 8 };
  const ONCE = { stumble: true };

  // Each gear slot is drawn in its own little coordinate space — hats on a
  // ten-column grid, held things four columns wide, capes and auras on a full
  // body canvas. Cramming all three into one viewBox is what broke them, so
  // every slot gets its own <svg>, sized in sprite units and anchored to the
  // part of the body it's worn on.
  //
  // `w` is the width in sprite pixels; the height follows from the art's own
  // aspect. `at` returns the top-left corner for the frame being drawn.
  const SLOTS = {
    back:  { full: true },
    aura:  { full: true },
    head:  { w: 17, at: (fr) => [fr.cx - 8.5, fr.top - 1] },
    // Measured off the sprite by finding dark pixels with skin directly beneath
    // them: the eyes are on row 11, at x 12-13 and 16-17. Eyewear is therefore
    // 11 wide and sits nine rows below the crown — reading it off the art
    // rather than estimating is what finally put a monocle on an eyeball.
    face:  { w: 11, at: (fr) => [fr.cx - 5, fr.top + 8.5] },
    hand:  { w: 7,  at: (fr) => [fr.cx + 4.5, fr.top + 19] },
  };
  const SLOT_ORDER = ['back', 'aura', 'head', 'face', 'hand'];

  /* ------------------------------ ticker ------------------------------- */

  const live = new Set();
  let raf = null;

  function step(now) {
    live.forEach((a) => a.tick(now));
    raf = live.size ? requestAnimationFrame(step) : null;
  }
  function join(a) { live.add(a); if (!raf) raf = requestAnimationFrame(step); }

  /* ------------------------------ render ------------------------------- */

  // One <svg> per worn slot, each with a viewBox matching its own art.
  function gearSvg(gear, pal) {
    return SLOT_ORDER.map((slot) => {
      const g = gear[slot];
      if (!g || !g.px) return '';
      const cols = g.px[0].length;
      const rows = g.px.length;
      return `<svg class="av-gear av-gear-${slot}" data-slot="${slot}"`
        + ` viewBox="0 0 ${cols} ${rows}" shape-rendering="crispEdges" aria-hidden="true">`
        + Pixel.toSvg(g.px, { ...pal, ...g.pal }) + '</svg>';
    }).join('');
  }

  function create(host, opts = {}) {
    // 's' faces the viewer (portraits), 'e' faces right (anything moving).
    const o = { ink: 'var(--p1)', gear: {}, pal: {}, ghost: false, tint: '', facing: 's', sprite: 'runner', ...opts };
    const sp = SPRITES[o.sprite] || SPRITES.runner;
    const anims = sp.facings[o.facing] || sp.facings.s;
    const BASE = `${ROOT}${sp.dir}/`;
    const W = sp.w;
    const H = sp.h;

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
    html += '<span class="av-gearlayer"></span>';
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

        // Worn gear is repositioned every frame, so a hat rides the head as it
        // bobs and a held thing moves with the hand.
        layer.querySelectorAll('.av-gear').forEach((n) => {
          const spec = SLOTS[n.dataset.slot];
          if (!spec) return;
          if (spec.full) {
            n.style.cssText = 'left:0;top:0;width:100%;height:100%';
            return;
          }
          const box = n.viewBox.baseVal;
          const gw = spec.w;
          const gh = gw * (box.height / box.width);
          const [x, y] = spec.at(fr);
          n.style.left = `${(x / W) * 100}%`;
          n.style.top = `${(y / H) * 100}%`;
          n.style.width = `${(gw / W) * 100}%`;
          n.style.height = `${(gh / H) * 100}%`;
        });
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

  return { create, SPRITES };
})();
