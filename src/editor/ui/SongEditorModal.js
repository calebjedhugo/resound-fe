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
 * it would in game; Stop (or closing) reports `onStop`. It plays in a
 * creature's voice (resound-sound's Theremin) on a resound-sound Sequencer:
 * a grand staff both staves, ties held, dots read.
 *
 * Layout: header (title, ×), body (palette + staff), and an always-visible
 * footer holding Play / Stop / Clear, the hint and status line, Options and
 * Done. Options opens a popover with what the controller can't otherwise
 * reach — the clef, a copy of another entity's song, and Clear — walked with
 * the pad (input/PadFocus) when it opened from the pad's Options. Leaving
 * the grand staff asks which staff to keep (a dialog) and merges BOTH
 * staves' notes onto it as chords (model/mergeVoices): nothing is dropped.
 * Copying another song over a song with notes asks first (a dialog); the
 * copy is one undo step.
 *
 * A pitch put on the staff sounds alone (a quarter note, the same creature
 * voice; the player's `sound`). However the modal closes (Done, ×, Esc /
 * ○, a click outside) it reports `onClose`, so the viewport can go back to
 * where it was before the modal framed the entity.
 */
import NotationEditor, { repairTies } from 'editor/ui/NotationEditor';
import PadFocus from 'editor/input/PadFocus';
import mergeVoices, { midiOf } from 'editor/model/mergeVoices';
import { Sequencer } from 'resound-sound';
import { createEditorVoice } from 'editor/audio/SongAudition';

const isGrand = (data) => (data.staffGroups || []).some((g) => g.type === 'brace');

/** Whether a song holds any entry (flat notes, or a grand staff's voices). */
function hasNotes(song) {
  if (Array.isArray(song)) return song.length > 0;
  return Boolean(song && Array.isArray(song.voices) && song.voices.some((v) => v.notes?.length));
}

/** A song's first few pitches, for the copy picker ('C4 E4+G4 A4 …'). */
function songPreview(song, count = 4) {
  const notes = Array.isArray(song) ? song : song?.voices?.[0]?.notes ?? [];
  const named = notes
    .filter((e) => Array.isArray(e) || e.pitch)
    .map((e) => (Array.isArray(e) ? e.map((n) => n.pitch).join('+') : e.pitch))
    .map((p) => p.replace(/#/g, '\u266f').replace(/([A-G])b/g, '$1\u266d'));
  if (named.length === 0) return 'rests only';
  return named.slice(0, count).join(' ') + (named.length > count ? ' …' : '');
}

// The entities that carry a song, in the order "Copy song from" lists them
const SONG_TYPES = ['gate', 'creature', 'fountain'];
const gateNumber = (gate) => Number(/(\d+)$/.exec(gate.data.gateId || '')?.[1] ?? Infinity);

/**
 * How an entity is named in "Copy song from" and its dialog: a gate by its
 * gate id ('gate-2' -> 'Gate 2'), a creature or fountain by its entity id
 * ('Creature 5', as the validator names it).
 */
function songOwnerName(entity) {
  const type = entity.type.charAt(0).toUpperCase() + entity.type.slice(1);
  if (entity.type === 'gate') {
    const n = gateNumber(entity);
    return Number.isFinite(n) ? `Gate ${n}` : `Gate at (${entity.x}, ${entity.y}, ${entity.z})`;
  }
  return `${type} ${entity.id}`;
}

/**
 * One staff, one note at a time, from a song (a creature's song holds one
 * note per entry): a grand staff's staves merged (mergeVoices), each chord's
 * TOP note kept (the tune), ties re-joined between what is left.
 */
function singleLine(song) {
  const flat = Array.isArray(song)
    ? song
    : mergeVoices((song?.voices ?? []).map((v) => v.notes || []));
  const line = flat.map((e) => {
    if (!Array.isArray(e)) return { ...e };
    return { ...e.reduce((a, b) => (midiOf(b.pitch) > midiOf(a.pitch) ? b : a)) };
  });
  repairTies(line);
  return line;
}

// The pad's actions while a popover / dialog of the modal has the focus
const PANEL_MOVES = { pitchUp: -1, sharpen: -1, pitchDown: 1, flatten: 1 };
const PANEL_ADJUSTS = { left: -1, right: 1 };

export default class SongEditorModal {
  /**
   * @param {HTMLElement} rootContainer
   * @param {UndoManager} undoManager
   * @param {object} [options]
   * @param {(entityId:number, pitch:string, seconds:number) => void} [options.onNote]
   *   a played note began (the song editor's Play)
   * @param {(entityId:number) => void} [options.onStop] - playback stopped
   * @param {(entityId:number) => void} [options.onClose] - the modal closed
   *   (any way: Done, ×, Esc / ○, a click outside)
   * @param {(id:string) => ?object} [options.createVoice] - the creature
   *   voice it plays in (startNote / stopAll; default SongAudition's
   *   createEditorVoice, null without Web Audio)
   */
  constructor(
    rootContainer,
    undoManager,
    {
      onNote = () => {},
      onStop = () => {},
      onClose = () => {},
      createVoice = createEditorVoice,
    } = {}
  ) {
    this._rootContainer = rootContainer;
    this._undoManager = undoManager;
    this._onNote = onNote;
    this._onStop = onStop;
    this._onClose = onClose;
    this._createVoice = createVoice;
    this._backdropEl = null;
    this._notationEditor = null;
    this._isOpen = false;
    this._entityId = null;
    this._player = null; // lazily-created audio player for editor playback
    this._sequencer = null; // a grand staff's playback
    this._panel = null; // { el, focus } — the popover or dialog the pad walks
    // Undo / redo steps this opening of the modal recorded (its notes and
    // clef): ⌘Z inside the modal walks back only through these, never into
    // the level edits behind it (it could undo the entity's own creation)
    this._undoSteps = 0;
    this._redoSteps = 0;

    // Bound handlers for cleanup
    this._handleKeyDown = this._onKeyDown.bind(this);
    this._handleBackdropClick = this._onBackdropClick.bind(this);
  }

  get isOpen() {
    return this._isOpen;
  }

  /** Whether the Options popover or the staff dialog is open (the pad walks it). */
  get panelOpen() {
    return Boolean(this._panel);
  }

  /** The notation editor showing now (null while closed). */
  get notationEditor() {
    return this._notationEditor;
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
    this._undoSteps = 0;
    this._redoSteps = 0;

    // Determine entity type info
    const typeName = entity.type.charAt(0).toUpperCase() + entity.type.slice(1);
    const position = `(${entity.x}, ${entity.y}, ${entity.z})`;
    const isPolyphonic = entity.type !== 'creature';

    // Build DOM structure
    this._backdropEl = document.createElement('div');
    this._backdropEl.className = 'song-modal-backdrop';

    const modalEl = document.createElement('div');
    modalEl.className = 'song-modal';
    this._modalEl = modalEl;

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'song-modal-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'song-modal-title';
    titleEl.textContent = `${typeName} Song — ${position}`;
    headerEl.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'song-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => this.close();
    headerEl.appendChild(closeBtn);
    modalEl.appendChild(headerEl);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'song-modal-body';
    modalEl.appendChild(bodyEl);

    // Footer: the editor's controls (Play / Stop / Clear, hint, status),
    // Options, Done — always in sight
    const footerEl = document.createElement('div');
    footerEl.className = 'song-modal-footer';
    const controlsEl = document.createElement('div');
    controlsEl.className = 'song-modal-controls';
    footerEl.appendChild(controlsEl);

    const optionsBtn = document.createElement('button');
    optionsBtn.className = 'editor-btn song-options-btn';
    optionsBtn.type = 'button';
    optionsBtn.textContent = 'Options';
    optionsBtn.onclick = () => this.toggleOptions({ fromPad: false });
    footerEl.appendChild(optionsBtn);

    const doneBtn = document.createElement('button');
    doneBtn.className = 'editor-btn song-done-btn';
    doneBtn.textContent = 'Done';
    doneBtn.onclick = () => this.close();
    footerEl.appendChild(doneBtn);
    modalEl.appendChild(footerEl);

    // Read puzzle metadata for musical context
    const metadata = this._undoManager.getMetadata();
    this._bodyEl = bodyEl;
    this._controlsEl = controlsEl;
    this._metadata = metadata;
    this._isPolyphonic = isPolyphonic;

    this._buildOptionsPopover(modalEl, entity, isPolyphonic);
    this._buildStaffDialog(modalEl);
    this._buildCopyDialog(modalEl);

    this._backdropEl.appendChild(modalEl);

    // Event listeners
    this._backdropEl.addEventListener('keydown', this._handleKeyDown);
    this._backdropEl.addEventListener('click', this._handleBackdropClick);

    // Prevent clicks inside the modal from closing it; a click outside the
    // Options popover closes the popover (not the staff dialog: it asks)
    modalEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = this._panel && this._panel.el;
      if (panel === this._popoverEl && !panel.contains(e.target) && e.target !== optionsBtn) {
        this.closePanel();
      }
    });

    // Append to root
    this._rootContainer.appendChild(this._backdropEl);

    // Create NotationEditor inside the body
    this._notationEditor = this._createEditor(entity);

    // The staff has the keyboard (the palette above it stays in sight)
    this._notationEditor.focus();
  }

  /** The Options popover: the clef, a song to copy, and Clear (hidden until Options). */
  _buildOptionsPopover(modalEl, entity, isPolyphonic) {
    const popover = document.createElement('div');
    popover.className = 'song-options-popover';
    popover.hidden = true;

    const clefLabel = document.createElement('label');
    clefLabel.className = 'song-options-row';
    clefLabel.textContent = 'Clef ';
    const clefSelect = document.createElement('select');
    clefSelect.className = 'prop-select clef-selector';
    const options = [
      ['auto', 'Auto'],
      ['treble', 'Treble'],
      ['bass', 'Bass'],
    ];
    if (isPolyphonic) options.push(['grand-staff', 'Grand Staff']);
    options.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      clefSelect.appendChild(option);
    });
    clefSelect.value = this._clefValue(entity.data);
    clefSelect.onchange = () => this._changeClef(clefSelect.value);
    clefLabel.appendChild(clefSelect);
    popover.appendChild(clefLabel);

    popover.appendChild(this._buildCopyPicker(entity));

    const clearBtn = document.createElement('button');
    clearBtn.className = 'editor-btn song-options-clear';
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear this staff';
    clearBtn.onclick = () => {
      this.closePanel();
      if (this._notationEditor) this._notationEditor.clear();
    };
    popover.appendChild(clearBtn);

    modalEl.appendChild(popover);
    this._popoverEl = popover;
    this._clefSelect = clefSelect;
  }

  /** Grand staff → one staff: which staff to keep (both staves' notes go on it). */
  _buildStaffDialog(modalEl) {
    const dialog = document.createElement('div');
    dialog.className = 'song-staff-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.hidden = true;
    const text = document.createElement('p');
    text.textContent =
      'One staff from here: which one do you keep? Every note of BOTH staves goes ' +
      'onto it, merged as chords (a note held across the other staff’s notes is split ' +
      'and tied).';
    dialog.appendChild(text);
    const buttons = document.createElement('div');
    buttons.className = 'song-staff-dialog-buttons';
    [
      ['treble', 'Keep the treble staff'],
      ['bass', 'Keep the bass staff'],
      [null, 'Cancel'],
    ].forEach(([clef, label]) => {
      const btn = document.createElement('button');
      btn.className = 'editor-btn';
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.keep = clef || 'cancel';
      btn.onclick = () => {
        this.closePanel();
        if (clef) this._mergeToSingleStaff(clef);
      };
      buttons.appendChild(btn);
    });
    dialog.appendChild(buttons);
    modalEl.appendChild(dialog);
    this._dialogEl = dialog;
  }

  /**
   * "Copy song from": every other entity of this level that has a song —
   * gates, creatures and fountains — by name and their first few notes.
   * Choosing one copies its song here (copySongFrom), asking first over a
   * song with notes.
   */
  _buildCopyPicker(entity) {
    const label = document.createElement('label');
    label.className = 'song-options-row';
    label.textContent = 'Copy song from ';
    const select = document.createElement('select');
    select.className = 'prop-select song-copy-select';
    const sources = this.songSources(entity.id);
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = sources.length ? 'Choose a song…' : 'Nothing else here has a song';
    select.appendChild(prompt);
    sources.forEach(({ id, label: text }) => {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = text;
      select.appendChild(option);
    });
    select.disabled = sources.length === 0;
    select.onchange = () => {
      const sourceId = Number(select.value);
      select.value = '';
      if (select.dataset) delete select.dataset.padCommitted;
      this.closePanel();
      if (!sourceId) return;
      const target = this._undoManager.getEntity(this._entityId);
      if (target && hasNotes(target.data.song)) {
        this._askCopy(sourceId);
      } else {
        this.copySongFrom(sourceId);
      }
    };
    label.appendChild(select);
    this._copySelect = select;
    return label;
  }

  /**
   * The songs of this level that could be copied into `entityId`: every
   * other gate, creature and fountain with notes — gates in gate-id order,
   * then creatures, then fountains (each by entity id).
   * @param {number} entityId
   * @returns {{id: number, label: string}[]}
   */
  songSources(entityId) {
    const rank = (e) => SONG_TYPES.indexOf(e.type);
    return this._undoManager
      .getEntities()
      .filter((e) => rank(e) >= 0 && e.id !== entityId && hasNotes(e.data.song))
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.type === 'gate' ? gateNumber(a) - gateNumber(b) : 0) ||
          a.id - b.id
      )
      .map((e) => {
        const grand = isGrand(e.data) ? ' (grand staff)' : '';
        return { id: e.id, label: `${songOwnerName(e)}${grand} — ${songPreview(e.data.song)}` };
      });
  }

  /** Copying over a song with notes: asks (Replace / Cancel). */
  _buildCopyDialog(modalEl) {
    const dialog = document.createElement('div');
    dialog.className = 'song-copy-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.hidden = true;
    const text = document.createElement('p');
    dialog.appendChild(text);
    const buttons = document.createElement('div');
    buttons.className = 'song-staff-dialog-buttons';
    [
      ['replace', 'Replace this song'],
      ['cancel', 'Cancel'],
    ].forEach(([what, label]) => {
      const btn = document.createElement('button');
      btn.className = 'editor-btn';
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.copy = what;
      btn.onclick = () => {
        const sourceId = this._copyPending;
        this._copyPending = null;
        this.closePanel();
        if (what === 'replace' && sourceId) this.copySongFrom(sourceId);
      };
      buttons.appendChild(btn);
    });
    dialog.appendChild(buttons);
    modalEl.appendChild(dialog);
    this._copyDialogEl = dialog;
    this._copyTextEl = text;
  }

  _askCopy(sourceId) {
    const source = this._undoManager.getEntity(sourceId);
    if (!source) return;
    this._copyPending = sourceId;
    const name = songOwnerName(source);
    const target = this._undoManager.getEntity(this._entityId);
    const reduced =
      target && target.type === 'creature'
        ? ' A creature sings one note at a time: each chord gives its top note.'
        : '';
    this._copyTextEl.textContent =
      `Replace this song with ${name}’s? Its notes and staff come here, in place of ` +
      `these (⌘Z / L3 undoes it).${reduced}`;
    this._openPanel(this._copyDialogEl, '[data-copy="cancel"]');
  }

  /**
   * Copy another entity's song (a gate's, creature's or fountain's) into the
   * entity being edited, replacing its song: both
   * staves and the grand-staff setting, or the one staff and its clef (time
   * and key are the level's, so they need nothing). A creature, which sings
   * one note at a time, takes one line: the staves merged, each chord's top
   * note. One undo step; the staff shows it with the cursor at the end.
   * @param {number} sourceId - the source's entity id
   * @returns {boolean} whether it copied
   */
  copySongFrom(sourceId) {
    if (!this._isOpen) return false;
    const source = this._undoManager.getEntity(sourceId);
    const target = this._undoManager.getEntity(this._entityId);
    if (!source || !target || sourceId === this._entityId || !hasNotes(source.data.song)) {
      return false;
    }
    const copy = JSON.parse(JSON.stringify(source.data));
    const newData = { ...target.data };
    delete newData.clef;
    delete newData.staffGroups;
    if (target.type === 'creature') {
      newData.song = singleLine(copy.song);
      if (!isGrand(copy) && copy.clef) newData.clef = copy.clef;
    } else {
      newData.song = copy.song;
      if (copy.clef) newData.clef = copy.clef;
      if (copy.staffGroups && copy.staffGroups.length) newData.staffGroups = copy.staffGroups;
    }
    this._recordEdit(() => this._undoManager.updateEntity(this._entityId, { data: newData }));
    this._clefSelect.value = this._clefValue(newData);
    this._rebuildEditor();
    this._notationEditor.focus();
    return true;
  }

  _clefValue(data) {
    if (isGrand(data)) return 'grand-staff';
    return data.clef || 'auto';
  }

  /**
   * The clef dropdown chose `value`. Leaving the grand staff only asks
   * (the dialog); anything else applies at once.
   */
  _changeClef(value) {
    const ent = this._undoManager.getEntity(this._entityId);
    if (!ent) return;
    const wasGrand = isGrand(ent.data);
    if (value === this._clefValue(ent.data)) {
      this.closePanel();
      return;
    }
    if (wasGrand && value !== 'grand-staff') {
      this._clefSelect.value = 'grand-staff'; // until a staff is chosen
      this.closePanel();
      this._openPanel(this._dialogEl, `[data-keep="${value === 'bass' ? 'bass' : 'treble'}"]`);
      return;
    }
    const newData = { ...ent.data };
    if (value === 'grand-staff') {
      delete newData.clef;
      newData.staffGroups = [{ type: 'brace', voiceIds: ['treble', 'bass'] }];
    } else if (value === 'auto') {
      delete newData.clef;
      delete newData.staffGroups;
    } else {
      newData.clef = value;
      delete newData.staffGroups;
    }
    this._recordEdit(() => this._undoManager.updateEntity(this._entityId, { data: newData }));
    this.closePanel();
    if (value === 'grand-staff' && !wasGrand) {
      this._rebuildEditor();
    } else {
      this._notationEditor.setClef(value === 'auto' ? null : value);
    }
    // The keys go back to the staff, as after any other control
    this._notationEditor.focus();
  }

  /** Both staves' notes onto one staff in `clef`, as chords; one undo step. */
  _mergeToSingleStaff(clef) {
    const ent = this._undoManager.getEntity(this._entityId);
    if (!ent || !isGrand(ent.data)) return;
    const { song } = ent.data;
    const voices = song && Array.isArray(song.voices) ? song.voices.map((v) => v.notes || []) : [];
    const merged = Array.isArray(song) ? song : mergeVoices(voices);
    const newData = { ...ent.data, clef, song: merged };
    delete newData.staffGroups;
    this._recordEdit(() => this._undoManager.updateEntity(this._entityId, { data: newData }));
    this._clefSelect.value = clef;
    this._rebuildEditor();
    this._notationEditor.focus();
  }

  /** A fresh editor for the entity as it is now (the staves came or went). */
  _rebuildEditor() {
    const entity = this._undoManager.getEntity(this._entityId);
    if (this._notationEditor) this._notationEditor.dispose();
    this._notationEditor = this._createEditor(entity);
  }

  /**
   * Construct the notation-package editor bound to this entity. All engraving
   * and interaction live in the package; the editor hands back edited songs
   * through onChange, which we persist via the undo manager. Both the initial
   * open and clef-driven recreation route through here.
   */
  _createEditor(entity) {
    const entityId = this._entityId;
    const metadata = this._metadata;
    return new NotationEditor({
      container: this._bodyEl,
      controlsContainer: this._controlsEl,
      song: entity.data.song || [],
      polyphonic: this._isPolyphonic,
      keySignature: metadata.keySignature || 'C',
      timeSignature: metadata.timeSignature !== undefined ? metadata.timeSignature : [4, 4],
      clef: entity.data.clef || null,
      staffGroups: entity.data.staffGroups || [],
      tempo: metadata.tempo || 120,
      player: this._ensurePlayer(),
      onChange: (song) => {
        const ent = this._undoManager.getEntity(entityId);
        if (!ent) return;
        this._recordEdit(() =>
          this._undoManager.updateEntity(entityId, { data: { ...ent.data, song } })
        );
      },
    });
  }

  /** Make one model edit, counted as this opening's own undo step. */
  _recordEdit(edit) {
    edit();
    this._undoSteps += 1;
    this._redoSteps = 0; // a new edit drops the redo history, as the manager does
  }

  /**
   * ⌘Z / ⇧⌘Z (Ctrl on other systems), L3 / R3 on the pad, inside the modal:
   * undo / redo the song's edits made since it opened, and show the result.
   * @param {boolean} redo
   * @returns {boolean} whether a step was taken
   */
  undo(redo = false) {
    if (!this._isOpen) return false;
    const manager = this._undoManager;
    if (redo ? !this._redoSteps || !manager.canRedo() : !this._undoSteps || !manager.canUndo()) {
      return false;
    }
    if (redo) {
      manager.redo();
      this._redoSteps -= 1;
      this._undoSteps += 1;
    } else {
      manager.undo();
      this._undoSteps -= 1;
      this._redoSteps += 1;
    }
    this._showEntity();
    return true;
  }

  /** Bring the clef selector and the staff in line with the entity's data. */
  _showEntity() {
    const entity = this._undoManager.getEntity(this._entityId);
    if (!entity) return;
    const { clef = null, song = [] } = entity.data;
    const grand = isGrand(entity.data);
    this._clefSelect.value = this._clefValue(entity.data);
    if (grand !== this._notationEditor.isGrandStaff) {
      this._rebuildEditor();
    } else {
      if (!grand) this._notationEditor.setClef(clef);
      this._notationEditor.setSong(song);
    }
    this._notationEditor.focus();
  }

  // ── The Options popover and the staff dialog ──────────────────────

  /**
   * Options (the pad's, or the footer button): open the popover, or close
   * whatever popover / dialog is open.
   */
  toggleOptions({ fromPad = true } = {}) {
    if (!this._isOpen) return;
    if (this._panel) {
      this.closePanel();
      return;
    }
    this._openPanel(this._popoverEl, fromPad ? null : '.clef-selector');
  }

  _openPanel(el, target = null) {
    el.hidden = false;
    const focus = new PadFocus(() => el);
    this._panel = { el, focus };
    focus.enter(target);
  }

  /** Close the popover / dialog; the keys go back to the staff. */
  closePanel() {
    if (!this._panel) return;
    const { el, focus } = this._panel;
    focus.leave();
    el.hidden = true;
    this._panel = null;
    if (this._notationEditor) this._notationEditor.focus();
  }

  /** The pad inside the popover / dialog: walk, change, choose, back. */
  _padInPanel(action) {
    const { focus } = this._panel;
    if (PANEL_MOVES[action]) focus.move(PANEL_MOVES[action]);
    else if (PANEL_ADJUSTS[action]) focus.adjust(PANEL_ADJUSTS[action]);
    else if (action === 'cross' || action === 'rest' || action === 'insertNote') focus.activate();
    else if (action === 'close' || action === 'options') this.closePanel();
  }

  // ── Playback ──────────────────────────────────────────────────────

  /**
   * Lazily create editor playback: a creature's voice (resound-sound's
   * Theremin in its default voice, crackle as in game; SongAudition's
   * createEditorVoice) on a Sequencer. Returns null where Web Audio is
   * unavailable (e.g. jsdom tests), in which case the editor still animates
   * its playback cursor silently.
   */
  _ensurePlayer() {
    if (this._player) return this._player;
    const voice = this._createVoice('song-editor');
    if (!voice) return null;
    // The editor talks to the wrapper only. A stop puts the entity out
    // (onStop). `sound`: one pitch just put on the staff, alone (a quarter
    // note at the tempo, NotationEditor._sound), lighting the entity for it.
    this._player = {
      voice,
      play: (args) => this._playVoices(voice, args),
      sound: (pitch, seconds) => {
        voice.startNote(pitch, seconds * 1000);
        if (this._entityId !== null) this._onNote(this._entityId, pitch, seconds);
      },
      stop: () => {
        if (this._sequencer) this._sequencer.stop();
        this._sequencer = null;
        voice.stopAll(0.05);
        if (this._entityId !== null) this._onStop(this._entityId);
      },
    };
    return this._player;
  }

  /**
   * Play the song: a grand staff's staves together (`{ voices }`), a single
   * staff as one voice (`{ data }`). A Sequencer walks the voices on one
   * beat clock (dots read, a tied note held as ONE sound, chord members
   * tied each on their own: resound-sound buildTimeline) and sounds each
   * note on the creature voice, lighting the entity for as long as it
   * sounds (onNote).
   */
  _playVoices(voice, { voices, data, tempo, basis }) {
    if (this._sequencer) this._sequencer.stop();
    const instrument = {
      startNote: (pitch, ms) => {
        voice.startNote(pitch, ms);
        if (this._entityId !== null) this._onNote(this._entityId, pitch, ms / 1000);
      },
      stopAll: (fade) => voice.stopAll(fade),
    };
    this._sequencer = new Sequencer({ instrument, lookaheadMs: 0 });
    this._sequencer.play({ voices: voices || [{ id: 0, notes: data || [] }], tempo, basis });
  }

  /** Stop the song if it is playing (the editor's Play takes the stage). */
  stopPlayback() {
    if (this._notationEditor && this._notationEditor.isPlaying) this._notationEditor.stop();
  }

  close() {
    if (!this._isOpen) return;

    this._isOpen = false;
    this._panel = null;

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

    const closedId = this._entityId;
    this._entityId = null;
    this._copyPending = null;
    this._onClose(closedId);

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
   * A controller's song-editing action (editor/input/EditorGamepad
   * SONG_ACTIONS): left / right (edit cursor), pitchUp / pitchDown (pitch
   * cursor), sharpen / flatten (L2 + up/down: the note under the pitch
   * cursor's accidental), cross (past an entry — the end, where it opens —
   * a new note; on an entry, the pitch on / off it — or, the dot chosen,
   * the dots: none → one → two → none; the tie chosen, the note under the
   * pitch cursor tied / untied), insertNote (L2 + ✕: a new note at the
   * pitch cursor BEFORE the entry the cursor is on; past the end, appended),
   * rest (R2 + ✕: a rest of the chosen
   * duration), erase (□: note → rest → gone), palettePrev / paletteNext
   * (L1/R1: the palette's card to the left / right, 32nd … whole, dot, tie),
   * noteShorter / noteLonger (L2+L1 / R2+R1: the note at the cursor), play, voice (the
   * other staff), undo / redo (L3 / R3), options (the popover), close.
   * While the popover or dialog is open, the pad walks it instead.
   * @param {string} action
   */
  padAction(action) {
    if (!this._isOpen || !this._notationEditor) return;
    if (this._panel) {
      this._padInPanel(action);
      return;
    }
    const editor = this._notationEditor;
    switch (action) {
      case 'left':
      case 'right':
        editor.moveCursor(action === 'left' ? -1 : 1);
        break;
      case 'pitchUp':
      case 'pitchDown':
        editor.movePitchCursor(action === 'pitchUp' ? 1 : -1);
        break;
      case 'sharpen':
      case 'flatten':
        editor.stepAccidental(action === 'sharpen' ? 1 : -1);
        break;
      case 'cross':
        editor.cross();
        break;
      case 'rest':
        editor.insertRest();
        break;
      case 'insertNote':
        editor.insertNote();
        break;
      case 'erase':
        editor.erase();
        break;
      case 'palettePrev':
      case 'paletteNext':
        // The palette runs 32nd -> whole, dot, tie: a longer value is further along
        editor.palette.step(action === 'paletteNext' ? 1 : -1);
        break;
      case 'noteLonger':
      case 'noteShorter':
        editor.stepNoteDuration(action === 'noteLonger' ? 1 : -1);
        break;
      case 'play':
        editor.togglePlay();
        break;
      case 'voice':
        editor.switchStaff(1);
        break;
      case 'undo':
      case 'redo':
        this.undo(action === 'redo');
        break;
      case 'options':
        this.toggleOptions({ fromPad: true });
        return;
      case 'close':
        this.close();
        return;
      default:
        return;
    }
    this._notationEditor?.focus();
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // A popover / dialog closes first (the dialog: cancel)
      if (this._panel) this.closePanel();
      else this.close();
      return;
    }
    // Undo / redo the song's edits (the staff leaves ⌘ keys alone). Not
    // while a field of the modal has the keys: the clef dropdown's own.
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (key === 'z' || (key === 'y' && e.ctrlKey))) {
      if (e.target && e.target.tagName === 'SELECT') return;
      e.preventDefault();
      this.undo(key === 'y' || e.shiftKey);
    }
  }

  _onBackdropClick(e) {
    // Only close if the backdrop itself was clicked (not content inside the modal)
    if (e.target === this._backdropEl) {
      this.close();
    }
  }
}
