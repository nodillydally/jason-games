# 📰 Briefing

Reading the news is easy. Keeping it is the game.

**No build step, no AI.** Requires cloud sync — the game reads Jason's private
daily news brief (the structured version in Atlas), which never touches this
public repo.

## The two loops

**Today's brief 📰** — each story shows the *what* and the details, then stops:
*why does this matter?* You commit to your own answer — out loud or typed —
**before** the brief's take is revealed, then self-score the match (nailed /
close / missed). Committing first is the whole mechanic: it turns reading into
prediction, and prediction error is what teaches. Completing the day's brief
keeps the day streak.

**Recall 🧠** — quizzed on the *previous* days' stories: given the what, pick
the why; given the why, pick the story. Distractors are the other real stories
from the same window, so the questions can't be answered by vibes. This is the
part that makes news stick past lunchtime — the brief you read is only yours if
it survives the night.

## Why self-scoring is honest here

The same reason it works for flashcards: single player, and lying to the
scoreboard only burns your own signal. Grading the written take with an LLM is
the obvious upgrade (~1¢ a session) and would make the Expression practice
scoreable for real — the commit-then-compare loop works without it.

## Data

Fetched from `/api/game-content?op=news` (bearer-gated): the last ~14 days of
`news_reflections` — date, topic, and per story `headline`, `what`, `why`,
`details`. Sessions and per-story answers sync back like every game
(`game: briefing`, `item_id: date#index`).
