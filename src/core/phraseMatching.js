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
 *
 * Onsets are compared with EACH OTHER, never with a fixed grid (2026-11-24):
 * notes heard together (ListeningManager.groupNotesByBeat: within
 * CHORD_SPREAD_BEATS) are one onset, and each target onset must land within
 * TOL_BEATS of where it is due, counted from the take's own first onset.
 * (A fixed 16th grid on the listener's clock split a chord whose two
 * creatures landed either side of one of its lines.)
 */
import ListeningManager, { CHORD_SPREAD_BEATS } from 'core/ListeningManager';
import SongMatcher from 'core/SongMatcher';
import gameState from 'core/GameState';

// Silence (in beats) that separates UTTERANCES — used only to segment the
// heard stream for the debug readout's note count. Matching itself requires
// no surrounding silence (ruled 2026-07-11), and mismatch feedback fires on
// the offending note itself (ruled 2026-07-16).
export const PHRASE_GAP_BEATS = 1;

// Alignment tolerance: an onset lands within this of where it is due
// (counted from the take's first onset) — just over half a sixteenth, so a
// note a sixteenth off is the wrong rhythm
export const TOL_BEATS = 0.13;

// A cached verdict's lifetime ends this much (beats) before the one turn
// computed by subtraction, so float rounding can never place that turn
// inside it: below 2^30 beats (10 years at 200 bpm) the rounding involved
// is under 5e-7 beats. Ending early costs one more judgment, never a
// different one.
const TURN_SLACK_BEATS = 1e-6;

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
 * Is the group heard so far PART of this chord onset — fewer notes, each one
 * of its notes, nothing else? (Its other notes may still be on their way:
 * a chord's members come from independent sources.)
 */
function groupIsPartOfOnset(group, onset) {
  if (group.notes.length >= onset.notes.length) return false;
  const left = [...onset.notes];
  return group.notes.every((note) => {
    const i = left.findIndex((wanted) => SongMatcher.notesMatch(note, wanted));
    if (i === -1) return false;
    left.splice(i, 1);
    return true;
  });
}

/** The unused group nearest `beat`, within the tolerance (or undefined). */
function groupNear(groups, used, beat) {
  let best;
  for (const g of groups) {
    const off = Math.abs(g.beat - beat);
    if (!used.has(g) && off <= TOL_BEATS && (!best || off < Math.abs(best.beat - beat))) best = g;
  }
  return best;
}

/**
 * Evaluate a listener's captured notes against its required song.
 * @param {Object} listener - entity with capturedNotes, listeningStartTime,
 *   requiredSong; a _lastJudgedStartBeat marker is maintained on it
 * @returns {true|'in-progress'|'mismatch'|false} true = a completed
 *   performance matches (its window — the target's span from its first
 *   onset — has closed). `listener._completedTake` is set to
 *   `{ endMs, lastNoteMs }`: when that window closed, and the last note of
 *   the take (so its owner can consume the take and no more). 'in-progress' = a
 *   correct performance is UNDERWAY (every onset due so far matches, nothing
 *   extra, the trailing silence hasn't elapsed yet) — used by play-to-pass
 *   gates to open AS the song is performed. 'mismatch' = a wrong note just
 *   landed and no alignment survives (flash feedback at once — ruled
 *   2026-07-16). false = nothing to judge.
 */
export default function evaluatePhrases(listener) {
  const tempo = gameState.musicalClock?.tempo || 120;
  return judge(listener, tempo, Date.now(), null);
}

// Each listener's last verdict, and what it was judged from (see below)
const verdicts = new WeakMap();

/**
 * evaluatePhrases, judged afresh only when its verdict could differ — what
 * a gate or fountain calls every frame. The answer is EXACTLY evaluatePhrases'
 * at this moment. A verdict reads the clock only by comparing the beat now
 * against beats fixed by the heard notes and the song, and each comparison
 * flips at most once as time moves on; judging notes the earliest beat at
 * which any comparison it made could flip (its next TURN). Until then, with
 * the same heard notes (append-only: the same array at the same length),
 * tempo, epoch, trim horizon, last judged sound and song, the same
 * comparisons come out the same way — so does the verdict. A 'mismatch' is
 * never reused: judging one writes the listener.
 * @param {Object} listener - as for evaluatePhrases
 * @returns {true|'in-progress'|'mismatch'|false}
 */
export function evaluatePhrasesCached(listener) {
  const tempo = gameState.musicalClock?.tempo || 120;
  const nowMs = Date.now();
  const nowBeat = beatAt(listener, nowMs, tempo);
  let last = verdicts.get(listener);
  if (
    last &&
    last.notes === listener.capturedNotes &&
    last.count === listener.capturedNotes.length &&
    last.tempo === tempo &&
    last.startTime === listener.listeningStartTime &&
    Object.is(last.trimHorizonMs, listener._trimHorizonMs) &&
    Object.is(last.lastJudgedStartBeat, listener._lastJudgedStartBeat) &&
    last.song === listener.requiredSong &&
    nowBeat >= last.fromBeat &&
    nowBeat < last.untilBeat
  ) {
    return last.result;
  }

  if (!last) {
    last = {};
    verdicts.set(listener, last);
  }
  // What the verdict is judged FROM (judging a mismatch rewrites the
  // listener's last judged sound)
  last.notes = listener.capturedNotes;
  last.count = listener.capturedNotes.length;
  last.tempo = tempo;
  last.startTime = listener.listeningStartTime;
  last.trimHorizonMs = listener._trimHorizonMs;
  last.lastJudgedStartBeat = listener._lastJudgedStartBeat;
  last.song = listener.requiredSong;
  last.fromBeat = nowBeat;
  last.untilBeat = Infinity;
  last.result = judge(listener, tempo, nowMs, last);
  if (last.result === 'mismatch') last.untilBeat = -Infinity;
  return last.result;
}

/** The beat `nowMs` falls on, in the listener's own count. */
function beatAt(listener, nowMs, tempo) {
  return (nowMs - listener.listeningStartTime) / (60000 / tempo);
}

/** The verdict can turn at `beat`: keep the earliest (horizon may be null). */
function turnAt(horizon, beat) {
  if (horizon && beat < horizon.untilBeat) horizon.untilBeat = beat;
}

/**
 * evaluatePhrases at `nowMs`; with a horizon, also lower horizon.untilBeat
 * to the verdict's next turn.
 */
function judge(listener, tempo, nowMs, horizon) {
  const msPerBeat = 60000 / tempo;
  const groups = ListeningManager.groupNotesByBeat(
    listener.capturedNotes,
    listener.listeningStartTime,
    tempo
  );
  if (groups.length === 0) return false;

  const timeline = SongMatcher.targetTimeline(listener.requiredSong);
  if (timeline.onsets.length === 0) return false;

  const nowBeat = beatAt(listener, nowMs, tempo);
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
        if (!windowClosed && want > nowBeat + TOL_BEATS) {
          // The rest is future (until this onset falls due)
          turnAt(horizon, want - TOL_BEATS - TURN_SLACK_BEATS);
          break;
        }
        const group = groupNear(groups, used, want);
        if (!group && !windowClosed && nowBeat <= want + TOL_BEATS) {
          // Onset-boundary grace: the due note hasn't arrived yet but is
          // still within tolerance (scheduling jitter between one note's end
          // and the next onset). Treat it like a future onset — the
          // performance is still in progress, so the gate's fade never
          // snaps opaque between the notes of a correct take. A WRONG note
          // at the onset (group found, mismatched) still fails at once.
          turnAt(horizon, want + TOL_BEATS);
          break;
        }
        if (
          group &&
          !windowClosed &&
          nowBeat <= group.beat + CHORD_SPREAD_BEATS &&
          groupIsPartOfOnset(group, onset)
        ) {
          // A chord mid-assembly: some of its notes are in, the rest may
          // still land (their sources sound a frame or two apart). Still
          // in progress — the fade never flickers on a correct chord.
          used.add(group);
          turnAt(horizon, group.beat + CHORD_SPREAD_BEATS);
          break;
        }
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
      if (horizon && !windowClosed) {
        // A standing anchor turns when its window closes, and a clean one
        // when a group not yet inside it (past `hi`) comes inside. (A FAILED
        // anchor never turns: everything it failed on only gets stricter.)
        turnAt(horizon, endBeat);
        const ahead = extras ? null : groups.find((g) => g.beat > hi);
        if (ahead) turnAt(horizon, ahead.beat);
      }
      if (!extras) {
        if (windowClosed) {
          let lastNoteMs = -Infinity;
          used.forEach((g) =>
            g.notes.forEach((n) => {
              if (n.timestamp > lastNoteMs) lastNoteMs = n.timestamp;
            })
          );
          listener._completedTake = {
            endMs: listener.listeningStartTime + endBeat * msPerBeat,
            lastNoteMs,
          };
          return true;
        }
        inProgress = true; // could still complete — don't report a miss yet
      }
    }
  }
  // A correct performance is underway but not yet complete — report it so
  // play-to-pass gates can open mid-performance. (Fountains ignore anything
  // that isn't `true`, so their exact-full-match semantics are unchanged.)
  if (inProgress) return 'in-progress';

  // Nothing aligned and nothing underway: the newest sound is a WRONG note.
  // Judge it IMMEDIATELY (ruled 2026-07-16, superseding the wait-for-
  // utterance-end rule) — the red flash lands on the offending note itself,
  // creature noise included (a continuous singer never yields the trailing
  // silence the old rule waited for, so gates near jammers never flashed).
  const lastGroup = groups[groups.length - 1];
  // One grace: the newest group may be a chord mid-assembly (mates from
  // independent sources land frames apart) — hold judgment until its spread
  // has passed.
  if (nowBeat <= lastGroup.beat + CHORD_SPREAD_BEATS) {
    turnAt(horizon, lastGroup.beat + CHORD_SPREAD_BEATS);
    return false;
  }
  // One report per offending sound: stay silent until something NEW lands.
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
    // Stamp the offending sound's onset (this IS judgment time now)
    at: listener.listeningStartTime + lastGroup.beat * msPerBeat,
  };
  return 'mismatch';
}
