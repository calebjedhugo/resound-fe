/**
 * Git Controls (dev-only)
 *
 * Thin fetch wrappers over the `/api/git/*` dev-server endpoints defined in
 * vite.config.js (`gitPlugin`). Browsers can't run git, so — exactly like
 * repoPersistence's puzzle writer — the Vite/Node dev server shells out and
 * the editor drives it over fetch. Only works while `npm start` is running.
 *
 * Scope: commit and revert touch only public/puzzles/; pull and push are
 * commit-level and act on the whole repo. revert stashes uncommitted puzzle
 * edits so it is undoable; unrevert pops that stash (Cmd-Z after a revert).
 */

/** POST a git action; throw with git's own stderr/stdout on failure. */
async function post(action, body) {
  const response = await fetch(`/api/git/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    // non-JSON body; fall through to statusText
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.stderr || data.stdout || response.statusText);
  }
  return data;
}

/**
 * Current repo git state, scoped to puzzle files for the change count.
 * @returns {Promise<{branch:string, changedCount:number, files:string[],
 *   ahead:number, behind:number, hasUpstream:boolean}>}
 */
export async function gitStatus() {
  const response = await fetch('/api/git/status', { cache: 'no-store' });
  if (!response.ok) throw new Error(`git status failed: ${response.statusText}`);
  return response.json();
}

/** Stage public/puzzles/ and commit with the given message. */
export const gitCommit = (message) => post('commit', { message });

/** git pull --rebase (whole repo). */
export const gitPull = () => post('pull');

/** git push (whole repo). */
export const gitPush = () => post('push');

/**
 * Discard uncommitted puzzle edits by stashing them (undoable).
 * @returns {Promise<{ok:true, nothing:boolean}>} nothing=true if the tree was clean
 */
export const gitRevert = () => post('revert');

/** Restore the most recently reverted puzzle edits (git stash pop). */
export const gitUnrevert = () => post('unrevert');
