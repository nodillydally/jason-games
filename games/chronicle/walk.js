/* walk.js — The Long Walk: one era, on foot.
 *
 * A prototype, and deliberately a small one. The question it exists to answer
 * is "does walking a timeline feel like anything" — so there is no quiz, no
 * score, no fail state. You walk east, monuments stand at their year, and the
 * year readout ticks up as you go.
 *
 * The one idea underneath it: X *is* the year. Not a metaphor for the year, not
 * a progress bar — one axis, one linear mapping, 34 pixels per year. Which
 * means the 45 years between Copernicus and the Armada is 1,530px of empty road
 * you have to actually cross, and the four events packed into 1600–1618 arrive
 * almost on top of each other. Density is the argument. A list can tell you the
 * clock speeds up; only distance can make you feel it.
 *
 * Scope kept honest: one era, because if the walk isn't fun for 250 years it
 * won't be fun for five thousand. Everything here is DOM and CSS transforms —
 * no canvas, no build step, same rules as the rest of the repo.
 */
'use strict';

const ERA_ID = 'discovery';
const PX_PER_YEAR = 34;
const SPEED = 320;            // px/sec — about nine years a second
const NEAR = 78;              // how close counts as standing at a monument
const MILEPOST_EVERY = 25;    // years
const ANCHOR = 0.34;          // where the walker sits across the viewport

// The main game's profile, so a monument you walk past pins on the same strip
// studying fills. Written back field-by-field rather than wholesale — this page
// only ever owns `pinned`.
const STORE_KEY = 'chronicle.profile.v1';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// The era
// ---------------------------------------------------------------------------

const era = ERAS.find((e) => e.id === ERA_ID);
const events = EVENTS.filter((e) => e.era === ERA_ID).sort((a, b) => a.y - b.y);
const SPAN = era.to - era.from;
const WORLD_W = SPAN * PX_PER_YEAR;

const xOf = (year) => (year - era.from) * PX_PER_YEAR;
const yearAt = (x) => Math.round(era.from + x / PX_PER_YEAR);

// A monument per event. Emoji because the whole repo draws with type rather
// than assets, and because a recognisable silhouette does more work here than
// accurate architecture would.
const MONUMENT = {
  constantinople: '🕌',
  columbus: '⛵',
  gama: '🧭',
  luther: '📜',
  cortes: '🌎',
  copernicus: '☀️',
  armada: '⚓',
  eic: '🏦',
  jamestown: '🏘️',
  galileo: '🔭',
  'thirty-years': '⚔️',
  qing: '🏯',
  principia: '🍎',
  glorious: '⚖️',
};

// Varying the plinth height stops fourteen monuments reading as one fence.
// Indexed rather than random so the skyline is the same walk every time. They
// all clear the walker's head — a person should read as small against these.
const HEIGHTS = [168, 232, 190, 258, 205, 152, 240, 178];

// ---------------------------------------------------------------------------
// Persistence — only the pinned map
// ---------------------------------------------------------------------------

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch (err) { return {}; }
}

// Re-read immediately before writing so this page can never roll back a stat
// the main game recorded in another tab.
function pin(id) {
  const s = readStore();
  s.pinned = s.pinned || {};
  if (s.pinned[id]) return false;
  s.pinned[id] = true;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (err) { /* full or private */ }
  return true;
}

const alreadyPinned = readStore().pinned || {};

// ---------------------------------------------------------------------------
// Build the world
// ---------------------------------------------------------------------------

const world = $('world');
const nodes = new Map();   // event id -> element

function buildWorld() {
  world.style.width = `${WORLD_W}px`;
  const parts = [];

  // Mileposts first, so they sit behind the monuments.
  for (let y = era.from; y <= era.to; y += MILEPOST_EVERY) {
    parts.push(`<div class="milepost" style="left:${xOf(y)}px"><i></i><span>${y}</span></div>`);
  }

  events.forEach((ev, i) => {
    parts.push(
      `<div class="mon" id="mon-${esc(ev.id)}" style="left:${xOf(ev.y)}px;--h:${HEIGHTS[i % HEIGHTS.length]}px">`
        + `<span class="mon-glyph">${MONUMENT[ev.id] || '⚑'}</span>`
        + '<span class="mon-post"></span>'
        + `<span class="mon-plate">${esc(String(ev.y))}</span>`
      + '</div>'
    );
  });

  // The far end: the era stops, and so does the prototype.
  parts.push(
    `<div class="gate" style="left:${WORLD_W}px">`
      + '<span class="gate-arch">⛩</span>'
      + `<span class="gate-year">${era.to}</span>`
      + '<span class="gate-label">Age of Revolutions</span>'
      + '<span class="gate-note">The road stops here — prototype</span>'
    + '</div>'
  );

  world.innerHTML = parts.join('');
  events.forEach((ev) => nodes.set(ev.id, $(`mon-${ev.id}`)));

  // Anything already on your timeline — walked past before, or studied in the
  // main game — stands lit. It is *not* counted as found: the HUD counts this
  // walk, so the road always has something to do even on a second crossing.
  events.forEach((ev) => {
    if (alreadyPinned[ev.id]) nodes.get(ev.id).classList.add('found');
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const found = new Set();
let x = 0;                 // player position in world px
let facing = 1;
let atEvent = null;
let last = 0;
const keys = { left: false, right: false };

const avatar = Avatar.create($('player'), { ink: '#D08A45' });
let curPose = 'idle';
avatar.pose('idle');

// pose() rewrites the class, and doing that every frame restarts the run
// cycle's keyframes — the legs would never actually alternate.
function setPose(name) {
  if (name === curPose) return;
  curPose = name;
  avatar.pose(name);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function bindKeys() {
  const map = (k) => {
    const key = k.toLowerCase();
    if (key === 'arrowleft' || key === 'a') return 'left';
    if (key === 'arrowright' || key === 'd') return 'right';
    return null;
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { location.href = 'index.html'; return; }
    const dir = map(e.key);
    if (dir) { keys[dir] = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    const dir = map(e.key);
    if (dir) { keys[dir] = false; e.preventDefault(); }
  });
  // A key held while the tab loses focus would otherwise walk forever.
  addEventListener('blur', () => { keys.left = false; keys.right = false; });
}

function bindPads() {
  const hold = (el, dir) => {
    const down = (e) => { e.preventDefault(); keys[dir] = true; };
    const up = () => { keys[dir] = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  };
  hold($('pad-left'), 'left');
  hold($('pad-right'), 'right');
}

// ---------------------------------------------------------------------------
// The plaque
// ---------------------------------------------------------------------------

function showPlaque(ev) {
  $('plaque-year').textContent = ev.y;
  $('plaque-name').textContent = ev.name;
  $('plaque-why').textContent = ev.why;
  $('plaque').classList.remove('hidden');
}

function hidePlaque() { $('plaque').classList.add('hidden'); }

function arriveAt(ev) {
  atEvent = ev.id;
  showPlaque(ev);
  const el = nodes.get(ev.id);
  el.classList.add('near');
  if (!found.has(ev.id)) {
    found.add(ev.id);
    el.classList.add('found', 'just-found');
    pin(ev.id);
    updateFound();
  }
}

function leaveEvent() {
  if (atEvent) nodes.get(atEvent).classList.remove('near');
  atEvent = null;
  hidePlaque();
}

function updateFound() {
  $('found').textContent = found.size;
  if (found.size === events.length) {
    $('hint').innerHTML = '<b>All fourteen.</b> The gate at 1700 is the end of the era — and of the prototype.';
    $('hint').classList.add('show');
  }
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

function nearest() {
  let best = null;
  let bestD = Infinity;
  for (const ev of events) {
    const d = Math.abs(xOf(ev.y) - x);
    if (d < bestD) { bestD = d; best = ev; }
  }
  return bestD <= NEAR ? best : null;
}

function render() {
  const anchorPx = innerWidth * ANCHOR;
  const shift = anchorPx - x;

  world.style.transform = `translate3d(${shift}px,0,0)`;
  // Parallax: the far layer barely moves, which is what makes the near ground
  // read as speed rather than as a sliding background.
  $('far').style.transform = `translate3d(${shift * 0.18}px,0,0)`;
  $('mid').style.transform = `translate3d(${shift * 0.48}px,0,0)`;
  $('ground').style.backgroundPositionX = `${shift}px`;

  $('player').style.transform = `translateX(-50%) scaleX(${facing})`;
  $('player').style.left = `${anchorPx}px`;

  $('year').textContent = yearAt(x);
  const pct = (x / WORLD_W) * 100;
  $('track-fill').style.width = `${pct}%`;
  $('track-you').style.left = `${pct}%`;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;

  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (dir) {
    facing = dir;
    x = clamp(x + dir * SPEED * dt, 0, WORLD_W);
    setPose('run');
    $('hint').classList.remove('show');
  } else {
    setPose('idle');
  }

  // Standing beside something is what opens it — walking through at speed only
  // brushes it. Both are handled by the same proximity test; the difference is
  // that the plaque stays up while you are stopped.
  const near = nearest();
  if (near && near.id !== atEvent) { leaveEvent(); arriveAt(near); }
  else if (!near && atEvent) leaveEvent();

  render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

$('era-name').textContent = `${era.name} · ${era.from}–${era.to}`;
$('total').textContent = events.length;
buildWorld();
updateFound();
bindKeys();
bindPads();
addEventListener('resize', render);
setTimeout(() => $('hint').classList.add('show'), 400);
requestAnimationFrame((t) => { last = t; frame(t); });
