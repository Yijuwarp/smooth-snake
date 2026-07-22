import { getSettings, saveSettings } from "./storage.js";

// All CC0, see music/CREDITS.txt.
const TRACKS = {
  level1: { name: "Stage 1 - Chiptune Adventures (Juhani Junkala)", file: "music/stage1.ogg", loop: true },
  level2: { name: "Stage 2 - Chiptune Adventures (Juhani Junkala)", file: "music/stage2.ogg", loop: true },
  level3: { name: "Stage 3 - Boss Fight (Juhani Junkala)", file: "music/stage3.ogg", loop: true },
  level4: { name: "Final Stage - As Fast As You Can (Centurion of War)", file: "music/stage4.ogg", loop: true },
  victory: { name: "Victory Fanfare (congusbongus)", file: "music/victory.ogg", loop: false },
  gameover: { name: "Game Over (Cleyton Kauffman)", file: "music/gameover.ogg", loop: false }
};

let currentKey = "level1";
let el = null;
let volume = 0.6;
let enabled = true;
let started = false;

const settings = getSettings();
if (typeof settings.musicVolume === "number") {
  volume = Math.min(1, Math.max(0, settings.musicVolume));
}
if (typeof settings.musicEnabled === "boolean") {
  enabled = settings.musicEnabled;
}

export function playTrack(key) {
  currentKey = key;
  const track = TRACKS[key];
  if (!track) return;

  if (!el) {
    el = new Audio();
  }

  const relativeFile = track.file;
  if (!el.src.endsWith(relativeFile)) {
    el.src = relativeFile;
  }
  el.loop = track.loop;
  el.volume = volume;
  el.muted = !enabled;

  if (started) {
    el.play().catch(() => {});
  }
}

export function updateMusicForLevel(level) {
  if (level === 1) playTrack("level1");
  else if (level === 2) playTrack("level2");
  else if (level === 3) playTrack("level3");
  else if (level === 4) playTrack("level4");
}

// First call must come from a user-gesture handler so autoplay is allowed.
export function startMusic(level = 1) {
  started = true;
  updateMusicForLevel(level);
}

export function currentTrackName() {
  return TRACKS[currentKey] ? TRACKS[currentKey].name : "";
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
