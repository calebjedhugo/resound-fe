import { validatePuzzle } from 'editor/model/PuzzleValidator';

export default class ValidationPanel {
  constructor(container, undoManager, onSelectEntity) {
    this._container = container; // #validation-panel
    this._undoManager = undoManager;
    this._onSelectEntity = onSelectEntity; // callback(entityId) to highlight in viewport
    this._collapsed = false;
    this._render();
    this.refresh();
  }

  refresh() {
    const { errors, warnings } = validatePuzzle(this._undoManager);
    this._renderResults(errors, warnings);
  }

  _render() {
    this._container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const header = document.createElement('div');
    header.className = 'validation-header';

    const label = document.createElement('label');
    label.className = 'panel-label';
    label.textContent = 'Validation';
    header.appendChild(label);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'collapse-btn';
    toggleBtn.textContent = this._collapsed ? '+' : '-';
    toggleBtn.onclick = () => {
      this._collapsed = !this._collapsed;
      toggleBtn.textContent = this._collapsed ? '+' : '-';
      this._contentEl.style.display = this._collapsed ? 'none' : 'block';
    };
    header.appendChild(toggleBtn);

    wrapper.appendChild(header);

    this._contentEl = document.createElement('div');
    this._contentEl.className = 'validation-content';
    wrapper.appendChild(this._contentEl);

    this._container.appendChild(wrapper);
  }

  _renderResults(errors, warnings) {
    if (!this._contentEl) return;
    this._contentEl.innerHTML = '';

    if (errors.length === 0 && warnings.length === 0) {
      const ok = document.createElement('div');
      ok.className = 'validation-ok';
      ok.textContent = 'No issues found';
      this._contentEl.appendChild(ok);
      return;
    }

    errors.forEach((msg) => {
      const item = document.createElement('div');
      item.className = 'validation-error';
      item.textContent = msg;
      this._contentEl.appendChild(item);
    });

    warnings.forEach((msg) => {
      const item = document.createElement('div');
      item.className = 'validation-warning';
      item.textContent = msg;
      this._contentEl.appendChild(item);
    });
  }
}
