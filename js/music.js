import { getSettings, saveSettings } from "./storage.js";

// All CC0, see music/CREDITS.txt.
const TRACKS = [
  { name: "Chill Lofi (loop edit)", file: "music/chill-lofi-loop.ogg" },
  { name: "Lofi Hip Hop Loop", file: "music/lofi-loop.ogg" },
  { name: "Lofi Hip Hop", file: "music/lofi-hip-hop.ogg" },
];

let el = null;
let index = 0;
let volume = 0.6;
let enabled = true;
let started = false;

const settings = getSettings();
if (Number.isInteger(settings.track) && settings.track >= 0 && settings.track < TRACKS.length) {
  index = settings.track;
}
if (typeof settings.musicVolume === "number") {
  volume = Math.min(1, Math.max(0, settings.musicVolume));
}
if (typeof settings.musicEnabled === "boolean") {
  enabled = settings.musicEnabled;
}

// First call must come from a user-gesture handler so autoplay is allowed.
export function startMusic() {
  if (!el) {
    el = new Audio(TRACKS[index].file);
    el.loop = true;
    el.volume = volume;
    el.muted = !enabled;
  }
  started = true;
  el.play().catch(() => {});
}

export function nextTrack() {
  index = (index + 1) % TRACKS.length;
  saveSettings({ track: index });
  if (el) {
    el.src = TRACKS[index].file;
    el.volume = volume;
    if (started) el.play().catch(() => {});
  }
  return TRACKS[index].name;
}

export function currentTrackName() {
  return TRACKS[index].name;
}

export function setMusicVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (el) el.volume = volume;
  saveSettings({ musicVolume: volume });
}

export function getMusicVolume() {
  return volume;
}

export function setMusicEnabled(v) {
  enabled = v;
  if (el) el.muted = !enabled;
  saveSettings({ musicEnabled: enabled });
}

export function getMusicEnabled() {
  return enabled;
}

// Back-compat wrapper used by the M-key hotkey.
export function setMusicMuted(m) {
  setMusicEnabled(!m);
}
