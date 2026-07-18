import {
  ARENA_W,
  ARENA_H,
  WALL_MARGIN,
  SPIKE_COUNT,
  SPIKE_RADIUS,
  MIN_SPIKE_GAP,
  SPAWN_CLEAR,
  MAX_PLACE_ATTEMPTS,
  REACH_CELL,
  SNAKE_RADIUS,
  MAX_MOVING_SPIKES_LEVEL2,
  SPIKE_SELECT_INTERVAL,
  SPIKE_SHAKE_TIME,
  SPIKE_MOVE_SPEED,
  SPIKE_MOVE_TIME,
  FINAL_LEVEL,
  GROW_SPIKE_COUNT,
  GROW_CYCLE_TIME,
  GROW_MAX_MULT,
  GROW_SPIN_SPEED,
  UI_SAFE_ZONES,
} from "./config.js";
import { clearOfUiZones } from "./collision.js";

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function withinWallMargin(x, y) {
  return (
    x < WALL_MARGIN ||
    y < WALL_MARGIN ||
    x > ARENA_W - WALL_MARGIN ||
    y > ARENA_H - WALL_MARGIN
  );
}

// Layer 1: dart-throwing rejection sampling.
function placeSpikes(spawn, food, rng) {
  const spikes = [];
  let attempts = 0;

  while (spikes.length < SPIKE_COUNT && attempts < MAX_PLACE_ATTEMPTS) {
    attempts++;
    const x = rng() * ARENA_W;
    const y = rng() * ARENA_H;

    if (withinWallMargin(x, y)) continue;
    if (dist(x, y, spawn.x, spawn.y) < SPAWN_CLEAR) continue;
    if (dist(x, y, food.x, food.y) < SPAWN_CLEAR) continue;
    // Level 3 can grow this spike up to GROW_MAX_MULT, so clear enough room
    // now that it never ends up spawning under/behind the HUD once enlarged.
    if (!clearOfUiZones(x, y, SPIKE_RADIUS * GROW_MAX_MULT, UI_SAFE_ZONES)) continue;

    let ok = true;
    for (const s of spikes) {
      if (dist(x, y, s.x, s.y) < MIN_SPIKE_GAP) {
        ok = false;
        break;
      }
    }
    if (ok) spikes.push({ x, y });
  }

  return spikes;
}

// Layer 2: grid-based reachability check via BFS flood-fill from the spawn
// cell. Returns true iff every free (unblocked) cell is reachable.
function validateReachability(spikes, spawn) {
  const cols = Math.ceil(ARENA_W / REACH_CELL);
  const rows = Math.ceil(ARENA_H / REACH_CELL);
  const blocked = new Array(cols * rows).fill(false);
  const clearance = SPIKE_RADIUS + SNAKE_RADIUS;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const centerX = (cx + 0.5) * REACH_CELL;
      const centerY = (cy + 0.5) * REACH_CELL;
      for (const s of spikes) {
        if (dist(centerX, centerY, s.x, s.y) < clearance) {
          blocked[cy * cols + cx] = true;
          break;
        }
      }
    }
  }

  const spawnCol = clamp(Math.floor(spawn.x / REACH_CELL), 0, cols - 1);
  const spawnRow = clamp(Math.floor(spawn.y / REACH_CELL), 0, rows - 1);
  const spawnIdx = spawnRow * cols + spawnCol;

  if (blocked[spawnIdx]) return false;

  const visited = new Array(cols * rows).fill(false);
  const queue = [spawnIdx];
  visited[spawnIdx] = true;

  while (queue.length > 0) {
    const idx = queue.shift();
    const cx = idx % cols;
    const cy = Math.floor(idx / cols);
    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nIdx = ny * cols + nx;
      if (visited[nIdx] || blocked[nIdx]) continue;
      visited[nIdx] = true;
      queue.push(nIdx);
    }
  }

  for (let i = 0; i < blocked.length; i++) {
    if (!blocked[i] && !visited[i]) return false;
  }
  return true;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Regenerates the full layout until it passes the reachability check.
// `rng` is injectable for deterministic testing; defaults to Math.random.
export function generateSpikes(spawn, food, rng = Math.random) {
  let spikes;
  do {
    spikes = placeSpikes(spawn, food, rng);
  } while (!validateReachability(spikes, spawn));
  return spikes;
}

export { validateReachability, placeSpikes };

// --- Wandering spikes (level 2, and every spike at the final level) -------
// At most a level-dependent number are awake at once ("awake" starts at the
// shake). At the final level every spike wakes at once and never settles —
// it just keeps re-randomizing its direction. Otherwise: every
// SPIKE_SELECT_INTERVAL seconds, if a slot is free, a random idle spike
// wakes, shakes in place as a warning, then glides in a straight line,
// bouncing off wall margins, and settles only where it keeps MIN_SPIKE_GAP
// from its neighbors (so corridors stay threadable).

function isAwake(s) {
  return s.phase === "shake" || s.phase === "move";
}

function randomDirection(s, rng) {
  const a = rng() * Math.PI * 2;
  s.vx = Math.cos(a) * SPIKE_MOVE_SPEED;
  s.vy = Math.sin(a) * SPIKE_MOVE_SPEED;
}

function clearOfOthers(s, spikes) {
  for (const other of spikes) {
    if (other !== s && dist(s.x, s.y, other.x, other.y) < MIN_SPIKE_GAP) return false;
  }
  return true;
}

function maxMovingSpikesForLevel(level) {
  if (level >= FINAL_LEVEL) return Infinity;
  if (level >= 2) return MAX_MOVING_SPIKES_LEVEL2;
  return 0;
}

// --- Growing spikes (level 3, replaces the wandering cap-increase) -------
// Spikes never move position at level 3. Instead, GROW_SPIKE_COUNT random
// idle spikes spin in place and swell to GROW_MAX_MULT× their radius and
// back over one GROW_CYCLE_TIME-second cycle (a single sine hump handles the
// grow-then-shrink shape), then a different pair is chosen for the next
// cycle. The collision radius scales with them (see collision.js/snake.js),
// but only the head is ever checked against a spike — an enlarged spike
// touching the tail still can't hurt the snake.
function updateGrowingSpikes(game, dt, rng) {
  game.spikeTimer -= dt;
  if (game.spikeTimer <= 0) {
    game.spikeTimer = GROW_CYCLE_TIME;

    // Safety net: force-finish any spike still active from a prior cycle
    // (should already be done, since the cycle length matches the timer).
    for (const s of game.spikes) {
      if (s.growActive) {
        s.growActive = false;
        s.growT = 0;
        s.rotation = 0;
        s.sizeMult = 1;
      }
    }

    const prev = game.lastGrownSpikes || [];
    let pool = game.spikes.filter((s) => !prev.includes(s));
    if (pool.length < GROW_SPIKE_COUNT) pool = [...game.spikes];

    const chosen = [];
    for (let i = 0; i < GROW_SPIKE_COUNT && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      chosen.push(pool.splice(idx, 1)[0]);
    }
    for (const s of chosen) {
      s.growActive = true;
      s.growT = 0;
      s.rotation = 0;
    }
    game.lastGrownSpikes = chosen;
  }

  for (const s of game.spikes) {
    if (!s.growActive) {
      s.sizeMult = 1;
      continue;
    }
    s.growT += dt;
    s.rotation += GROW_SPIN_SPEED * dt;
    const frac = Math.min(1, s.growT / GROW_CYCLE_TIME);
    s.sizeMult = 1 + (GROW_MAX_MULT - 1) * Math.sin(Math.PI * frac);
    if (s.growT >= GROW_CYCLE_TIME) {
      s.growActive = false;
      s.sizeMult = 1;
      s.rotation = 0;
    }
  }
}

export function updateSpikes(game, dt, rng = Math.random) {
  if (game.level < 2) return;

  if (game.level === 3) {
    updateGrowingSpikes(game, dt, rng);
    return;
  }

  const final = game.level >= FINAL_LEVEL;

  if (final) {
    // Wake everything at once; idempotent once all spikes are awake.
    for (const s of game.spikes) {
      if (!isAwake(s)) {
        s.phase = "shake";
        s.t = 0;
      }
    }
  } else {
    game.spikeTimer -= dt;
    if (game.spikeTimer <= 0) {
      game.spikeTimer = SPIKE_SELECT_INTERVAL;
      const idle = game.spikes.filter((s) => !isAwake(s));
      const awakeCount = game.spikes.length - idle.length;
      if (awakeCount < maxMovingSpikesForLevel(game.level) && idle.length > 0) {
        const s = idle[Math.floor(rng() * idle.length)];
        s.phase = "shake";
        s.t = 0;
      }
    }
  }

  for (const s of game.spikes) {
    if (s.phase === "shake") {
      s.t += dt;
      if (s.t >= SPIKE_SHAKE_TIME) {
        s.phase = "move";
        s.t = 0;
        randomDirection(s, rng);
      }
    } else if (s.phase === "move") {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < WALL_MARGIN || s.x > ARENA_W - WALL_MARGIN) {
        s.vx = -s.vx;
        s.x = clamp(s.x, WALL_MARGIN, ARENA_W - WALL_MARGIN);
      }
      if (s.y < WALL_MARGIN || s.y > ARENA_H - WALL_MARGIN) {
        s.vy = -s.vy;
        s.y = clamp(s.y, WALL_MARGIN, ARENA_H - WALL_MARGIN);
      }
      if (s.t >= SPIKE_MOVE_TIME) {
        if (final) {
          // Never settle at the final level — just keep gliding.
          s.t = 0;
          randomDirection(s, rng);
        } else if (clearOfOthers(s, game.spikes)) {
          s.phase = undefined;
          s.t = 0;
        } else {
          // Too close to a neighbor to settle — keep gliding a new way.
          s.t = SPIKE_MOVE_TIME * 0.6;
          randomDirection(s, rng);
        }
      }
    }
  }
}
