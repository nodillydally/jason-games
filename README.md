# Jason's Learning Games

Custom games for deliberate practice — one repo, one folder per game under `games/`.

## Games

| Game | Folder | Subject |
|------|--------|---------|
| Mapmaster | `games/mapmaster/` | World geography |

Planned: math, language, books/facts from reading, chess.

## Conventions

- Each game lives in its own folder under `games/` and is self-contained (its own README, assets, and — only if it needs one — its own `package.json`).
- Prefer static HTML/JS/CSS with no build step, like Mapmaster. Open the game's `index.html` directly or serve the repo root with any static server.
- Shared code (score tracking, streaks, spaced repetition) goes in `lib/` when a second game actually needs it — not before.
- Game data files (country lists, vocab decks, fact banks) live in the game's own `data/` folder.

## Running a game locally

```sh
npx serve .
# then open http://localhost:3000/games/mapmaster/
```
