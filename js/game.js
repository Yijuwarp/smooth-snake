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
  TOUCH_MODE,
  LEVEL_TIME_SCALE,
  FOOD_VALUE_LEVEL2,
  FOOD_VALUE_LEVEL3,
  POWER_UP_SPAWN_INTERVAL,
  MAX_HEARTS,
  INVULN_TIME,
  HIT_FLASH_DURATION,
  EAT_FLASH_DURATION,
  STAR_BONUS_PCT,
  LIFE_BONUS_PCT,
  SPEED_BONUS_PCT,
} from "./config.js";
import { createSnake, steer, moveSnake, updateGrowthAndSpeed, bounceOffWall, bounceOffSpike, bounceOffSegment } from "./snake.js";
import { generateSpikes, updateSpikes } from "./spikes.js";
import { spawnFood } from "./food.js";
import { spawnPowerUp } from "./powerup.js";
import { spawnParticles, updateParticles } from "./particles.js";
import { hitsFood, hitsPowerUp, findHitSpike, hitsWall, hitsSelf, findHitSegment } from "./collision.js";
import { getHighScore, setHighScore, getSettings, saveSettings } from "./storage.js";
import { playEat, playDeath, playLevelUp, playHit, playWin, playPowerUp } from "./audio.js";
import { updateMusicForLevel, playTrack } from "./music.js";

// Valid control schemes for non-touch desktop play.
export const CONTROL_TYPES = ["mouse", "keyboard"];

export function getControlType() {
  const saved = getSettings().controlType;
  // Migrate old multi-key values to unified 'keyboard'
  if (saved === "keyboard_wasd" || saved === "keyboard_arrows" || saved === "keyboard") return "keyboard";
  return "mouse";
}

export function saveControlType(type) {
  saveSettings({ controlType: type });
}

function foodValueForLevel(level) {
  if (level >= 5) return 10;
  if (level >= 4) return 7;
  if (level >= 3) return 5;
  if (level >= 2) return 3;
  return 1;
}

function bannerTitle(level) {
  if (level === 5) return "TRUE FINAL STAGE";
  return level >= FINAL_LEVEL ? "FINAL LEVEL" : `LEVEL ${level}`;
}

function bannerSubtitle(level) {
  switch (level) {
    case 2:
      return "The spikes are waking up · pickups now worth ×3";
    case 3:
      return "Watch for swelling spikes · pickups now worth ×5";
    case 4:
      return "Hunter drone tracks you · eat 10 pellets to level up!";
    case 5: // FINAL_LEVEL
      return `Every spike is loose — survive ${SURVIVAL_TIME}s before the star appears!`;
    default:
      return "";
  }
}

// Built per-collect (not a constant) so the copy matches the active control
// scheme — TOUCH_MODE and game.controlType are both set before the first pickup.
function powerUpTutorial(controlType) {
  let controls;
  if (TOUCH_MODE) {
    controls = [
      { text: "Hold " },
      { text: "≫", bold: true },
      { text: " to boost, " },
      { text: "🕐", bold: true },
      { text: " to slow down" },
    ];
  } else if (controlType === "keyboard" || controlType === "keyboard_wasd" || controlType === "keyboard_arrows") {
    controls = [
      { text: "Hold " },
      { text: "Space", bold: true },
      { text: " to boost, " },
      { text: "Shift", bold: true },
      { text: " to slow down" },
    ];
  } else {
    controls = [
      { text: "Hold left-click to " },
      { text: "boost", bold: true },
      { text: ", right-click to " },
      { text: "slow down", bold: true },
    ];
  }
  return {
    title: "Power Up!",
    subtitle: [controls],
    duration: TUTORIAL_BANNER_DURATION,
  };
}

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
    maxHearts: MAX_HEARTS,
    invulnTimer: 0,
    hitFlash: 0,
    eatFlash: 0,
    levelTimer: 0,
    speedBonusCount: 0,
    won: false,
    finalBreakdown: null,
    highScore: getHighScore(),
    devMode: !!getSettings().devMode,
    tunables: loadTunables(),
    controlType: getControlType(), // 'mouse' | 'keyboard_wasd' | 'keyboard_arrows'
    keysPressed: new Set(),        // currently held keys for keyboard steering
    mouse: { x: ARENA_W / 2 + 200, y: ARENA_H / 2 },
    time: 0,
    onGameOver: null, // (score) => void, set by main.js to offer a highscore submission
    particles: [],
    screenShake: 0,
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
  game.keysPressed.clear();
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
  game.maxHearts = MAX_HEARTS;
  game.invulnTimer = 0;
  game.hitFlash = 0;
  game.eatFlash = 0;
  game.levelTimer = 0;
  game.speedBonusCount = 0;
  game.won = false;
  game.finalBreakdown = null;
  game.particles = [];
  game.screenShake = 0;
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

export function devLaunchLevel(game, level) {
  // 1. Transition to the chosen level
  applyLevelUp(game, level, "dev");

  // 2. Set pellets eaten to match the level's expected progression
  game.eaten = (level - 1) * 10;
  game.pelletsSinceLevel = 0;

  // 3. Scale size of snake
  const maxSpeed = game.devMode ? game.tunables.maxSpeed : MAX_SPEED;
  updateGrowthAndSpeed(game.snake, game.eaten, maxSpeed);

  // Instantly grow/shrink snake segments to match scaled targetLength
  const snake = game.snake;
  while (snake.segments.length < snake.targetLength) {
    const last = snake.segments[snake.segments.length - 1] || { x: snake.x, y: snake.y };
    snake.segments.push({ x: last.x, y: last.y });
  }
  if (snake.segments.length > snake.targetLength) {
    snake.segments.length = snake.targetLength;
  }

  // 4. Ensure food exists for normal levels
  if (level < FINAL_LEVEL) {
    game.food = spawnFood(game.spikes, snake.segments);
  }

  // 5. Force state to playing
  game.state = "playing";
}

// A level-up applies regardless of trigger; only a pellet-triggered one (the
// "fast" path) earns the speed bonus. The 20s-per-level timer always
// restarts from here.
function applyLevelUp(game, newLevel, trigger) {
  game.level = newLevel;
  game.banner = { t: 0, title: bannerTitle(newLevel), subtitle: bannerSubtitle(newLevel) };
  game.levelTimer = 0;
  game.pelletsSinceLevel = 0;
  game.hearts = Math.min(game.maxHearts || MAX_HEARTS, game.hearts + 1);
  if (trigger === "pellets") game.speedBonusCount++;

  // Reset all spikes to default static state on any level transition
  for (const s of game.spikes) {
    s.phase = undefined;
    s.vx = 0;
    s.vy = 0;
    s.t = 0;
    s.growActive = false;
    s.growT = 0;
    s.rotation = 0;
    s.sizeMult = 1;
    s.isDrone = false;
    s.bounceTimer = 0;
  }
  game.spikeTimer = 0;
  game.hunterQueue = [];

  if (newLevel === FINAL_LEVEL) {
    // No more pellets at the final level — just survive a countdown (shown
    // once this banner clears), then the star appears.
    game.starPending = true;
    game.survivalTimer = SURVIVAL_TIME;
    game.food = null;
  }
  playLevelUp();
  updateMusicForLevel(newLevel);
}

export function update(game, dt) {
  game.time += dt;
  if (game.state !== "playing") return;

  if (game.screenShake > 0) {
    game.screenShake = Math.max(0, game.screenShake - dt);
  }

  // Level-up / game-start / tutorial banner: the banner itself runs on real
  // time, gameplay below runs at a crawl until it finishes.
  if (game.banner) {
    const duration = game.banner.duration || LEVEL_BANNER_DURATION;
    game.banner.t += dt;
    if (game.banner.t >= duration) game.banner = null;
    dt *= LEVEL_TIME_SCALE;
  }

  updateParticles(game, dt);

  if (game.invulnTimer > 0) game.invulnTimer = Math.max(0, game.invulnTimer - dt);
  if (game.hitFlash > 0) game.hitFlash = Math.max(0, game.hitFlash - dt);
  if (game.eatFlash > 0) game.eatFlash = Math.max(0, game.eatFlash - dt);

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
  // Steer: keyboard modes use key-pressed direction; mouse mode steers toward
  // the cursor. In keyboard mode with no keys held, the snake glides straight.
  if (!TOUCH_MODE && game.controlType === "keyboard") {
    const keys = game.keysPressed;
    let dx = 0, dy = 0;
    // Both WASD and Arrow keys steer — whichever the player prefers.
    // Keys are stored as e.code values (KeyW, ArrowUp, etc.) — modifier-safe.
    if (keys.has("KeyW") || keys.has("ArrowUp"))    dy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown"))  dy += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft"))  dx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
    if (dx !== 0 || dy !== 0) {
      steer(snake, snake.x + dx * 9999, snake.y + dy * 9999, dt, turnRate);
    }
    // No keys held → snake continues on its current heading.
  } else {
    steer(snake, game.mouse.x, game.mouse.y, dt, turnRate);
  }
  moveSnake(snake, dt, speedMult);
  game.currentSpeed = snake.speed * speedMult;
  updateSpikes(game, dt);

  // Emit trail particles from the tail
  if (snake.segments && snake.segments.length > 0) {
    const tail = snake.segments[snake.segments.length - 1];
    let spawnChance = 0.15;
    let particleOptions = {
      colors: ["rgba(79, 209, 232, 0.4)", "rgba(127, 232, 255, 0.2)"],
      speed: 15,
      size: 2.0,
      decay: 1.2,
      angle: snake.theta + Math.PI,
      angleSpread: 0.6,
      speedVar: 0.8,
    };

    if (game.boosting && game.boost > 0) {
      spawnChance = 0.8;
      particleOptions.colors = ["#7fe8ff", "#4fd1e8", "#ffffff"];
      particleOptions.speed = 60;
      particleOptions.size = 3.5;
      particleOptions.decay = 2.0;
    } else if (game.slowing && game.boost > 0) {
      spawnChance = 0.4;
      particleOptions.colors = ["#c792ff", "#b075ff", "rgba(199, 146, 255, 0.3)"];
      particleOptions.speed = 8;
      particleOptions.size = 2.2;
      particleOptions.decay = 1.0;
    }

    if (Math.random() < spawnChance) {
      spawnParticles(game, tail.x, tail.y, 1, particleOptions);
    }
  }

  // The power-up only spawns once the cooldown (started when the previous
  // one was collected) has elapsed, and only if none is currently out.
  if (game.powerUpCooldown > 0) game.powerUpCooldown -= dt;
  if (!game.powerUp && game.powerUpCooldown <= 0) {
    game.powerUp = spawnPowerUp(game.spikes, snake.segments, game.food);
  }

  const invincible = game.devMode && game.tunables.immortal;

  const wallHit = hitsWall(snake);
  const hitSpike = wallHit ? null : findHitSpike(snake, game.spikes);
  const hitSelfSeg = (wallHit || hitSpike) ? null : findHitSegment(snake);

  if ((wallHit || hitSpike || hitSelfSeg) && game.invulnTimer <= 0) {
    if (wallHit) bounceOffWall(snake);
    else if (hitSpike) {
      bounceOffSpike(snake, hitSpike);
      if (hitSpike.isDrone) {
        hitSpike.speedTimer = 0;    // Reset speed scaling to 180 px/s (minimum)
        hitSpike.stopTimer = 0.8;   // Freeze in place for 0.8 seconds
        hitSpike.hitPlayerTimer = 1.5; // Blue flash for 1.5 seconds
        hitSpike.vx = 0;
        hitSpike.vy = 0;
      }
    }
    else bounceOffSegment(snake, hitSelfSeg.segment, hitSelfSeg.radius);

    if (!invincible) {
      game.hearts--;
      game.invulnTimer = INVULN_TIME;
      game.hitFlash = HIT_FLASH_DURATION;
      game.screenShake = 0.35; // Trigger screen shake!

      // Spawn impact particles
      let hitX, hitY;
      if (wallHit) {
        hitX = snake.x;
        hitY = snake.y;
      } else if (hitSpike) {
        hitX = (hitSpike.x + snake.x) / 2;
        hitY = (hitSpike.y + snake.y) / 2;
      } else {
        hitX = (hitSelfSeg.segment.x + snake.x) / 2;
        hitY = (hitSelfSeg.segment.y + snake.y) / 2;
      }

      spawnParticles(game, hitX, hitY, 18, {
        colors: ["#ff3050", "#ff7a4a", "#ffffff"],
        speed: 110,
        size: 3.5,
        decay: 1.8,
      });

      if (game.hearts <= 0) {
        // Spawn death disintegration explosion
        spawnParticles(game, snake.x, snake.y, 45, {
          colors: ["#7fe8ff", "#4fd1e8", "#ffffff"],
          speed: 150,
          size: 4.5,
          decay: 1.2,
        });
        endGame(game, false);
        return;
      }
      playHit();
    }
  }

  if (hitsPowerUp(snake, game.powerUp)) {
    // Spawn electrical shockwave burst
    spawnParticles(game, game.powerUp.x, game.powerUp.y, 25, {
      colors: ["#fff44d", "#ffea82", "#ffffff"],
      speed: 120,
      size: 4.0,
      decay: 2.0,
    });

    game.boost = 1;
    game.powerUp = null;
    game.powerUpCooldown = POWER_UP_SPAWN_INTERVAL;
    playPowerUp();
    if (!game.hasSeenPowerTutorial) {
      game.hasSeenPowerTutorial = true;
      if (!game.banner) game.banner = { t: 0, ...powerUpTutorial(game.controlType) };
    }
  }

  if (game.food && hitsFood(snake, game.food)) {
    if (game.food.isStar) {
      // Spawn huge victory burst!
      spawnParticles(game, game.food.x, game.food.y, 60, {
        colors: ["#ffd257", "#ffffff", "#ff8c4a"],
        speed: 180,
        size: 5.0,
        decay: 1.0,
      });
      // Collect Star -> Restore 2 HP (+1 from round finish = 3 HP restored total)
      game.hearts = Math.min(game.maxHearts || MAX_HEARTS, game.hearts + 2);
      endGame(game, true);
      return;
    }

    // Spawn green eating explosion
    spawnParticles(game, game.food.x, game.food.y, 16, {
      colors: ["#4ee08a", "#a2ffd0", "#ffffff"],
      speed: 85,
      size: 3.5,
      decay: 1.6,
    });

    game.eaten++;
    game.multiplier = game.comboTimer > 0 ? game.multiplier + 1 : 1;
    game.score += game.multiplier * foodValueForLevel(game.level);
    game.comboTimer = COMBO_WINDOW;
    // Sqrt scaling: sublinear ("slow") growth, and lands almost exactly on
    // "10x multiplier -> 3x longer happy" (sqrt(10) ~= 3.16) with no extra
    // tuning constant needed.
    game.eatFlash = EAT_FLASH_DURATION * Math.sqrt(game.multiplier);
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

  if (won) {
    playWin();
    playTrack("victory");
  } else {
    playDeath();
    playTrack("gameover");
  }

  if (game.score > game.highScore) {
    game.highScore = game.score;
    setHighScore(game.highScore);
  }

  if (game.score > 0 && typeof game.onGameOver === "function") {
    game.onGameOver(game.score);
  }
}
