/**
 * NotationEditor
 *
 * Main controller that brings together SongModel, StaffInteraction,
 * RhythmPalette, and renders an interactive SVG staff for song editing.
 *
 * Uses the shared notation component system for rendering with full
 * musical context: clef, key/time signature, accidentals, ledger lines,
 * and rest support.
 */
import SongModel from 'editor/model/SongModel';
import RhythmPalette, { DURATIONS } from 'editor/ui/RhythmPalette';
import { createNoteFromClick, calculateBarlines } from 'editor/ui/StaffInteraction';

import { createNote } from 'notation/components/Note';
import { createStaffLines } from 'notation/components/Staff';
import { createBarLine } from 'notation/components/BarLine';
import { createClef } from 'notation/components/Clef';
import { createKeySignature } from 'notation/components/KeySignature';
import { createTimeSignature } from 'notation/components/TimeSignature';
import { createAccidental } from 'notation/components/Accidental';
import { createLedgerLines } from 'notation/components/LedgerLine';
import { createRest } from 'notation/components/Rest';
import { pitchToStaffY } from 'notation/lib/notePositions';
import { getDurationInfo } from 'notation/lib/durationSymbols';
import { getKeySignature } from 'notation/lib/keySignatures';
import { inferClef } from 'notation/lib/clefInference';
import { createGroup, createEllipse, createLine } from 'notation/lib/svgHelpers';
import { resolveAccidentalDisplay } from 'editor/ui/AccidentalDisplay';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Layout constants
const STAFF_START_X = 20;
const STAFF_TOP_OFFSET = 10;
const CLEF_WIDTH = 45;
const KEY_SIG_ACCIDENTAL_WIDTH = 10;
const TIME_SIG_WIDTH = 25;
const HEADER_PADDING = 5;
const ACCIDENTAL_OFFSET = 14;
const MIN_SVG_WIDTH = 300;

// Note head dimensions (matching Note.js)
const HEAD_RX = 6;
const HEAD_RY = 5;
const STEM_LENGTH = 35;
const MIDDLE_LINE_Y = 50;

/**
 * Safely get duration info, falling back for dotted durations.
 * @param {string} length - fraction string
 * @returns {Object} duration info object
 */
function safeDurationInfo(length) {
  try {
    return getDurationInfo(length);
  } catch {
    // For dotted durations like '3/8', fall back to base duration
    const [, den] = length.split('/').map(Number);
    const baseDen = (den * 2) / 3;
    const baseLength = `1/${baseDen}`;
    try {
      return getDurationInfo(baseLength);
    } catch {
      // Ultimate fallback: quarter note info
      return getDurationInfo('1/4');
    }
  }
}

/**
 * Get the first note object from an entry (handles chords and single notes).
 */
function entryNoteObj(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

export default class NotationEditor {
  constructor(
    container,
    undoManager,
    entityId,
    { polyphonic = true, keySignature = 'C', timeSignature = [4, 4], clef = null } = {}
  ) {
    this._container = container;
    this._undoManager = undoManager;
    this._entityId = entityId;
    this._polyphonic = polyphonic;
    this._keySignature = keySignature;
    this._timeSignature = timeSignature;
    this._clefOverride = clef;
    this._currentClef = 'treble';
    this._songModel = new SongModel(timeSignature || [4, 4]);
    this._palette = null;
    this._staffEl = null;

    this._loadSong();
    this._render();
  }

  _loadSong() {
    const entity = this._undoManager.getEntity(this._entityId);
    if (entity && entity.data && entity.data.song) {
      this._songModel.fromSongArray(JSON.parse(JSON.stringify(entity.data.song)));
    }
  }

  _saveSong() {
    const entity = this._undoManager.getEntity(this._entityId);
    if (!entity) return;
    const newData = {
      ...entity.data,
      song: JSON.parse(JSON.stringify(this._songModel.toSongArray())),
    };
    this._undoManager.updateEntity(this._entityId, { data: newData });
  }

  _render() {
    this._container.innerHTML = '';

    // Rhythm palette
    const paletteContainer = document.createElement('div');
    this._palette = new RhythmPalette(paletteContainer, () => {
      // Duration selected from palette -- no additional action needed
    });
    this._container.appendChild(paletteContainer);

    // Staff SVG area
    this._staffEl = document.createElement('div');
    this._staffEl.className = 'notation-staff';
    this._staffEl.tabIndex = 0; // Make focusable for keyboard input
    this._container.appendChild(this._staffEl);

    // Render the notation
    this._renderStaff();

    // Staff click handler
    this._staffEl.addEventListener('click', (e) => this._handleStaffClick(e));
    this._staffEl.addEventListener('keydown', (e) => this._handleKeyDown(e));

    // Playback controls
    const controls = document.createElement('div');
    controls.className = 'playback-controls';
    const playBtn = document.createElement('button');
    playBtn.className = 'editor-btn';
    playBtn.textContent = 'Play';
    playBtn.onclick = () => this._play();
    const stopBtn = document.createElement('button');
    stopBtn.className = 'editor-btn';
    stopBtn.textContent = 'Stop';
    stopBtn.onclick = () => this._stop();
    controls.appendChild(playBtn);
    controls.appendChild(stopBtn);
    this._container.appendChild(controls);
  }

  /**
   * Resolve the clef to use based on override and song content.
   */
  _resolveClef(song) {
    if (this._clefOverride) return this._clefOverride;
    if (song.length === 0) return 'treble';
    // Filter out rests for clef inference
    const pitched = song.filter((entry) => {
      if (Array.isArray(entry)) return true;
      return !!entry.pitch;
    });
    if (pitched.length === 0) return 'treble';
    return inferClef(pitched);
  }

  _renderStaff() {
    const notes = this._songModel.toSongArray();

    this._staffEl.innerHTML = '';

    // Resolve clef
    this._currentClef = this._resolveClef(notes);

    // Key signature info
    const keyInfo = getKeySignature(this._keySignature);

    // Calculate header width
    let headerX = STAFF_START_X;
    const clefX = headerX;
    headerX += CLEF_WIDTH;

    const keySigX = headerX;
    if (keyInfo.count > 0) {
      headerX += keyInfo.count * KEY_SIG_ACCIDENTAL_WIDTH + HEADER_PADDING;
    }

    const timeSigX = headerX;
    if (this._timeSignature) {
      headerX += TIME_SIG_WIDTH + HEADER_PADDING;
    }

    const noteStartX = headerX + HEADER_PADDING;

    // Calculate barline positions (no barlines in unmetered mode)
    const barlinePositions = this._timeSignature
      ? calculateBarlines(notes, this._timeSignature)
      : [];
    const barlineSet = new Set(barlinePositions);

    // Calculate total width based on notes
    let totalNotesWidth = 0;
    for (const entry of notes) {
      totalNotesWidth += safeDurationInfo(entryNoteObj(entry).length).spacing;
    }

    const svgWidth = Math.max(MIN_SVG_WIDTH, noteStartX + totalNotesWidth + 40);

    // Create SVG
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('viewBox', `0 0 ${svgWidth} 200`);
    svg.style.background = '#0a1628';

    // Staff group with offset
    const staffGroup = createGroup('staff-group', {
      transform: `translate(0, ${STAFF_TOP_OFFSET})`,
    });

    // Staff lines
    const staffLines = createStaffLines(svgWidth - 20);
    staffGroup.appendChild(staffLines);

    // Clef
    const clefEl = createClef(this._currentClef);
    clefEl.setAttribute('transform', `translate(${clefX}, 0)`);
    staffGroup.appendChild(clefEl);

    // Key signature (non-C keys only)
    if (keyInfo.count > 0) {
      const keySigEl = createKeySignature(this._keySignature, this._currentClef);
      if (keySigEl) {
        keySigEl.setAttribute('transform', `translate(${keySigX}, 0)`);
        staffGroup.appendChild(keySigEl);
      }
    }

    // Time signature
    if (this._timeSignature) {
      const timeSigEl = createTimeSignature(this._timeSignature);
      timeSigEl.setAttribute('transform', `translate(${timeSigX}, 0)`);
      staffGroup.appendChild(timeSigEl);
    }

    // Render notes with accidental display logic
    const activeAccidentals = new Map();
    let xPos = noteStartX;

    for (let i = 0; i < notes.length; i += 1) {
      const entry = notes[i];

      // Check if barline needed before this note (reset accidentals)
      if (barlineSet.has(i)) {
        activeAccidentals.clear();
      }

      const isRest = !Array.isArray(entry) && !entry.pitch;
      const isChord = Array.isArray(entry);
      const info = safeDurationInfo(entryNoteObj(entry).length);
      const isSelected = i === this._songModel._selectedIndex;

      if (isRest) {
        // Render rest
        const restEl = this._renderRestEntry(entry, xPos, i, isSelected);
        staffGroup.appendChild(restEl);
        // Rests do NOT reset accidental memory
      } else if (isChord) {
        // Render chord
        const chordEl = this._renderChordEntry(
          entry,
          xPos,
          i,
          isSelected,
          activeAccidentals,
          keyInfo
        );
        staffGroup.appendChild(chordEl);
      } else {
        // Render single note
        const noteEl = this._renderSingleNote(
          entry,
          xPos,
          i,
          isSelected,
          activeAccidentals,
          keyInfo
        );
        staffGroup.appendChild(noteEl);
      }

      // In unmetered mode (null time signature), reset accidentals after each note
      if (!this._timeSignature && !isRest) {
        activeAccidentals.clear();
      }

      xPos += info.spacing;
    }

    // Render barlines
    for (const pos of barlinePositions) {
      // Calculate x position: sum note spacing up to the barline position
      let barX = noteStartX;
      for (let j = 0; j < pos && j < notes.length; j += 1) {
        barX += safeDurationInfo(entryNoteObj(notes[j]).length).spacing;
      }
      staffGroup.appendChild(createBarLine(barX));
    }

    // Cursor line
    let cursorX = noteStartX;
    for (let j = 0; j < this._songModel._cursorPosition && j < notes.length; j += 1) {
      cursorX += safeDurationInfo(entryNoteObj(notes[j]).length).spacing;
    }
    const cursor = createLine(cursorX, 0, cursorX, 80, {
      class: 'cursor-line',
      stroke: '#44ff88',
      'stroke-width': '2',
      opacity: '0.6',
    });
    staffGroup.appendChild(cursor);

    svg.appendChild(staffGroup);
    this._staffEl.appendChild(svg);
  }

  /**
   * Render a single note entry.
   */
  _renderSingleNote(entry, xPos, index, isSelected, activeAccidentals, keyInfo) {
    const wrapper = createGroup(null);

    let noteEl;
    try {
      noteEl = createNote({
        pitch: entry.pitch,
        length: entry.length,
        x: xPos,
        clef: this._currentClef,
      });
    } catch {
      // Fallback for dotted durations: use base duration for rendering
      noteEl = createNote({
        pitch: entry.pitch,
        length: '1/4',
        x: xPos,
        clef: this._currentClef,
      });
    }

    noteEl.setAttribute('data-index', index);
    noteEl.style.cursor = 'pointer';
    if (isSelected) {
      noteEl.classList.add('note-selected');
    }

    // Click handler for note selection
    noteEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this._songModel._selectedIndex = index;
      this._songModel._cursorPosition = index;
      this._renderStaff();
    });

    wrapper.appendChild(noteEl);

    // Accidental display
    const accResult = resolveAccidentalDisplay(entry.pitch, activeAccidentals, keyInfo);
    if (accResult.display) {
      const accEl = createAccidental(accResult.type);
      const accNoteY = pitchToStaffY(entry.pitch, this._currentClef);
      accEl.setAttribute('transform', `translate(${xPos - ACCIDENTAL_OFFSET}, ${accNoteY})`);
      accEl.classList.add('note-accidental');
      wrapper.appendChild(accEl);
    }

    // Ledger lines
    const noteY = pitchToStaffY(entry.pitch, this._currentClef);
    const ledgerEl = createLedgerLines({ x: xPos, y: noteY });
    if (ledgerEl) {
      wrapper.appendChild(ledgerEl);
    }

    return wrapper;
  }

  /**
   * Render a chord entry (array of notes).
   */
  _renderChordEntry(entry, xPos, index, isSelected, activeAccidentals, keyInfo) {
    const chordGroup = createGroup('chord note');
    chordGroup.setAttribute('data-index', index);
    chordGroup.style.cursor = 'pointer';

    if (isSelected) {
      chordGroup.classList.add('note-selected');
    }

    // Click handler for chord selection
    chordGroup.addEventListener('click', (e) => {
      e.stopPropagation();
      this._songModel._selectedIndex = index;
      this._songModel._cursorPosition = index;
      this._renderStaff();
    });

    const firstNote = entry[0];
    const info = safeDurationInfo(firstNote.length);

    // Compute Y positions for all notes
    const noteYs = entry.map((n) => pitchToStaffY(n.pitch, this._currentClef));

    // Determine stem direction: note furthest from middle line determines
    let maxDist = 0;
    let stemDown = true;
    for (const y of noteYs) {
      const dist = Math.abs(y - MIDDLE_LINE_Y);
      if (dist >= maxDist) {
        maxDist = dist;
        stemDown = y <= MIDDLE_LINE_Y;
      }
    }

    // Render note heads
    for (let j = 0; j < entry.length; j += 1) {
      const n = entry[j];
      const y = noteYs[j];
      const fill = info.filledHead ? 'currentColor' : 'none';
      const head = createEllipse(xPos, y, HEAD_RX, HEAD_RY, {
        class: 'note-head',
        fill,
        stroke: 'currentColor',
      });
      chordGroup.appendChild(head);

      // Accidental display for each chord note
      const accResult = resolveAccidentalDisplay(n.pitch, activeAccidentals, keyInfo);
      if (accResult.display) {
        const accEl = createAccidental(accResult.type);
        accEl.setAttribute('transform', `translate(${xPos - ACCIDENTAL_OFFSET}, ${y})`);
        accEl.classList.add('note-accidental');
        chordGroup.appendChild(accEl);
      }

      // Ledger lines for each chord note
      const ledgerEl = createLedgerLines({ x: xPos, y });
      if (ledgerEl) {
        chordGroup.appendChild(ledgerEl);
      }
    }

    // Single shared stem
    if (info.hasStem) {
      const minY = Math.min(...noteYs);
      const maxY = Math.max(...noteYs);
      const stemX = stemDown ? xPos - HEAD_RX : xPos + HEAD_RX;
      const stemY1 = stemDown ? minY : maxY;
      const stemY2 = stemDown ? maxY + STEM_LENGTH : minY - STEM_LENGTH;
      chordGroup.appendChild(
        createLine(stemX, stemY1, stemX, stemY2, { class: 'note-stem', stroke: 'currentColor' })
      );
    }

    return chordGroup;
  }

  /**
   * Render a rest entry.
   */
  _renderRestEntry(entry, xPos, index, isSelected) {
    let restEl;
    try {
      restEl = createRest({ length: entry.length, x: xPos });
    } catch {
      // Fallback for dotted durations
      restEl = createRest({ length: '1/4', x: xPos });
    }

    restEl.setAttribute('data-index', index);
    restEl.style.cursor = 'pointer';

    if (isSelected) {
      restEl.classList.add('note-selected');
    }

    // Click handler for rest selection
    restEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this._songModel._selectedIndex = index;
      this._songModel._cursorPosition = index;
      this._renderStaff();
    });

    return restEl;
  }

  _handleStaffClick(e) {
    const svg = this._staffEl.querySelector('svg');
    if (!svg) return;

    // Check if the click was on a note/rest element (handled by element click)
    if (e.target.closest('[data-index]')) return;

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleY = viewBox.height / rect.height;
    const svgY = (e.clientY - rect.top) * scaleY;

    if (e.shiftKey && this._songModel._selectedIndex !== null && this._polyphonic) {
      // Chord building
      const note = createNoteFromClick(svgY, this._palette.activeLength, this._currentClef);
      this._songModel.makeChord(this._songModel._selectedIndex, note.pitch, note.length);
    } else {
      // Normal note placement
      const note = createNoteFromClick(svgY, this._palette.activeLength, this._currentClef);
      this._songModel.appendNote(note.pitch, note.length);
      this._songModel._selectedIndex = this._songModel._notes.length - 1;
    }

    this._saveSong();
    this._renderStaff();
  }

  _handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this._songModel.moveCursor('left');
        if (this._songModel._cursorPosition < this._songModel._notes.length) {
          this._songModel._selectedIndex = this._songModel._cursorPosition;
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._songModel.moveCursor('right');
        if (this._songModel._cursorPosition < this._songModel._notes.length) {
          this._songModel._selectedIndex = this._songModel._cursorPosition;
        } else {
          this._songModel._selectedIndex = null;
        }
        break;
      case '+':
      case '=':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.transposeUp(this._songModel._selectedIndex);
          this._saveSong();
        }
        break;
      case '-':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.transposeDown(this._songModel._selectedIndex);
          this._saveSong();
        }
        break;
      case '.':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.toggleDot(this._songModel._selectedIndex);
          this._saveSong();
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (this._songModel._selectedIndex !== null) {
          this._songModel.removeNote(this._songModel._selectedIndex);
          // Adjust selection
          if (this._songModel._notes.length === 0) {
            this._songModel._selectedIndex = null;
          } else if (this._songModel._selectedIndex >= this._songModel._notes.length) {
            this._songModel._selectedIndex = this._songModel._notes.length - 1;
          }
          this._saveSong();
        }
        break;
      case '#':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.setAccidental(this._songModel._selectedIndex, '#');
          this._saveSong();
        }
        break;
      case 'b':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.setAccidental(this._songModel._selectedIndex, 'b');
          this._saveSong();
        }
        break;
      case 'n':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.setAccidental(this._songModel._selectedIndex, '');
          this._saveSong();
        }
        break;
      case 'r': {
        const restLength = this._palette.activeLength;
        if (this._songModel._cursorPosition >= this._songModel._notes.length) {
          this._songModel.appendRest(restLength);
          this._songModel._selectedIndex = this._songModel._notes.length - 1;
        } else {
          this._songModel.insertRest(restLength);
          this._songModel._selectedIndex = this._songModel._cursorPosition;
        }
        this._saveSong();
        break;
      }
      default: {
        // Number keys 2-9 for note insertion
        const dur = DURATIONS.find((d) => d.key === e.key);
        if (dur) {
          const pitch = this._getSelectedPitch();

          if (this._songModel._cursorPosition >= this._songModel._notes.length) {
            this._songModel.appendNote(pitch, dur.length);
            this._songModel._selectedIndex = this._songModel._notes.length - 1;
          } else {
            this._songModel.insertNote(pitch, dur.length);
            this._songModel._selectedIndex = this._songModel._cursorPosition;
          }
          this._saveSong();
        }
        break;
      }
    }

    this._renderStaff();
  }

  /**
   * Get the pitch of the currently selected note (or 'C4' as default).
   */
  _getSelectedPitch() {
    if (this._songModel._selectedIndex === null) return 'C4';
    const selected = this._songModel._notes[this._songModel._selectedIndex];
    if (Array.isArray(selected)) return selected[0].pitch || 'C4';
    return selected.pitch || 'C4';
  }

  _play() {
    // Placeholder -- full audio playback would use existing Web Audio instruments
    console.warn('Playback not yet implemented in editor');
  }

  _stop() {
    console.warn('Stop not yet implemented in editor');
  }

  dispose() {
    this._container.innerHTML = '';
  }
}
