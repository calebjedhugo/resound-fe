/**
 * SongAudition — hear an entity's song from the viewport without opening the
 * song editor (A on the keyboard; the controller's audition button). One song
 * at a time: auditioning another stops the first, auditioning the same one
 * again stops it.
 *
 * Sound goes through a creature's own voice (resound-sound's Theremin, in
 * its default voice: the middle of every range a creature rolls, crackle as
 * in game), played as a creature plays its song (Theremin.play: dots, and
 * tied notes held as one), so an audition sounds like the game, and it
 * obeys resound-sound's master output like every other sound. Each note
 * as it starts is reported (`onNote`) with how long it sounds, so the
 * viewport can light the creature note by note (GameLookLayer.noteOn), and a
 * stop is reported (`onStop`) so it can go dark at once.
 */
import { Theremin, soundingBeats } from 'resound-sound';
import SongMatcher from 'core/SongMatcher';
import noteBeats from 'editor/util/noteBeats';

/** A creature voice, or null where Web Audio is missing (jsdom tests). */
export function createEditorVoice(id = 'audition') {
  const hasAudio =
    typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!hasAudio) return null;
  try {
    return new Theremin(id);
  } catch {
    return null;
  }
}

/**
 * Seconds a note sounds at `tempo` (quarter-note beats per minute): a note
 * event's `durationBeats` where it has one (the Theremin's: a tied note's
 * whole run), else its written length, dots included.
 */
export function noteSeconds(note, tempo) {
  const beats = note && Number.isFinite(note.durationBeats) ? note.durationBeats : noteBeats(note);
  return (beats * 60) / (tempo || 120);
}

export default class SongAudition {
  /**
   * @param {object} options
   * @param {(entityId:number, pitch:string, seconds:number) => void} [options.onNote]
   * @param {(entityId:number) => void} [options.onStop]
   * @param {() => ?object} [options.createPlayer] - the instrument (tests
   *   hand in a stand-in with play/stop/noteCallback)
   */
  constructor({ onNote = () => {}, onStop = () => {}, createPlayer = createEditorVoice } = {}) {
    this._onNote = onNote;
    this._onStop = onStop;
    this._createPlayer = createPlayer;
    this._player = undefined; // built on the first audition
    this._playingId = null;
    this._run = 0;
  }

  /** The entity whose song is playing now, or null. */
  get playingId() {
    return this._playingId;
  }

  /**
   * Play (or, if it is playing, stop) an entity's song.
   * @param {number} entityId
   * @param {Array|object} song - notes/chords, or {voices}
   * @param {number} tempo
   * @returns {boolean} whether it is playing now
   */
  toggle(entityId, song, tempo) {
    if (this._playingId === entityId) {
      this.stop();
      return false;
    }
    return this.play(entityId, song, tempo);
  }

  /** Play an entity's song from its start (stopping whatever plays). */
  play(entityId, song, tempo) {
    this.stop();
    const data = SongMatcher.flattenSong(song);
    if (data.length === 0) return false;
    if (this._player === undefined) this._player = this._createPlayer();
    this._run += 1;
    const run = this._run;
    this._playingId = entityId;
    const player = this._player;
    if (!player) {
      // No audio here: the notes still light, on timers, as they would sound
      this._schedule(entityId, data, tempo, run);
      return true;
    }
    // eslint-disable-next-line no-param-reassign
    player.noteCallback = (event) => {
      if (run !== this._run) return;
      this._onNote(entityId, event.pitch, noteSeconds(event, tempo));
    };
    let done;
    try {
      done = player.play({ data, tempo, basis: 4 });
    } catch {
      done = null;
    }
    Promise.resolve(done).then(() => this._ended(run));
    return true;
  }

  /** Stop the song playing (if any): its notes end now. */
  stop() {
    if (this._playingId === null) return;
    const id = this._playingId;
    this._playingId = null;
    this._run += 1;
    clearTimeout(this._timer);
    if (this._player) {
      try {
        this._player.stop();
      } catch {
        // a player failure must not break the editor
      }
    }
    this._onStop(id);
  }

  dispose() {
    this.stop();
  }

  _ended(run) {
    if (run !== this._run) return;
    this._playingId = null;
  }

  /**
   * Silent fallback: report the notes on timers (the song's own rhythm), a
   * tied note once, for its whole run (soundingBeats).
   */
  _schedule(entityId, data, tempo, run) {
    const sounding = soundingBeats(data);
    let i = 0;
    const next = () => {
      if (run !== this._run) return;
      if (i >= data.length) {
        this._ended(run);
        return;
      }
      const entry = data[i];
      const beats = [].concat(sounding[i]);
      i += 1;
      const notes = Array.isArray(entry) ? entry : [entry];
      notes.forEach((note, k) => {
        if (note && note.pitch && beats[k] > 0) {
          this._onNote(entityId, note.pitch, (beats[k] * 60) / (tempo || 120));
        }
      });
      this._timer = setTimeout(next, noteSeconds(notes[0] || {}, tempo) * 1000);
    };
    next();
  }
}
