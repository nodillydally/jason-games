/* lib/juice.js — the feedback layer, shared by every game.
 *
 * None of this changes what the games *do*. It changes how it feels to do it:
 * a tap answers back, a right answer is acknowledged, a milestone is marked.
 *
 * The tuning is deliberately restrained to match the paper design. Feedback is
 * ranked, and only the top of the ladder gets a flourish:
 *
 *   every answer   → a mono "+120" that lifts and fades, a soft tick, a haptic
 *   streak of 3/5+ → the counter flares, the number is called out
 *   milestone      → confetti in the brand's four inks, and a toast
 *
 * Confetti on every correct answer is what made the first pass feel like a
 * slot machine; here it is reserved for the moments that are actually rare.
 * Sound is off until asked for, and everything decorative is skipped under
 * prefers-reduced-motion.
 *
 * Usage from a game:
 *   Juice.good({ points: 120, anchor: btn, streak: 4 })
 *   Juice.bad({ anchor: btn })
 *   Juice.streak(5, el)
 *   Juice.levelUp(7)
 *   Juice.celebrate(el)
 */

window.Juice = (function () {
  'use strict';

  const SOUND_KEY = 'games.sound.v1';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------ mount ------------------------------ */

  let canvas, ctx, soundBtn;
  let particles = [];
  let raf = null;
  let dpr = 1;

  function mount() {
    if (canvas || !document.body) return;

    const grain = document.createElement('div');
    grain.className = 'fx-grain';
    document.body.appendChild(grain);

    canvas = document.createElement('canvas');
    canvas.id = 'fx-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    soundBtn = document.createElement('button');
    soundBtn.className = 'fx-sound';
    soundBtn.type = 'button';
    soundBtn.title = 'Sound on/off';
    soundBtn.addEventListener('click', toggleSound);
    document.body.appendChild(soundBtn);
    paintSoundBtn();

    // A ripple under every press, anywhere in the app.
    document.addEventListener('pointerdown', onPress, { passive: true });
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ------------------------------ sound ------------------------------ */
  /* Tiny synthesised blips — no files to load, and they can be pitched off the
     streak so a run audibly ascends. Off by default: a game that starts making
     noise in a quiet room is a game that gets closed. */

  let audio = null;

  function soundOn() {
    try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; }
  }

  function paintSoundBtn() {
    if (!soundBtn) return;
    const on = soundOn();
    soundBtn.textContent = '♪';
    // The state is a struck-through note, not a dimmer button: fading the
    // control to show it is off made it impossible to find in the first place.
    soundBtn.classList.toggle('muted', !on);
    soundBtn.title = on ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
  }

  function toggleSound() {
    try { localStorage.setItem(SOUND_KEY, soundOn() ? 'off' : 'on'); } catch { /* private mode */ }
    paintSoundBtn();
    if (soundOn()) {
      tone({ freq: 660, dur: 0.09, type: 'triangle', gain: 0.04 });
      preload();   // warm the samples now, so the first milestone isn't the one that misses
    }
  }

  function ac() {
    if (!soundOn()) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audio) audio = new Ctx();
    // Rejects until the browser has seen a gesture; that's expected, not an error.
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }

  function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.05, slide = 0, delay = 0 }) {
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function chord(freqs, opts = {}) {
    freqs.forEach((f, i) => tone({ freq: f, delay: i * (opts.stagger ?? 0.06), ...opts }));
  }

  /* ------------------------------ samples ------------------------------ */
  /* Synthesis handles the per-answer ticks: it costs nothing, has no latency,
     and its pitch can climb with the streak, which a fixed sample can't do.
     The rare moments are where a real recording earns its keep — an oscillator
     chord never sounds like a chime. So: three CC0 samples, milestones only.
     See lib/sfx/CREDITS.txt. Every call falls back to the synth if the file
     hasn't loaded, failed, or the browser refuses to decode it. */

  const SAMPLES = { level: 'level.mp3', win: 'win.mp3', streak: 'streak.mp3' };

  // juice.js is loaded as lib/juice.js from the hub and ../../lib/juice.js from
  // a game, so the folder has to be derived from this script's own URL.
  const SFX_BASE = (() => {
    const src = document.currentScript && document.currentScript.src;
    return src ? src.replace(/juice\.js(\?.*)?$/, 'sfx/') : 'lib/sfx/';
  })();

  const buffers = new Map();   // name -> AudioBuffer, or null once known bad
  const loading = new Set();

  function loadSample(name) {
    const a = ac();
    if (!a || buffers.has(name) || loading.has(name)) return;
    loading.add(name);
    fetch(SFX_BASE + SAMPLES[name])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((buf) => a.decodeAudioData(buf))
      .then((decoded) => { buffers.set(name, decoded); })
      .catch(() => { buffers.set(name, null); })   // remember the failure; synth takes over
      .finally(() => loading.delete(name));
  }

  // Nothing is fetched while the app is muted — ac() returns null, so a player
  // who never turns sound on never pays for the files.
  function preload() {
    if (!soundOn()) return;
    Object.keys(SAMPLES).forEach(loadSample);
  }

  function play(name, gain = 0.55) {
    const a = ac();
    if (!a) return false;
    const buf = buffers.get(name);
    if (!buf) { loadSample(name); return false; }   // first time falls back, then it's warm
    const src = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g).connect(a.destination);
    src.start();
    return true;
  }

  /* ----------------------------- haptics ----------------------------- */

  function buzz(pattern) {
    try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* unsupported */ }
  }

  /* ------------------------------ ripple ------------------------------ */

  function onPress(e) {
    const btn = e.target.closest && e.target.closest('button, .book-item, .game');
    if (!btn || btn.disabled) return;

    // A real gesture, so the AudioContext can start: cheap no-op once warm.
    preload();
    buzz(5);
    if (!reduced) {
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = ((e.clientX || r.left + r.width / 2) - r.left) + 'px';
      span.style.top = ((e.clientY || r.top + r.height / 2) - r.top) + 'px';
      btn.appendChild(span);
      setTimeout(() => span.remove(), 560);
    }
  }

  /* ---------------------------- particles ---------------------------- */
  /* The brand's four inks plus paper — confetti that looks like torn card
     stock rather than a casino. */

  const PALETTE = ['#233142', '#E8A82C', '#3E5E3A', '#C76A5E', '#6B8CAF', '#FDF9F0'];

  function spawn(x, y, count, opts = {}) {
    if (reduced) return;
    mount();
    const spread = opts.spread ?? Math.PI * 2;
    const aim = opts.aim ?? -Math.PI / 2;
    const colors = opts.colors || PALETTE;
    for (let i = 0; i < count; i++) {
      const a = aim + (Math.random() - 0.5) * spread;
      const speed = (opts.speed ?? 6) * (0.45 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        g: opts.gravity ?? 0.22,
        life: 1,
        decay: 0.008 + Math.random() * 0.010,
        size: (opts.size ?? 6) * (0.5 + Math.random()),
        spin: (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI,
        color: colors[(Math.random() * colors.length) | 0],
        square: Math.random() > 0.25,
      });
    }
    if (particles.length > 500) particles = particles.slice(-500);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > innerHeight + 60) { particles.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.square) {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    raf = particles.length ? requestAnimationFrame(tick) : null;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  function centerOf(el) {
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: innerWidth / 2, y: innerHeight * 0.42 };
  }

  /* --------------------------- screen effects --------------------------- */

  /* Kept as no-ops so the games can keep calling them: a full-screen colour
     wash and a screen shake both read as a fault on paper, not as feedback. */
  function flash() {}
  function shakeScreen() {}

  function float(text, anchor, kind) {
    if (reduced) return;
    const { x, y } = centerOf(anchor);
    const el = document.createElement('div');
    el.className = 'float-points' + (kind ? ' ' + kind : '');
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  let toastEl = null;
  function toast(text) {
    mount();
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.id = 'fx-toast';
    toastEl.textContent = text;
    document.body.appendChild(toastEl);
    const mine = toastEl;
    setTimeout(() => { if (mine === toastEl) { mine.remove(); toastEl = null; } }, 2700);
  }

  function replay(el, cls) {
    if (!el || reduced) return;
    el.classList.remove(cls);
    void el.offsetWidth;   // force reflow so the animation restarts
    el.classList.add(cls);
  }

  /* ---------------------------- count-up ---------------------------- */

  function countUp(el, from, to, format) {
    if (!el) return;
    const fmt = format || ((n) => n.toLocaleString());
    if (reduced || from === to) { el.textContent = fmt(to); return; }
    const start = performance.now();
    const dur = Math.min(900, 220 + Math.abs(to - from) * 2);
    (function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  /* --------------------------- composites --------------------------- */

  function good({ points = 0, anchor = null, streak = 0 } = {}) {
    mount();
    if (points) float('+' + points, anchor, '');
    buzz(10);
    // Pitch climbs with the streak, so a run audibly ascends.
    tone({ freq: 620 + Math.min(streak, 10) * 38, dur: 0.07, type: 'triangle', gain: 0.045 });
  }

  function bad({ anchor = null } = {}) {
    mount();
    buzz([16, 30, 16]);
    tone({ freq: 240, dur: 0.13, type: 'sine', gain: 0.04, slide: -70 });
  }

  function streakHit(n, el) {
    if (n < 3) return;
    replay(el, 'flare');
    // Only the milestones get a callout — a banner on every single answer
    // stops meaning anything by the fourth one.
    if (n !== 3 && n % 5 !== 0) return;
    float(`${n} in a row`, el, 'accent');
    if (n % 5 === 0) {
      const { x, y } = centerOf(el);
      spawn(x, y, 22, { spread: Math.PI * 1.6, speed: 6, colors: ['#E8A82C', '#C68917', '#233142'] });
      buzz([14, 22, 14]);
      if (!play('streak', 0.45)) chord([660, 880], { dur: 0.14, type: 'triangle', gain: 0.04, stagger: 0.05 });
    }
  }

  function levelUp(level) {
    mount();
    toast(`Level ${level}`);
    spawn(innerWidth / 2, innerHeight * 0.34, 46, { spread: Math.PI * 2, speed: 8, size: 7 });
    buzz([18, 34, 18, 34]);
    if (!play('level')) chord([523, 659, 784], { dur: 0.24, type: 'triangle', gain: 0.045, stagger: 0.08 });
  }

  function celebrate(anchor) {
    mount();
    const { x, y } = centerOf(anchor);
    spawn(x, y, 44, { spread: Math.PI * 2, speed: 7, size: 7 });
    buzz([16, 32, 16]);
    if (!play('win')) chord([523, 659, 784, 1046], { dur: 0.26, type: 'triangle', gain: 0.04, stagger: 0.075 });
  }

  /* ------------------------------ boot ------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  return {
    mount, spawn, flash, float, toast, replay, shakeScreen, countUp,
    buzz, tone, chord, play, preload, good, bad, streak: streakHit, levelUp, celebrate,
    reduced,
    get soundOn() { return soundOn(); },
  };
})();
