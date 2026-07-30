import { SNAKE_RADIUS, FOOD_RADIUS, STAR_RADIUS, SPIKE_RADIUS, POWER_UP_RADIUS, BODY_DIAMETER, NECK_GRACE_SEGMENTS, ARENA_W, ARENA_H } from "./config.js";

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

export function hitsFood(snake, food) {
  const sr = snake.radius || SNAKE_RADIUS;
  const r = food.isStar ? STAR_RADIUS : FOOD_RADIUS;
  return dist(snake.x, snake.y, food.x, food.y) < sr + r;
}

export function hitsPowerUp(snake, powerUp) {
  if (!powerUp) return false;
  const sr = snake.radius || SNAKE_RADIUS;
  return dist(snake.x, snake.y, powerUp.x, powerUp.y) < sr + POWER_UP_RADIUS;
}

// Returns the specific spike touching the head (or null), so the caller can
// compute a bounce normal off that spike's center. Only the head is ever
// checked against spikes — tail contact (even with an enlarged, level-3
// growing spike) never damages the snake.
export function findHitSpike(snake, spikes) {
  const sr = snake.radius || SNAKE_RADIUS;
  for (const s of spikes) {
    const r = SPIKE_RADIUS * (s.sizeMult || 1);
    if (dist(snake.x, snake.y, s.x, s.y) < sr + r) return s;
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
  const sr = snake.radius || SNAKE_RADIUS;
  return (
    snake.x - sr < 0 ||
    snake.y - sr < 0 ||
    snake.x + sr > ARENA_W ||
    snake.y + sr > ARENA_H
  );
}

export function findHitSegment(snake) {
  const sr = snake.radius || SNAKE_RADIUS;
  const segments = snake.segments;
  const segCount = segments.length;
  for (let i = NECK_GRACE_SEGMENTS; i < segCount; i++) {
    const seg = segments[i];
    const t = segCount > 1 ? i / (segCount - 1) : 0;
    // Segment radius matches the visual rendering in render.js: sr * (1.0 - t * 0.45)
    const segRadius = sr * (1.0 - t * 0.45);
    const threshold = sr + segRadius;
    if (dist(snake.x, snake.y, seg.x, seg.y) < threshold) {
      return { segment: seg, radius: segRadius };
    }
  }
  return null;
}


export function hitsSelf(snake) {
  return findHitSegment(snake) !== null;
}


