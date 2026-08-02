import test from "node:test";
import assert from "node:assert/strict";
import { hitsFood, hitsPowerUp, findHitSpike, hitsWall, findHitSegment, clearOfUiZones } from "../js/collision.js";
import { SNAKE_RADIUS, FOOD_RADIUS, SPIKE_RADIUS, ARENA_W, ARENA_H } from "../js/config.js";

test("hitsFood detects collision with food pellet", () => {
  const snake = { x: 100, y: 100, radius: SNAKE_RADIUS };
  const foodClose = { x: 105, y: 100, isStar: false };
  const foodFar = { x: 200, y: 200, isStar: false };

  assert.equal(hitsFood(snake, foodClose), true);
  assert.equal(hitsFood(snake, foodFar), false);
});

test("hitsPowerUp detects collision with powerup item", () => {
  const snake = { x: 100, y: 100, radius: SNAKE_RADIUS };
  const powerUpClose = { x: 105, y: 100 };
  assert.equal(hitsPowerUp(snake, powerUpClose), true);
  assert.equal(hitsPowerUp(snake, null), false);
});

test("findHitSpike returns hit spike instance or null", () => {
  const snake = { x: 100, y: 100, radius: SNAKE_RADIUS };
  const spikes = [
    { x: 200, y: 200, sizeMult: 1 },
    { x: 105, y: 100, sizeMult: 1 },
  ];
  const hit = findHitSpike(snake, spikes);
  assert.notEqual(hit, null);
  assert.equal(hit.x, 105);
});

test("hitsWall detects arena boundary breach", () => {
  const insideSnake = { x: 100, y: 100, radius: SNAKE_RADIUS };
  const wallSnake = { x: -2, y: 100, radius: SNAKE_RADIUS };
  assert.equal(hitsWall(insideSnake), false);
  assert.equal(hitsWall(wallSnake), true);
});

test("clearOfUiZones checks UI safe margin clearance", () => {
  const zones = [{ x: 50, y: 50, w: 100, h: 100 }];
  assert.equal(clearOfUiZones(60, 60, 10, zones), false);
  assert.equal(clearOfUiZones(200, 200, 10, zones), true);
});
