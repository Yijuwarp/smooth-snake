import { computeViewport } from "./render.js";
import { toggleMute, isMuted } from "./audio.js";
import { nextTrack, setMusicMuted } from "./music.js";

// Wires mouse/keyboard input. `onActivate` fires on click or Enter (start or
// restart from menu/gameover), `onPause` on Escape, `onTrackChange` after B
// swaps the music track (so open UI can refresh the track name),
// `onToggleFullscreen` on F (kept in main.js so it can share state with its
// fullscreenchange listener).
export function setupInput(game, canvas, { onActivate, onPause, onTrackChange, onToggleFullscreen }) {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const { scale, offsetX, offsetY } = computeViewport(canvas);

    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const backingX = cssX * dpr;
    const backingY = cssY * dpr;

    game.mouse.x = (backingX - offsetX) / scale;
    game.mouse.y = (backingY - offsetY) / scale;
  });

  canvas.addEventListener("click", () => onActivate());

  // Left click: boost. Right click: the "precision" slow. Both share the
  // boost meter, so button-aware handling is needed on the way down and up.
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) game.boosting = true;
    if (e.button === 2) game.slowing = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) game.boosting = false;
    if (e.button === 2) game.slowing = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onActivate();
    if (e.key === "Escape") onPause();
    if (e.key === "m" || e.key === "M") {
      const m = toggleMute();
      setMusicMuted(m);
    }
    if (e.key === "b" || e.key === "B") {
      nextTrack();
      onTrackChange();
    }
    if (e.key === "f" || e.key === "F") onToggleFullscreen();
  });
}

export { isMuted };
