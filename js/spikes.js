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
  MAX_MOVING_SPIKES,
  SPIKE_SELECT_INTERVAL,
  SPIKE_SHAKE_TIME,
  SPIKE_MOVE_SPEED,
  SPIKE_MOVE_TIME,
} from "./config.js";

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

// --- Level 2: wandering spikes ---------------------------------------------
// At most MAX_MOVING_SPIKES are awake at once ("awake" starts at the shake).
// Every SPIKE_SELECT_INTERVAL seconds, if a slot is free, a random idle spike
// wakes: it shakes in place as a warning, then glides in a straight line,
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

export function updateSpikes(game, dt, rng = Math.random) {
  if (game.level < 2) return;

  game.spikeTimer -= dt;
  if (game.spikeTimer <= 0) {
    game.spikeTimer = SPIKE_SELECT_INTERVAL;
    const idle = game.spikes.filter((s) => !isAwake(s));
    const awakeCount = game.spikes.length - idle.length;
    if (awakeCount < MAX_MOVING_SPIKES && idle.length > 0) {
      const s = idle[Math.floor(rng() * idle.length)];
      s.phase = "shake";
      s.t = 0;
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
        if (clearOfOthers(s, game.spikes)) {
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
