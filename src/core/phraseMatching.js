/**
 * Anchored rhythm matching for listeners (gates/fountains).
 *
 * Everything a listener hears is compared against the target's rhythm
 * TIMELINE (SongMatcher.targetTimeline): pitched onsets at real beat
 * offsets, with rests as expected gaps. A performance matches when, for
 * some anchor position, every target onset has a matching heard note at
 * the right relative beat — and NOTHING ELSE sounds inside the aligned
 * window or within one beat of silence on either side.
 *
 * Design rulings (2026-07-02, see DESIGN.md): playback must BE the target —
 * rotated takes fail, over-long takes fail, prefixes can't match early
 * (the trailing silence margin must actually elapse), stale earlier sounds
 * sit outside the margins and neither help nor hurt, and rests inside the
 * target are matchable as required silence.
 */
import ListeningManager from './ListeningManager';
import SongMatcher from './SongMatcher';
import gameState from './GameState';

// Required silence (in beats) immediately before and after a performance
export const PHRASE_GAP_BEATS = 1;

// Alignment tolerance: within one 16th-note grid slot (grid step = 0.25)
const TOL_BEATS = 0.13;

/** Do the notes heard at one beat equal one target onset (chord-aware)? */
function groupMatchesOnset(group, onset) {
  if (onset.notes.length === 1 && group.notes.length === 1) {
    return SongMatcher.notesMatch(group.notes[0], onset.notes[0]);
  }
  if (onset.notes.length > 1 && group.notes.length > 1) {
    return SongMatcher.chordsMatch(group.notes, onset.notes);
  }
  return false;
}

/**
 * Evaluate a listener's captured notes against its required song.
 * @param {Object} listener - entity with capturedNotes, listeningStartTime,
 *   requiredSong; a _lastJudgedStartBeat marker is maintained on it
 * @returns {true|'mismatch'|false} true = a completed performance matches;
 *   'mismatch' = an utterance ended and nothing aligned (flash feedback
 *   once); false = nothing new to judge
 */
export default function evaluatePhrases(listener) {
  const tempo = gameState.musicalClock?.tempo || 120;
  const msPerBeat = 60000 / tempo;
  const groups = ListeningManager.groupNotesByBeat(
    listener.capturedNotes,
    listener.listeningStartTime,
    tempo
  );
  if (groups.length === 0) return false;

  const timeline = SongMatcher.targetTimeline(listener.requiredSong);
  if (timeline.onsets.length === 0) return false;

  const nowBeat = (Date.now() - listener.listeningStartTime) / msPerBeat;
  const firstOffset = timeline.onsets[0].beat;

  // Beats at/before this horizon were trimmed from the buffer and are
  // UNKNOWABLE — an anchor whose leading silence margin reaches into them
  // cannot be judged (forgotten notes must not read as silence)
  const trimHorizonBeat =
    listener._trimHorizonMs !== undefined
      ? (listener._trimHorizonMs - listener.listeningStartTime) / msPerBeat
      : -Infinity;

  let inProgress = false;
  for (const anchorGroup of groups) {
    const anchorBeat = anchorGroup.beat - firstOffset;
    // An anchor is only judgeable if its whole leading silence margin lies
    // in remembered (untrimmed) history
    const judgeable = anchorBeat - PHRASE_GAP_BEATS > trimHorizonBeat + TOL_BEATS;
    const endBeat = anchorBeat + timeline.totalBeats;
    const windowClosed = nowBeat > endBeat + PHRASE_GAP_BEATS;

    // Every target onset due so far must have a matching heard group
    let aligned = judgeable;
    const used = new Set();
    if (aligned) {
      for (const onset of timeline.onsets) {
        const want = anchorBeat + onset.beat;
        if (!windowClosed && want > nowBeat + TOL_BEATS) break; // rest is future
        const group = groups.find((g) => !used.has(g) && Math.abs(g.beat - want) <= TOL_BEATS);
        if (!group || !groupMatchesOnset(group, onset)) {
          aligned = false;
          break;
        }
        used.add(group);
      }
    }
    if (aligned) {
      // Nothing else may sound inside the window or its silence margins
      // (this is what keeps matching EXACT: extra notes, repeats, or sounds
      // during the target's rests all disqualify this anchor)
      const hi = windowClosed ? endBeat + PHRASE_GAP_BEATS : nowBeat;
      const lo = anchorBeat - PHRASE_GAP_BEATS - TOL_BEATS;
      const extras = groups.some((g) => g.beat >= lo && g.beat <= hi && !used.has(g));
      if (!extras) {
        if (windowClosed) return true;
        inProgress = true; // could still complete — don't report a miss yet
      }
    }
  }
  if (inProgress) return false;

  // Nothing aligned and nothing can: report a mismatch once per utterance,
  // after its final note has been followed by silence
  const lastGroup = groups[groups.length - 1];
  const lastDur = Math.min(...lastGroup.notes.map((n) => SongMatcher.lengthToBeats(n.length)));
  if (nowBeat <= lastGroup.beat + lastDur + PHRASE_GAP_BEATS) return false;
  if (
    listener._lastJudgedStartBeat !== undefined &&
    lastGroup.beat <= listener._lastJudgedStartBeat
  ) {
    return false;
  }
  listener._lastJudgedStartBeat = lastGroup.beat;
  const phrases = SongMatcher.phrasesFromBeatGroups(groups, PHRASE_GAP_BEATS);
  listener.lastPhraseResult = {
    noteCount: phrases[phrases.length - 1].elements.length,
    matched: false,
    // Stamp when the utterance ENDED, not when it was judged (judgment
    // waits out the silence margin, which read as inflated "Xs ago")
    at: listener.listeningStartTime + (lastGroup.beat + lastDur) * msPerBeat,
  };
  return 'mismatch';
}
