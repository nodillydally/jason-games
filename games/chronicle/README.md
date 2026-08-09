# 🏛️ Chronicle

Own the timeline of history — what happened when, and why it mattered.

**No build step, no server, no AI.** Open `index.html` in a browser and play, or
serve the repo root and visit `/games/chronicle/`.

## The goal it exists for

From the journal that started the whole learning-games project:

> "One thing I can do is be able to say what was happening in 50 BC, 0–1000,
> the 1500s, the 1700s, the 1900s, the 2000s."

Every question in Chronicle is some form of *place this in time*. The event
bank is ~113 canonical events across eight eras from the unification of Egypt
to ChatGPT, each carrying a one-line **why** — shown after answering, so every
question teaches something even when you get it right.

## Modes

| Mode | How it works |
| --- | --- |
| **Classic 🎯** | Ten mixed questions: which era, which came first, which year. |
| **Sequence 🔗** | Four events, tap them into chronological order. This is the drill that builds the actual timeline in your head. |
| **Blitz ⏱** | 60 seconds of era-spotting. |
| **Review 📚** | Only the events you keep missing, until you don't (85%+ graduates them out). |

Filter any mode to a single era to grind one century at a time.

## Design decisions

- **Exact years are only asked from 1450 onward.** Nobody should be expected to
  pick 1754 vs. 1759 for Hammurabi — ancient events are asked at era
  resolution, which is the honest resolution to know them at.
- **Era distractors are the neighbouring eras**, because "one era off" is the
  actual failure mode — random distractors would make the questions trivial.
- **Which-came-first pairs are ≥25 years apart**, so the answer is knowable
  reasoning rather than coin-flip trivia.
- **Adaptive selection**: events you miss are weighted to return, and Review
  mode drills only your misses. Per-event accuracy persists in localStorage
  and syncs to Atlas (`game: chronicle`, one row per answer).
- Era is **derived from the year at load time**, so the data can never
  contradict itself.

## Adding events

Append to `EVENTS` in `data/events.js`:

```js
{ id: 'unique-slug', y: 1815, name: 'Waterloo ends the Napoleonic Wars',
  why: 'One line on why this event is worth carrying around.' },
```

`y` is the year (negative = BC). Era is computed — just get the year right.
