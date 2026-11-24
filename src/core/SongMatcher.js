/**
 * SongMatcher - Utilities for comparing songs for exact matches.
 *
 * Songs are compared as they SOUND (the designer's ruling, 2026-11-24): a
 * dotted value lasts its dots (core/noteBeats: x1.5, a double dot x1.75),
 * and a TIED pair is one held note — one onset lasting both values — never
 * two strikes. So a quarter tied to a quarter and a half note are the same
 * song.
 */
import { lengthBeats, soundingBeats, isTiedOn } from 'core/noteBeats';

const BEAT_EPS = 1e-6;
// A heard note's durationBeats is worked back from milliseconds (resound-
// sound: ms * tempo / 60000), so a duration compares within this
const DURATION_EPS = 1e-3;

class SongMatcher {
  /**
   * Flatten a multi-voice song into a sequential note/chord array.
   * Notes from different voices at the same beat position become chords.
   * Flat-array input passes through unchanged.
   * @param {Array|Object} song - Flat array or { voices: [...] } object
   * @returns {Array} Flat array of notes and chords
   */
  static flattenSong(song) {
    if (!song) return [];
    if (Array.isArray(song)) return song;
    if (!song.voices || song.voices.length === 0) return [];

    // Collect (beatPosition, note) pairs from all voices
    const entries = [];
    for (const voice of song.voices) {
      let beat = 0;
      for (const note of voice.notes || []) {
        entries.push({ beat, note });
        // Whole-note units (only compared with each other), dots included
        beat += lengthBeats(note.length, note.dotted) / 4;
      }
    }

    if (entries.length === 0) return [];

    // Sort by beat position
    entries.sort((a, b) => a.beat - b.beat);

    // Group notes at same beat into chords
    const result = [];
    let i = 0;
    while (i < entries.length) {
      const currentBeat = entries[i].beat;
      const group = [entries[i].note];
      i += 1;
      while (i < entries.length && Math.abs(entries[i].beat - currentBeat) < 1e-10) {
        group.push(entries[i].note);
        i += 1;
      }
      if (group.length === 1) {
        result.push(group[0]);
      } else {
        result.push(group);
      }
    }

    return result;
  }

  /**
   * Compare two songs for an exact match AS THEY SOUND: the same onsets at
   * the same beats, each with the same pitches held for the same time, and
   * the same total length (rests included). A tied pair is one held note,
   * so it matches the single value it adds up to.
   * @param {Array|Object} capturedSong - Flat array or voices format
   * @param {Array|Object} requiredSong - Flat array or voices format
   * @returns {boolean} True if songs match exactly
   */
  static songsMatch(capturedSong, requiredSong) {
    if (!capturedSong || !requiredSong) {
      return false;
    }
    const a = this.targetTimeline(capturedSong);
    const b = this.targetTimeline(requiredSong);
    if (a.onsets.length !== b.onsets.length) return false;
    if (Math.abs(a.totalBeats - b.totalBeats) > BEAT_EPS) return false;
    return a.onsets.every((onset, i) => {
      const other = b.onsets[i];
      if (Math.abs(onset.beat - other.beat) > BEAT_EPS) return false;
      if (onset.notes.length !== other.notes.length) return false;
      if (onset.notes.length === 1) return this.notesMatch(onset.notes[0], other.notes[0]);
      return this.chordsMatch(onset.notes, other.notes);
    });
  }

  /**
   * Note length string → quarter-note beats ("1/4" → 1, "1/8" → 0.5), with
   * a note's `dotted` field when given (true: x1.5, 2: x1.75). Malformed
   * lengths count as one beat.
   */
  static lengthToBeats(length, dotted) {
    return lengthBeats(length, dotted);
  }

  /**
   * Build the rhythm timeline of a required song: pitched ONSETS at real
   * quarter-note beat offsets, with rests advancing the clock silently.
   * Voices are walked independently at their true positions (unlike
   * flattenSong, which collapses voices to a sequential list), so
   * polyphonic targets keep their rhythm. Used by anchored matching:
   * a rest is an EXPECTED GAP in the pattern, not an entry to compare.
   *
   * Dots lengthen a value (x1.5, a double dot x1.75). A TIE holds a pitch
   * on (per note, so in a chord each member ties on its own): a note tied
   * on from the same pitch in the entry before adds its value to that
   * onset's `durationBeats` and is no onset of its own — resound-sound's
   * buildTimeline rule (a rest, or a tie to a pitch that isn't there, ends
   * it; a continuation with nothing to continue sounds as a fresh note).
   * @param {Array|Object} requiredSong - Flat array or { voices: [...] }
   * @returns {{onsets: Array<{beat: number, notes: Array}>, totalBeats: number}}
   *   onsets sorted by beat (each note: { pitch, length, dotted?,
   *   durationBeats } — durationBeats the whole held length); totalBeats
   *   spans trailing rests/sustains
   */
  static targetTimeline(requiredSong) {
    const byBeat = new Map();
    const addOnset = (beat, note) => {
      const key = Math.round(beat * 1e6) / 1e6;
      if (!byBeat.has(key)) byBeat.set(key, { beat: key, notes: [] });
      const out = { pitch: note.pitch, length: note.length, durationBeats: soundingBeats(note) };
      if (note.dotted) out.dotted = note.dotted;
      byBeat.get(key).notes.push(out);
      return out;
    };
    const walkSequence = (entries) => {
      let clock = 0;
      let open = new Map(); // pitch -> the onset note a tie is holding on
      for (const entry of entries || []) {
        if (!entry) continue;
        const members = (Array.isArray(entry) ? entry : [entry]).filter(Boolean);
        if (members.length === 0) continue;
        const held = new Map();
        for (const n of members) {
          if (!n.pitch) continue;
          const holding = isTiedOn(n) ? open.get(n.pitch) : null;
          if (holding) {
            holding.durationBeats += soundingBeats(n);
            if (n.tie === 'continue') held.set(n.pitch, holding);
          } else {
            const onset = addOnset(clock, n);
            if (n.tie === 'start' || n.tie === 'continue') held.set(n.pitch, onset);
          }
        }
        // A tie reaches only the next entry; a rest (nothing pitched) ends all
        open = held;
        clock += Array.isArray(entry)
          ? Math.min(...members.map((n) => lengthBeats(n.length, n.dotted)))
          : lengthBeats(entry.length, entry.dotted);
      }
      return clock;
    };

    let totalBeats = 0;
    if (Array.isArray(requiredSong)) {
      totalBeats = walkSequence(requiredSong);
    } else if (requiredSong && Array.isArray(requiredSong.voices)) {
      for (const voice of requiredSong.voices) {
        totalBeats = Math.max(totalBeats, walkSequence(voice.notes));
      }
    }
    const onsets = [...byBeat.values()].sort((a, b) => a.beat - b.beat);
    return { onsets, totalBeats };
  }

  /**
   * Split a beat-grouped note stream into PHRASES: contiguous utterances
   * separated by silence. A listener hears everything over time (creature
   * passes, stray notes, the player's playback); each phrase is evaluated
   * against the target on its own, so old sounds neither help nor hurt a
   * later playback — but the playback itself must BE the target, exactly.
   * @param {Array<{beat: number, notes: Array}>} groups - from ListeningManager.groupNotesByBeat
   * @param {number} [gapBeats] - silence (beyond the previous note's duration)
   *   that starts a new phrase
   * @returns {Array<Array>} phrases in song format (notes/chords)
   */
  static phrasesFromBeatGroups(groups, gapBeats = 1) {
    const phrases = [];
    let current = null;
    let expectedNext = null;

    for (const { beat, notes } of groups) {
      if (current === null || beat > expectedNext + gapBeats) {
        current = { startBeat: beat, elements: [] };
        phrases.push(current);
      }
      if (notes.length === 1) {
        current.elements.push({ pitch: notes[0].pitch, length: notes[0].length });
      } else {
        current.elements.push(notes.map((n) => ({ pitch: n.pitch, length: n.length })));
      }
      const durationBeats = Math.min(...notes.map((n) => soundingBeats(n)));
      expectedNext = beat + durationBeats;
    }
    return phrases;
  }

  /**
   * Compare two single notes: the same pitch, sounding the same time (its
   * dots, or a heard / timeline note's `durationBeats` — a tied note's whole
   * held length). '1/4' + dotted and a heard note lasting 1.5 beats match.
   * @param {Object} note1 - { pitch, length, dotted?, durationBeats? }
   * @param {Object} note2 - { pitch, length, dotted?, durationBeats? }
   * @returns {boolean} True if notes match
   */
  static notesMatch(note1, note2) {
    return (
      note1.pitch === note2.pitch &&
      Math.abs(soundingBeats(note1) - soundingBeats(note2)) < DURATION_EPS
    );
  }

  /**
   * Compare two chords (arrays of notes)
   * @param {Array} chord1 - Array of notes
   * @param {Array} chord2 - Array of notes
   * @returns {boolean} True if chords match
   */
  static chordsMatch(chord1, chord2) {
    // Must have same number of notes
    if (chord1.length !== chord2.length) {
      return false;
    }

    // Sort both chords by pitch for comparison (order doesn't matter in a chord)
    const sorted1 = [...chord1].sort((a, b) => a.pitch.localeCompare(b.pitch));
    const sorted2 = [...chord2].sort((a, b) => a.pitch.localeCompare(b.pitch));

    // Compare each note
    for (let i = 0; i < sorted1.length; i += 1) {
      if (!this.notesMatch(sorted1[i], sorted2[i])) {
        return false;
      }
    }

    return true;
  }
}

export default SongMatcher;
