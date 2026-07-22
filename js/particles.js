/**
 * Simple, high-performance particle system for Smooth Snake.
 * Avoids heavy allocation by capping the active particles array.
 */

export function createParticles() {
  return [];
}

export function spawnParticles(game, x, y, count, options = {}) {
  if (!game.particles) {
    game.particles = [];
  }

  const colors = options.colors || ["#ffffff"];
  const speed = options.speed || 80;
  const size = options.size || 3;
  const decay = options.decay || 1.5; // alpha decay rate per second
  const gravity = options.gravity || 0;
  const speedVar = options.speedVar || 0.7; // variation in speed

  for (let i = 0; i < count; i++) {
    // Keep max particles under control to prevent performance degradation
    if (game.particles.length >= 180) {
      game.particles.shift();
    }

    const angle = options.angle !== undefined ? options.angle + (Math.random() - 0.5) * (options.angleSpread || 0.4) : Math.random() * Math.PI * 2;
    const actualSpeed = (1 - speedVar + Math.random() * speedVar) * speed;

    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * actualSpeed,
      vy: Math.sin(angle) * actualSpeed,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: (0.4 + Math.random() * 0.6) * size,
      alpha: 1.0,
      decay: (0.8 + Math.random() * 0.4) * decay,
      gravity,
    });
  }
}

export function updateParticles(game, dt) {
  if (!game.particles || game.particles.length === 0) return;

  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.alpha -= p.decay * dt;

    if (p.alpha <= 0) {
      game.particles.splice(i, 1);
    }
  }
}

export function drawParticles(ctx, game) {
  if (!game.particles || game.particles.length === 0) return;

  ctx.save();
  for (let i = 0; i < game.particles.length; i++) {
    const p = game.particles[i];
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
