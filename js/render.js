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
} from "./config.js";
import { isMuted } from "./audio.js";

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
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  drawArena(ctx);
  if (game.food) {
    if (game.food.isStar) drawStar(ctx, game.food, game.time);
    else drawFood(ctx, game.food, game.time);
  }
  if (game.powerUp) drawPowerUp(ctx, game.powerUp, game.time);
  drawSpikes(ctx, game.spikes, game.time);

  const blinking = game.invulnTimer > 0;
  if (blinking) {
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(game.time * 18));
  }
  drawSnake(ctx, game.snake);
  if (blinking) ctx.restore();

  drawHud(ctx, game);
  if (game.banner) drawLevelBanner(ctx, game);

  if (game.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (game.hitFlash / HIT_FLASH_DURATION) * 0.35;
    ctx.fillStyle = "#ff3050";
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.restore();
  }

  if (game.state === "menu") drawOverlay(ctx, "Smooth Snake", "Click or press Enter to play", game);
  if (game.state === "gameover") {
    drawOverlay(ctx, game.won ? "You Win!" : "Game Over", "Click or press Enter to play again", game);
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
  const pulse = Math.sin(time * 4) * 1.5;
  ctx.fillStyle = COLOR_FOOD;
  ctx.beginPath();
  ctx.arc(food.x, food.y, FOOD_RADIUS + pulse, 0, Math.PI * 2);
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

function drawSpikes(ctx, spikes, time) {
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

    ctx.fillStyle = COLOR_SPIKE_BASE;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = moving || growing ? "#ffb066" : COLOR_SPIKE_TIP;
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

function drawSnake(ctx, snake) {
  ctx.strokeStyle = COLOR_SNAKE_BODY;
  ctx.lineWidth = BODY_DIAMETER;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(snake.x, snake.y);
  for (const seg of snake.segments) {
    ctx.lineTo(seg.x, seg.y);
  }
  ctx.stroke();

  ctx.fillStyle = COLOR_SNAKE_HEAD;
  ctx.beginPath();
  ctx.arc(snake.x, snake.y, SNAKE_RADIUS * 1.2, 0, Math.PI * 2);
  ctx.fill();

  const eyeOffset = SNAKE_RADIUS * 0.6;
  const eyeForward = SNAKE_RADIUS * 0.7;
  const perp = snake.theta + Math.PI / 2;
  for (const sign of [-1, 1]) {
    const ex = snake.x + Math.cos(snake.theta) * eyeForward + Math.cos(perp) * eyeOffset * sign;
    const ey = snake.y + Math.sin(snake.theta) * eyeForward + Math.sin(perp) * eyeOffset * sign;
    ctx.fillStyle = COLOR_EYE;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHud(ctx, game) {
  ctx.fillStyle = "#e8f0f8";
  ctx.font = "bold 22px sans-serif";
  ctx.textBaseline = "top";

  ctx.textAlign = "left";
  ctx.fillText(`Score: ${game.score}`, 16, 14);

  // Combo multiplier + countdown bar, only while a chain is running.
  if (game.comboTimer > 0) {
    ctx.fillStyle = "#ffd257";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`×${game.multiplier}`, 16, 42);
    const frac = game.comboTimer / COMBO_WINDOW;
    ctx.fillStyle = "rgba(255, 210, 87, 0.25)";
    ctx.fillRect(60, 48, 90, 8);
    ctx.fillStyle = "#ffd257";
    ctx.fillRect(60, 48, 90 * frac, 8);
  }

  // Shared boost/precision meter, bottom-right.
  const bw = 190, bh = 10, bx = ARENA_W - 16 - bw, by = ARENA_H - 34;
  ctx.fillStyle = "#9fb3c8";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("L-click boost · R-click precision", bx + bw, by - 6);
  ctx.fillStyle = "rgba(79, 209, 232, 0.2)";
  ctx.fillRect(bx, by, bw, bh);
  let boostColor = "#4fd1e8";
  if (game.boosting && game.boost > 0) boostColor = "#7fe8ff";
  else if (game.slowing && game.boost > 0) boostColor = "#c792ff";
  ctx.fillStyle = boostColor;
  ctx.fillRect(bx, by, bw * game.boost, bh);

  ctx.fillStyle = "#e8f0f8";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`High Score: ${game.highScore}`, ARENA_W - 16, 14);

  if (game.devMode) {
    ctx.font = "13px monospace";
    ctx.fillStyle = "#9fb3c8";
    ctx.textAlign = "right";
    ctx.fillText(`Speed: ${game.currentSpeed.toFixed(0)} px/s`, ARENA_W - 16, 40);
    ctx.fillText(`Pellets: ${game.eaten}`, ARENA_W - 16, 58);
  }

  ctx.textAlign = "left";
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#9fb3c8";
  ctx.fillText(`M · sound ${isMuted() ? "off" : "on"}   Esc · pause   B · next track   F · fullscreen`, 16, ARENA_H - 28);

  ctx.textAlign = "center";
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#9fb3c8";
  ctx.fillText(`Level ${game.level}`, ARENA_W / 2, 14);

  drawHearts(ctx, game);

  // Final level: counts down the seconds the player must survive before the
  // star appears. Only shown once the FINAL LEVEL banner has cleared.
  if (game.starPending && !game.banner) {
    ctx.textAlign = "center";
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#ff6b4a";
    ctx.fillText(`Survive! ${Math.ceil(game.survivalTimer)}`, ARENA_W / 2, 66);
  }
}

function drawHearts(ctx, game) {
  const size = 20;
  const startX = ARENA_W / 2 - ((MAX_HEARTS - 1) * size) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "16px sans-serif";
  for (let i = 0; i < MAX_HEARTS; i++) {
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
  ctx.font = "bold 54px sans-serif";
  ctx.fillText(title, ARENA_W / 2, ARENA_H / 2 - 16);

  ctx.fillStyle = "#e8f0f8";
  ctx.font = "20px sans-serif";
  lines.forEach((line, i) => {
    ctx.fillText(line, ARENA_W / 2, ARENA_H / 2 + 34 + i * 26);
  });
  ctx.restore();
}

function drawOverlay(ctx, title, subtitle, game) {
  ctx.fillStyle = "rgba(10, 14, 20, 0.72)";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const b = game.finalBreakdown;

  let y = ARENA_H / 2 - (b ? 110 : 60);
  ctx.fillStyle = "#e8f0f8";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(title, ARENA_W / 2, y);
  y += 56;

  if (b) {
    ctx.font = "22px sans-serif";
    ctx.fillStyle = "#e8f0f8";
    ctx.fillText(`Score: ${Math.round(b.base)}`, ARENA_W / 2, y);

    const bonusLines = [];
    if (b.starBonusPct > 0) bonusLines.push(`Star Collected +${Math.round(b.starBonusPct * 100)}%`);
    if (b.lifeBonusPct > 0) bonusLines.push(`Life Bonus x${b.heartsRemaining} +${Math.round(b.lifeBonusPct * 100)}%`);
    if (b.speedBonusPct > 0) bonusLines.push(`Speed Bonus x${b.speedBonusCount} +${Math.round(b.speedBonusPct * 100)}%`);

    if (bonusLines.length > 0) {
      y += 28;
      ctx.font = "italic 14px sans-serif";
      ctx.fillStyle = "#9fb3c8";
      ctx.fillText("bonuses", ARENA_W / 2, y);

      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#ffd257";
      for (const line of bonusLines) {
        y += 22;
        ctx.fillText(line, ARENA_W / 2, y);
      }

      y += 34;
      ctx.font = "bold 22px sans-serif";
      ctx.fillStyle = "#e8f0f8";
      ctx.fillText(`Final Score: ${Math.round(b.total)}`, ARENA_W / 2, y);
    }
    y += 34;
  } else {
    y += 10;
  }

  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#9fb3c8";
  ctx.fillText(`High Score: ${game.highScore}`, ARENA_W / 2, y);
  y += 40;
  ctx.fillText(subtitle, ARENA_W / 2, y);

  y += 32;
  ctx.font = "16px sans-serif";
  ctx.fillText("Steer with the mouse · Esc pauses · M mutes · B swaps music · F fullscreen", ARENA_W / 2, y);
}
