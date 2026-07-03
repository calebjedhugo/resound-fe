/**
 * Phrase-based song matching for listeners (gates/fountains).
 *
 * Everything a listener hears is segmented into silence-delimited PHRASES.
 * A completed phrase must equal the required song EXACTLY to activate —
 * rotated and over-long takes fail; sounds heard earlier are separate
 * phrases and neither help nor hurt. (Design ruling 2026-07-02: playback
 * must BE the target, not merely contain it.)
 */
import ListeningManager from './ListeningManager';
import SongMatcher from './SongMatcher';
import gameState from './GameState';

// Silence (in beats, beyond the previous note's duration) that ends a phrase
export const PHRASE_GAP_BEATS = 1;

/**
 * Evaluate a listener's captured notes.
 * @param {Object} listener - entity with capturedNotes, listeningStartTime,
 *   requiredSong; a _lastJudgedStartBeat marker is maintained on it
 * @returns {true|'mismatch'|false} true = a completed phrase matches;
 *   'mismatch' = a phrase JUST completed and failed (flash feedback once);
 *   false = nothing new to judge
 */
export default function evaluatePhrases(listener) {
  const tempo = gameState.musicalClock?.tempo || 120;
  const groups = ListeningManager.groupNotesByBeat(
    listener.capturedNotes,
    listener.listeningStartTime,
    tempo
  );
  const phrases = SongMatcher.phrasesFromBeatGroups(groups, PHRASE_GAP_BEATS);
  if (phrases.length === 0) return false;

  // The final phrase only counts once silence has followed it — judging it
  // while it may still be growing would let the prefix of a longer take
  // match prematurely.
  const msPerBeat = 60000 / tempo;
  const last = listener.capturedNotes[listener.capturedNotes.length - 1];
  const lastEndMs = last.timestamp + SongMatcher.lengthToBeats(last.length) * msPerBeat;
  const lastComplete = Date.now() > lastEndMs + PHRASE_GAP_BEATS * msPerBeat;
  const completed = lastComplete ? phrases : phrases.slice(0, -1);
  if (completed.length === 0) return false;

  if (completed.some((p) => SongMatcher.songsMatch(p.elements, listener.requiredSong))) {
    return true;
  }

  // Report a mismatch only once per newly-completed phrase (startBeat is
  // monotonic against the fixed listening epoch, so window trimming can't
  // re-trigger old phrases)
  const newest = completed[completed.length - 1];
  if (
    listener._lastJudgedStartBeat !== undefined &&
    newest.startBeat <= listener._lastJudgedStartBeat
  ) {
    return false;
  }
  listener._lastJudgedStartBeat = newest.startBeat;
  listener.lastPhraseResult = {
    noteCount: newest.elements.length,
    matched: false,
    at: Date.now(),
  };
  return 'mismatch';
}
