import { MAX_DT } from "./config.js";
import { createGame, resetGame, update, setDevMode, setTunable } from "./game.js";
import { render, resizeCanvas } from "./render.js";
import { setupInput } from "./input.js";
import { playStart, getSfxVolume, setSfxVolume, getSfxEnabled, setSfxEnabled } from "./audio.js";
import { startMusic, getMusicVolume, setMusicVolume, getMusicEnabled, setMusicEnabled, currentTrackName } from "./music.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const game = createGame();

function activate() {
  if (game.state !== "playing" && game.state !== "paused") {
    resetGame(game);
    playStart();
    startMusic(game.level);
  }
}

const menu = document.getElementById("pause-menu");
const musicSlider = document.getElementById("music-vol");
const sfxSlider = document.getElementById("sfx-vol");
const musicToggle = document.getElementById("music-toggle");
const sfxToggle = document.getElementById("sfx-toggle");
const fullscreenToggle = document.getElementById("fullscreen-toggle");
const devSection = document.getElementById("dev-section");
const devModeToggle = document.getElementById("dev-mode-toggle");
const devImmortalToggle = document.getElementById("dev-immortal");
const trackLabel = document.getElementById("track-name");
devModeToggle.checked = game.devMode;
devImmortalToggle.checked = game.tunables.immortal;

// Dev-mode tuning sliders: each maps a DOM control to a game.tunables key.
// Boost/slowdown are stored as multipliers internally but shown as percent.
const devSliders = [
  { input: document.getElementById("dev-maxspeed"), label: document.getElementById("dev-maxspeed-val"), key: "maxSpeed", toDisplay: (v) => v, fromDisplay: (v) => Number(v), unit: " px/s" },
  { input: document.getElementById("dev-turnrate"), label: document.getElementById("dev-turnrate-val"), key: "turnRate", toDisplay: (v) => v, fromDisplay: (v) => Number(v), unit: " rad/s" },
  { input: document.getElementById("dev-boost"), label: document.getElementById("dev-boost-val"), key: "boostMult", toDisplay: (v) => Math.round(v * 100), fromDisplay: (v) => Number(v) / 100, unit: "%" },
  { input: document.getElementById("dev-slow"), label: document.getElementById("dev-slow-val"), key: "slowMult", toDisplay: (v) => Math.round(v * 100), fromDisplay: (v) => Number(v) / 100, unit: "%" },
];

for (const s of devSliders) {
  s.input.addEventListener("input", () => {
    const value = s.fromDisplay(s.input.value);
    setTunable(game, s.key, value);
    s.label.textContent = `${s.input.value}${s.unit}`;
  });
}

function syncDevSliders() {
  for (const s of devSliders) {
    const display = s.toDisplay(game.tunables[s.key]);
    s.input.value = display;
    s.label.textContent = `${display}${s.unit}`;
  }
}
syncDevSliders();

// The dev section stays hidden until the user right-clicks the pause menu
// 4 times in a row — a deliberate easter egg, not something casual players
// should stumble into via a visible toggle.
let devTapCount = 0;
menu.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (devSection.hidden) {
    devTapCount++;
    if (devTapCount >= 4) devSection.hidden = false;
  }
});

function showTrackName() {
  trackLabel.textContent = `♫ ${currentTrackName()}`;
}

function syncFullscreenToggle() {
  fullscreenToggle.checked = !!document.fullscreenElement;
}

// True while we ourselves are toggling fullscreen (F key or the checkbox) —
// distinguishes a deliberate toggle from the browser's own Escape-exits-
// fullscreen behavior, which the fullscreenchange listener below also reacts
// to but should treat differently.
let explicitFullscreenChange = false;

function toggleFullscreen() {
  explicitFullscreenChange = true;
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
}

// True for a brief window after an Escape keydown, regardless of which way
// it toggled pause — lets the fullscreenchange listener tell "Escape already
// handled this" apart from "the browser exited fullscreen and swallowed the
// keydown", which many browsers do (Escape-exits-fullscreen is native UA
// behavior that doesn't always reach page script).
let escapeHandledThisExit = false;

function onEscapeKey() {
  escapeHandledThisExit = true;
  togglePause();
  setTimeout(() => {
    escapeHandledThisExit = false;
  }, 100);
}

document.addEventListener("fullscreenchange", () => {
  syncFullscreenToggle();
  if (document.fullscreenElement || explicitFullscreenChange) {
    explicitFullscreenChange = false;
    return;
  }
  // Defer so a keydown for this same Escape press (if the browser did
  // dispatch one) gets to run and flip game.state first; only step in if
  // nothing did — i.e. fullscreen silently vanished with no pause menu.
  setTimeout(() => {
    if (!escapeHandledThisExit && game.state === "playing") togglePause();
  }, 0);
});

function togglePause() {
  if (game.state === "playing") {
    game.state = "paused";
    musicSlider.value = Math.round(getMusicVolume() * 100);
    sfxSlider.value = Math.round(getSfxVolume() * 100);
    musicToggle.checked = getMusicEnabled();
    sfxToggle.checked = getSfxEnabled();
    syncFullscreenToggle();
    devModeToggle.checked = game.devMode;
    devImmortalToggle.checked = game.tunables.immortal;
    syncDevSliders();
    showTrackName();
    menu.hidden = false;
  } else if (game.state === "paused") {
    game.state = "playing";
    menu.hidden = true;
  }
}

musicSlider.addEventListener("input", () => setMusicVolume(musicSlider.value / 100));
sfxSlider.addEventListener("input", () => setSfxVolume(sfxSlider.value / 100));
musicToggle.addEventListener("change", () => setMusicEnabled(musicToggle.checked));
sfxToggle.addEventListener("change", () => setSfxEnabled(sfxToggle.checked));
fullscreenToggle.addEventListener("change", () => {
  explicitFullscreenChange = true;
  if (fullscreenToggle.checked && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else if (!fullscreenToggle.checked && document.fullscreenElement) document.exitFullscreen().catch(() => {});
});
devModeToggle.addEventListener("change", () => setDevMode(game, devModeToggle.checked));
devImmortalToggle.addEventListener("change", () => setTunable(game, "immortal", devImmortalToggle.checked));
document.getElementById("resume-btn").addEventListener("click", togglePause);

setupInput(game, canvas, { onActivate: activate, onPause: onEscapeKey, onToggleFullscreen: toggleFullscreen });

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
