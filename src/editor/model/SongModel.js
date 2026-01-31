/**
 * SongModel — Pure-logic layer for measure-aware song editing.
 *
 * The puzzle JSON stores songs as flat note arrays. SongModel adds
 * measure awareness, transposition, duration editing, and cursor
 * navigation as editing aids.
 *
 * No UI or browser dependencies.
 */

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const FLAT_TO_SHARP = {
  Db: 'C#',
  Eb: 'D#',
  Fb: 'E',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
  Cb: 'B',
};

/**
 * Parse a duration fraction string to a decimal value.
 * @param {string} length — e.g. "1/4", "3/8"
 * @returns {number} — e.g. 0.25, 0.375
 */
function parseDuration(length) {
  const [num, den] = length.split('/').map(Number);
  return num / den;
}

/**
 * Format a decimal duration value to a fraction string.
 * Uses a lookup for common values, falls back to fraction math.
 * @param {number} value — e.g. 0.25
 * @returns {string} — e.g. "1/4"
 */
function formatDuration(value) {
  const COMMON = {
    1: '1/1',
    0.5: '1/2',
    0.25: '1/4',
    0.125: '1/8',
    0.0625: '1/16',
    0.75: '3/4',
    0.375: '3/8',
    0.1875: '3/16',
  };
  if (COMMON[value] !== undefined) {
    return COMMON[value];
  }
  // Fallback: find the best fraction with denominator up to 64
  for (const den of [1, 2, 4, 8, 16, 32, 64]) {
    const num = Math.round(value * den);
    if (Math.abs(num / den - value) < 1e-9) {
      return `${num}/${den}`;
    }
  }
  // Last resort
  return `${value}/1`;
}

/**
 * Parse a pitch string like "C#4" into { name, octave }.
 * Handles flats by normalizing to sharps.
 */
function parsePitch(pitch) {
  const match = pitch.match(/^([A-G][b#]?)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid pitch: ${pitch}`);
  }
  let name = match[1];
  const octave = parseInt(match[2], 10);

  // Normalize flats to sharps
  if (FLAT_TO_SHARP[name]) {
    name = FLAT_TO_SHARP[name];
  }

  return { name, octave };
}

/**
 * Format a pitch object back to a string.
 */
function formatPitch(name, octave) {
  return `${name}${octave}`;
}

/**
 * Check if a duration string represents a dotted note.
 * A dotted note has numerator 3 and denominator is a power of 2.
 */
function isDotted(length) {
  const [num, den] = length.split('/').map(Number);
  if (num !== 3) return false;
  // Check denominator is a power of 2
  return den > 0 && (den & (den - 1)) === 0;
}

export default class SongModel {
  constructor(timeSignature = [4, 4]) {
    this._notes = [];
    this._timeSignature = timeSignature;
    this._cursorPosition = 0;
    this._selectedIndex = null;
  }

  /** Current cursor position (0-based index, can be notes.length for appending). */
  get cursorPosition() {
    return this._cursorPosition;
  }

  /** Currently selected note index, or null. */
  get selectedIndex() {
    return this._selectedIndex;
  }

  /** Time signature as [numerator, denominator]. */
  get timeSignature() {
    return [...this._timeSignature];
  }

  /**
   * Measure capacity in whole notes.
   * For 4/4: 4/4 = 1.0. For 3/4: 3/4 = 0.75.
   */
  _measureCapacity() {
    return this._timeSignature[0] / this._timeSignature[1];
  }

  // ── Insertion & Removal ────────────────────────────────────────────

  /**
   * Insert a note at the cursor position.
   * If cursor is at an index, inserts before that index and shifts subsequent notes.
   * Cursor moves to the inserted note's index.
   */
  insertNote(pitch, length) {
    const note = { pitch, length };
    this._notes.splice(this._cursorPosition, 0, note);
    // Cursor stays at the position of the newly inserted note
  }

  /**
   * Append a note at the end. Cursor moves to one past the new note.
   */
  appendNote(pitch, length) {
    const note = { pitch, length };
    this._notes.push(note);
    this._cursorPosition = this._notes.length;
  }

  /**
   * Insert a rest (no pitch) at the cursor position.
   * Cursor stays at the inserted position.
   */
  insertRest(length) {
    const rest = { length };
    this._notes.splice(this._cursorPosition, 0, rest);
  }

  /**
   * Append a rest (no pitch) at the end. Cursor moves to one past the new rest.
   */
  appendRest(length) {
    const rest = { length };
    this._notes.push(rest);
    this._cursorPosition = this._notes.length;
  }

  /**
   * Returns true if the entry is a rest (no pitch property, not a chord array).
   */
  static isRest(entry) {
    if (Array.isArray(entry)) return false;
    return !entry.pitch;
  }

  /**
   * Remove note/chord at index.
   * If selected note removed, select next (or previous if at end, or null if empty).
   */
  removeNote(index) {
    if (index < 0 || index >= this._notes.length) return;

    this._notes.splice(index, 1);

    // Adjust selection
    if (this._selectedIndex === index) {
      if (this._notes.length === 0) {
        this._selectedIndex = null;
      } else if (index >= this._notes.length) {
        this._selectedIndex = this._notes.length - 1;
      }
      // Otherwise selectedIndex stays at the same index (now pointing to next note)
    } else if (this._selectedIndex !== null && this._selectedIndex > index) {
      this._selectedIndex -= 1;
    }

    // Adjust cursor
    if (this._cursorPosition > this._notes.length) {
      this._cursorPosition = this._notes.length;
    }
  }

  // ── Chords ─────────────────────────────────────────────────────────

  /**
   * If note at index is a single note, convert to chord array.
   * If already a chord (array), push the new note.
   */
  makeChord(index, pitch, length) {
    if (index < 0 || index >= this._notes.length) return;

    const existing = this._notes[index];
    if (!Array.isArray(existing) && !existing.pitch) return; // rest guard

    const newNote = { pitch, length };

    if (Array.isArray(existing)) {
      existing.push(newNote);
    } else {
      this._notes[index] = [existing, newNote];
    }
  }

  // ── Transposition ──────────────────────────────────────────────────

  /**
   * Raise pitch by one half step.
   * Handles chords by transposing all notes.
   */
  transposeUp(index) {
    if (index < 0 || index >= this._notes.length) return;
    this._transposeEntry(index, 1);
  }

  /**
   * Lower pitch by one half step.
   * Handles chords by transposing all notes.
   */
  transposeDown(index) {
    if (index < 0 || index >= this._notes.length) return;
    this._transposeEntry(index, -1);
  }

  _transposeEntry(index, direction) {
    const entry = this._notes[index];
    if (Array.isArray(entry)) {
      for (const note of entry) {
        this._transposeSingleNote(note, direction);
      }
    } else {
      this._transposeSingleNote(entry, direction);
    }
  }

  _transposeSingleNote(note, direction) {
    if (!note.pitch) return; // rest guard
    const { name, octave } = parsePitch(note.pitch);
    const chromIdx = CHROMATIC_SCALE.indexOf(name);
    let newIdx = chromIdx + direction;
    let newOctave = octave;

    if (newIdx >= CHROMATIC_SCALE.length) {
      newIdx = 0;
      newOctave += 1;
    } else if (newIdx < 0) {
      newIdx = CHROMATIC_SCALE.length - 1;
      newOctave -= 1;
    }

    note.pitch = formatPitch(CHROMATIC_SCALE[newIdx], newOctave);
  }

  // ── Accidentals ────────────────────────────────────────────────────

  /**
   * Set accidental on a single note's pitch string.
   * Strips any existing accidental before applying the new one.
   */
  _setNoteAccidental(note, accidental) {
    const match = note.pitch.match(/^([A-G])[#b]?(\d+)$/);
    if (!match) return;
    note.pitch = `${match[1]}${accidental}${match[2]}`;
  }

  /**
   * Set accidental ('#', 'b', or '' for natural) on the note/chord at index.
   * For chords, applies to all notes. No-ops on out-of-range or rest entries.
   */
  setAccidental(index, accidental) {
    if (index < 0 || index >= this._notes.length) return;
    const entry = this._notes[index];
    if (Array.isArray(entry)) {
      for (const note of entry) {
        this._setNoteAccidental(note, accidental);
      }
    } else {
      if (!entry.pitch) return; // rest guard
      this._setNoteAccidental(entry, accidental);
    }
  }

  // ── Duration ───────────────────────────────────────────────────────

  /**
   * Change a note's duration. For chords, changes all notes in the chord.
   */
  setDuration(index, length) {
    if (index < 0 || index >= this._notes.length) return;

    const entry = this._notes[index];
    if (Array.isArray(entry)) {
      for (const note of entry) {
        note.length = length;
      }
    } else {
      entry.length = length;
    }
  }

  /**
   * Toggle dotting on a note.
   * Undotted -> dotted: multiply duration by 1.5
   * Dotted -> undotted: divide duration by 1.5
   * For chords, toggles all notes.
   */
  toggleDot(index) {
    if (index < 0 || index >= this._notes.length) return;

    const entry = this._notes[index];
    if (Array.isArray(entry)) {
      for (const note of entry) {
        note.length = this._toggleDotLength(note.length);
      }
    } else {
      entry.length = this._toggleDotLength(entry.length);
    }
  }

  _toggleDotLength(length) {
    if (isDotted(length)) {
      // Remove dot: divide by 1.5
      const value = parseDuration(length) / 1.5;
      return formatDuration(value);
    }
    // Add dot: multiply by 1.5
    const value = parseDuration(length) * 1.5;
    return formatDuration(value);
  }

  // ── Cursor ─────────────────────────────────────────────────────────

  /**
   * Move cursor left or right.
   * Left: min 0. Right: max notes.length.
   */
  moveCursor(direction) {
    if (direction === 'left') {
      this._cursorPosition = Math.max(0, this._cursorPosition - 1);
    } else if (direction === 'right') {
      this._cursorPosition = Math.min(this._notes.length, this._cursorPosition + 1);
    }
  }

  /**
   * Advance cursor forward by 1. Capped at notes.length.
   */
  advanceCursor() {
    this._cursorPosition = Math.min(this._notes.length, this._cursorPosition + 1);
  }

  // ── Measures ───────────────────────────────────────────────────────

  /**
   * Return notes grouped into measures based on time signature.
   * Each measure is an array of notes/chords.
   */
  getMeasures() {
    const capacity = this._measureCapacity();
    const measures = [];
    let currentMeasure = [];
    let accumulated = 0;

    for (const entry of this._notes) {
      const dur = this._entryDuration(entry);
      if (accumulated + dur > capacity + 1e-9) {
        // Start a new measure
        measures.push(currentMeasure);
        currentMeasure = [];
        accumulated = 0;
      }
      currentMeasure.push(entry);
      accumulated += dur;

      // If we exactly hit the measure boundary, close it
      if (Math.abs(accumulated - capacity) < 1e-9) {
        measures.push(currentMeasure);
        currentMeasure = [];
        accumulated = 0;
      }
    }

    if (currentMeasure.length > 0) {
      measures.push(currentMeasure);
    }

    return measures;
  }

  /**
   * How many quarter-note beats are left in the current measure at the cursor position.
   */
  getRemainingBeats() {
    const capacity = this._measureCapacity();
    // Sum durations of notes before the cursor
    let accumulated = 0;
    let measureStart = 0;

    for (let i = 0; i < this._cursorPosition && i < this._notes.length; i++) {
      const dur = this._entryDuration(this._notes[i]);
      accumulated += dur;

      // If we completed a measure, reset
      if (Math.abs(accumulated - capacity) < 1e-9) {
        accumulated = 0;
        measureStart = i + 1;
      } else if (accumulated > capacity + 1e-9) {
        accumulated = dur;
        measureStart = i;
      }
    }

    const remainingWholeNotes = capacity - accumulated;
    // Convert whole notes to quarter notes: multiply by 4
    return remainingWholeNotes * 4;
  }

  /**
   * Get the duration of a note entry (single note or chord).
   * For chords, uses the first note's duration.
   */
  _entryDuration(entry) {
    if (Array.isArray(entry)) {
      return parseDuration(entry[0].length);
    }
    return parseDuration(entry.length);
  }

  // ── Serialization ──────────────────────────────────────────────────

  /**
   * Return the notes array as-is (puzzle JSON format).
   */
  toSongArray() {
    return this._notes;
  }

  /**
   * Set notes from a puzzle JSON note array. Reset cursor to 0.
   */
  fromSongArray(notes) {
    this._notes = notes;
    this._cursorPosition = 0;
    this._selectedIndex = null;
  }
}
