import { computeViewport } from "./render.js";
import { toggleMute, isMuted } from "./audio.js";
import { setMusicMuted } from "./music.js";
import { TOUCH_MODE, getTouchButtons, GESTURE_MIN_DIST } from "./config.js";

// Converts a client-space point (mouse or touch) into logical arena coords,
// accounting for DPR and the letterboxed viewport.
function toArena(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const { scale, offsetX, offsetY } = computeViewport(canvas);
  const backingX = (clientX - rect.left) * dpr;
  const backingY = (clientY - rect.top) * dpr;
  return { x: (backingX - offsetX) / scale, y: (backingY - offsetY) / scale };
}

// Wires mouse/keyboard/touch input. `onActivate` fires on click, tap, or
// Enter (start or restart from menu/gameover), `onPause` on Escape,
// `onToggleFullscreen` on F (kept in main.js so it can share state with its
// fullscreenchange listener).
export function setupInput(game, canvas, { onActivate, onPause, onToggleFullscreen }) {
  canvas.addEventListener("mousemove", (e) => {
    const p = toArena(canvas, e.clientX, e.clientY);
    game.mouse.x = p.x;
    game.mouse.y = p.y;
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

  // --- Touch: drawing records a gesture path for the snake to follow, while
  // on-screen corner buttons boost/slow for as long as they're held.
  const touchRoles = new Map(); // touch identifier -> "boost" | "slow" | "steer"
  const HIT_PAD = 14; // extra forgiveness around the button frame
  const inRect = (p, r) =>
    p.x >= r.x - HIT_PAD && p.x <= r.x + r.w + HIT_PAD && p.y >= r.y - HIT_PAD && p.y <= r.y + r.h + HIT_PAD;

  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault(); // no synthetic mouse events, no scroll/zoom
      const buttons = TOUCH_MODE && game.state === "playing" ? getTouchButtons() : null;
      for (const t of e.changedTouches) {
        const p = toArena(canvas, t.clientX, t.clientY);
        if (buttons && inRect(p, buttons.boost)) {
          touchRoles.set(t.identifier, "boost");
          game.boosting = true;
        } else if (buttons && inRect(p, buttons.slow)) {
          touchRoles.set(t.identifier, "slow");
          game.slowing = true;
        } else {
          // A tap on the menu/gameover screen activates on release, not on touchstart
          const activates = game.state !== "playing" && game.state !== "paused";
          touchRoles.set(t.identifier, activates ? "activate" : "steer");
          game.mouse.x = p.x;
          game.mouse.y = p.y;
          if (TOUCH_MODE && game.state === "playing") {
            // New gesture swipe: clear old unconsumed path and start recording new line
            game.gesturePath = [p];
          }
        }
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const role = touchRoles.get(t.identifier);
        if (role !== "steer" && role !== "activate") continue;
        const p = toArena(canvas, t.clientX, t.clientY);
        game.mouse.x = p.x;
        game.mouse.y = p.y;
        if (TOUCH_MODE && game.state === "playing" && role === "steer") {
          const path = game.gesturePath;
          const lastP = path[path.length - 1];
          if (!lastP || Math.hypot(p.x - lastP.x, p.y - lastP.y) >= GESTURE_MIN_DIST) {
            path.push(p);
          }
        }
      }
    },
    { passive: false }
  );

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      const role = touchRoles.get(t.identifier);
      touchRoles.delete(t.identifier);
      // Only release the flag if no other finger still holds the same button.
      const stillHeld = (r) => [...touchRoles.values()].includes(r);
      if (role === "boost") game.boosting = stillHeld("boost");
      if (role === "slow") game.slowing = stillHeld("slow");
      if (role === "activate") onActivate();
    }
  };
  window.addEventListener("touchend", endTouch);
  window.addEventListener("touchcancel", endTouch);

  // Use e.code (not e.key) so that modifier keys like Shift never change what
  // code is stored — e.g. Shift+W fires e.code="KeyW" on both keydown and
  // keyup, so the Set entry is always correctly removed on release.
  const STEER_CODES = new Set(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
  const SCROLL_PREVENT_CODES = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"]);

  window.addEventListener("keydown", (e) => {
    // Typing a nickname into the highscore text input shouldn't also
    // restart the game, mute audio, or toggle fullscreen.
    if (e.target.tagName === "INPUT" && e.target.type === "text") return;

    if (e.key === "Enter") onActivate();
    if (e.key === "Escape") onPause();
    if (e.key === "m" || e.key === "M") {
      const m = toggleMute();
      setMusicMuted(m);
    }
    if (e.key === "f" || e.key === "F") onToggleFullscreen();

    if (game.state === "playing") {
      // Prevent browser scroll/zoom interference during gameplay.
      if (SCROLL_PREVENT_CODES.has(e.code)) e.preventDefault();

      // Track steering keys by code so modifier state never causes mismatches.
      if (STEER_CODES.has(e.code)) game.keysPressed.add(e.code);

      // Space = boost, Shift = slow — mirrors left/right mouse buttons.
      if (e.code === "Space" && !e.repeat) game.boosting = true;
      if (e.key === "Shift" && !e.repeat) game.slowing = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    game.keysPressed.delete(e.code);
    if (e.code === "Space") game.boosting = false;
    if (e.key === "Shift") game.slowing = false;
  });

  // Clear all held keys if the window loses focus so keys don't get stuck.
  window.addEventListener("blur", () => {
    game.keysPressed.clear();
    game.boosting = false;
    game.slowing = false;
  });
}

export { isMuted };
