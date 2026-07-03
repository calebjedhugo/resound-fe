import { validatePuzzle } from 'editor/model/PuzzleValidator';

// Issues whose obvious fix is composing/correcting a song — clicking them
// opens the song editor directly.
const SONG_ISSUE = /missing a song|invalid pitch|invalid length|uses pitch/;

export default class ValidationPanel {
  constructor(container, undoManager, onSelectEntity, onEditSong) {
    this._container = container; // #validation-panel
    this._undoManager = undoManager;
    this._onSelectEntity = onSelectEntity; // callback(entityId) to highlight in viewport
    this._onEditSong = onEditSong || null; // callback(entityId) to open the song editor
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
    toggleBtn.textContent = this._collapsed ? '▸' : '▾';
    toggleBtn.onclick = () => {
      this._collapsed = !this._collapsed;
      toggleBtn.textContent = this._collapsed ? '▸' : '▾';
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

    errors.forEach((msg) => this._contentEl.appendChild(this._buildItem(msg, 'validation-error')));
    warnings.forEach((msg) =>
      this._contentEl.appendChild(this._buildItem(msg, 'validation-warning'))
    );
  }

  /**
   * Build one issue line. Issues that name an entity (id=N) are clickable:
   * click selects the entity, and song-related issues open the song editor.
   */
  _buildItem(msg, className) {
    const item = document.createElement('div');
    item.className = className;
    item.textContent = msg;

    const idMatch = msg.match(/id=(\d+)/);
    if (!idMatch) return item;

    const entityId = Number(idMatch[1]);
    const opensSong = this._onEditSong && SONG_ISSUE.test(msg);
    item.classList.add('validation-clickable');
    item.title = opensSong ? 'Click to open the song editor' : 'Click to select this entity';
    item.addEventListener('click', () => {
      if (this._onSelectEntity) this._onSelectEntity(entityId);
      if (opensSong) this._onEditSong(entityId);
    });
    return item;
  }
}
