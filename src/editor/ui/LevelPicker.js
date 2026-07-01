/**
 * LevelPicker
 *
 * Manifest-driven dropdown for opening an existing repo puzzle to edit.
 * Loads /puzzles/manifest.json for the list and /puzzles/<id>.json for the
 * chosen level, then hands the parsed model back via onLoad. Replaces the
 * old file-picker import as the primary way to open a level.
 */
import { listRepoPuzzles, loadRepoPuzzle } from 'editor/io/repoPersistence';
import { importPuzzle } from 'editor/io/importPuzzle';

export default class LevelPicker {
  constructor(container, onLoad) {
    this._container = container;
    this._onLoad = onLoad; // callback(model, errors, warnings)
    this._render();
    this.refresh();
  }

  _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.className = 'panel-label';
    label.textContent = 'Open Level';
    wrapper.appendChild(label);

    this._select = document.createElement('select');
    this._select.className = 'prop-select';
    this._select.onchange = () => this._loadSelected();
    wrapper.appendChild(this._select);

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
      this._select.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a level…';
      this._select.appendChild(placeholder);

      puzzles.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.id})`;
        this._select.appendChild(opt);
      });

      if (selectId) this._select.value = selectId;
    } catch (err) {
      this._statusEl.className = 'import-status import-error';
      this._statusEl.textContent = `Error loading levels: ${err.message}`;
    }
  }

  /** Set the dropdown to reflect the currently-loaded puzzle id without reloading. */
  setSelected(id) {
    if (this._select) this._select.value = id || '';
  }

  /** Whether the dropdown already lists the given puzzle id. */
  hasLevel(id) {
    return Array.from(this._select.options).some((o) => o.value === id);
  }

  async _loadSelected() {
    const id = this._select.value;
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
