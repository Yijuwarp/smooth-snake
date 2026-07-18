// All tunable constants for the game. Pure data — no DOM access, safe to
// import from Node for testing.

export let ARENA_W = 900;
export let ARENA_H = 600;
const ARENA_AREA = ARENA_W * ARENA_H; // captured once, before any resize
const ARENA_RATIO_MIN = 0.6;
const ARENA_RATIO_MAX = 2.2;

// Reshapes the arena to the given pixel dimensions' aspect ratio while
// preserving total area, so spike density/margins/entity sizes stay valid
// without retuning.
export function setArenaSize(canvasWidth, canvasHeight) {
  const r = Math.min(ARENA_RATIO_MAX, Math.max(ARENA_RATIO_MIN, canvasWidth / canvasHeight));
  ARENA_H = Math.round(Math.sqrt(ARENA_AREA / r));
  ARENA_W = Math.round(r * ARENA_H);
}

export const WALL_MARGIN = 30;
export const MAX_DT = 1 / 30;

// Touch mode: set once at startup by main.js (primary pointer is coarse).
// Lives here so DOM-free modules (game/render/input) can read it without
// touching window/matchMedia themselves.
export let TOUCH_MODE = false;
export function setTouchMode(on) {
  TOUCH_MODE = !!on;
}

// On-screen boost/slow buttons for touch play (arena coords): boost sits
// bottom-left, slow bottom-right. Sized for a comfortable thumb target once
// the arena is scaled down to a phone screen.
export const TOUCH_BUTTON_SIZE = 92;
export const TOUCH_BUTTON_MARGIN = 18;

export function getTouchButtons() {
  const s = TOUCH_BUTTON_SIZE, m = TOUCH_BUTTON_MARGIN;
  return {
    boost: { x: m, y: ARENA_H - m - s, w: s, h: s },
    slow: { x: ARENA_W - m - s, y: ARENA_H - m - s, w: s, h: s },
  };
}

export const SNAKE_RADIUS = 10;
export const BODY_DIAMETER = 18;
export const SEGMENT_SPACING = 12;

export const BASE_SEGMENTS = 6;
export const SEGMENTS_PER_FOOD = 3;
export const NECK_GRACE_SEGMENTS = 4;

export const BASE_SPEED = 140;
export const SPEED_PER_FOOD = 12;
export const MAX_SPEED = 340;
export const TURN_RATE = 4.0;

export const COMBO_WINDOW = 5; // seconds to reach the next food before the multiplier resets

export const LEVEL_PELLETS_REQUIRED = 10; // pellets eaten since the last level-up forces a transition
export const LEVEL_TIME_REQUIRED = 30; // seconds since the last level-up forces a transition, whichever comes first
export const FINAL_LEVEL = 4;
export const SURVIVAL_TIME = 10; // seconds to survive at the final level, after its banner clears, before the star appears
export const LEVEL_BANNER_DURATION = 2.2; // seconds of slow-motion banner
export const TUTORIAL_BANNER_DURATION = 3; // longer banner for the one-time power-up explainer
export const LEVEL_TIME_SCALE = 0.05; // gameplay speed during a banner
export const FOOD_VALUE_LEVEL2 = 3; // points per pickup (before multiplier) from level 2 on
export const FOOD_VALUE_LEVEL3 = 5; // points per pickup (before multiplier) from level 3 on

// Wandering spikes (level 2, and every spike at the final level): how many
// can be awake (shaking or moving) at once.
export const MAX_MOVING_SPIKES_LEVEL2 = 2;
export const SPIKE_SELECT_INTERVAL = 1; // seconds between attempts to wake a spike
export const SPIKE_SHAKE_TIME = 0.8; // warning shake before moving
export const SPIKE_MOVE_SPEED = 70; // px/sec while gliding
export const SPIKE_MOVE_TIME = 2.5; // seconds of gliding before settling (or re-randomizing, at the final level)

// Growing spikes (level 3, replaces the wandering cap-increase): 2 random
// spikes spin and swell up to 300% of their radius, then shrink back over
// one cycle; a different pair is picked for the next cycle.
export const GROW_SPIKE_COUNT = 2;
export const GROW_CYCLE_TIME = 2; // seconds for one full grow-then-shrink cycle
export const GROW_MAX_MULT = 4; // peak radius = 4x normal (a 300% increase)
export const GROW_SPIN_SPEED = 6; // radians/sec of visual spin while active

// Hearts & bounce.
export const MAX_HEARTS = 3;
export const INVULN_TIME = 1.2; // seconds of no further heart loss after a bounce
export const HIT_FLASH_DURATION = 0.35; // seconds the red screen-flash takes to fade
export const EAT_FLASH_DURATION = 0.4; // seconds the "happy" eyes show after eating
export const BOUNCE_CLEARANCE = 4; // extra px pushed clear of a hazard after a bounce

// End-of-run bonuses, each a percentage of the base score, summed additively
// at game end (see endGame in game.js).
export const STAR_BONUS_PCT = 0.3; // +30% for winning (collecting the star)
export const LIFE_BONUS_PCT = 0.1; // +10% per heart remaining at game end
export const SPEED_BONUS_PCT = 0.1; // +10% per level transition reached via pellet count (not the 20s timer)

export const BOOST_SPEED_MULT = 2.0;
export const SLOW_SPEED_MULT = 0.25; // right-click "precision" power: quarter speed, same turn rate -> tighter turning radius
export const BOOST_DRAIN_PER_SEC = 1 / 3; // full meter lasts 3s of continuous use (50% longer than the original 2s)

// Pellets no longer recharge the power meter — only the lightning power-up
// does, and it refills it completely.
export const POWER_UP_SPAWN_INTERVAL = 5; // seconds of cooldown before another power-up can spawn, starting once the current one is collected
export const POWER_UP_RADIUS = 9;

export const FOOD_RADIUS = 8;
export const STAR_RADIUS = FOOD_RADIUS * 1.6;
export const SPIKE_COUNT = 14;
export const SPIKE_RADIUS = 12;

export const CORRIDOR_WIDTH = BODY_DIAMETER * 1.6;
export const MIN_SPIKE_GAP = 2 * SPIKE_RADIUS + CORRIDOR_WIDTH;
export const SPAWN_CLEAR = 90;
export const MAX_PLACE_ATTEMPTS = 2000;
export const REACH_CELL = BODY_DIAMETER;

// Rectangles (logical arena coords) reserved for on-canvas HUD text, so
// spikes/food never spawn near or underneath it. Padded generously — this
// only gates spawn placement, not runtime movement.
export function getUiSafeZones() {
  const zones = [
    { x: ARENA_W - 220, y: 0, w: 220, h: 80 }, // score + dev-mode readout (top-right)
    { x: ARENA_W / 2 - 110, y: 0, w: 220, h: 90 }, // level + hearts + survive countdown (top-center)
    { x: ARENA_W / 2 - 130, y: ARENA_H - 80, w: 260, h: 80 }, // boost meter (bottom-center)
  ];
  if (TOUCH_MODE) {
    const pad = 14; // matches the hit-test forgiveness around the button frame
    for (const b of Object.values(getTouchButtons())) {
      zones.push({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });
    }
  }
  return zones;
}
