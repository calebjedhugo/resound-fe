/**
 * Anchored rhythm matching for listeners (gates/fountains).
 *
 * Everything a listener hears is compared against the target's rhythm
 * TIMELINE (SongMatcher.targetTimeline): pitched onsets at real beat
 * offsets, with rests as expected gaps. A performance matches when, for
 * some anchor position, every target onset has a matching heard note at
 * the right relative beat — and NOTHING ELSE sounds inside the aligned
 * window. Sounds BEFORE or AFTER the window are none of the listener's
 * business: the gate heard its song exactly, and how that happened does
 * not matter.
 *
 * Design ruling (2026-07-11, see DESIGN.md — SUPERSEDES the 2026-07-02
 * "playback must BE the target" silence margins): a target embedded in a
 * longer performance MATCHES (the whole tape plays on Space, and every
 * door whose song occurs cleanly within it opens); completion fires the
 * moment the target's last note ends. What still fails: rotated takes,
 * prefixes (every onset must land before the window closes), notes DURING
 * the window that aren't the target's (a chord where a single note is due,
 * a sound during a target rest) — in-window exclusivity is what makes a
 * continuous singer beside a door jam it forever.
 */
import ListeningManager from 'core/ListeningManager';
import SongMatcher from 'core/SongMatcher';
import gameState from 'core/GameState';

// Silence (in beats) that separates UTTERANCES — used only to segment the
// heard stream for mismatch feedback (one red flash per utterance). Matching
// itself requires no surrounding silence (ruled 2026-07-11).
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
 * @returns {true|'in-progress'|'mismatch'|false} true = a completed
 *   performance matches (full target + trailing silence). 'in-progress' = a
 *   correct performance is UNDERWAY (every onset due so far matches, nothing
 *   extra, the trailing silence hasn't elapsed yet) — used by play-to-pass
 *   gates to open AS the song is performed. 'mismatch' = an utterance ended
 *   and nothing aligned (flash feedback once). false = nothing to judge.
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
    // An anchor is only judgeable if it lies in remembered (untrimmed)
    // history — forgotten notes must not read as silence
    const judgeable = anchorBeat > trimHorizonBeat + TOL_BEATS;
    const endBeat = anchorBeat + timeline.totalBeats;
    // The window closes the moment the target's own span elapses: no
    // trailing silence is required (ruled 2026-07-11)
    const windowClosed = nowBeat > endBeat;

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
      // Nothing else may sound INSIDE the window (this is what keeps
      // matching EXACT: extra notes, repeats, or sounds during the target's
      // rests all disqualify this anchor). Sounds before the anchor or at/
      // after the window's end are sequential surplus — tolerated.
      const hi = Math.min(nowBeat, endBeat - TOL_BEATS);
      const lo = anchorBeat - TOL_BEATS;
      const extras = groups.some((g) => g.beat >= lo && g.beat <= hi && !used.has(g));
      if (!extras) {
        if (windowClosed) return true;
        inProgress = true; // could still complete — don't report a miss yet
      }
    }
  }
  // A correct performance is underway but not yet complete — report it so
  // play-to-pass gates can open mid-performance. (Fountains ignore anything
  // that isn't `true`, so their exact-full-match semantics are unchanged.)
  if (inProgress) return 'in-progress';

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
