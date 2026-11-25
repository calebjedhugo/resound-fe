/**
 * Which look the editor's viewport draws, remembered across visits (this
 * browser only): 'game' — the level as the game draws it (GameLookLayer) —
 * or 'schematic', the coloured primitives (entityColors). The game look is
 * the default.
 */
const STORAGE_KEY = 'resound-editor-look';

export const LOOKS = ['game', 'schematic'];

/** The remembered look ('game' when none is, or storage can't be read). */
export function loadLook() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return LOOKS.includes(stored) ? stored : 'game';
  } catch {
    return 'game';
  }
}

/** Remember `look` for the next visit (best effort). */
export function saveLook(look) {
  try {
    localStorage.setItem(STORAGE_KEY, look);
  } catch {
    // Private mode / blocked storage: the look still applies this visit
  }
}

/**
 * SHARP rendering, remembered the same way (this browser only): the
 * viewport at the screen's pixel ratio with antialiasing, as the editor drew
 * before 2026-11-24. Off by default: the viewport renders as the game does,
 * at 1x with no antialiasing, for a fraction of the GPU work.
 */
const SHARP_KEY = 'resound-editor-sharp';

/** Whether sharp rendering is chosen (false when unset or unreadable). */
export function loadSharp() {
  try {
    return localStorage.getItem(SHARP_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Remember the sharp-rendering choice for the next visit (best effort). */
export function saveSharp(sharp) {
  try {
    localStorage.setItem(SHARP_KEY, sharp ? 'on' : 'off');
  } catch {
    // Private mode / blocked storage: the choice still applies this visit
  }
}
