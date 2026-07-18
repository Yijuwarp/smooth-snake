import { ARENA_W, ARENA_H, SNAKE_RADIUS, BODY_DIAMETER, FOOD_RADIUS, SPIKE_RADIUS, COMBO_WINDOW, LEVEL_BANNER_DURATION } from "./config.js";
import { isMuted } from "./audio.js";

const COLOR_BG = "#0f1520";
const COLOR_BORDER = "#3a4a63";
const COLOR_FOOD = "#4ee08a";
const COLOR_SPIKE_BASE = "#b0472f";
const COLOR_SPIKE_TIP = "#ff8c4a";
const COLOR_SNAKE_BODY = "#4fd1e8";
const COLOR_SNAKE_HEAD = "#7fe8ff";
const COLOR_EYE = "#0f1520";

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
  drawFood(ctx, game.food, game.time);
  drawSpikes(ctx, game.spikes, game.time);
  drawSnake(ctx, game.snake);
  drawHud(ctx, game);
  if (game.levelTransition) drawLevelBanner(ctx, game);

  if (game.state === "menu") drawOverlay(ctx, "Smooth Snake", "Click or press Enter to play", game);
  if (game.state === "gameover") drawOverlay(ctx, "Game Over", "Click or press Enter to play again", game);
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

    ctx.fillStyle = COLOR_SPIKE_BASE;
    ctx.beginPath();
    ctx.arc(sx, sy, SPIKE_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = moving ? "#ffb066" : COLOR_SPIKE_TIP;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2;
      const baseAngle1 = angle - Math.PI / spikeCount;
      const baseAngle2 = angle + Math.PI / spikeCount;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(angle) * SPIKE_RADIUS, sy + Math.sin(angle) * SPIKE_RADIUS);
      ctx.lineTo(sx + Math.cos(baseAngle1) * SPIKE_RADIUS * 0.5, sy + Math.sin(baseAngle1) * SPIKE_RADIUS * 0.5);
      ctx.lineTo(sx + Math.cos(baseAngle2) * SPIKE_RADIUS * 0.5, sy + Math.sin(baseAngle2) * SPIKE_RADIUS * 0.5);
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

  // Boost meter, bottom-right.
  const bw = 120, bh = 10, bx = ARENA_W - 16 - bw, by = ARENA_H - 34;
  ctx.fillStyle = "#9fb3c8";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("hold click · boost", bx - 10, by - 2);
  ctx.fillStyle = "rgba(79, 209, 232, 0.2)";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = game.boosting && game.boost > 0 ? "#7fe8ff" : "#4fd1e8";
  ctx.fillRect(bx, by, bw * game.boost, bh);

  ctx.fillStyle = "#e8f0f8";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`High Score: ${game.highScore}`, ARENA_W - 16, 14);

  ctx.textAlign = "left";
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#9fb3c8";
  ctx.fillText(`M · sound ${isMuted() ? "off" : "on"}   Esc · pause   B · next track`, 16, ARENA_H - 28);

  ctx.textAlign = "center";
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#9fb3c8";
  ctx.fillText(`Level ${game.level}`, ARENA_W / 2, 14);
}

function drawLevelBanner(ctx, game) {
  const t = game.levelTransition.t;
  // Quick fade in, hold, fade out over the banner duration.
  const fadeIn = Math.min(1, t / 0.25);
  const fadeOut = Math.min(1, (LEVEL_BANNER_DURATION - t) / 0.4);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));

  ctx.save();
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, ARENA_H / 2 - 70, ARENA_W, 140);

  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd257";
  ctx.font = "bold 54px sans-serif";
  ctx.fillText(`LEVEL ${game.level}`, ARENA_W / 2, ARENA_H / 2 - 16);

  if (game.level === 2) {
    ctx.fillStyle = "#e8f0f8";
    ctx.font = "20px sans-serif";
    ctx.fillText("The spikes are waking up · pickups now worth ×3", ARENA_W / 2, ARENA_H / 2 + 34);
  }
  ctx.restore();
}

function drawOverlay(ctx, title, subtitle, game) {
  ctx.fillStyle = "rgba(10, 14, 20, 0.72)";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#e8f0f8";

  ctx.font = "bold 48px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(title, ARENA_W / 2, ARENA_H / 2 - 60);

  ctx.font = "24px sans-serif";
  ctx.fillText(`Score: ${game.score}`, ARENA_W / 2, ARENA_H / 2 - 10);
  ctx.fillText(`High Score: ${game.highScore}`, ARENA_W / 2, ARENA_H / 2 + 24);

  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#9fb3c8";
  ctx.fillText(subtitle, ARENA_W / 2, ARENA_H / 2 + 70);

  ctx.font = "16px sans-serif";
  ctx.fillText("Steer with the mouse · Esc pauses · M mutes · B swaps music", ARENA_W / 2, ARENA_H / 2 + 102);
}
