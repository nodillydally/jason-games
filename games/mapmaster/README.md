# 🌍 Mapmaster

A zero-dependency browser game for learning the map of the world. A country
lights up on the map — can you name it? Or flip it around and find the named
country yourself.

**No build step, no server, no dependencies.** Open `index.html` in a browser
and play. That also means it can be hosted anywhere static files go
(GitHub Pages, Netlify, an S3 bucket…).

## Game modes

| Mode | How it works |
| --- | --- |
| **Classic quiz** | 10 rounds. A country is highlighted (with an auto-zoom to its region) and you identify it. |
| **Blitz ⏱** | 60 seconds on the clock — answer as many as you can. |
| **Marathon 💀** | Endurance run: 3 lives, questions keep coming until you've missed three. |
| **Find it 🎯** | The reverse: you're given a country name (or capital, or flag) and have to click the country on the map. Pan and pinch-zoom the map (drag / scroll-wheel on desktop) to hunt down the small ones. |
| **Review 📚** | Drills only the countries you've missed before, until you master them (85%+ accuracy graduates them out of the deck). |
| **Explore 🧭** | No score, no pressure. Hover and click around the map to learn names, capitals, and flags. |

## Question types

Every scored mode can quiz on any of these (or a mix):

- **Locations 🗺️** — a country is highlighted, name it (the original game)
- **Capitals 🏛️** — "What's the capital of Kenya?"
- **Flags 🚩** — a flag is shown (emoji, no image assets); name the country. The
  map stays neutral until you answer, then reveals where the country is.
- **Mix 🎲** — random per question

## Regions

Play the whole world or focus on one region: Africa, Americas, Asia, Europe,
North America, South America, or Oceania. 172 countries total (Natural Earth
1:110m dataset — most microstates aren't in it at this scale).

## Difficulty

| | Quiz / Blitz | Find it |
| --- | --- | --- |
| **Easy** | 3 multiple-choice options | 3 attempts |
| **Medium** | 6 options, drawn from *neighbouring* countries (much sneakier) | 2 attempts |
| **Hard** | Type the name yourself — accent-insensitive with small-typo tolerance ("Kyrgystan" still counts) | 1 attempt |

## Progression

- **Points** per correct answer scale with difficulty (100/150/200) plus a
  streak bonus (🔥 up to +50).
- **XP & levels**: every game converts points to XP; levels get progressively
  harder to reach.
- **Personal bests** are tracked per mode + region + difficulty combination.
- **Adaptive practice**: the game remembers which countries you miss and quietly
  serves them more often until you learn them.
- **Stats screen**: per-continent mastery rings with 🥉🥈🥇 badges (40/70/90%
  average accuracy) and a "trouble spots" list of your weakest countries.
- Everything persists in `localStorage` — no accounts, no backend.

## Project layout

```
world-map-game/
├── index.html            # markup, screen structure
├── style.css             # all styling (dark theme)
├── game.js               # game logic, map camera, persistence
├── data/countries.js     # generated country data (SVG paths + metadata)
└── tools/
    └── generate-map-data.mjs   # regenerates data/countries.js
```

## Regenerating the map data

`data/countries.js` is generated from public-domain
[Natural Earth](https://www.naturalearthdata.com/) geometry (via the
`world-atlas` package) joined with `world-countries` metadata:

```bash
cd tools
npm install world-atlas@2 topojson-client@3 d3-geo@3 world-countries@5
node generate-map-data.mjs ../data/countries.js
```

## Ideas for future versions

- Daily challenge: date-seeded questions with a Wordle-style shareable score
- Two-player pass-and-play or head-to-head timer duels
- PWA manifest + service worker for install-to-home-screen and offline play
