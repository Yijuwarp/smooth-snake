import { MAX_DT } from "./config.js";
import { createGame, resetGame, update } from "./game.js";
import { render, resizeCanvas } from "./render.js";
import { setupInput } from "./input.js";
import { playStart, getSfxVolume, setSfxVolume } from "./audio.js";
import { startMusic, getMusicVolume, setMusicVolume, currentTrackName } from "./music.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const game = createGame();

function activate() {
  if (game.state !== "playing" && game.state !== "paused") {
    resetGame(game);
    playStart();
    startMusic();
  }
}

const menu = document.getElementById("pause-menu");
const musicSlider = document.getElementById("music-vol");
const sfxSlider = document.getElementById("sfx-vol");
const trackLabel = document.getElementById("track-name");

function showTrackName() {
  trackLabel.textContent = `♫ ${currentTrackName()}`;
}

function togglePause() {
  if (game.state === "playing") {
    game.state = "paused";
    musicSlider.value = Math.round(getMusicVolume() * 100);
    sfxSlider.value = Math.round(getSfxVolume() * 100);
    showTrackName();
    menu.hidden = false;
  } else if (game.state === "paused") {
    game.state = "playing";
    menu.hidden = true;
  }
}

musicSlider.addEventListener("input", () => setMusicVolume(musicSlider.value / 100));
sfxSlider.addEventListener("input", () => setSfxVolume(sfxSlider.value / 100));
document.getElementById("resume-btn").addEventListener("click", togglePause);

setupInput(game, canvas, { onActivate: activate, onPause: togglePause, onTrackChange: showTrackName });

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;

  resizeCanvas(canvas);
  update(game, dt);
  render(game, ctx, canvas);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
