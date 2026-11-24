/**
 * NotationEditor — interactive, container-plus-JSON song editor.
 *
 * The engraving is delegated entirely to `NotationRenderer`: on every edit the
 * editor rebuilds the song JSON and re-renders, so chords, stems, flags,
 * ledger lines, beaming, accidentals, and barlines always match the library's
 * single source of truth. The editor owns only the *interaction* layer —
 * selection, an edit cursor, click-to-place, and keyboard commands — which it
 * overlays on the rendered SVG using the stable `data-voice-id` /
 * `data-note-index` hooks the renderer stamps on its output.
 *
 * Keyboard input renders at most once per animation frame, and only what
 * changed: an edit re-renders the score, a selection/cursor/voice move only
 * redraws the overlay, any other key draws nothing. A change of the staff's
 * width re-renders the same way (the editor observes it, not the renderer).
 *
 * Consumers hand over a container and a song, and receive edited songs back
 * through `onChange`. They never touch notation internals.
 *
 *   new NotationEditor({
 *     container,                 // HTMLElement to build the editor UI into
 *     song,                      // initial song: flat notes[] or { voices, staffGroups }
 *     keySignature = 'C',
 *     timeSignature = [4, 4],    // or null for unmetered
 *     clef = null,               // single-staff clef override ('treble'|'bass'|...)
 *     staffGroups = [],          // grand-staff config (brace group) enables two voices
 *     polyphonic = true,         // allow chord building (shift-click)
 *     scale = 2.5,               // display scale (larger than the professional default)
 *     onChange = (song) => {},   // called with a fresh song object after every edit
 *   })
 */

import { NotationRenderer } from 'resound-notation';
import SongModel from 'editor/model/SongModel';
import RhythmPalette from 'editor/ui/RhythmPalette';
import { createNoteFromClick } from 'editor/ui/staffCoords';
import { inferClef } from 'resound-notation/lib/clefInference';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRAND_STAFF_VOICES = ['treble', 'bass'];
// A staff group's middle line, in its own coordinates (its lines run 10..90)
const STAFF_MIDDLE_Y = 50;

// ── Dotted-duration normalization ─────────────────────────────────────
// SongModel represents a dotted value as a numerator-3 fraction (e.g. a
// dotted quarter is '3/8'). The renderer instead wants a base length plus a
// `dotted: true` flag ('1/4' + dotted). We translate at the boundary in both
// directions so the model keeps its fraction invariant while stored and
// rendered songs use the canonical dotted form (which the game display also
// engraves correctly).

const isPow2 = (d) => d > 0 && (d & (d - 1)) === 0;

function isFractionDotted(length) {
  const [n, d] = String(length).split('/').map(Number);
  return n === 3 && isPow2(d);
}

/** '3/8' -> '1/4' (halve the denominator). */
function dottedFractionToBase(length) {
  const [, d] = length.split('/').map(Number);
  return `1/${d / 2}`;
}

/** '1/4' -> '3/8' (double the denominator, numerator 3). */
function baseToDottedFraction(base) {
  const [, d] = base.split('/').map(Number);
  return `3/${d * 2}`;
}

/** Stored/canonical note ({length, dotted}) -> model fraction form. */
function normalizeInNote(note) {
  const out = { ...note };
  if (out.dotted) {
    out.length = baseToDottedFraction(out.length);
    delete out.dotted;
  }
  return out;
}

/** Model fraction form -> canonical note the renderer understands. */
function normalizeOutNote(note) {
  const out = { ...note };
  if (isFractionDotted(out.length)) {
    out.length = dottedFractionToBase(out.length);
    out.dotted = true;
  }
  return out;
}

const mapEntry = (fn) => (entry) => (Array.isArray(entry) ? entry.map(fn) : fn(entry));
const normalizeIn = mapEntry(normalizeInNote);
const normalizeOut = mapEntry(normalizeOutNote);

/** Duration of a length fraction in quarter-note beats ('1/4' -> 1, '3/8' -> 1.5). */
function fractionToQuarterBeats(length) {
  const [n, d] = String(length).split('/').map(Number);
  return (n / d) * 4;
}

export default class NotationEditor {
  constructor({
    container,
    song = [],
    keySignature = 'C',
    timeSignature = [4, 4],
    clef = null,
    staffGroups = [],
    polyphonic = true,
    scale = 2.5,
    tempo = 120,
    player = null,
    onChange = () => {},
  } = {}) {
    this._container = container;
    this._keySignature = keySignature;
    this._timeSignature = timeSignature;
    this._clefOverride = clef;
    this._staffGroups = staffGroups;
    this._polyphonic = polyphonic;
    this._scale = scale;
    this._tempo = tempo;
    // Optional audio player, e.g. a resound-sound Instrument. The notation
    // library stays audio-free; the consumer injects sound. Interface:
    // `play({ data, tempo, basis })` and `stop()`. Playback still animates the
    // visual cursor (via the renderer) even when no player is supplied.
    this._player = player;
    this._playing = false;
    this._rafId = null;
    this._playbackAt = null; // { beat, voiceId } the playback cursor last showed
    this._onChange = onChange;

    // What the staff on screen shows, so a frame can skip what didn't change.
    this._revision = 0; // bumped by every edit to the notes
    this._renderedRevision = -1;
    this._decoratedSvg = null; // the renderer output the overlay was drawn on
    this._entries = {}; // voice id -> that SVG's note/rest elements
    this._shownView = null; // the selection/cursor/voice the overlay shows
    this._cursorLine = null;
    this._renderFrameId = null; // pending keyboard render
    this._engravedWidth = 0; // the staff's width when it was last engraved
    this._resized = false; // its width changed since then
    this._resizeObserver = null;
    this._revealPending = false; // scroll the cursor into sight on the next overlay

    this._isGrandStaff = staffGroups.length > 0 && staffGroups.some((g) => g.type === 'brace');

    const ts = timeSignature || [4, 4];
    this._voiceModels = this._isGrandStaff
      ? [new SongModel(ts), new SongModel(ts)]
      : [new SongModel(ts)];
    this._activeVoiceIndex = 0;

    this._loadSong(song);
    this._build();
  }

  // ── Model / voice helpers ──────────────────────────────────────────

  _activeModel() {
    return this._voiceModels[this._activeVoiceIndex];
  }

  _voiceIds() {
    return this._isGrandStaff ? GRAND_STAFF_VOICES : ['v0'];
  }

  _activeVoiceId() {
    return this._voiceIds()[this._activeVoiceIndex];
  }

  _resolveSingleClef() {
    if (this._clefOverride) return this._clefOverride;
    const notes = this._voiceModels[0].toSongArray();
    const pitched = notes.filter((e) => (Array.isArray(e) ? true : !!e.pitch));
    if (pitched.length === 0) return 'treble';
    return inferClef(pitched);
  }

  _activeClef() {
    return this._isGrandStaff
      ? GRAND_STAFF_VOICES[this._activeVoiceIndex]
      : this._resolveSingleClef();
  }

  _canonicalNotes(voiceIndex) {
    return this._voiceModels[voiceIndex].toSongArray().map(normalizeOut);
  }

  // ── Load / build JSON ──────────────────────────────────────────────

  _loadSong(song) {
    if (this._isGrandStaff && song && Array.isArray(song.voices)) {
      song.voices.forEach((voice, i) => {
        if (this._voiceModels[i]) {
          this._voiceModels[i].fromSongArray((voice.notes || []).map(normalizeIn));
        }
      });
    } else if (Array.isArray(song)) {
      this._voiceModels[0].fromSongArray(song.map(normalizeIn));
    }
  }

  /** Build the render input (voices form, explicit ids, canonical durations). */
  _buildRenderJSON() {
    const base = { keySignature: this._keySignature, timeSignature: this._timeSignature };
    if (this._isGrandStaff) {
      return {
        ...base,
        staffGroups: this._staffGroups,
        voices: [
          { id: 'treble', clef: 'treble', notes: this._canonicalNotes(0) },
          { id: 'bass', clef: 'bass', notes: this._canonicalNotes(1) },
        ],
      };
    }
    return {
      ...base,
      voices: [{ id: 'v0', clef: this._resolveSingleClef(), notes: this._canonicalNotes(0) }],
    };
  }

  /** Build the song to emit to the consumer (puzzle-JSON shape). */
  _buildOutputSong() {
    if (this._isGrandStaff) {
      return {
        voices: [
          { id: 'treble', clef: 'treble', notes: this._canonicalNotes(0) },
          { id: 'bass', clef: 'bass', notes: this._canonicalNotes(1) },
        ],
        staffGroups: JSON.parse(JSON.stringify(this._staffGroups)),
      };
    }
    return this._canonicalNotes(0);
  }

  _emitChange() {
    this._revision += 1;
    this._onChange(JSON.parse(JSON.stringify(this._buildOutputSong())));
  }

  // ── DOM build ──────────────────────────────────────────────────────

  _build() {
    this._container.innerHTML = '';

    const paletteContainer = document.createElement('div');
    // A button clicked hands the keys back to the staff (here and below):
    // left on the button, they reached nothing
    this._palette = new RhythmPalette(paletteContainer, () => this.focus());
    this._container.appendChild(paletteContainer);

    this._staffEl = document.createElement('div');
    this._staffEl.className = 'notation-staff';
    this._staffEl.tabIndex = 0; // focusable for keyboard input
    this._container.appendChild(this._staffEl);

    // The staff's width is observed here, not by the renderer: its own
    // observer re-engraves without the overlay (see _observeStaffWidth).
    this._renderer = new NotationRenderer({
      container: this._staffEl,
      scale: this._scale,
      observeContainer: false,
    });

    this._renderStaff();
    this._observeStaffWidth();

    this._staffEl.addEventListener('click', (e) => this._handleStaffClick(e));
    this._staffEl.addEventListener('keydown', (e) => this._handleKeyDown(e));

    // Transport controls.
    const controls = document.createElement('div');
    controls.className = 'playback-controls';
    const playBtn = document.createElement('button');
    playBtn.className = 'editor-btn';
    playBtn.textContent = 'Play';
    playBtn.type = 'button';
    playBtn.onclick = () => {
      this.play();
      this.focus();
    };
    const stopBtn = document.createElement('button');
    stopBtn.className = 'editor-btn';
    stopBtn.textContent = 'Stop';
    stopBtn.type = 'button';
    stopBtn.onclick = () => {
      this.stop();
      this.focus();
    };
    controls.appendChild(playBtn);
    controls.appendChild(stopBtn);
    this._container.appendChild(controls);

    // Edit controls (kept out of .playback-controls) + a shortcut legend, so
    // the note-editing commands aren't invisible.
    const editControls = document.createElement('div');
    editControls.className = 'song-edit-controls';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'editor-btn';
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = () => {
      this.clear();
      this.focus();
    };
    editControls.appendChild(clearBtn);
    this._container.appendChild(editControls);

    const hint = document.createElement('div');
    hint.className = 'song-edit-hint';
    hint.textContent = [
      'Click staff to add',
      this._polyphonic ? '⇧-click adds to the chord' : null,
      'click a note to select',
      '2–7 note (whole … 32nd)',
      'r rest',
      '←/→ move',
      '+/− transpose',
      '. dot',
      '# b n accidental',
      'Del removes',
      this._isGrandStaff ? 'Enter / ⇧Enter other staff' : null,
      'Space play/stop',
      '⌘Z undo',
    ]
      .filter(Boolean)
      .join(' · ');
    this._container.appendChild(hint);
  }

  /**
   * Give the staff the keyboard — without scrolling to it: focusing a staff
   * taller than the modal scrolled the duration palette out of sight. A
   * move or an edit scrolls the cursor itself into view.
   */
  focus() {
    if (this._staffEl && document.activeElement !== this._staffEl) {
      this._staffEl.focus({ preventScroll: true });
    }
  }

  /** Whether this is a grand staff (two staves, braced). */
  get isGrandStaff() {
    return this._isGrandStaff;
  }

  /** Which staff of a grand staff is being edited (0 treble, 1 bass; else 0). */
  get activeVoiceIndex() {
    return this._activeVoiceIndex;
  }

  /** The selected note/chord of the active staff, canonical form, or null. */
  get selectedNote() {
    const model = this._activeModel();
    const entry = model._selectedIndex === null ? null : model._notes[model._selectedIndex];
    return entry ? JSON.parse(JSON.stringify(normalizeOut(entry))) : null;
  }

  /**
   * Show `song` (an undo / redo restored it), keeping each staff's cursor
   * and selection where they were as far as the notes still reach.
   */
  setSong(song) {
    const kept = this._voiceModels.map((m) => [m._cursorPosition, m._selectedIndex]);
    this._voiceModels.forEach((m) => m.fromSongArray([]));
    this._loadSong(song || []);
    this._voiceModels.forEach((m, i) => {
      const [cursor, selected] = kept[i];
      m._cursorPosition = Math.min(cursor, m._notes.length);
      m._selectedIndex = selected !== null && selected < m._notes.length ? selected : null;
    });
    this._revision += 1;
    this._renderStaff();
  }

  /** Remove every note from the active voice. */
  clear() {
    this._activeModel().fromSongArray([]);
    this._emitChange();
    this._renderStaff();
  }

  /** Engrave the score now (and drop any pending keyboard render). */
  _renderStaff() {
    this._cancelRenderFrame();
    // The renderer fits each engraving to the staff's width at the time.
    this._engravedWidth = this._staffEl.clientWidth;
    this._resized = false;
    this._renderer.render(this._buildRenderJSON());
    this._renderedRevision = this._revision;
    const svg = this._renderer.getSvgElement();
    this._decoratedSvg = svg;
    if (!svg) return;
    this._decorate(svg);
    // A fresh SVG has no playback highlight; until the next playback frame
    // re-lights it, show the note it was on.
    if (this._playing && this._playbackAt) {
      const { beat, voiceId } = this._playbackAt;
      this._renderer.setPlaybackPosition(beat, { voiceId });
    }
  }

  /** Bring the staff up to date on the next animation frame (keyboard input). */
  _requestRender() {
    if (this._renderFrameId != null) return;
    if (typeof requestAnimationFrame !== 'function') {
      this._flushRender();
      return;
    }
    this._renderFrameId = requestAnimationFrame(() => {
      this._renderFrameId = null;
      this._flushRender();
    });
  }

  /**
   * Bring the staff up to date now, doing only what changed: re-engrave after
   * an edit or a change of the staff's width, redraw the overlay after a
   * selection/cursor/voice move, nothing otherwise.
   */
  _flushRender() {
    this._cancelRenderFrame();
    const svg = this._renderer.getSvgElement();
    if (!svg || this._resized || this._revision !== this._renderedRevision) {
      this._renderStaff();
    } else if (this._viewKey() !== this._shownView) {
      this._drawSelection();
    }
  }

  /**
   * Re-engrave when the staff's width changes. The renderer's own observer
   * re-engraved WITHOUT the overlay — the selection and cursor vanished and
   * a click on a note appended one, until the next key — so the editor
   * watches the width itself and re-engraves through the keyboard path:
   * decorated, at most once a frame. A change under 2 px is observer noise
   * (sub-pixel layout jitter), skipped as the renderer skipped it.
   */
  _observeStaffWidth() {
    if (typeof ResizeObserver === 'undefined') return;
    this._resizeObserver = new ResizeObserver(() => {
      const width = this._staffEl.clientWidth;
      if (!width || Math.abs(width - this._engravedWidth) < 2) return;
      this._resized = true;
      this._requestRender();
    });
    this._resizeObserver.observe(this._staffEl);
  }

  _cancelRenderFrame() {
    if (this._renderFrameId == null) return;
    cancelAnimationFrame(this._renderFrameId);
    this._renderFrameId = null;
  }

  /** The overlay's inputs: active voice, its selection and its cursor. */
  _viewKey() {
    const model = this._activeModel();
    return `${this._activeVoiceIndex}:${model._selectedIndex}:${model._cursorPosition}`;
  }

  // ── Interaction overlay ────────────────────────────────────────────

  /**
   * The note/chord/rest elements of a voice, in document order, each with its
   * staff-local X and the staff group (system) it sits in — a long song
   * wraps onto several systems, one group per voice each. Document order matches the model's flat note order (the
   * editor emits no tuplets or markers), so this indexes rests correctly —
   * which the renderer's playback metrics deliberately do not.
   */
  _voiceEntries(svg, voiceId) {
    const entries = [];
    svg.querySelectorAll(`[data-voice-id="${voiceId}"]`).forEach((group) => {
      group.querySelectorAll('.note, .rest').forEach((el) => {
        entries.push({ el, x: this._elX(el), group });
      });
    });
    return entries;
  }

  /** Staff-local X from an element's `translate(x, y)` transform. */
  _elX(el) {
    const t = (el.getAttribute && el.getAttribute('transform')) || '';
    const m = t.match(/translate\(\s*([-\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  }

  _decorate(svg) {
    // Stamp a document-order index and wire click-to-select on every voice's
    // notes/chords/rests, so selection maps back to the exact model position.
    this._entries = {};
    this._voiceIds().forEach((vid) => {
      const entries = this._voiceEntries(svg, vid);
      this._entries[vid] = entries;
      entries.forEach(({ el }, idx) => {
        el.setAttribute('data-note-index', String(idx));
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const vIndex = this._voiceIds().indexOf(vid);
          if (vIndex >= 0) this._activeVoiceIndex = vIndex;
          const m = this._activeModel();
          m._selectedIndex = idx;
          m._cursorPosition = idx;
          this._flushRender();
        });
      });
    });

    this._cursorLine = null;
    this._drawSelection();
  }

  /**
   * The selection highlight and edit cursor of the active voice, replacing
   * the ones drawn before — so a move redraws them without re-engraving, and
   * the result is the same DOM a full render would leave.
   */
  _drawSelection() {
    const svg = this._decoratedSvg;
    svg.querySelectorAll('.note-selected').forEach((el) => el.classList.remove('note-selected'));
    if (this._cursorLine) this._cursorLine.remove();
    this._cursorLine = null;

    const activeId = this._activeVoiceId();
    const model = this._activeModel();
    const entries = this._entries[activeId] || [];

    // Selection highlight.
    if (model._selectedIndex !== null && entries[model._selectedIndex]) {
      entries[model._selectedIndex].el.classList.add('note-selected');
    }

    // Edit cursor: a vertical line at the insertion point in the active voice,
    // on the system (line of music) the insertion point is on.
    const group = this._cursorGroup(svg, entries, model._cursorPosition, activeId);
    if (group) {
      const cursorX = this._cursorX(entries, model._cursorPosition);
      const cursor = document.createElementNS(SVG_NS, 'line');
      cursor.setAttribute('x1', cursorX);
      cursor.setAttribute('y1', '-4');
      cursor.setAttribute('x2', cursorX);
      cursor.setAttribute('y2', '104');
      cursor.setAttribute('class', 'cursor-line');
      cursor.setAttribute('stroke', '#44ff88');
      cursor.setAttribute('stroke-width', '2');
      cursor.setAttribute('opacity', '0.6');
      group.appendChild(cursor);
      this._cursorLine = cursor;
    }
    this._shownView = this._viewKey();
    if (this._revealPending) this._revealCursor(entries, model._selectedIndex);
  }

  /** The staff group (system) of the active voice the cursor is drawn on. */
  _cursorGroup(svg, entries, cursorPosition, voiceId) {
    if (entries[cursorPosition]) return entries[cursorPosition].group;
    if (entries.length) return entries[entries.length - 1].group; // past the final note
    return svg.querySelector(`[data-voice-id="${voiceId}"]`);
  }

  /**
   * Scroll the edit cursor (else the selected note) into sight after the
   * user moved or edited: a long song wraps onto systems below the modal's
   * fold. The cursor spans its whole staff, so the staff comes into view.
   */
  _revealCursor(entries, selectedIndex) {
    this._revealPending = false;
    const target = this._cursorLine || (entries[selectedIndex] && entries[selectedIndex].el);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /**
   * Convert a click event to a staff-local Y in the given staff group's
   * coordinate space. Uses the SVG CTM in real browsers (handles scale and
   * translate exactly); falls back to viewBox + bounding-rect math minus the
   * staff group's translate offset where the CTM API is unavailable (e.g.
   * jsdom). Returns null if no mapping can be derived.
   */
  _clickToStaffY(e, svg, group) {
    if (typeof svg.createSVGPoint === 'function' && typeof group.getScreenCTM === 'function') {
      const ctm = group.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        return pt.matrixTransform(ctm.inverse()).y;
      }
    }
    const rect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
    if (!rect) return null;
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const scaleY = vb && vb.height && rect.height ? vb.height / rect.height : 1;
    const svgY = (e.clientY - rect.top) * scaleY;
    return svgY - this._groupTranslateY(group);
  }

  /** Parse the `translate(x, y)` Y offset from a staff group's transform. */
  _groupTranslateY(group) {
    const transform = group.getAttribute && group.getAttribute('transform');
    const match = transform && transform.match(/translate\(\s*[-\d.]+\s*,\s*([-\d.]+)\s*\)/);
    return match ? parseFloat(match[1]) : 0;
  }

  /** Staff-local X for the cursor at the given position among voice entries. */
  _cursorX(entries, cursorPosition) {
    if (entries.length === 0) return 30;
    if (entries[cursorPosition]) return entries[cursorPosition].x - 12; // insertion point
    return entries[entries.length - 1].x + 24; // past the final note
  }

  _handleStaffClick(e) {
    const svg = this._renderer.getSvgElement();
    if (!svg) return;
    // Clicks on a note are handled by the per-note select handler.
    if (e.target.closest('[data-note-index]')) return;

    // The system (line of music) clicked: of the active voice's staff
    // groups, the one whose middle line is nearest the click.
    const activeId = this._activeVoiceId();
    let localY = null;
    svg.querySelectorAll(`[data-voice-id="${activeId}"]`).forEach((group) => {
      const y = this._clickToStaffY(e, svg, group);
      if (y === null) return;
      if (localY === null || Math.abs(y - STAFF_MIDDLE_Y) < Math.abs(localY - STAFF_MIDDLE_Y)) {
        localY = y;
      }
    });
    if (localY === null) return;

    const model = this._activeModel();
    this._revealPending = true;
    const note = createNoteFromClick(localY, this._palette.activeLength, this._activeClef());

    if (e.shiftKey && model._selectedIndex !== null && this._polyphonic) {
      model.makeChord(model._selectedIndex, note.pitch, note.length);
    } else {
      model.appendNote(note.pitch, note.length);
      model._selectedIndex = model._notes.length - 1;
    }

    this._emitChange();
    this._renderStaff();
  }

  /**
   * The cursor sits just after the selected note — where entering a note
   * leaves it (the new note selected for ↑/↓, the next one going after it).
   */
  _isEntering(model) {
    return model._selectedIndex !== null && model._cursorPosition === model._selectedIndex + 1;
  }

  /**
   * Enter an entry (a note, else a rest) of `length` at the cursor, select
   * it and leave the cursor after it, so the next entry follows it.
   */
  _enter(model, pitch, length) {
    if (model._cursorPosition >= model._notes.length) {
      if (pitch) model.appendNote(pitch, length);
      else model.appendRest(length);
    } else {
      if (pitch) model.insertNote(pitch, length);
      else model.insertRest(length);
      model.advanceCursor();
    }
    model._selectedIndex = model._cursorPosition - 1;
    this._emitChange();
  }

  _handleKeyDown(e) {
    // Shortcuts of the browser / OS and the modal's (⌘Z) are not the staff's:
    // Cmd+R must not also enter a rest, Cmd+B a flat.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const model = this._activeModel();
    this._revealPending = true;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        model.moveCursor('left');
        model._selectedIndex =
          model._cursorPosition < model._notes.length
            ? model._cursorPosition
            : model._selectedIndex;
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (this._isEntering(model) && model._cursorPosition < model._notes.length) {
          // Just after the selected note: the next note is the one at the cursor
          model._selectedIndex = model._cursorPosition;
          break;
        }
        model.moveCursor('right');
        model._selectedIndex =
          model._cursorPosition < model._notes.length ? model._cursorPosition : null;
        break;
      case '+':
      case '=':
        if (model._selectedIndex !== null) {
          model.transposeUp(model._selectedIndex);
          this._emitChange();
        }
        break;
      case '-':
        if (model._selectedIndex !== null) {
          model.transposeDown(model._selectedIndex);
          this._emitChange();
        }
        break;
      case '.':
        if (model._selectedIndex !== null) {
          model.toggleDot(model._selectedIndex);
          this._emitChange();
        }
        break;
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        let removed = false;
        if (model._selectedIndex !== null) {
          const index = model._selectedIndex;
          const entering = this._isEntering(model);
          model.removeNote(index);
          if (model._notes.length === 0) {
            model._selectedIndex = null;
          } else if (entering) {
            // The note just entered: take it back, as a backspace would
            model._cursorPosition = index;
            model._selectedIndex = index > 0 ? index - 1 : 0;
          } else if (model._selectedIndex >= model._notes.length) {
            model._selectedIndex = model._notes.length - 1;
          }
          removed = true;
        } else if (model._cursorPosition > 0) {
          // Nothing selected: behave like a text-editor backspace and drop the
          // note just before the cursor.
          model.removeNote(model._cursorPosition - 1);
          model.moveCursor('left');
          removed = true;
        }
        if (removed) this._emitChange();
        break;
      }
      case '#':
        if (model._selectedIndex !== null) {
          model.setAccidental(model._selectedIndex, '#');
          this._emitChange();
        }
        break;
      case 'b':
        if (model._selectedIndex !== null) {
          model.setAccidental(model._selectedIndex, 'b');
          this._emitChange();
        }
        break;
      case 'n':
        if (model._selectedIndex !== null) {
          model.setAccidental(model._selectedIndex, '');
          this._emitChange();
        }
        break;
      case 'r':
        this._enter(model, null, this._palette.activeLength);
        break;
      case ' ':
        // Play / stop, as in notation programs (and the controller's △)
        e.preventDefault();
        if (this._playing) this.stop();
        else this.play();
        break;
      case 'Enter':
        if (this._isGrandStaff) {
          e.preventDefault();
          this._activeVoiceIndex = e.shiftKey
            ? Math.max(0, this._activeVoiceIndex - 1)
            : Math.min(this._voiceModels.length - 1, this._activeVoiceIndex + 1);
        }
        break;
      default: {
        // A duration key enters a note of it and makes it the chosen
        // duration (the palette's, which ✕ and r use), as its button does
        const length = this._palette.handleKeyPress(e.key);
        if (length) this._enter(model, this._entryPitch(model), length);
        break;
      }
    }

    this._requestRender();
  }

  /**
   * The pitch a new note takes: the selected note's, else that of the last
   * note before the cursor (skipping rests), else C4.
   */
  _entryPitch(model) {
    const pitchOf = (entry) => (Array.isArray(entry) ? entry[0].pitch : entry && entry.pitch);
    if (model._selectedIndex !== null) {
      const selected = pitchOf(model._notes[model._selectedIndex]);
      if (selected) return selected;
    }
    const from = Math.min(model._cursorPosition, model._notes.length) - 1;
    for (let i = from; i >= 0; i -= 1) {
      const pitch = pitchOf(model._notes[i]);
      if (pitch) return pitch;
    }
    return 'C4';
  }

  // ── Playback ───────────────────────────────────────────────────────

  /**
   * Play the active voice: sound through the injected player (if any) and a
   * visual cursor via the renderer. Quarter note = one beat (basis 4), so the
   * audio and the cursor share a timebase. Restarts if already playing.
   */
  play() {
    if (this._playing) this.stop();
    const data = this._activeModel().toSongArray();
    if (!data.length) return;
    this._playing = true;

    if (this._player && typeof this._player.play === 'function') {
      try {
        this._player.play({ data, tempo: this._tempo, basis: 4 });
      } catch {
        // Audio is optional; a player failure must not break the editor.
      }
    }

    this._animateCursor(data);
  }

  /** Whether Play is sounding the song now. */
  get isPlaying() {
    return this._playing;
  }

  /** Stop audio and the playback cursor. */
  stop() {
    this._playing = false;
    this._playbackAt = null;
    if (this._rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    if (this._player && typeof this._player.stop === 'function') {
      try {
        this._player.stop();
      } catch {
        // ignore
      }
    }
    if (this._renderer) this._renderer.setPlaybackPosition(null);
  }

  /** Drive the renderer's playback cursor across the song in real time. */
  _animateCursor(data) {
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    if (!raf) return; // no animation host (e.g. jsdom); audio still plays
    const now = () =>
      typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    const totalBeats = data.reduce(
      (sum, e) => sum + fractionToQuarterBeats(Array.isArray(e) ? e[0].length : e.length),
      0
    );
    const activeId = this._activeVoiceId();
    const beatsPerMs = this._tempo / 60 / 1000;
    const start = now();
    const step = () => {
      if (!this._playing) return;
      const beat = (now() - start) * beatsPerMs;
      if (beat >= totalBeats) {
        this.stop();
        return;
      }
      this._playbackAt = { beat, voiceId: activeId };
      if (this._renderer) this._renderer.setPlaybackPosition(beat, { voiceId: activeId });
      this._rafId = raf(step);
    };
    this._rafId = raf(step);
  }

  /**
   * Switch single-staff clef at runtime (Auto -> null). Re-renders.
   * @param {string|null} clef
   */
  setClef(clef) {
    this._clefOverride = clef;
    this._renderStaff();
  }

  dispose() {
    this.stop();
    this._cancelRenderFrame();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._renderer) this._renderer.clear();
    if (this._container) this._container.innerHTML = '';
  }
}
