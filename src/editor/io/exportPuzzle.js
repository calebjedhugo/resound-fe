/**
 * Puzzle Export
 *
 * Validates a puzzle model and, if error-free, serializes it to JSON.
 * Also provides helpers for downloading, clipboard copy, and manifest entry.
 */
import { serializePuzzle } from 'editor/model/serialization';
import { validatePuzzle } from 'editor/model/PuzzleValidator';

/**
 * Export a puzzle model to JSON.
 * Runs validation first; if there are errors, returns null JSON.
 * Warnings do not block export.
 *
 * @param {EditorPuzzleModel|UndoManager} model
 * @returns {{ json: object|null, errors: string[], warnings: string[] }}
 */
export function exportPuzzle(model) {
  const { errors, warnings } = validatePuzzle(model);

  if (errors.length > 0) {
    return { json: null, errors, warnings };
  }

  const json = serializePuzzle(model);
  return { json, errors: [], warnings };
}

/**
 * Trigger a browser download of the puzzle JSON.
 * @param {object} json - Serialized puzzle object
 * @param {string} filename - Filename for the download
 */
export function downloadJson(json, filename) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy puzzle JSON to the clipboard.
 * @param {object} json - Serialized puzzle object
 * @returns {Promise<void>}
 */
export function copyToClipboard(json) {
  return navigator.clipboard.writeText(JSON.stringify(json, null, 2));
}

/**
 * Extract a manifest entry from exported puzzle JSON.
 * @param {object} json - Serialized puzzle object
 * @returns {{ id: string, name: string, difficulty: number }}
 */
export function getManifestEntry(json) {
  return { id: json.id, name: json.name, difficulty: json.difficulty };
}
