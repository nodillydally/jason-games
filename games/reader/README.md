# 📖 Reader

Speed reading practice that refuses to let you cheat.

**No build step, no server, no dependencies, no AI.** Open `index.html` in a
browser and read, or serve the repo root and visit `/games/reader/`.

## The one idea

Raw words-per-minute is a vanity metric. Anyone can push the number up by
recognising words without assembling them into meaning, and every speed-reading
app that reports WPM alone is measuring exactly that.

So the score here is **effective WPM** — the speed you actually read at,
multiplied by the fraction of the comprehension questions you got right. Read at
700 and retain a third, and you scored 233. Read at 300 and retain everything,
and you scored 300. Going faster only counts if understanding holds.

## Modes

| Mode | How it works |
| --- | --- |
| **Benchmark 🎯** | One passage at your chosen speed, then a comprehension check. |
| **Ladder 📈** | Speed climbs 50 wpm after every passage you pass at 70%+, and stops when comprehension breaks. This finds your actual ceiling instead of making you guess it. |
| **Free read 📄** | Paste your own text — a chapter, an article, your notes — and read it at speed. Not scored; it's practice, not measurement. |

## How the display works

Words are flashed one at a time in a fixed position (RSVP — rapid serial visual
presentation), which removes the eye movement between words that accounts for a
large share of ordinary reading time.

Each word is aligned on its **optimal recognition point** — the character the eye
naturally lands on when it fixates a word, marked in amber between the two
ticks. Without that alignment the text appears to jitter left and right and the
technique falls apart at speed.

Punctuation gets extra dwell time — 2.2× on a sentence end, 1.6× on a comma.
Reading through punctuation at a flat rate is what makes fast RSVP feel like
noise rather than prose; the pauses are what let sentence structure survive.

Space pauses, Escape quits. Paused time is subtracted from the clock, so a break
can't inflate your WPM.

## About the passages

All prose in `passages.js` is original, written for this game. That's deliberate:
every question can be answered **only** by having read the passage. A
comprehension test you can pass from general knowledge measures nothing.

Wrong options are plausible-sounding claims the passage doesn't make, because
the characteristic failure of speed reading is recognising familiar words and
inventing the argument around them. Options that are obviously wrong wouldn't
catch that.

`level` is syntactic difficulty, not topic difficulty: level 1 is plain
declarative prose, level 3 has subordinate clauses and qualifications that
punish skimming. The stats screen breaks comprehension down by level, which is
where you find out whether you're fast at reading or just fast at easy reading.

## Adding your own passages

Append to the `PASSAGES` array in `passages.js`:

```js
{
  id: 'unique-slug',
  title: 'Display Title',
  level: 1,               // 1 plain · 2 denser · 3 complex
  text: `Two or three paragraphs…`,
  questions: [
    { q: 'Question?', options: ['a', 'b', 'c', 'd'], answer: 0 },
  ],
}
```

Aim for 180–250 words and at least three questions. Every question must be
answerable from the text alone.

## Ideas for future versions

- Import from your reading list so the passages are books you're actually reading
- Free-recall mode: read, close, write what you remember, get it graded (needs an LLM — see the repo README)
- Regression tracking: flag when today's effective wpm drops well below your baseline
- Subvocalisation drill: a metronome that outpaces your inner voice
