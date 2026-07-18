import {
  SNAKE_RADIUS,
  SEGMENT_SPACING,
  BASE_SEGMENTS,
  SEGMENTS_PER_FOOD,
  BASE_SPEED,
  SPEED_PER_FOOD,
  MAX_SPEED,
  TURN_RATE,
  ARENA_W,
  ARENA_H,
} from "./config.js";

export function createSnake() {
  const x = ARENA_W / 2;
  const y = ARENA_H / 2;
  const theta = 0;
  // Seed the path extending behind the head so spawn-time segments lie along
  // the initial heading; a single-point path would pad every segment onto the
  // head and instantly trip self-collision.
  const path = [];
  const seedLen = BASE_SEGMENTS * SEGMENT_SPACING + SEGMENT_SPACING * 4;
  for (let d = 0; d <= seedLen; d += SEGMENT_SPACING / 4) {
    path.push({ x: x - Math.cos(theta) * d, y: y - Math.sin(theta) * d });
  }
  return {
    x,
    y,
    theta,
    speed: BASE_SPEED,
    path,
    segments: [],
    segmentCount: BASE_SEGMENTS,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function steer(snake, targetX, targetY, dt) {
  const target = Math.atan2(targetY - snake.y, targetX - snake.x);
  const d = Math.atan2(Math.sin(target - snake.theta), Math.cos(target - snake.theta));
  snake.theta += clamp(d, -TURN_RATE * dt, TURN_RATE * dt);
}

export function moveSnake(snake, dt, speedMult = 1) {
  snake.x += Math.cos(snake.theta) * snake.speed * speedMult * dt;
  snake.y += Math.sin(snake.theta) * snake.speed * speedMult * dt;
  snake.path.unshift({ x: snake.x, y: snake.y });

  const maxLen = snake.segmentCount * SEGMENT_SPACING + SEGMENT_SPACING * 4;
  trimPath(snake, maxLen);
  placeSegments(snake);
}

// Drop path points once the accumulated arc-length exceeds `maxLen`, so the
// path array doesn't grow forever while the snake is alive.
function trimPath(snake, maxLen) {
  const path = snake.path;
  let dist = 0;
  for (let i = 1; i < path.length; i++) {
    dist += distance(path[i - 1], path[i]);
    if (dist > maxLen) {
      path.length = i + 1;
      return;
    }
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Walk the path from the head, accumulating arc-length, and drop a segment
// center every SEGMENT_SPACING units by interpolating between the two
// bracketing path points.
function placeSegments(snake) {
  const path = snake.path;
  const segments = [];
  let targetDist = SEGMENT_SPACING;
  let accum = 0;
  let pi = 0;

  while (segments.length < snake.segmentCount && pi < path.length - 1) {
    const a = path[pi];
    const b = path[pi + 1];
    const segLen = distance(a, b);

    if (accum + segLen >= targetDist) {
      const t = segLen === 0 ? 0 : (targetDist - accum) / segLen;
      segments.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      targetDist += SEGMENT_SPACING;
    } else {
      accum += segLen;
      pi++;
    }
  }

  // Path exhausted before reaching segmentCount (e.g. right after spawn) —
  // pad with the last known point so rendering/collision still have data.
  const last = path[path.length - 1];
  while (segments.length < snake.segmentCount) {
    segments.push({ x: last.x, y: last.y });
  }

  snake.segments = segments;
}

export function updateGrowthAndSpeed(snake, eaten) {
  snake.segmentCount = BASE_SEGMENTS + eaten * SEGMENTS_PER_FOOD;
  snake.speed = Math.min(BASE_SPEED + eaten * SPEED_PER_FOOD, MAX_SPEED);
}

export { SNAKE_RADIUS };
