import { ARENA_W, ARENA_H, WALL_MARGIN, FOOD_RADIUS, SPIKE_RADIUS, SNAKE_RADIUS } from "./config.js";

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Rejection-samples a food position clear of walls, spikes, and the snake's
// own body (segment centers).
export function spawnFood(spikes, segments, rng = Math.random) {
  const clearance = SPIKE_RADIUS + FOOD_RADIUS;
  const bodyClearance = SNAKE_RADIUS + FOOD_RADIUS;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const x = WALL_MARGIN + rng() * (ARENA_W - 2 * WALL_MARGIN);
    const y = WALL_MARGIN + rng() * (ARENA_H - 2 * WALL_MARGIN);

    let clear = true;
    for (const s of spikes) {
      if (dist(x, y, s.x, s.y) < clearance) {
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

  // Fallback: arena center, if nothing else validated (extremely unlikely).
  return { x: ARENA_W / 2, y: ARENA_H / 2 };
}
