/**
 * PuzzlePicker
 *
 * The single "which puzzle am I working on?" control, at the top of the
 * sidebar. Merges what used to be a top-of-sidebar "New Puzzle" button and a
 * bottom-of-sidebar "Open Level" dropdown into one place:
 *
 *  - A "+ New puzzle" item at the top of the list creates a fresh puzzle
 *    (persisted to the repo on first edit, once it has a name -> id).
 *  - The remaining items are the manifest levels; choosing one loads it.
 *
 * Manifest-driven: reads /puzzles/manifest.json for the list and
 * /puzzles/<id>.json for the chosen level, reusing io/importPuzzle.
 */
import { listRepoPuzzles, loadRepoPuzzle, deletePuzzleFromRepo } from 'editor/io/repoPersistence';
import { importPuzzle } from 'editor/io/importPuzzle';

const NEW_VALUE = '__new__';
const UNSAVED_VALUE = '__unsaved__';

export default class PuzzlePicker {
  /**
   * @param {HTMLElement} container - #puzzle-panel
   * @param {(model) => void} onLoad - called with the imported model of a chosen level
   * @param {() => void} onNew - called when "+ New puzzle" is chosen
   * @param {() => void} [onDelete] - called after the open puzzle is deleted
   */
  constructor(container, onLoad, onNew, onDelete) {
    this._container = container;
    this._onLoad = onLoad;
    this._onNew = onNew;
    this._onDelete = onDelete || (() => {});
    this._currentId = '';
    this._render();
    this.refresh();
  }

  _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.className = 'panel-label';
    label.textContent = 'Puzzle';
    wrapper.appendChild(label);

    const row = document.createElement('div');
    row.className = 'puzzle-picker-row';

    this._select = document.createElement('select');
    this._select.className = 'prop-select puzzle-select';
    this._select.onchange = () => this._onSelectChange();
    row.appendChild(this._select);

    this._deleteBtn = document.createElement('button');
    this._deleteBtn.className = 'delete-btn puzzle-delete-btn';
    this._deleteBtn.textContent = 'Delete';
    this._deleteBtn.title = 'Delete this puzzle from the repo';
    this._deleteBtn.onclick = () => this._deleteSelected();
    row.appendChild(this._deleteBtn);

    wrapper.appendChild(row);

    this._statusEl = document.createElement('div');
    this._statusEl.className = 'import-status';
    wrapper.appendChild(this._statusEl);

    this._container.appendChild(wrapper);
  }

  /**
   * Reload the level list from the manifest.
   * @param {string} [selectId] - id to leave selected after refresh
   */
  async refresh(selectId) {
    try {
      const puzzles = await listRepoPuzzles();
      this._puzzles = puzzles;
      this._rebuildOptions();
      if (selectId) this.setSelected(selectId);
    } catch (err) {
      this._statusEl.className = 'import-status import-error';
      this._statusEl.textContent = `Error loading puzzles: ${err.message}`;
    }
  }

  _rebuildOptions() {
    const previous = this._currentId;
    this._select.innerHTML = '';

    const newOpt = document.createElement('option');
    newOpt.value = NEW_VALUE;
    newOpt.textContent = '+ New puzzle';
    this._select.appendChild(newOpt);

    (this._puzzles || []).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.id})`;
      this._select.appendChild(opt);
    });

    // Restore the previously-selected puzzle if it still exists.
    if (previous && this.hasLevel(previous)) {
      this._select.value = previous;
    }
    this._updateDeleteState();
  }

  _onSelectChange() {
    const { value } = this._select;
    if (value === NEW_VALUE) {
      // Bounce the visible selection back to the current puzzle; the new
      // puzzle gets its own entry once it is named + saved.
      this.setSelected(this._currentId);
      this._statusEl.className = 'import-status';
      this._statusEl.textContent = '';
      this._onNew();
      return;
    }
    if (value === UNSAVED_VALUE) return;
    this._loadSelected(value);
  }

  async _deleteSelected() {
    const id = this._currentId;
    if (!id || !this.hasLevel(id)) return;
    const entry = (this._puzzles || []).find((p) => p.id === id);
    const name = entry ? entry.name : id;
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      `Delete "${name}" (${id}.json)? This removes the file from the repo and cannot be undone.`
    );
    if (!ok) return;
    try {
      await deletePuzzleFromRepo(id);
      this._currentId = '';
      await this.refresh();
      this._statusEl.className = 'import-status import-success';
      this._statusEl.textContent = `Deleted ${id}`;
      this._onDelete();
    } catch (err) {
      this._statusEl.className = 'import-status import-error';
      this._statusEl.textContent = `Error: ${err.message}`;
    }
  }

  /** Enable Delete only when a saved, in-manifest puzzle is open. */
  _updateDeleteState() {
    if (this._deleteBtn) {
      this._deleteBtn.disabled = !(this._currentId && this.hasLevel(this._currentId));
    }
  }

  /**
   * Programmatically open a level (e.g. clicked in the world overview) —
   * same load path as choosing it in the dropdown.
   * @param {string} id
   */
  async open(id) {
    if (!id || !this.hasLevel(id)) return;
    await this._loadSelected(id);
  }

  async _loadSelected(id) {
    if (!id) return;
    try {
      const json = await loadRepoPuzzle(id);
      const { model, errors, warnings } = importPuzzle(json);
      this._showStatus(errors, warnings);
      this._onLoad(model, errors, warnings);
    } catch (err) {
      this._statusEl.className = 'import-status import-error';
      this._statusEl.textContent = `Error: ${err.message}`;
    }
  }

  /**
   * Reflect the currently-open puzzle in the dropdown.
   * For a saved level this selects its manifest entry; for a not-yet-saved
   * puzzle it shows a transient "(unsaved)" entry so the control never looks
   * like it is pointing at the wrong level.
   * @param {string} id
   * @param {string} [name] - display name when unsaved
   */
  setSelected(id, name) {
    this._currentId = id || '';
    this._removeUnsavedOption();
    if (id && this.hasLevel(id)) {
      this._select.value = id;
      this._updateDeleteState();
      return;
    }
    // Unsaved / not-in-manifest: show a placeholder current entry.
    const opt = document.createElement('option');
    opt.value = UNSAVED_VALUE;
    opt.textContent = `${name || 'Untitled'} (unsaved)`;
    opt.dataset.unsaved = 'true';
    this._select.appendChild(opt);
    this._select.value = UNSAVED_VALUE;
    this._updateDeleteState();
  }

  _removeUnsavedOption() {
    const existing = Array.from(this._select.options).find((o) => o.dataset.unsaved === 'true');
    if (existing) existing.remove();
  }

  /** Whether the dropdown already lists the given puzzle id. */
  hasLevel(id) {
    return Array.from(this._select.options).some((o) => o.value === id);
  }

  _showStatus(errors, warnings) {
    if (errors.length > 0) {
      this._statusEl.className = 'import-status import-error';
      this._statusEl.textContent = `Loaded with ${errors.length} error(s)`;
    } else if (warnings.length > 0) {
      this._statusEl.className = 'import-status import-warning';
      this._statusEl.textContent = `Loaded with ${warnings.length} warning(s)`;
    } else {
      this._statusEl.className = 'import-status import-success';
      this._statusEl.textContent = 'Loaded';
    }
  }
}
