/**
 * EditorToolbar
 *
 * Compact action bar under the sidebar title:
 *  - Undo / Redo buttons (reflect UndoManager.canUndo/canRedo)
 *  - A live save-status indicator driven by EditorApp's autosave flow
 *  - Play (the level in the game: EditorApp.play) and a shortcut help popover
 *
 * The toolbar owns no editing state; EditorApp calls setStatus() and
 * refresh() to keep it in sync, and supplies the undo/redo/play/look callbacks.
 */

import { buttonGlyph } from 'core/inputGlyphs';
import { EDITOR_MAPPING } from 'editor/input/EditorGamepad';

// The controller's mapping in the help, in a DualShock's names
const PAD_SECTIONS = [
  ['viewport', 'Controller'],
  ['viewport+l2', 'Controller — L2 held'],
  ['viewport+r2', 'Controller — R2 held'],
  ['panel', 'Controller — sidebar (touchpad)'],
  ['song', 'Controller — song editor'],
];
const padName = (buttons) =>
  buttons
    .split('/')
    .map((b) => {
      const glyph = buttonGlyph(b, 'playstation');
      return glyph ? glyph.name.replace(/^the /, '') : b;
    })
    .join(' / ');

const SHORTCUTS = [
  ['Arrows', 'Move the cursor (they follow the camera)'],
  ['Click a tile', 'Cursor there; select what stands on it'],
  ['P C G W R L', 'Place spawn / creature / gate / wall / ramp / waystone'],
  ['Shift + Arrows', 'Move the entity under the cursor'],
  ['Option + Up/Down', 'Storey up / down (an empty one starts a floor)'],
  ['Shift + Option + Up/Down', 'Carry the entity up / down a storey'],
  ['F', 'Start a floor region here; arrows size, Enter commits'],
  ['Enter', "The entity's menu (song, links); with a tool chosen, place it"],
  ['Double-click', "Edit a creature's or gate's song"],
  ['A', 'Play / stop the song under the cursor (its creature lights)'],
  ['Delete / Backspace', 'Delete the entity, or the floor region on an empty cell'],
  ['Escape', 'Deselect / cancel'],
  ['V', 'Game look / schematic look'],
  ['Cmd/Ctrl + Enter', 'Play the level in the game (saves first)'],
  ['Drag / Shift-drag / wheel', 'Orbit / pan / zoom the camera'],
  ['Cmd/Ctrl + Z', 'Undo'],
  ['Cmd/Ctrl + Shift + Z', 'Redo'],
];

export default class EditorToolbar {
  /**
   * @param {HTMLElement} container - #toolbar-panel
   * @param {object} handlers - { onUndo, onRedo, canUndo, canRedo, onPlay, onToggleLook }
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

    this._testBtn = this._iconBtn(
      '▶',
      'Play this level in the game, from its player spawn (Cmd/Ctrl+Enter)',
      () => {
        if (this._handlers.onPlay) this._handlers.onPlay();
      }
    );
    this._testBtn.classList.add('toolbar-test', 'toolbar-play');

    this._lookBtn = this._iconBtn('◐', 'Game look / schematic look (V)', () => {
      if (this._handlers.onToggleLook) this._handlers.onToggleLook();
    });
    this._lookBtn.classList.add('toolbar-look');

    this._helpBtn = this._iconBtn('?', 'Keyboard and controller shortcuts', () =>
      this._toggleHelp()
    );

    row.appendChild(this._undoBtn);
    row.appendChild(this._redoBtn);
    row.appendChild(spacer);
    row.appendChild(this._lookBtn);
    row.appendChild(this._testBtn);
    row.appendChild(this._helpBtn);
    wrapper.appendChild(row);

    this._statusEl = document.createElement('div');
    this._statusEl.className = 'save-status';
    wrapper.appendChild(this._statusEl);

    this._helpEl = document.createElement('div');
    this._helpEl.className = 'shortcut-help';
    this._helpEl.style.display = 'none';
    const helpRow = ([keys, desc]) =>
      `<div class="shortcut-row"><kbd>${keys}</kbd><span>${desc}</span></div>`;
    const pad = PAD_SECTIONS.map(
      ([mapping, title]) =>
        `<div class="shortcut-title">${title}</div>${EDITOR_MAPPING[mapping]
          .map(([buttons, desc]) => helpRow([padName(buttons), desc]))
          .join('')}`
    ).join('');
    this._helpEl.innerHTML = `<div class="shortcut-title">Keyboard</div>${SHORTCUTS.map(
      helpRow
    ).join('')}${pad}`;
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

  /**
   * Show which look the viewport draws.
   * @param {'game'|'schematic'} look
   */
  setLook(look) {
    if (!this._lookBtn) return;
    const label =
      look === 'game'
        ? 'Game look — V switches to the schematic look'
        : 'Schematic look — V switches to the game look';
    this._lookBtn.title = label;
    this._lookBtn.setAttribute('aria-label', label);
    this._lookBtn.classList.toggle('active', look === 'game');
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
