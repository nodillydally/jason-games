/* games/numbers/rivals.js — who you race in Numbers.
 *
 * The engine is shared (lib/rival.js); the personalities are not, and should
 * not be. A rival is characterful because it is fast and slow at the same
 * things this subject is fast and slow at — The Professor is laborious at plain
 * arithmetic and near-instant at anything with structure.
 * That only means something inside one game.
 */

Rival.setRoster((function () {
  'use strict';

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
  return RIVALS;
})());
