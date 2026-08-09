/* lib/juice.js — the feedback layer, shared by every game.
 *
 * None of this changes what the games *do*. It changes how it feels to do it:
 * a tap answers back, a right answer costs the screen a burst of confetti, a
 * streak sets the counter on fire, a level-up takes over the top of the page.
 * That loop is the whole point of the games existing — the drills only get run
 * if showing up feels good.
 *
 * Everything here is opt-out safe:
 *   - prefers-reduced-motion kills particles, shakes and floats.
 *   - Sound is a single toggle stored in localStorage, off with one tap.
 *   - Nothing throws if the browser is missing WebAudio or Vibration.
 *
 * Usage from a game:
 *   Juice.good({ points: 120, anchor: btn })   // correct answer
 *   Juice.bad({ anchor: btn })                 // wrong answer
 *   Juice.streak(5, el)                        // streak milestone
 *   Juice.levelUp(7)                           // level milestone
 *   Juice.celebrate(el)                        // results screen
 */

window.Juice = (function () {
  'use strict';

  const SOUND_KEY = 'games.sound.v1';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------ mount ------------------------------ */

  let canvas, ctx, flashEl, soundBtn;
  let particles = [];
  let raf = null;
  let dpr = 1;

  function mount() {
    if (canvas || !document.body) return;

    for (const cls of ['fx-grain', 'fx-vignette']) {
      const d = document.createElement('div');
      d.className = cls;
      document.body.appendChild(d);
    }

    canvas = document.createElement('canvas');
    canvas.id = 'fx-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    flashEl = document.createElement('div');
    flashEl.id = 'fx-flash';
    document.body.appendChild(flashEl);

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
  /* Tiny synthesised blips — no audio files to load, no cache to bust, and
     they can be pitched off the streak so a run *sounds* like it's climbing. */

  let audio = null;

  function soundOn() {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  }

  function paintSoundBtn() {
    if (!soundBtn) return;
    const on = soundOn();
    soundBtn.textContent = on ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
    soundBtn.style.opacity = on ? '' : '.35';
  }

  function toggleSound() {
    try { localStorage.setItem(SOUND_KEY, soundOn() ? 'off' : 'on'); } catch { /* private mode */ }
    paintSoundBtn();
    if (soundOn()) tone({ freq: 660, dur: 0.09, type: 'triangle', gain: 0.05 });
  }

  function ac() {
    if (!soundOn()) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.07, slide = 0, delay = 0 }) {
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

  /* ----------------------------- haptics ----------------------------- */

  function buzz(pattern) {
    try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* unsupported */ }
  }

  /* ------------------------------ ripple ------------------------------ */

  function onPress(e) {
    const btn = e.target.closest && e.target.closest('button, .book-item, .game-card');
    if (!btn || btn.disabled) return;

    buzz(6);
    if (!reduced) {
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = ((e.clientX || r.left + r.width / 2) - r.left) + 'px';
      span.style.top = ((e.clientY || r.top + r.height / 2) - r.top) + 'px';
      btn.appendChild(span);
      setTimeout(() => span.remove(), 600);
    }
    tone({ freq: 300, dur: 0.045, type: 'sine', gain: 0.028 });
  }

  /* ---------------------------- particles ---------------------------- */

  const PALETTE = ['#ffc53d', '#ff6b9d', '#5b8cff', '#a855f7', '#22e39a', '#ffffff'];

  function spawn(x, y, count, opts = {}) {
    if (reduced) return;
    mount();
    const spread = opts.spread ?? Math.PI * 2;
    const aim = opts.aim ?? -Math.PI / 2;
    const colors = opts.colors || PALETTE;
    for (let i = 0; i < count; i++) {
      const a = aim + (Math.random() - 0.5) * spread;
      const speed = (opts.speed ?? 7) * (0.45 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        g: opts.gravity ?? 0.28,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        size: (opts.size ?? 7) * (0.5 + Math.random()),
        spin: (Math.random() - 0.5) * 0.4,
        rot: Math.random() * Math.PI,
        color: colors[(Math.random() * colors.length) | 0],
        square: Math.random() > 0.35,
      });
    }
    if (particles.length > 700) particles = particles.slice(-700);
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
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
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

  function flash(color) {
    if (reduced || !flashEl) return;
    flashEl.style.background =
      `radial-gradient(90% 60% at 50% 50%, ${color}, transparent 75%)`;
    flashEl.classList.remove('on');
    void flashEl.offsetWidth;
    flashEl.classList.add('on');
  }

  function float(text, anchor, kind) {
    if (reduced) return;
    const { x, y } = centerOf(anchor);
    const el = document.createElement('div');
    el.className = 'float-points' + (kind ? ' ' + kind : '');
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
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

  function shakeScreen() {
    if (reduced) return;
    const app = document.getElementById('app') || document.body;
    app.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-9px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 320, easing: 'ease-out' }
    );
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
  /* The four moments the games actually care about. */

  function good({ points = 0, anchor = null, streak = 0 } = {}) {
    mount();
    const { x, y } = centerOf(anchor);
    spawn(x, y, 26 + Math.min(streak, 8) * 3, { spread: Math.PI * 1.5, speed: 8 });
    flash('rgba(34,227,154,.34)');
    if (points) float('+' + points, anchor, '');
    buzz([12, 30, 16]);
    // Pitch climbs with the streak, so a run audibly ascends.
    const base = 620 + Math.min(streak, 10) * 42;
    tone({ freq: base, dur: 0.1, type: 'triangle', gain: 0.06 });
    tone({ freq: base * 1.5, dur: 0.13, type: 'triangle', gain: 0.05, delay: 0.07 });
  }

  function bad({ anchor = null } = {}) {
    mount();
    flash('rgba(255,77,109,.32)');
    shakeScreen();
    buzz([28, 40, 28]);
    tone({ freq: 220, dur: 0.16, type: 'sawtooth', gain: 0.05, slide: -90 });
    if (anchor) replay(anchor, 'wrong');
  }

  function streakHit(n, el) {
    if (n < 3) return;
    replay(el, 'flare');
    // Only the milestones get a callout — a banner on every single answer
    // stops meaning anything by the fourth one.
    if (n !== 3 && n % 5 !== 0) return;
    const label = n >= 10 ? `🔥🔥 ${n} STREAK` : `🔥 ${n} streak`;
    float(label, el, 'accent');
    if (n % 5 === 0) {
      const { x, y } = centerOf(el);
      spawn(x, y, 40, { spread: Math.PI * 2, speed: 9, colors: ['#ffc53d', '#ff6b9d', '#ff8a3d'] });
      buzz([16, 24, 16, 24, 30]);
      chord([660, 880, 1180], { dur: 0.16, type: 'triangle', gain: 0.05, stagger: 0.05 });
    }
  }

  function levelUp(level) {
    mount();
    toast(`⬆ Level ${level}!`);
    flash('rgba(255,197,61,.3)');
    // Two upward jets from the bottom corners, meeting in the middle.
    spawn(innerWidth * 0.12, innerHeight, 60, { aim: -Math.PI / 2.4, spread: 0.7, speed: 20, gravity: 0.34, size: 9 });
    spawn(innerWidth * 0.88, innerHeight, 60, { aim: -Math.PI / 1.7, spread: 0.7, speed: 20, gravity: 0.34, size: 9 });
    buzz([20, 40, 20, 40, 60]);
    chord([523, 659, 784, 1046], { dur: 0.28, type: 'triangle', gain: 0.06, stagger: 0.09 });
  }

  function celebrate(anchor) {
    mount();
    const { x, y } = centerOf(anchor);
    spawn(x, y, 80, { spread: Math.PI * 2, speed: 12, size: 9 });
    setTimeout(() => spawn(innerWidth * 0.2, innerHeight * 0.3, 40, { spread: Math.PI * 2, speed: 10 }), 180);
    setTimeout(() => spawn(innerWidth * 0.8, innerHeight * 0.3, 40, { spread: Math.PI * 2, speed: 10 }), 340);
    buzz([18, 40, 18, 40, 18]);
    chord([523, 659, 784, 1046, 1318], { dur: 0.3, type: 'triangle', gain: 0.055, stagger: 0.08 });
  }

  /* ------------------------------ boot ------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  return {
    mount, spawn, flash, float, toast, replay, shakeScreen, countUp,
    buzz, tone, chord, good, bad, streak: streakHit, levelUp, celebrate,
    reduced,
    get soundOn() { return soundOn(); },
  };
})();
