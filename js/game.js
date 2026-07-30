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
  WAYPOINT_REACH_RADIUS,
  BASE_SEGMENTS,
  SEGMENTS_PER_FOOD,
  SNAKE_RADIUS,
  SHIELD_REGEN_TIME,
  MAGNET_RADIUS,
  DYNAMO_REGEN_RATE,
  DYNAMO_COOLDOWN,
  MAGNET_SPEED,
  WALL_MARGIN,
} from "./config.js";


import { createSnake, steer, moveSnake, updateGrowthAndSpeed, bounceOffWall, wrapSnake, bounceOffSpike, bounceOffSegment } from "./snake.js";
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
  if (level >= 6) return 10;
  if (level >= 5) return 8;
  if (level >= 4) return 7;
  if (level >= 3) return 5;
  if (level >= 2) return 3;
  return 1;
}

function bannerTitle(level) {
  if (level === 6) return "TRUE FINAL STAGE";
  return level >= FINAL_LEVEL ? "FINAL LEVEL" : `LEVEL ${level}`;
}

function bannerSubtitle(level) {
  switch (level) {
    case 2:
      return "The spikes are waking up · pickups now worth ×3";
    case 3:
      return "Watch for swelling spikes · pickups now worth ×5";
    case 4:
      return "Tether Rotators active · pickups now worth ×7";
    case 5:
      return "Hunter drone tracks you · eat 10 pellets to level up!";
    case 6: // FINAL_LEVEL
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

function createPassives() {
  return {
    dynamo: false,
    slim: false,
    agility: false,
    compressor: false,
    regen: false,
    spikeguard: false,
    wraparound: false,
    magnet: false,
    phantom: false,
    ghost: false,
    freeze: false,
  };
}

// Static card definitions — name, description, rarity weight (higher = more common)
const CARD_DEFS = {
  dynamo:     { name: "Dynamo",       rarity: "common",   weight: 3, desc: "Slowly recharges boost when idle." },
  slim:       { name: "Slim Body",    rarity: "common",   weight: 3, desc: "Reduces snake width and size." },
  agility:    { name: "Agility",      rarity: "common",   weight: 3, desc: "Sharper steering turn speed." },
  compressor: { name: "Compressor",   rarity: "common",   weight: 3, desc: "Tightens body length coiling." },
  regen:      { name: "Regeneration", rarity: "common",   weight: 3, desc: "Passively restores hearts over time." },
  spikeguard: { name: "Spikeguard",   rarity: "uncommon", weight: 2, desc: "Shield deflects next spike hit." },
  wraparound: { name: "Wraparound",   rarity: "rare",     weight: 1, desc: "Walls become portals. Clears wall spikes." },
  magnet:     { name: "Magnet",       rarity: "uncommon", weight: 2, desc: "Pulls pellets and boost toward head." },
  phantom:    { name: "Phantom",      rarity: "rare",     weight: 1, desc: "Immunity to self-collision." },
  ghost:      { name: "Ghost",        rarity: "rare",     weight: 1, desc: "Phase through spikes and body while boosting." },
  freeze:     { name: "Freeze",       rarity: "uncommon", weight: 2, desc: "Spikes freeze while holding slow." },
};

// Computes dynamic card rarity weight based on progression (cardPicksGiven).
// As the run progresses, Rare & Uncommon weights scale up while Common scales down.
// Pick 1: Common 3.0, Uncommon 2.0, Rare 1.0 (Common favoured)
// Pick 4: Common 1.2, Uncommon 2.9, Rare 3.55 (Rare favoured over Common)
function getCardWeight(cardDef, cardPicksGiven) {
  const k = cardPicksGiven || 0;
  if (cardDef.rarity === "rare")     return 1.0 + k * 0.85;
  if (cardDef.rarity === "uncommon") return 2.0 + k * 0.3;
  return Math.max(0.5, 3.0 - k * 0.6);
}

// Builds the 3-card pick array: 2 weighted-random passives + heal.
function drawCards(game) {
  const p = game.passives;
  const cardPicksGiven = game.cardPicksGiven || 0;
  // Filter out already-owned and mutually exclusive cards.
  const available = Object.keys(CARD_DEFS).filter(id => {
    if (p[id]) return false;                            // already owned
    if (id === "phantom"    && p.spikeguard) return false; // mutual exclusion
    if (id === "spikeguard" && p.phantom)   return false;
    return true;
  });

  const chosen = [];
  let pool = [...available];
  for (let slot = 0; slot < 2; slot++) {
    if (pool.length === 0) break;
    const totalW = pool.reduce((s, id) => s + getCardWeight(CARD_DEFS[id], cardPicksGiven), 0);
    let r = Math.random() * totalW;
    let pick = pool[pool.length - 1];
    for (const id of pool) {
      r -= getCardWeight(CARD_DEFS[id], cardPicksGiven);
      if (r <= 0) { pick = id; break; }
    }
    chosen.push({ type: "passive", id: pick, ...CARD_DEFS[pick] });
    pool = pool.filter(id => id !== pick);
  }

  // Pad with heal if fewer than 2 passives available.
  while (chosen.length < 2) {
    chosen.push({ type: "heal", id: "heal", name: "Heal", rarity: "common", desc: "Restores health back to full." });
  }

  // Slot 3 is always heal — restores health back to full HP.
  chosen.push({ type: "heal", id: "heal", name: "Heal", rarity: "common", desc: "Restores health back to full." });

  return chosen;
}



// Returns the arena-coordinate bounding boxes for the 3 cards.
// Used by both render.js (drawing) and input (hit-testing).
export function getCardLayout() {
  const cardW = 190, cardH = 270, gap = 28;
  const totalW = 3 * cardW + 2 * gap;
  const startX = (ARENA_W - totalW) / 2;
  const startY = (ARENA_H - cardH) / 2;
  return [0, 1, 2].map(i => ({
    x: startX + i * (cardW + gap),
    y: startY,
    w: cardW,
    h: cardH,
  }));
}

// Applies the chosen card's effect and resumes gameplay.
export function selectCard(game, idx) {
  if (!game.cardPick) return;
  const card = game.cardPick.cards[idx];
  if (!card) return;

  if (card.type === "heal") {
    game.hearts = game.maxHearts || MAX_HEARTS;
  } else {
    game.passives[card.id] = true;
    // Wraparound: immediately remove spikes within WALL_MARGIN + 35 of any edge.
    if (card.id === "wraparound") {
      game.spikes = game.spikes.filter(s =>
        s.x > WALL_MARGIN + 35 && s.x < ARENA_W - WALL_MARGIN - 35 &&
        s.y > WALL_MARGIN + 35 && s.y < ARENA_H - WALL_MARGIN - 35
      );
    }

    // Spikeguard: activate shield immediately.
    if (card.id === "spikeguard") {
      game.shieldActive = true;
      game.shieldCooldown = 0;
    }
  }

  game.cardPick = null;
  game.state = "playing";
}


export function createGame() {
  return {
    state: "menu", // 'menu' | 'playing' | 'paused' | 'cardpick' | 'gameover'
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
    comboDecaying: false,   // true when timer expired but multiplier is counting down
    comboDecayTimer: 0,     // accumulates time for 1-per-sec multiplier decay
    boost: 0,
    boosting: false,
    slowing: false,
    boostUseTimer: 0,       // seconds remaining before Dynamo boost regen can start
    currentSpeed: 0,
    level: 1,
    pelletsSinceLevel: 0,
    cardPicksGiven: 0,      // counts card picks granted (milestones: 4, 12, 24, 40...)
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
    gesturePath: [],               // touch gesture waypoints array for Android controls
    time: 0,
    onGameOver: null, // (score) => void, set by main.js to offer a highscore submission
    particles: [],
    screenShake: 0,
    // --- Passive powerup system ---
    passives: createPassives(),
    shieldActive: false,
    shieldCooldown: 0,
    regenTimer: 30,         // seconds remaining before Regeneration passive restores 1 heart
    cardPick: null, // { cards: [...], hoveredIdx: 0 } while pick screen is open
  };
}

function getMaxSpeed(game) {
  const rawMax = game.devMode ? game.tunables.maxSpeed : MAX_SPEED;
  return TOUCH_MODE ? rawMax * 0.7 : rawMax;
}

export function resetGame(game) {
  game.snake = createSnake();
  game.gesturePath = [];
  game.eaten = 0;
  game.score = 0;
  game.multiplier = 1;
  game.comboTimer = 0;
  game.comboDecaying = false;
  game.comboDecayTimer = 0;
  game.boost = 0;
  game.boosting = false;
  game.slowing = false;
  game.boostUseTimer = 0;
  game.keysPressed.clear();
  game.powerUp = null;
  game.powerUpCooldown = POWER_UP_SPAWN_INTERVAL;
  game.level = 1;
  game.pelletsSinceLevel = 0;
  game.cardPicksGiven = 0;
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
  game.passives = createPassives();
  game.shieldActive = false;
  game.shieldCooldown = 0;
  game.regenTimer = 30;
  game.cardPick = null;
  updateGrowthAndSpeed(game.snake, 0, getMaxSpeed(game));
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
  updateGrowthAndSpeed(game.snake, game.eaten, getMaxSpeed(game));

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
    s.tetheredTo = null;
    s.tetherAngle = undefined;
    s.tetherDist = undefined;
    if (s.baseX !== undefined) {
      s.x = s.baseX;
      s.y = s.baseY;
    }
  }
  game.spikeTimer = 0;
  game.hunterQueue = [];
  game.rotators = null;

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
    // Slow-down power also slows the combo countdown at the same ratio —
    // precision mode gives you more time to navigate carefully.
    const comboDecayRate = (game.slowing && game.boost > 0) ? SLOW_SPEED_MULT : 1;
    game.comboTimer -= dt * comboDecayRate;
    if (game.comboTimer <= 0) {
      game.comboTimer = 0;
      // Don't snap to ×1 — start slow countdown (1 per second)
      if (game.multiplier > 1) {
        game.comboDecaying = true;
        game.comboDecayTimer = 0;
      }
    }
  } else if (game.comboDecaying) {
    game.comboDecayTimer += dt;
    if (game.comboDecayTimer >= 1) {
      game.comboDecayTimer -= 1;
      game.multiplier = Math.max(1, game.multiplier - 1);
      if (game.multiplier <= 1) game.comboDecaying = false;
    }
  }

  // While devMode is off these are byte-for-byte the normal config constants;
  // the dev-panel sliders only take effect once devMode is enabled.
  const baseTurnRate = game.devMode ? game.tunables.turnRate : TURN_RATE;
  const turnRate = baseTurnRate * (game.passives.agility ? 1.20 : 1.0);
  const maxSpeed = getMaxSpeed(game);
  const boostMult = game.devMode ? game.tunables.boostMult : BOOST_SPEED_MULT;
  const slowMult = game.devMode ? game.tunables.slowMult : SLOW_SPEED_MULT;

  // Boost and the right-click "precision" slow share one meter; if both are
  // somehow held at once, boost wins.
  // Drain rate scales down with snake size, matching the visual bar scaling
  // (200px → 600px = 1× → 3× width). Bigger snake = longer boost/slow.
  const SEG_MAX_DRAIN = BASE_SEGMENTS + 40 * SEGMENTS_PER_FOOD; // 126 — matches render.js cap
  const boostSizeFrac = Math.min(1, Math.max(0, (game.snake.segmentCount - BASE_SEGMENTS) / (SEG_MAX_DRAIN - BASE_SEGMENTS)));
  const boostScale = 1 + 1 * boostSizeFrac; // 1× at start, 2× at max (200% capacity)
  const dynamicDrain = BOOST_DRAIN_PER_SEC / boostScale;

  let speedMult = 1;
  if (game.boosting && game.boost > 0) {
    game.boost = Math.max(0, game.boost - dynamicDrain * dt);
    game.boostUseTimer = DYNAMO_COOLDOWN;
    speedMult = boostMult;
  } else if (game.slowing && game.boost > 0) {
    game.boost = Math.max(0, game.boost - dynamicDrain * dt);
    game.boostUseTimer = DYNAMO_COOLDOWN;
    speedMult = slowMult;
  } else if (game.boostUseTimer > 0) {
    game.boostUseTimer = Math.max(0, game.boostUseTimer - dt);
  }

  // --- Passive: Dynamo — passive boost regen when not using boost and 4s cooldown elapsed ---
  if (game.passives.dynamo && !game.boosting && !game.slowing && game.boostUseTimer <= 0 && game.boost < 1) {
    game.boost = Math.min(1, game.boost + DYNAMO_REGEN_RATE * dt);
  }

  // --- Passive: Spikeguard — shield cooldown recharge ---
  if (game.passives.spikeguard && !game.shieldActive && game.shieldCooldown > 0) {
    game.shieldCooldown -= dt;
    if (game.shieldCooldown <= 0) game.shieldActive = true;
  }

  // --- Passive: Regeneration — 1 heart every 30s ---
  if (game.passives.regen && game.hearts < (game.maxHearts || MAX_HEARTS)) {
    game.regenTimer -= dt;
    if (game.regenTimer <= 0) {
      game.regenTimer = 30;
      game.hearts = Math.min(game.maxHearts || MAX_HEARTS, game.hearts + 1);
      spawnParticles(game, game.snake.x, game.snake.y, 14, {
        colors: ["#4ee08a", "#a2ffd0", "#ffffff"],
        speed: 70, size: 3.0, decay: 1.5,
      });
    }
  } else {
    game.regenTimer = 30;
  }

  const snake = game.snake;
  snake.radius = (game.passives.slim ? 0.8 : 1.0) * SNAKE_RADIUS;
  // Steer: keyboard modes use key-pressed direction; touch mode follows drawn
  // gesture path; mouse mode steers toward the cursor.
  if (TOUCH_MODE) {
    if (game.gesturePath && game.gesturePath.length > 0) {
      while (game.gesturePath.length > 0) {
        const target = game.gesturePath[0];
        const dx = target.x - snake.x;
        const dy = target.y - snake.y;
        const dist = Math.hypot(dx, dy);

        const forwardX = Math.cos(snake.theta);
        const forwardY = Math.sin(snake.theta);
        const dot = (dx * forwardX + dy * forwardY) / (dist || 1);

        if (dot > 0) {
          target._approached = true;
        }

        // Waypoint reached if head is within radius, or if the waypoint was missed / overshot
        const reached = dist < WAYPOINT_REACH_RADIUS;
        const missed = dot < 0 && (game.gesturePath.length > 1 || target._approached);

        if (reached || missed) {
          game.gesturePath.shift();
        } else {
          break;
        }
      }
      if (game.gesturePath.length > 0) {
        const nextTarget = game.gesturePath[0];
        steer(snake, nextTarget.x, nextTarget.y, dt, turnRate);
      }
    }
    // No waypoints in gesturePath -> snake glides straight on current heading.
  } else if (game.controlType === "keyboard") {
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
  const spacingMult = game.passives.compressor ? 0.8 : 1.0;
  moveSnake(snake, dt, speedMult, spacingMult);
  game.currentSpeed = snake.speed * speedMult;

  // --- Passive: Freeze — spikes locked while holding slow ---
  const spikeFrozen = game.passives.freeze && game.slowing && game.boost > 0;
  updateSpikes(game, dt, Math.random, spikeFrozen);

  // --- Passive: Magnet — nudge food and powerup toward head ---
  if (game.passives.magnet) {
    const nudge = (obj) => {
      if (!obj) return;
      const dx = snake.x - obj.x, dy = snake.y - obj.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < MAGNET_RADIUS) {
        const step = Math.min(MAGNET_SPEED * dt, d);
        obj.x += (dx / d) * step;
        obj.y += (dy / d) * step;
      }
    };
    if (game.food && !game.food.isStar) nudge(game.food);
    nudge(game.powerUp);
  }

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

  // Ghost passive: while boosting, pass through spikes and own body
  const ghostPhasing = game.passives.ghost && game.boosting && game.boost > 0;

  const wallHit = hitsWall(snake);
  if (wallHit) {
    if (game.passives.wraparound) {
      wrapSnake(snake);
    } else {
      bounceOffWall(snake); // ALWAYS bounce head clear of wall
      if (game.invulnTimer <= 0 && !invincible) {
        game.hearts--;
        if (game.multiplier > 1) {
          game.multiplier = Math.max(1, Math.floor(game.multiplier * 0.7));
          game.comboTimer = game.multiplier > 1 ? COMBO_WINDOW : 0;
          game.comboDecaying = false;
        }
        game.invulnTimer = INVULN_TIME;
        game.hitFlash = HIT_FLASH_DURATION;
        game.screenShake = 0.35;
        spawnParticles(game, snake.x, snake.y, 18, {
          colors: ["#ff3050", "#ff7a4a", "#ffffff"], speed: 110, size: 3.5, decay: 1.8,
        });
        if (game.hearts <= 0) {
          spawnParticles(game, snake.x, snake.y, 45, { colors: ["#7fe8ff", "#4fd1e8", "#ffffff"], speed: 150, size: 4.5, decay: 1.2 });
          endGame(game, false); return;
        }
        playHit();
      }
    }
  } else {
    const hitSpike = ghostPhasing ? null : findHitSpike(snake, game.spikes);
    const skipSelf = game.passives.phantom || ghostPhasing;
    const hitSelfSeg = hitSpike ? null : skipSelf ? null : findHitSegment(snake);

    if ((hitSpike || hitSelfSeg) && game.invulnTimer <= 0) {
      if (hitSpike) {
        // Spikeguard: absorb the hit, bounce the snake, and push the spike away
        if (game.passives.spikeguard && game.shieldActive) {
          bounceOffSpike(snake, hitSpike);
          const dx = hitSpike.x - snake.x, dy = hitSpike.y - snake.y;
          const d = Math.hypot(dx, dy) || 1;
          hitSpike.vx = (dx / d) * 220;
          hitSpike.vy = (dy / d) * 220;
          hitSpike.phase = "move";
          hitSpike.t = 0;
          if (hitSpike.isDrone) {
            hitSpike.bounceTimer = 0.8;
          }
          game.shieldActive = false;
          game.shieldCooldown = SHIELD_REGEN_TIME;
          game.invulnTimer = INVULN_TIME; // Invulnerability buffer prevents immediate re-hit
          playHit();
          spawnParticles(game, snake.x, snake.y, 24, {
            colors: ["#c8e8ff", "#ffffff", "#7fb8ff"],
            speed: 130, size: 3.5, decay: 1.6,
          });
        } else {
          bounceOffSpike(snake, hitSpike);
          if (hitSpike.isDrone) {
            hitSpike.speedTimer = 0;
            hitSpike.stopTimer = 0.8;
            hitSpike.hitPlayerTimer = 1.5;
            hitSpike.vx = 0;
            hitSpike.vy = 0;
          }
          if (!invincible) {
            game.hearts--;
            // Combo penalty: reduce multiplier by 30% on damage
            if (game.multiplier > 1) {
              game.multiplier = Math.max(1, Math.floor(game.multiplier * 0.7));
              game.comboTimer = game.multiplier > 1 ? COMBO_WINDOW : 0;
              game.comboDecaying = false;
            }
            game.invulnTimer = INVULN_TIME;
            game.hitFlash = HIT_FLASH_DURATION;
            game.screenShake = 0.35;
            spawnParticles(game, (hitSpike.x + snake.x) / 2, (hitSpike.y + snake.y) / 2, 18, {
              colors: ["#ff3050", "#ff7a4a", "#ffffff"], speed: 110, size: 3.5, decay: 1.8,
            });
            if (game.hearts <= 0) {
              spawnParticles(game, snake.x, snake.y, 45, { colors: ["#7fe8ff", "#4fd1e8", "#ffffff"], speed: 150, size: 4.5, decay: 1.2 });
              endGame(game, false); return;
            }
            playHit();
          }
        }
      } else if (hitSelfSeg) {
        bounceOffSegment(snake, hitSelfSeg.segment, hitSelfSeg.radius);
        if (!invincible) {
          game.hearts--;
          if (game.multiplier > 1) {
            game.multiplier = Math.max(1, Math.floor(game.multiplier * 0.7));
            game.comboTimer = game.multiplier > 1 ? COMBO_WINDOW : 0;
            game.comboDecaying = false;
          }
          game.invulnTimer = INVULN_TIME;
          game.hitFlash = HIT_FLASH_DURATION;
          game.screenShake = 0.35;
          spawnParticles(game, (hitSelfSeg.segment.x + snake.x) / 2, (hitSelfSeg.segment.y + snake.y) / 2, 18, {
            colors: ["#ff3050", "#ff7a4a", "#ffffff"], speed: 110, size: 3.5, decay: 1.8,
          });
          if (game.hearts <= 0) {
            spawnParticles(game, snake.x, snake.y, 45, { colors: ["#7fe8ff", "#4fd1e8", "#ffffff"], speed: 150, size: 4.5, decay: 1.2 });
            endGame(game, false); return;
          }
          playHit();
        }
      }
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
    // If active combo window OR currently decaying from a higher multiplier:
    // preserve current multiplier + 1, then restart full combo window.
    const inCombo = game.comboTimer > 0 || game.comboDecaying || game.multiplier > 1;
    game.multiplier = inCombo ? game.multiplier + 1 : 1;
    game.comboTimer = COMBO_WINDOW;
    game.comboDecaying = false;
    game.comboDecayTimer = 0;
    game.score += game.multiplier * foodValueForLevel(game.level);
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
    // Card pick milestones: 4, 12, 24, 40, 60... (gap increasing by +4 each time)
    const nextCardTarget = (game.cardPicksGiven + 1) * (game.cardPicksGiven + 2) * 2;
    if (game.eaten >= nextCardTarget && !game.banner && game.level < FINAL_LEVEL) {
      game.cardPicksGiven++;
      game.cardPick = { cards: drawCards(game), hoveredIdx: 2 }; // default hover on Heal
      game.state = "cardpick";
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
