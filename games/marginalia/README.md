# ✍️ Marginalia

The passages you marked by hand in a real book, given back to you until you own
them.

**No build step, no dependencies.** Serve the repo root and visit
`/games/marginalia/`. Owner-only — the cards are a private library.

## The one idea

Highlighting feels like learning and isn't. You mark a passage, feel the click
of recognition, close the book, and keep none of it. The mark records that
something mattered; nothing ever asks you for it again.

So this asks. Every marked passage becomes a card on a spaced-repetition
schedule, and you don't get to recognise your way through it — the text isn't on
screen, and it isn't in the page source either.

## The mark decides the question

The important part is that the four marks mean four different things, so
flattening them into "highlighted text" would throw away what you recorded when
you made them:

| On the page | What it meant | The card |
| --- | --- | --- |
| `"quotation marks"` | a line worth keeping | **Fill the gaps** — the line with words missing |
| `[bracket in the margin]` | a passage to revisit | **Say what it argued** — graded on substance |
| underline | emphasis | **Fill the gaps** |
| ⭕ circled word | a key term | **Define it** — graded on whether it's usable |

A margin bracket is always a gist card however short it is: bracketing means "I
want this idea back", not "I want to recite it". Anything over 45 words becomes
a gist card too, whatever its mark — a verbatim card on three paragraphs is one
you always fail.

## Where the cards come from

Photograph a marked page at the Reading bot on Telegram. Claude reads the marks
off it and files them. One page with three marks becomes three cards.

## The schedule

`1 → 3 → 7 → 16 → 35 days`, doubling after that, capped at a year. Miss it and
the streak resets and it's back tomorrow. Five in a row and it counts as owned.

Vision occasionally misreads handwriting-marked text. **Bad read** drops a card
from rotation — it archives rather than deletes, so nothing is lost.

## Not in this repo

The book text, the cards, the answers. This site is public; the passages come
from an owner-gated endpoint on Atlas and are graded there. A card arrives as a
cue with holes in it and the answer goes back to be marked, so the text never
reaches the browser that's about to ask you to recall it.
