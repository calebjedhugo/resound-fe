/**
 * Repo Persistence
 *
 * Reads and writes the repo's actual puzzle files during development.
 * Loading uses the same static files the game serves (/puzzles/*.json).
 * Saving posts to a dev-only Vite endpoint (see vite.config.js) that
 * writes public/puzzles/<id>.json and keeps manifest.json in sync.
 */
import { serializePuzzle } from 'editor/model/serialization';

/**
 * Fetch the puzzle manifest (list of { id, name, difficulty }).
 * @returns {Promise<Array<{id: string, name: string, difficulty: number}>>}
 */
export async function listRepoPuzzles() {
  const response = await fetch('/puzzles/manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load manifest: ${response.statusText}`);
  const manifest = await response.json();
  return manifest.puzzles || [];
}

/**
 * Fetch a single puzzle's JSON from the repo by id.
 * @param {string} id
 * @returns {Promise<object>} Puzzle JSON
 */
export async function loadRepoPuzzle(id) {
  const response = await fetch(`/puzzles/${id}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load puzzle ${id}: ${response.statusText}`);
  return response.json();
}

/**
 * Write the current model back to its repo file via the dev endpoint.
 * No-op (resolves false) when the puzzle has no valid id yet.
 * @param {EditorPuzzleModel|UndoManager} model
 * @returns {Promise<boolean>} true if written, false if skipped
 */
export async function savePuzzleToRepo(model) {
  return savePuzzleJsonToRepo(serializePuzzle(model));
}

/**
 * Write an already-serialized puzzle JSON to its repo file. Used when
 * editing a puzzle OTHER than the open one (e.g. keeping the far side of a
 * gate link in sync) — no model round-trip, so unrelated fields are untouched.
 * @param {object} json - Full puzzle JSON (must carry a valid id)
 * @returns {Promise<boolean>} true if written, false if skipped
 */
export async function savePuzzleJsonToRepo(json) {
  const { id } = json;
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  const response = await fetch(`/api/puzzles/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).error || detail;
    } catch {
      // keep statusText
    }
    throw new Error(`Failed to save puzzle ${id}: ${detail}`);
  }
  return true;
}

/**
 * Delete a puzzle's repo file and manifest entry via the dev endpoint.
 * @param {string} id
 * @returns {Promise<boolean>} true if deleted
 */
export async function deletePuzzleFromRepo(id) {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  const response = await fetch(`/api/puzzles/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).error || detail;
    } catch {
      // keep statusText
    }
    throw new Error(`Failed to delete puzzle ${id}: ${detail}`);
  }
  return true;
}
