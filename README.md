# Jason's Learning Games

Custom games for deliberate practice — one repo, one folder per game under `games/`.

Play them at **https://nodillydally.github.io/jason-games/**

## Games

| Game | Folder | Subject |
|------|--------|---------|
| [Mapmaster](games/mapmaster/) | `games/mapmaster/` | World geography |
| [Numbers](games/numbers/) | `games/numbers/` | Mental math |
| [Reader](games/reader/) | `games/reader/` | Speed reading + comprehension |

Planned: vocabulary, books/facts from reading, chess.

Every game so far is deliberately AI-free — they run offline, cost nothing per
session, and never wait on a network round trip. The open question is whether to
add a Claude-backed endpoint for the things that genuinely need it (grading
free-form writing, free recall, generating quiz questions from your own reading
notes). At single-user volume that costs roughly a cent per session, so the
argument against it is offline capability and simplicity — not money.

## Conventions

- Each game lives in its own folder under `games/` and is self-contained (its own README, assets, and — only if it needs one — its own `package.json`).
- Prefer static HTML/JS/CSS with no build step. Open the game's `index.html` directly or serve the repo root with any static server.
- Shared code goes in `lib/` when a second game actually needs it — not before. `lib/sync.js` earned its place this way; it lived inside Mapmaster until Numbers needed the same thing.
- Each game keeps its own `style.css` and palette. Games are meant to look like siblings, not clones, and shared styling would couple them for no real gain. The exception is `lib/sync.css`, which styles the one piece of UI they genuinely share and reads its colours from whatever custom properties the game defines.
- Game data files (country lists, vocab decks, fact banks) live in the game's own `data/` folder.

## The runner and the wardrobe

Every game shows the same character — a line-art figure in `lib/avatar.js`,
drawn as inline SVG so it takes each game's own accent colour and ships no
assets. It has five poses and six equipment slots.

Levels stay **per game**: each keeps its own XP on the same curve, so being
level 12 at Numbers and level 2 at Chronicle is honest rather than averaged
into a meaningless number. What's shared is the character. One figure, one
wardrobe (`lib/wardrobe.js`, one `localStorage` key across all games), worn
everywhere.

Gear comes from two places that never overlap:

- **Drops** are earned. Each is dropped by exactly one game and gated on that
  game's level, so the compass only ever comes out of Mapmaster and the
  hourglass only ever out of Chronicle. Nothing locked is ever listed — you get
  a count of what's still out there and nothing else, because the reveal is the
  payoff and spoiling the catalogue spends it early. A few are gated on doing
  something rather than reaching a level (beating Your Ghost, taking The
  Metronome on Hard).
- **Shop** items are bought with coins, which ride on XP so there's no second
  scoring system. This half is deliberately the opposite: browsable rather than
  hidden, because you need something to save toward, and pure expression rather
  than status. Stock is three items rotating daily.

Nothing in the first group can ever be bought. Collapse the two and the drops
stop being proof of anything.

Wiring a game in is two calls:

```js
Wardrobe.attach('mapmaster');                      // once, at boot
Wardrobe.check('mapmaster', levelForXp(store.xp));  // wherever the level is known
Wardrobe.earn(xpGain / 2);                          // when a round ends
```

## Cloud sync

Every game works standalone with progress in `localStorage`. Optionally, finished
sessions — and every individual answer — sync to Atlas, which stores them in
Supabase so progress is measurable over time rather than just felt.

Turn it on from the **Cloud sync** card on any game's menu and paste the sync
code. It's stored in that browser only and is deliberately not in this repo,
because this repo is public. Since all games share an origin, setting it once
switches it on for every game.

The receiving end is `/api/game-sync` in the `jason-atlas` repo, writing to the
`game_sessions` and `game_answers` tables. Those tables are game-agnostic, so a
new game needs no schema change — just post with a new `game` value.

## Running a game locally

```sh
npx serve .
# then open http://localhost:3000/games/mapmaster/
```
