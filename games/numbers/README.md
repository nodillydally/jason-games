# 🔢 Numbers

Mental math under time pressure. No scratch paper, no calculator — the point is
the shortcut, not the grind.

**No build step, no server, no dependencies.** Open `index.html` in a browser and
play, or serve the repo root and visit `/games/numbers/`.

## Game modes

| Mode | How it works |
| --- | --- |
| **Classic 🎯** | 10 questions at your chosen difficulty. |
| **Blitz ⏱** | 60 seconds — answer as many as you can. Auto-advances. |
| **Marathon 💀** | 3 lives. Questions keep coming until you miss three. |
| **Ladder 📈** | Starts easy and steps up a level every 5 correct. 3 lives. |
| **Review 📚** | Drills only the topics you're below 85% on. |

## Topics

Addition, subtraction, multiplication, division, percentages, fractions, powers
& roots, and order of operations — or **Mixed**, which is the interesting one:
topics you get wrong come up more often, so practice concentrates itself where
you're weak.

Difficulty sets the size of the numbers. **Hard also removes the multiple
choice** — you type the answer, which is a genuinely different skill from
recognising it among four options.

## Two design rules

**Every answer is a whole number.** That keeps typed answers unambiguous (no
"is 0.333 close enough?") and makes wrong options easy to generate cleanly.
Percentages use a percent that's a multiple of 5 and a base that's a multiple of
20, which guarantees it.

**Wrong options are mistakes people actually make.** For `4 + 6 × 3` one of the
options is 30 — what you get doing it left to right. For `35% of 240` one is
156, the complement. Random noise would be easy to eliminate by feel; these
force you to actually do the arithmetic. When you miss one, the explanation
shows the shortcut rather than just the number.

## What gets tracked

Per-topic accuracy **and average time** persist in `localStorage`, so the stats
screen shows not just what you get wrong but what you're slow at. With cloud
sync on (see the repo README), every individual answer is also stored in Atlas
— that's what makes "am I getting faster at percentages?" answerable months
later.

## Testing the question engine

The generators are pure functions, so they're worth checking in bulk. The test
in this repo's history generates ~96,000 questions across every topic and level
and independently re-evaluates each printed expression, asserting the answer
matches, options never contain the answer, and nothing is a duplicate.

## Ideas for future versions

- A "estimate" mode: accept anything within 5% of the answer, for real-world speed
- Track time-of-day performance — mental math is unusually sensitive to tiredness
- Two-player pass-and-play
