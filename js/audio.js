// Tiny Web Audio synth — no assets. The context is created lazily on the
// first sound, which the browser requires to happen after a user gesture;
// playStart() runs on the start click/Enter, so that's always satisfied.
import { getSettings, saveSettings } from "./storage.js";

let ctx = null;
let muted = false;
let sfxVolume = 0.8;

const settings = getSettings();
if (typeof settings.sfxVolume === "number") {
  sfxVolume = Math.min(1, Math.max(0, settings.sfxVolume));
}

export function setSfxVolume(v) {
  sfxVolume = Math.min(1, Math.max(0, v));
  saveSettings({ sfxVolume });
}

export function getSfxVolume() {
  return sfxVolume;
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

export function isMuted() {
  return muted;
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// One enveloped oscillator note, scheduled `at` seconds from now.
function note(freq, { at = 0, dur = 0.12, type = "sine", gain = 0.18, slideTo = 0 } = {}) {
  if (muted || sfxVolume <= 0) return;
  const ac = ensureCtx();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain * sfxVolume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export function playStart() {
  note(330, { dur: 0.09, type: "triangle" });
  note(495, { at: 0.09, dur: 0.14, type: "triangle" });
}

// Pitch climbs one step per pickup and wraps each octave, so a long streak
// audibly "ladders" upward.
export function playEat(eaten) {
  const freq = 440 * Math.pow(2, ((eaten - 1) % 8) / 8);
  note(freq, { dur: 0.1, type: "triangle", gain: 0.22 });
  note(freq * 2, { at: 0.02, dur: 0.08, gain: 0.08 });
}

export function playLevelUp() {
  note(440, { dur: 0.1, type: "triangle", gain: 0.2 });
  note(554, { at: 0.1, dur: 0.1, type: "triangle", gain: 0.2 });
  note(659, { at: 0.2, dur: 0.28, type: "triangle", gain: 0.22 });
}

export function playDeath() {
  // Two slightly detuned saws sliding down two octaves — a chunky "crash".
  note(220, { dur: 0.5, type: "sawtooth", gain: 0.22, slideTo: 55 });
  note(233, { dur: 0.5, type: "sawtooth", gain: 0.16, slideTo: 58 });
}

// A single low thud — a bounce off a wall/spike that costs a heart but isn't
// fatal, so it needs to read as distinctly less severe than playDeath().
export function playHit() {
  note(180, { dur: 0.16, type: "square", gain: 0.24, slideTo: 90 });
}

export function playWin() {
  [523, 659, 784, 1047].forEach((f, i) =>
    note(f, { at: i * 0.12, dur: 0.24, type: "triangle", gain: 0.24 })
  );
}
