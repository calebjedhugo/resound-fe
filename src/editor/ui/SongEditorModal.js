/**
 * SongEditorModal
 *
 * Modal dialog that wraps NotationEditor for full-screen song editing.
 * Opened from the PropertyPanel "Edit Song..." button.
 * Handles backdrop, keyboard isolation, and focus management.
 */
import NotationEditor from 'editor/ui/NotationEditor';

export default class SongEditorModal {
  constructor(rootContainer, undoManager) {
    this._rootContainer = rootContainer;
    this._undoManager = undoManager;
    this._backdropEl = null;
    this._notationEditor = null;
    this._isOpen = false;
    this._entityId = null;

    // Bound handlers for cleanup
    this._handleKeyDown = this._onKeyDown.bind(this);
    this._handleBackdropClick = this._onBackdropClick.bind(this);
  }

  get isOpen() {
    return this._isOpen;
  }

  open(entityId) {
    // Close any existing modal first
    if (this._isOpen) {
      this.close();
    }

    const entity = this._undoManager.getEntity(entityId);
    if (!entity) return;

    this._entityId = entityId;
    this._isOpen = true;

    // Determine entity type info
    const typeName = entity.type.charAt(0).toUpperCase() + entity.type.slice(1);
    const position = `(${entity.x}, ${entity.y}, ${entity.z})`;
    const isPolyphonic = entity.type !== 'creature';

    // Build DOM structure
    this._backdropEl = document.createElement('div');
    this._backdropEl.className = 'song-modal-backdrop';

    const modalEl = document.createElement('div');
    modalEl.className = 'song-modal';

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'song-modal-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'song-modal-title';
    titleEl.textContent = `${typeName} Song \u2014 ${position}`;
    headerEl.appendChild(titleEl);

    // Clef selector
    const clefSelect = document.createElement('select');
    clefSelect.className = 'prop-select clef-selector';
    const currentClef = entity.data.clef || null;

    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto';
    if (!currentClef) autoOption.selected = true;
    clefSelect.appendChild(autoOption);

    const trebleOption = document.createElement('option');
    trebleOption.value = 'treble';
    trebleOption.textContent = 'Treble';
    if (currentClef === 'treble') trebleOption.selected = true;
    clefSelect.appendChild(trebleOption);

    const bassOption = document.createElement('option');
    bassOption.value = 'bass';
    bassOption.textContent = 'Bass';
    if (currentClef === 'bass') bassOption.selected = true;
    clefSelect.appendChild(bassOption);

    clefSelect.onchange = () => {
      const val = clefSelect.value;
      const ent = this._undoManager.getEntity(entityId);
      if (!ent) return;
      if (val === 'auto') {
        const newData = { ...ent.data };
        delete newData.clef;
        this._undoManager.updateEntity(entityId, { data: newData });
        this._notationEditor._clefOverride = null;
      } else {
        const newData = { ...ent.data, clef: val };
        this._undoManager.updateEntity(entityId, { data: newData });
        this._notationEditor._clefOverride = val;
      }
      this._notationEditor._renderStaff();
    };

    const closeBtn = document.createElement('button');
    closeBtn.className = 'song-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => this.close();

    headerEl.appendChild(clefSelect);
    headerEl.appendChild(closeBtn);

    modalEl.appendChild(headerEl);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'song-modal-body';
    modalEl.appendChild(bodyEl);

    // Footer
    const footerEl = document.createElement('div');
    footerEl.className = 'song-modal-footer';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'editor-btn';
    doneBtn.textContent = 'Done';
    doneBtn.onclick = () => this.close();
    footerEl.appendChild(doneBtn);

    modalEl.appendChild(footerEl);

    this._backdropEl.appendChild(modalEl);

    // Event listeners
    this._backdropEl.addEventListener('keydown', this._handleKeyDown);
    this._backdropEl.addEventListener('click', this._handleBackdropClick);

    // Prevent clicks inside the modal from closing it
    modalEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Append to root
    this._rootContainer.appendChild(this._backdropEl);

    // Read puzzle metadata for musical context
    const metadata = this._undoManager.getMetadata();

    // Create NotationEditor inside the body
    this._notationEditor = new NotationEditor(bodyEl, this._undoManager, entityId, {
      polyphonic: isPolyphonic,
      keySignature: metadata.keySignature || 'C',
      timeSignature: metadata.timeSignature || [4, 4],
      clef: entity.data.clef || null,
    });

    // Focus the staff element
    const staffEl = bodyEl.querySelector('.notation-staff');
    if (staffEl) {
      staffEl.focus();
    }
  }

  close() {
    if (!this._isOpen) return;

    this._isOpen = false;

    // Dispose the NotationEditor
    if (this._notationEditor) {
      this._notationEditor.dispose();
      this._notationEditor = null;
    }

    // Remove backdrop from DOM
    if (this._backdropEl && this._backdropEl.parentNode) {
      this._backdropEl.removeEventListener('keydown', this._handleKeyDown);
      this._backdropEl.removeEventListener('click', this._handleBackdropClick);
      this._backdropEl.parentNode.removeChild(this._backdropEl);
      this._backdropEl = null;
    }

    this._entityId = null;

    // Return focus to viewport
    const viewport = document.getElementById('editor-viewport');
    if (viewport) {
      viewport.focus();
    }
  }

  dispose() {
    this.close();
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  _onBackdropClick(e) {
    // Only close if the backdrop itself was clicked (not content inside the modal)
    if (e.target === this._backdropEl) {
      this.close();
    }
  }
}
