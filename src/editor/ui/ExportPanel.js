/**
 * ExportPanel
 *
 * Sidebar panel for exporting a puzzle to JSON.
 * Validates the model first, displaying errors or providing
 * download/clipboard actions on success.
 */
import {
  exportPuzzle,
  downloadJson,
  copyToClipboard,
  getManifestEntry,
} from 'editor/io/exportPuzzle';

export default class ExportPanel {
  constructor(container, undoManager) {
    this._container = container;
    this._undoManager = undoManager;
    this._render();
  }

  _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.className = 'panel-label';
    label.textContent = 'Export';
    wrapper.appendChild(label);

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'editor-btn';
    exportBtn.textContent = 'Export Puzzle';
    exportBtn.onclick = () => this._export();
    wrapper.appendChild(exportBtn);

    // Status area
    this._statusEl = document.createElement('div');
    this._statusEl.className = 'export-status';
    wrapper.appendChild(this._statusEl);

    this._container.appendChild(wrapper);
  }

  _export() {
    const result = exportPuzzle(this._undoManager);
    this._statusEl.innerHTML = '';

    if (result.errors.length > 0) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'export-errors';
      errorDiv.innerHTML = '<strong>Errors (cannot export):</strong>';
      const ul = document.createElement('ul');
      result.errors.forEach((e) => {
        const li = document.createElement('li');
        li.textContent = e;
        ul.appendChild(li);
      });
      errorDiv.appendChild(ul);
      this._statusEl.appendChild(errorDiv);
      return;
    }

    if (result.warnings.length > 0) {
      const warnDiv = document.createElement('div');
      warnDiv.className = 'export-warnings';
      warnDiv.innerHTML = '<strong>Warnings:</strong>';
      const ul = document.createElement('ul');
      result.warnings.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = w;
        ul.appendChild(li);
      });
      warnDiv.appendChild(ul);
      this._statusEl.appendChild(warnDiv);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'export-actions';

    const dlBtn = document.createElement('button');
    dlBtn.className = 'editor-btn';
    dlBtn.textContent = 'Download JSON';
    dlBtn.onclick = () => downloadJson(result.json, `${result.json.id || 'puzzle'}.json`);
    actions.appendChild(dlBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'editor-btn';
    copyBtn.textContent = 'Copy to Clipboard';
    copyBtn.onclick = () => copyToClipboard(result.json);
    actions.appendChild(copyBtn);

    this._statusEl.appendChild(actions);

    // Manifest entry
    const manifest = getManifestEntry(result.json);
    const manifestDiv = document.createElement('div');
    manifestDiv.className = 'manifest-entry';
    manifestDiv.innerHTML = `<strong>Manifest entry:</strong><pre>${JSON.stringify(
      manifest,
      null,
      2
    )}</pre>`;
    this._statusEl.appendChild(manifestDiv);
  }
}
