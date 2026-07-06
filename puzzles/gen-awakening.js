// Generates public/puzzles/awakening.json — the wordless intro level (v6).
//
// Teaches, in order, with NO words:
//   move (WASD) → record (R) + play (Space) + play-to-pass gate (Gate 1, C4)
//   → ramp UP to a platform → SLOTS: play a two-note melody by switching
//   inventory slots (←/→) at the fountain.
//
// TWO-SLOT FORCING — via TIMING, not scarcity, so nothing can ever get stuck:
//   * The fountain wants the melody [E4, G4]. E4 is creature X's song, G4 is
//     creature Y's. X and Y are far apart (Y is up on the platform), so you
//     can't capture both in one recording — each goes in its own slot.
//   * To solve it you play E4, switch slots, and play G4 in the SAME phrase
//     (a beat later). A one-slot player would have to re-record between the
//     two notes; that walk is many beats long, so the fountain hears two
//     separate phrases and never matches. Two slots + a slot switch: required.
//   * NO stuck state: every creature stays reachable, and the gate's key (C4)
//     is NOT one of the melody notes — so C4 is only ever needed to cross
//     Gate 1, never again. Overwrite any slot you like and just re-record;
//     ramps are two-way; there is no one-way trap anywhere. (This replaces the
//     old "C4 unrecoverable once north" forcing, which could soft-lock the
//     player if they overwrote their C4 recording.)
//
// The lure/duet is intentionally NOT taught here — it belongs in a later
// level. See DESIGN.md.
//
// north = decreasing z. 3D world units (WORLD_SCALE=3); a note reaches a
// target within the SOURCE's audibleRange; recordRange = range/2.
const fs = require('fs');

const WORLD_SCALE = 3;
const ELEVATION_HEIGHT = 3;
const GRID = 18;
const entities = [];

// --- cast (grid coords; y = elevation level) ---
const A = { x: 9, y: 0, z: 14, song: 'C4', interval: 8, range: 10 }; // gate-1 key (SOUTH of gate)
const X = { x: 3, y: 0, z: 6, song: 'E4', interval: 8, range: 8 }; //  first melody note (ground, north)
const Y = { x: 13, y: 1, z: 3, song: 'G4', interval: 8, range: 8 }; // second melody note (on the platform)
const GATE1 = { x: 9, z: 10, song: 'C4' };
const FOUNT = { x: 9, z: 6, melody: ['E4', 'G4'] };
const RAMP = { x: 12, z: 5, dir: 'north' }; // low end south, high end north onto the platform
const PLATFORM = { elevation: 1, x1: 10, z1: 1, x2: 15, z2: 4 };
const SPAWN = { x: 9, y: 0, z: 15 };

// --- build entities ---
const creature = (c) => ({
  type: 'creature',
  position: { x: c.x, y: c.y, z: c.z },
  data: { song: [{ pitch: c.song, length: '1/1' }], interval: c.interval, audibleRange: c.range },
});
entities.push(creature(A), creature(X), creature(Y));

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

// The melody fountain: two whole notes, in order. Whole notes match how the
// recordings naturally play back-to-back — the playback lock holds the second
// note until the first (a whole note) finishes, so the onsets land ~4 beats
// apart on their own. The player just plays E4, then plays G4 when it can;
// no tight timing. (Quarter-note targets would demand a 1-beat gap the
// playback lock can't produce from whole-note recordings.)
entities.push({
  type: 'fountain',
  position: { x: FOUNT.x, y: 0, z: FOUNT.z },
  song: FOUNT.melody.map((pitch) => ({ pitch, length: '1/1' })),
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
  'Y(G4) does not reach Gate1',
  d3(Y, GATE1) > Y.range,
  `${d3(Y, GATE1).toFixed(1)} > ${Y.range}`
);

// The fountain must hear ONLY the player's melody: no creature reaches it, so
// nothing self-solves and no stray note corrupts the take.
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
  'Y(G4) does not reach Fountain',
  d3(Y, FOUNT) > Y.range,
  `${d3(Y, FOUNT).toFixed(1)} > ${Y.range}`
);

// Opening Gate 1 (player C4, carrying A's range) must not spill into the
// fountain and leave a stale note there.
const playerC4Range = A.range;
assert(
  'C4 played at Gate1 does not reach Fountain',
  d3(GATE1, FOUNT) > playerC4Range,
  `${d3(GATE1, FOUNT).toFixed(1)} > ${playerC4Range}`
);

// NON-STUCK invariant: the gate's key is NOT a melody note (so C4 is never
// needed once north), and both melody sources are north of the gate.
assert(
  'Gate key (C4) is NOT one of the melody notes',
  !FOUNT.melody.includes(GATE1.song),
  FOUNT.melody.join('+')
);
assert('E4 source (X) is NORTH of Gate 1', X.z < GATE1.z, `X.z ${X.z} < gate.z ${GATE1.z}`);
assert('G4 source (Y) is NORTH of Gate 1', Y.z < GATE1.z, `Y.z ${Y.z} < gate.z ${GATE1.z}`);
assert('Fountain is NORTH of Gate 1', FOUNT.z < GATE1.z, `F.z ${FOUNT.z} < gate.z ${GATE1.z}`);

// SLOT-FORCING invariant: the two melody notes come from creatures too far
// apart to capture in one recording (no player spot is in both record radii).
const recordGap = d3(X, Y);
const recordReach = X.range / 2 + Y.range / 2;
assert(
  'X and Y cannot be co-recorded (forces two slots)',
  recordGap > recordReach,
  `${recordGap.toFixed(1)} > ${recordReach}`
);
assert('Melody has two distinct notes', new Set(FOUNT.melody).size >= 2, FOUNT.melody.join('+'));

// Ramp connectivity: the platform must include the ramp's high-edge cell.
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
// Y (G4) must actually live on the platform, so the ramp is on the solve path.
const yOnPlatform =
  Y.y === PLATFORM.elevation &&
  Y.x >= PLATFORM.x1 &&
  Y.x <= PLATFORM.x2 &&
  Y.z >= PLATFORM.z1 &&
  Y.z <= PLATFORM.z2;
assert(
  'G4 creature (Y) sits on the platform (ramp is on the path)',
  yOnPlatform,
  `Y (${Y.x},${Y.z}) e${Y.y}`
);

// Recordability.
assert('A is recordable', A.range / 2 >= 1, `recordRange ${A.range / 2}`);
assert('X is recordable', X.range / 2 >= 1, `recordRange ${X.range / 2}`);
assert('Y is recordable', Y.range / 2 >= 1, `recordRange ${Y.range / 2}`);

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
