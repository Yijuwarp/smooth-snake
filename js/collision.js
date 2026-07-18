import { SNAKE_RADIUS, FOOD_RADIUS, STAR_RADIUS, SPIKE_RADIUS, POWER_UP_RADIUS, BODY_DIAMETER, NECK_GRACE_SEGMENTS, ARENA_W, ARENA_H } from "./config.js";

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

export function hitsFood(snake, food) {
  const r = food.isStar ? STAR_RADIUS : FOOD_RADIUS;
  return dist(snake.x, snake.y, food.x, food.y) < SNAKE_RADIUS + r;
}

export function hitsPowerUp(snake, powerUp) {
  if (!powerUp) return false;
  return dist(snake.x, snake.y, powerUp.x, powerUp.y) < SNAKE_RADIUS + POWER_UP_RADIUS;
}

// Returns the specific spike touching the head (or null), so the caller can
// compute a bounce normal off that spike's center. Only the head is ever
// checked against spikes — tail contact (even with an enlarged, level-3
// growing spike) never damages the snake.
export function findHitSpike(snake, spikes) {
  for (const s of spikes) {
    const r = SPIKE_RADIUS * (s.sizeMult || 1);
    if (dist(snake.x, snake.y, s.x, s.y) < SNAKE_RADIUS + r) return s;
  }
  return null;
}

// Inflates each rect by `radius` (so a circle-vs-AABB check reduces to a
// point-vs-inflated-rect check) and reports whether (x, y) clears all of them.
export function clearOfUiZones(x, y, radius, zones) {
  for (const z of zones) {
    if (x + radius > z.x && x - radius < z.x + z.w && y + radius > z.y && y - radius < z.y + z.h) {
      return false;
    }
  }
  return true;
}

export function hitsWall(snake) {
  return (
    snake.x - SNAKE_RADIUS < 0 ||
    snake.y - SNAKE_RADIUS < 0 ||
    snake.x + SNAKE_RADIUS > ARENA_W ||
    snake.y + SNAKE_RADIUS > ARENA_H
  );
}

export function hitsSelf(snake) {
  const threshold = SNAKE_RADIUS + BODY_DIAMETER / 2;
  const segments = snake.segments;
  for (let i = NECK_GRACE_SEGMENTS; i < segments.length; i++) {
    const seg = segments[i];
    if (dist(snake.x, snake.y, seg.x, seg.y) < threshold) return true;
  }
  return false;
}
