import { SNAKE_RADIUS, FOOD_RADIUS, SPIKE_RADIUS, BODY_DIAMETER, NECK_GRACE_SEGMENTS, ARENA_W, ARENA_H } from "./config.js";

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

export function hitsFood(snake, food) {
  return dist(snake.x, snake.y, food.x, food.y) < SNAKE_RADIUS + FOOD_RADIUS;
}

export function hitsSpike(snake, spikes) {
  for (const s of spikes) {
    if (dist(snake.x, snake.y, s.x, s.y) < SNAKE_RADIUS + SPIKE_RADIUS) return true;
  }
  return false;
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
