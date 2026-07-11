// Generates the POC onboarding world — TEN small portal-linked areas that
// teach every game element (except fountains) ONE at a time, wordlessly:
//
//   I.    poc-threshold — move (WASD), record (R), play (Space), first door.
//                         A locked FINALE PORTAL stands mid-room, wanting a
//                         real song (Twinkle, quarter notes) nothing before
//                         area X can perform — the demo's ending arrives
//                         through it
//   II.   poc-two-keys  — slots: two single-note doors in series force
//                         holding TWO notes at once (room 2 has an E4 echo,
//                         so even a deleted tape can always re-open the way)
//   III.  poc-duet      — sequencing: a two-note door [E5,G5] performed by
//                         ordering the tape (Space plays all slots in order)
//   IV.   poc-dance     — SPECTACLE: creatures move to each other's songs.
//                         An elevated stage (unreachable, solid plinth)
//                         where two anchors' alternating songs bounce a
//                         dissonant dancer back and forth, forever
//   V.    poc-jam       — a CONTINUOUS singer beside a door corrupts its
//                         matching forever: two identical doors want the
//                         same note; the one with the caged singer never
//                         opens, the clean one does (lesson, zero risk)
//   VI.   poc-pull      — the jam, weaponized: a free-standing continuous
//                         singer jams the exit — consonant playback PULLS
//                         it out of earshot, then the door hears you
//   VII.  poc-push      — dissonant playback REPELS; the pushed creature's
//                         own song opens the exit (creatures activate gates)
//   VIII. poc-clap      — claps shift creature timing: two penned creatures
//                         chord the door's two notes; clap one apart until
//                         the chord becomes the melody
//   IX.   poc-climb     — elevation: walk UNDER the slab, ramp up, record
//                         the perch (pillars force the climb)
//   X.    poc-return    — THE STAR (finale): a warm-up vestibule teaches
//                         quarter notes + repetition ([F4,F4] from ONE
//                         voice recorded twice), then a concert hall of six
//                         single-quarter voices — the ELEMENTS of Twinkle,
//                         never chunks — and a central portal wanting the
//                         full couplet, linked back to area I's mid-room
//                         finale gate. Crossing it rolls the closing card.
//
// DESIGN RULES HONORED (see DESIGN.md):
//   * Wordless; tight rooms; one concept per area; concepts WITNESSED (the
//     dance, the jam) before they are REQUIRED (the pull/push).
//   * The TAPE model (ruled 2026-07-11): Space performs every slot in
//     order; matching tolerates sounds outside the aligned window, so a
//     door opens whenever its song occurs cleanly within the performance.
//   * STRICT element economy: matching is pitch- AND duration-exact, so
//     the economy tracks (pitch, length) ELEMENTS. Every exit door's
//     elements are first recordable in the door's own area; the finale is
//     all quarter notes, which exist only in area X — carried whole notes
//     can never fake them. F4 (any duration) exists only in area X.
//   * Non-stuck by construction, now including DELETE (players can destroy
//     takes): from every reachable pocket, some boundary door is openable
//     with elements recordable INSIDE the pocket, or is an alwaysOpen face
//     (poc-clap's door is creature-solved — the penned pair re-performs it
//     forever).
//   * Links are written bidirectionally, one song per pair.
//
// Edit this generator and rerun; do NOT hand-edit the JSONs:
//   node puzzles/gen-poc.js
const fs = require('fs');
const path = require('path');

const WORLD_SCALE = 3;
const TEMPO = 100;
const KEY = 'C';
const TIME_SIG = [4, 4];
const LEAK = 6; // CLOSED_DOOR_LEAK_DISTANCE (core/constants.js)
const CLAP_RANGE = 7.5; // core/constants.js
const EYE = 1.8; // player eye height above their floor (GameState)
const ELEV = 3.0; // ELEVATION_HEIGHT
// Geometry background (documented for the level math):
//   * A 1-cell wall ring keeps player centers >= 4.9 units from a penned
//     creature (wall face 4.5 from center + player radius 0.4) — a penned
//     pitch is unrecordable iff its range/2 < 4.9.
//   * A corridor blocker keeps the player >= 1.3 units away (creature radius
//     0.9 + player radius 0.4) — a 1-wide corridor cannot be squeezed past.
//   * Two creatures park at 1.8 apart (0.9 + 0.9) when forces converge them.
//   * A penned creature can drift inside its 1-cell pen: cell half (1.5)
//     minus wall half-depth overlap leaves 0.6 of free travel per axis
//     (3 - 1.5 wall face - 0.9 creature radius), 0.85 on the diagonal.
const PEN_DRIFT = Math.hypot(0.6, 0.6);
const CREATURE_CONTACT = 1.8;
const PEN_STANDOFF = 4.9;

// The finale song: Twinkle Twinkle Little Star, full couplet, all quarter
// notes — six pitch elements (C4 D4 E4 F4 G4 A4), all first recordable (as
// QUARTERS) in area X. Uniform quarters keep the element set minimal: the
// player assembles the song from single notes, never from chunks.
const TWINKLE = [
  'C4',
  'C4',
  'G4',
  'G4',
  'A4',
  'A4',
  'G4',
  'F4',
  'F4',
  'E4',
  'E4',
  'D4',
  'D4',
  'C4',
].map((pitch) => ({ pitch, length: '1/4' }));

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
const creatureElement = (c) => elementOf(c.pitch, c.len || '1/1');

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
    creatures: {}, // key -> {x,z,y,pitch,range,interval,len?}
    gates: {}, // gateId -> {x,z,y,song,link?,alwaysOpen?,ending?}
    ramps: [],
    floors: [],
    spawn: null,
    clapDisplacement: null,
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
const wallCol = (area, x, gaps = []) => {
  for (let z = 0; z < area.grid; z += 1) if (!gaps.includes(z)) addWall(area, x, z);
};
const wallRing = (area, cx, cz) => {
  for (let dx = -1; dx <= 1; dx += 1)
    for (let dz = -1; dz <= 1; dz += 1) if (dx || dz) addWall(area, cx + dx, cz + dz);
};

// =========================================================================
// AREA I — poc-threshold: the core loop (move, record, play, cross) — and
// the locked finale portal, mid-room, that the whole world builds toward
// =========================================================================
const A1 = makeArea('poc-threshold', 'I. Threshold', 10);
A1.spawn = { x: 5, y: 0, z: 8 };
// The voice lives in a corner: its song (and the player's C4 performances
// near it) must stay out of earshot of the finale portal, whose matching
// crosses the seam into area X's concert hall.
A1.creatures.voice = { x: 8, y: 0, z: 8, pitch: 'C4', range: 8, interval: 8 };
wallRow(A1, 1, [5]); // north wall holding the exit door
A1.gates.exit = {
  x: 5,
  y: 0,
  z: 1,
  song: ['C4'],
  link: { puzzleId: 'poc-two-keys', gateId: 'entry' },
};
// The finale portal: free-standing mid-room, wanting the full Twinkle
// couplet in QUARTER notes — elements that exist only in area X. Every
// player red-flashes it with their whole-note C4 in minute one; crossing
// it (from area X) ends the demo (ending: true → the closing overlay).
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
const A2 = makeArea('poc-two-keys', 'II. Two Keys', 12);
A2.spawn = { x: 6, y: 0, z: 10 };
wallRow(A2, 11, [6]); // south wall holding the entry door
wallRow(A2, 6, [6]); // inner wall holding the E4 door (room 1 / room 2)
wallRow(A2, 1, [6]); // north wall holding the G4 exit door
A2.creatures.east = { x: 2, y: 0, z: 8, pitch: 'E4', range: 7, interval: 8 };
A2.creatures.west = { x: 10, y: 0, z: 8, pitch: 'G4', range: 7, interval: 8 };
// Room 2's echo sings the inner door's own note: with the tape's DELETE
// verb a player can destroy their E4 inside room 2 — the echo keeps the
// pocket escapable from an empty tape (non-stuck under deletion).
A2.creatures.echo = { x: 1, y: 0, z: 4, pitch: 'E4', range: 8, interval: 8 };
A2.gates.entry = {
  x: 6,
  y: 0,
  z: 11,
  song: ['C4'],
  link: { puzzleId: 'poc-threshold', gateId: 'exit' },
};
A2.gates.inner = { x: 6, y: 0, z: 6, song: ['E4'] }; // plain gate, not a door
A2.gates.exit = { x: 6, y: 0, z: 1, song: ['G4'], link: { puzzleId: 'poc-duet', gateId: 'entry' } };

// =========================================================================
// AREA III — poc-duet: ordering the tape into a two-note melody
// (E5/G5, NOT area II's E4/G4 — carried notes must never open a later
// door; matching is octave-exact, so the fifth above is a genuinely fresh
// pair. E5-G5 is consonant, so the pair stays out of mutual earshot.)
// =========================================================================
const A3 = makeArea('poc-duet', 'III. The Duet', 12);
A3.spawn = { x: 6, y: 0, z: 10 };
wallRow(A3, 11, [6]);
wallRow(A3, 1, [6]);
A3.creatures.east = { x: 2, y: 0, z: 7, pitch: 'E5', range: 7, interval: 8 };
A3.creatures.west = { x: 10, y: 0, z: 7, pitch: 'G5', range: 7, interval: 8 };
A3.gates.entry = {
  x: 6,
  y: 0,
  z: 11,
  song: ['G4'],
  link: { puzzleId: 'poc-two-keys', gateId: 'exit' },
};
A3.gates.exit = {
  x: 6,
  y: 0,
  z: 1,
  song: ['E5', 'G5'],
  link: { puzzleId: 'poc-dance', gateId: 'entry' },
};

// =========================================================================
// AREA IV — poc-dance: creatures move to each other's songs (spectacle)
// =========================================================================
const A4 = makeArea('poc-dance', 'IV. The Dance', 12);
A4.spawn = { x: 6, y: 0, z: 10 };
wallRow(A4, 11, [6]);
wallCol(A4, 11, [9]); // east wall holding the exit door
// The stage: a 1-deep elevated lane with a SOLID plinth beneath (no
// walk-under) and no ramp (the stage is scenery, penned by its own cliff
// edges — creatures cannot step off, the player cannot climb on).
A4.floors.push({ elevation: 1, x1: 1, z1: 3, x2: 8, z2: 3 });
for (let x = 1; x <= 8; x += 1) addWall(A4, x, 3); // plinth
// Anchors sing the SAME pitch (perfect unison: they never move each other)
// on different intervals, so their songs ALTERNATE. Forces apply while a
// creature SINGS and hears another note within ITS OWN audible range, so
// the dancer's range must cover both anchors. Each solo anchor note that
// overlaps the dancer's singing shoves it away — a perpetual, irregular
// dance. The ground voice is C5 — the exit note, first recordable HERE
// (strict economy): PERFECT against the anchors (they ignore the player's
// playback) and consonant against the dancer, so carrying it up to the
// stage still tugs the dancer — a wordless invitation to participate.
A4.creatures.anchorWest = { x: 1, y: 1, z: 3, pitch: 'G5', range: 12, interval: 12 };
A4.creatures.anchorEast = { x: 8, y: 1, z: 3, pitch: 'G5', range: 12, interval: 16 };
A4.creatures.dancer = { x: 4, y: 1, z: 3, pitch: 'A5', range: 15, interval: 7 };
A4.creatures.voice = { x: 2, y: 0, z: 9, pitch: 'C5', range: 7, interval: 8 };
A4.gates.entry = {
  x: 6,
  y: 0,
  z: 11,
  song: ['E5', 'G5'],
  link: { puzzleId: 'poc-duet', gateId: 'exit' },
};
A4.gates.exit = { x: 11, y: 0, z: 9, song: ['C5'], link: { puzzleId: 'poc-jam', gateId: 'entry' } };

// =========================================================================
// AREA V — poc-jam: a continuous singer beside a door corrupts it forever
// (the lesson for area VI, at zero risk). Two IDENTICAL doors in the north
// wall want the same note [A3]; a caged CONTINUOUS B5 singer stands beside
// the west one. Same tape, two doors: the jammed one never even fades, the
// clean one opens. The jammed door is never required — non-stuck.
// =========================================================================
const A5 = makeArea('poc-jam', 'V. The Jam', 13);
A5.spawn = { x: 6, y: 0, z: 11 };
wallRow(A5, 12, [6]); // south wall holding the entry door
wallRow(A5, 1, [3, 10]); // north wall holding BOTH exit doors
// The jammer's pen hugs the north wall beside door J. It sits DIAGONALLY
// off the door (not straight below it): a straight-line pen would wall off
// the door's only approach cell.
A5.creatures.jammer = { x: 5, y: 0, z: 2, pitch: 'B5', range: 8, interval: 4 };
wallRing(A5, 5, 2);
A5.creatures.voice = { x: 6, y: 0, z: 7, pitch: 'A3', range: 7, interval: 8 };
A5.gates.entry = {
  x: 6,
  y: 0,
  z: 12,
  song: ['C5'],
  link: { puzzleId: 'poc-dance', gateId: 'exit' },
};
A5.gates['exit-jammed'] = {
  x: 3,
  y: 0,
  z: 1,
  song: ['A3'],
  link: { puzzleId: 'poc-pull', gateId: 'entry-a' },
};
A5.gates['exit-clean'] = {
  x: 10,
  y: 0,
  z: 1,
  song: ['A3'],
  link: { puzzleId: 'poc-pull', gateId: 'entry-b' },
};

// =========================================================================
// AREA VI — poc-pull: the jam, weaponized — and the pull solves it
// An open room. A free-standing CONTINUOUS C5 singer stands beside the
// only exit, jamming it exactly like area V's caged one — but this one has
// no cage. The local voice (A4, consonant with C5) is the tool: record it,
// play it near the jammer, and the jammer follows you. Drag it out of the
// door's earshot, walk back, perform A4 in the quiet.
// =========================================================================
const A6 = makeArea('poc-pull', 'VI. The Pull', 12);
A6.spawn = { x: 6, y: 0, z: 10 };
wallRow(A6, 11, [3, 9]); // south wall holding BOTH entry doors (from area V)
wallRow(A6, 1, [6]); // north wall holding the exit door
A6.creatures.voice = { x: 2, y: 0, z: 6, pitch: 'A4', range: 7, interval: 8 };
A6.creatures.jammer = { x: 6, y: 0, z: 3, pitch: 'C5', range: 8, interval: 4 };
A6.gates['entry-a'] = {
  x: 3,
  y: 0,
  z: 11,
  song: ['A3'],
  link: { puzzleId: 'poc-jam', gateId: 'exit-jammed' },
};
A6.gates['entry-b'] = {
  x: 9,
  y: 0,
  z: 11,
  song: ['A3'],
  link: { puzzleId: 'poc-jam', gateId: 'exit-clean' },
};
A6.gates.exit = { x: 6, y: 0, z: 1, song: ['A4'], link: { puzzleId: 'poc-push', gateId: 'entry' } };

// =========================================================================
// AREA VII — poc-push: dissonance repels; the pushed creature opens the door
// =========================================================================
const A7 = makeArea('poc-push', 'VII. The Push', 12);
A7.spawn = { x: 6, y: 0, z: 10 };
wallRow(A7, 11, [6]);
wallRow(A7, 8, [6]);
for (let z = 3; z <= 7; z += 1) {
  addWall(A7, 5, z);
  addWall(A7, 7, z);
}
wallRow(A7, 1, [9]);
A7.creatures.voice = { x: 10, y: 0, z: 9, pitch: 'E5', range: 7, interval: 6 };
A7.creatures.pusher = { x: 6, y: 0, z: 5, pitch: 'D5', range: 7, interval: 6 };
A7.gates.entry = {
  x: 6,
  y: 0,
  z: 11,
  song: ['A4'],
  link: { puzzleId: 'poc-pull', gateId: 'exit' },
};
A7.gates.exit = { x: 9, y: 0, z: 1, song: ['D5'], link: { puzzleId: 'poc-clap', gateId: 'entry' } };

// =========================================================================
// AREA VIII — poc-clap: clap timing turns the pair's chord into the melody
// =========================================================================
const A8 = makeArea('poc-clap', 'VIII. The Clap', 13);
A8.spawn = { x: 6, y: 0, z: 11 };
A8.clapDisplacement = '1/4'; // one clap = one beat: 4 claps resolve the chord
wallRow(A8, 12, [6]);
wallRow(A8, 1, [6]);
A8.creatures.first = { x: 3, y: 0, z: 2, pitch: 'D4', range: 10, interval: 12 };
A8.creatures.second = { x: 8, y: 0, z: 2, pitch: 'A4', range: 10, interval: 12 };
wallRing(A8, 3, 2);
wallRing(A8, 8, 2);
A8.gates.entry = {
  x: 6,
  y: 0,
  z: 12,
  song: ['D5'],
  link: { puzzleId: 'poc-push', gateId: 'exit' },
};
A8.gates.exit = {
  x: 6,
  y: 0,
  z: 1,
  song: ['D4', 'A4'],
  link: { puzzleId: 'poc-climb', gateId: 'entry' },
};

// =========================================================================
// AREA IX — poc-climb: walk under the slab, ramp up, record the perch
// =========================================================================
const A9 = makeArea('poc-climb', 'IX. The Climb', 12);
A9.spawn = { x: 2, y: 0, z: 8 };
wallCol(A9, 1, [9]); // west wall holding the entry door
wallRow(A9, 10, [10]); // south wall holding the exit door
wallRow(A9, 6, [4, 5]); // south face of the slab band (gaps lead UNDER it)
wallRow(A9, 3, [4, 5, 9]); // north face (gaps + the ramp cell)
A9.floors.push({ elevation: 1, x1: 3, z1: 4, x2: 9, z2: 5 });
// Support pillars keep every ground-level approach out of recording range.
[
  [6, 4],
  [5, 4],
  [7, 4],
  [6, 5],
].forEach(([x, z]) => addWall(A9, x, z));
A9.ramps.push({ x: 9, y: 0, z: 3, direction: 'south' }); // high edge abuts the slab
A9.creatures.perch = { x: 6, y: 1, z: 4, pitch: 'B4', range: 8, interval: 8 };
A9.gates.entry = {
  x: 1,
  y: 0,
  z: 9,
  song: ['D4', 'A4'],
  link: { puzzleId: 'poc-clap', gateId: 'exit' },
};
A9.gates.exit = {
  x: 10,
  y: 0,
  z: 10,
  song: ['B4'],
  link: { puzzleId: 'poc-return', gateId: 'entry' },
};

// =========================================================================
// AREA X — poc-return: THE STAR — warm-up vestibule + concert hall finale
//
// The vestibule (south strip) teaches quarter notes and repetition: one F4
// voice singing a single QUARTER note, and a door wanting [F4,F4] — record
// the same voice twice, two slots, play. That door is a ONE-WAY pair into
// the hall: the hall face is alwaysOpen (walk back through it freely), so
// the hall can never strand an emptied tape — F4 stays re-recordable.
//
// The hall holds the ELEMENTS of Twinkle — five more single-quarter voices
// (C4 D4 E4 G4 A4) around the walls, all out of earshot of the central
// portal — and the portal itself wants the full couplet, linked to area
// I's mid-room finale gate. Assemble the tape, perform it in the quiet,
// walk through, take the bow.
// =========================================================================
const A10 = makeArea('poc-return', 'X. The Star', 14);
A10.spawn = { x: 7, y: 0, z: 12 };
wallRow(A10, 13, [7]); // south wall holding the entry door (from the climb)
wallRow(A10, 10, [7]); // vestibule/hall divider holding the warm-up door
A10.creatures.fVoice = { x: 1, y: 0, z: 12, pitch: 'F4', range: 7, interval: 4, len: '1/4' };
A10.creatures.cVoice = { x: 1, y: 0, z: 1, pitch: 'C4', range: 7, interval: 4, len: '1/4' };
A10.creatures.dVoice = { x: 12, y: 0, z: 1, pitch: 'D4', range: 7, interval: 4, len: '1/4' };
A10.creatures.eVoice = { x: 1, y: 0, z: 7, pitch: 'E4', range: 7, interval: 4, len: '1/4' };
A10.creatures.gVoice = { x: 12, y: 0, z: 7, pitch: 'G4', range: 7, interval: 4, len: '1/4' };
A10.creatures.aVoice = { x: 4, y: 0, z: 0, pitch: 'A4', range: 7, interval: 4, len: '1/4' };
const WARMUP_SONG = [
  { pitch: 'F4', length: '1/4' },
  { pitch: 'F4', length: '1/4' },
];
A10.gates.entry = {
  x: 7,
  y: 0,
  z: 13,
  song: ['B4'],
  link: { puzzleId: 'poc-climb', gateId: 'exit' },
};
// The warm-up door: an in-level ONE-WAY pair through the divider. The
// vestibule face wants [F4,F4]; the hall face is alwaysOpen (escape hatch).
A10.gates['warmup-in'] = {
  x: 7,
  y: 0,
  z: 10,
  song: WARMUP_SONG,
  link: { puzzleId: 'poc-return', gateId: 'warmup-out' },
};
A10.gates['warmup-out'] = {
  x: 7,
  y: 0,
  z: 8,
  song: WARMUP_SONG,
  link: { puzzleId: 'poc-return', gateId: 'warmup-in' },
  alwaysOpen: true,
};
A10.gates.exit = {
  x: 7,
  y: 0,
  z: 4,
  song: TWINKLE,
  link: { puzzleId: 'poc-threshold', gateId: 'finale' },
};

const AREAS = [A1, A2, A3, A4, A5, A6, A7, A8, A9, A10];

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
const areaById = Object.fromEntries(AREAS.map((a) => [a.id, a]));
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

// --- self-solve / corruption separation ---
// A creature within audibleRange(+leak) of a gate pollutes it. Exceptions:
// the clap pair (they ARE the performers), the caged jammer beside area V's
// jammed door (the lesson), and the free jammer beside area VI's exit (the
// puzzle). An alwaysOpen face never matches anything, but keeping it inside
// the separation rule costs nothing and keeps the soundscape honest.
const INTENDED = new Set([
  'poc-clap/first/exit',
  'poc-clap/second/exit',
  'poc-jam/jammer/exit-jammed',
  'poc-pull/jammer/exit',
]);
AREAS.forEach((area) => {
  Object.entries(area.creatures).forEach(([cn, c]) => {
    Object.entries(area.gates).forEach(([gn, g]) => {
      if (INTENDED.has(`${area.id}/${cn}/${gn}`)) return;
      assert(
        `${area.id}: ${cn} (${c.pitch}) cannot pollute gate ${gn} from its start`,
        dist3D(c, g) > c.range + LEAK,
        `${dist3D(c, g).toFixed(1)} > ${c.range + LEAK}`
      );
    });
  });
  // Creature pairs must not hear each other, EXCEPT the intended ensembles:
  // the clap pair and the dance troupe, which must be force-safe by pitch.
  const names = Object.keys(area.creatures);
  for (let i = 0; i < names.length; i += 1)
    for (let j = i + 1; j < names.length; j += 1) {
      const a = area.creatures[names[i]];
      const b = area.creatures[names[j]];
      const pairKey = [names[i], names[j]].sort().join('+');
      if (area.id === 'poc-clap' && pairKey === 'first+second') {
        assert(
          'poc-clap: pair interval is PERFECT (no mutual force even in chorus)',
          classify(interval(a.pitch, b.pitch)) === 'perfect',
          `${a.pitch}-${b.pitch}`
        );
      } else if (area.id === 'poc-dance' && !pairKey.includes('voice')) {
        // dancer-anchor: dissonant ON PURPOSE; anchor-anchor: unison
        const cls = classify(interval(a.pitch, b.pitch));
        assert(
          `poc-dance: ${pairKey} interval is ${
            a.pitch === b.pitch ? 'unison' : 'dissonant'
          } by design`,
          a.pitch === b.pitch ? cls === 'perfect' : cls === 'dissonant',
          `${a.pitch}-${b.pitch} = ${cls}`
        );
      } else {
        assert(
          `${area.id}: ${names[i]} and ${names[j]} never hear each other`,
          dist3D(a, b) > Math.max(a.range, b.range),
          `${dist3D(a, b).toFixed(1)} > ${Math.max(a.range, b.range)}`
        );
      }
    }
});

// --- cross-seam pollution ---
AREAS.forEach((area) => {
  Object.entries(area.creatures).forEach(([cn, c]) => {
    Object.entries(area.gates).forEach(([gn, g]) => {
      if (!g.link) return;
      const target = areaById[g.link.puzzleId];
      const partner = target.gates[g.link.gateId];
      if (!partner) return;
      Object.entries(target.gates).forEach(([on, other]) => {
        if (other === partner) return; // the pair itself is ONE door
        if (area === target && area.gates[gn] === other) return; // self
        const effective = dist3D(c, g) + dist3D(partner, other);
        assert(
          `${area.id}: ${cn} never reaches ${target.id}/${on} through the ${gn} seam`,
          effective > c.range + LEAK,
          `${effective.toFixed(1)} > ${c.range + LEAK}`
        );
      });
    });
  });
});

// --- element economy (STRICT: matching is pitch- AND duration-exact) ---
// The recordable ELEMENTS of an area are the (pitch|length) notes of every
// creature the player can get inside recording range of.
const recordableElementsByArea = AREAS.map((area) => {
  const seen = reachable(area, area.spawn);
  return Object.values(area.creatures)
    .filter((c) => minApproach(area, seen, c) <= c.range / 2)
    .map((c) => creatureElement(c));
});
// Every exit door's elements must be first recordable in the door's own
// area (poc-clap's D4 is creature-solved: the penned pair performs the
// door). "exit*" ids are the forward doors; threshold's finale gate is
// area X's exit, checked there.
AREAS.forEach((area, i) => {
  const before = new Set(recordableElementsByArea.slice(0, i).flat());
  const here = new Set([...before, ...recordableElementsByArea[i]]);
  Object.entries(area.gates).forEach(([gid, gate]) => {
    if (!gid.startsWith('exit')) return;
    const elements = songElements(gate.song);
    if (area.id === 'poc-clap') {
      assert(
        'poc-clap: exit song is not fully performable from prior areas (clap is the intended solve)',
        elements.some((e) => !before.has(e)),
        `[${elements}] vs carried {${[...before]}}`
      );
      return;
    }
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
recordableElementsByArea.forEach((elements, i) => {
  if (AREAS[i].id === 'poc-return') return;
  assert(
    `${AREAS[i].id}: finale pitch F4 is not recordable here (in ANY duration — the world stays locked)`,
    !elements.some((e) => e.startsWith('F4|')),
    `{${elements}}`
  );
});

// --- non-stuck under DELETE: every reachable pocket is escapable ---
// Pockets are the regions gates carve an area into (every gate cell
// blocked, no same-area teleports). A player who deleted their whole tape
// inside a pocket must still be able to leave: some boundary gate is an
// alwaysOpen face, or its full song is recordable from INSIDE the pocket.
// poc-clap is the sanctioned exception: its door is performed by the penned
// pair (claps re-solve it from an empty tape, forever).
AREAS.forEach((area) => {
  if (area.id === 'poc-clap') return;
  const gateCells = Object.values(area.gates).map((g) => key(g.x, g.z));
  const fullReach = reachable(area, area.spawn);
  // Enumerate pocket components over every walkable node
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
          (c) => creatureElement(c) === e && minApproach(area, pocket, c) <= c.range / 2
        )
      );
    });
    assert(
      `${area.id}: pocket ${pi} is escapable with an EMPTY tape (delete can never strand)`,
      escapable,
      `${pocket.size} cells, ${boundaryGates.length} boundary gates`
    );
  });
});

// --- area II: slots forced, and room 2 can never strand you ---
assert(
  "poc-two-keys: the room-2 echo sings the inner door's note (E4 survives any deletion)",
  A2.creatures.echo.pitch === songPitches(A2.gates.inner.song)[0],
  `${A2.creatures.echo.pitch} vs ${songPitches(A2.gates.inner.song)}`
);
assert(
  'poc-two-keys: the two door notes differ (two slots genuinely needed)',
  songPitches(A2.gates.inner.song)[0] !== songPitches(A2.gates.exit.song)[0],
  `${songPitches(A2.gates.inner.song)} vs ${songPitches(A2.gates.exit.song)}`
);
assert(
  'poc-two-keys: the keyholders live in room 1, the echo in room 2',
  A2.creatures.east.z > 6 &&
    A2.creatures.west.z > 6 &&
    A2.creatures.echo.z > 1 &&
    A2.creatures.echo.z < 6,
  'rooms'
);
// The exit note must NOT be recordable in room 2: G4 is what forces the
// second slot BEFORE entering (the echo must not hand it over late).
assert(
  "poc-two-keys: the echo is not the EXIT's note (the two-slot lesson stands)",
  A2.creatures.echo.pitch !== songPitches(A2.gates.exit.song)[0],
  A2.creatures.echo.pitch
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

// --- area IV: the dance is a working perpetual demo ---
{
  const { anchorWest, anchorEast, dancer, voice } = A4.creatures;
  assert(
    'poc-dance: anchors share one pitch (unison: never move each other)',
    anchorWest.pitch === anchorEast.pitch,
    `${anchorWest.pitch}/${anchorEast.pitch}`
  );
  assert(
    'poc-dance: dancer is DISSONANT with the anchors (their songs shove it)',
    classify(interval(dancer.pitch, anchorWest.pitch)) === 'dissonant',
    `${dancer.pitch} vs ${anchorWest.pitch}`
  );
  assert(
    "poc-dance: the anchors don't react to the player's C5 (perfect fifth)",
    classify(interval(voice.pitch, anchorWest.pitch)) === 'perfect',
    `${voice.pitch} vs ${anchorWest.pitch}`
  );
  assert(
    "poc-dance: the player's C5 tugs the dancer (non-perfect — invited participation)",
    classify(interval(voice.pitch, dancer.pitch)) !== 'perfect',
    `${voice.pitch} vs ${dancer.pitch}`
  );
  // Forces gate on the LISTENER's audible range: the dancer must hear both
  // anchors from its whole wander zone, and anchors sit AT the lane ends so
  // the dancer's dissonant song can only ever pin them harder against their
  // own cliff edge (they never wander — but pinning slides them up to half a
  // cell OUTWARD, which the dancer's range must absorb, or the dance
  // strangles itself out of earshot; observed live 2026-07-10).
  const lane = A4.floors[0];
  assert(
    'poc-dance: anchors sit at the lane ends (repulsion only pins them)',
    anchorWest.x === lane.x1 && anchorEast.x === lane.x2,
    `${anchorWest.x}/${anchorEast.x} vs lane ${lane.x1}-${lane.x2}`
  );
  const PIN_DRIFT = WORLD_SCALE / 2; // an anchor can slide to its cell face
  const laneLen = (lane.x2 - lane.x1) * WORLD_SCALE;
  assert(
    'poc-dance: dancer hears a pinned anchor even from mid-lane',
    dancer.range > laneLen / 2 + PIN_DRIFT,
    `${dancer.range} > ${(laneLen / 2 + PIN_DRIFT).toFixed(1)}`
  );
  assert(
    'poc-dance: the two hearing zones overlap (pong never stalls)',
    2 * dancer.range > laneLen + 2 * PIN_DRIFT,
    `${2 * dancer.range} > ${(laneLen + 2 * PIN_DRIFT).toFixed(1)}`
  );
  // The dance-area voice never disturbs the dancer on its own (the player
  // must CARRY the note close for the nudge).
  assert(
    "poc-dance: the ground voice's own singing is out of the dancer's earshot",
    dist3D(voice, dancer) > dancer.range,
    `${dist3D(voice, dancer).toFixed(1)} > ${dancer.range}`
  );
  // Alternation: forces apply while the dancer SINGS and exactly one anchor
  // sounds. Simulate the schedule and require repeated one-sided push
  // windows in BOTH directions. Whole notes are 4 beats; all start on beat 0.
  const SONG = 4;
  const singsAt = (t, creature) => t % creature.interval < SONG;
  let eastPushes = 0;
  let westPushes = 0;
  for (let t = 0; t < 340; t += 0.25) {
    const dancerSinging = singsAt(t, dancer);
    const w = singsAt(t, anchorWest);
    const e = singsAt(t, anchorEast);
    if (dancerSinging && w && !e) eastPushes += 0.25; // west anchor shoves east
    if (dancerSinging && e && !w) westPushes += 0.25;
  }
  assert(
    'poc-dance: the schedule shoves the dancer BOTH ways, repeatedly (perpetual dance)',
    eastPushes >= 4 && westPushes >= 4,
    `east ${eastPushes.toFixed(1)} beats, west ${westPushes.toFixed(1)} beats per 340`
  );
  // The stage is scenery: unreachable (no ramp), solid plinth (no
  // walk-under), and the dancer's pitch is not recordable from the ground.
  assert('poc-dance: no ramp touches the stage', A4.ramps.length === 0, 'scenery');
  const f = A4.floors[0];
  let plinthComplete = true;
  for (let x = f.x1; x <= f.x2; x += 1)
    for (let z = f.z1; z <= f.z2; z += 1) if (!A4.walls.has(key(x, z))) plinthComplete = false;
  assert(
    'poc-dance: the plinth under the stage is solid (no walk-under)',
    plinthComplete,
    'plinth'
  );
  const seen = reachable(A4, A4.spawn);
  let onStage = false;
  seen.forEach((node) => {
    if (node.endsWith(',1')) onStage = true;
  });
  assert('poc-dance: the stage itself is unreachable', !onStage, 'cliff-penned');
  // The stage pitches ARE recordable from beside the stage (their listener
  // ranges must be big, so their recording ranges are too). Strict economy:
  // the dancer's A5 opens NO door anywhere; the anchors' G5 appears ONLY in
  // the duet-exit/dance-entry pair — a door already BEHIND the player by
  // the time the stage is in recording reach.
  assert(
    "poc-dance: the dancer's pitch is in no door song",
    AREAS.every((ar) =>
      Object.values(ar.gates).every((g) => !songPitches(g.song).includes(dancer.pitch))
    ),
    dancer.pitch
  );
  assert(
    "poc-dance: the anchors' pitch appears only in the duet-exit/dance-entry pair",
    AREAS.every((ar) =>
      Object.entries(ar.gates).every(
        ([gid, g]) =>
          !songPitches(g.song).includes(anchorWest.pitch) ||
          (ar.id === 'poc-duet' && gid === 'exit') ||
          (ar.id === 'poc-dance' && gid === 'entry')
      )
    ),
    anchorWest.pitch
  );
}

// --- area V: the jam — a caged continuous singer kills door J forever ---
{
  const { voice, jammer } = A5.creatures;
  const J = A5.gates['exit-jammed'];
  const K = A5.gates['exit-clean'];
  assert(
    "poc-jam: both doors want the voice's note (identical, so only the jam differs)",
    songKey(J.song) === songKey(K.song) &&
      normalizeSong(J.song).length === 1 &&
      songPitches(J.song)[0] === voice.pitch,
    `${songKey(J.song)} vs ${songKey(K.song)} vs voice ${voice.pitch}`
  );
  assert(
    'poc-jam: the two doors land on two DISTINCT gates of poc-pull',
    J.link.puzzleId === 'poc-pull' &&
      K.link.puzzleId === 'poc-pull' &&
      J.link.gateId !== K.link.gateId,
    `${J.link.gateId} / ${K.link.gateId}`
  );
  assert(
    'poc-jam: jammer is CONTINUOUS (interval == song length: no silence window, ever)',
    jammer.interval === 4,
    `interval ${jammer.interval}`
  );
  assert(
    'poc-jam: jammer reaches door J even from the far pen corner (J can never open)',
    dist3D(jammer, J) + PEN_DRIFT <= jammer.range,
    `${(dist3D(jammer, J) + PEN_DRIFT).toFixed(1)} <= ${jammer.range}`
  );
  assert(
    'poc-jam: door K never hears the jammer (the clean control door)',
    dist3D(jammer, K) > jammer.range + LEAK,
    `${dist3D(jammer, K).toFixed(1)} > ${jammer.range + LEAK}`
  );
  const ringComplete = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ].every(([dx, dz]) => A5.walls.has(key(jammer.x + dx, jammer.z + dz)));
  assert('poc-jam: jammer pen ring is complete', ringComplete, `(${jammer.x},${jammer.z})`);
  assert(
    "poc-jam: pen standoff beats recording range (the jammer's B5 is unrecordable)",
    jammer.range / 2 < PEN_STANDOFF,
    `${jammer.range / 2} < ${PEN_STANDOFF}`
  );
  assert(
    "poc-jam: the jammer's pitch is in no door song anywhere",
    AREAS.every((ar) =>
      Object.values(ar.gates).every((g) => !songPitches(g.song).includes(jammer.pitch))
    ),
    jammer.pitch
  );
}

// --- area VI: the pull — the movable jammer IS the puzzle ---
{
  const { voice, jammer } = A6.creatures;
  const { exit } = A6.gates;
  assert(
    'poc-pull: voice is CONSONANT with the jammer (playback ATTRACTS it)',
    classify(interval(voice.pitch, jammer.pitch)) === 'consonant',
    `${voice.pitch} vs ${jammer.pitch}`
  );
  assert(
    'poc-pull: jammer is CONTINUOUS (area V’s jam, now free-standing)',
    jammer.interval === 4,
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
      songPitches(exit.song)[0] === voice.pitch &&
      !songPitches(exit.song).includes(jammer.pitch),
    songKey(exit.song)
  );
  assert(
    'poc-pull: jammer starts far from both entry doors',
    ['entry-a', 'entry-b'].every((g) => dist3D(jammer, A6.gates[g]) > jammer.range + LEAK),
    ['entry-a', 'entry-b'].map((g) => dist3D(jammer, A6.gates[g]).toFixed(1)).join(' / ')
  );
  const seen = reachable(A6, A6.spawn);
  assert(
    'poc-pull: the exit is walkable regardless of the jammer (the jam is sound, not body)',
    reachesAdjacent(seen, exit),
    'open'
  );
  let parkCells = 0;
  seen.forEach((node) => {
    const [x, z, l] = node.split(',').map(Number);
    if (l === 0 && dist3D({ x, z, y: 0 }, exit) > jammer.range + 1) parkCells += 1;
  });
  assert(
    'poc-pull: plenty of reachable floor un-jams the exit (somewhere to drag the jammer)',
    parkCells >= 8,
    `${parkCells} park cells`
  );
  // Nothing recordable by now may PUSH the jammer (dissonant would let the
  // player wedge it INTO places the pull can't recover cleanly).
  const available = new Set(
    recordableElementsByArea
      .slice(0, 6)
      .flat()
      .map((e) => e.split('|')[0])
  );
  available.forEach((p) => {
    assert(
      `poc-pull: ${p} cannot PUSH the jammer (nothing dissonant with ${jammer.pitch})`,
      classify(interval(p, jammer.pitch)) !== 'dissonant',
      classify(interval(p, jammer.pitch))
    );
  });
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
    classify(interval(voice.pitch, pusher.pitch)) === 'dissonant',
    `${voice.pitch} vs ${pusher.pitch}`
  );
  const available = new Set(
    recordableElementsByArea
      .slice(0, 7)
      .flat()
      .map((e) => e.split('|')[0])
  );
  available.forEach((p) => {
    assert(
      `poc-push: ${p} cannot PULL the pusher back (nothing consonant with ${pusher.pitch})`,
      classify(interval(p, pusher.pitch)) !== 'consonant',
      classify(interval(p, pusher.pitch))
    );
  });
  assert(
    "poc-push: the exit door wants the PUSHER's own note (creatures activate gates)",
    normalizeSong(A7.gates.exit.song).length === 1 &&
      songPitches(A7.gates.exit.song)[0] === pusher.pitch,
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
  assert(
    'poc-push: pusher sits in a 1-wide corridor',
    flanked,
    `(${A7.creatures.pusher.x},${A7.creatures.pusher.z})`
  );
  let herdable = false;
  open.forEach((node) => {
    const [x, z, l] = node.split(',').map(Number);
    if (l === 0 && dist3D({ x, z, y: 0 }, A7.gates.exit) <= pusher.range) herdable = true;
  });
  assert('poc-push: a reachable strip cell puts the pusher in door range', herdable, 'strip');
}

// --- area VIII: clap math ---
{
  const { first, second } = A8.creatures;
  const door = A8.gates.exit;
  const doorPitches = songPitches(door.song);
  assert(
    'poc-clap: door melody is [first, second]',
    doorPitches[0] === first.pitch && doorPitches[1] === second.pitch,
    doorPitches.join(',')
  );
  [first, second].forEach((c, i) => {
    assert(
      `poc-clap: creature ${i + 1} reaches the door with margin`,
      dist3D(c, door) <= c.range - 0.5,
      `${dist3D(c, door).toFixed(1)} <= ${c.range - 0.5}`
    );
  });
  assert(
    'poc-clap: intervals match and leave >=1 beat of silence',
    first.interval === second.interval && first.interval - 8 >= 1,
    `interval ${first.interval}`
  );
  assert(
    'poc-clap: displacement (1 beat) reaches the 4-beat offset and wraps the cycle',
    A8.clapDisplacement === '1/4',
    A8.clapDisplacement
  );
  // Clap reach is 3D and the player's ear sits at eye height, so the
  // EFFECTIVE horizontal clap radius is sqrt(CLAP² − EYE²) — the pens must
  // sit farther apart than twice that for a double-clap spot to be
  // impossible.
  const clapReachH = Math.sqrt(CLAP_RANGE * CLAP_RANGE - EYE * EYE);
  assert(
    'poc-clap: pair separation exceeds twice the effective clap reach (no double-clap spot)',
    dist3D(first, second) > 2 * clapReachH,
    `${dist3D(first, second).toFixed(1)} > ${(2 * clapReachH).toFixed(1)}`
  );
  // Hint lens: somewhere REACHABLE (scanned at half-cell resolution — the
  // player moves continuously) hears both creatures within clap range of one.
  const seen = reachable(A8, A8.spawn);
  const cells = new Set();
  seen.forEach((node) => {
    const [x, z, l] = node.split(',').map(Number);
    if (l === 0) cells.add(key(x, z));
  });
  let hintSpot = false;
  cells.forEach((k) => {
    const [cx, cz] = k.split(',').map(Number);
    for (let dx = -0.5; dx <= 0.5; dx += 0.5)
      for (let dz = -0.5; dz <= 0.5; dz += 0.5) {
        // Only positions whose containing cell is open
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
    'poc-clap: a reachable spot hears both creatures within clap range of one',
    hintSpot,
    'lens'
  );
  [first, second].forEach((c, i) => {
    const ringComplete = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ].every(([dx, dz]) => A8.walls.has(key(c.x + dx, c.z + dz)) || c.x + dx < 0 || c.z + dz < 0);
    assert(`poc-clap: creature ${i + 1} pen ring is complete`, ringComplete, `(${c.x},${c.z})`);
  });
}

// --- area IX: the climb is forced by pillars, the ramp works ---
{
  const { perch } = A9.creatures;
  const rec = perch.range / 2;
  const seen = reachable(A9, A9.spawn);
  let groundMin = Infinity;
  let slabMin = Infinity;
  seen.forEach((node) => {
    const [x, z, l] = node.split(',').map(Number);
    const d = playerDist({ x, z }, l, perch);
    if (l === 0) groundMin = Math.min(groundMin, d);
    else slabMin = Math.min(slabMin, d);
  });
  assert(
    'poc-climb: perch is OUT of recording range from every ground cell (pillars force the climb)',
    groundMin > rec,
    `${groundMin.toFixed(2)} > ${rec}`
  );
  assert(
    'poc-climb: perch IS recordable from the slab',
    slabMin <= rec - 0.3,
    `${slabMin.toFixed(2)} <= ${rec - 0.3}`
  );
  assert('poc-climb: the slab is reachable (ramp connects)', slabMin < Infinity, 'ramp');
  assert(
    'poc-climb: a pillar sits directly beneath the perch',
    A9.walls.has(key(perch.x, perch.z)),
    key(perch.x, perch.z)
  );
}

// --- area IX: the walk-under is forced ---
{
  const underSlab = [];
  const f = A9.floors[0];
  for (let x = f.x1; x <= f.x2; x += 1)
    for (let z = f.z1; z <= f.z2; z += 1) if (!A9.walls.has(key(x, z))) underSlab.push(key(x, z));
  const sealed = reachable(A9, A9.spawn, underSlab);
  const rampLow = { x: 9, z: 2 };
  assert(
    'poc-climb: without passing UNDER the slab, the ramp cannot be reached',
    !canReach(sealed, rampLow.x, rampLow.z, 0),
    'sealed'
  );
  const open = reachable(A9, A9.spawn);
  assert(
    'poc-climb: the under-slab route reaches the ramp',
    canReach(open, rampLow.x, rampLow.z, 0),
    'open'
  );
}

// --- area X: the warm-up teaches the finale's skills, the hall delivers ---
{
  const V = A10.gates['warmup-in'];
  const H = A10.gates['warmup-out'];
  const { exit } = A10.gates;
  const { fVoice } = A10.creatures;
  assert(
    'poc-return: the warm-up door wants the SAME quarter note twice (repetition, one voice)',
    songKey(V.song) ===
      JSON.stringify([
        { pitch: fVoice.pitch, length: '1/4' },
        { pitch: fVoice.pitch, length: '1/4' },
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
  const vestibule = reachable(A10, A10.spawn, [key(V.x, V.z), key(H.x, H.z)], 'none');
  assert(
    "poc-return: the warm-up song is recordable INSIDE the vestibule (the lesson can't be skipped)",
    minApproach(A10, vestibule, fVoice) <= fVoice.range / 2,
    minApproach(A10, vestibule, fVoice).toFixed(2)
  );
  // The finale: the full couplet, all quarters, all six elements local.
  assert(
    'poc-return: the finale song IS the Twinkle couplet',
    songKey(exit.song) === JSON.stringify(TWINKLE),
    `${normalizeSong(exit.song).length} notes`
  );
  assert(
    'poc-return: the finale is all QUARTER notes (carried whole notes can never fake it)',
    normalizeSong(exit.song).every((n) => n.length === '1/4'),
    'quarters'
  );
  assert(
    'poc-return: the finale portal pairs with the threshold finale gate, which rolls the credits',
    exit.link.puzzleId === 'poc-threshold' &&
      exit.link.gateId === 'finale' &&
      A1.gates.finale.ending === true,
    'ending'
  );
  const elementsHere = new Set(Object.values(A10.creatures).map((c) => creatureElement(c)));
  assert(
    "poc-return: every finale element is one of the hall/vestibule voices' notes",
    songElements(exit.song).every((e) => elementsHere.has(e)),
    `{${[...elementsHere]}}`
  );
  assert(
    'poc-return: elements only — every voice sings a SINGLE quarter note (no chunks of the answer)',
    Object.values(A10.creatures).every((c) => c.len === '1/4'),
    'single quarters'
  );
  assert(
    'poc-return: six voices, six distinct pitches (as few creatures as the couplet allows)',
    new Set(Object.values(A10.creatures).map((c) => c.pitch)).size === 6 &&
      Object.keys(A10.creatures).length === 6,
    Object.values(A10.creatures)
      .map((c) => c.pitch)
      .join(',')
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

const outDir = path.join(__dirname, '..', 'public', 'puzzles');
AREAS.forEach((area) => {
  const entities = [];
  Object.values(area.creatures).forEach((c) => {
    entities.push({
      type: 'creature',
      position: { x: c.x, y: c.y || 0, z: c.z },
      data: {
        song: [{ pitch: c.pitch, length: c.len || '1/1' }],
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
  Object.entries(area.gates).forEach(([gid, g]) => {
    entities.push({
      type: 'gate',
      position: { x: g.x, y: g.y || 0, z: g.z },
      song: normalizeSong(g.song),
      id: gid,
      facing: 'north',
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
    ...(area.clapDisplacement ? { clapDisplacement: area.clapDisplacement } : {}),
    playerStart: area.spawn,
    ...(area.floors.length ? { floors: area.floors } : {}),
    entities,
  };
  const file = path.join(outDir, `${area.id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(puzzle, null, 2)}\n`);
  console.log(`wrote ${file} (${entities.length} entities)`);
});
console.log(`\nall ${checks.length} constraints pass — POC world written`);
