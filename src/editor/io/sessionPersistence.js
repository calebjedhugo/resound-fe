/**
 * Session Persistence
 *
 * Saves and restores editor state to/from localStorage so work
 * survives page reloads. Uses the existing serialization layer
 * for model-to-JSON conversion.
 */
import { serializePuzzle, deserializePuzzle } from 'editor/model/serialization';

const STORAGE_KEY = 'resound-editor-session';

/**
 * Save the current editor model to localStorage.
 * @param {EditorPuzzleModel|UndoManager} model - anything with getMetadata/getPlayerSpawn/etc.
 */
export function saveSession(model) {
  try {
    const json = serializePuzzle(model);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
  } catch (e) {
    console.warn('Failed to save editor session:', e);
  }
}

/**
 * Load a previously saved editor session from localStorage.
 * @returns {EditorPuzzleModel|null} Restored model, or null if none/corrupt.
 */
export function loadSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const json = JSON.parse(stored);
    return deserializePuzzle(json);
  } catch (e) {
    console.warn('Failed to load editor session:', e);
    return null;
  }
}

/**
 * Clear any stored editor session (e.g. on "New Puzzle").
 */
export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}
