/* lib/rival.js — the rival racer, shared by every game.
 *
 * Nothing in here knows what a question is. A game hands over callbacks for
 * drawing a topic and for how fast it answers them, and gets a race back — so
 * the same five rivals run in Numbers, Mapmaster, Chronicle, Reader and
 * Briefing without any of them knowing about the others.
 *
 * A rival is a simulated opponent running the same race on its own wall clock.
 * It is deliberately *not* random. Its pace is derived from your own recorded
 * times (`store.stats[topic].ms`), so every race is close by construction and
 * beating one actually means you got faster. A rival that rolled dice would be
 * either trivial or unfair, and both are boring.
 *
 * Each rival is a personality rather than a difficulty number:
 *
 *   flat        fixed ms per leg, ignoring your pace entirely (The Metronome)
 *   scale       multiplier on your median for the topic
 *   topicScale  per-topic multipliers — what makes The Professor a character
 *   error       chance a leg ends in a stumble instead of a finish
 *   stumble     ms lost when it does
 *   band        false to disable rubber-banding (Your Ghost must stay honest)
 *
 * A leg runs in two phases: it advances to the line over `legDur`, and if this
 * leg was rolled as a stumble it holds at 92% for `stumble` ms before crossing.
 * That hold is the whole point — it's the moment you claw a race back, and you
 * can see it happen rather than just noticing the gap changed.
 *
 * The module owns its own DOM updates so the game loop only has to call tick().
 *
 * Usage from the game:
 *   Rival.start({ rivalId, legs, difficultyId, drawTopic, baseMsFor, missRateFor })
 *   Rival.tick()            // every frame of the game ticker
 *   Rival.advanceYou()      // you completed a leg
 *   Rival.pause() / resume()
 *   Rival.result()          // { won, you, rival, margin, ... }
 */

window.Rival = (function () {
  'use strict';

  // Somebody with no history yet gets a sane guess instead of a broken race:
  // roughly the fraction of the question clock a comfortable answer takes.
  const FALLBACK_FRACTION = 0.45;
  const MIN_LEG_MS = 2200;
  const MAX_LEG_MS = 22000;
  const DEFAULT_MISS_RATE = 0.12;

  // These mirror the auto-advance delays in game.js, and they matter more than
  // they look. A leg is not your thinking time — it's your thinking time plus
  // the beat before the next question, and a miss costs the longer beat *and*
  // the leg itself. Pacing a rival off raw answer times alone makes it roughly
  // 20% faster than the player it was supposedly cloned from.
  const GAP_MS = 450;
  const WRONG_GAP_MS = 1400;

  // Your stored average is across every difficulty you've ever played, so a
  // rival racing you on Hard has to be given the same allowance you get.
  const DIFF_FACTOR = { easy: 0.82, normal: 1, hard: 1.32 };

  const RIVALS = [
    {
      id: 'metronome',
      sprite: 'metronome',
      facing: 's',
      pal: { H: '#5b5b5b', h: '#7a7a7a', S: '#cbb9a6', s: '#a8968a' },
      color: 'var(--rival-metronome)',
      gear: { head: { px: [
        '....MM....',
        '....oo....',
        '..oooooo..',
      ], pal: { M: '#d8d2c4' } } },
      name: 'The Metronome',
      icon: '⏱',
      blurb: 'Seven and a half seconds a question, forever, and never wrong. The only rival that ignores your history — a fixed bar, so on Hard it is genuinely brutal.',
      flat: 7500,
      jitter: 0.02,
      error: 0,
    },
    {
      id: 'kid',
      sprite: 'kid',
      facing: 's',
      pal: { H: '#b8471a', h: '#d4652c', S: '#e6c2a0', s: '#c39c78' },
      color: 'var(--rival-kid)',
      gear: { head: { px: [
        '.....MM...',
        '....MM....',
        '...MMMM...',
        '....MM....',
        '...MM.....',
      ], pal: { M: '#f4d64a' } } },
      name: 'Kid Lightning',
      icon: '⚡',
      blurb: 'Faster than you and knows it — but rushes one in four and then loses more time sulking than it ever gained. Wild swings, big comebacks.',
      scale: 0.8,
      jitter: 0.22,
      error: 0.26,
      stumbleScale: 1.3,
    },
    {
      id: 'professor',
      sprite: 'professor',
      facing: 's',
      pal: { H: '#b9b2a6', h: '#d4cec2', S: '#d6b492', s: '#b2906e' },
      color: 'var(--rival-professor)',
      gear: { head: { px: [
        'oooooooooo',
        'oMMMMMMMMo',
        '.oooooooo.',
        '......oNo.',
        '......oNo.',
      ], pal: { M: '#2b2b33', N: '#c9a227' } } },
      name: 'The Professor',
      icon: '🎓',
      blurb: 'Laborious at plain arithmetic, near-instant at anything with structure. Take your lead on × and ÷ before it takes it all back on √ and ( ).',
      scale: 1,
      topicScale: {
        add: 1.3, sub: 1.3, mul: 1.35, div: 1.35,
        pct: 1, frac: 0.95, pow: 0.5, ooo: 0.45,
      },
      jitter: 0.12,
      error: 0.08,
      stumbleScale: 0.9,
    },
    {
      id: 'bane',
      color: '#8e8880',
      sprite: 'bane',
      name: 'Bane',
      icon: '🛡',
      blurb: 'Slow, heavy and almost never wrong. He will not out-pace you — he just does not stop, and he does not make the mistake you are counting on.',
      scale: 1.18,
      jitter: 0.06,
      error: 0.03,
      stumbleScale: 1.1,
    },
    {
      id: 'ghost',
      color: 'var(--p1)',
      ghost: true,
      name: 'Your Ghost',
      icon: '👤',
      blurb: 'You, on an average day — your own pace and your own miss rate, topic by topic. No rubber-banding. Beating it means today was genuinely better.',
      scale: 1,
      jitter: 0.15,
      useOwnErrors: true,
      stumbleScale: 1,
      band: false,
    },
  ];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const byId = (id) => RIVALS.find((r) => r.id === id) || RIVALS[1];

  let s = null; // race state
  let els = null;

  /* ----------------------------- DOM ----------------------------- */

  function mount() {
    if (els) return;
    const $ = (id) => document.getElementById(id);
    els = {
      wrap: $('race'),
      name: $('race-rival-name'),
      icon: $('race-rival-icon'),
      gap: $('race-gap'),
      you: $('racer-you'),
      rival: $('racer-rival'),
      youLegs: $('race-you-legs'),
      rivalLegs: $('race-rival-legs'),
      note: $('race-note'),
    };
  }

  function place(el, pos) {
    if (el) el.style.left = `${clamp(pos / s.legs, 0, 1) * 100}%`;
  }

  function render() {
    if (!s || !els) return;
    place(els.you, s.you);
    place(els.rival, s.rivalPos);

    els.youLegs.textContent = `${Math.floor(s.you)}/${s.legs}`;
    els.rivalLegs.textContent = `${Math.floor(s.rivalPos)}/${s.legs}`;

    const gap = s.you - s.rivalPos;
    // A dead heat is neither good news nor bad, and colouring it red made the
    // most tense moment of a race read as if you were already losing.
    const level = Math.abs(gap) < 0.15;
    els.gap.textContent = level
      ? 'Neck and neck'
      : `${gap > 0 ? 'Leading' : 'Behind'} by ${Math.abs(gap).toFixed(1)}`;
    els.gap.className = `race-gap ${level ? 'level' : gap > 0 ? 'ahead' : 'behind'}`;
  }

  // A stumble is the comeback moment, so it gets said out loud.
  function flashNote(text, kind) {
    if (!els || !els.note) return;
    els.note.textContent = text;
    els.note.className = `race-note ${kind}`;
    els.note.classList.remove('show');
    void els.note.offsetWidth; // restart the animation
    els.note.classList.add('show');
  }

  /* --------------------------- pacing --------------------------- */

  // Your own mean answer time for a topic, or a guess off the question clock
  // if you've never been asked one.
  function baseFor(topic) {
    const own = s.baseMsFor(topic);
    return own > 0 ? own : s.difficultySeconds * 1000 * FALLBACK_FRACTION;
  }

  // What a fumble costs. Scaled off your own pace rather than fixed, so a
  // rival doesn't quietly get easier as you get faster — the whole race scales
  // with you or none of it does.
  function stumbleCost(topic) {
    if (!s.def.stumbleScale) return 0;
    return baseFor(topic) * s.def.stumbleScale + WRONG_GAP_MS;
  }

  // What one leg should cost this rival, given the topic it drew.
  function legDuration(topic) {
    const def = s.def;
    let ms;

    if (def.flat) {
      // A fixed bar is a fixed bar: no difficulty allowance, no inter-question
      // beat, just the stated interval.
      ms = def.flat;
    } else {
      const topicMult = (def.topicScale && def.topicScale[topic]) || 1;
      ms = baseFor(topic) * (def.scale || 1) * topicMult * (DIFF_FACTOR[s.difficultyId] || 1)
        + GAP_MS;
    }

    const jitter = 1 + (Math.random() * 2 - 1) * (def.jitter || 0.15);

    // Rubber-banding, kept mild and switchable. It exists so a race stays a
    // race rather than becoming a foregone conclusion by leg three — but Your
    // Ghost turns it off, because a ghost that speeds up isn't a ghost.
    let band = 1;
    if (def.band !== false) {
      band = clamp(1 - (s.you - s.rivalPos) * 0.06, 0.88, 1.14);
    }

    return clamp(ms * jitter * band, MIN_LEG_MS, MAX_LEG_MS);
  }

  function scheduleLeg(now) {
    const topic = s.drawTopic();
    const dur = legDuration(topic);
    const rate = s.def.useOwnErrors ? s.missRateFor(topic) : (s.def.error || 0);

    s.leg = {
      topic,
      startedAt: now,
      runUntil: now + dur,
      // Rolled up front so the hold can be rendered as part of the same leg
      // rather than appearing out of nowhere at the line.
      stumbles: Math.random() < rate && !!s.def.stumbleScale,
      held: false,
    };
    s.leg.endsAt = s.leg.runUntil + (s.leg.stumbles ? stumbleCost(topic) : 0);
  }

  /* ---------------------------- clock ---------------------------- */

  function start(opts) {
    mount();
    const def = byId(opts.rivalId);
    const now = Date.now();

    s = {
      def,
      legs: opts.legs,
      you: 0,
      rivalLegs: 0,
      rivalPos: 0,
      stumbleCount: 0,
      difficultyId: opts.difficultyId,
      difficultySeconds: opts.difficultySeconds,
      drawTopic: opts.drawTopic,
      baseMsFor: opts.baseMsFor,
      missRateFor: (t) => {
        const r = opts.missRateFor(t);
        return r === null ? DEFAULT_MISS_RATE : r;
      },
      startedAt: now,
      pausedAt: null,
      finishedBy: null,
      leg: null,
    };

    scheduleLeg(now);

    if (els.wrap) els.wrap.classList.remove('hidden');
    els.icon.textContent = def.icon;
    els.name.textContent = def.name;
    els.you.classList.remove('stumbling', 'won');
    els.rival.classList.remove('stumbling', 'won');

    // Both lanes are drawn figures, so a race reads as two runners rather than
    // a runner and a dot. Your Ghost borrows your own cosmetic — it is you.
    s.avatar = Avatar.create(els.rival, {
      // Your Ghost wears your clothes and your ink, because it is you.
      ink: def.ghost ? opts.playerInk : def.color,
      // A rival with its own sprite is already a character — the stand-in
      // headgear was only ever there to tell recolours of one figure apart.
      gear: def.ghost ? opts.playerGear : (def.sprite ? {} : def.gear),
      pal: def.pal,
      tint: def.sprite ? '' : (def.ghost ? '' : def.id),
      facing: def.facing || 'e',
      sprite: def.sprite || (def.ghost ? opts.playerSprite : 'runner'),
      ghost: !!def.ghost,
    });
    s.avatar.pose('run');

    if (els.note) { els.note.textContent = ''; els.note.className = 'race-note'; }
    render();
    return s;
  }

  function tick() {
    if (!s || s.pausedAt !== null || s.finishedBy) return;
    const now = Date.now();
    const leg = s.leg;

    if (now < leg.runUntil) {
      // Approaching the line. A leg it will fumble only ever gets to 92%, so
      // the stall reads as "almost had it" rather than as a frozen token.
      const top = leg.stumbles ? 0.92 : 1;
      s.rivalPos = s.rivalLegs + top * ((now - leg.startedAt) / (leg.runUntil - leg.startedAt));
    } else if (now < leg.endsAt) {
      s.rivalPos = s.rivalLegs + 0.92;
      if (!leg.held) {
        leg.held = true;
        s.stumbleCount += 1;
        els.rival.classList.add('stumbling');
        if (s.avatar) s.avatar.flash('stumble', s.def.stumbleScale ? 1400 : 800);
        flashNote(`${s.def.name} fumbled it — go!`, 'good');
      }
    } else {
      s.rivalLegs += 1;
      s.rivalPos = s.rivalLegs;
      els.rival.classList.remove('stumbling');
      if (s.avatar) s.avatar.pose('run');
      if (s.rivalLegs >= s.legs) {
        s.finishedBy = 'rival';
        els.rival.classList.add('won');
        if (s.avatar) s.avatar.flash('cheer', 4000);
      } else {
        scheduleLeg(now);
      }
    }

    render();
    return s.finishedBy;
  }

  // You only move on a correct answer. A wrong one costs you the whole leg,
  // which is what makes the rival's steady creep worth watching.
  function advanceYou() {
    if (!s || s.finishedBy) return null;
    s.you += 1;
    if (s.you >= s.legs) {
      s.finishedBy = 'you';
      els.you.classList.add('won');
    }
    render();
    return s.finishedBy;
  }

  function missedLeg() {
    if (!s || s.finishedBy) return;
    els.you.classList.add('stumbling');
    setTimeout(() => els.you && els.you.classList.remove('stumbling'), 600);
  }

  // The hint sheet already holds your question clock; it has to hold the
  // rival's too, or reading the method quietly costs you the race.
  function pause() {
    if (!s || s.pausedAt !== null) return;
    s.pausedAt = Date.now();
  }

  function resume() {
    if (!s || s.pausedAt === null) return;
    const held = Date.now() - s.pausedAt;
    s.leg.startedAt += held;
    s.leg.runUntil += held;
    s.leg.endsAt += held;
    s.pausedAt = null;
  }

  function stop() {
    if (els && els.wrap) els.wrap.classList.add('hidden');
    s = null;
  }

  function result() {
    if (!s) return null;
    const margin = s.you - s.rivalPos;
    return {
      won: s.finishedBy === 'you',
      finishedBy: s.finishedBy,
      rival: s.def,
      you: Math.floor(s.you),
      rivalLegs: Math.floor(s.rivalPos),
      legs: s.legs,
      margin,
      // Under half a leg either way is close enough that it was decided in the
      // last few seconds — worth saying so on the results screen.
      photoFinish: Math.abs(margin) < 0.5,
      stumbles: s.stumbleCount,
      elapsedMs: Date.now() - s.startedAt,
    };
  }

  return {
    list: () => RIVALS.map((r) => ({ id: r.id, label: r.name, icon: r.icon, blurb: r.blurb })),
    find: byId,
    start,
    tick,
    advanceYou,
    missedLeg,
    pause,
    resume,
    stop,
    result,
    active: () => !!s,
    gap: () => (s ? s.you - s.rivalPos : 0),
  };
})();
