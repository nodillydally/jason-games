/* methods.js — how to actually do each topic in your head.
 *
 * The gap this fills: knowing that 54² = 2916 is memorisation, but knowing how
 * to *get there* without paper is a technique, and techniques are learnable in
 * about a minute each. Square roots in particular look impossible mentally
 * until you see the bracketing trick, at which point they're easy.
 *
 * Each card is deliberately short. A method you can't hold in your head while
 * solving is not a mental-math method.
 */

const METHODS = {
  add: {
    title: 'Addition — round, then correct',
    idea: 'Never add the awkward number. Add a round one and fix the difference.',
    steps: [
      'Round the second number to the nearest ten.',
      'Add that — easy, because it ends in zero.',
      'Adjust by however much you rounded.',
    ],
    example: {
      problem: '387 + 46',
      lines: [
        '46 rounds up to 50 (that\'s 4 too many)',
        '387 + 50 = 437',
        '437 − 4 = 431',
      ],
    },
  },

  sub: {
    title: 'Subtraction — count up, don\'t take away',
    idea: 'Borrowing is what makes subtraction feel hard. Counting up avoids it entirely.',
    steps: [
      'Start at the smaller number.',
      'Jump to the next round number, then to the target.',
      'Add your jumps together.',
    ],
    example: {
      problem: '812 − 367',
      lines: [
        '367 → 400 is 33',
        '400 → 812 is 412',
        '33 + 412 = 445',
      ],
    },
  },

  mul: {
    title: 'Multiplication — split the big one',
    idea: 'Break one number into tens and units, multiply each, add. Two easy problems beat one hard one.',
    steps: [
      'Split the larger number: 47 becomes 40 and 7.',
      'Multiply each part separately.',
      'Add the two results.',
    ],
    example: {
      problem: '6 × 47',
      lines: [
        '6 × 40 = 240',
        '6 × 7 = 42',
        '240 + 42 = 282',
      ],
    },
    extras: [
      '×5 → multiply by 10, halve it',
      '×9 → multiply by 10, subtract one copy',
      '×11 (2-digit) → add the digits, drop the sum in the middle: 52 × 11 → 5_(5+2)_2 → 572',
    ],
  },

  div: {
    title: 'Division — multiply upward',
    idea: 'Don\'t divide. Ask what you\'d multiply the divisor by to reach the target.',
    steps: [
      'Find an easy anchor: divisor × 10.',
      'Work up or down from there in whole steps.',
      'Count how many you used.',
    ],
    example: {
      problem: '432 ÷ 18',
      lines: [
        '18 × 10 = 180, 18 × 20 = 360 — so the answer is over 20',
        '432 − 360 = 72',
        '72 ÷ 18 = 4, so 20 + 4 = 24',
      ],
    },
  },

  pct: {
    title: 'Percentages — everything from 10%',
    idea: 'Find 10% by moving the decimal one place. Every other percentage is built from that.',
    steps: [
      '10% = move the decimal one place left.',
      '5% is half of 10%. 1% is a tenth of it.',
      'Add the pieces you need.',
    ],
    example: {
      problem: '35% of 240',
      lines: [
        '10% of 240 = 24',
        '30% = 24 × 3 = 72',
        '5% = half of 24 = 12',
        '72 + 12 = 84',
      ],
    },
    extras: [
      'x% of y always equals y% of x — 16% of 25 is hard, 25% of 16 is 4',
    ],
  },

  frac: {
    title: 'Fractions of a number — divide, then multiply',
    idea: 'The denominator tells you how big one slice is. The numerator tells you how many slices.',
    steps: [
      'Divide by the bottom number — that\'s one slice.',
      'Multiply by the top number.',
      'The common mistake is stopping after step one.',
    ],
    example: {
      problem: '3⁄8 of 96',
      lines: [
        '96 ÷ 8 = 12 (one eighth)',
        '12 × 3 = 36',
      ],
    },
  },

  pow: {
    title: 'Squares and square roots — bracket, then pin the digit',
    idea: 'You never need to guess. Two clues — the size and the last digit — narrow a square root to exactly one answer.',
    steps: [
      'Bracket it: which two multiples of ten does it sit between? That fixes the first digit.',
      'Look at the last digit. It can only come from two possible endings (see below).',
      'Pick between those two by asking whether the number is above or below the midpoint of your bracket.',
    ],
    example: {
      problem: '√2916',
      lines: [
        '50² = 2500 and 60² = 3600, so the root is in the fifties',
        'It ends in 6, so the root ends in 4 or 6',
        '55² = 3025, and 2916 is below that — so take the lower one: 54',
        'Check: 54 × 54 = 2916 ✓',
      ],
    },
    extras: [
      'Last-digit map: 1→1 or 9 · 4→2 or 8 · 5→5 · 6→4 or 6 · 9→3 or 7 · 0→0',
      'A square never ends in 2, 3, 7, or 8 — if it does, it isn\'t a perfect square',
      'Squares near an anchor: 48² = (50 × 46) + 2² = 2300 + 4 = 2304',
      'Anything ending in 5: drop the 5, multiply by the next number up, append 25. 65² → 6 × 7 = 42 → 4225',
    ],
  },

  ooo: {
    title: 'Order of operations — multiplication is already done',
    idea: 'Read the expression and treat every multiplication as a number that already exists. Then it\'s just adding and subtracting.',
    steps: [
      'Brackets first, if there are any.',
      'Resolve every × and ÷ into a single value.',
      'Only then work left to right through + and −.',
    ],
    example: {
      problem: '14 + 7 × 6 − 9',
      lines: [
        '7 × 6 = 42 — treat that as a fixed number',
        'Now it reads: 14 + 42 − 9',
        '56 − 9 = 47',
      ],
    },
    extras: [
      'The trap is answering 14 + 7 = 21 first, then × 6. Left-to-right is exactly what this topic trains out.',
    ],
  },
};
