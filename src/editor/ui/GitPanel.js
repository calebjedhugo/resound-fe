/**
 * GitPanel
 *
 * Dev-only git controls for the editor sidebar: a commit message field +
 * Commit / Pull / Push / Revert buttons and a one-line status
 * ("branch · N puzzle files changed · ↑ahead ↓behind"). Presentation only —
 * EditorApp supplies async handlers (which own reloads and Cmd-Z wiring); the
 * panel manages the busy state, the message field, and status refresh.
 * EditorApp refreshes it after every repo write lands (never per edit: each
 * status read spawns git on the dev server). An action's result ("Reverted —
 * ⌘Z to restore", an error) stays through those refreshes while they read the
 * status it was shown over, until the next action or a status change.
 *
 * The panel hides itself entirely when /api/git is unreachable (e.g. a
 * production build with no Node dev server behind it).
 */
import { gitStatus } from 'editor/io/gitControls';

/** "branch · N puzzle files changed · ↑ahead ↓behind" */
function statusLine(status) {
  const parts = [status.branch || '(detached)'];
  parts.push(
    status.changedCount === 1
      ? '1 puzzle file changed'
      : `${status.changedCount} puzzle files changed`
  );
  if (status.hasUpstream && (status.ahead || status.behind)) {
    const track = [];
    if (status.ahead) track.push(`↑${status.ahead}`);
    if (status.behind) track.push(`↓${status.behind}`);
    parts.push(track.join(' '));
  }
  return parts.join(' · ');
}

/** Equal for two reads that saw the same git state. */
const statusKey = (status) => JSON.stringify(status);

export default class GitPanel {
  /**
   * @param {HTMLElement} container - #git-panel
   * @param {object} handlers - async { onCommit(message), onPull, onPush, onRevert }
   */
  constructor(container, handlers) {
    this._container = container;
    this._handlers = handlers;
    this._busy = false;
    this._status = null; // last status read; null until one succeeds
    // The action result showing in place of the status line, and the status
    // it went up over: { text, isError, status }, or null
    this._note = null;
    this._refreshing = null; // the status read in flight, if any
    this._refreshAgain = false;
    this._render();
    this.refresh();
  }

  _render() {
    this._container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section git-panel';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Git';
    wrapper.appendChild(title);

    this._msgInput = document.createElement('input');
    this._msgInput.type = 'text';
    this._msgInput.className = 'prop-input git-message';
    this._msgInput.placeholder = 'Commit message';
    this._msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._run('onCommit', this._msgInput.value);
      }
      e.stopPropagation(); // don't let the editor's global keys hijack typing
    });
    wrapper.appendChild(this._msgInput);

    const row = document.createElement('div');
    row.className = 'toolbar-row git-row';
    this._commitBtn = this._btn('Commit', () => this._run('onCommit', this._msgInput.value));
    this._pullBtn = this._btn('Pull', () => this._run('onPull'));
    this._pushBtn = this._btn('Push', () => this._run('onPush'));
    this._revertBtn = this._btn('Revert', () => this._run('onRevert'));
    this._revertBtn.classList.add('git-danger');
    row.appendChild(this._commitBtn);
    row.appendChild(this._pullBtn);
    row.appendChild(this._pushBtn);
    row.appendChild(this._revertBtn);
    wrapper.appendChild(row);

    this._statusEl = document.createElement('div');
    this._statusEl.className = 'save-status git-status';
    wrapper.appendChild(this._statusEl);

    this._container.appendChild(wrapper);
  }

  _btn(text, onClick) {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn git-btn';
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
  }

  /**
   * Run a handler, guarding against concurrent actions, then refresh the
   * status line. A string the handler returns (e.g. "Reverted — ⌘Z to
   * restore"), or the error it throws, is shown as the action's result.
   */
  async _run(name, arg) {
    if (this._busy) return;
    const handler = this._handlers[name];
    if (!handler) return;
    this._note = null; // the last action's result is over
    this._setBusy(true);
    try {
      const result = await handler(arg);
      if (name === 'onCommit') this._msgInput.value = '';
      if (typeof result === 'string' && result) await this.showResult(result);
      else await this.refresh();
    } catch (err) {
      await this.showResult(err.message || String(err), true);
    } finally {
      this._setBusy(false);
    }
  }

  _setBusy(busy) {
    this._busy = busy;
    this._syncButtons();
  }

  /** Every button is off while an action runs; otherwise the last status rules. */
  _syncButtons() {
    const status = this._status;
    if (this._busy || !status) {
      for (const btn of [this._commitBtn, this._pullBtn, this._pushBtn, this._revertBtn]) {
        btn.disabled = this._busy;
      }
      return;
    }
    this._commitBtn.disabled = status.changedCount === 0;
    this._revertBtn.disabled = status.changedCount === 0;
    this._pushBtn.disabled = status.hasUpstream && status.ahead === 0;
    this._pullBtn.disabled = false;
  }

  /** Set the status line; `isError` styles it as a failure. */
  setStatus(text, isError = false) {
    this._statusEl.textContent = text;
    this._statusEl.classList.toggle('git-error', isError);
  }

  /**
   * Show an action's result in place of the status line, over a status read
   * taken after the action. Later reads of that same status leave it showing
   * (a write that changed nothing git sees still refreshes the panel); the
   * next action, a different status or clearNote() put the status line back.
   */
  async showResult(text, isError = false) {
    await this.refresh();
    this._note = { text, isError, status: statusKey(this._status) };
    this.setStatus(text, isError);
  }

  /** Put the status line back in place of an action's result that no longer holds. */
  clearNote() {
    if (!this._note) return;
    this._note = null;
    if (this._status) this.setStatus(statusLine(this._status));
  }

  /**
   * Re-fetch git state and update the status line + button enablement. One
   * read runs at a time: refreshes asked for while one is in flight share a
   * single trailing read, and every caller's promise settles on a read that
   * started after its call (so it sees any write that preceded the call).
   */
  refresh() {
    if (this._refreshing) {
      this._refreshAgain = true;
      return this._refreshing;
    }
    this._refreshing = (async () => {
      try {
        do {
          this._refreshAgain = false;
          // eslint-disable-next-line no-await-in-loop -- the reads are serial by design
          await this._readStatus();
        } while (this._refreshAgain);
      } finally {
        this._refreshing = null;
      }
    })();
    return this._refreshing;
  }

  async _readStatus() {
    let status;
    try {
      status = await gitStatus();
    } catch (err) {
      // On the FIRST load a failure means there's no dev git endpoint
      // (production build) — hide the whole panel. But once we've connected,
      // a later blip must NOT make the panel vanish (that reads as "the action
      // silently failed"): keep it visible and show the error inline.
      if (this._everConnected) {
        this._note = null;
        this.setStatus(`git status unavailable: ${err.message || err}`, true);
      } else {
        this._container.style.display = 'none';
      }
      return;
    }
    this._everConnected = true;
    this._container.style.display = '';
    // An action's result stays up while git still reads as it did then.
    if (!this._note || this._note.status !== statusKey(status)) {
      this._note = null;
      this.setStatus(statusLine(status));
    }
    this._status = status;
    this._syncButtons();
  }
}
