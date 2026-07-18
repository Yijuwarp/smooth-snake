import {
  ARENA_W,
  ARENA_H,
  COMBO_WINDOW,
  BOOST_SPEED_MULT,
  SLOW_SPEED_MULT,
  BOOST_DRAIN_PER_SEC,
  MAX_SPEED,
  TURN_RATE,
  LEVEL_PELLETS_REQUIRED,
  LEVEL_TIME_REQUIRED,
  FINAL_LEVEL,
  SURVIVAL_TIME,
  LEVEL_BANNER_DURATION,
  TUTORIAL_BANNER_DURATION,
  LEVEL_TIME_SCALE,
  FOOD_VALUE_LEVEL2,
  FOOD_VALUE_LEVEL3,
  POWER_UP_SPAWN_INTERVAL,
  MAX_HEARTS,
  INVULN_TIME,
  HIT_FLASH_DURATION,
  STAR_BONUS_PCT,
  LIFE_BONUS_PCT,
  SPEED_BONUS_PCT,
} from "./config.js";
import { createSnake, steer, moveSnake, updateGrowthAndSpeed, bounceOffWall, bounceOffSpike } from "./snake.js";
import { generateSpikes, updateSpikes } from "./spikes.js";
import { spawnFood } from "./food.js";
import { spawnPowerUp } from "./powerup.js";
import { hitsFood, hitsPowerUp, findHitSpike, hitsWall, hitsSelf } from "./collision.js";
import { getHighScore, setHighScore, getSettings, saveSettings } from "./storage.js";
import { playEat, playDeath, playLevelUp, playHit, playWin, playPowerUp } from "./audio.js";

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
      return `Every spike is loose — survive ${SURVIVAL_TIME}s before the star appears!`;
    default:
      return "";
  }
}

const POWER_UP_TUTORIAL = {
  title: "Power Up!",
  subtitle: [
    "Lightning bolts refill your power bar.",
    "Hold left-click to boost, right-click to slow down and turn tighter.",
  ],
  duration: TUTORIAL_BANNER_DURATION,
};

function loadTunables() {
  const saved = getSettings().tunables || {};
  return {
    immortal: saved.immortal ?? false,
    maxSpeed: saved.maxSpeed ?? MAX_SPEED,
    turnRate: saved.turnRate ?? TURN_RATE,
    boostMult: saved.boostMult ?? BOOST_SPEED_MULT,
    slowMult: saved.slowMult ?? SLOW_SPEED_MULT,
  };
}

export function createGame() {
  return {
    state: "menu", // 'menu' | 'playing' | 'paused' | 'gameover'
    snake: createSnake(),
    spikes: [],
    food: { x: ARENA_W / 2 + 150, y: ARENA_H / 2 },
    powerUp: null,
    powerUpCooldown: POWER_UP_SPAWN_INTERVAL,
    hasSeenPowerTutorial: false,
    eaten: 0,
    score: 0,
    multiplier: 1,
    comboTimer: 0,
    boost: 0,
    boosting: false,
    slowing: false,
    currentSpeed: 0,
    level: 1,
    pelletsSinceLevel: 0,
    starPending: false, // level 4 reached, surviving the countdown before the star appears
    survivalTimer: 0,
    banner: null, // { t, title, subtitle, duration } while a slow-mo banner runs
    spikeTimer: 0,
    lastGrownSpikes: [],
    hearts: MAX_HEARTS,
    invulnTimer: 0,
    hitFlash: 0,
    levelTimer: 0,
    speedBonusCount: 0,
    won: false,
    finalBreakdown: null,
    highScore: getHighScore(),
    devMode: !!getSettings().devMode,
    tunables: loadTunables(),
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
  game.boost = 0;
  game.boosting = false;
  game.slowing = false;
  game.powerUp = null;
  game.powerUpCooldown = POWER_UP_SPAWN_INTERVAL;
  game.level = 1;
  game.pelletsSinceLevel = 0;
  game.starPending = false;
  game.survivalTimer = 0;
  game.banner = { t: 0, title: "GAME START", subtitle: "" };
  game.spikeTimer = 0;
  game.lastGrownSpikes = [];
  game.hearts = MAX_HEARTS;
  game.invulnTimer = 0;
  game.hitFlash = 0;
  game.levelTimer = 0;
  game.speedBonusCount = 0;
  game.won = false;
  game.finalBreakdown = null;
  updateGrowthAndSpeed(game.snake, 0, game.devMode ? game.tunables.maxSpeed : MAX_SPEED);
  game.food = spawnFood([], game.snake.segments);
  game.spikes = generateSpikes({ x: game.snake.x, y: game.snake.y }, game.food);
  game.state = "playing";
}

export function setDevMode(game, enabled) {
  game.devMode = enabled;
  saveSettings({ devMode: enabled });
}

export function setTunable(game, key, value) {
  game.tunables[key] = value;
  saveSettings({ tunables: game.tunables });
}

// A level-up applies regardless of trigger; only a pellet-triggered one (the
// "fast" path) earns the speed bonus. The 20s-per-level timer always
// restarts from here.
function applyLevelUp(game, newLevel, trigger) {
  game.level = newLevel;
  game.banner = { t: 0, title: bannerTitle(newLevel), subtitle: bannerSubtitle(newLevel) };
  game.levelTimer = 0;
  game.pelletsSinceLevel = 0;
  game.hearts = Math.min(MAX_HEARTS, game.hearts + 1);
  if (trigger === "pellets") game.speedBonusCount++;
  if (newLevel >= FINAL_LEVEL) {
    // No more pellets at the final level — just survive a countdown (shown
    // once this banner clears), then the star appears.
    game.starPending = true;
    game.survivalTimer = SURVIVAL_TIME;
    game.food = null;
  }
  playLevelUp();
}

export function update(game, dt) {
  game.time += dt;
  if (game.state !== "playing") return;

  // Level-up / game-start / tutorial banner: the banner itself runs on real
  // time, gameplay below runs at a crawl until it finishes.
  if (game.banner) {
    const duration = game.banner.duration || LEVEL_BANNER_DURATION;
    game.banner.t += dt;
    if (game.banner.t >= duration) game.banner = null;
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

  // While devMode is off these are byte-for-byte the normal config constants;
  // the dev-panel sliders only take effect once devMode is enabled.
  const turnRate = game.devMode ? game.tunables.turnRate : TURN_RATE;
  const maxSpeed = game.devMode ? game.tunables.maxSpeed : MAX_SPEED;
  const boostMult = game.devMode ? game.tunables.boostMult : BOOST_SPEED_MULT;
  const slowMult = game.devMode ? game.tunables.slowMult : SLOW_SPEED_MULT;

  // Boost and the right-click "precision" slow share one meter; if both are
  // somehow held at once, boost wins.
  let speedMult = 1;
  if (game.boosting && game.boost > 0) {
    game.boost = Math.max(0, game.boost - BOOST_DRAIN_PER_SEC * dt);
    speedMult = boostMult;
  } else if (game.slowing && game.boost > 0) {
    game.boost = Math.max(0, game.boost - BOOST_DRAIN_PER_SEC * dt);
    speedMult = slowMult;
  }

  const snake = game.snake;
  steer(snake, game.mouse.x, game.mouse.y, dt, turnRate);
  moveSnake(snake, dt, speedMult);
  game.currentSpeed = snake.speed * speedMult;
  updateSpikes(game, dt);

  // The power-up only spawns once the cooldown (started when the previous
  // one was collected) has elapsed, and only if none is currently out.
  if (game.powerUpCooldown > 0) game.powerUpCooldown -= dt;
  if (!game.powerUp && game.powerUpCooldown <= 0) {
    game.powerUp = spawnPowerUp(game.spikes, snake.segments, game.food);
  }

  const invincible = game.devMode && game.tunables.immortal;

  // Self-collision is still an instant kill — only wall/spike hits bounce.
  if (hitsSelf(snake) && !invincible) {
    endGame(game, false);
    return;
  }

  const wallHit = hitsWall(snake);
  const hitSpike = wallHit ? null : findHitSpike(snake, game.spikes);
  if ((wallHit || hitSpike) && game.invulnTimer <= 0) {
    if (wallHit) bounceOffWall(snake);
    else bounceOffSpike(snake, hitSpike);

    if (!invincible) {
      game.hearts--;
      game.invulnTimer = INVULN_TIME;
      game.hitFlash = HIT_FLASH_DURATION;

      if (game.hearts <= 0) {
        endGame(game, false);
        return;
      }
      playHit();
    }
  }

  if (hitsPowerUp(snake, game.powerUp)) {
    game.boost = 1;
    game.powerUp = null;
    game.powerUpCooldown = POWER_UP_SPAWN_INTERVAL;
    playPowerUp();
    if (!game.hasSeenPowerTutorial) {
      game.hasSeenPowerTutorial = true;
      if (!game.banner) game.banner = { t: 0, ...POWER_UP_TUTORIAL };
    }
  }

  if (game.food && hitsFood(snake, game.food)) {
    if (game.food.isStar) {
      endGame(game, true);
      return;
    }

    game.eaten++;
    game.multiplier = game.comboTimer > 0 ? game.multiplier + 1 : 1;
    game.score += game.multiplier * foodValueForLevel(game.level);
    game.comboTimer = COMBO_WINDOW;
    updateGrowthAndSpeed(snake, game.eaten, maxSpeed);

    playEat(game.multiplier);
    game.food = spawnFood(game.spikes, snake.segments);

    game.pelletsSinceLevel++;
    if (game.level < FINAL_LEVEL && game.pelletsSinceLevel >= LEVEL_PELLETS_REQUIRED) {
      applyLevelUp(game, game.level + 1, "pellets");
    }
  }

  if (game.level < FINAL_LEVEL) {
    game.levelTimer += dt;
    if (game.levelTimer >= LEVEL_TIME_REQUIRED) {
      applyLevelUp(game, game.level + 1, "time");
    }
  }

  // Final level: no pellets spawn here — just survive the countdown (shown
  // once the FINAL LEVEL banner clears), then the star appears fresh.
  if (game.starPending && !game.banner) {
    game.survivalTimer -= dt;
    if (game.survivalTimer <= 0) {
      game.starPending = false;
      game.food = spawnFood(game.spikes, snake.segments);
      game.food.isStar = true;
    }
  }
}

// Each bonus is a percentage of the base score, summed additively:
// star (win-only, flat +30%), life (+10% per heart remaining), speed
// (+10% per level reached via the pellet/skill path rather than the timer).
function endGame(game, won) {
  game.won = won;
  game.state = "gameover";

  const base = game.score;
  const starBonusPct = won ? STAR_BONUS_PCT : 0;
  const lifeBonusPct = game.hearts * LIFE_BONUS_PCT;
  const speedBonusPct = game.speedBonusCount * SPEED_BONUS_PCT;

  const starBonus = base * starBonusPct;
  const lifeBonus = base * lifeBonusPct;
  const speedBonus = base * speedBonusPct;

  game.finalBreakdown = {
    base,
    starBonus,
    starBonusPct,
    lifeBonus,
    lifeBonusPct,
    heartsRemaining: game.hearts,
    speedBonus,
    speedBonusPct,
    speedBonusCount: game.speedBonusCount,
    total: base + starBonus + lifeBonus + speedBonus,
  };
  game.score = Math.round(game.finalBreakdown.total);

  if (won) playWin();
  else playDeath();

  if (game.score > game.highScore) {
    game.highScore = game.score;
    setHighScore(game.highScore);
  }
}
