import { importPuzzle } from 'editor/io/importPuzzle';

export default class ImportPanel {
  constructor(container, onImport) {
    this._container = container;
    this._onImport = onImport; // callback(model, errors, warnings)
    this._render();
  }

  _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.className = 'panel-label';
    label.textContent = 'Import';
    wrapper.appendChild(label);

    const importBtn = document.createElement('button');
    importBtn.className = 'editor-btn';
    importBtn.textContent = 'Import Puzzle JSON';
    importBtn.onclick = () => this._openFilePicker();
    wrapper.appendChild(importBtn);

    this._statusEl = document.createElement('div');
    this._statusEl.className = 'import-status';
    wrapper.appendChild(this._statusEl);

    this._container.appendChild(wrapper);
  }

  _openFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target.result);
          const { model, errors, warnings } = importPuzzle(json);
          this._showStatus(errors, warnings);
          this._onImport(model, errors, warnings);
        } catch (err) {
          this._statusEl.textContent = `Error: ${err.message}`;
          this._statusEl.className = 'import-status import-error';
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  _showStatus(errors, warnings) {
    this._statusEl.innerHTML = '';
    if (errors.length > 0) {
      this._statusEl.className = 'import-status import-error';
      this._statusEl.textContent = `Imported with ${errors.length} error(s)`;
    } else if (warnings.length > 0) {
      this._statusEl.className = 'import-status import-warning';
      this._statusEl.textContent = `Imported with ${warnings.length} warning(s)`;
    } else {
      this._statusEl.className = 'import-status import-success';
      this._statusEl.textContent = 'Imported successfully';
    }
  }
}
