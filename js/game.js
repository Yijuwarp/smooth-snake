import {
  ARENA_W,
  ARENA_H,
  COMBO_WINDOW,
  BOOST_SPEED_MULT,
  BOOST_DRAIN_PER_SEC,
  BOOST_RECHARGE_PER_FOOD,
  LEVEL_THRESHOLDS,
  LEVEL_BANNER_DURATION,
  LEVEL_TIME_SCALE,
  FOOD_VALUE_LEVEL2,
} from "./config.js";
import { createSnake, steer, moveSnake, updateGrowthAndSpeed } from "./snake.js";
import { generateSpikes, updateSpikes } from "./spikes.js";
import { spawnFood } from "./food.js";
import { hitsFood, hitsSpike, hitsWall, hitsSelf } from "./collision.js";
import { getHighScore, setHighScore } from "./storage.js";
import { playEat, playDeath, playLevelUp } from "./audio.js";

function levelForScore(score) {
  let level = 1;
  for (const t of LEVEL_THRESHOLDS) if (score >= t) level++;
  return level;
}

export function createGame() {
  return {
    state: "menu", // 'menu' | 'playing' | 'gameover'
    snake: createSnake(),
    spikes: [],
    food: { x: ARENA_W / 2 + 150, y: ARENA_H / 2 },
    eaten: 0,
    score: 0,
    multiplier: 1,
    comboTimer: 0,
    boost: 1,
    boosting: false,
    level: 1,
    levelTransition: null, // { t } while the slow-mo banner runs
    spikeTimer: 0,
    highScore: getHighScore(),
    mouse: { x: ARENA_W / 2 + 200, y: ARENA_H / 2 },
    time: 0,
  };
}

export function resetGame(game) {
  game.snake = createSnake();
  game.eaten = 0;
  game.score = 0;
  game.multiplier = 1;
  game.comboTimer = 0;
  game.boost = 1;
  game.boosting = false;
  game.level = 1;
  game.levelTransition = null;
  game.spikeTimer = 0;
  updateGrowthAndSpeed(game.snake, 0);
  game.food = spawnFood([], game.snake.segments);
  game.spikes = generateSpikes({ x: game.snake.x, y: game.snake.y }, game.food);
  game.state = "playing";
}

export function update(game, dt) {
  game.time += dt;
  if (game.state !== "playing") return;

  // Level-up banner: the banner itself runs on real time, gameplay below
  // runs at a crawl until it finishes.
  if (game.levelTransition) {
    game.levelTransition.t += dt;
    if (game.levelTransition.t >= LEVEL_BANNER_DURATION) game.levelTransition = null;
    dt *= LEVEL_TIME_SCALE;
  }

  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.comboTimer = 0;
      game.multiplier = 1;
    }
  }

  let speedMult = 1;
  if (game.boosting && game.boost > 0) {
    game.boost = Math.max(0, game.boost - BOOST_DRAIN_PER_SEC * dt);
    speedMult = BOOST_SPEED_MULT;
  }

  const snake = game.snake;
  steer(snake, game.mouse.x, game.mouse.y, dt);
  moveSnake(snake, dt, speedMult);
  updateSpikes(game, dt);

  if (hitsWall(snake) || hitsSpike(snake, game.spikes) || hitsSelf(snake)) {
    die(game);
    return;
  }

  if (hitsFood(snake, game.food)) {
    game.eaten++;
    game.multiplier = game.comboTimer > 0 ? game.multiplier + 1 : 1;
    const foodValue = game.level >= 2 ? FOOD_VALUE_LEVEL2 : 1;
    game.score += game.multiplier * foodValue;
    game.comboTimer = COMBO_WINDOW;
    game.boost = Math.min(1, game.boost + BOOST_RECHARGE_PER_FOOD);
    playEat(game.multiplier);
    updateGrowthAndSpeed(snake, game.eaten);
    game.food = spawnFood(game.spikes, snake.segments);

    const newLevel = levelForScore(game.score);
    if (newLevel > game.level) {
      game.level = newLevel;
      game.levelTransition = { t: 0 };
      playLevelUp();
    }
  }
}

function die(game) {
  game.state = "gameover";
  playDeath();
  if (game.score > game.highScore) {
    game.highScore = game.score;
    setHighScore(game.highScore);
  }
}
