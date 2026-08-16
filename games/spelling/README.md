# 🔤 Spelling

The word is **spoken**, never shown. You supply the letters. Ask for the
definition or a sentence exactly like you would at a real bee.

**No build step, no server, no dependencies.** Open `index.html` in a browser
and play, or serve the repo root and visit `/games/spelling/`.

## Why it's built this way

A spelling game has three ways to ask a question, and two of them don't test
spelling:

- **Show the word, ask you to retype it.** That's a copying test.
- **Give the meaning, ask for the word.** This is what the game did first, and
  it was wrong. It tests vocabulary before it tests spelling: fail to retrieve
  *chaos* from "complete disorder and confusion" and you never reach the part
  where letters matter. A player who knows perfectly well how to spell *chaos*
  still loses the point. That is a vocabulary game wearing a spelling game's
  name.
- **Say the word aloud, ask for the letters.** The classic bee, and the only
  one that isolates spelling — you already know which word is wanted, so the
  only question left is how it's written.

The third one is the game. Never *showing* the word was always right; never
*saying* it was the mistake.

### The voice

`speechSynthesis`, and nothing else. Built into every browser, free, no
network, no key, no build step — the same constraints the rest of the repo
holds to, which is why there's no audio pipeline in here.

It is the one part of the game that depends on the host OS, so it's treated as
unreliable on purpose:

- **No voices installed** (some Linux builds, locked-down browsers) falls back
  to the old definition-led prompt rather than asking for a word it never said.
- **Speaking is wrapped in a `try`.** It's called from inside question setup,
  and voices can vanish after a sleep/resume. Losing the audio is survivable;
  losing the question is not.
- Local voices are preferred over remote ones — a remote voice needs a network
  round trip mid-question and can simply fail to arrive.

### Sound-alikes are the exception

Speaking a homophone isn't a question, it's two questions at once: *principle*
and *principal* are the same noise. A real bee resolves this the same way the
game does — the judge gives the sentence. So for that category the sentence
isn't something you ask for, it's part of the prompt, and the word is still
spoken alongside it.

Everywhere else, both clues stay hidden until you ask. Asking is free and
always allowed; the clock is the only cost.

## Difficulty, and finding your level

250 words across five tiers, weighted where a good speller actually lives:

| Tier | Words | |
|---|---|---|
| 1 | 23 | most adults get this |
| 2 | 60 | |
| 3 | 64 | |
| 4 | 72 | |
| 5 | 31 | most adults don't |

The first cut of this list was calibrated to "most adults" and was the wrong
list for the person playing it: 57% sat at tiers 1-2 while the top two tiers
held twenty words between them, so choosing Hard cycled the same handful.

Finding your level had the same problem from the other side. Elo moves a
rating by K·(1−expected), at most 34 points — about a ninth of a tier — so
climbing from the 1000 floor to the tier-5 words took roughly **thirty correct
answers per category**, across seven categories. That is several sessions
spent on words you cannot get wrong.

So an unrated trap now starts in the **middle** of the range rather than at the
floor, and the first four answers move it a **whole tier at a time** instead of
by expectation. That is a staircase, not a rating update — the same bisection
Memory runs on span. A strong speller is on tier-5 words by the third question;
someone who misses everything is down to tier 1 just as fast. Elo takes over
once it has something honest to refine.

## Traps, not topics

Words are grouped by **the mistake they invite**, not by subject:

| Trap | What it covers |
| --- | --- |
| **Everyday traps 🪤** | The words adults misspell most — separate, definitely, privilege. |
| **Double letters 🔁** | Which consonant doubles and which only looks like it should. |
| **Silent letters 🤫** | Letters you never hear and can never leave out. |
| **Endings ✒️** | -ible/-able, -ent/-ant, -ence/-ance. |
| **ie / ei 🔀** | The rule that's right two thirds of the time, and the third. |
| **Greek & Latin 🏛** | Borrowed whole, spelled the way the lender spelled it. |
| **Sound-alikes 🔊** | Two real words, one sound — the sentence is the only tell. |

That grouping is the whole point of the ratings. Spelling one word right is
worth little; learning that *-ence follows a soft c* is worth hundreds of
words you've never seen. Each trap carries its own Elo, so the stats screen
answers "which mistake do I still make" rather than "which words did I miss".

## Modes

| Mode | How it works |
| --- | --- |
| **Classic 🎯** | 10 words. |
| **Blitz ⏱** | 90 seconds — as many as you can spell. Auto-advances. |
| **Marathon 💀** | 3 lives. Words keep coming until you miss three. |
| **Ladder 📈** | Starts easy, climbs a tier every 5 correct. 3 lives. |
| **Review 📚** | Only the words you've actually got wrong and not since fixed. |

## Adaptive difficulty

Default. Every trap carries a chess-style rating, every word carries a
difficulty derived from its tier (1–5, spanning 1000 to 1720), and answering is
a match between the two. Words are served *just above* your rating, so the game
sits at your edge. An unrated trap starts mid-range and bisects — see
**Difficulty, and finding your level** above.

The input hardens as the rating climbs, because each step stops being worth
anything once you can do it:

| Rating | Input |
| --- | --- |
| below ~1225 | pick the right spelling from four |
| ~1225–1525 | build the word from a bank of letters |
| above ~1525 | type it |

The fixed difficulties map to the same three: Easy picks, Normal builds, Hard
types.

## The wrong answers are the real design work

Multiple choice is only worth playing if the wrong options are the mistakes
you'd actually make. `necessarq` is answerable without knowing anything.

Every distractor is generated by applying exactly **one real error pattern** —
the ie/ei flip, a doubled or undoubled consonant, a swapped ending, a dropped
silent letter, a vowel heard wrong in an unstressed syllable. Anything that
lands on a word the game itself knows is discarded, so a distractor can never
quietly be the right answer to a different question.

Where a word has a genuine confusable, that comes first: **principal** is a far
better wrong answer for *principle* than anything a generator can invent,
because it's the mistake a competent speller actually makes.

## Words learned

A word is **learned** after three correct in a row and **unlearned** after two
misses — the same rule as Mapmaster's countries and Chronicle's events, so the
hub's "things learned" number means one thing across every game. It can go
down. That's the point.

## The rules screen

Six patterns rather than a word list: ie/ei, consonant doubling, -ible/-able,
-ence/-ance, silent letters, and what happens when you add an ending. A list of
two hundred words teaches two hundred things; these decide thousands each and
transfer to words that were never in the game.

## What gets tracked

Per-trap accuracy and rating, and per-word learned state, persist in
`localStorage`. With cloud sync on (see the repo README) every individual
answer also lands in Atlas, which is what makes "am I still losing -ible words
six months later?" answerable.

## Adding words

`data/words.js`. Each entry needs `w`, `cat`, `tier` (1–5), `def` and `sent` —
and `sent` must contain `___` where the word goes. Never write the word into
the sentence.

`near` is optional and holds the single best wrong answer: usually a real
confusable (*principal* for *principle*), sometimes the misspelling everyone
actually writes (*miniscule*, *supercede*, *momento*). It beats a generated
variant either way.

Two rules the generator can't enforce for you:

- **A `homophones` entry must name its partner in `near`**, and its sentence has
  to do the whole job of saying which word is wanted — the voice can't.
- **Avoid words with legitimate variant spellings** (*judgement/judgment*,
  *ageing/aging*). A spelling test with two right answers isn't one.

## Ideas for future versions

- A dictation mode for anyone who does want the spoken bee, behind a toggle
- Words pulled from what Reader is actually reading, so the two games feed each
  other
- Etymology on the results screen for the Greek & Latin trap — the root is
  usually the mnemonic
- Two-player pass-and-play, matching Numbers' Versus
