/* pools.js — what there is to remember.
 *
 * Four kinds, chosen because each one loads a genuinely different part of
 * working memory rather than being a reskin of the last:
 *
 *   digits   the phonological loop, rehearsable, the classic span test
 *   letters  the same loop but without a number line to lean on, and with
 *            confusable sounds (B/D/E/G/P/T) doing real damage
 *   words    chunkable meaning — the one kind where a strategy beats rehearsal
 *   grid     the visuospatial sketchpad, which shares almost nothing with the
 *            other three
 *
 * A player who is 9 at digits and 5 at grid has learned something about
 * themselves. That is only true because the kinds are different in kind.
 */

const KINDS = [
  { id: 'digits', label: 'Digits', icon: '🔢',
    note: 'The classic span test. Rehearsable, so this is where chunking pays first.' },
  { id: 'letters', label: 'Letters', icon: '🔤',
    note: 'No number line to lean on, and the confusable sounds do real damage.' },
  { id: 'words', label: 'Words', icon: '📝',
    note: 'The only kind where meaning helps — build a story and the span jumps.' },
  { id: 'grid', label: 'Grid', icon: '▦',
    note: 'Position and order, not sound. Shares almost nothing with the other three.' },
];

const DIGIT_POOL = '0123456789'.split('');

// I, O, Q and the vowels are out: I/1 and O/0 are unreadable at a glance, Q is
// rare enough to be a giveaway, and dropping the vowels stops a run of letters
// accidentally spelling a word — which would be a free chunk and would quietly
// make the test easier the luckier you got.
const LETTER_POOL = 'BCDFGHJKLMNPRSTVWXZ'.split('');

// Concrete, picturable, one or two syllables, no near-synonyms in the list —
// abstract nouns are far harder to hold and would make the words kind
// unfairly steep rather than differently steep.
const WORD_POOL = [
  'anchor', 'apple', 'arrow', 'badger', 'barn', 'basket', 'beacon', 'bell',
  'bicycle', 'blanket', 'bottle', 'bridge', 'bucket', 'button', 'cactus',
  'candle', 'canoe', 'castle', 'cellar', 'chimney', 'clock', 'compass',
  'copper', 'cradle', 'crayon', 'crown', 'diamond', 'donkey', 'drum',
  'eagle', 'engine', 'envelope', 'feather', 'ferry', 'fiddle', 'flute',
  'forest', 'fountain', 'garden', 'glacier', 'glove', 'grapes', 'guitar',
  'hammer', 'harbour', 'helmet', 'honey', 'hurdle', 'iron', 'island',
  'jacket', 'kettle', 'kitten', 'ladder', 'lantern', 'lemon', 'lighthouse',
  'lizard', 'lobster', 'magnet', 'mailbox', 'marble', 'meadow', 'mirror',
  'mountain', 'muffin', 'needle', 'orchard', 'otter', 'oven', 'paddle',
  'parcel', 'pebble', 'pencil', 'piano', 'pillow', 'pirate', 'pocket',
  'pumpkin', 'rabbit', 'raft', 'ribbon', 'river', 'rocket', 'saddle',
  'sailor', 'sandal', 'scissors', 'shovel', 'silver', 'skate', 'sleigh',
  'spider', 'spoon', 'stadium', 'statue', 'stove', 'sugar', 'sweater',
  'tavern', 'teapot', 'thimble', 'thunder', 'ticket', 'tiger', 'toaster',
  'tractor', 'trumpet', 'tunnel', 'turtle', 'umbrella', 'valley', 'velvet',
  'violin', 'wagon', 'walnut', 'whistle', 'window', 'yarn', 'zebra',
];

// The grid is 4×4 = 16 cells, which caps the grid span at 16 and comfortably
// exceeds any human spatial span. Bigger would only make the cells too small
// to hit with a thumb.
const GRID_COLS = 4;
const GRID_ROWS = 4;
const GRID_CELLS = GRID_COLS * GRID_ROWS;

// Pairs: faces that stay distinguishable at thumbnail size and in both themes.
// Emoji rather than drawings because they need no assets and no colour of
// their own to fight the paper.
const PAIR_FACES = [
  '🍋', '🌲', '🔔', '⚓', '🪁', '🦋', '🍄', '🌙', '🔑', '🧭',
  '🪶', '🐚', '🎈', '🕯', '🪴', '🍀', '⛵', '🎲', '🧊', '🪝',
];
