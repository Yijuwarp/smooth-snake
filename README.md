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

## Scoring

- Each pickup is worth its current multiplier in points.
- Reach the next pickup within 5 seconds and the multiplier climbs; miss the window and it resets to ×1.
- Levels at 50 / 200 / 500 points. From level 2, pickups are worth 3 base points and up to two spikes at a time wake up, shake, and wander.
- Your personal high score persists in `localStorage`. See below for the shared leaderboard.

## Leaderboard

A shared top-10 leaderboard lives behind [api/highscore.js](api/highscore.js), a single Vercel serverless function with no npm dependencies — it talks to Vercel KV (Upstash Redis) over its REST API using the built-in `fetch`.

- **GET `/api/highscore`** — returns the current top 10 as `{ scores: [{ nickname, score }, ...] }`, highest first.
- **POST `/api/highscore`** — body `{ nickname, score }`. `nickname` must be 1-6 alphanumeric characters (case-insensitive, stored uppercase); `score` must be a positive integer. Adds the entry, prunes the underlying set down to the 100 highest scores, and returns the fresh top 10.
- If `KV_REST_API_URL`/`KV_REST_API_TOKEN` aren't set, both methods return `503` so the frontend can fail gracefully (leaderboard panel just shows "Leaderboard unavailable").

Frontend behavior ([js/main.js](js/main.js)):
- Fetches and renders the top 10 into `#leaderboard-container` on load; the panel is only shown while `game.state` is `"menu"` or `"gameover"` (hidden during actual play).
- A run only triggers the nickname-submission modal (`#highscore-submit-modal`) if its score beats the current #10 in the last-known leaderboard snapshot (`qualifiesForLeaderboard` in main.js) — not on every game over. If the leaderboard couldn't be fetched, no prompt is shown (a POST would likely fail anyway).
- [js/game.js](js/game.js) stays leaderboard-agnostic: `endGame()` just calls `game.onGameOver(score)` whenever `score > 0`; main.js decides whether that's worth a prompt.
- [js/input.js](js/input.js)'s global keydown handler skips Enter/Esc/M while a text `<input>` is focused, so typing a nickname doesn't restart the game or toggle audio.

### Storage internals

Scores live in one Redis sorted set (`ZADD`/`ZREVRANGE`/`ZREMRANGEBYRANK`). Members are encoded as `NICKNAME:TIMESTAMP:RANDOM` so repeated nicknames/scores don't collide as sorted-set members; the nickname is recovered on read by splitting on the first `:` (nicknames are validated to never contain one). Because nicknames are variable-length (1-6 chars), **don't** go back to a fixed-length slice to parse them out — that was an actual bug caught during development (a 2-char nickname's score got parsed by grabbing part of the timestamp instead).

### Provisioning Vercel KV

The project needs an Upstash-backed Vercel KV database connected, which provides `KV_REST_API_URL`/`KV_REST_API_TOKEN`. Easiest via the Vercel CLI once the project is linked (`vercel link`):

```
vercel integration add upstash/upstash-kv --plan free -e production -e preview -e development
```

This installs the integration, provisions a free-tier Redis resource, connects it to the linked project across all environments, and pulls the env vars into `.env.local` (gitignored). The first run may return `action_required` asking you to accept Upstash's marketplace terms in a browser — that's a real EULA acceptance tied to the account and needs a human, not something to automate; open the given `verification_uri`, accept, then re-run the same command.

For local dev against the real database, use `vercel dev` (not a plain static server — that can't serve `/api/*` at all).

## Deploying

Pure static files — any static host works for the frontend. For Vercel: import the repo (framework preset: **Other**, no build command, output directory: root) or run `vercel` from this folder. The `/api/highscore` endpoint additionally needs Vercel KV provisioned and connected — see [Provisioning Vercel KV](#provisioning-vercel-kv) above.

## Code layout

Ten small ES modules under `js/`, one plain `game` state object passed into `update(game, dt)` / `render(game, ctx)` functions. All tuning constants live in [js/config.js](js/config.js). The design doc is [PLAN.html](PLAN.html). The one serverless function lives outside `js/`, at [api/highscore.js](api/highscore.js) (see [Leaderboard](#leaderboard) above) — it runs on Vercel's Node runtime, not in the browser, so it isn't part of the `game`/`update`/`render` module graph.

## Credits

- Music: three CC0 lofi tracks by **omfgdude** (one loop-edited by **qubodup**) from [OpenGameArt.org](https://opengameart.org) — see [music/CREDITS.txt](music/CREDITS.txt).
- All sound effects are synthesized at runtime with the Web Audio API.
