/**
 * A note's length in quarter-note beats ('1/4' -> 1, '1/8' -> 0.5; a dotted
 * note half as long again). An unreadable length counts as one beat.
 * @param {{length?: string, dotted?: boolean}} note
 * @returns {number}
 */
export default function noteBeats(note) {
  const [num, den] = String(note && note.length)
    .split('/')
    .map(Number);
  const beats = num && den ? (num * 4) / den : 1;
  return note && note.dotted ? beats * 1.5 : beats;
}
