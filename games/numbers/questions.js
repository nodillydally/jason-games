/* questions.js — question generation for Numbers.
 *
 * Design rule: every answer is a whole number. That keeps typed answers
 * unambiguous (no "is 0.333 close enough?"), makes wrong-answer options easy to
 * generate, and matches how mental arithmetic is actually practised.
 *
 * Each generator takes a level (1–3) and returns:
 *   { text, answer, why, traps }
 * `why` is shown when you get it wrong — the shortcut you should have used,
 * not just the right number. `traps` are wrong answers a person actually
 * produces (wrong operator precedence, percentage inverted), which make far
 * better multiple-choice options than random noise.
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

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((d) => SUPERSCRIPT[d] ?? d).join('');

const GENERATORS = {
  add(level) {
    const [a, b] = level === 1 ? [rnd(11, 99), rnd(11, 99)]
      : level === 2 ? [rnd(100, 999), rnd(11, 99)]
      : [rnd(100, 999), rnd(100, 999)];
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

  sub(level) {
    const [a, b] = level === 1 ? [rnd(30, 99), rnd(11, 29)]
      : level === 2 ? [rnd(200, 999), rnd(11, 99)]
      : [rnd(1000, 9999), rnd(100, 999)];
    const roundB = Math.round(b / 10) * 10;
    const diff = roundB - b;
    return {
      text: `${a} − ${b}`,
      answer: a - b,
      why: `${a} − ${roundB} = ${a - roundB}, then ${diff >= 0 ? 'add back' : 'subtract'} ${Math.abs(diff)}.`,
      traps: [],
    };
  },

  mul(level) {
    const [a, b] = level === 1 ? [rnd(3, 9), rnd(11, 19)]
      : level === 2 ? [rnd(3, 9), rnd(21, 99)]
      : [rnd(11, 49), rnd(12, 99)];
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

  div(level) {
    const [divisor, quotient] = level === 1 ? [rnd(2, 9), rnd(3, 12)]
      : level === 2 ? [rnd(3, 12), rnd(5, 30)]
      : [rnd(7, 25), rnd(8, 40)];
    const dividend = divisor * quotient;
    return {
      text: `${dividend} ÷ ${divisor}`,
      answer: quotient,
      why: `${divisor} × ${quotient} = ${dividend}.`,
      // Off-by-one on the quotient is the classic slip.
      traps: [quotient + 1, quotient - 1],
    };
  },

  pct(level) {
    // Percent is a multiple of 5 and the base a multiple of 20, which
    // guarantees a whole-number answer.
    const p = level === 1 ? pick([10, 25, 50, 20])
      : level === 2 ? pick([5, 15, 30, 40, 60, 75])
      : pick([35, 45, 65, 85, 95]);
    const base = rnd(2, 50) * 20;
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

  frac(level) {
    const d = level === 1 ? pick([2, 4, 5, 10])
      : level === 2 ? pick([3, 4, 5, 8])
      : pick([6, 7, 8, 9, 12]);
    const n = level === 1 ? 1 : rnd(1, d - 1);
    const base = d * rnd(2, 20);
    const unit = base / d;
    return {
      text: `${n}⁄${d} of ${base}`,
      answer: n * unit,
      why: `${base} ÷ ${d} = ${unit}, then × ${n}.`,
      // Stopping at the unit fraction — forgetting to multiply by the numerator.
      traps: n > 1 ? [unit] : [],
    };
  },

  pow(level) {
    const kind = level === 1 ? pick(['square', 'root'])
      : level === 2 ? pick(['square', 'root', 'cube'])
      : pick(['square', 'root', 'cube', 'two']);

    if (kind === 'square') {
      const n = level === 1 ? rnd(2, 15) : level === 2 ? rnd(11, 25) : rnd(21, 40);
      return {
        text: `${n}${sup(2)}`,
        answer: n * n,
        why: `${n}² = ${n}×${n}. Nearby: ${n - 1}² = ${(n - 1) ** 2}.`,
        traps: [n * n + n, n * 2],
      };
    }
    if (kind === 'root') {
      const n = level === 1 ? rnd(2, 15) : level === 2 ? rnd(10, 25) : rnd(20, 40);
      return {
        text: `√${n * n}`,
        answer: n,
        why: `${n} × ${n} = ${n * n}.`,
        traps: [n * 2],
      };
    }
    if (kind === 'cube') {
      const n = level === 2 ? rnd(2, 8) : rnd(5, 12);
      return {
        text: `${n}${sup(3)}`,
        answer: n ** 3,
        why: `${n}² = ${n * n}, then × ${n}.`,
        traps: [n * n, n * 3],
      };
    }
    const e = rnd(5, 12);
    return {
      text: `2${sup(e)}`,
      answer: 2 ** e,
      why: `2¹⁰ = 1024 is the anchor worth memorising.`,
      traps: [2 ** e / 2, 2 ** e * 2, 2 * e],
    };
  },

  ooo(level) {
    if (level === 1) {
      const [a, b, c] = [rnd(2, 20), rnd(2, 9), rnd(2, 9)];
      return {
        text: `${a} + ${b} × ${c}`,
        answer: a + b * c,
        why: `Multiplication first: ${b}×${c} = ${b * c}, then + ${a}.`,
        // Left-to-right is exactly the mistake this topic exists to train out.
        traps: [(a + b) * c],
      };
    }
    if (level === 2) {
      const [a, b, c] = [rnd(2, 20), rnd(2, 15), rnd(2, 9)];
      return {
        text: `(${a} + ${b}) × ${c}`,
        answer: (a + b) * c,
        why: `Brackets first: ${a}+${b} = ${a + b}, then × ${c}.`,
        traps: [a + b * c],
      };
    }
    const [a, b, c, d] = [rnd(2, 20), rnd(2, 12), rnd(2, 9), rnd(2, 30)];
    return {
      text: `${a} + ${b} × ${c} − ${d}`,
      answer: a + b * c - d,
      why: `${b}×${c} = ${b * c} first, then ${a} + ${b * c} − ${d}.`,
      traps: [(a + b) * c - d, a + b * (c - d)],
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

function makeQuestion(topicId, level) {
  const q = GENERATORS[topicId](Math.min(3, Math.max(1, level)));
  return { ...q, topic: topicId };
}
