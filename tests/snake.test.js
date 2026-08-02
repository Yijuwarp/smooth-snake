import test from "node:test";
import assert from "node:assert/strict";
import { createSnake, steer, moveSnake, wrapSnake, bounceOffWall, updateGrowthAndSpeed } from "../js/snake.js";
import { ARENA_W, ARENA_H, BASE_SPEED, MAX_SPEED, BASE_SEGMENTS, SEGMENTS_PER_FOOD } from "../js/config.js";

test("createSnake initializes default properties", () => {
  const snake = createSnake();
  assert.equal(snake.x, ARENA_W / 2);
  assert.equal(snake.y, ARENA_H / 2);
  assert.equal(snake.theta, 0);
  assert.equal(snake.speed, BASE_SPEED);
  assert.equal(snake.segmentCount, BASE_SEGMENTS);
  assert.ok(snake.path.length > 0);
});

test("steer adjusts heading toward target point", () => {
  const snake = createSnake();
  const dt = 0.1;
  // Target is directly above head (theta = Math.PI / 2)
  steer(snake, snake.x, snake.y + 100, dt, 4.0);
  assert.ok(snake.theta > 0, "Heading should adjust upward");
});

test("moveSnake advances head and updates path", () => {
  const snake = createSnake();
  const startX = snake.x;
  moveSnake(snake, 0.1, 1, 1);
  assert.ok(snake.x > startX, "Snake head should advance forward");
  assert.equal(snake.path[0].x, snake.x);
  assert.equal(snake.path[0].y, snake.y);
});

test("wrapSnake teleports head across arena boundaries", () => {
  const snake = createSnake();
  snake.x = -5; // Left boundary breach
  wrapSnake(snake);
  assert.ok(snake.x > ARENA_W / 2, "Snake should teleport to right boundary");
});

test("bounceOffWall reflects heading off boundary", () => {
  const snake = createSnake();
  snake.x = -5; // Over left wall
  snake.theta = Math.PI; // Heading left
  bounceOffWall(snake);
  assert.ok(snake.x > 0, "Snake should be pushed clear of left wall");
  assert.ok(Math.abs(snake.theta) < 1e-10, "Heading should invert to face right");
});

test("updateGrowthAndSpeed calculates segments and speed correctly", () => {
  const snake = createSnake();
  updateGrowthAndSpeed(snake, 5, MAX_SPEED);
  assert.equal(snake.segmentCount, BASE_SEGMENTS + 5 * SEGMENTS_PER_FOOD);
  assert.ok(snake.speed > BASE_SPEED);
  assert.ok(snake.speed <= MAX_SPEED);
});
