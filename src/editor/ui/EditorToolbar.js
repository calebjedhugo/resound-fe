/**
 * EditorToolbar
 *
 * Compact action bar under the sidebar title:
 *  - Undo / Redo buttons (reflect UndoManager.canUndo/canRedo)
 *  - A live save-status indicator driven by EditorApp's autosave flow
 *  - "Test in game" deep link and a keyboard-shortcut help popover
 *
 * The toolbar owns no editing state; EditorApp calls setStatus() and
 * refresh() to keep it in sync, and supplies the undo/redo/test callbacks.
 */

const SHORTCUTS = [
  ['Cmd/Ctrl + Z', 'Undo'],
  ['Cmd/Ctrl + Shift + Z', 'Redo'],
  ['Delete / Backspace', 'Delete selected entity'],
  ['Escape', 'Deselect / cancel placement'],
  ['Click tool, then grid', 'Place entity'],
  ['Right-click entity', 'Edit song'],
];

export default class EditorToolbar {
  /**
   * @param {HTMLElement} container - #toolbar-panel
   * @param {object} handlers - { onUndo, onRedo, canUndo, canRedo, onTest }
   */
  constructor(container, handlers) {
    this._container = container;
    this._handlers = handlers;
    this._render();
    this.refresh();
    this.setStatus('idle');
  }

  _render() {
    this._container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section toolbar-panel';

    const row = document.createElement('div');
    row.className = 'toolbar-row';

    this._undoBtn = this._iconBtn('↶', 'Undo (Cmd/Ctrl+Z)', () => this._handlers.onUndo());
    this._redoBtn = this._iconBtn('↷', 'Redo (Cmd/Ctrl+Shift+Z)', () => this._handlers.onRedo());

    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';

    this._testBtn = this._iconBtn('▶', 'Test this puzzle in the game (new tab)', () => {
      if (this._handlers.onTest) this._handlers.onTest();
    });
    this._testBtn.classList.add('toolbar-test');

    this._helpBtn = this._iconBtn('?', 'Keyboard shortcuts', () => this._toggleHelp());

    row.appendChild(this._undoBtn);
    row.appendChild(this._redoBtn);
    row.appendChild(spacer);
    row.appendChild(this._testBtn);
    row.appendChild(this._helpBtn);
    wrapper.appendChild(row);

    this._statusEl = document.createElement('div');
    this._statusEl.className = 'save-status';
    wrapper.appendChild(this._statusEl);

    this._helpEl = document.createElement('div');
    this._helpEl.className = 'shortcut-help';
    this._helpEl.style.display = 'none';
    this._helpEl.innerHTML = SHORTCUTS.map(
      ([keys, desc]) => `<div class="shortcut-row"><kbd>${keys}</kbd><span>${desc}</span></div>`
    ).join('');
    wrapper.appendChild(this._helpEl);

    this._container.appendChild(wrapper);
  }

  _iconBtn(text, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn';
    btn.textContent = text;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.onclick = onClick;
    return btn;
  }

  _toggleHelp() {
    const showing = this._helpEl.style.display !== 'none';
    this._helpEl.style.display = showing ? 'none' : 'block';
  }

  /** Reflect current undo/redo availability on the buttons. */
  refresh() {
    this._undoBtn.disabled = !this._handlers.canUndo();
    this._redoBtn.disabled = !this._handlers.canRedo();
  }

  /**
   * Update the save-status line.
   * @param {'idle'|'dirty'|'saving'|'saved'|'unnamed'|'error'} state
   * @param {string} [detail] - optional extra text (e.g. an error message)
   */
  setStatus(state, detail) {
    if (!this._statusEl) return;
    const map = {
      idle: ['', ''],
      dirty: ['save-dirty', 'Unsaved changes'],
      saving: ['save-saving', 'Saving…'],
      saved: ['save-saved', 'Saved to repo'],
      unnamed: ['save-dirty', 'Add a name to save'],
      error: ['save-error', detail ? `Save failed: ${detail}` : 'Save failed'],
    };
    const [cls, text] = map[state] || map.idle;
    this._statusEl.className = `save-status ${cls}`.trim();
    this._statusEl.textContent = text;
  }
}
