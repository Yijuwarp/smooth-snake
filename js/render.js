import {
  ARENA_W,
  ARENA_H,
  SNAKE_RADIUS,
  BODY_DIAMETER,
  FOOD_RADIUS,
  STAR_RADIUS,
  SPIKE_RADIUS,
  POWER_UP_RADIUS,
  COMBO_WINDOW,
  LEVEL_BANNER_DURATION,
  MAX_HEARTS,
  HIT_FLASH_DURATION,
  TOUCH_MODE,
  getTouchButtons,
} from "./config.js";
import { drawParticles } from "./particles.js";
// On-screen touch button sprites (assets/btn-{kind}-{state}.png): state 0 is
// disabled (meter empty), 1 ready, 2 held. Each file is a 360px cell whose
// button frame is ~310px — SPRITE_FRAME_FRAC scales so the frame (not the
// glow, which is allowed to overflow) matches the button rect.
const SPRITE_FRAME_FRAC = 310 / 360;
function loadButtonSprites(kind) {
  return [0, 1, 2].map((state) => {
    const img = new Image();
    img.src = `assets/btn-${kind}-${state}.png`;
    return img;
  });
}
const BTN_SPRITES = { boost: loadButtonSprites("boost"), slow: loadButtonSprites("slow") };

const COLOR_BG = "#0f1520";
const COLOR_BORDER = "#3a4a63";
const COLOR_FOOD = "#4ee08a";
const COLOR_SPIKE_BASE = "#b0472f";
const COLOR_SPIKE_TIP = "#ff8c4a";
const COLOR_SNAKE_BODY = "#4fd1e8";
const COLOR_SNAKE_HEAD = "#7fe8ff";
const COLOR_EYE = "#0f1520";
const COLOR_POWER_UP = "#fff44d";

// Computes the scale/offset that letterboxes the logical arena, centered,
// inside the current canvas backing-store size.
export function computeViewport(canvas) {
  const scale = Math.min(canvas.width / ARENA_W, canvas.height / ARENA_H);
  const offsetX = (canvas.width - ARENA_W * scale) / 2;
  const offsetY = (canvas.height - ARENA_H * scale) / 2;
  return { scale, offsetX, offsetY };
}

// Setting width/height clears the canvas, so only touch them when the CSS
// size actually changed; cheap enough to call every frame.
export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function render(game, ctx, canvas) {
  const { scale, offsetX, offsetY } = computeViewport(canvas);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let shakeX = 0, shakeY = 0;
  if (game.screenShake > 0 && game.state !== "gameover") {
    const power = game.screenShake * 12;
    shakeX = (Math.random() - 0.5) * power;
    shakeY = (Math.random() - 0.5) * power;
  }

  ctx.translate(offsetX + shakeX, offsetY + shakeY);
  ctx.scale(scale, scale);

  drawArena(ctx);
  drawParticles(ctx, game);

  if (game.food) {
    if (game.food.isStar) drawStar(ctx, game.food, game.time);
    else drawFood(ctx, game.food, game.time);
  }
  if (game.powerUp) drawPowerUp(ctx, game.powerUp, game.time);
  drawSpikes(ctx, game.spikes, game.time, game.level);

  // A fresh bite always shows through even mid-boost/slow — it's the shorter,
  // more special pulse, while serious/constipated are the sustained "what
  // the player is currently doing" state underneath it.
  const expression =
    game.state === "gameover" ? "dead"
    : game.hitFlash > 0 ? "ouch"
    : game.eatFlash > 0 ? "happy"
    : game.boosting && game.boost > 0 ? "serious"
    : game.slowing && game.boost > 0 ? "constipated"
    : "default";

  const blinking = game.invulnTimer > 0;
  if (blinking) {
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(game.time * 18));
  }
  drawSnake(ctx, game.snake, expression, game.time);
  if (blinking) ctx.restore();

  drawHud(ctx, game);
  if (TOUCH_MODE && (game.state === "playing" || game.state === "paused")) drawTouchButtons(ctx, game);
  if (game.banner) drawLevelBanner(ctx, game);

  if (game.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (game.hitFlash / HIT_FLASH_DURATION) * 0.35;
    ctx.fillStyle = "#ff3050";
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.restore();
  }

  if (game.state === "menu") {
    if (TOUCH_MODE) {
      // Touch: no HTML overlay — use the canvas title card as before.
      drawOverlay(ctx, "SSNAKE", "Tap to Play!", game);
    } else {
      // Desktop: the HTML #start-menu overlay handles all copy.
      // Just dim the live game preview behind it.
      ctx.fillStyle = "rgba(10, 14, 20, 0.72)";
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    }
  }
  if (game.state === "gameover") {
    const again = TOUCH_MODE ? "Tap to Play Again!" : "Click to Play Again!";
    drawOverlay(ctx, game.won ? "You Win!" : "Game Over", again, game);
  }
  if (game.state === "paused") {
    // The DOM pause panel floats on top; just dim the frozen arena behind it.
    ctx.fillStyle = "rgba(10, 14, 20, 0.55)";
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }

  ctx.restore();
}

function drawArena(ctx) {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // Subtle neon grid background
  ctx.strokeStyle = "rgba(79, 209, 232, 0.04)";
  ctx.lineWidth = 1;
  const gridSpacing = 40;
  ctx.beginPath();
  for (let x = 0; x < ARENA_W; x += gridSpacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA_H);
  }
  for (let y = 0; y < ARENA_H; y += gridSpacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA_W, y);
  }
  ctx.stroke();

  // Tiny neon dots at grid intersections
  ctx.fillStyle = "rgba(79, 209, 232, 0.15)";
  for (let x = gridSpacing; x < ARENA_W; x += gridSpacing) {
    for (let y = gridSpacing; y < ARENA_H; y += gridSpacing) {
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);
  drawWallTeeth(ctx);
}

// Tiny inward-pointing teeth along every wall — the walls kill, and these say
// so in the same warm color as the spikes without eating play space.
const TOOTH_SPACING = 30;
const TOOTH_DEPTH = 8;
const TOOTH_HALF = 5;

function drawWallTeeth(ctx) {
  ctx.fillStyle = COLOR_SPIKE_BASE;
  ctx.beginPath();
  for (let x = TOOTH_SPACING / 2; x < ARENA_W; x += TOOTH_SPACING) {
    ctx.moveTo(x - TOOTH_HALF, 0);
    ctx.lineTo(x + TOOTH_HALF, 0);
    ctx.lineTo(x, TOOTH_DEPTH);
    ctx.moveTo(x - TOOTH_HALF, ARENA_H);
    ctx.lineTo(x + TOOTH_HALF, ARENA_H);
    ctx.lineTo(x, ARENA_H - TOOTH_DEPTH);
  }
  for (let y = TOOTH_SPACING / 2; y < ARENA_H; y += TOOTH_SPACING) {
    ctx.moveTo(0, y - TOOTH_HALF);
    ctx.lineTo(0, y + TOOTH_HALF);
    ctx.lineTo(TOOTH_DEPTH, y);
    ctx.moveTo(ARENA_W, y - TOOTH_HALF);
    ctx.lineTo(ARENA_W, y + TOOTH_HALF);
    ctx.lineTo(ARENA_W - TOOTH_DEPTH, y);
  }
  ctx.fill();
}

function drawFood(ctx, food, time) {
  const pulse = Math.sin(time * 6) * 1.5;
  const radius = FOOD_RADIUS + pulse;

  // Outer glowing aura
  const glow = ctx.createRadialGradient(food.x, food.y, radius * 0.3, food.x, food.y, radius * 2.2);
  glow.addColorStop(0, "rgba(78, 224, 138, 0.45)");
  glow.addColorStop(1, "rgba(78, 224, 138, 0)");
  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(food.x, food.y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Food body
  ctx.fillStyle = COLOR_FOOD;
  ctx.beginPath();
  ctx.arc(food.x, food.y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Specular shine (reflection)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(food.x - radius * 0.35, food.y - radius * 0.35, radius * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(ctx, star, time) {
  const points = 5;
  const outer = STAR_RADIUS;
  const inner = STAR_RADIUS * 0.45;
  const pulse = 1 + Math.sin(time * 5) * 0.08;

  ctx.save();
  ctx.translate(star.x, star.y);
  ctx.rotate(time * 1.2);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "#ffd257";
  ctx.shadowColor = "#ffd257";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPowerUp(ctx, powerUp, time) {
  const pulse = 1 + Math.sin(time * 6) * 0.12;
  const s = POWER_UP_RADIUS / 10; // hand-tuned bolt path assumes a 10-unit scale

  ctx.save();
  ctx.translate(powerUp.x, powerUp.y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = COLOR_POWER_UP;
  ctx.shadowColor = COLOR_POWER_UP;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(2 * s, -10 * s);
  ctx.lineTo(-6 * s, 1 * s);
  ctx.lineTo(-1 * s, 1 * s);
  ctx.lineTo(-3 * s, 10 * s);
  ctx.lineTo(6 * s, -2 * s);
  ctx.lineTo(1 * s, -2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSpikes(ctx, spikes, time, level) {
  const spikeCount = 8;
  for (const s of spikes) {
    // Shaking spikes jitter in place as a warning (visual only — the kill
    // circle stays at the base position until the glide starts).
    let dx = 0, dy = 0;
    if (s.phase === "shake") {
      dx = Math.sin(s.t * 45) * 2.2;
      dy = Math.cos(s.t * 38) * 2.2;
    }
    const sx = s.x + dx, sy = s.y + dy;
    const moving = s.phase === "move";
    // Level 3: swelling spikes spin and scale up to GROW_MAX_MULT, then back.
    const sizeMult = s.sizeMult || 1;
    const growing = sizeMult > 1.02;
    const rotation = s.rotation || 0;
    const r = SPIKE_RADIUS * sizeMult;

    // Draw warning threat ring around shaking spikes
    if (s.phase === "shake" && level < 3) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 48, 80, 0.65)";
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 4]);

      const progress = s.t / 0.8; // SPIKE_SHAKE_TIME is 0.8
      const ringRadius = r * (1.5 + (1 - progress) * 1.5);
      ctx.beginPath();
      ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Visual distinction for drone
    if (s.isDrone) {
      ctx.save();
      const isCooldown = s.bounceTimer > 0 || s.hitPlayerTimer > 0;
      ctx.shadowBlur = isCooldown ? 10 : 20;
      ctx.shadowColor = isCooldown ? "#38bdf8" : "#ff3050";
      ctx.strokeStyle = isCooldown ? "rgba(56, 189, 248, 0.6)" : "rgba(255, 48, 80, 0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Central core with radial gradient
    const spikeGrad = ctx.createRadialGradient(sx, sy, r * 0.1, sx, sy, r * 0.6);
    if (s.isDrone) {
      const isCooldown = s.bounceTimer > 0 || s.hitPlayerTimer > 0;
      spikeGrad.addColorStop(0, isCooldown ? "#38bdf8" : "#ff3050");
      spikeGrad.addColorStop(1, "#180a0d");
    } else {
      spikeGrad.addColorStop(0, moving || growing ? "#ffa257" : "#ff5030");
      spikeGrad.addColorStop(1, COLOR_SPIKE_BASE);
    }
    ctx.fillStyle = spikeGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2);
    ctx.fill();

    if (s.isDrone) {
      ctx.fillStyle = (s.bounceTimer > 0 || s.hitPlayerTimer > 0) ? "#7dd3fc" : "#ff6b8b";
    } else {
      ctx.fillStyle = moving || growing ? "#ffb066" : COLOR_SPIKE_TIP;
    }
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2 + rotation;
      const baseAngle1 = angle - Math.PI / spikeCount;
      const baseAngle2 = angle + Math.PI / spikeCount;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(angle) * r, sy + Math.sin(angle) * r);
      ctx.lineTo(sx + Math.cos(baseAngle1) * r * 0.5, sy + Math.sin(baseAngle1) * r * 0.5);
      ctx.lineTo(sx + Math.cos(baseAngle2) * r * 0.5, sy + Math.sin(baseAngle2) * r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawSnake(ctx, snake, expression, time) {
  const segCount = snake.segments.length;

  // 1. Draw outer body glow (tail to head)
  ctx.fillStyle = "rgba(79, 209, 232, 0.22)";
  for (let i = segCount - 1; i >= 0; i--) {
    const seg = snake.segments[i];
    const t = segCount > 1 ? i / (segCount - 1) : 0;
    const r = SNAKE_RADIUS * (1.0 - t * 0.45); // Taper down to 55%
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Draw inner body (tail to head)
  ctx.fillStyle = COLOR_SNAKE_BODY;
  for (let i = segCount - 1; i >= 0; i--) {
    const seg = snake.segments[i];
    const t = segCount > 1 ? i / (segCount - 1) : 0;
    const r = SNAKE_RADIUS * (1.0 - t * 0.45);
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Draw head glow
  ctx.fillStyle = "rgba(127, 232, 255, 0.35)";
  ctx.beginPath();
  ctx.arc(snake.x, snake.y, SNAKE_RADIUS * 1.2 * 1.45, 0, Math.PI * 2);
  ctx.fill();

  // 4. Draw head solid
  ctx.fillStyle = COLOR_SNAKE_HEAD;
  ctx.beginPath();
  ctx.arc(snake.x, snake.y, SNAKE_RADIUS * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // 5. Draw animated tongue occasionally (repeats every 2.4s, darts for 0.35s)
  const tongueCycle = time % 2.4;
  if (tongueCycle < 0.35 && expression !== "dead") {
    ctx.save();
    ctx.strokeStyle = "#ff4f73";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const progress = tongueCycle / 0.35;
    const len = SNAKE_RADIUS * 1.0 * Math.sin(progress * Math.PI); // extend & retract smoothly

    const hx = snake.x + Math.cos(snake.theta) * SNAKE_RADIUS * 1.1;
    const hy = snake.y + Math.sin(snake.theta) * SNAKE_RADIUS * 1.1;
    const tx = hx + Math.cos(snake.theta) * len;
    const ty = hy + Math.sin(snake.theta) * len;

    // fork
    const forkAngle = 0.45;
    const forkLen = len * 0.35;
    const fx1 = tx + Math.cos(snake.theta + forkAngle) * forkLen;
    const fy1 = ty + Math.sin(snake.theta + forkAngle) * forkLen;
    const fx2 = tx + Math.cos(snake.theta - forkAngle) * forkLen;
    const fy2 = ty + Math.sin(snake.theta - forkAngle) * forkLen;

    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.moveTo(tx, ty);
    ctx.lineTo(fx1, fy1);
    ctx.moveTo(tx, ty);
    ctx.lineTo(fx2, fy2);
    ctx.stroke();
    ctx.restore();
  }

  const eyeOffset = SNAKE_RADIUS * 0.6;
  const eyeForward = SNAKE_RADIUS * 0.7;
  const perp = snake.theta + Math.PI / 2;
  for (const sign of [-1, 1]) {
    const ex = snake.x + Math.cos(snake.theta) * eyeForward + Math.cos(perp) * eyeOffset * sign;
    const ey = snake.y + Math.sin(snake.theta) * eyeForward + Math.sin(perp) * eyeOffset * sign;
    drawEye(ctx, ex, ey, 2.2, expression, sign);
  }
}

// Screen-aligned (not rotated with snake.theta) — a wince, dome, or X reads
// fine at any heading, and staying unrotated keeps this simple. `sign`
// (-1/+1, same value used to place this eye) only matters for expressions
// that mirror left vs. right, like the angled "serious" slits.
function drawEye(ctx, x, y, r, expression, sign) {
  ctx.fillStyle = COLOR_EYE;
  ctx.strokeStyle = COLOR_EYE;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";

  if (expression === "dead") {
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
  } else if (expression === "ouch") {
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.stroke();
  } else if (expression === "happy") {
    // Small dome arc — cartoon "^" closed content eye.
    ctx.beginPath();
    ctx.arc(x, y + r * 0.4, r, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (expression === "serious") {
    // Angled slit, mirrored by `sign` so the pair reads as a determined
    // "V" brow — inner ends (toward the other eye) tilt down.
    const len = r * 1.3, amp = r * 0.6 * sign;
    ctx.beginPath();
    ctx.moveTo(x - len, y - amp);
    ctx.lineTo(x + len, y + amp);
    ctx.stroke();
  } else if (expression === "constipated") {
    // Tight zigzag — a scrunched, strained squint.
    const w = r * 1.1, h = r * 0.75;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w * 0.33, y - h);
    ctx.lineTo(x + w * 0.33, y + h);
    ctx.lineTo(x + w, y - h);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Add white shine highlight dot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHud(ctx, game) {
  ctx.fillStyle = "#e8f0f8";
  ctx.font = "bold 22px 'Outfit', sans-serif";
  ctx.textBaseline = "top";

  // Combo multiplier + countdown bar, only while a chain is running.
  // Right-aligned under the score, mirroring the old left-side layout.
  if (game.comboTimer > 0) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd257";
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.fillText(`×${game.multiplier}`, ARENA_W - 16, 42);
    const frac = game.comboTimer / COMBO_WINDOW;
    const barW = 90, barX = ARENA_W - 150;
    ctx.fillStyle = "rgba(255, 210, 87, 0.25)";
    ctx.fillRect(barX, 48, barW, 8);
    ctx.fillStyle = "#ffd257";
    ctx.fillRect(barX, 48, barW * frac, 8);
  }

  // Shared boost/precision meter, bottom-center — pill bar with glow.
  // Golden at rest (matches the power-up pickup), cyan while boosting,
  // purple while in precision/slow mode.
  const bw = 200, bh = 14, bx = (ARENA_W - bw) / 2, by = ARENA_H - 24;
  const br = bh / 2; // fully rounded pill caps

  let boostColor = "#ffd257"; // golden default — matches power-up
  if (game.boosting && game.boost > 0) boostColor = "#7fe8ff";       // bright cyan
  else if (game.slowing && game.boost > 0) boostColor = "#c792ff";   // purple precision

  // Track pill
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, br);
  ctx.fill();

  // Filled portion: clip to fill width so the pill shape stays clean at any level.
  // The clip rect overshoots vertically so the shadow glow isn't hard-cut.
  if (game.boost > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by - 4, bw * game.boost, bh + 8);
    ctx.clip();

    ctx.shadowColor = boostColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = boostColor;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, br);
    ctx.fill();

    // Inner glass highlight along the top third of the fill
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.roundRect(bx + 3, by + 2, bw - 6, Math.floor(bh / 2) - 2, br - 1);
    ctx.fill();

    ctx.restore();
  }

  ctx.fillStyle = "#e8f0f8";
  ctx.font = "bold 22px 'Outfit', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Score: ${game.score}`, ARENA_W - 16, 14);

  if (game.devMode) {
    ctx.font = "13px 'Share Tech Mono', monospace";
    ctx.fillStyle = "#9fb3c8";
    ctx.textAlign = "right";
    ctx.fillText(`Speed: ${game.currentSpeed.toFixed(0)} px/s`, ARENA_W - 16, 64);
    ctx.fillText(`Pellets: ${game.eaten}`, ARENA_W - 16, 82);
  }

  ctx.textAlign = "center";
  ctx.font = "bold 18px 'Outfit', sans-serif";
  ctx.fillStyle = "#9fb3c8";
  ctx.fillText(`Level ${game.level}`, ARENA_W / 2, 14);

  drawHearts(ctx, game);

  // Final level: counts down the seconds the player must survive before the
  // star appears. Only shown once the FINAL LEVEL banner has cleared.
  if (game.starPending && !game.banner) {
    ctx.textAlign = "center";
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.fillStyle = "#ff6b4a";
    ctx.fillText(`Survive! ${Math.ceil(game.survivalTimer)}`, ARENA_W / 2, 66);
  }
}

function drawTouchButtons(ctx, game) {
  const buttons = getTouchButtons();
  for (const kind of ["boost", "slow"]) {
    const b = buttons[kind];
    const pressed = kind === "boost" ? game.boosting : game.slowing;
    const state = game.boost <= 0 ? 0 : pressed ? 2 : 1;
    const img = BTN_SPRITES[kind][state];
    if (!img.complete || !img.naturalWidth) continue; // still loading
    const size = b.w / SPRITE_FRAME_FRAC;
    ctx.drawImage(img, b.x + b.w / 2 - size / 2, b.y + b.h / 2 - size / 2, size, size);
  }
}

function drawHearts(ctx, game) {
  const size = 20;
  const maxHearts = game.maxHearts || MAX_HEARTS;
  const startX = ARENA_W / 2 - ((maxHearts - 1) * size) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "16px 'Outfit', sans-serif";
  for (let i = 0; i < maxHearts; i++) {
    ctx.fillStyle = i < game.hearts ? "#ff5c72" : "rgba(255, 255, 255, 0.18)";
    ctx.fillText("♥", startX + i * size, 40);
  }
  ctx.textBaseline = "top";
}

function drawLevelBanner(ctx, game) {
  const { t, title, subtitle, duration } = game.banner;
  const dur = duration || LEVEL_BANNER_DURATION;
  // Quick fade in, hold, fade out over the banner duration.
  const fadeIn = Math.min(1, t / 0.25);
  const fadeOut = Math.min(1, (dur - t) / 0.4);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  const lines = subtitle ? (Array.isArray(subtitle) ? subtitle : [subtitle]) : [];

  ctx.save();
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, ARENA_H / 2 - 80, ARENA_W, 170);

  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd257";
  ctx.font = "bold 54px 'Outfit', sans-serif";
  ctx.fillText(title, ARENA_W / 2, ARENA_H / 2 - 16);

  ctx.fillStyle = "#e8f0f8";
  ctx.font = "20px 'Outfit', sans-serif";
  lines.forEach((line, i) => {
    const lineY = ARENA_H / 2 + 34 + i * 26;
    if (Array.isArray(line)) drawMixedBoldLine(ctx, line, ARENA_W / 2, lineY);
    else ctx.fillText(line, ARENA_W / 2, lineY);
  });
  ctx.restore();
}

// Renders a line built from { text, bold } segments, centered as a whole —
// canvas fillText has no inline bold, so segment widths are measured first
// to find the combined line's left edge, then each piece is drawn in turn.
function drawMixedBoldLine(ctx, segments, centerX, y) {
  const NORMAL_FONT = "20px 'Outfit', sans-serif";
  const BOLD_FONT = "bold 20px 'Outfit', sans-serif";
  let totalWidth = 0;
  for (const seg of segments) {
    ctx.font = seg.bold ? BOLD_FONT : NORMAL_FONT;
    totalWidth += ctx.measureText(seg.text).width;
  }

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let x = centerX - totalWidth / 2;
  for (const seg of segments) {
    ctx.font = seg.bold ? BOLD_FONT : NORMAL_FONT;
    ctx.fillText(seg.text, x, y);
    x += ctx.measureText(seg.text).width;
  }
  ctx.textAlign = prevAlign;
}

function drawOverlay(ctx, title, subtitle, game) {
  ctx.fillStyle = "rgba(10, 14, 20, 0.72)";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // The arena reshapes to the screen's aspect ratio (see setArenaSize), so a
  // phone-portrait arena is much narrower than the 900px these layouts were
  // tuned for. Scale fonts and line spacing down with the arena so nothing
  // overflows; k tops out at 1 so desktop is untouched.
  const k = Math.min(1, ARENA_W / 720, ARENA_H / 560);
  const font = (px, style = "") => `${style}${Math.round(px * k)}px 'Outfit', sans-serif`;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const b = game.finalBreakdown;

  let y = ARENA_H / 2 - (b ? 110 : 60) * k;
  ctx.fillStyle = "#e8f0f8";
  ctx.font = font(48, "bold ");
  ctx.fillText(title, ARENA_W / 2, y);
  y += 56 * k;

  if (b) {
    ctx.font = font(22);
    ctx.fillStyle = "#e8f0f8";
    ctx.fillText(`Score: ${Math.round(b.base)}`, ARENA_W / 2, y);

    const bonusLines = [];
    if (b.starBonusPct > 0) bonusLines.push(`Star Collected +${Math.round(b.starBonusPct * 100)}%`);
    if (b.lifeBonusPct > 0) bonusLines.push(`Life Bonus x${b.heartsRemaining} +${Math.round(b.lifeBonusPct * 100)}%`);
    if (b.speedBonusPct > 0) bonusLines.push(`Speed Bonus x${b.speedBonusCount} +${Math.round(b.speedBonusPct * 100)}%`);

    if (bonusLines.length > 0) {
      y += 28 * k;
      ctx.font = font(14, "italic ");
      ctx.fillStyle = "#9fb3c8";
      ctx.fillText("bonuses", ARENA_W / 2, y);

      ctx.font = font(16);
      ctx.fillStyle = "#ffd257";
      for (const line of bonusLines) {
        y += 22 * k;
        ctx.fillText(line, ARENA_W / 2, y);
      }

      y += 34 * k;
      ctx.font = font(22, "bold ");
      ctx.fillStyle = "#e8f0f8";
      ctx.fillText(`Final Score: ${Math.round(b.total)}`, ARENA_W / 2, y);
    }
    y += 34 * k;
  } else {
    y += 10 * k;
  }

  ctx.font = font(20);
  ctx.fillStyle = "#9fb3c8";
  y += 16 * k;
  ctx.fillText(subtitle, ARENA_W / 2, y);

  y += 32 * k;
  ctx.font = font(16);
  let hint;
  if (TOUCH_MODE) {
    hint = "Drag to steer · hold the corner buttons to boost or slow";
  } else if (game.controlType === "keyboard" || game.controlType === "keyboard_wasd" || game.controlType === "keyboard_arrows") {
    hint = "WASD / Arrows to steer · Space boost · Shift slow · Esc pauses";
  } else {
    hint = "Steer with the mouse · Esc pauses · M mutes · F fullscreen";
  }
  ctx.fillText(hint, ARENA_W / 2, y);
}
