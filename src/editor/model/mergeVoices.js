/**
 * mergeVoices — fold several voices (a grand staff's treble and bass) into
 * ONE voice of chords, losing no note: the song editor's grand staff → single
 * staff (the designer's ruling, 2026-11-24: "ALL notes from both voices go
 * onto that one staff").
 *
 * The voices are cut at every onset and release of either, so each slice is
 * one chord of whatever sounds through it (a rest where nothing does). A note
 * held across a cut is split there and TIED (`tie: 'start' | 'continue' |
 * 'stop'`, the shared schema resound-notation engraves and resound-sound
 * plays as one sound), so the rhythm and every pitch survive. A slice too
 * long for one note value is written as tied values (rests: plain rests).
 * A pitch both voices sound at once is kept once (a chord holds no pitch
 * twice). Pure: canonical notes in ({ pitch?, length, dotted? }), canonical
 * notes out.
 */

const TICKS_PER_WHOLE = 256;

// Note values longest first, in ticks (the merge writes a slice greedily)
const VALUES = [
  { length: '1/1', dotted: true },
  { length: '1/1' },
  { length: '1/2', dotted: true },
  { length: '1/2' },
  { length: '1/4', dotted: true },
  { length: '1/4' },
  { length: '1/8', dotted: true },
  { length: '1/8' },
  { length: '1/16', dotted: true },
  { length: '1/16' },
  { length: '1/32', dotted: true },
  { length: '1/32' },
  { length: '1/64' },
].map((v) => ({ ...v, ticks: ticksOf(v) }));

const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Ticks a canonical note lasts. */
function ticksOf(note) {
  const [n, d] = String(note.length).split('/').map(Number);
  if (!n || !d) return 0;
  return Math.round((n / d) * TICKS_PER_WHOLE * (note.dotted ? 1.5 : 1));
}

/** MIDI number of a pitch ('C4' = 60, 'Bb3', 'F#5'); NaN if it isn't one. */
export function midiOf(pitch) {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(pitch || '');
  if (!m) return NaN;
  const SHIFT = { '#': 1, b: -1 };
  const shift = SHIFT[m[2]] || 0;
  return (Number(m[3]) + 1) * 12 + LETTER_SEMITONES[m[1]] + shift;
}

/** The note values (longest first) that add up to `ticks`. */
function valuesFor(ticks) {
  const out = [];
  let left = ticks;
  for (const value of VALUES) {
    while (value.ticks <= left) {
      out.push(value);
      left -= value.ticks;
    }
  }
  return out;
}

const tiedIn = (note) => note.tie === 'stop' || note.tie === 'continue';
const tiedOut = (note) => note.tie === 'start' || note.tie === 'continue';

function withValue(base, value) {
  const out = { ...base, length: value.length };
  delete out.dotted;
  delete out.tie;
  if (value.dotted) out.dotted = true;
  return out;
}

/**
 * @param {Array<Array>} voices - each voice's notes (canonical; chords as arrays)
 * @returns {Array} one voice: notes, chords (arrays, low to high) and rests
 */
export default function mergeVoices(voices) {
  const spans = []; // every pitched note: when it sounds, in ticks
  const cuts = new Set([0]);
  (voices || []).forEach((notes) => {
    let at = 0;
    for (const entry of notes || []) {
      const members = (Array.isArray(entry) ? entry : [entry]).filter(Boolean);
      const first = members.find((m) => m.length);
      if (!first) continue;
      const start = at;
      const end = at + ticksOf(first);
      members.forEach((note) => {
        if (note.pitch) spans.push({ start, end, note });
      });
      at = end;
      cuts.add(at);
    }
  });
  spans.forEach(({ start, end }) => {
    cuts.add(start);
    cuts.add(end);
  });
  const times = [...cuts].sort((a, b) => a - b);

  const merged = [];
  for (let i = 0; i + 1 < times.length; i += 1) {
    const from = times[i];
    const to = times[i + 1];
    // What sounds through the slice, a pitch once (an attack before a hold)
    const sounding = spans
      .filter((s) => s.start <= from && s.end >= to)
      .sort((a, b) => (b.start === from) - (a.start === from));
    const seen = new Set();
    const members = sounding.filter((s) => {
      const key = midiOf(s.note.pitch);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    members.sort((a, b) => midiOf(a.note.pitch) - midiOf(b.note.pitch));

    const values = valuesFor(to - from);
    values.forEach((value, p) => {
      if (members.length === 0) {
        merged.push(withValue({}, value));
        return;
      }
      const chord = members.map(({ start, end, note }) => {
        const out = withValue(note, value);
        const into = p > 0 || from > start || tiedIn(note);
        const onward = p < values.length - 1 || to < end || tiedOut(note);
        if (into && onward) out.tie = 'continue';
        else if (into) out.tie = 'stop';
        else if (onward) out.tie = 'start';
        return out;
      });
      merged.push(chord.length === 1 ? chord[0] : chord);
    });
  }
  return merged;
}
