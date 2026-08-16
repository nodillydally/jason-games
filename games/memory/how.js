/* how.js — the Learn screen.
 *
 * Working memory is one of the few cognitive capacities where the honest
 * finding is "you can't train the container". Practising span raises your
 * score at span and transfers to almost nothing else — that result has held up
 * across two decades of brain-training claims that didn't.
 *
 * So this screen doesn't promise a bigger brain. It teaches the things that
 * genuinely move the number: chunking, grouping, the story method, and the
 * loci method — encoding strategies, all of which DO transfer, because they're
 * skills rather than capacities.
 */

const HOW_TOPICS = [
  { id: 'limit', label: 'The limit', icon: '📏' },
  { id: 'chunk', label: 'Chunking', icon: '🧩' },
  { id: 'story', label: 'The story', icon: '📖' },
  { id: 'loci', label: 'Memory palace', icon: '🏛' },
  { id: 'spatial', label: 'The grid', icon: '▦' },
];

const HOWTO = {
  limit: `
    <h3>Four, not seven</h3>
    <p>The famous "seven plus or minus two" is from a 1956 paper by George
      Miller, and Miller himself called the number a coincidence he was being
      persecuted by. Later work put the real capacity of working memory at
      closer to <b>four chunks</b> for most people, with the higher digit spans
      explained by rehearsal — you say the digits to yourself fast enough to
      refresh them before they fade.</p>
    <p>That has two consequences you can feel in this game:</p>
    <p class="how-line">Anything that stops you rehearsing — a distraction, a
      long word, being asked to recall backwards — collapses your span
      immediately, because the loop was doing most of the work.</p>
    <p class="how-line">The only way past the limit is to make each chunk hold
      more. Not more slots. Bigger slots.</p>
    <p class="how-note">This is also why the honest version of this game does
      not claim to make you smarter. Training span raises your span and
      transfers to very little else. What transfers is the encoding — the
      strategies on the other tabs, which are skills rather than capacities.</p>`,

  chunk: `
    <h3>Chunking: turn seven things into three</h3>
    <p>1-9-4-5-1-9-8-9 is eight digits and past most people's span. <b>1945,
      1989</b> is two chunks and trivially easy. Nothing about your memory
      changed — the encoding did.</p>
    <p>What to reach for, in order:</p>
    <p class="how-line"><b>Dates and years.</b> Any four digits that could be a
      year, treat as one.</p>
    <p class="how-line"><b>Pairs.</b> Failing anything better, group the digits
      in twos or threes and rehearse the groups rather than the digits.
      Phone numbers are written in groups for exactly this reason.</p>
    <p class="how-line"><b>Ages, scores, prices.</b> 27 is not "two seven", it
      is an age. A number with a meaning takes one slot.</p>
    <p class="how-note">On Letters, chunking means pronouncing: BCD-FGH read as
      two syllables is two chunks, where six letters is six. Say it, don't
      spell it.</p>`,

  story: `
    <h3>The story method — for Words</h3>
    <p>Words are the one kind here where meaning is available, and meaning is
      the cheapest compression there is. A list of six unrelated nouns is six
      chunks. A single absurd sentence containing all six is one.</p>
    <p class="how-line">kettle · spider · ladder · velvet · rocket · pumpkin<br>
      → <em>A spider carried a kettle up a ladder, wrapped it in velvet, and
      strapped it to a rocket aimed at a pumpkin.</em></p>
    <p>Three rules make the story stick:</p>
    <p class="how-line"><b>Absurd beats sensible.</b> Ordinary scenes blur
      together; a kettle on a rocket does not.</p>
    <p class="how-line"><b>Motion beats description.</b> Things doing something
      to each other chain in order. A static list does not.</p>
    <p class="how-line"><b>See it, don't say it.</b> The image is the storage;
      the sentence is just how you built it.</p>
    <p class="how-note">Building the story costs time you may not have on a
      short exposure, which is the real trade-off — and why the strategy starts
      paying at span 6 and up, not at span 4.</p>`,

  loci: `
    <h3>The memory palace</h3>
    <p>The oldest technique in the book, literally: Simonides of Ceos is said to
      have identified crushed banquet guests by recalling where each had been
      sitting. Every competitive memoriser still uses some version of it.</p>
    <p>Pick a route you know without thinking — your flat, the walk to the
      station, the gym floor. Fix five to ten stops along it, always in the same
      order. To memorise a list, place one item at each stop, vividly and in
      motion. To recall it, walk the route.</p>
    <p class="how-line">front door · hallway mirror · kitchen sink · sofa ·
      balcony rail</p>
    <p>Why it beats a plain list: <b>the route is already in long-term memory</b>,
      so it costs nothing to hold. You're not remembering six things and their
      order — you're remembering six things, and the order is free.</p>
    <p class="how-note">One palace per purpose, and reuse it. Interference
      between two lists in the same palace is real, and it feels exactly like
      forgetting.</p>`,

  spatial: `
    <h3>The grid is a different system</h3>
    <p>Digits, letters and words all run through the phonological loop — you
      hear them in your head. Grid positions don't. They go to the visuospatial
      sketchpad, which is a separate store with its own capacity, and that is
      why your grid span can be three below your digit span without either
      number being wrong.</p>
    <p>What works here is not rehearsal:</p>
    <p class="how-line"><b>Draw the shape.</b> Four cells is not four positions,
      it's a quadrilateral. Five is a letter or a constellation. Hold the
      figure, not the points.</p>
    <p class="how-line"><b>Use the edges.</b> Corners and edge cells are far
      easier to fix than the middle four. Anchor on them and place the rest
      relative.</p>
    <p class="how-line"><b>Don't narrate.</b> Converting positions into words
      ("top left, then middle right") pushes them into the loop, where they
      compete with nothing but each other and fade faster.</p>
    <p class="how-note">Reverse mode is hardest here for the same reason: you
      can re-read a shape backwards only if you stored a shape, and most people
      stored a sequence.</p>`,
};
