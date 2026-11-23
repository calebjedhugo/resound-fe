/**
 * SongEditorModal
 *
 * Modal dialog that wraps NotationEditor for song editing.
 * Opened from the PropertyPanel "Edit Song..." button.
 * Handles backdrop, keyboard isolation, and focus management.
 *
 * It docks along the bottom of the window over a light backdrop, so the
 * viewport above stays in sight: while Play sounds a creature's song, each
 * note is reported (`onNote`) and the creature lights up in the viewport as
 * it would in game; Stop (or closing) reports `onStop`.
 */
import NotationEditor from 'editor/ui/NotationEditor';
import { Synth } from 'resound-sound';
import { noteSeconds } from 'editor/audio/SongAudition';
import { DURATIONS } from 'editor/ui/RhythmPalette';

// The controller's song-editing actions -> the staff's own keys (NotationEditor)
const PAD_KEYS = {
  left: 'ArrowLeft', // edit cursor left
  right: 'ArrowRight', // edit cursor right
  up: '+', // the selected note a step up
  down: '-', // ...a step down
  delete: 'Delete', // remove the selected note
  dot: '.', // dot / undot it
  rest: 'r', // a rest of the chosen duration at the cursor
  voice: 'Enter', // grand staff: the other staff
};
const ACCIDENTALS = ['#', 'b', 'n'];

export default class SongEditorModal {
  /**
   * @param {HTMLElement} rootContainer
   * @param {UndoManager} undoManager
   * @param {object} [options]
   * @param {(entityId:number, pitch:string, seconds:number) => void} [options.onNote]
   *   a played note began (the song editor's Play)
   * @param {(entityId:number) => void} [options.onStop] - playback stopped
   */
  constructor(rootContainer, undoManager, { onNote = () => {}, onStop = () => {} } = {}) {
    this._rootContainer = rootContainer;
    this._undoManager = undoManager;
    this._onNote = onNote;
    this._onStop = onStop;
    this._backdropEl = null;
    this._notationEditor = null;
    this._isOpen = false;
    this._entityId = null;
    this._player = null; // lazily-created audio player for editor playback

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

    // Body element (declared early so clef-change handler can reference it)
    const bodyEl = document.createElement('div');
    bodyEl.className = 'song-modal-body';

    // Read puzzle metadata for musical context
    const metadata = this._undoManager.getMetadata();

    // Clef selector
    const clefSelect = document.createElement('select');
    clefSelect.className = 'prop-select clef-selector';
    const currentClef = entity.data.clef || null;
    const hasGrandStaff = (entity.data.staffGroups || []).some((g) => g.type === 'brace');

    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto';
    if (!currentClef && !hasGrandStaff) autoOption.selected = true;
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

    if (isPolyphonic) {
      const grandStaffOption = document.createElement('option');
      grandStaffOption.value = 'grand-staff';
      grandStaffOption.textContent = 'Grand Staff';
      if (hasGrandStaff) grandStaffOption.selected = true;
      clefSelect.appendChild(grandStaffOption);
    }

    clefSelect.onchange = () => {
      const val = clefSelect.value;
      const ent = this._undoManager.getEntity(entityId);
      if (!ent) return;

      const wasGrandStaff = (ent.data.staffGroups || []).some((g) => g.type === 'brace');
      const isNowGrandStaff = val === 'grand-staff';

      // Update entity data
      const newData = { ...ent.data };
      if (isNowGrandStaff) {
        delete newData.clef;
        newData.staffGroups = [{ type: 'brace', voiceIds: ['treble', 'bass'] }];
      } else if (val === 'auto') {
        delete newData.clef;
        delete newData.staffGroups;
      } else {
        newData.clef = val;
        delete newData.staffGroups;
      }
      this._undoManager.updateEntity(entityId, { data: newData });

      // Recreate editor if mode changed (grand staff <-> single staff)
      if (wasGrandStaff !== isNowGrandStaff) {
        this._notationEditor.dispose();
        const updatedEntity = this._undoManager.getEntity(entityId);
        this._notationEditor = this._createEditor(bodyEl, updatedEntity, metadata, isPolyphonic);
        const staffEl = bodyEl.querySelector('.notation-staff');
        if (staffEl) staffEl.focus();
      } else if (!isNowGrandStaff) {
        this._notationEditor.setClef(val === 'auto' ? null : val);
      }
    };

    const closeBtn = document.createElement('button');
    closeBtn.className = 'song-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => this.close();

    headerEl.appendChild(clefSelect);
    headerEl.appendChild(closeBtn);

    modalEl.appendChild(headerEl);

    // Body
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

    // Create NotationEditor inside the body
    this._notationEditor = this._createEditor(bodyEl, entity, metadata, isPolyphonic);

    // Focus the staff element
    const staffEl = bodyEl.querySelector('.notation-staff');
    if (staffEl) {
      staffEl.focus();
    }
  }

  /**
   * Construct the notation-package editor bound to this entity. All engraving
   * and interaction live in the package; the editor hands back edited songs
   * through onChange, which we persist via the undo manager. Both the initial
   * open and clef-driven recreation route through here.
   */
  _createEditor(bodyEl, entity, metadata, isPolyphonic) {
    const entityId = this._entityId;
    return new NotationEditor({
      container: bodyEl,
      song: entity.data.song || [],
      polyphonic: isPolyphonic,
      keySignature: metadata.keySignature || 'C',
      timeSignature: metadata.timeSignature !== undefined ? metadata.timeSignature : [4, 4],
      clef: entity.data.clef || null,
      staffGroups: entity.data.staffGroups || [],
      tempo: metadata.tempo || 120,
      player: this._ensurePlayer(),
      onChange: (song) => {
        const ent = this._undoManager.getEntity(entityId);
        if (!ent) return;
        this._undoManager.updateEntity(entityId, { data: { ...ent.data, song } });
      },
    });
  }

  /**
   * Lazily create a resound-sound Synth to sound editor playback. Returns null
   * where Web Audio is unavailable (e.g. jsdom tests), in which case the editor
   * still animates its playback cursor silently.
   */
  _ensurePlayer() {
    if (this._player) return this._player;
    const hasAudio =
      typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    let synth = null;
    if (hasAudio) {
      try {
        synth = new Synth();
      } catch {
        synth = null;
      }
    }
    if (!synth) return null;
    // Each note it sounds lights the entity in the viewport (onNote); a stop
    // puts it out (onStop). The editor talks to the wrapper only.
    synth.noteCallback = (event) => {
      if (this._entityId === null) return;
      const { tempo } = this._undoManager.getMetadata();
      this._onNote(this._entityId, event.pitch, noteSeconds(event, tempo));
    };
    this._player = {
      synth,
      play: (args) => synth.play(args),
      stop: () => {
        synth.stop();
        if (this._entityId !== null) this._onStop(this._entityId);
      },
    };
    return this._player;
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

  /**
   * A controller's song-editing action (editor/input/EditorGamepad): move
   * the edit cursor (left/right), the selected note's pitch (up/down),
   * insert a note of the chosen duration at the cursor (insert), delete,
   * choose a shorter/longer duration (shorter/longer), dot, rest, cycle the
   * selected note's accidental (accidental: sharp, flat, natural), switch
   * staff (voice), play/stop (play), close. Each is the staff's own key or
   * control, so it edits exactly as the keyboard and mouse do.
   * @param {string} action
   */
  padAction(action) {
    if (!this._isOpen || !this._notationEditor) return;
    const staff = this._backdropEl.querySelector('.notation-staff');
    const pressKey = (key) => {
      if (staff) staff.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };
    if (PAD_KEYS[action]) {
      pressKey(PAD_KEYS[action]);
      return;
    }
    const rhythm = [...this._backdropEl.querySelectorAll('.rhythm-btn')];
    const active = Math.max(
      0,
      rhythm.findIndex((b) => b.classList.contains('active'))
    );
    switch (action) {
      case 'insert': {
        const duration = DURATIONS.find((d) => d.length === rhythm[active]?.dataset.length);
        pressKey((duration || DURATIONS[2]).key);
        break;
      }
      case 'shorter':
      case 'longer': {
        // The palette runs whole -> 32nd: a shorter value is further along
        const next = active + (action === 'shorter' ? 1 : -1);
        if (rhythm[next]) rhythm[next].click();
        break;
      }
      case 'accidental':
        this._padAccidental = ((this._padAccidental ?? -1) + 1) % ACCIDENTALS.length;
        pressKey(ACCIDENTALS[this._padAccidental]);
        break;
      case 'play':
        if (this._notationEditor.isPlaying) this._notationEditor.stop();
        else this._notationEditor.play();
        break;
      case 'close':
        this.close();
        break;
      default:
        break;
    }
    if (staff && document.activeElement !== staff) staff.focus();
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
