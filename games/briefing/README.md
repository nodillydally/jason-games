# 📰 Briefing

Recall yesterday cold. Keep today in writing. Get graded on both.

**This is the one AI game.** Everything you write is graded by Claude
(~1–2¢ per grade) against source material loaded server-side. Requires cloud
sync — the game reads Jason's private daily news brief, which never touches
this public repo.

## The daily session — tabs, jump freely

**🧠 Yesterday** — free recall, cold: one big box, write everything you
remember from yesterday's brief. No cues. Free recall replaced the old
multiple-choice quiz deliberately: recognition is the weakest form of the
testing effect, retrieval without cues is the strongest.

**Stories 1–N** — the day's stories, with full details and **source links**.
Then one box, three prompts: *what happened, why does it matter, what do you
think.* The brief's own "why" stays hidden until after grading — the writing
is committed first.

**📈 Markets** — S&P 500, Nasdaq 100, Dow, US 10Y (moves shown in points, not
percent), Bitcoin, gold, USD/CAD, each with 1-day and week-to-date moves, plus
two sentences of generated commentary. Computed once per day and cached.
Prompt: *recap the moves, what do you think* — no "why it matters", because
for markets that's the same question as the recap.

## Grading

A letter (A+–F) and a score out of 100, with per-piece feedback: what landed,
what was missed. The rubric weights **facts over polish** — spelling and
grammar are explicitly never graded, invented facts cost double, and generic
hedging ("interesting to watch") scores near zero on the thinking dimension.
Letters map deterministically from scores (90+ A, 80+ B+, …) so the scale
never drifts.

The client only ever sends its own writing — the story, the brief, and the
market numbers are loaded server-side by date, so the grader can't be fed
invented source material.

## What's stored

Every graded take goes to `brief_takes` in Atlas: the writing itself plus
score and feedback. That's the longitudinal expression record — months from
now the question "is my thinking getting sharper?" has data behind it.
Sessions and per-story results sync like every game (`game: briefing`).

**Streak** counts full briefs: every story graded. Recall and markets are
bonuses, not gates.
