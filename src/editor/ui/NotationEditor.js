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
import RhythmPalette, { DURATIONS } from 'editor/ui/RhythmPalette';
import { createNoteFromClick } from 'editor/ui/staffCoords';
import { inferClef } from 'resound-notation/lib/clefInference';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRAND_STAFF_VOICES = ['treble', 'bass'];

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
    this._onChange = onChange;

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
    this._onChange(JSON.parse(JSON.stringify(this._buildOutputSong())));
  }

  // ── DOM build ──────────────────────────────────────────────────────

  _build() {
    this._container.innerHTML = '';

    const paletteContainer = document.createElement('div');
    this._palette = new RhythmPalette(paletteContainer, () => {});
    this._container.appendChild(paletteContainer);

    this._staffEl = document.createElement('div');
    this._staffEl.className = 'notation-staff';
    this._staffEl.tabIndex = 0; // focusable for keyboard input
    this._container.appendChild(this._staffEl);

    this._renderer = new NotationRenderer({ container: this._staffEl, scale: this._scale });

    this._renderStaff();

    this._staffEl.addEventListener('click', (e) => this._handleStaffClick(e));
    this._staffEl.addEventListener('keydown', (e) => this._handleKeyDown(e));

    // Transport controls.
    const controls = document.createElement('div');
    controls.className = 'playback-controls';
    const playBtn = document.createElement('button');
    playBtn.className = 'editor-btn';
    playBtn.textContent = 'Play';
    playBtn.type = 'button';
    playBtn.onclick = () => this.play();
    const stopBtn = document.createElement('button');
    stopBtn.className = 'editor-btn';
    stopBtn.textContent = 'Stop';
    stopBtn.type = 'button';
    stopBtn.onclick = () => this.stop();
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
    clearBtn.onclick = () => this.clear();
    editControls.appendChild(clearBtn);
    this._container.appendChild(editControls);

    const hint = document.createElement('div');
    hint.className = 'song-edit-hint';
    hint.textContent =
      'Click staff to add · click a note to select · Del removes · +/− transpose · . dot · # ♭ n accidental · r rest · ←/→ move';
    this._container.appendChild(hint);
  }

  /** Remove every note from the active voice. */
  clear() {
    this._activeModel().fromSongArray([]);
    this._emitChange();
    this._renderStaff();
  }

  _renderStaff() {
    this._renderer.render(this._buildRenderJSON());
    const svg = this._renderer.getSvgElement();
    if (svg) this._decorate(svg);
  }

  // ── Interaction overlay ────────────────────────────────────────────

  /**
   * The note/chord/rest elements of a voice, in document order, each with its
   * staff-local X. Document order matches the model's flat note order (the
   * editor emits no tuplets or markers), so this indexes rests correctly —
   * which the renderer's playback metrics deliberately do not.
   */
  _voiceEntries(svg, voiceId) {
    const entries = [];
    svg.querySelectorAll(`[data-voice-id="${voiceId}"]`).forEach((group) => {
      group.querySelectorAll('.note, .rest').forEach((el) => {
        entries.push({ el, x: this._elX(el) });
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
    const activeId = this._activeVoiceId();
    const model = this._activeModel();

    // Stamp a document-order index and wire click-to-select on every voice's
    // notes/chords/rests, so selection maps back to the exact model position.
    const voiceEntries = {};
    this._voiceIds().forEach((vid) => {
      const entries = this._voiceEntries(svg, vid);
      voiceEntries[vid] = entries;
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
          this._renderStaff();
        });
      });
    });

    const entries = voiceEntries[activeId] || [];

    // Selection highlight.
    if (model._selectedIndex !== null && entries[model._selectedIndex]) {
      entries[model._selectedIndex].el.classList.add('note-selected');
    }

    // Edit cursor: a vertical line at the insertion point in the active voice.
    const group = svg.querySelector(`[data-voice-id="${activeId}"]`);
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

    const activeId = this._activeVoiceId();
    const group = svg.querySelector(`[data-voice-id="${activeId}"]`);
    if (!group) return;
    const localY = this._clickToStaffY(e, svg, group);
    if (localY === null) return;

    const model = this._activeModel();
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

  _handleKeyDown(e) {
    const model = this._activeModel();
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
          model.removeNote(model._selectedIndex);
          if (model._notes.length === 0) {
            model._selectedIndex = null;
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
      case 'r': {
        const restLength = this._palette.activeLength;
        if (model._cursorPosition >= model._notes.length) {
          model.appendRest(restLength);
          model._selectedIndex = model._notes.length - 1;
        } else {
          model.insertRest(restLength);
          model._selectedIndex = model._cursorPosition;
        }
        this._emitChange();
        break;
      }
      case 'Enter':
        if (this._isGrandStaff) {
          e.preventDefault();
          this._activeVoiceIndex = e.shiftKey
            ? Math.max(0, this._activeVoiceIndex - 1)
            : Math.min(this._voiceModels.length - 1, this._activeVoiceIndex + 1);
        }
        break;
      default: {
        const dur = DURATIONS.find((d) => d.key === e.key);
        if (dur) {
          const pitch = this._selectedPitch(model);
          if (model._cursorPosition >= model._notes.length) {
            model.appendNote(pitch, dur.length);
            model._selectedIndex = model._notes.length - 1;
          } else {
            model.insertNote(pitch, dur.length);
            model._selectedIndex = model._cursorPosition;
          }
          this._emitChange();
        }
        break;
      }
    }

    this._renderStaff();
  }

  _selectedPitch(model) {
    if (model._selectedIndex === null) return 'C4';
    const selected = model._notes[model._selectedIndex];
    if (Array.isArray(selected)) return selected[0].pitch || 'C4';
    return selected.pitch || 'C4';
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

  /** Stop audio and the playback cursor. */
  stop() {
    this._playing = false;
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
    if (this._renderer) this._renderer.clear();
    if (this._container) this._container.innerHTML = '';
  }
}
