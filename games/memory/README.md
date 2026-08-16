# 🧠 Memory

How much can you hold at once, and for how long?

**No build step, no server, no dependencies.** Open `index.html` in a browser
and play, or serve the repo root and visit `/games/memory/`.

## Two halves, and only one of them is rated

**Span** — a sequence flashes one item at a time, it goes away, you reproduce
it. Right and the next one is a place longer; wrong and it drops back. This is
the classic span staircase, and it converges on your actual limit in about six
trials.

**Pairs** — the concentration board everyone already knows. It pays XP, coins
and chests like everything else, and it is deliberately **not rated**. A pairs
board rewards a search strategy at least as much as recall, and folding that
into the same number as digit span would make the number mean less rather than
more. The scoreboard says what it measures.

## Four kinds, because they are genuinely different

| Kind | What it loads |
| --- | --- |
| **Digits 🔢** | The phonological loop. Rehearsable, so this is where chunking pays first. |
| **Letters 🔤** | The same loop with no number line to lean on, and confusable sounds (B/D/E/G/P/T) doing real damage. |
| **Words 📝** | Chunkable meaning — the one kind where a strategy beats rehearsal outright. |
| **Grid ▦** | The visuospatial sketchpad, which shares almost nothing with the other three. |

A player who is 9 at digits and 5 at grid has learned something real about
themselves. That is only true because the kinds differ in kind, which is why
each carries its own rating rather than being averaged into one "memory score".

Two details in the pools do more work than they look:

- **Letters exclude the vowels, plus I, O and Q.** I/1 and O/0 are unreadable
  at a glance, and dropping the vowels stops a run of letters accidentally
  spelling a word — which would be a free chunk, quietly making the test easier
  the luckier you got.
- **Digits are drawn with replacement but never twice in a row.** Repeats are
  realistic; an immediate double is a free chunk rather than an extra place.

## Modes

| Mode | How it works |
| --- | --- |
| **Span 🎯** | 10 sequences. Right and it grows, wrong and it shrinks. |
| **Reverse 🔄** | 10 sequences recalled backwards. |
| **Climb 📈** | No round limit. 3 lives — see how far it goes. |
| **Pairs 🃏** | The board. Fewest turns wins, not fastest. |
| **Review 📚** | Whichever kind you are currently lowest-rated at. |

## Rating

Span maps onto the same 1000-baseline scale as every other game here, anchored
where the evidence is: **an unaided digit span of 7 is the average adult**, so
7 sits at 1000. Every extra place is worth 200, which makes a span of 10 a
1600 — the same distance above average that 1600 means in Numbers.

Recalling **backwards counts as two extra places** rather than getting its own
scale. It's the same capacity being asked to do more with itself, and a
separate rating would let you hold two contradictory "letters" numbers at once.

Scoring is **all-or-nothing per trial**, the way every real span test works:
holding six of seven places is not a seven span. Partial credit is still shown
on the results screen, because where the sequence broke is the useful part.

## The honest bit

The Learn screen does not promise a bigger brain, because span training does
not deliver one. Practising span raises your span and transfers to remarkably
little else — that finding has outlived two decades of brain-training claims
that didn't.

What it teaches instead is **encoding**: chunking, the story method, the memory
palace, and why the grid needs a shape rather than a narration. Those are
skills rather than capacities, and skills do transfer.

## What gets tracked

Per-kind rating, best span and accuracy persist in `localStorage`, along with
your fewest-turns record per pairs board size. With cloud sync on (see the repo
README) every trial also lands in Atlas — sequence, what you gave, and how long
you took — which is what makes "is my grid span actually moving?" answerable
six months later.

## Ideas for future versions

- N-back, as its own mode and its own rating — it is a different task, not a
  longer sequence
- A dual mode (grid position + letter at once), which is where the two stores
  start competing
- Delayed recall: the same sequence asked for again two trials later
- Pairs against a rival, reusing `lib/rival.js` from Numbers and Mapmaster
