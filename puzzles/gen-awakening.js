// Generates public/puzzles/awakening.json — the wordless intro level (v5).
//
// Teaches, in order, with NO words:
//   move (WASD) → record (R) + play (Space) + play-to-pass gate (Gate 1, C4)
//   → ramp UP to a platform → LURE a creature down the ramp (consonance)
//   → DUET at the fountain (which forces holding two recordings at once).
//
// TWO-SLOT FORCING — via geometry + the play-to-pass gate, no force-balance:
//   * Gate 1 wants C4. C4 comes from creature A, which is SOUTH of the gate.
//   * Creature X (E4, the lure key) and the fountain are NORTH of the gate.
//   * Gates never latch: crossing needs the song performed each time. So to
//     reach X you must pass Gate 1 (play C4). Once north, C4 cannot be
//     re-recorded — A sits behind a gate that needs C4 to cross back.
//   * The fountain duet needs C4 (+ B's live C5); the lure needs E4. Since C4
//     is unrecoverable once north, the player must hold BOTH C4 and E4 at the
//     same time → two slots, forced. (An earlier draft used dissonant
//     "guardian" creatures to evict B from the fountain; the gate makes them
//     unnecessary, and equal force-radii made their coverage leave a dead
//     annulus where B just parked. Removed.)
//
// THE LURE (taught by necessity): the fountain wants C4+C5; playback is
// single-channel, so C5 must be sung LIVE at the fountain by creature B. The
// only way to move B is sound — E4 (a minor sixth below C5 = consonant) pulls
// B; C4 (an octave = perfect) does not. So the player leads B down the ramp
// with E4 (pied-piper), then sings the low C4 for the duet.
//
// north = decreasing z. 3D world units (WORLD_SCALE=3); a note reaches a
// target within the SOURCE's audibleRange; recordRange = range/2.
const fs = require('fs');

const WORLD_SCALE = 3;
const ELEVATION_HEIGHT = 3;
const GRID = 20;
const entities = [];

// --- cast (grid coords; y = elevation level) ---
const A = { x: 11, y: 0, z: 16, song: 'C4', interval: 8, range: 12 }; // gate-1 key + duet low voice (SOUTH of gate)
const X = { x: 15, y: 0, z: 9, song: 'E4', interval: 8, range: 6 }; //  lure key (NORTH of gate)
const B = { x: 11, y: 1, z: 3, song: 'C5', interval: 6, range: 15 }; // live duet high voice (on platform)
const GATE1 = { x: 11, z: 11, song: 'C4' };
const FOUNT = { x: 4, z: 10 };
const RAMP = { x: 11, z: 8, dir: 'north' }; // low end south, high end north onto platform
const PLATFORM = { elevation: 1, x1: 8, z1: 2, x2: 15, z2: 7 };
const SPAWN = { x: 11, y: 0, z: 18 };

// --- build entities ---
const creature = (c) => ({
  type: 'creature',
  position: { x: c.x, y: c.y, z: c.z },
  data: { song: [{ pitch: c.song, length: '1/1' }], interval: c.interval, audibleRange: c.range },
});
entities.push(creature(A), creature(X), creature(B));

// Gate 1 wall row (forces the player through the gate cell)
for (let x = 0; x < GRID; x += 1) {
  if (x === GATE1.x) {
    entities.push({
      type: 'gate',
      position: { x, y: 0, z: GATE1.z },
      song: [{ pitch: GATE1.song, length: '1/1' }],
    });
  } else {
    entities.push({ type: 'wall', position: { x, y: 0, z: GATE1.z } });
  }
}

entities.push({ type: 'ramp', position: { x: RAMP.x, y: 0, z: RAMP.z }, direction: RAMP.dir });

entities.push({
  type: 'fountain',
  position: { x: FOUNT.x, y: 0, z: FOUNT.z },
  song: [
    [
      { pitch: 'C4', length: '1/1' },
      { pitch: 'C5', length: '1/1' },
    ],
  ],
});

const puzzle = {
  id: 'awakening',
  name: 'Awakening',
  difficulty: 1,
  gridSize: GRID,
  tempo: 100,
  keySignature: 'C',
  timeSignature: [4, 4],
  playerStart: SPAWN,
  floors: [PLATFORM],
  entities,
};

// ---------------------------------------------------------------------------
// Constraint checker: prove the geometry before loading it in the game.
// ---------------------------------------------------------------------------
const W = (c) => ({ x: c.x * WORLD_SCALE, y: (c.y || 0) * ELEVATION_HEIGHT, z: c.z * WORLD_SCALE });
const d3 = (a, b) => {
  const p = W(a);
  const q = W(b);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
};
const checks = [];
const assert = (name, cond, detail) => checks.push({ name, ok: cond, detail });

// Gate 1 must hear ONLY the player's C4: no creature's song may reach it.
assert(
  'A(C4) does not reach Gate1',
  d3(A, GATE1) > A.range,
  `${d3(A, GATE1).toFixed(1)} > ${A.range}`
);
assert(
  'X(E4) does not reach Gate1',
  d3(X, GATE1) > X.range,
  `${d3(X, GATE1).toFixed(1)} > ${X.range}`
);
assert(
  'B(C5) does not reach Gate1',
  d3(B, GATE1) > B.range,
  `${d3(B, GATE1).toFixed(1)} > ${B.range}`
);

// Fountain duet must hear ONLY player C4 + B's C5: no stray singer reaches it.
assert(
  'A(C4) does not reach Fountain',
  d3(A, FOUNT) > A.range,
  `${d3(A, FOUNT).toFixed(1)} > ${A.range}`
);
assert(
  'X(E4) does not reach Fountain',
  d3(X, FOUNT) > X.range,
  `${d3(X, FOUNT).toFixed(1)} > ${X.range}`
);
assert(
  'B can reach Fountain when lured close',
  1 * WORLD_SCALE <= B.range,
  `dock ~${WORLD_SCALE} <= ${B.range}`
);

// TWO-SLOT FORCING invariant (see header): C4's source is SOUTH of the gate,
// the lure key + fountain are NORTH, and the gate wants C4.
assert(
  'Gate 1 wants the same song as creature A (C4)',
  GATE1.song === A.song,
  `${GATE1.song} === ${A.song}`
);
assert(
  'C4 source (A) is SOUTH of Gate 1 (behind it)',
  A.z > GATE1.z,
  `A.z ${A.z} > gate.z ${GATE1.z}`
);
assert('Lure key (X) is NORTH of Gate 1', X.z < GATE1.z, `X.z ${X.z} < gate.z ${GATE1.z}`);
assert(
  'Fountain is NORTH of Gate 1 (duet needs no re-cross)',
  FOUNT.z < GATE1.z,
  `F.z ${FOUNT.z} < gate.z ${GATE1.z}`
);
assert('Platform (B) is NORTH of Gate 1', B.z < GATE1.z, `B.z ${B.z} < gate.z ${GATE1.z}`);

// Ramp connectivity: platform must include the ramp's high-edge cell.
const highCell = { x: RAMP.x, z: RAMP.z - 1 };
const inPlatform =
  highCell.x >= PLATFORM.x1 &&
  highCell.x <= PLATFORM.x2 &&
  highCell.z >= PLATFORM.z1 &&
  highCell.z <= PLATFORM.z2;
assert(
  'Ramp high edge lands on the platform',
  inPlatform,
  `high cell (${highCell.x},${highCell.z})`
);

// Recordability.
assert('A is recordable', A.range / 2 >= 1, `recordRange ${A.range / 2}`);
assert('X is recordable', X.range / 2 >= 1, `recordRange ${X.range / 2}`);

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
