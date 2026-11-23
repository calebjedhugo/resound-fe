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
