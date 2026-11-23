/**
 * playLink — the way between the level editor and the game, both ends.
 *
 * The editor's Play saves the level and plays it in the editor's own tab:
 * the game loads, hidden, in a same-origin iframe over the editor
 * (`/?puzzle=<id>&from=editor`, playUrl) while the editor's camera glides
 * down to the player's eye (editor/play/PlayPreview). The game in that
 * frame (editorFrame) says it is WAITING, builds its world once the camera
 * has LANDED (holding still, so the build's stall shows nothing), keeps it
 * still behind a veiled start gate, and tells the editor when its first
 * frame at the spawn is on screen (READY);
 * the editor cross-fades to it and says GO. Its pause menu's Back to Editor
 * (or Cmd/Ctrl+Enter) hands the player's view back (BACK): the editor fades
 * in under it and glides back to where it was.
 *
 * Opened by itself (no editor around it), `from=editor` still offers Back to
 * Editor: it loads the editor on the level (editorUrl). A plain
 * `/?puzzle=<id>` is the game alone.
 *
 * Plain functions over the URL and the window, so the game's boot, its pause
 * menu and the editor share one definition of the link.
 */

// game -> editor: loaded and listening; it builds the world once LANDED
export const PREVIEW_WAITING = 'resound:preview-waiting';
// editor -> game: the camera is at the eye, holding still: build and draw
// now (the build and the first frame's shader compile would stutter the
// glide: the frame shares the editor's main thread)
export const PREVIEW_LANDED = 'resound:preview-landed';
// game -> editor: the world is built and its first frame at the spawn shown
export const PREVIEW_READY = 'resound:preview-ready';
// game -> editor: the level couldn't be played (it says why)
export const PREVIEW_FAILED = 'resound:preview-failed';
// editor -> game: the game is on screen and has the keyboard: play
export const PREVIEW_GO = 'resound:preview-go';
// game -> editor: Back to Editor, with where the player stood
export const BACK_TO_EDITOR = 'resound:back-to-editor';

/**
 * The game's address for playing `puzzleId` from the editor.
 * @param {string} puzzleId
 */
export function playUrl(puzzleId) {
  return `/?puzzle=${encodeURIComponent(puzzleId)}&from=editor`;
}

/**
 * The editor's address, opened on `puzzleId`.
 * @param {string} [puzzleId]
 */
export function editorUrl(puzzleId) {
  return puzzleId ? `/editor.html?puzzle=${encodeURIComponent(puzzleId)}` : '/editor.html';
}

/**
 * What the game was asked to play: the deep-linked puzzle (or null) and
 * whether the editor launched it.
 * @param {string} [search] - a location.search
 * @returns {{puzzleId: ?string, fromEditor: boolean}}
 */
export function playRequest(search = '') {
  const params = new URLSearchParams(search);
  const puzzleId = params.get('puzzle') || null;
  return { puzzleId, fromEditor: Boolean(puzzleId) && params.get('from') === 'editor' };
}

/**
 * The puzzle the editor was asked to open (its own `?puzzle=`), or null.
 * @param {string} [search] - a location.search
 */
export function editorRequest(search = '') {
  return new URLSearchParams(search).get('puzzle') || null;
}

/**
 * The editor this game plays inside: the window embedding it, when that is
 * a page of this site. Null for a game in a tab of its own (or framed by
 * another site, which is never our editor).
 * @param {Window} [win]
 * @returns {?Window}
 */
export function editorFrame(win = window) {
  const { parent } = win;
  if (!parent || parent === win) return null;
  try {
    return parent.location.origin === win.location.origin ? parent : null;
  } catch {
    return null; // another site's page: its location can't be read
  }
}

/**
 * Tell the editor this game plays inside something.
 * @param {object} message - {type, ...}
 * @param {Window} [win]
 * @returns {boolean} whether there was an editor to tell
 */
export function tellEditor(message, win = window) {
  const editor = editorFrame(win);
  if (!editor) return false;
  editor.postMessage(message, win.location.origin);
  return true;
}

/**
 * Whether a message event is the editor around this game saying `type`.
 * @param {MessageEvent} event
 * @param {string} type
 * @param {Window} [win]
 */
export function isFromEditor(event, type, win = window) {
  const editor = editorFrame(win);
  return (
    Boolean(editor) &&
    event.source === editor &&
    event.origin === win.location.origin &&
    Boolean(event.data) &&
    event.data.type === type
  );
}

/**
 * Leave the game for the editor, on `puzzleId`. Inside the editor, hand it
 * the player's view (`report`: where the player stands, `pose` and
 * `areaId`); in a tab of its own, load the editor on the level here.
 * @param {string} puzzleId
 * @param {{areaId?: string, pose?: object}} [report]
 * @param {Window} [win]
 * @returns {'handed'|'navigated'} what happened
 */
export function backToEditor(puzzleId, report = {}, win = window) {
  if (tellEditor({ type: BACK_TO_EDITOR, puzzleId, ...report }, win)) return 'handed';
  win.location.assign(editorUrl(puzzleId));
  return 'navigated';
}
