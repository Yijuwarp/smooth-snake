const HIGH_SCORE_KEY = "smooth-snake:high-score";

export function getHighScore() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    const value = raw === null ? 0 : parseInt(raw, 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function setHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    // localStorage unavailable (private mode, disabled, etc.) — ignore.
  }
}

const SETTINGS_KEY = "smooth-snake:settings";

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveSettings(patch) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getSettings(), ...patch }));
  } catch {
    // ignore
  }
}
