// All tunable constants for the game. Pure data — no DOM access, safe to
// import from Node for testing.

export const ARENA_W = 900;
export const ARENA_H = 600;
export const WALL_MARGIN = 30;
export const MAX_DT = 1 / 30;

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

export const LEVEL_THRESHOLDS = [50, 200, 500]; // score needed for level 2, 3, 4
export const LEVEL_BANNER_DURATION = 2.2; // seconds of slow-motion banner
export const LEVEL_TIME_SCALE = 0.05; // gameplay speed during the banner
export const FOOD_VALUE_LEVEL2 = 3; // points per pickup (before multiplier) from level 2 on

// Level 2: wandering spikes.
export const MAX_MOVING_SPIKES = 2;
export const SPIKE_SELECT_INTERVAL = 1; // seconds between attempts to wake a spike
export const SPIKE_SHAKE_TIME = 0.8; // warning shake before moving
export const SPIKE_MOVE_SPEED = 70; // px/sec while gliding
export const SPIKE_MOVE_TIME = 2.5; // seconds of gliding before settling

export const BOOST_SPEED_MULT = 1.6;
export const BOOST_DRAIN_PER_SEC = 0.5; // full meter lasts 2s of continuous boost
export const BOOST_RECHARGE_PER_FOOD = 0.33;

export const FOOD_RADIUS = 8;
export const SPIKE_COUNT = 14;
export const SPIKE_RADIUS = 12;

export const CORRIDOR_WIDTH = BODY_DIAMETER * 1.6;
export const MIN_SPIKE_GAP = 2 * SPIKE_RADIUS + CORRIDOR_WIDTH;
export const SPAWN_CLEAR = 90;
export const MAX_PLACE_ATTEMPTS = 2000;
export const REACH_CELL = BODY_DIAMETER;
