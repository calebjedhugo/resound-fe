// Generates the POC onboarding world — NINE small portal-linked areas that
// teach every game element (except fountains) ONE at a time, wordlessly
// (v5, designer's round-4 restructure, 2026-07-11):
//
//   I.    poc-threshold — move (WASD), record (R), play (Space), first door.
//                         A locked FINALE PORTAL stands mid-room, wanting
//                         Twinkle (quarters + phrase-ending halves) nothing
//                         before area IX can perform — the demo's ending
//                         arrives through it
//   II.   poc-two-keys  — slots: two single-note doors in series force
//                         holding TWO notes at once (room 2 has an E4 echo,
//                         so even a deleted tape can always re-open the way)
//   III.  poc-duet      — sequencing: a two-note door [E5,G5] performed by
//                         ordering the tape (Space plays all slots in order)
//   IV.   poc-jam       — a CONTINUOUS singer beside a door corrupts its
//                         matching forever: two identical doors want the
//                         same note; the one with the VISIBLE plinth singer
//                         over its approach never opens, the clean one does.
//                         Both doors land in area V as separate entries —
//                         and the jam holds from BOTH sides (one door, two
//                         ears; ruled 2026-07-11)
//   V.    poc-dance     — the movable jam (designer's own design): two
//                         creatures parked before the exit, singing a
//                         synced tension-and-release duet (B3→C4 / F4→E4,
//                         tritone→major third: repel apart, pull together —
//                         a breathing oscillation) that CORRUPTS the door.
//                         The tool and the door are both a plain F4 whole:
//                         F4 net-REPELS both dancers and never attracts —
//                         playing it in front of the gate a few times
//                         shoves the pair out of earshot, then opens it
//   VI.   poc-pull      — the jam, weaponized: a free-standing continuous
//                         singer jams the exit — consonant playback PULLS
//                         it out of earshot, then the door hears you
//   VII.  poc-push      — dissonant playback REPELS; the pushed creature's
//                         own song opens the exit (creatures activate gates)
//   VIII. poc-clap      — claps shift creature timing: a D4/A4 pair on
//                         VISIBLE plinths flanking the exit sing in-phase
//                         quarter notes (a chord — corruption); one clap
//                         shifts one of them a beat and the chord becomes
//                         the alternating melody [D4,A4,D4,A4] — the door
//                         self-opens, forever (creatures activate gates)
//   IX.   poc-return    — THE STAR (finale): the entry door sits in a SIDE
//                         wall (the arrival forces a turn inside the frame
//                         — the look-back moment). A warm-up vestibule
//                         teaches quarter notes + repetition ([F4,F4] from
//                         ONE voice recorded twice; its hall face is the
//                         one-way alwaysOpen escape hatch), then a concert
//                         hall of SEVEN more voices — the eight ELEMENTS of
//                         Twinkle (quarter C D E F G A + HALF G + HALF C),
//                         one voice per element, placed in SONG ORDER along
//                         the hall path — and a central portal wanting the
//                         full corrected couplet, linked back to area I's
//                         mid-room finale gate. Crossing rolls the closing
//                         card.
//
//   (poc-climb was CUT in v5 — "if the puzzle doesn't NEED a ramp, there
//   should be no ramp". Elevation survives as the visible plinth pens.)
//
// DESIGN RULES HONORED (see DESIGN.md):
//   * Wordless; rooms only as big as their acoustics demand; one concept
//     per area; concepts WITNESSED (the jam, the dance) before REQUIRED.
//   * Key hints are PUZZLE-DRIVEN: each area declares `teaches`.
//   * ALL creatures are VISIBLE — no opaque pens. Penning, where needed,
//     is a cliff-edged plinth in plain sight.
//   * ONE DOOR, TWO EARS (ruled 2026-07-11): a linked pair shares its
//     heard-note state — a sound within source-range of EITHER face
//     corrupts (and can complete) the door, with no leak between the two
//     faces. The jam therefore holds from the far side.
//   * The TAPE model: Space performs every slot in order; a door opens
//     whenever its song occurs cleanly within the performance.
//   * STRICT element economy: matching is pitch- AND duration-exact, so
//     the economy tracks (pitch, length) ELEMENTS. Every exit door's
//     elements are first recordable in the door's own area or earlier, and
//     never fully performable from earlier areas alone. The finale's
//     six FRESH elements (quarter C/E/F/G + half G + half C) exist only in
//     area IX — carried takes can never open it early. F4|1/4 exists ONLY
//     in area IX (the named finale lock; F4 as a WHOLE is area V's tool).
//   * Non-stuck by construction, including DELETE: from every reachable
//     pocket, some boundary door is openable with elements recordable
//     INSIDE the pocket, or is an alwaysOpen face. The clap door needs no
//     exception anymore: its pair is recordable from the floor AND
//     re-performs the door forever from its plinths.
//   * RELAXED GUARDS (v5, forced by the dance pair entering the carried
//     set): with pitch classes {C,E,F,G,A,B} all carried after area V,
//     EVERY pitch class is consonant with something carried and dissonant
//     with something carried (exhaustively checked below). The old
//     absolute pull-guard ("nothing carried may push the pull jammer") and
//     push-guard ("nothing carried may pull the pusher") are therefore
//     unsatisfiable. Replacements: the pull room is an OPEN rectangle
//     (nowhere to wedge the jammer beyond recovery — the A4 pull always
//     reaches it) and the pusher is Bb5, the unique pitch class whose only
//     carried consonant class is G (the oldest, least-likely-taped note).
//     Both relaxations are flagged for the designer.
//   * Links are written bidirectionally, one song per pair.
//
// ⚠️  The poc-*.json files are HAND-EDITED in the game editor (173fd15) and
// drift from this generator BY DESIGN. This script is kept as the v5
// reference model + constraint checker only.
//
//   node puzzles/gen-poc.js          # check-only: build model + run asserts,
//                                    # writes NOTHING
//   node puzzles/gen-poc.js --write  # regenerate all nine JSONs — OVERWRITES
//                                    # the hand-edited files. Don't, unless
//                                    # you mean to reset the world to v5.
const fs = require('fs');
const path = require('path');

const WRITE = process.argv.includes('--write');

const WORLD_SCALE = 3;
const TEMPO = 100;
const KEY = 'C';
const TIME_SIG = [4, 4];
const LEAK = 6; // CLOSED_DOOR_LEAK_DISTANCE (core/constants.js)
const CLAP_RANGE = 7.5; // core/constants.js
const EYE = 1.8; // player eye height above their floor (GameState)
const ELEV = 3.0; // ELEVATION_HEIGHT
// Geometry background (documented for the level math):
//   * A creature on a 1-cell plinth can drift within its cell: cell half
//     (1.5) minus creature radius (0.9) leaves 0.6 of travel per axis,
//     0.85 on the diagonal (cliff edges pen it).
//   * Two creatures park at 1.8 apart (0.9 + 0.9) when forces converge.
//   * Recording needs playerDist <= range/2 — a plinth at elevation 2 puts
//     even the directly-underneath player 6 - 1.8 = 4.2 away, out of a
//     range-8 singer's recording reach.
const PLINTH_DRIFT = Math.hypot(0.6, 0.6);
const CREATURE_CONTACT = 1.8;

// Creature force kinematics (mirrors Creature.updateMovement + constants):
// velocity += FORCE*dt then *= DECEL, PASSES times per frame with the full
// frame dt. Terminal per-pass speed and the resulting sustained drift rate:
const FORCE = 15; // ATTRACTION/REPULSION_FORCE_STRENGTH
const DECEL = 0.85;
const PASSES = 2;
const FRAME_DT = 1 / 60;
const V_TERM = (FORCE * FRAME_DT * DECEL) / (1 - DECEL); // ~1.36 u/s
const DRIFT_PER_S = V_TERM * PASSES; // ~2.72 world units per second

// The finale song: Twinkle Twinkle Little Star, full couplet, CORRECTED
// rhythm (v5): each phrase ends on a HALF note. Eight distinct elements —
// quarter C D E F G A, half G, half C — one hall/vestibule voice each.
const TWINKLE = [
  ['C4', '1/4'],
  ['C4', '1/4'],
  ['G4', '1/4'],
  ['G4', '1/4'],
  ['A4', '1/4'],
  ['A4', '1/4'],
  ['G4', '1/2'],
  ['F4', '1/4'],
  ['F4', '1/4'],
  ['E4', '1/4'],
  ['E4', '1/4'],
  ['D4', '1/4'],
  ['D4', '1/4'],
  ['C4', '1/2'],
].map(([pitch, length]) => ({ pitch, length }));

// --- harmony helpers (mirror src/core/HarmonyAnalyzer.js) ---
const NOTE_MAP = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};
const pitchToMidi = (pitch) => {
  const [, name, oct] = pitch.match(/^([A-G][#b]?)(\d+)$/);
  return NOTE_MAP[name] + (parseInt(oct, 10) + 1) * 12;
};
const interval = (a, b) => Math.abs(pitchToMidi(a) - pitchToMidi(b)) % 12;
const classify = (semis) => {
  if (semis === 0 || semis === 5 || semis === 7) return 'perfect';
  if (semis === 3 || semis === 4 || semis === 8 || semis === 9) return 'consonant';
  return 'dissonant';
};

// --- song helpers ---
// Gate songs accept 'C4' strings (whole notes) or {pitch,length} objects.
const normalizeSong = (song) =>
  song.map((e) => (typeof e === 'string' ? { pitch: e, length: '1/1' } : e));
const songKey = (song) => JSON.stringify(normalizeSong(song));
const songPitches = (song) => normalizeSong(song).map((e) => e.pitch);
const elementOf = (pitch, length) => `${pitch}|${length}`;
const songElements = (song) => normalizeSong(song).map((e) => elementOf(e.pitch, e.length));
const LENGTH_BEATS = { '1/1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5 };
const songBeats = (song) => normalizeSong(song).reduce((sum, n) => sum + LENGTH_BEATS[n.length], 0);

// --- creature helpers ---
// A creature carries a full song (array of {pitch,length}); single-pitch
// creatures use the `note(pitch, len)` sugar.
const note = (pitch, len = '1/1') => [{ pitch, length: len }];
const creatureElements = (c) => c.song.map((n) => elementOf(n.pitch, n.length));
const creaturePitches = (c) => c.song.map((n) => n.pitch);

// --- geometry helpers (world units; positions carry an elevation level y) ---
const worldY = (cell) => (cell.y || 0) * ELEV;
const dist3D = (a, b) =>
  Math.hypot((a.x - b.x) * WORLD_SCALE, worldY(a) - worldY(b), (a.z - b.z) * WORLD_SCALE);
// Distance from a player standing at (x, z, level) — eye height included —
// to a creature standing at its floor.
const playerDist = (p, pLevel, c) =>
  Math.hypot((p.x - c.x) * WORLD_SCALE, pLevel * ELEV + EYE - worldY(c), (p.z - c.z) * WORLD_SCALE);

// --- checks ---
const checks = [];
const assert = (name, cond, detail) => checks.push({ name, ok: !!cond, detail: String(detail) });

// --- area assembly ---
function makeArea(id, name, grid) {
  return {
    id,
    name,
    grid,
    walls: new Set(),
    creatures: {}, // key -> {x,z,y?,song,range,interval}
    gates: {}, // gateId -> {x,z,y?,song,link?,alwaysOpen?,ending?}
    cleansers: [], // [{x,z,y?}] — walkable tiles that empty the tape on entry
    ramps: [],
    floors: [],
    spawn: null,
    clapDisplacement: null,
    teaches: [],
  };
}
const key = (x, z) => `${x},${z}`;
const addWall = (area, x, z) => {
  if (x < 0 || x >= area.grid || z < 0 || z >= area.grid) return; // perimeter auto-generates
  area.walls.add(key(x, z));
};
const wallRow = (area, z, gaps = []) => {
  for (let x = 0; x < area.grid; x += 1) if (!gaps.includes(x)) addWall(area, x, z);
};

// =========================================================================
// AREA I — poc-threshold: the core loop (move, record, play, cross) — and
// the locked finale portal, mid-room, that the whole world builds toward
// =========================================================================
const A1 = makeArea('poc-threshold', 'I. Threshold', 10);
A1.spawn = { x: 5, y: 0, z: 8 };
A1.teaches = ['move', 'record', 'playback'];
// The voice lives in a corner: its song (and the player's C4 performances
// near it) must stay out of earshot of both doors — the finale portal's
// matching now spans BOTH its faces (one door, two ears).
A1.creatures.voice = { x: 8, y: 0, z: 8, song: note('C4'), range: 8, interval: 8 };
wallRow(A1, 0, [5]); // north wall (grid edge — no dead strip) holding the exit
A1.gates.exit = {
  x: 5,
  y: 0,
  z: 0,
  song: ['C4'],
  link: { puzzleId: 'poc-two-keys', gateId: 'entry' },
};
// The finale portal: free-standing mid-room, wanting the full corrected
// Twinkle couplet — elements that exist only in area IX. Every player
// red-flashes it with their whole-note C4 in minute one; crossing it (from
// area IX) ends the demo (ending: true → the closing overlay).
A1.gates.finale = {
  x: 4,
  y: 0,
  z: 4,
  song: TWINKLE,
  link: { puzzleId: 'poc-return', gateId: 'exit' },
  ending: true,
};

// =========================================================================
// AREA II — poc-two-keys: slots (hold two notes at once), no timing at all
// =========================================================================
// 2026-07-12 RE-KEY pass (Caleb): the two doors in series are now solved with
// ONE slot by RE-RECORDING, not two. Room 1 holds ONLY E4 (record it, open the
// inner door); room 2 holds ONLY G4 (RE-RECORD over the same slot, open the
// exit). So the player never needs a second slot here and never plays two
// notes at a one-note door — the grow-a-slot lesson moves to area III (the
// duet), the first place a second slot is genuinely required. Area II teaches
// nothing new via hints (rerecord is taught by necessity). A 1-wide arrival
// CORRIDOR holds a mandatory CLEANSING TILE (crossed on the way in; wipes the
// spent C4). The play space is a narrow x=3..7 band; the self-solve clearances
// (every creature >13u off every gate) stack the DEPTH — each creature sits 4
// rows off its own door AND the door beyond it.
const A2 = makeArea('poc-two-keys', 'II. Two Keys', 17);
A2.spawn = { x: 5, y: 0, z: 15 };
A2.teaches = []; // rerecord is taught by necessity; no new hint verb here
wallRow(A2, 16, [5]); // south wall (grid edge) holding the entry door
wallRow(A2, 15, [5]); // corridor wall (spawn row)
wallRow(A2, 14, [5]); // corridor wall — the TILE row, terminal: room 1 is z<=13
wallRow(A2, 8, [5]); // inner wall holding the E4 door (room 1 / room 2)
wallRow(A2, 0, [5]); // north wall (grid edge) holding the G4 exit door
// Wall the flanks so the play space is a narrow x=3..7 band. Rows z=8 (inner),
// 14/15 (corridor), 16 (entry), 0 (exit) are already walled by the rows above.
[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13].forEach((z) => {
  addWall(A2, 2, z); // west wall of the band
  addWall(A2, 8, z); // east wall of the band
});
// The cleansing tile is the TERMINAL corridor cell — crossing it enters room 1.
A2.cleansers.push({ x: 5, y: 0, z: 14 });
// Room 1: E4 only — record it (one slot), open the inner door. Held >13u off
// the entry and the inner door.
A2.creatures.key1 = { x: 3, y: 0, z: 12, song: note('E4'), range: 7, interval: 8 };
// Room 2: G4 only — RE-RECORD over the E4 slot, open the exit. Held >13u off
// the inner door and the exit.
A2.creatures.key2 = { x: 7, y: 0, z: 4, song: note('G4'), range: 7, interval: 8 };
A2.gates.entry = {
  x: 5,
  y: 0,
  z: 16,
  song: ['C4'],
  link: { puzzleId: 'poc-threshold', gateId: 'exit' },
};
A2.gates.inner = { x: 5, y: 0, z: 8, song: ['E4'] }; // plain gate, not a door
A2.gates.exit = { x: 5, y: 0, z: 0, song: ['G4'], link: { puzzleId: 'poc-duet', gateId: 'entry' } };

// =========================================================================
// AREA III — poc-duet: ordering the tape into a two-note melody
// (E5/G5, NOT area II's E4/G4 — carried notes must never open a later
// door; matching is octave-exact, so the fifth above is a genuinely fresh
// pair. E5-G5 is consonant, so the pair stays out of mutual earshot.)
// Shrunk to grid 10 in v5 (rooms only as big as their acoustics demand).
// The pair sings HALF notes (designer's call, 2026-07-11): two halves fill
// ONE 4/4 measure, so the door's staff reads as a single system instead of
// wrapping two whole-note measures. Matching is duration-exact, so the
// creatures sing halves too, and the linked poc-jam/entry face shares them.
// =========================================================================
const DUET_SONG = [
  { pitch: 'E5', length: '1/2' },
  { pitch: 'G5', length: '1/2' },
];
// 2026-07-12: pulled in tight (was grid 10, sources 7 cells apart across a
// wide room — "much too large"). Same lesson (record each note, order the two
// slots), but a NARROW x=2..6 band with the pair a few steps off the entry
// path. Width is walled to the minimum; the pair's self-solve clearance from
// both gates (>13u) is all that sets the depth.
const A3 = makeArea('poc-duet', 'III. The Duet', 9);
A3.spawn = { x: 4, y: 0, z: 7 };
A3.teaches = ['slots'];
wallRow(A3, 8, [4]); // south wall (grid edge) holding the entry door
wallRow(A3, 0, [4]); // north wall (grid edge) holding the exit door
[1, 2, 3, 4, 5, 6, 7].forEach((z) => {
  addWall(A3, 1, z); // west wall of the band
  addWall(A3, 7, z); // east wall of the band
});
A3.creatures.east = { x: 2, y: 0, z: 4, song: note('E5', '1/2'), range: 7, interval: 8 };
A3.creatures.west = { x: 6, y: 0, z: 4, song: note('G5', '1/2'), range: 7, interval: 8 };
A3.gates.entry = {
  x: 4,
  y: 0,
  z: 8,
  song: ['G4'],
  link: { puzzleId: 'poc-two-keys', gateId: 'exit' },
};
A3.gates.exit = {
  x: 4,
  y: 0,
  z: 0,
  song: DUET_SONG,
  link: { puzzleId: 'poc-jam', gateId: 'entry' },
};

// =========================================================================
// AREA IV — poc-jam: a continuous singer beside a door corrupts it forever
// (the lesson for areas V/VI, at zero risk). Two IDENTICAL doors in the
// north wall want the same note [A3]; the jammer stands ON A VISIBLE
// PLINTH (elevation 2, cliff-penned) directly over the west door's
// approach — the player literally walks under the singing jammer to try
// the door that can never open. Same tape, two doors: the jammed one never
// even fades, the clean one opens. The jammed door is never required.
// With the both-ears rule the jam holds from area V's side too.
// =========================================================================
const A4 = makeArea('poc-jam', 'IV. The Jam', 13);
A4.spawn = { x: 6, y: 0, z: 11 };
wallRow(A4, 12, [6]); // south wall (grid edge) holding the entry door
wallRow(A4, 0, [3, 10]); // north wall (grid edge) holding BOTH exit doors
// The jammer's plinth: 1 cell, elevation 2, directly south of door J. The
// slab is walkable UNDERNEATH (the door's approach), the top is cliff-
// penned and ramp-less, and even the player directly below stands
// 6 - 1.8 = 4.2 away — outside the range-8 singer's recording reach (4).
A4.floors.push({ elevation: 2, x1: 3, z1: 1, x2: 3, z2: 1 });
A4.creatures.jammer = { x: 3, y: 2, z: 1, song: note('B5'), range: 8, interval: 4 };
A4.creatures.voice = { x: 6, y: 0, z: 6, song: note('A3'), range: 7, interval: 8 };
A4.gates.entry = {
  x: 6,
  y: 0,
  z: 12,
  song: DUET_SONG, // linked to poc-duet/exit — one door, one song (half notes)
  link: { puzzleId: 'poc-duet', gateId: 'exit' },
};
A4.gates['exit-jammed'] = {
  x: 3,
  y: 0,
  z: 0,
  song: ['A3'],
  link: { puzzleId: 'poc-dance', gateId: 'entry-a' },
};
A4.gates['exit-clean'] = {
  x: 10,
  y: 0,
  z: 0,
  song: ['A3'],
  link: { puzzleId: 'poc-dance', gateId: 'entry-b' },
};

// =========================================================================
// AREA V — poc-dance: the movable jam, the designer's tension-and-release
// design. Two creatures parked before the exit sing a synced two-note
// duet (from test-003 "Harmonic Motion"): tension B3+F4 (tritone — they
// REPEL), release C4+E4 (major third — they PULL back together). Forces
// are equal-and-opposite, so the pair breathes around a fixed centroid in
// front of the door, corrupting it forever. The player's tool and the exit
// song are BOTH a plain F4 whole note: F4 vs B3→C4 = tritone then perfect
// fourth; F4 vs F4→E4 = unison then minor second — NET REPULSION, and no
// note of the duet is ever attracted. Perform F4 between the pair and the
// door a few times: the duet is shoved out of earshot, the window goes
// quiet, and the same F4 opens the door.
// =========================================================================
const A5 = makeArea('poc-dance', 'V. The Dance', 15);
A5.spawn = { x: 7, y: 0, z: 13 };
A5.teaches = []; // no new hint verb (forces aren't hinted); suppress all hints
wallRow(A5, 14, [3, 10]); // south wall (grid edge) holding BOTH entries
wallRow(A5, 0, [7]); // north wall (grid edge) holding the exit door
const DANCE_SONG_A = [
  { pitch: 'B3', length: '1/2' },
  { pitch: 'C4', length: '1/2' },
];
const DANCE_SONG_B = [
  { pitch: 'F4', length: '1/2' },
  { pitch: 'E4', length: '1/2' },
];
// interval == song length (4 beats): the duet never stops — a continuous
// corruptor, like the jam, but ALIVE. Same phase, same interval: the
// simultaneous intervals are tritone (beat 0) then major third (beat 2).
A5.creatures.tension = { x: 6, y: 0, z: 2, song: DANCE_SONG_A, range: 15, interval: 4 };
A5.creatures.release = { x: 7, y: 0, z: 2, song: DANCE_SONG_B, range: 15, interval: 4 };
A5.creatures.voice = { x: 1, y: 0, z: 8, song: note('F4'), range: 7, interval: 8 };
A5.gates['entry-a'] = {
  x: 3,
  y: 0,
  z: 14,
  song: ['A3'],
  link: { puzzleId: 'poc-jam', gateId: 'exit-jammed' },
};
A5.gates['entry-b'] = {
  x: 10,
  y: 0,
  z: 14,
  song: ['A3'],
  link: { puzzleId: 'poc-jam', gateId: 'exit-clean' },
};
A5.gates.exit = {
  x: 7,
  y: 0,
  z: 0,
  song: ['F4'],
  link: { puzzleId: 'poc-pull', gateId: 'entry' },
};

// =========================================================================
// AREA VI — poc-pull: the jam, weaponized — and the pull solves it
// An OPEN room (deliberately: nowhere to wedge the jammer beyond the
// pull's recovery — see the relaxed-guard note in the header). A
// free-standing CONTINUOUS C5 singer stands beside the only exit, jamming
// it exactly like area IV's plinth singer — but this one has no pen. The
// local voice (A4, consonant with C5) is the tool: record it, play it near
// the jammer, and the jammer follows you. Drag it out of the door's
// earshot, walk back, perform A4 in the quiet.
// =========================================================================
const A6 = makeArea('poc-pull', 'VI. The Pull', 12);
A6.spawn = { x: 6, y: 0, z: 10 };
wallRow(A6, 11, [6]); // south wall (grid edge) holding the entry door
wallRow(A6, 0, [6]); // north wall (grid edge) holding the exit door
A6.creatures.voice = { x: 2, y: 0, z: 6, song: note('A4'), range: 7, interval: 8 };
A6.creatures.jammer = { x: 6, y: 0, z: 2, song: note('C5'), range: 8, interval: 4 };
A6.gates.entry = {
  x: 6,
  y: 0,
  z: 11,
  song: ['F4'],
  link: { puzzleId: 'poc-dance', gateId: 'exit' },
};
A6.gates.exit = { x: 6, y: 0, z: 0, song: ['A4'], link: { puzzleId: 'poc-push', gateId: 'entry' } };

// =========================================================================
// AREA VII — poc-push: dissonance repels; the pushed creature opens the
// door. The pusher is Bb5 (v5): the tool E5 is dissonant with it (pushes),
// and the ONLY carried consonant class is G — see the relaxed-guard note.
// The unused flanks of the corridor band are walled off (designer note).
// =========================================================================
const A7 = makeArea('poc-push', 'VII. The Push', 12);
A7.spawn = { x: 6, y: 0, z: 10 };
wallRow(A7, 11, [6]); // south wall (grid edge) holding the entry door
wallRow(A7, 8, [6]); // entry room boundary
for (let z = 2; z <= 7; z += 1) {
  addWall(A7, 5, z); // corridor west wall
  addWall(A7, 7, z); // corridor east wall
}
wallRow(A7, 0, [9]); // north wall (grid edge) holding the exit door
// Wall off the unused flanks — the room is exactly the corridor, the
// door approach strip, and the entry room.
for (let z = 1; z <= 7; z += 1) {
  for (let x = 0; x <= 4; x += 1) addWall(A7, x, z);
  for (let x = 8; x <= 11; x += 1) if (z >= 2) addWall(A7, x, z);
}
addWall(A7, 5, 1);
addWall(A7, 10, 1);
addWall(A7, 11, 1);
A7.creatures.voice = { x: 10, y: 0, z: 9, song: note('E5'), range: 7, interval: 6 };
A7.creatures.pusher = { x: 6, y: 0, z: 5, song: note('Bb5'), range: 7, interval: 6 };
A7.gates.entry = {
  x: 6,
  y: 0,
  z: 11,
  song: ['A4'],
  link: { puzzleId: 'poc-pull', gateId: 'exit' },
};
A7.gates.exit = {
  x: 9,
  y: 0,
  z: 0,
  song: ['Bb5'],
  link: { puzzleId: 'poc-clap', gateId: 'entry' },
};

// =========================================================================
// AREA VIII — poc-clap: clap timing turns the pair's chord into the melody
// (v5 redesign): the D4/A4 pair stands on VISIBLE 1-cell plinths
// (elevation 1, cliff-penned — a fixed position keeps the empty-tape
// escape guarantee: the pair re-performs the door forever) flanking the
// exit. Both sing a single QUARTER note with a one-beat rest (interval 2),
// starting IN PHASE: a D+A chord corrupts the door. The door wants a whole
// measure [D4,A4,D4,A4]; one clap (displacement 1/4 = one beat) shifts one
// creature and the chord becomes a continuous alternating melody — the
// door hears its song and self-opens. Creatures activate gates, again.
// =========================================================================
const A8 = makeArea('poc-clap', 'VIII. The Clap', 13);
A8.spawn = { x: 6, y: 0, z: 11 };
A8.teaches = ['clap'];
A8.clapDisplacement = '1/4'; // one clap = one beat: the chord resolves in one
wallRow(A8, 12, [6]); // south wall (grid edge) holding the entry door
wallRow(A8, 0, [6]); // north wall (grid edge) holding the exit door
A8.floors.push({ elevation: 1, x1: 3, z1: 1, x2: 3, z2: 1 });
A8.floors.push({ elevation: 1, x1: 9, z1: 1, x2: 9, z2: 1 });
A8.creatures.first = { x: 3, y: 1, z: 1, song: note('D4', '1/4'), range: 15, interval: 2 };
A8.creatures.second = { x: 9, y: 1, z: 1, song: note('A4', '1/4'), range: 15, interval: 2 };
A8.gates.entry = {
  x: 6,
  y: 0,
  z: 12,
  song: ['Bb5'],
  link: { puzzleId: 'poc-push', gateId: 'exit' },
};
A8.gates.exit = {
  x: 6,
  y: 0,
  z: 0,
  song: [
    { pitch: 'D4', length: '1/4' },
    { pitch: 'A4', length: '1/4' },
    { pitch: 'D4', length: '1/4' },
    { pitch: 'A4', length: '1/4' },
  ],
  link: { puzzleId: 'poc-return', gateId: 'entry' },
};

// =========================================================================
// AREA IX — poc-return: THE STAR — warm-up vestibule + concert hall finale
//
// The ENTRY sits in the EAST wall: the player has traveled north the whole
// game, so arriving here forces a turn inside the doorframe — and the turn
// reveals the view back through the door (the moment the designer liked in
// the cut climb area, preserved by orientation).
//
// The vestibule (south strip) teaches quarter notes and repetition: one F4
// voice singing a single QUARTER note, and a door wanting [F4,F4] — record
// the same voice twice, two slots, play. That door is a ONE-WAY pair into
// the hall: the hall face is alwaysOpen (walk back through it freely), so
// the hall can never strand an emptied tape — F4 stays re-recordable.
//
// The hall holds the ELEMENTS of Twinkle — seven more voices (quarter C D
// E G A, HALF G, HALF C), one per element, placed in SONG ORDER along the
// hall walls (the vestibule's F4 doubles as the song's F element) — and
// the central portal wants the full corrected couplet, linked to area I's
// mid-room finale gate. Assemble the tape, perform it in the quiet, walk
// through, take the bow.
// =========================================================================
// GEOMETRY (grid 21): a straight north–south SPINE at x=5. The player enters
// from the EAST wall into a 1-wide vestibule corridor (row z=19), crosses the
// mandatory cleanser, records the warm-up voice, opens the warm-up door, and
// walks the spine north — passing seven creatures, each parked at the end of
// its own 2-deep dead-end passage (a WEST + EAST pair per "station") in SONG
// ORDER — to the finale portal in the north wall.
//
//        (portal exit, x5 z0, north wall)
//                     |  spine
//     cHalf ── (4,4)──┤            D:  z4   cHalf(W)
//                     |
//        e1 ──(4,7)───┼───(6,7)── d1   C:  z7   e1(W)  d1(E)
//                     |
//        a1 ──(4,10)──┼──(6,10)── gHalf B:  z10  a1(W)  gHalf(E)
//                     |
//        c1 ──(4,13)──┼──(6,13)── g1   A:  z13  c1(W)  g1(E)
//                     |
//        (warm-up door pair, x5 z17/z18 — one-way into the hall)
//                     |
//   fVoice(1,20) ── vestibule corridor row 19 ── [cleanser x10] ── entry(20,19)
//
const A9 = makeArea('poc-return', 'IX. The Star', 21);
A9.spawn = { x: 19, y: 0, z: 19 }; // just west of the entry, in the vestibule
A9.teaches = []; // slots was taught once, at area III (each lesson happens once)
// fVoice sings the warm-up F4 in the vestibule (south corridor). Every hall
// voice sits at the dead end of its own passage, in SONG ORDER walking the
// spine from the warm-up door (south) to the portal (north):
// C C G G A A G(half) | F F E E D D C(half) — F is fVoice, already in hand.
A9.creatures.fVoice = { x: 1, y: 0, z: 20, song: note('F4', '1/4'), range: 7, interval: 4 };
A9.creatures.c1 = { x: 3, y: 0, z: 13, song: note('C4', '1/4'), range: 7, interval: 4 };
A9.creatures.g1 = { x: 7, y: 0, z: 13, song: note('G4', '1/4'), range: 7, interval: 4 };
A9.creatures.a1 = { x: 3, y: 0, z: 10, song: note('A4', '1/4'), range: 7, interval: 4 };
A9.creatures.gHalf = { x: 7, y: 0, z: 10, song: note('G4', '1/2'), range: 7, interval: 4 };
A9.creatures.e1 = { x: 3, y: 0, z: 7, song: note('E4', '1/4'), range: 7, interval: 4 };
A9.creatures.d1 = { x: 7, y: 0, z: 7, song: note('D4', '1/4'), range: 7, interval: 4 };
A9.creatures.cHalf = { x: 3, y: 0, z: 4, song: note('C4', '1/2'), range: 7, interval: 4 };
const WARMUP_SONG = [
  { pitch: 'F4', length: '1/4' },
  { pitch: 'F4', length: '1/4' },
];
A9.gates.entry = {
  x: 20,
  y: 0,
  z: 19,
  song: [
    { pitch: 'D4', length: '1/4' },
    { pitch: 'A4', length: '1/4' },
    { pitch: 'D4', length: '1/4' },
    { pitch: 'A4', length: '1/4' },
  ],
  link: { puzzleId: 'poc-clap', gateId: 'exit' },
};
// The warm-up door: an in-level ONE-WAY pair across the vestibule/hall divider,
// on the spine. The vestibule face wants [F4,F4]; the hall face is alwaysOpen
// (escape hatch — an emptied tape can always walk back and re-record F4).
A9.gates['warmup-in'] = {
  x: 5,
  y: 0,
  z: 18,
  song: WARMUP_SONG,
  link: { puzzleId: 'poc-return', gateId: 'warmup-out' },
};
A9.gates['warmup-out'] = {
  x: 5,
  y: 0,
  z: 17,
  song: WARMUP_SONG,
  link: { puzzleId: 'poc-return', gateId: 'warmup-in' },
  alwaysOpen: true,
};
A9.gates.exit = {
  x: 5,
  y: 0,
  z: 0,
  song: TWINKLE,
  link: { puzzleId: 'poc-threshold', gateId: 'finale' },
};
// The mandatory cleanser: the sole path from the entry to the warm-up door is
// the 1-wide vestibule corridor, so this tile is unavoidable on the way in.
A9.cleansers.push({ x: 10, y: 0, z: 19 });
// Carve the walkable footprint; every other cell is wall.
{
  const openCells = new Set();
  const open = (x, z) => openCells.add(key(x, z));
  for (let x = 1; x <= 19; x += 1) open(x, 19); // vestibule corridor (1-wide)
  for (let z = 1; z <= 16; z += 1) open(5, z); // the spine
  // stations: [spineRow, hasEastCreature] — record cell then dead-end creature
  [
    [13, true],
    [10, true],
    [7, true],
    [4, false],
  ].forEach(([z, hasEast]) => {
    open(4, z); // west record cell
    if (hasEast) open(6, z); // east record cell
  });
  Object.values(A9.creatures).forEach((c) => open(c.x, c.z)); // creatures stand on open cells
  open(A9.spawn.x, A9.spawn.z);
  const gateCells = new Set(Object.values(A9.gates).map((g) => key(g.x, g.z)));
  for (let x = 0; x < A9.grid; x += 1)
    for (let z = 0; z < A9.grid; z += 1)
      if (!openCells.has(key(x, z)) && !gateCells.has(key(x, z))) addWall(A9, x, z);
}

const AREAS = [A1, A2, A3, A4, A5, A6, A7, A8, A9];
const areaById = Object.fromEntries(AREAS.map((a) => [a.id, a]));

// =========================================================================
// Walkability model + BFS (mirrors ElevationGrid: slabs walkable on top AND
// beneath; ground walls block level 0; layers change only via ramps; cliffs
// block). UNLINKED gates are passable (play-to-pass walk-throughs); LINKED
// gates teleport — a SAME-AREA pair (the warm-up door) is traversed by
// stepping into one face and emerging beside its partner. teleport modes:
//   'all'            - every same-area pair crosses (the player, eventually)
//   'alwaysOpenOnly' - only alwaysOpen faces cross (an empty-tape player)
//   'none'           - no crossings (pocket enumeration)
// =========================================================================
function walkableLevels(area, x, z) {
  if (x < 0 || x >= area.grid || z < 0 || z >= area.grid) return [];
  const levels = new Set([0]);
  area.floors.forEach((f) => {
    if (x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2) levels.add(f.elevation);
  });
  if (area.walls.has(key(x, z))) levels.delete(0);
  return [...levels];
}

function reachable(area, start, extraBlocked = [], teleport = 'all') {
  const blocked = new Set(extraBlocked);
  const gateAt = new Map();
  Object.entries(area.gates).forEach(([gid, g]) => {
    gateAt.set(key(g.x, g.z), { gid, ...g });
    if (g.link) blocked.add(key(g.x, g.z));
  });
  const rampCells = new Map(area.ramps.map((r) => [key(r.x, r.z), r]));
  const nodeKey = (x, z, l) => `${x},${z},${l}`;
  const passable = (x, z, l) =>
    !blocked.has(key(x, z)) && !rampCells.has(key(x, z)) && walkableLevels(area, x, z).includes(l);
  const queue = [[start.x, start.z, start.y || 0]];
  const seen = new Set([nodeKey(...queue[0])]);
  const push = (x, z, l) => {
    if (!seen.has(nodeKey(x, z, l))) {
      seen.add(nodeKey(x, z, l));
      queue.push([x, z, l]);
    }
  };
  const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  while (queue.length) {
    const [x, z, l] = queue.shift();
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dx, dz]) => {
      const nx = x + dx;
      const nz = z + dz;
      if (passable(nx, nz, l)) push(nx, nz, l);
      // Stepping into a same-area linked face emerges beside its partner
      const g = gateAt.get(key(nx, nz));
      const crossable =
        g &&
        g.link &&
        g.link.puzzleId === area.id &&
        area.gates[g.link.gateId] &&
        (teleport === 'all' || (teleport === 'alwaysOpenOnly' && g.alwaysOpen));
      if (crossable) {
        const partner = area.gates[g.link.gateId];
        const lvl = partner.y || 0;
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].forEach(([px, pz]) => {
          if (passable(partner.x + px, partner.z + pz, lvl))
            push(partner.x + px, partner.z + pz, lvl);
        });
      }
      const ramp = rampCells.get(key(nx, nz));
      if (ramp && !blocked.has(key(nx, nz))) {
        const [hx, hz] = DIRS[ramp.direction];
        const high = { x: ramp.x + hx, z: ramp.z + hz };
        const low = { x: ramp.x - hx, z: ramp.z - hz };
        if (x === low.x && z === low.z && l === ramp.y && passable(high.x, high.z, ramp.y + 1))
          push(high.x, high.z, ramp.y + 1);
        if (x === high.x && z === high.z && l === ramp.y + 1 && passable(low.x, low.z, ramp.y))
          push(low.x, low.z, ramp.y);
      }
    });
  }
  return seen;
}
const canReach = (seen, x, z, l = 0) => seen.has(`${x},${z},${l}`);
const reachesAdjacent = (seen, cell, level = 0) =>
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dz]) => canReach(seen, cell.x + dx, cell.z + dz, level));
const minApproach = (area, seen, creature) => {
  let best = Infinity;
  seen.forEach((node) => {
    const [x, z, l] = node.split(',').map(Number);
    best = Math.min(best, playerDist({ x, z }, l, creature));
  });
  return best;
};

// =========================================================================
// SOUND ROUTE MODEL (mirrors ListeningManager + PortalManager, v5):
// - same area: direct 3D distance; a same-area PAIR face also hears from
//   its partner face (one door, two ears — min of the two).
// - across ONE seam (the engine routes a single door hop): through each
//   door joining the two areas, dist(source, near face) + dist(far face,
//   listener) — and when the LISTENER IS the far face, that second leg and
//   the leak cost NOTHING (the pair-face leg is free).
// Assertions compare routes against range + LEAK as a safety margin.
// =========================================================================
const DOORS = [];
{
  const seen = new Set();
  AREAS.forEach((area) => {
    Object.entries(area.gates).forEach(([gid, gate]) => {
      if (!gate.link) return;
      const target = areaById[gate.link.puzzleId];
      const partner = target && target.gates[gate.link.gateId];
      if (!partner) return;
      const k = [`${area.id}:${gid}`, `${gate.link.puzzleId}:${gate.link.gateId}`].sort().join('|');
      if (seen.has(k)) return;
      seen.add(k);
      DOORS.push({
        aArea: area,
        aGid: gid,
        aGate: gate,
        bArea: target,
        bGid: gate.link.gateId,
        bGate: partner,
      });
    });
  });
}
/** Faces of the door containing gate (area,gid), or null. */
const doorOf = (area, gid) =>
  DOORS.find((d) => (d.aArea === area && d.aGid === gid) || (d.bArea === area && d.bGid === gid)) ||
  null;
const partnerOf = (area, gid) => {
  const d = doorOf(area, gid);
  if (!d) return null;
  return d.aArea === area && d.aGid === gid
    ? { area: d.bArea, gid: d.bGid, gate: d.bGate }
    : { area: d.aArea, gid: d.aGid, gate: d.aGate };
};
/**
 * Minimum effective distance from a creature (in its own area) to a
 * listener gate, over every route the engine offers. Infinity when no
 * route connects.
 */
function minHearingDistance(cArea, c, lArea, lGid) {
  const listener = lArea.gates[lGid];
  let best = Infinity;
  if (cArea === lArea) {
    best = dist3D(c, listener);
    // Same-area pair: the listener also hears through its partner face
    const p = partnerOf(lArea, lGid);
    if (p && p.area === lArea) best = Math.min(best, dist3D(c, p.gate));
  }
  for (const d of DOORS) {
    let near;
    let far;
    let farGid;
    let farArea;
    if (d.aArea === cArea && d.bArea === lArea) {
      near = d.aGate;
      far = d.bGate;
      farGid = d.bGid;
      farArea = d.bArea;
    } else if (d.bArea === cArea && d.aArea === lArea) {
      near = d.bGate;
      far = d.aGate;
      farGid = d.aGid;
      farArea = d.aArea;
    } else {
      continue; // eslint-disable-line no-continue
    }
    if (cArea === lArea) continue; // eslint-disable-line no-continue -- direct already covers
    const ownDoor = farArea === lArea && farGid === lGid;
    const route = dist3D(c, near) + (ownDoor ? 0 : dist3D(far, listener));
    if (route < best) best = route;
  }
  return best;
}

// =========================================================================
// CHECKS
// =========================================================================

// --- structural hygiene ---
AREAS.forEach((area) => {
  const occupied = new Map();
  const claim = (what, x, z, level = 0) => {
    const k = `${key(x, z)}@${level}`;
    assert(
      `${area.id}: ${what} at (${x},${z}) L${level} does not collide with ${
        occupied.get(k) || 'anything'
      }`,
      !occupied.has(k),
      occupied.get(k) || 'free'
    );
    occupied.set(k, what);
  };
  area.walls.forEach((k) => occupied.set(`${k}@0`, 'wall'));
  Object.entries(area.creatures).forEach(([n, c]) => claim(`creature ${n}`, c.x, c.z, c.y || 0));
  Object.entries(area.gates).forEach(([n, g]) => claim(`gate ${n}`, g.x, g.z, g.y || 0));
  area.ramps.forEach((r) => claim('ramp', r.x, r.z, r.y || 0));
  assert(
    `${area.id}: spawn cell is open`,
    !occupied.has(`${key(area.spawn.x, area.spawn.z)}@${area.spawn.y || 0}`),
    key(area.spawn.x, area.spawn.z)
  );
  const seen = reachable(area, area.spawn);
  Object.entries(area.gates).forEach(([n, g]) => {
    assert(`${area.id}: gate ${n} has a reachable adjacent cell`, reachesAdjacent(seen, g), n);
  });
});

// --- link graph: bidirectional, song-unified, ids resolve ---
AREAS.forEach((area) => {
  Object.entries(area.gates).forEach(([gid, gate]) => {
    if (!gate.link) return;
    const target = areaById[gate.link.puzzleId];
    const partner = target && target.gates[gate.link.gateId];
    assert(
      `${area.id}/${gid}: link target exists`,
      !!partner,
      `${gate.link.puzzleId}/${gate.link.gateId}`
    );
    if (!partner) return;
    assert(
      `${area.id}/${gid}: link is bidirectional`,
      partner.link && partner.link.puzzleId === area.id && partner.link.gateId === gid,
      `${partner.link && partner.link.puzzleId}/${partner.link && partner.link.gateId}`
    );
    assert(
      `${area.id}/${gid}: linked pair shares ONE song`,
      songKey(gate.song) === songKey(partner.song),
      `${songKey(gate.song)} vs ${songKey(partner.song)}`
    );
  });
});

// --- self-solve / corruption separation (door-level, one door two ears) ---
// A creature within hearing-route range(+LEAK margin) of a gate pollutes
// it. INTENDED pollution is declared per DOOR: the jammer owns the jammed
// door, the dance pair owns the dance exit, the pull jammer owns the pull
// exit, the clap pair owns (and performs) the clap exit — in every case
// BOTH faces of that door, per the both-ears rule.
const INTENDED = new Set([
  'poc-jam/jammer/exit-jammed',
  'poc-dance/tension/exit',
  'poc-dance/release/exit',
  'poc-pull/jammer/exit',
  'poc-clap/first/exit',
  'poc-clap/second/exit',
]);
const isIntended = (cAreaId, cName, lArea, lGid) => {
  if (INTENDED.has(`${cAreaId}/${cName}/${lGid}`) && areaById[cAreaId] === lArea) return true;
  // The partner face of an intended door is intended too (one door)
  const p = partnerOf(lArea, lGid);
  return !!p && INTENDED.has(`${cAreaId}/${cName}/${p.gid}`) && areaById[cAreaId] === p.area;
};
AREAS.forEach((area) => {
  Object.entries(area.creatures).forEach(([cn, c]) => {
    // Same-area gates
    Object.entries(area.gates).forEach(([gn]) => {
      if (isIntended(area.id, cn, area, gn)) return;
      const d = minHearingDistance(area, c, area, gn);
      assert(
        `${area.id}: ${cn} cannot pollute gate ${gn} (route ${d.toFixed(1)})`,
        d > c.range + LEAK,
        `${d.toFixed(1)} > ${c.range + LEAK}`
      );
    });
    // Gates of every OTHER area sharing a door with this one (cross-seam,
    // including the free pair-face leg)
    AREAS.forEach((other) => {
      if (other === area) return;
      const connected = DOORS.some(
        (dd) =>
          (dd.aArea === area && dd.bArea === other) || (dd.bArea === area && dd.aArea === other)
      );
      if (!connected) return;
      Object.entries(other.gates).forEach(([gn]) => {
        if (isIntended(area.id, cn, other, gn)) return;
        const d = minHearingDistance(area, c, other, gn);
        assert(
          `${area.id}: ${cn} never reaches ${other.id}/${gn} through any seam (route ${d.toFixed(
            1
          )})`,
          d > c.range + LEAK,
          `${d.toFixed(1)} > ${c.range + LEAK}`
        );
      });
    });
  });
  // Creature pairs must not hear each other, EXCEPT the intended ensembles
  // (the dance duet — force-safe by design and asserted below).
  const names = Object.keys(area.creatures);
  for (let i = 0; i < names.length; i += 1)
    for (let j = i + 1; j < names.length; j += 1) {
      const a = area.creatures[names[i]];
      const b = area.creatures[names[j]];
      const pairKey = [names[i], names[j]].sort().join('+');
      if (area.id === 'poc-dance' && pairKey === 'release+tension') continue; // eslint-disable-line no-continue
      assert(
        `${area.id}: ${names[i]} and ${names[j]} never hear each other`,
        dist3D(a, b) > Math.max(a.range, b.range),
        `${dist3D(a, b).toFixed(1)} > ${Math.max(a.range, b.range)}`
      );
    }
});

// --- element economy (STRICT: matching is pitch- AND duration-exact) ---
// The recordable ELEMENTS of an area are the (pitch|length) notes of every
// creature the player can get inside recording range of.
const recordableElementsByArea = AREAS.map((area) => {
  const seen = reachable(area, area.spawn);
  return Object.values(area.creatures)
    .filter((c) => minApproach(area, seen, c) <= c.range / 2)
    .flatMap((c) => creatureElements(c));
});
// Every exit door must be performable with elements from ITS area or
// earlier, and never fully performable from earlier areas alone (no
// skip-ahead). "exit*" ids are the forward doors; threshold's finale gate
// is area IX's exit, checked there.
AREAS.forEach((area, i) => {
  const before = new Set(recordableElementsByArea.slice(0, i).flat());
  const here = new Set([...before, ...recordableElementsByArea[i]]);
  Object.entries(area.gates).forEach(([gid, gate]) => {
    if (!gid.startsWith('exit')) return;
    const elements = songElements(gate.song);
    assert(
      `${area.id}: exit song [${elements}] is performable with elements from THIS area or earlier`,
      elements.every((e) => here.has(e)),
      `have {${[...here]}}`
    );
    assert(
      `${area.id}: exit song [${elements}] is NOT performable from earlier areas alone (no skip-ahead)`,
      elements.some((e) => !before.has(e)),
      `carried {${[...before]}}`
    );
  });
});
// The named finale lock: the QUARTER F4 exists only in area IX (F4 as a
// whole note is area V's tool, F4|1/2 is the dance duet's — durations are
// matched exactly, so neither can fake the finale's F).
recordableElementsByArea.forEach((elements, i) => {
  if (AREAS[i].id === 'poc-return') return;
  assert(
    `${AREAS[i].id}: the finale element F4|1/4 is not recordable here (the world stays locked)`,
    !elements.includes('F4|1/4'),
    `{${elements}}`
  );
});
// The unsatisfiability fact behind the v5 guard relaxations, checked so it
// can never silently stop being true (if it does, restore the old absolute
// guards): after area V the carried pitch classes admit NO pitch class
// that is dissonant-with-nothing-carried, and none consonant-with-nothing.
{
  const carriedClasses = new Set(
    recordableElementsByArea
      .slice(0, 5)
      .flat()
      .map((e) => pitchToMidi(e.split('|')[0]) % 12)
  );
  let dissonantFree = 0;
  let consonantFree = 0;
  for (let x = 0; x < 12; x += 1) {
    const rel = [...carriedClasses].map((p) => (((x - p) % 12) + 12) % 12);
    if (!rel.some((r) => classify(r) === 'dissonant')) dissonantFree += 1;
    if (!rel.some((r) => classify(r) === 'consonant')) consonantFree += 1;
  }
  assert(
    'v5 guard relaxation is still forced: every pitch class is dissonant with something carried after area V',
    dissonantFree === 0,
    `${dissonantFree} dissonant-free classes`
  );
  assert(
    'v5 guard relaxation is still forced: every pitch class is consonant with something carried after area V',
    consonantFree === 0,
    `${consonantFree} consonant-free classes`
  );
}

// --- non-stuck with an EMPTY tape: every EMPTY-REACHABLE pocket is escapable ---
// Pockets are the regions gates carve an area into (every gate cell
// blocked, no same-area teleports). A player only ever HOLDS an empty tape at
// two moments: at the spawn, or immediately after stepping on a CLEANSER
// (2026-07-12, with the delete verb gone — you can no longer empty the tape
// at will). So only a pocket that CONTAINS the spawn or a cleanser can ever
// hold an empty-tape player; a pocket entered by opening a locked gate is
// reached WITH the note that opened it, never empty. For those empty-reachable
// pockets, some boundary gate must be an alwaysOpen face or have its full song
// recordable from INSIDE the pocket — this is what makes the corridor cleanser
// in poc-two-keys safe. (Forward progression out of the OTHER pockets is the
// element-economy checks' job, not this one.)
AREAS.forEach((area) => {
  const gateCells = Object.values(area.gates).map((g) => key(g.x, g.z));
  const fullReach = reachable(area, area.spawn);
  const spawnNode = `${area.spawn.x},${area.spawn.z},${area.spawn.y || 0}`;
  const cleanserNodes = area.cleansers.map((c) => `${c.x},${c.z},${c.y || 0}`);
  const assigned = new Set();
  const pockets = [];
  for (let x = 0; x < area.grid; x += 1)
    for (let z = 0; z < area.grid; z += 1)
      walkableLevels(area, x, z).forEach((l) => {
        const node = `${x},${z},${l}`;
        if (assigned.has(node) || gateCells.includes(key(x, z))) return;
        const component = reachable(area, { x, z, y: l }, gateCells, 'none');
        component.forEach((n) => assigned.add(n));
        pockets.push(component);
      });
  pockets.forEach((pocket, pi) => {
    const reachableDuringPlay = [...pocket].some((n) => fullReach.has(n));
    if (!reachableDuringPlay) return;
    // Only pockets an empty-tape player can actually stand in need the escape
    // guarantee (see header): the spawn's pocket and any cleanser's pocket.
    const emptyReachable = pocket.has(spawnNode) || cleanserNodes.some((n) => pocket.has(n));
    if (!emptyReachable) return;
    const boundaryGates = Object.entries(area.gates).filter(([, g]) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dz]) => pocket.has(`${g.x + dx},${g.z + dz},${g.y || 0}`))
    );
    const escapable = boundaryGates.some(([, g]) => {
      if (g.alwaysOpen) return true;
      return songElements(g.song).every((e) =>
        Object.values(area.creatures).some(
          (c) => creatureElements(c).includes(e) && minApproach(area, pocket, c) <= c.range / 2
        )
      );
    });
    assert(
      `${area.id}: pocket ${pi} is escapable with an EMPTY tape (a cleanse can never strand)`,
      escapable,
      `${pocket.size} cells, ${boundaryGates.length} boundary gates`
    );
  });
});

// --- area II cleanser: the entry corridor's tile is unavoidable ---
// Walking over it empties the tape, so it must sit ON the only path from the
// entry door into the puzzle — blocking its cell must seal the arrival
// corridor off from room 1 (where the first creature lives).
{
  assert(
    'cleanse: area II has exactly one cleansing tile',
    A2.cleansers.length === 1,
    `${A2.cleansers.length} cleansers`
  );
  const tile = A2.cleansers[0];
  const tileOnGate = Object.values(A2.gates).some((g) => g.x === tile.x && g.z === tile.z);
  assert(
    'cleanse: the tile cell is walkable (not a wall or gate)',
    walkableLevels(A2, tile.x, tile.z).includes(0) && !tileOnGate,
    key(tile.x, tile.z)
  );
  const blockedReach = reachable(A2, A2.spawn, [key(tile.x, tile.z)]);
  assert(
    'cleanse: the tile is unavoidable — blocking it seals the corridor from room 1',
    !reachesAdjacent(blockedReach, A2.creatures.key1),
    `room-1 creature still reachable with tile blocked: ${reachesAdjacent(
      blockedReach,
      A2.creatures.key1
    )}`
  );
}

// --- poc-return cleanser: the vestibule corridor's tile is unavoidable ---
// The 1-wide vestibule corridor is the only path from the entry to the warm-up
// voice + door, so this tile MUST be crossed on the way in — blocking it seals
// the entry side off from fVoice (and thus the spine beyond the warm-up door).
{
  assert(
    'cleanse: poc-return has exactly one cleansing tile',
    A9.cleansers.length === 1,
    `${A9.cleansers.length} cleansers`
  );
  const tile = A9.cleansers[0];
  const tileOnGate = Object.values(A9.gates).some((g) => g.x === tile.x && g.z === tile.z);
  assert(
    'cleanse: the poc-return tile cell is walkable (not a wall or gate)',
    walkableLevels(A9, tile.x, tile.z).includes(0) && !tileOnGate,
    key(tile.x, tile.z)
  );
  const blockedReach = reachable(A9, A9.spawn, [key(tile.x, tile.z)]);
  assert(
    'cleanse: the poc-return tile is unavoidable — blocking it seals the entry from the warm-up voice',
    !reachesAdjacent(blockedReach, A9.creatures.fVoice),
    `fVoice still reachable with tile blocked: ${reachesAdjacent(
      blockedReach,
      A9.creatures.fVoice
    )}`
  );
}

// --- area I: the threshold voice stays clear of both doors ---
{
  const { voice } = A1.creatures;
  assert(
    'poc-threshold: the finale gate wants the corrected Twinkle couplet',
    songKey(A1.gates.finale.song) === JSON.stringify(TWINKLE) && A1.gates.finale.ending === true,
    `${normalizeSong(A1.gates.finale.song).length} notes, ending`
  );
  assert(
    'poc-threshold: Twinkle is 16 beats — quarters with phrase-ending halves',
    songBeats(TWINKLE) === 16 &&
      normalizeSong(TWINKLE).filter((n) => n.length === '1/2').length === 2,
    `${songBeats(TWINKLE)} beats`
  );
  assert(
    'poc-threshold: the voice is recordable',
    minApproach(A1, reachable(A1, A1.spawn), voice) <= voice.range / 2,
    minApproach(A1, reachable(A1, A1.spawn), voice).toFixed(2)
  );
}

// --- area II: RE-KEY — one slot, rerecord across two doors in series ---
assert(
  'poc-two-keys: the two doors want different notes (rerecord genuinely needed — one note cannot open both)',
  songPitches(A2.gates.inner.song)[0] !== songPitches(A2.gates.exit.song)[0],
  `${songPitches(A2.gates.inner.song)} vs ${songPitches(A2.gates.exit.song)}`
);
// One creature per room: E4 (key1) in room 1 south of the inner door (8<z<14),
// G4 (key2) in room 2 north of it (0<z<8). So the player records E4 in room 1,
// opens the inner door, then RE-RECORDS G4 in room 2 to open the exit — never
// needing a second slot.
assert(
  'poc-two-keys: the inner-door note lives in room 1, the exit note in room 2 (rerecord flow)',
  creaturePitches(A2.creatures.key1)[0] === songPitches(A2.gates.inner.song)[0] &&
    A2.creatures.key1.z > 8 &&
    A2.creatures.key1.z < 14 &&
    creaturePitches(A2.creatures.key2)[0] === songPitches(A2.gates.exit.song)[0] &&
    A2.creatures.key2.z > 0 &&
    A2.creatures.key2.z < 8,
  `key1(E4) z=${A2.creatures.key1.z}, key2(G4) z=${A2.creatures.key2.z}`
);

// --- area III: the duet door needs both notes in order ---
assert(
  'poc-duet: exit is a two-note melody',
  normalizeSong(A3.gates.exit.song).length === 2,
  songKey(A3.gates.exit.song)
);
{
  const e = A3.creatures.east;
  const w = A3.creatures.west;
  assert(
    'poc-duet: sources are too far apart to capture in one take',
    dist3D(e, w) > e.range / 2 + w.range / 2,
    `${dist3D(e, w).toFixed(1)} > ${e.range / 2 + w.range / 2}`
  );
}

// --- area IV: the jam — a VISIBLE plinth singer kills door J forever ---
{
  const { voice, jammer } = A4.creatures;
  const J = A4.gates['exit-jammed'];
  const K = A4.gates['exit-clean'];
  assert(
    "poc-jam: both doors want the voice's note (identical, so only the jam differs)",
    songKey(J.song) === songKey(K.song) &&
      normalizeSong(J.song).length === 1 &&
      songPitches(J.song)[0] === creaturePitches(voice)[0],
    `${songKey(J.song)} vs ${songKey(K.song)} vs voice ${creaturePitches(voice)}`
  );
  assert(
    'poc-jam: the two doors land on two DISTINCT gates of poc-dance',
    J.link.puzzleId === 'poc-dance' &&
      K.link.puzzleId === 'poc-dance' &&
      J.link.gateId !== K.link.gateId,
    `${J.link.gateId} / ${K.link.gateId}`
  );
  assert(
    'poc-jam: jammer is CONTINUOUS (interval == song length: no silence window, ever)',
    jammer.interval === songBeats(jammer.song),
    `interval ${jammer.interval}`
  );
  assert(
    'poc-jam: jammer reaches door J even from the far plinth corner (J can never open)',
    dist3D(jammer, J) + PLINTH_DRIFT <= jammer.range,
    `${(dist3D(jammer, J) + PLINTH_DRIFT).toFixed(1)} <= ${jammer.range}`
  );
  assert(
    'poc-jam: the jam crosses the seam — the both-ears rule keeps the far face (poc-dance/entry-a) jammed too',
    minHearingDistance(A4, jammer, A5, 'entry-a') + PLINTH_DRIFT <= jammer.range,
    `${(minHearingDistance(A4, jammer, A5, 'entry-a') + PLINTH_DRIFT).toFixed(1)} <= ${
      jammer.range
    }`
  );
  assert(
    'poc-jam: door K never hears the jammer (the clean control door)',
    dist3D(jammer, K) > jammer.range + LEAK,
    `${dist3D(jammer, K).toFixed(1)} > ${jammer.range + LEAK}`
  );
  // The plinth pen: 1 cell at elevation 2, cliff-edged (no adjacent cell
  // carries level 2, no ramps), VISIBLE, walkable underneath, and out of
  // recording reach even from directly below.
  const f = A4.floors[0];
  assert(
    'poc-jam: the jammer stands on a 1-cell elevation-2 plinth',
    f.elevation === 2 && f.x1 === f.x2 && f.z1 === f.z2 && jammer.x === f.x1 && jammer.z === f.z1,
    JSON.stringify(f)
  );
  assert('poc-jam: no ramp reaches the plinth (cliff-penned)', A4.ramps.length === 0, 'scenery');
  assert(
    'poc-jam: the plinth cell is NOT walled (the jammer is visible, and the door approach passes beneath)',
    !A4.walls.has(key(jammer.x, jammer.z)),
    key(jammer.x, jammer.z)
  );
  const seen = reachable(A4, A4.spawn);
  assert(
    'poc-jam: the player can walk UNDER the plinth to the jammed door',
    canReach(seen, jammer.x, jammer.z, 0),
    'walk-under'
  );
  assert(
    'poc-jam: the plinth top is unreachable (no level-2 cell in the walk graph)',
    ![...seen].some((n) => n.endsWith(',2')),
    'cliff-penned'
  );
  assert(
    "poc-jam: the jammer's B5 is unrecordable from anywhere reachable (even directly beneath)",
    minApproach(A4, seen, jammer) > jammer.range / 2,
    `${minApproach(A4, seen, jammer).toFixed(2)} > ${jammer.range / 2}`
  );
  assert(
    "poc-jam: the jammer's pitch is in no door song anywhere",
    AREAS.every((ar) =>
      Object.values(ar.gates).every(
        (g) => !songPitches(g.song).includes(creaturePitches(jammer)[0])
      )
    ),
    creaturePitches(jammer)[0]
  );
}

// --- area V: the dance — tension and release, and the F4 broom ---
{
  const { tension, release, voice } = A5.creatures;
  const { exit } = A5.gates;
  const toolPitch = creaturePitches(voice)[0];
  assert(
    "poc-dance: the tool and the exit song are both a plain F4 whole note (the voice's element)",
    toolPitch === 'F4' &&
      songKey(exit.song) === JSON.stringify([{ pitch: 'F4', length: '1/1' }]) &&
      creatureElements(voice)[0] === 'F4|1/1',
    `${creatureElements(voice)} vs ${songKey(exit.song)}`
  );
  assert(
    'poc-dance: the duet songs are the test-003 pair — B3→C4 and F4→E4 in halves',
    songKey(tension.song) === JSON.stringify(DANCE_SONG_A) &&
      songKey(release.song) === JSON.stringify(DANCE_SONG_B),
    `${songKey(tension.song)} / ${songKey(release.song)}`
  );
  assert(
    'poc-dance: the duet is SYNCED (same interval, both continuous — same phase from the start gate)',
    tension.interval === release.interval &&
      tension.interval === songBeats(tension.song) &&
      release.interval === songBeats(release.song),
    `interval ${tension.interval}`
  );
  // The tension-release contract: simultaneous intervals are dissonant then
  // consonant (V7 → I: the tritone resolves to the major third).
  const beat0 = classify(interval(tension.song[0].pitch, release.song[0].pitch));
  const beat2 = classify(interval(tension.song[1].pitch, release.song[1].pitch));
  assert(
    'poc-dance: the duet is TENSION (dissonant) then RELEASE (consonant)',
    beat0 === 'dissonant' && beat2 === 'consonant',
    `${beat0} then ${beat2}`
  );
  // The F4 broom: net repulsion, and NO note of the duet is ever attracted
  // by it (the designer's interval math, asserted).
  const f4Reactions = [...tension.song, ...release.song].map((n) =>
    classify(interval('F4', n.pitch))
  );
  assert(
    'poc-dance: F4 never ATTRACTS a duet note (nothing consonant with the tool)',
    !f4Reactions.includes('consonant'),
    f4Reactions.join(',')
  );
  assert(
    'poc-dance: F4 REPELS at least one note of EACH dancer (net repulsion on both)',
    tension.song.some((n) => classify(interval('F4', n.pitch)) === 'dissonant') &&
      release.song.some((n) => classify(interval('F4', n.pitch)) === 'dissonant'),
    f4Reactions.join(',')
  );
  // Both dancers park in front of the exit and corrupt it from the start.
  [tension, release].forEach((c, idx) => {
    assert(
      `poc-dance: dancer ${idx + 1} jams the exit from its park spot`,
      dist3D(c, exit) <= c.range - 0.5,
      `${dist3D(c, exit).toFixed(1)} <= ${c.range - 0.5}`
    );
  });
  // The breathing oscillation stays inside mutual earshot: starting
  // separation plus one full repel phase per dancer (kinematic drift model
  // above), with margin.
  const startSep = dist3D(tension, release);
  const phaseSeconds = 2 * (60 / TEMPO); // each duet note is a half = 2 beats
  const oscillation = DRIFT_PER_S * phaseSeconds; // per dancer per phase
  assert(
    'poc-dance: the pair always hears itself (range covers the oscillation span, with margin)',
    Math.min(tension.range, release.range) > startSep + 2 * oscillation + 2,
    `${Math.min(tension.range, release.range)} > ${(startSep + 2 * oscillation + 2).toFixed(1)}`
  );
  assert(
    'poc-dance: the pair starts apart enough to converge, above the contact floor',
    startSep > CREATURE_CONTACT,
    `${startSep.toFixed(1)} > ${CREATURE_CONTACT}`
  );
  // The room is deep enough to shove the pair fully out of the exit's
  // earshot (the un-jam needs parking space beyond range).
  const seen = reachable(A5, A5.spawn);
  let parkCells = 0;
  seen.forEach((nodeStr) => {
    const [x, z, l] = nodeStr.split(',').map(Number);
    if (l === 0 && dist3D({ x, z, y: 0 }, exit) > Math.max(tension.range, release.range) + 1)
      parkCells += 1;
  });
  assert(
    'poc-dance: plenty of reachable floor lies beyond the exit’s earshot (somewhere to shove the pair)',
    parkCells >= 8,
    `${parkCells} park cells`
  );
  // The voice must not disturb the duet on its own (its F4 would shove
  // them), and the duet must not reach the voice either.
  [tension, release].forEach((c, idx) => {
    assert(
      `poc-dance: the F4 voice sings outside dancer ${idx + 1}'s earshot (with oscillation margin)`,
      dist3D(voice, c) > c.range + oscillation,
      `${dist3D(voice, c).toFixed(1)} > ${(c.range + oscillation).toFixed(1)}`
    );
  });
}

// --- area VI: the pull — the movable jammer IS the puzzle ---
{
  const { voice, jammer } = A6.creatures;
  const { exit } = A6.gates;
  assert(
    'poc-pull: voice is CONSONANT with the jammer (playback ATTRACTS it)',
    classify(interval(creaturePitches(voice)[0], creaturePitches(jammer)[0])) === 'consonant',
    `${creaturePitches(voice)} vs ${creaturePitches(jammer)}`
  );
  assert(
    'poc-pull: jammer is CONTINUOUS (area IV’s jam, now free-standing)',
    jammer.interval === songBeats(jammer.song),
    `interval ${jammer.interval}`
  );
  assert(
    'poc-pull: jammer starts inside door earshot (the exit begins jammed)',
    dist3D(jammer, exit) <= jammer.range - 0.5,
    `${dist3D(jammer, exit).toFixed(1)} <= ${jammer.range - 0.5}`
  );
  assert(
    "poc-pull: the exit wants the VOICE's note, never the jammer's",
    normalizeSong(exit.song).length === 1 &&
      songPitches(exit.song)[0] === creaturePitches(voice)[0],
    songKey(exit.song)
  );
  assert(
    'poc-pull: jammer starts far from the entry door',
    dist3D(jammer, A6.gates.entry) > jammer.range + LEAK,
    dist3D(jammer, A6.gates.entry).toFixed(1)
  );
  const seen = reachable(A6, A6.spawn);
  assert(
    'poc-pull: the exit is walkable regardless of the jammer (the jam is sound, not body)',
    reachesAdjacent(seen, exit),
    'open'
  );
  let parkCells = 0;
  seen.forEach((nodeStr) => {
    const [x, z, l] = nodeStr.split(',').map(Number);
    if (l === 0 && dist3D({ x, z, y: 0 }, exit) > jammer.range + 1) parkCells += 1;
  });
  assert(
    'poc-pull: plenty of reachable floor un-jams the exit (somewhere to drag the jammer)',
    parkCells >= 8,
    `${parkCells} park cells`
  );
  // v5 RELAXED GUARD (the old "nothing carried may PUSH the jammer" is
  // unsatisfiable — see the header): recovery is guaranteed structurally
  // instead. The room is an OPEN rectangle (no interior walls beyond the
  // two door rows), so a shoved jammer can always be approached and pulled
  // back by A4 — there is nowhere to wedge it out of the pull's reach.
  const interiorWalls = [...A6.walls].filter((k2) => {
    const [, z] = k2.split(',').map(Number);
    return z !== 0 && z !== A6.grid - 1;
  });
  assert(
    'poc-pull: the room is an open rectangle (a pushed jammer is always recoverable by the pull)',
    interiorWalls.length === 0,
    `${interiorWalls.length} interior walls`
  );
  // Non-stuck even if the player parks the jammer NEXT TO the voice (mutual
  // consonance cuddles them at creature-contact): a clean A4 take must
  // survive — stand on the voice's far side, inside the voice's recording
  // range but outside the jammer's.
  assert(
    'poc-pull: a clean take survives the jammer cuddling the voice (far-side re-record)',
    voice.range / 2 + CREATURE_CONTACT > jammer.range / 2 + 0.4,
    `${(voice.range / 2 + CREATURE_CONTACT).toFixed(1)} > ${(jammer.range / 2 + 0.4).toFixed(1)}`
  );
}

// --- area VII: the push is forced, and the pushed creature opens the door ---
{
  const { voice, pusher } = A7.creatures;
  assert(
    'poc-push: voice is DISSONANT with the pusher (repels)',
    classify(interval(creaturePitches(voice)[0], creaturePitches(pusher)[0])) === 'dissonant',
    `${creaturePitches(voice)} vs ${creaturePitches(pusher)}`
  );
  // v5 RELAXED GUARD (the old "nothing carried may PULL the pusher" is
  // unsatisfiable — see the header): the pusher's pitch is chosen so the
  // ONLY carried consonant class is G — the oldest carried note (areas
  // II/III), the least likely to still be on the tape. Asserted so a
  // future pitch shuffle can't silently widen the pull-back surface.
  const carried = new Set(
    recordableElementsByArea
      .slice(0, 7)
      .flat()
      .map((e) => e.split('|')[0])
  );
  const consonantCarried = new Set(
    [...carried]
      .filter((p) => classify(interval(p, creaturePitches(pusher)[0])) === 'consonant')
      .map((p) => p.replace(/\d+$/, ''))
  );
  assert(
    "poc-push: the only carried pitch class consonant with the pusher is G (minimal pull-back surface — designer's flag)",
    consonantCarried.size === 1 && consonantCarried.has('G'),
    `{${[...consonantCarried]}}`
  );
  assert(
    "poc-push: the exit door wants the PUSHER's own note (creatures activate gates)",
    normalizeSong(A7.gates.exit.song).length === 1 &&
      songPitches(A7.gates.exit.song)[0] === creaturePitches(pusher)[0],
    songKey(A7.gates.exit.song)
  );
  assert(
    'poc-push: pusher starts OUT of door range (no pre-solve)',
    dist3D(pusher, A7.gates.exit) > pusher.range + LEAK,
    `${dist3D(pusher, A7.gates.exit).toFixed(1)} > ${pusher.range + LEAK}`
  );
  const sealed = reachable(A7, A7.spawn, [key(pusher.x, pusher.z)]);
  assert(
    'poc-push: pusher seals the only path to the exit',
    !reachesAdjacent(sealed, A7.gates.exit),
    'sealed'
  );
  const open = reachable(A7, A7.spawn);
  assert(
    'poc-push: path exists once the pusher moves',
    reachesAdjacent(open, A7.gates.exit),
    'open'
  );
  const flanked = A7.walls.has(key(5, 5)) && A7.walls.has(key(7, 5));
  assert('poc-push: pusher sits in a 1-wide corridor', flanked, `(${pusher.x},${pusher.z})`);
  let herdable = false;
  open.forEach((nodeStr) => {
    const [x, z, l] = nodeStr.split(',').map(Number);
    if (l === 0 && dist3D({ x, z, y: 0 }, A7.gates.exit) <= pusher.range) herdable = true;
  });
  assert('poc-push: a reachable strip cell puts the pusher in door range', herdable, 'strip');
}

// --- area VIII: clap math (v5: visible plinth pair, quarter-note chord) ---
{
  const { first, second } = A8.creatures;
  const door = A8.gates.exit;
  const doorPitches = songPitches(door.song);
  assert(
    'poc-clap: door melody is a whole measure of the pair alternating [D4,A4,D4,A4]',
    JSON.stringify(doorPitches) === JSON.stringify(['D4', 'A4', 'D4', 'A4']) &&
      normalizeSong(door.song).every((n) => n.length === '1/4'),
    doorPitches.join(',')
  );
  assert(
    'poc-clap: the pair sings the door’s two notes as single quarters',
    creatureElements(first)[0] === 'D4|1/4' && creatureElements(second)[0] === 'A4|1/4',
    `${creatureElements(first)} / ${creatureElements(second)}`
  );
  assert(
    'poc-clap: one-beat songs on a two-beat interval, in phase (a chord until clapped)',
    first.interval === 2 && second.interval === 2 && songBeats(first.song) === 1,
    `interval ${first.interval}/${second.interval}`
  );
  assert(
    'poc-clap: one clap (1/4 displacement = one beat) turns the chord into the alternating melody',
    A8.clapDisplacement === '1/4',
    A8.clapDisplacement
  );
  assert(
    'poc-clap: pair interval is PERFECT (no mutual force, no force from the player’s D/A takes)',
    classify(interval(creaturePitches(first)[0], creaturePitches(second)[0])) === 'perfect',
    `${creaturePitches(first)}-${creaturePitches(second)}`
  );
  [first, second].forEach((c, i) => {
    assert(
      `poc-clap: creature ${i + 1} reaches the door with margin (even with plinth drift)`,
      dist3D(c, door) + PLINTH_DRIFT <= c.range - 0.5,
      `${(dist3D(c, door) + PLINTH_DRIFT).toFixed(1)} <= ${c.range - 0.5}`
    );
  });
  // The pair stands on VISIBLE 1-cell elevation-1 plinths (cliff-penned:
  // claps and forces can never reposition them out of door range, which
  // preserves the empty-tape escape guarantee), recordable from the floor.
  const seen = reachable(A8, A8.spawn);
  [first, second].forEach((c, i) => {
    const plinth = A8.floors.find((f2) => f2.x1 === c.x && f2.z1 === c.z);
    assert(
      `poc-clap: creature ${i + 1} stands on a 1-cell elevation-1 plinth`,
      plinth && plinth.elevation === 1 && plinth.x1 === plinth.x2 && plinth.z1 === plinth.z2,
      JSON.stringify(plinth || null)
    );
    assert(
      `poc-clap: creature ${
        i + 1
      } is recordable from the floor (its quarter enters the carried set by design)`,
      minApproach(A8, seen, c) <= c.range / 2,
      minApproach(A8, seen, c).toFixed(2)
    );
  });
  assert('poc-clap: no ramp reaches the plinths (cliff-penned)', A8.ramps.length === 0, 'pen');
  assert(
    'poc-clap: the plinth tops are unreachable',
    ![...seen].some((n) => n.endsWith(',1')),
    'cliff-penned'
  );
  // Clap reach is 3D from the player's eye; the plinths sit one level up,
  // so the effective horizontal clap radius shrinks accordingly. The pair
  // must sit farther apart than twice that (no spot claps both at once)…
  const clapReachH = Math.sqrt(CLAP_RANGE * CLAP_RANGE - (ELEV - EYE) * (ELEV - EYE));
  assert(
    'poc-clap: pair separation exceeds twice the effective clap reach (no double-clap spot)',
    dist3D(first, second) > 2 * clapReachH,
    `${dist3D(first, second).toFixed(1)} > ${(2 * clapReachH).toFixed(1)}`
  );
  // …while SOME reachable spot hears both mid-clash within clap range of
  // one (the C-hint lens, scanned at half-cell resolution).
  const cells = new Set();
  seen.forEach((nodeStr) => {
    const [x, z, l] = nodeStr.split(',').map(Number);
    if (l === 0) cells.add(key(x, z));
  });
  let hintSpot = false;
  cells.forEach((k2) => {
    const [cx, cz] = k2.split(',').map(Number);
    for (let dx = -0.5; dx <= 0.5; dx += 0.5)
      for (let dz = -0.5; dz <= 0.5; dz += 0.5) {
        const px = cx + dx;
        const pz = cz + dz;
        const dFirst = playerDist({ x: px, z: pz }, 0, first);
        const dSecond = playerDist({ x: px, z: pz }, 0, second);
        if (
          (dFirst <= CLAP_RANGE || dSecond <= CLAP_RANGE) &&
          dFirst <= first.range &&
          dSecond <= second.range
        )
          hintSpot = true;
      }
  });
  assert(
    'poc-clap: a reachable spot hears both creatures within clap range of one (the C-hint moment)',
    hintSpot,
    'lens'
  );
}

// --- area IX: the warm-up teaches the finale's skills, the hall delivers ---
{
  const V = A9.gates['warmup-in'];
  const H = A9.gates['warmup-out'];
  const { exit, entry } = A9.gates;
  const { fVoice } = A9.creatures;
  assert(
    'poc-return: the warm-up door wants the SAME quarter note twice (repetition, one voice)',
    songKey(V.song) ===
      JSON.stringify([
        { pitch: creaturePitches(fVoice)[0], length: '1/4' },
        { pitch: creaturePitches(fVoice)[0], length: '1/4' },
      ]),
    songKey(V.song)
  );
  assert(
    'poc-return: the hall face of the warm-up door is alwaysOpen (one-way escape hatch)',
    H.alwaysOpen === true,
    'alwaysOpen'
  );
  assert(
    'poc-return: the vestibule face is NOT alwaysOpen (the lesson is mandatory)',
    !V.alwaysOpen,
    'locked'
  );
  assert(
    'poc-return: the warm-up pair is an in-level link (both faces in this area)',
    V.link.puzzleId === 'poc-return' && H.link.puzzleId === 'poc-return',
    `${V.link.puzzleId}/${H.link.puzzleId}`
  );
  // The vestibule must teach BEFORE the hall: its voice is the only
  // F4 quarter, recordable south of the divider.
  const vestibule = reachable(A9, A9.spawn, [key(V.x, V.z), key(H.x, H.z)], 'none');
  assert(
    "poc-return: the warm-up song is recordable INSIDE the vestibule (the lesson can't be skipped)",
    minApproach(A9, vestibule, fVoice) <= fVoice.range / 2,
    minApproach(A9, vestibule, fVoice).toFixed(2)
  );
  // The ENTRY forces the turn-around moment: it sits in a SIDE wall
  // relative to the player's northward travel, so its north and south
  // neighbors are blocked and the way out is a turn to the west.
  const entryNorth = A9.walls.has(key(entry.x, entry.z - 1));
  const entrySouth = A9.walls.has(key(entry.x, entry.z + 1));
  const entryWestOpen = !A9.walls.has(key(entry.x - 1, entry.z));
  assert(
    'poc-return: the entry door is in a SIDE wall — arriving forces a turn inside the frame (the look-back moment)',
    entryNorth && entrySouth && entryWestOpen,
    `N wall ${entryNorth}, S wall ${entrySouth}, W open ${entryWestOpen}`
  );
  // The finale: the corrected couplet, one voice per ELEMENT.
  assert(
    'poc-return: the finale song IS the corrected Twinkle couplet',
    songKey(exit.song) === JSON.stringify(TWINKLE),
    `${normalizeSong(exit.song).length} notes`
  );
  const finaleElements = [...new Set(songElements(exit.song))];
  const voiceElements = Object.values(A9.creatures).map((c) => creatureElements(c)[0]);
  assert(
    'poc-return: EIGHT voices — one per distinct finale element, no creature reused',
    finaleElements.length === 8 &&
      Object.keys(A9.creatures).length === 8 &&
      new Set(voiceElements).size === 8 &&
      finaleElements.every((e) => voiceElements.includes(e)),
    `elements {${finaleElements}} vs voices {${voiceElements}}`
  );
  assert(
    'poc-return: every voice sings a SINGLE note (elements only — no chunks of the answer)',
    Object.values(A9.creatures).every((c) => c.song.length === 1),
    'single notes'
  );
  // Song-order placement: walking the hall wall counterclockwise from the
  // hall door, the voices appear in the order their elements FIRST occur
  // in the couplet (the vestibule's F4 is the F element, already in hand).
  const hallOrder = ['c1', 'g1', 'a1', 'gHalf', 'e1', 'd1', 'cHalf'];
  const firstOccurrence = [];
  songElements(exit.song).forEach((e) => {
    if (e !== 'F4|1/4' && !firstOccurrence.includes(e)) firstOccurrence.push(e);
  });
  assert(
    'poc-return: hall voices stand in SONG ORDER along the path',
    JSON.stringify(hallOrder.map((n) => creatureElements(A9.creatures[n])[0])) ===
      JSON.stringify(firstOccurrence),
    `${hallOrder.map((n) => creatureElements(A9.creatures[n])[0])}`
  );
  assert(
    'poc-return: the finale portal pairs with the threshold finale gate, which rolls the credits',
    exit.link.puzzleId === 'poc-threshold' &&
      exit.link.gateId === 'finale' &&
      A1.gates.finale.ending === true,
    'ending'
  );
}

// --- teaches: the hint verbs are assigned along the chain ---
{
  const assigned = AREAS.flatMap((a) => a.teaches);
  assert(
    'teaches: area I teaches move/record/playback',
    JSON.stringify(A1.teaches) === JSON.stringify(['move', 'record', 'playback']),
    A1.teaches.join(',')
  );
  // Area II teaches rerecord by necessity (no hint verb); the grow-a-slot
  // hint debuts at area III (the duet), the first place a second slot is
  // genuinely required — never in area II, which is one-slot rerecord.
  assert(
    'teaches: area II teaches no hint verb (rerecord is by necessity)',
    A2.teaches.length === 0,
    A2.teaches.join(',')
  );
  assert('teaches: slots arrive at area III', A3.teaches.includes('slots'), A3.teaches.join(','));
  // Each lesson happens once (ruled 2026-07-16): slots is taught at the duet
  // and NOWHERE later — the finale must not re-hint it.
  assert(
    'teaches: slots is taught only at area III',
    AREAS.every((a) => a === A3 || !a.teaches.includes('slots')),
    assigned.join(',')
  );
  assert(
    'teaches: clap arrives at the clap area',
    A8.teaches.includes('clap'),
    A8.teaches.join(',')
  );
  assert(
    'teaches: clap is taught only at the clap area',
    AREAS.every((a) => a === A8 || !a.teaches.includes('clap')),
    assigned.join(',')
  );
  assert(
    'teaches: every hint verb is taught somewhere',
    ['move', 'record', 'playback', 'slots', 'clap'].every((v) => assigned.includes(v)),
    assigned.join(',')
  );
}

// =========================================================================
// EMIT
// =========================================================================
const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`));
if (failed.length) {
  console.error(`\n${failed.length} constraint(s) FAILED — not writing puzzles.`);
  process.exit(1);
}

// A gate's doorway plane (schema `facing`) is the wall the door sits in:
// perpendicular to the wall RUN. Derived from wall adjacency so a door in a
// VERTICAL wall (e.g. The Star's east-wall entry) gets an x-axis facing —
// the portal view shares its clip along the true doorway axis, not the
// wrong one. A free-standing or ambiguous gate defaults to 'north' (its
// panels stay per-axis, which is right for an open portal box).
const gateFacing = (area, g) => {
  const inWall = (x, z) => area.walls.has(key(x, z));
  const ew = inWall(g.x - 1, g.z) && inWall(g.x + 1, g.z);
  const ns = inWall(g.x, g.z - 1) && inWall(g.x, g.z + 1);
  if (ns && !ew) return 'west'; // wall runs N-S -> doorway opens E-W (x-axis)
  return 'north'; // wall runs E-W, or free-standing -> doorway opens N-S (z-axis)
};

const outDir = path.join(__dirname, '..', 'public', 'puzzles');
if (WRITE) {
  console.warn('\n⚠️  --write: REGENERATING all nine poc-*.json files.');
  console.warn('    These are HAND-EDITED in the editor (173fd15); this overwrites those edits.\n');
}
AREAS.forEach((area) => {
  const entities = [];
  Object.values(area.creatures).forEach((c) => {
    entities.push({
      type: 'creature',
      position: { x: c.x, y: c.y || 0, z: c.z },
      data: {
        song: c.song,
        interval: c.interval,
        audibleRange: c.range,
      },
    });
  });
  area.walls.forEach((k) => {
    const [x, z] = k.split(',').map(Number);
    entities.push({ type: 'wall', position: { x, y: 0, z } });
  });
  area.ramps.forEach((r) => {
    entities.push({ type: 'ramp', position: { x: r.x, y: r.y, z: r.z }, direction: r.direction });
  });
  area.cleansers.forEach((c) => {
    entities.push({ type: 'cleanser', position: { x: c.x, y: c.y || 0, z: c.z } });
  });
  Object.entries(area.gates).forEach(([gid, g]) => {
    entities.push({
      type: 'gate',
      position: { x: g.x, y: g.y || 0, z: g.z },
      song: normalizeSong(g.song),
      id: gid,
      facing: gateFacing(area, g),
      ...(g.link ? { link: g.link } : {}),
      ...(g.alwaysOpen ? { alwaysOpen: true } : {}),
      ...(g.ending ? { ending: true } : {}),
    });
  });
  const puzzle = {
    id: area.id,
    name: area.name,
    difficulty: 1,
    gridSize: area.grid,
    tempo: TEMPO,
    keySignature: KEY,
    timeSignature: TIME_SIG,
    teaches: area.teaches,
    ...(area.clapDisplacement ? { clapDisplacement: area.clapDisplacement } : {}),
    playerStart: area.spawn,
    ...(area.floors.length ? { floors: area.floors } : {}),
    entities,
  };
  const file = path.join(outDir, `${area.id}.json`);
  if (WRITE) {
    fs.writeFileSync(file, `${JSON.stringify(puzzle, null, 2)}\n`);
    console.log(`wrote ${file} (${entities.length} entities)`);
  }
});
if (WRITE) {
  console.log(`\nall ${checks.length} constraints pass — POC world written`);
  console.warn(
    '\n⚠️  --write OVERWROTE the hand-edited poc-*.json files with the v5 generator output.'
  );
  console.warn('    If that was not intended, recover them with: git checkout -- public/puzzles');
} else {
  console.log(
    `\nall ${checks.length} constraints pass — check-only mode, nothing written (use --write to regenerate the JSONs; this OVERWRITES the hand-edited poc files)`
  );
}
