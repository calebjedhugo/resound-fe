/**
 * Note lengths as beats, for the game's own reading of songs (matching,
 * a gate's song length, the staff display's width, the editor's measures):
 * the shared schema's `{ length, dotted?, tie? }` — `dotted: true` (or 1)
 * one dot, x1.5; `dotted: 2` a DOUBLE dot, x1.75. The audio library reads
 * the same fields for what it plays (resound-sound `buildTimeline`); this
 * is the game's copy of the arithmetic, so the two must agree.
 */

/** Augmentation dots a `dotted` field asks for: true / 1 -> 1, 2 -> 2, else 0. */
export function dotCount(dotted) {
  if (!dotted) return 0;
  if (typeof dotted === 'number' && Number.isInteger(dotted) && dotted > 1) return dotted;
  return 1;
}

/** What dots multiply a written length by: 1, 1.5, 1.75 (2 - 1/2^dots). */
export function dotFactor(dotted) {
  const dots = dotCount(dotted);
  return dots === 0 ? 1 : 2 - 1 / 2 ** dots;
}

/**
 * Quarter-note beats of a written length ('1/4' -> 1, '1/8' -> 0.5), dots
 * applied. An unreadable length counts as one beat.
 * @param {string} length
 * @param {boolean|number} [dotted]
 * @returns {number}
 */
export function lengthBeats(length, dotted) {
  const [num, den] = String(length).split('/').map(Number);
  const beats = num && den ? (num * 4) / den : 1;
  return beats * dotFactor(dotted);
}

/** A note's written value in quarter-note beats (its dots included). */
export default function noteBeats(note) {
  return lengthBeats(note && note.length, note && note.dotted);
}

/**
 * How long a note SOUNDS, in quarter-note beats: a heard note event's (or
 * timeline onset's) `durationBeats` when it carries one — a tied note's
 * whole held length — else its written value.
 * @param {{length?: string, dotted?: boolean|number, durationBeats?: number}} note
 * @returns {number}
 */
export function soundingBeats(note) {
  if (note && Number.isFinite(note.durationBeats)) return note.durationBeats;
  return noteBeats(note);
}

/** A tie continuation ('continue' / 'stop'): held on from the note before, not struck. */
export function isTiedOn(note) {
  return !!note && (note.tie === 'continue' || note.tie === 'stop');
}
