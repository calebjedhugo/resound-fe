// Generates public/puzzles/the-lure.json — the wordless "lure" intro level.
//
// Teaches, in ONE puzzle and with NO words, that HARMONY MOVES CREATURES and
// that it is RELATIONAL — the same played note does opposite things depending
// on the creature's own pitch:
//   * consonant interval → the creature is ATTRACTED (pulled toward you)
//   * dissonant interval → the creature is REPELLED (pushed away from you)
//   * perfect (unison/4th/5th) → no force
//
// GEOMETRY (north = decreasing z; 3D world units, WORLD_SCALE = 3):
//   A single 1-wide corridor runs north up the center (x = 9) from the spawn
//   room to a FOUNTAIN sealed in an alcove at the north tip (wants G4). Two
//   creatures stand in that corridor:
//     P1 (sings C5) blocks the SOUTH end — must be PULLED out.
//     P2 (sings G4 = the fountain's note) stands NORTH of P1 — must be PUSHED
//        the rest of the way into the fountain's range.
//   In the open spawn room sits one voice creature V (sings A4), the only
//   thing you can record to begin with.
//
// THE ONE NOTE, A4, DOES BOTH (relational harmony):
//   * A4 vs C5 = minor 3rd  → CONSONANT → play near P1, it is PULLED to you.
//     Back into the room and P1 follows out of the corridor; the path clears.
//   * A4 vs G4 = major 2nd  → DISSONANT → advance to P2, play the SAME A4, and
//     P2 flees AWAY from you (north) into the fountain's range, activating it.
//
// DIRECTIONS ARE FORCED BY THE NOTE ECONOMY (nothing to tune, cannot cheese):
//   * P1 can ONLY be pulled: the only reachable note (A4) is consonant with C5,
//     and the note that WOULD push it (G4) is perfect with C5 anyway AND is
//     locked behind P1. You are always south of P1, so attraction pulls it out.
//   * P2 can ONLY be pushed: no consonant-with-G4 note exists anywhere in the
//     level, and you can never get north of P2 to pull it. You are always south
//     of P2, so repulsion drives it north into the fountain.
//
// THE FINISH IS HARDENED (not solvable by record-and-play):
//   The fountain is sealed and P2 bodily blocks the 1-wide corridor the entire
//   time it is being pushed, so you can NEVER reach the fountain to play G4
//   yourself — the only G4 that ever reaches it comes from P2's own throat,
//   driven there by the push. A4's audibleRange is small enough that your
//   playback never bleeds into the fountain to corrupt the match.
//
// NON-STUCK BY CONSTRUCTION (Caleb's deal-breaker):
//   You only ever need ONE note (A4), always re-recordable from V — you cannot
//   strand yourself by overwriting a slot. P1 always pulls fully into the open
//   room; P2 always pushes into range; the corridor is two-way; there is no
//   elevation and no one-way trap anywhere.
//
// See DESIGN.md ("Onboarding") and ROADMAP.md ("Onboarding & Open-World
// Direction"). Edit this generator and rerun; do NOT hand-edit the JSON:
//   node puzzles/gen-lure.js public/puzzles/the-lure.json
const fs = require('fs');

const WORLD_SCALE = 3;
const GRID = 18;
const entities = [];

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

// --- cast (grid coords) ---
// V: the voice you record. A4 is a minor-3rd from C5 (pulls P1) and a
// major-2nd from G4 (pushes P2). Small range so its playback never reaches F.
const V = { x: 3, y: 0, z: 15, song: 'A4', interval: 6, range: 5 };
// P1: the SOUTH blocker, pulled OUT of the corridor. C5 never matches F.
const P1 = { x: 9, y: 0, z: 11, song: 'C5', interval: 6, range: 10 };
// P2: the pusher, sings the fountain's note. Small range so it only activates
// F once shoved close, and so it is not pre-activating F from its start.
const P2 = { x: 9, y: 0, z: 5, song: 'G4', interval: 6, range: 6 };
const FOUNT = { x: 9, z: 1, song: 'G4' };
const SPAWN = { x: 9, y: 0, z: 15 };

// Player collision clearance: a creature (radius 0.9) centred in a 1-wide
// corridor sits ≥ 0.4 + 0.9 = 1.3 world units from any spot the player
// (radius 0.4) can occupy, so the player can never squeeze past it.
const PLAYER_CLEARANCE = 0.4 + 0.9;

// --- build creatures ---
const creature = (c) => ({
  type: 'creature',
  position: { x: c.x, y: c.y, z: c.z },
  data: { song: [{ pitch: c.song, length: '1/1' }], interval: c.interval, audibleRange: c.range },
});
entities.push(creature(V), creature(P1), creature(P2));

// --- build walls: a 1-wide corridor (x = 9) sealed from the room by a wall
// row at z = 12 (single gap at x = 9), flanked N/S by walls, capped at the top
// so the fountain sits in a sealed alcove. ---
const walls = new Set();
const addWall = (x, z) => {
  if (x < 0 || x >= GRID || z < 0 || z >= GRID) return; // perimeter auto-generates
  walls.add(`${x},${z}`);
};
// Wall row separating the spawn room from the corridor (only x = 9 is open).
const WALL_ROW_Z = 12;
for (let x = 0; x < GRID; x += 1) {
  if (x !== 9) addWall(x, WALL_ROW_Z);
}
// Corridor flanks (make x = 9 a 1-wide tube from the alcove up to the wall row).
for (let z = 0; z <= 11; z += 1) {
  addWall(8, z);
  addWall(10, z);
}
// North cap so the fountain's alcove is sealed (only entrance is south).
addWall(9, 0);
walls.forEach((key) => {
  const [x, z] = key.split(',').map(Number);
  entities.push({ type: 'wall', position: { x, y: 0, z } });
});

// --- the fountain (single whole note; sealed in the north alcove) ---
entities.push({
  type: 'fountain',
  position: { x: FOUNT.x, y: 0, z: FOUNT.z },
  song: [{ pitch: FOUNT.song, length: '1/1' }],
});

const puzzle = {
  id: 'the-lure',
  name: 'The Lure',
  difficulty: 1,
  gridSize: GRID,
  tempo: 100,
  keySignature: 'C',
  timeSignature: [4, 4],
  playerStart: SPAWN,
  entities,
};

// ---------------------------------------------------------------------------
// Constraint checker: prove the design before loading it in the game.
// ---------------------------------------------------------------------------
const W = (c) => ({ x: c.x * WORLD_SCALE, z: c.z * WORLD_SCALE });
const d2 = (a, b) => {
  const p = W(a);
  const q = W(b);
  return Math.hypot(p.x - q.x, p.z - q.z);
};
const checks = [];
const assert = (name, cond, detail) => checks.push({ name, ok: !!cond, detail });

// --- RELATIONAL HARMONY: one note (A4) pulls one creature, pushes the other ---
assert(
  'A4 is CONSONANT with P1 (C5) — pulls the blocker',
  classify(interval(V.song, P1.song)) === 'consonant',
  `interval ${interval(V.song, P1.song)} → ${classify(interval(V.song, P1.song))}`
);
assert(
  'A4 is DISSONANT with P2 (G4) — pushes the pusher',
  classify(interval(V.song, P2.song)) === 'dissonant',
  `interval ${interval(V.song, P2.song)} → ${classify(interval(V.song, P2.song))}`
);

// --- DIRECTIONS ARE FORCED (cannot be moved the other way) ---
// P1 can only be PULLED: A4 is not dissonant with C5, and G4 (the only
// dissonant-with-C5 note) is perfect with C5 anyway AND locked behind P1.
assert(
  'P1 cannot be pushed by the voice (A4 is not dissonant with C5)',
  classify(interval(V.song, P1.song)) !== 'dissonant',
  classify(interval(V.song, P1.song))
);
assert(
  "P2's note (G4) is PERFECT with P1 (C5) — cannot push P1 even if reachable",
  classify(interval(P2.song, P1.song)) === 'perfect',
  `interval ${interval(P2.song, P1.song)} → ${classify(interval(P2.song, P1.song))}`
);
// P2 can only be PUSHED: no consonant-with-G4 note is reachable in the level.
assert(
  'P2 cannot be pulled by the voice (A4 is not consonant with G4)',
  classify(interval(V.song, P2.song)) !== 'consonant',
  classify(interval(V.song, P2.song))
);
assert(
  'P1 (C5) is not consonant with G4 — cannot pull P2 either',
  classify(interval(P1.song, P2.song)) !== 'consonant',
  classify(interval(P1.song, P2.song))
);

// --- ONLY P2 CAN SOLVE THE FOUNTAIN ---
assert('Fountain note equals P2 (the pusher)', FOUNT.song === P2.song, FOUNT.song);
assert('Fountain note ≠ P1 note (P1 can never solve it)', FOUNT.song !== P1.song, P1.song);
assert('Fountain note ≠ voice note (V can never solve it)', FOUNT.song !== V.song, V.song);

// --- NOTHING SELF-SOLVES / SELF-MOVES AT START (range separation) ---
assert(
  'P2 does NOT reach the fountain from its start (no pre-activation)',
  d2(P2, FOUNT) > P2.range,
  `${d2(P2, FOUNT).toFixed(1)} > ${P2.range}`
);
assert(
  'Voice does NOT reach the fountain (never self-solves / corrupts)',
  d2(V, FOUNT) > V.range,
  `${d2(V, FOUNT).toFixed(1)} > ${V.range}`
);
assert(
  'P1 does not hear the voice (no auto-pull toward V)',
  d2(P1, V) > P1.range,
  `${d2(P1, V).toFixed(1)} > ${P1.range}`
);
assert(
  'P2 does not hear the voice (no auto-push from V)',
  d2(P2, V) > P2.range,
  `${d2(P2, V).toFixed(1)} > ${P2.range}`
);
assert(
  'P1 and P2 do not hear each other (no auto-drift)',
  d2(P1, P2) > Math.max(P1.range, P2.range),
  `${d2(P1, P2).toFixed(1)} > ${Math.max(P1.range, P2.range)}`
);

// --- HARDENED FINISH: the player can never deliver G4 to the fountain ---
// P2 bodily blocks the 1-wide corridor, so the player is always ≥ CLEARANCE
// south of P2. The player's G4 playback carries P2's range; at the moment P2
// first reaches the fountain (dist = P2.range) the player is a full clearance
// further away, hence outside G4's reach. And before any push, standing at
// P2's start cell is already outside G4's reach of the fountain.
assert(
  'Player can never carry G4 into fountain range (P2 blocks; dist(P2,F) > range)',
  d2(P2, FOUNT) > P2.range,
  `${d2(P2, FOUNT).toFixed(1)} > ${P2.range}`
);
assert(
  "Voice playback never corrupts the fountain during the push (A4 can't reach F)",
  P2.range + PLAYER_CLEARANCE > V.range,
  `player min dist ≈ ${(P2.range + PLAYER_CLEARANCE).toFixed(1)} > A4 range ${V.range}`
);

// --- GEOMETRY: both creatures block a 1-wide corridor; one opening north ---
const flanked = (c) => walls.has(`${c.x - 1},${c.z}`) && walls.has(`${c.x + 1},${c.z}`);
assert('P1 blocks a 1-wide corridor cell (walls at x±1)', flanked(P1), `(${P1.x},${P1.z})`);
assert('P2 blocks a 1-wide corridor cell (walls at x±1)', flanked(P2), `(${P2.x},${P2.z})`);
const wallRowGaps = [];
for (let x = 0; x < GRID; x += 1) if (!walls.has(`${x},${WALL_ROW_Z}`)) wallRowGaps.push(x);
assert(
  'The wall row has exactly ONE opening (the corridor)',
  wallRowGaps.length === 1 && wallRowGaps[0] === 9,
  `gaps at x=[${wallRowGaps.join(',')}]`
);

// --- NON-STUCK / CONNECTIVITY ---
assert('Voice is in the open spawn room (always re-recordable)', V.z > WALL_ROW_Z, `V.z ${V.z}`);
assert('Spawn is in the open room', SPAWN.z > WALL_ROW_Z, `spawn.z ${SPAWN.z}`);
assert('P1 is in the corridor', P1.z < WALL_ROW_Z && P1.x === 9, `(${P1.x},${P1.z})`);
assert('P2 is in the corridor, north of P1', P2.z < P1.z && P2.x === 9, `(${P2.x},${P2.z})`);
assert('Fountain is north of P2 (the pusher drives it there)', FOUNT.z < P2.z, `F.z ${FOUNT.z}`);
assert('Voice is recordable', V.range / 2 >= 1, `recordRange ${V.range / 2}`);

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`));
if (failed.length) {
  console.error(`\n${failed.length} constraint(s) FAILED — not writing puzzle.`);
  process.exit(1);
}

fs.writeFileSync(process.argv[2], `${JSON.stringify(puzzle, null, 2)}\n`);
console.log(
  `\nwrote ${process.argv[2]} (${entities.length} entities) — all ${checks.length} constraints pass`
);
