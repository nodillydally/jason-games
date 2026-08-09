/* lib/avatar.js — the runner, shared by every game.
 *
 * An 8-bit chibi sprite in the Mega-Man-mini idiom: big head, short body,
 * heavy outline, flat colour. Drawn here as text grids (see lib/pixel.js) so
 * the art lives in source control as something readable and editable rather
 * than a binary sheet, and so it costs no build step and no extra request.
 *
 * Six frames, switched by a pose class on the wrapper:
 *
 *   idle     standing                    (menus, between things)
 *   run      two frames, legs alternating (a question is live)
 *   strain   braced, leaning in           (the clock is nearly out)
 *   stumble  pitched forward              (a wrong answer, or a rival's fumble)
 *   cheer    both arms up                 (a right answer, or a win)
 *
 * The half that matters is anticipation, not reaction: `strain` fires while
 * your clock is still running, and `behind` turns the head to look back when
 * something is catching you.
 *
 * The shirt is painted with a CSS custom property rather than a fixed colour,
 * so the same sprite wears each game's accent — and an `ink` item from the
 * wardrobe repaints it without touching skin or hair.
 *
 *   Avatar.create(hostEl, { ink, gear })   gear = { head, face, back, hand, aura }
 *   av.pose('run') / av.flash('cheer', 900) / av.behind(true) / av.setGear(...)
 */

window.Avatar = (function () {
  'use strict';

  const W = 16;
  const H = 22;

  /* ------------------------------- palette ------------------------------- */

  const PALETTE = {
    o: '#241a14',                        // outline
    H: '#2a1c14',                        // hair
    h: '#463022',                        // hair, lit
    S: '#a9744e',                        // skin
    s: '#8b5c3b',                        // skin, shaded
    e: '#1b120e',                        // eye
    m: '#7a4a30',                        // mouth
    C: 'var(--av-ink, var(--p1))',       // shirt — takes the game's accent
    c: 'var(--av-shade, #00000030)',     // shirt, shaded
    P: '#3b4353',                        // trousers
    p: '#2c323e',
    B: '#efe9dc',                        // shoes
    W: '#ffffff',
  };

  /* -------------------------------- frames -------------------------------
   *
   * Curly hair is the whole silhouette problem at this size. A smooth outline
   * reads as a helmet, so the top edge is deliberately uneven and the mass sits
   * proud of the skull on both sides — the bumps are the texture. Everything
   * below the neck is shared between frames; only arms and legs move.
   */

  const HEAD = [
    '....oooooo......', //  0
    '..ooHhHHhHoo....', //  1  the lit pixels are the curl, not the outline
    '.oHHhHHHHhHHo...', //  2
    '.oHHHhHHhHHHo...', //  3
    '.oHHSSSSSSHHo...', //  4  fringe over the forehead
    '.oHSSSSSSSSHo...', //  5
    '.oHSeSSSSeSHo...', //  6
    '.oHSSSSSSSSHo...', //  7
    '..oSSSmmSSSo....', //  8
    '...oSSSSSSo.....', //  9
    '.....oSSo.......', // 10  neck
  ];

  // Pitched forward: the head drops and shifts, otherwise a stumble reads as
  // the same figure pointing at something.
  const HEAD_FALL = [
    '................',
    '.....oooooo.....',
    '...ooHhHHhHoo...',
    '..oHHhHHHHhHHo..',
    '..oHHHhHHhHHHo..',
    '..oHHSSSSSSHHo..',
    '..oHSSSSSSSSHo..',
    '..oHSeSSSSeSHo..',
    '...oSSSmmSSSo...',
    '....oSSSSSSo....',
    '......oSSo......',
  ];

  const frame = (head, arms, legs) => head.concat(arms, legs);

  // Arms are two pixels wide with an outline between them and the torso —
  // at this size a one-pixel arm just melts into the shirt.
  const ARMS_IDLE = [
    '..oCCCCCCCCCCo..', // 11  shoulders
    '.oCCoCCCCCCoCCo.', // 12
    '.oCCoCCCCCCoCCo.', // 13
    '.oSSoCCCCCCoSSo.', // 14  forearms
    '.oSSooCCCCooSSo.', // 15
  ];
  const ARMS_RUN_A = [
    '..oCCCCCCCCCCo..',
    'ooCCoCCCCCCoCCo.',
    'oSSCoCCCCCCoCCo.',
    'oSSooCCCCCCoSSo.',
    '..oooCCCCoooSSo.',
  ];
  const ARMS_RUN_B = [
    '..oCCCCCCCCCCo..',
    '.oCCoCCCCCCoCCoo',
    '.oCCoCCCCCCoCSSo',
    '.oSSoCCCCCCooSSo',
    '.oSSoooCCCCoooo.',
  ];
  const ARMS_STRAIN = [
    '..oCCCCCCCCCCo..',
    '.oCCoCCCCCCoCCo.',
    'oCCooCCCCCCooCCo',
    'oSSooCCCCCCooSSo',
    '.oo.ooCCCCoo.oo.',
  ];
  const ARMS_CHEER = [
    'oSSo.oCCCCo.oSSo', // 11  both arms straight up
    'oSSo.oCCCCo.oSSo',
    'oCCooCCCCCCooCCo',
    '.oCCCCCCCCCCCCo.',
    '..oCCCCCCCCCCo..',
  ];
  const ARMS_FALL = [
    '..oCCCCCCCCCCo..',
    '.oCCoCCCCCCoCCo.',
    '.oCCoCCCCCCoCCoo',
    '..ooCCCCCCooSSSo',
    '...oCCCCCCo.ooo.',
  ];

  const LEGS_STAND = [
    '...oPPPPPPPPo...', // 16  hips
    '...oPPPPPPPPo...', // 17
    '...oPPo..oPPo...', // 18
    '...oPPo..oPPo...', // 19
    '...oPPo..oPPo...', // 20
    '...oBBo..oBBo...', // 21  shoes
  ];
  const LEGS_RUN_A = [
    '...oPPPPPPPPo...',
    '...oPPPPPPPPo...',
    '..oPPo....oPPo..',
    '.oPPo......oPPo.',
    '.oPPo......oPPo.',
    'oBBo........oBBo',
  ];
  const LEGS_RUN_B = [
    '...oPPPPPPPPo...',
    '...oPPPPPPPPo...',
    '...oPPo..oPPo...',
    '..oPPo....oPPo..',
    '..oPPo....oPPo..',
    '.oBBo......oBBo.',
  ];
  const LEGS_STRAIN = [
    '...oPPPPPPPPo...',
    '...oPPPPPPPPo...',
    '..oPPo....oPPo..',
    '.oPPo......oPPo.',
    '.oPPo......oPPo.',
    'oBBo........oBBo',
  ];
  const LEGS_FALL = [
    '..oPPPPPPPPo....',
    '..oPPPPPPPPo....',
    '.oPPo..oPPo.....',
    'oPPo....oPPo....',
    'oPPo.....oPPo...',
    'BBo.......oBBo..',
  ];

  const FRAMES = {
    idle:    frame(HEAD, ARMS_IDLE, LEGS_STAND),
    runA:    frame(HEAD, ARMS_RUN_A, LEGS_RUN_A),
    runB:    frame(HEAD, ARMS_RUN_B, LEGS_RUN_B),
    strain:  frame(HEAD, ARMS_STRAIN, LEGS_STRAIN),
    stumble: frame(HEAD_FALL, ARMS_FALL, LEGS_FALL),
    cheer:   frame(HEAD, ARMS_CHEER, LEGS_STAND),
  };

  // Where gear sits. Hats hang off the top of the hair, held things off the
  // right hand, and both move per frame — a hat that stays put while the body
  // pitches forward is the tell that it was pasted on.
  const ANCHOR = {
    idle:    { head: [3, 0], face: [3, 6], hand: [12, 9] },
    runA:    { head: [3, 0], face: [3, 6], hand: [11, 9] },
    runB:    { head: [3, 0], face: [3, 6], hand: [12, 8] },
    strain:  { head: [3, 0], face: [3, 6], hand: [12, 10] },
    stumble: { head: [4, 1], face: [4, 7], hand: [12, 10] },
    cheer:   { head: [3, 0], face: [3, 6], hand: [12, 4] },
  };

  /* -------------------------------- render ------------------------------- */

  function frameSvg(name, gear, skin) {
    let rows = FRAMES[name];
    const a = ANCHOR[name];

    // Back and aura go under the body, so they're stamped before it — which
    // means drawing them onto a blank grid and layering two <g>s instead.
    // Capes and auras are drawn on the full canvas and painted first, so the
    // body lands on top of them.
    const under = [];
    ['back', 'aura'].forEach((slot) => {
      const g = gear[slot];
      if (g && g.px) under.push(Pixel.toSvg(g.px, { ...PALETTE, ...skin, ...g.pal }));
    });

    ['head', 'face', 'hand'].forEach((slot) => {
      const g = gear[slot];
      if (!g || !g.px) return;
      const at = a[slot];
      rows = Pixel.stamp(rows, g.px, at[0] + (g.dx || 0), at[1] + (g.dy || 0));
    });

    const pal = { ...PALETTE, ...skin };
    ['head', 'face', 'hand', 'back', 'aura'].forEach((slot) => {
      if (gear[slot] && gear[slot].pal) Object.assign(pal, gear[slot].pal);
    });

    return `<g class="px-frame px-${name}">${under.join('')}${Pixel.toSvg(rows, pal)}</g>`;
  }

  function markup(o) {
    const gear = o.gear || {};
    return `<svg class="px-svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">`
      + Object.keys(FRAMES).map((n) => frameSvg(n, gear, o.pal)).join('')
      + '</svg>';
  }

  function create(host, opts = {}) {
    // `pal` lets a rival be a different person rather than a recolour of you.
    const o = { ink: 'var(--p1)', gear: {}, pal: {}, ghost: false, ...opts };
    const el = document.createElement('span');
    el.className = `avatar pose-idle${o.ghost ? ' av-ghost' : ''}`;
    el.style.setProperty('--av-ink', o.ink);
    el.innerHTML = markup(o);
    host.innerHTML = '';
    host.appendChild(el);

    let base = 'idle';
    let timer = null;
    const apply = (name) => { el.className = el.className.replace(/pose-\w+/, `pose-${name}`); };

    return {
      el,
      pose(name) { base = name; clearTimeout(timer); timer = null; apply(name); },
      flash(name, ms = 800) {
        clearTimeout(timer);
        apply(name);
        timer = setTimeout(() => { timer = null; apply(base); }, ms);
      },
      behind(yes) { el.classList.toggle('behind', !!yes); },
      setGear(gear) {
        o.gear = gear || {};
        const live = (el.className.match(/pose-(\w+)/) || [])[1] || base;
        el.innerHTML = markup(o);
        apply(live);
      },
      setInk(ink) { o.ink = ink; el.style.setProperty('--av-ink', ink); },
    };
  }

  return { create, FRAMES, PALETTE, W, H };
})();
