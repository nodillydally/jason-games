/* questions.js — question generation for Numbers.
 *
 * Design rule: every answer is a whole number. That keeps typed answers
 * unambiguous (no "is 0.333 close enough?"), makes wrong-answer options easy to
 * generate, and matches how mental arithmetic is actually practised.
 *
 * Difficulty is CONTINUOUS: every generator takes a scalar `t` (0 = where a
 * beginner starts, ~1 = the old "normal", ~2 = the old "hard", and it keeps
 * going — operand sizes grow geometrically with t, so there is always a harder
 * question). The Elo system in game.js maps a topic rating to t and serves
 * questions near it; nothing here caps out.
 *
 * Each generator returns { text, answer, why, traps }. `why` is shown when you
 * get it wrong — the shortcut you should have used, not just the right number.
 * `traps` are wrong answers a person actually produces (wrong operator
 * precedence, percentage inverted), which make far better multiple-choice
 * options than random noise.
 */

const TOPICS = [
  { id: 'add',  label: 'Addition',       icon: '+' },
  { id: 'sub',  label: 'Subtraction',    icon: '−' },
  { id: 'mul',  label: 'Multiplication', icon: '×' },
  { id: 'div',  label: 'Division',       icon: '÷' },
  { id: 'pct',  label: 'Percentages',    icon: '%' },
  { id: 'frac', label: 'Fractions',      icon: '½' },
  { id: 'pow',  label: 'Powers & roots', icon: '√' },
  { id: 'ooo',  label: 'Order of ops',   icon: '( )' },
];

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Geometric growth off t: gr(0) = base, and each whole step of t multiplies
// by `perT`. This is what makes difficulty unbounded but smooth.
const gr = (t, base, perT) => Math.max(2, Math.round(base * Math.pow(perT, t)));

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((d) => SUPERSCRIPT[d] ?? d).join('');

const GENERATORS = {
  add(t) {
    const hi = gr(t, 95, 3.2);                 // t0 ~99, t1 ~300, t2 ~970, t3 ~3100
    const a = rnd(Math.round(hi / 3), hi);
    const b = rnd(Math.round(hi / 8), Math.round(hi / 1.5));
    // Rounding one side to a clean number and correcting is the shortcut worth
    // building, so the explanation always shows that route.
    const roundB = Math.round(b / 10) * 10;
    const diff = roundB - b;
    return {
      text: `${a} + ${b}`,
      answer: a + b,
      why: `${a} + ${roundB} = ${a + roundB}, then ${diff >= 0 ? 'subtract' : 'add'} ${Math.abs(diff)}.`,
      traps: [],
    };
  },

  sub(t) {
    const hi = gr(t, 99, 3.4);                 // t0 ~99, t2 ~1140, t3 ~3900
    const a = rnd(Math.round(hi * 0.45), hi);
    const b = rnd(Math.max(11, Math.round(hi * 0.08)), Math.round(hi * 0.35));
    const roundB = Math.round(b / 10) * 10;
    const diff = roundB - b;
    return {
      text: `${a} − ${b}`,
      answer: a - b,
      why: `${a} − ${roundB} = ${a - roundB}, then ${diff >= 0 ? 'add back' : 'subtract'} ${Math.abs(diff)}.`,
      traps: [],
    };
  },

  mul(t) {
    const a = rnd(3, gr(t, 9, 1.55));          // t0 3-9, t2 3-22, t3 3-33
    const b = rnd(11, gr(t, 19, 2.6));         // t0 11-19, t2 11-128, t3 11-334
    // Splitting the larger operand into tens and units is the general method.
    const tens = Math.floor(b / 10) * 10;
    const units = b - tens;
    return {
      text: `${a} × ${b}`,
      answer: a * b,
      why: `Split it: ${a}×${tens} = ${a * tens}, ${a}×${units} = ${a * units}, add them.`,
      traps: [],
    };
  },

  div(t) {
    const divisor = rnd(2, gr(t, 9, 1.5));     // t0 2-9, t2 2-20, t3 2-30
    const quotient = rnd(3, gr(t, 12, 1.9));   // t0 3-12, t2 3-43, t3 3-82
    const dividend = divisor * quotient;
    return {
      text: `${dividend} ÷ ${divisor}`,
      answer: quotient,
      why: `${divisor} × ${quotient} = ${dividend}.`,
      // Off-by-one on the quotient is the classic slip.
      traps: [quotient + 1, quotient - 1],
    };
  },

  pct(t) {
    // The percent pool widens with t; the base grows. Multiples of 5 on a base
    // that's a multiple of 20 guarantee whole-number answers at any size.
    const p = t < 0.7 ? pick([10, 20, 25, 50])
      : t < 1.5 ? pick([5, 15, 30, 40, 60, 75])
      : t < 2.3 ? pick([35, 45, 65, 85, 95])
      : rnd(1, 19) * 5;
    const base = rnd(2, gr(t, 50, 2.2)) * 20;  // t0 up to 1k, t2 up to ~4.8k, t3 ~10.7k
    const answer = (p * base) / 100;
    const tenth = base / 10;
    return {
      text: `${p}% of ${base}`,
      answer,
      why: `10% is ${tenth}, so ${p}% is ${p / 10} × ${tenth}.`,
      // Answering the complement (what's left) is a real and common mix-up.
      traps: [base - answer],
    };
  },

  frac(t) {
    const d = t < 0.7 ? pick([2, 4, 5, 10])
      : t < 1.5 ? pick([3, 4, 5, 8])
      : t < 2.3 ? pick([6, 7, 8, 9, 12])
      : pick([7, 9, 11, 12, 13, 15, 16]);
    const n = t < 0.7 ? 1 : rnd(1, d - 1);
    const base = d * rnd(2, gr(t, 20, 1.8));
    const unit = base / d;
    return {
      text: `${n}/${d} of ${base}`,
      answer: n * unit,
      why: `${base} ÷ ${d} = ${unit}, then × ${n}.`,
      // Stopping at the unit fraction — forgetting to multiply by the numerator.
      traps: n > 1 ? [unit] : [],
    };
  },

  pow(t) {
    const kind = t < 0.7 ? pick(['square', 'root'])
      : t < 1.5 ? pick(['square', 'root', 'cube'])
      : pick(['square', 'root', 'cube', 'two']);

    if (kind === 'square') {
      const lo = Math.round(2 + 9 * Math.min(t, 2.5));
      const n = rnd(lo, Math.max(lo + 4, gr(t, 15, 1.45)));  // t0 2-15, t2 20-31, t3 25-46
      return {
        text: `${n}${sup(2)}`,
        answer: n * n,
        why: `${n}² = ${n}×${n}. Nearby: ${n - 1}² = ${(n - 1) ** 2}.`,
        traps: [n * n + n, n * 2],
      };
    }
    if (kind === 'root') {
      const lo = Math.round(2 + 8 * Math.min(t, 2.5));
      const n = rnd(lo, Math.max(lo + 4, gr(t, 15, 1.45)));
      return {
        text: `√${n * n}`,
        answer: n,
        why: `${n} × ${n} = ${n * n}.`,
        traps: [n * 2],
      };
    }
    if (kind === 'cube') {
      const n = rnd(Math.round(2 + 1.5 * Math.min(t, 3)), Math.round(8 + 2.2 * t));
      return {
        text: `${n}${sup(3)}`,
        answer: n ** 3,
        why: `${n}² = ${n * n}, then × ${n}.`,
        traps: [n * n, n * 3],
      };
    }
    const e = rnd(5, Math.round(12 + 2 * Math.max(0, t - 2)));
    return {
      text: `2${sup(e)}`,
      answer: 2 ** e,
      why: `2¹⁰ = 1024 is the anchor worth memorising.`,
      traps: [2 ** e / 2, 2 ** e * 2, 2 * e],
    };
  },

  ooo(t) {
    const s = (base, perT = 1.7) => gr(t, base, perT);   // operand scale
    if (t < 0.7) {
      const [a, b, c] = [rnd(2, s(20)), rnd(2, s(9, 1.5)), rnd(2, s(9, 1.5))];
      return {
        text: `${a} + ${b} × ${c}`,
        answer: a + b * c,
        why: `Multiplication first: ${b}×${c} = ${b * c}, then + ${a}.`,
        // Left-to-right is exactly the mistake this topic exists to train out.
        traps: [(a + b) * c],
      };
    }
    if (t < 1.5) {
      const [a, b, c] = [rnd(2, s(20)), rnd(2, s(15, 1.5)), rnd(2, s(9, 1.5))];
      return {
        text: `(${a} + ${b}) × ${c}`,
        answer: (a + b) * c,
        why: `Brackets first: ${a}+${b} = ${a + b}, then × ${c}.`,
        traps: [a + b * c],
      };
    }
    if (t < 2.5) {
      const [a, b, c, d] = [rnd(2, s(20)), rnd(2, s(12, 1.5)), rnd(2, s(9, 1.5)), rnd(2, s(30))];
      return {
        text: `${a} + ${b} × ${c} − ${d}`,
        answer: a + b * c - d,
        why: `${b}×${c} = ${b * c} first, then ${a} + ${b * c} − ${d}.`,
        traps: [(a + b) * c - d, a + b * (c - d)],
      };
    }
    // The deep end: two products, subtraction between them.
    const [a, b, c, d] = [rnd(3, s(12, 1.4)), rnd(2, s(9, 1.4)), rnd(3, s(12, 1.4)), rnd(2, s(6, 1.4))];
    return {
      text: `${a} × ${b} − ${c} × ${d}`,
      answer: a * b - c * d,
      why: `Both products first: ${a * b} − ${c * d}.`,
      traps: [a * (b - c) * d, a * b - c * d + c],
    };
  },
};

// Swapping the last two digits is what a transposition slip actually looks like.
function transpose(n) {
  const s = String(Math.abs(n));
  if (s.length < 2) return null;
  const swapped = s.slice(0, -2) + s[s.length - 1] + s[s.length - 2];
  const out = Number(swapped) * Math.sign(n || 1);
  return out === n ? null : out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Wrong options, best first: the question's own traps, then plausible slips,
// then near misses. Never returns the right answer or a duplicate.
function wrongAnswers(question, count) {
  const out = [];
  const seen = new Set([question.answer]);
  const add = (v) => {
    if (!Number.isFinite(v) || seen.has(v)) return;
    if (question.answer >= 0 && v < 0) return;
    seen.add(v);
    out.push(v);
  };

  (question.traps || []).forEach(add);
  add(transpose(question.answer));
  shuffle([1, -1, 2, -2, 5, -5, 10, -10]).forEach((d) => add(question.answer + d));

  let extra = 3;
  while (out.length < count) { add(question.answer + extra); extra += 7; }
  return out.slice(0, count);
}

// `t` is the continuous difficulty scalar. Old integer levels map as t = lv−1.
function makeQuestion(topicId, t) {
  const tt = Math.max(0, Math.min(4.5, Number(t) || 0));
  const q = GENERATORS[topicId](tt);
  return { ...q, topic: topicId, t: tt };
}
