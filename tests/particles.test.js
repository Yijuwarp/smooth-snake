import test from "node:test";
import assert from "node:assert/strict";
import { createParticles, spawnParticles, updateParticles } from "../js/particles.js";

test("createParticles returns empty array", () => {
  const particles = createParticles();
  assert.deepEqual(particles, []);
});

test("spawnParticles creates particles within capacity limit", () => {
  const game = { particles: [] };
  spawnParticles(game, 100, 100, 10, { colors: ["#ff0000"] });
  assert.equal(game.particles.length, 10);
  assert.equal(game.particles[0].color, "#ff0000");

  // Spawn beyond max cap 180
  spawnParticles(game, 100, 100, 200, { colors: ["#00ff00"] });
  assert.ok(game.particles.length <= 180, "Particle count should stay capped at 180");
});

test("updateParticles decays alpha and removes dead particles via swap-and-pop", () => {
  const game = {
    particles: [
      { x: 0, y: 0, vx: 0, vy: 0, alpha: 0.1, decay: 2.0, gravity: 0 }, // will die
      { x: 10, y: 10, vx: 0, vy: 0, alpha: 1.0, decay: 0.1, gravity: 0 }, // will stay alive
    ],
  };

  updateParticles(game, 0.1);
  assert.equal(game.particles.length, 1, "Dead particle should be removed");
  assert.equal(game.particles[0].x, 10, "Remaining particle should be preserved");
});
