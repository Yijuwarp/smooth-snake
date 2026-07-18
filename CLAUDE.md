# Agent notes for smooth-snake

Read [README.md](README.md) first for what the game is and how it's structured. This file is operational notes for making changes — things that aren't obvious from reading the code once.

## Hard constraints

- **Zero npm dependencies, no build step.** Don't add a `package.json`, bundler, or any `import` that isn't a relative path to another file in this repo. `api/highscore.js` talks to Upstash's REST API with the built-in `fetch` specifically to avoid needing the `@upstash/redis` SDK.
- **One `game` state object.** Gameplay logic lives in `update(game, dt)` ([js/game.js](js/game.js)); drawing lives in `render(game, ctx, canvas)` ([js/render.js](js/render.js)). Neither should reach into the DOM — DOM-facing wiring (pause menu, leaderboard panel, nickname modal) belongs in [js/main.js](js/main.js). `game.js` exposes hooks like `game.onGameOver(score)` rather than importing DOM logic directly, so it stays testable/leaderboard-agnostic.

## Leaderboard feature — gotchas

- **Member parsing must split on `:`, never slice by length.** Nicknames are 1-6 chars (variable length), sorted-set members are `NICKNAME:TIMESTAMP:RANDOM`. A fixed `slice(0, 6)` silently corrupts short nicknames' associated data (it used to be exactly-6-chars-only; this was relaxed and the parsing bug was caught by the regression test in the section below). If you touch nickname length rules again, re-check `parseEntries` in [api/highscore.js](api/highscore.js).
- **Rank-gating is client-side, in `js/main.js`** (`qualifiesForLeaderboard`), not enforced by the API — the API accepts any valid score and just returns the fresh top 10. This is deliberate: the server doesn't need to know *why* a submission happened, and the UI-only gate is enough since the stakes are a casual leaderboard, not a competitive one.
- **`.env.local` holds real credentials** (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) and is gitignored (`.env*`). Never read it into a message or commit it.

## Testing without a real Redis

There's no committed test suite (zero-dependency project, no test runner). When changing `api/highscore.js`, write a throwaway Node script in your scratch/temp directory (not in the repo) that:
1. Sets `process.env.KV_REST_API_URL`/`KV_REST_API_TOKEN` to dummy values.
2. Mocks `global.fetch` to emulate Upstash's REST command surface (`zadd`, `zrevrange ... withscores`, `zremrangebyrank`) against an in-memory `Map`.
3. `import()`s the handler and calls it with fake `{method, body}` req / `{status,json,setHeader}` res objects.

For real end-to-end verification (actual Redis, actual static files, actual `/api/*` routing), use `vercel dev` from this folder — a plain static server (`python -m http.server`) cannot exercise the API at all.

## Provisioning / environment

KV isn't provisioned by cloning the repo — it's a per-Vercel-project resource. See the [Provisioning Vercel KV](README.md#provisioning-vercel-kv) section in the README for the exact CLI command. Note the terms-acceptance step needs a human in the browser; don't try to script around it.

`vercel integration add` also drops agent-skill tooling into the repo as a side effect (`.agents/`, `.claude/skills/`, `skills-lock.json`) — these are unrelated to the game and were deliberately left out of the leaderboard commit. Decide fresh each time whether they belong in a commit; don't assume.

## Browser verification caveats

This is a canvas game with Web Audio sound effects and music. If you're driving it via automated browser tools:
- Any click/interaction on the canvas can start audio playback — avoid it if the user hasn't asked for a live playthrough, and stop/close the tab promptly if you did open one.
- Screenshot-based tools have been flaky against this specific canvas (large backing store) in at least one session — if `computer{action:"screenshot"}` times out repeatedly, fall back to `read_page`/`javascript_tool` (DOM state, not pixels) or API-level `curl` checks rather than fighting the screenshot tool. If it's still unreliable, just start the dev server and hand off to the user for manual UAT rather than burning turns on workarounds.

## Git workflow

This repo uses feature branches + PRs (see `git log --oneline`, e.g. PR #1, #2), merged with a regular merge commit (not squash) via `gh pr merge --merge`. Keep unrelated tooling artifacts (see above) out of feature commits.
