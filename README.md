# Smooth Snake

A frontend-only browser game: a snake with smooth, continuous movement that steers toward your mouse cursor. Eat pickups to grow longer *and* faster, chain pickups within 5 seconds to build a score multiplier, and hold the mouse button to boost. Avoid the spikes — and from level 2, the spikes start hunting back.

Vanilla JavaScript + HTML5 Canvas. Zero dependencies, no build step.

## Play

Serve the folder with any static server and open it in a browser:

```
python -m http.server 8341
# then open http://localhost:8341
```

(ES modules are blocked on `file://`, so double-clicking `index.html` won't work.)

## Controls

| Input | Action |
|-------|--------|
| Mouse | Steer the snake |
| Hold mouse button | Boost (1.6× speed, drains the meter; +33% refill per pickup) |
| Click / Enter | Start / restart |
| Esc | Pause menu (music & sound volume sliders) |
| M | Mute all audio |
| B | Next music track |

## Scoring

- Each pickup is worth its current multiplier in points.
- Reach the next pickup within 5 seconds and the multiplier climbs; miss the window and it resets to ×1.
- Levels at 50 / 200 / 500 points. From level 2, pickups are worth 3 base points and up to two spikes at a time wake up, shake, and wander.
- High score persists in `localStorage`.

## Deploying

Pure static files — any static host works. For Vercel: import the repo (framework preset: **Other**, no build command, output directory: root) or run `vercel` from this folder.

## Code layout

Ten small ES modules under `js/`, one plain `game` state object passed into `update(game, dt)` / `render(game, ctx)` functions. All tuning constants live in [js/config.js](js/config.js). The design doc is [PLAN.html](PLAN.html).

## Credits

- Music: three CC0 lofi tracks by **omfgdude** (one loop-edited by **qubodup**) from [OpenGameArt.org](https://opengameart.org) — see [music/CREDITS.txt](music/CREDITS.txt).
- All sound effects are synthesized at runtime with the Web Audio API.
