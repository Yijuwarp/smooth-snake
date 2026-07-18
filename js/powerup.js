import { ARENA_W, ARENA_H, WALL_MARGIN, POWER_UP_RADIUS, FOOD_RADIUS, SPIKE_RADIUS, SNAKE_RADIUS, getUiSafeZones } from "./config.js";
import { clearOfUiZones } from "./collision.js";

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Rejection-samples a power-up position clear of walls, spikes, the snake's
// own body, the current food pickup, and the on-canvas HUD. Returns null if
// no valid spot was found (extremely unlikely) — the caller just skips
// spawning that tick and retries later.
export function spawnPowerUp(spikes, segments, food, rng = Math.random) {
  const spikeClearance = SPIKE_RADIUS + POWER_UP_RADIUS;
  const bodyClearance = SNAKE_RADIUS + POWER_UP_RADIUS;
  const foodClearance = FOOD_RADIUS + POWER_UP_RADIUS + 6;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const x = WALL_MARGIN + rng() * (ARENA_W - 2 * WALL_MARGIN);
    const y = WALL_MARGIN + rng() * (ARENA_H - 2 * WALL_MARGIN);

    if (!clearOfUiZones(x, y, POWER_UP_RADIUS, getUiSafeZones())) continue;
    if (food && dist(x, y, food.x, food.y) < foodClearance) continue;

    let clear = true;
    for (const s of spikes) {
      if (dist(x, y, s.x, s.y) < spikeClearance) {
        clear = false;
        break;
      }
    }
    if (clear) {
      for (const seg of segments) {
        if (dist(x, y, seg.x, seg.y) < bodyClearance) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return { x, y };
  }

  return null;
}
