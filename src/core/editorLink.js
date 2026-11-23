/**
 * editorLink — the way between the level editor and the game, both ends.
 *
 * The editor's Play saves the level and opens the game on it:
 * `/?puzzle=<id>&from=editor` (playUrl). The game boots straight into that
 * puzzle at its player spawn — the menu skipped, the start gate kept (audio
 * still needs a gesture) — and, launched from the editor, its pause menu
 * offers "Back to Editor" (playRequest says so). Going back hands the level
 * to the editor: a game tab the editor opened tells its editor (a message
 * to its opener) and closes, so no tabs pile up; a game that replaced the
 * editor in its own tab (Play from a controller: no user activation, so no
 * new tab) loads the editor again on the level (editorUrl).
 *
 * Plain functions over the URL and the window, so the game's boot, its pause
 * menu and the editor share one definition of the link.
 */

// The one tab the editor's Play reuses (a second Play reloads it)
export const PLAY_WINDOW_NAME = 'resound-play';

// What the game tab tells the editor that opened it
export const BACK_TO_EDITOR_MESSAGE = 'resound:back-to-editor';

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
 * Leave the game for the editor, on `puzzleId`. A tab the editor opened
 * hands back to it and closes; anything else loads the editor here.
 * @param {string} puzzleId
 * @param {Window} [win]
 * @returns {'closed'|'navigated'} what happened
 */
export function backToEditor(puzzleId, win = window) {
  const { opener } = win;
  let sameOrigin = false;
  try {
    sameOrigin =
      Boolean(opener) && !opener.closed && opener.location.origin === win.location.origin;
  } catch {
    sameOrigin = false; // another site's window: not our editor
  }
  if (sameOrigin) {
    try {
      opener.postMessage({ type: BACK_TO_EDITOR_MESSAGE, puzzleId }, win.location.origin);
      opener.focus();
    } catch {
      // the editor tab went away meanwhile: fall through to closing
    }
    win.close();
    // A window a script opened closes; any other refuses (and stays open)
    if (win.closed) return 'closed';
  }
  win.location.assign(editorUrl(puzzleId));
  return 'navigated';
}
