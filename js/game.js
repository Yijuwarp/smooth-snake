import {
  ARENA_W,
  ARENA_H,
  COMBO_WINDOW,
  BOOST_SPEED_MULT,
  SLOW_SPEED_MULT,
  BOOST_DRAIN_PER_SEC,
  BOOST_RECHARGE_PER_FOOD,
  LEVEL_THRESHOLDS,
  LEVEL_TRANSITION_TIME,
  FINAL_LEVEL,
  LEVEL_BANNER_DURATION,
  LEVEL_TIME_SCALE,
  FOOD_VALUE_LEVEL2,
  FOOD_VALUE_LEVEL3,
  MAX_HEARTS,
  INVULN_TIME,
  HIT_FLASH_DURATION,
  LIFE_BONUS,
  SPEED_BONUS,
} from "./config.js";
import { createSnake, steer, moveSnake, updateGrowthAndSpeed, bounceOffWall, bounceOffSpike } from "./snake.js";
import { generateSpikes, updateSpikes } from "./spikes.js";
import { spawnFood } from "./food.js";
import { hitsFood, findHitSpike, hitsWall, hitsSelf } from "./collision.js";
import { getHighScore, setHighScore } from "./storage.js";
import { playEat, playDeath, playLevelUp, playHit, playWin } from "./audio.js";

function levelForScore(score) {
  let level = 1;
  for (const t of LEVEL_THRESHOLDS) if (score >= t) level++;
  return level;
}

function foodValueForLevel(level) {
  if (level >= 3) return FOOD_VALUE_LEVEL3;
  if (level >= 2) return FOOD_VALUE_LEVEL2;
  return 1;
}

function bannerTitle(level) {
  return level >= FINAL_LEVEL ? "FINAL LEVEL" : `LEVEL ${level}`;
}

function bannerSubtitle(level) {
  switch (level) {
    case 2:
      return "The spikes are waking up · pickups now worth ×3";
    case 3:
      return "Watch for swelling spikes · pickups now worth ×5";
    case 4:
      return "Every spike is loose — grab the star to win!";
    default:
      return "";
  }
}

export function createGame() {
  return {
    state: "menu", // 'menu' | 'playing' | 'paused' | 'gameover'
    snake: createSnake(),
    spikes: [],
    food: { x: ARENA_W / 2 + 150, y: ARENA_H / 2 },
    eaten: 0,
    score: 0,
    multiplier: 1,
    comboTimer: 0,
    boost: 1,
    boosting: false,
    slowing: false,
    level: 1,
    banner: null, // { t, title, subtitle } while a slow-mo banner runs
    spikeTimer: 0,
    lastGrownSpikes: [],
    hearts: MAX_HEARTS,
    neverLostHeart: true,
    invulnTimer: 0,
    hitFlash: 0,
    levelTimer: 0,
    speedBonusCount: 0,
    won: false,
    finalBreakdown: null,
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
  game.slowing = false;
  game.level = 1;
  game.banner = { t: 0, title: "GAME START", subtitle: "" };
  game.spikeTimer = 0;
  game.lastGrownSpikes = [];
  game.hearts = MAX_HEARTS;
  game.neverLostHeart = true;
  game.invulnTimer = 0;
  game.hitFlash = 0;
  game.levelTimer = 0;
  game.speedBonusCount = 0;
  game.won = false;
  game.finalBreakdown = null;
  updateGrowthAndSpeed(game.snake, 0);
  game.food = spawnFood([], game.snake.segments);
  game.spikes = generateSpikes({ x: game.snake.x, y: game.snake.y }, game.food);
  game.state = "playing";
}

// A level-up applies regardless of trigger; only a score-triggered one earns
// the speed bonus. The 30s-per-level timer always restarts from here.
function applyLevelUp(game, newLevel, trigger) {
  game.level = newLevel;
  game.banner = { t: 0, title: bannerTitle(newLevel), subtitle: bannerSubtitle(newLevel) };
  game.levelTimer = 0;
  game.hearts = Math.min(MAX_HEARTS, game.hearts + 1);
  if (trigger === "score") game.speedBonusCount++;
  if (newLevel >= FINAL_LEVEL) game.food.isStar = true;
  playLevelUp();
}

export function update(game, dt) {
  game.time += dt;
  if (game.state !== "playing") return;

  // Level-up / game-start banner: the banner itself runs on real time,
  // gameplay below runs at a crawl until it finishes.
  if (game.banner) {
    game.banner.t += dt;
    if (game.banner.t >= LEVEL_BANNER_DURATION) game.banner = null;
    dt *= LEVEL_TIME_SCALE;
  }

  if (game.invulnTimer > 0) game.invulnTimer = Math.max(0, game.invulnTimer - dt);
  if (game.hitFlash > 0) game.hitFlash = Math.max(0, game.hitFlash - dt);

  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.comboTimer = 0;
      game.multiplier = 1;
    }
  }

  // Boost and the right-click "precision" slow share one meter; if both are
  // somehow held at once, boost wins.
  let speedMult = 1;
  if (game.boosting && game.boost > 0) {
    game.boost = Math.max(0, game.boost - BOOST_DRAIN_PER_SEC * dt);
    speedMult = BOOST_SPEED_MULT;
  } else if (game.slowing && game.boost > 0) {
    game.boost = Math.max(0, game.boost - BOOST_DRAIN_PER_SEC * dt);
    speedMult = SLOW_SPEED_MULT;
  }

  const snake = game.snake;
  steer(snake, game.mouse.x, game.mouse.y, dt);
  moveSnake(snake, dt, speedMult);
  updateSpikes(game, dt);

  // Self-collision is still an instant kill — only wall/spike hits bounce.
  if (hitsSelf(snake)) {
    endGame(game, false);
    return;
  }

  const wallHit = hitsWall(snake);
  const hitSpike = wallHit ? null : findHitSpike(snake, game.spikes);
  if ((wallHit || hitSpike) && game.invulnTimer <= 0) {
    if (wallHit) bounceOffWall(snake);
    else bounceOffSpike(snake, hitSpike);

    game.hearts--;
    game.neverLostHeart = false;
    game.invulnTimer = INVULN_TIME;
    game.hitFlash = HIT_FLASH_DURATION;

    if (game.hearts <= 0) {
      endGame(game, false);
      return;
    }
    playHit();
  }

  if (hitsFood(snake, game.food)) {
    const wasStar = !!game.food.isStar;
    game.eaten++;
    game.multiplier = game.comboTimer > 0 ? game.multiplier + 1 : 1;
    game.score += game.multiplier * foodValueForLevel(game.level);
    game.comboTimer = COMBO_WINDOW;
    game.boost = Math.min(1, game.boost + BOOST_RECHARGE_PER_FOOD);
    updateGrowthAndSpeed(snake, game.eaten);

    if (wasStar) {
      endGame(game, true);
      return;
    }

    playEat(game.multiplier);
    game.food = spawnFood(game.spikes, snake.segments);

    const newLevel = levelForScore(game.score);
    if (newLevel > game.level) applyLevelUp(game, newLevel, "score");
  }

  if (game.level < FINAL_LEVEL) {
    game.levelTimer += dt;
    if (game.levelTimer >= LEVEL_TRANSITION_TIME) {
      applyLevelUp(game, game.level + 1, "time");
    }
  }
}

function endGame(game, won) {
  game.won = won;
  game.state = "gameover";

  const lifeBonus = game.neverLostHeart ? LIFE_BONUS : 0;
  const speedBonusTotal = game.speedBonusCount * SPEED_BONUS;
  game.finalBreakdown = { base: game.score, lifeBonus, speedBonus: speedBonusTotal, total: game.score + lifeBonus + speedBonusTotal };
  game.score = game.finalBreakdown.total;

  if (won) playWin();
  else playDeath();

  if (game.score > game.highScore) {
    game.highScore = game.score;
    setHighScore(game.highScore);
  }
}
