import { ARENA_W, ARENA_H, WALL_MARGIN, FOOD_RADIUS, STAR_RADIUS, SPIKE_RADIUS, SNAKE_RADIUS, UI_SAFE_ZONES } from "./config.js";
import { clearOfUiZones } from "./collision.js";

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Rejection-samples a food position clear of walls, spikes, the snake's own
// body (segment centers), and the on-canvas HUD. Uses STAR_RADIUS (the
// larger of the two pickup sizes) for the HUD clearance so a plain pickup
// that later turns into the level-4 star is still positioned safely.
export function spawnFood(spikes, segments, rng = Math.random) {
  const clearance = SPIKE_RADIUS + FOOD_RADIUS;
  const bodyClearance = SNAKE_RADIUS + FOOD_RADIUS;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const x = WALL_MARGIN + rng() * (ARENA_W - 2 * WALL_MARGIN);
    const y = WALL_MARGIN + rng() * (ARENA_H - 2 * WALL_MARGIN);

    if (!clearOfUiZones(x, y, STAR_RADIUS, UI_SAFE_ZONES)) continue;

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
