import Gate from 'entities/Gate';
import gameState from 'core/GameState';
import { drawnObjects } from '../__tests__/helpers/drawList';

// Gates latch (ruled 2026-07-10): they open when their song is performed to
// COMPLETION, stay open with no timer, and close only when the player walks
// through — unless a performance is actively holding them. These guard the
// state machine, especially the material/flash bookkeeping.
describe('Gate latch state (open on completion, close on walk-through)', () => {
  const song = [{ pitch: 'C4', length: '1/4' }];

  it('opens (its slab gone), LATCHES with no timer, and closes when the player walks through', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    expect(gate.isOpen).toBe(false);

    gate.open();
    expect(gate.isOpen).toBe(true);
    expect(gate.mesh.material.opacity).toBe(0);

    // No timer: updates with nobody around leave it open
    gameState.player.position = { x: 0, y: 1.8, z: 0 };
    gameState.player.elevation = 0;
    gate.update(0.016);
    gate.update(0.016);
    expect(gate.isOpen).toBe(true);

    // The player walks through: in the cell, then fully clear on the far side
    gameState.player.position = { x: 30, y: 1.8, z: 30 };
    gate.update(0.016);
    expect(gate.isOpen).toBe(true); // never closes on an occupant
    gameState.player.position = { x: 30, y: 1.8, z: 36 };
    gate.update(0.016);
    expect(gate.isOpen).toBe(false);
    expect(gate.mesh.material.opacity).toBe(1); // sealed again
  });

  it('a performance holding the door keeps it open behind the player', () => {
    // A parked performer's completions chain into a continuous hold: walking
    // out does NOT consume the opening while the hold lasts.
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    gate.open();
    gate._lastCompletionMs = Date.now(); // a completion just landed
    gameState.player.position = { x: 30, y: 1.8, z: 30 };
    gameState.player.elevation = 0;
    gate.update(0.016);
    gameState.player.position = { x: 30, y: 1.8, z: 36 }; // steps out
    gate.update(0.016);
    expect(gate.isOpen).toBe(true); // held by the fresh completion

    // Once the hold lapses, the next walk-through closes it
    gate._lastCompletionMs = -Infinity;
    gameState.player.position = { x: 30, y: 1.8, z: 30 };
    gate.update(0.016);
    gameState.player.position = { x: 30, y: 1.8, z: 36 };
    gate.update(0.016);
    expect(gate.isOpen).toBe(false);
  });

  it('an alwaysOpen face starts open and never closes', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song, alwaysOpen: true });
    expect(gate.isOpen).toBe(true);
    gate.close();
    expect(gate.isOpen).toBe(true);
    // Walking through does not consume it either
    gameState.player.position = { x: 30, y: 1.8, z: 30 };
    gameState.player.elevation = 0;
    gate.update(0.016);
    gameState.player.position = { x: 30, y: 1.8, z: 36 };
    gate.update(0.016);
    expect(gate.isOpen).toBe(true);
  });

  it('an ending flag survives construction (the finale arrival gate rolls credits)', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song, ending: true });
    expect(gate.ending).toBe(true);
    expect(new Gate({ x: 30, y: 0, z: 30 }, { song }).ending).toBe(false);
  });

  it('a mismatch flash never outlives its window, whatever the gate did meanwhile', () => {
    // Regression: the flash used to snapshot the look it interrupted and
    // restore it later — so a flash raised while OPEN could repaint an open
    // look onto a gate that had since CLOSED. The red must simply end.
    const gate = new Gate({ x: 0, y: 0, z: 0 }, { song });

    gate.open();
    gate._flashMismatch();
    expect(gate.lockoutGlow).toBe(1);
    gate._mismatchFlashUntil = Date.now() - 1;
    gate._updateMismatchFlash();
    expect(gate.lockoutGlow).toBe(0);

    // Raised while open, the gate closed before it ran out: sealed, not red
    gate._flashMismatch();
    gate.close();
    expect(gate.isOpen).toBe(false);
    expect(gate.lockoutGlow).toBe(0);
    expect(gate.mesh.material.opacity).toBe(1);
  });

  it('closing drops captured notes (a fresh performance is needed to re-cross)', () => {
    const gate = new Gate({ x: 0, y: 0, z: 0 }, { song });
    gate.open();
    gate.capturedNotes.push({
      pitch: 'C4',
      length: '1/4',
      timestamp: Date.now(),
      sourcePosition: gate.position,
    });
    gate.close();
    expect(gate.isOpen).toBe(false);
    expect(gate.capturedNotes).toHaveLength(0);
  });
});

// Every gate commits only on the COMPLETED song (ruled 2026-07-10): a valid
// in-progress performance FADES the shell toward transparency (wordless "it
// hears you" — previewing the open state) but never opens it — completion
// plus the trailing-silence beat does.
describe('Gate completion commit + listening fade', () => {
  const MS_PER_BEAT = 500; // no musical clock in these unit tests -> 120 BPM
  const heard = (pitch, timestamp, gate) => ({
    pitch,
    length: '1/1',
    timestamp,
    sourcePosition: gate.position,
  });

  beforeEach(() => {
    // Keep the player away from the gates in these tests
    gameState.player.position = { x: 0, y: 1.8, z: 0 };
    gameState.player.elevation = 0;
  });

  it('a single-note gate stays CLOSED mid-note, fading in step with the song', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song: [{ pitch: 'C4', length: '1/1' }] });
    const t0 = Date.now() - 1 * MS_PER_BEAT; // one beat into the whole note
    gate.listeningStartTime = t0;
    gate.capturedNotes.push(heard('C4', t0, gate));
    gate.update(0.016); // performance recognized; fade clock starts
    // Half-way through the 4-beat song (2 beats at 120 BPM = 1000ms)
    gate._inProgressSinceMs = Date.now() - 2 * MS_PER_BEAT;
    gate.update(0.016);
    expect(gate.isOpen).toBe(false); // correct so far, but not complete
    expect(gate.mesh.material.transparent).toBe(true);
    expect(gate.mesh.material.opacity).toBeCloseTo(0.5, 1); // progress-proportional
    // The whole song elapsed: fully transparent (still closed until the
    // trailing-silence beat confirms completion)
    gate._inProgressSinceMs = Date.now() - 4 * MS_PER_BEAT;
    gate.update(0.016);
    expect(gate.mesh.material.opacity).toBe(0);
    expect(gate.isOpen).toBe(false);
  });

  it('a single-note gate opens once the note and its trailing silence land', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song: [{ pitch: 'C4', length: '1/1' }] });
    const t0 = Date.now() - 6 * MS_PER_BEAT; // note (4 beats) + silence elapsed
    gate.listeningStartTime = t0;
    gate.capturedNotes.push(heard('C4', t0, gate));
    gate.update(0.016);
    expect(gate.isOpen).toBe(true);
  });

  it('the fade RESUMES from its current level after a momentary judgment gap (no opaque snap)', () => {
    // Between the notes of a multi-note take, judgment can drop in-progress
    // for a frame or two. The recover easing may nibble at the fade, but the
    // shell must never snap back to opaque and restart the fade from zero.
    const song = [
      { pitch: 'E4', length: '1/1' },
      { pitch: 'G4', length: '1/1' },
    ];
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    const t0 = Date.now() - 2 * MS_PER_BEAT;
    gate.listeningStartTime = t0;
    gate.capturedNotes.push(heard('E4', t0, gate));
    gate.update(0.016);
    gate._inProgressSinceMs = Date.now() - 4 * MS_PER_BEAT; // half the 8-beat song
    gate.update(0.016);
    const midFade = 1 - gate.mesh.material.opacity;
    expect(midFade).toBeGreaterThan(0.4);

    // One frame of not-in-progress (simulated judgment gap), then resume
    gate._inProgress = false;
    gate._inProgressSinceMs = null;
    gate._updateFade(0.016);
    gate._inProgress = true;
    gate._updateFade(0.016);

    expect(1 - gate.mesh.material.opacity).toBeGreaterThan(midFade - 0.15);
  });

  it('a two-note gate stays CLOSED on a valid one-note prefix', () => {
    const song = [
      { pitch: 'E4', length: '1/1' },
      { pitch: 'G4', length: '1/1' },
    ];
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    const t0 = Date.now() - 2 * MS_PER_BEAT; // mid-way through the first note
    gate.listeningStartTime = t0;
    gate.capturedNotes.push(heard('E4', t0, gate));
    gate.update(0.016);
    expect(gate.isOpen).toBe(false); // correct so far, but not committed
  });

  it('a two-note gate opens once the full song (plus trailing silence) lands', () => {
    const song = [
      { pitch: 'E4', length: '1/1' },
      { pitch: 'G4', length: '1/1' },
    ];
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    const t0 = Date.now() - 10 * MS_PER_BEAT; // whole song + silence has elapsed
    gate.listeningStartTime = t0;
    gate.capturedNotes.push(heard('E4', t0, gate));
    gate.capturedNotes.push(heard('G4', t0 + 4 * MS_PER_BEAT, gate));
    gate.update(0.016);
    expect(gate.isOpen).toBe(true);
  });
});

// An open gate has NO shell (DESIGN.md): a shell faded all the way out is
// left out of the draw, while its notation and door panels (the shell
// mesh's children) still draw. The fade itself is uniform-only (opacity):
// the shell's shader program is re-derived only when it turns translucent
// or solid again, never once per fade frame.
describe('Gate shell drawing', () => {
  const MS_PER_BEAT = 500; // no musical clock in these unit tests -> 120 BPM
  const song = [{ pitch: 'C4', length: '1/1' }];
  const heard = (pitch, timestamp, gate) => ({
    pitch,
    length: '1/1',
    timestamp,
    sourcePosition: gate.position,
  });
  const shellDrawn = (gate) => drawnObjects(gate.mesh).includes(gate.mesh);

  /** A gate one beat into a correct performance of its whole-note song. */
  function performedGate() {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    const t0 = Date.now() - 1 * MS_PER_BEAT;
    gate.listeningStartTime = t0;
    gate.capturedNotes.push(heard('C4', t0, gate));
    gate.update(0.016); // performance recognized; fade clock starts
    return gate;
  }

  beforeEach(() => {
    gameState.player.position = { x: 0, y: 1.8, z: 0 };
    gameState.player.elevation = 0;
  });

  const link = { puzzleId: 'elsewhere', gateId: 'beyond' };

  it('an open door draws no slab, only its notation (its panels show the way through)', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song, link });
    expect(shellDrawn(gate)).toBe(true);

    gate.open();

    expect(shellDrawn(gate)).toBe(false);
    expect(drawnObjects(gate.mesh)).toEqual(gate.notationDisplay.meshes);
    gate.close();
    expect(shellDrawn(gate)).toBe(true);
  });

  it('an open gate keeps only its rippling frame: no slab, and nothing hidden behind it', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });

    gate.open();

    const { material } = gate.mesh;
    // The frame draws in the main view alone (EntityLook.test), never here
    expect(shellDrawn(gate)).toBe(false);
    expect(material.opacity).toBe(0); // no slab
    expect(material.transparent).toBe(true);
    // A creature in the open cell never vanishes behind it
    expect(material.depthWrite).toBe(false);
    gate.close();
    expect(material.depthWrite).toBe(true);
  });

  it('an alwaysOpen face never draws its slab', () => {
    const door = new Gate({ x: 30, y: 0, z: 30 }, { song, link, alwaysOpen: true });
    expect(shellDrawn(door)).toBe(false);
    const doorway = new Gate({ x: 30, y: 0, z: 30 }, { song, alwaysOpen: true });
    expect(doorway.mesh.material.opacity).toBe(0); // only its frame
  });

  it('a fading shell draws until the song has faded it all the way out', () => {
    const gate = performedGate();
    gate._inProgressSinceMs = Date.now() - 2 * MS_PER_BEAT; // half the song
    gate.update(0.016);
    expect(gate.mesh.material.opacity).toBeCloseTo(0.5, 1);
    expect(shellDrawn(gate)).toBe(true);

    gate._inProgressSinceMs = Date.now() - 4 * MS_PER_BEAT; // the whole song
    gate.update(0.016);

    expect(gate.isOpen).toBe(false);
    expect(gate.mesh.material.opacity).toBe(0);
    expect(shellDrawn(gate)).toBe(false);
  });

  it('a fade re-derives the shell program once to turn translucent and once to turn solid', () => {
    const gate = performedGate();
    const { material } = gate.mesh;
    const solidVersion = material.version;
    for (let beats = 1; beats <= 3; beats += 0.5) {
      gate._inProgressSinceMs = Date.now() - beats * MS_PER_BEAT;
      gate.update(0.016);
    }
    expect(material.opacity).toBeCloseTo(0.25, 2);
    expect(material.version).toBe(solidVersion + 1); // not once per fade frame

    // The performance lapses: the shell eases back to solid over a few frames
    gate.capturedNotes = [];
    for (let frame = 0; frame < 30; frame += 1) gate.update(0.016);

    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.version).toBe(solidVersion + 2);
  });
});

// A wrong note voids the attempt AND deafens the gate for a short window
// (ruled 2026-07-16): the target can never ride in behind wrong notes — it
// must START a fresh, clean attempt. The red flash spans the lockout.
describe('Gate wrong-note lockout (ruled 2026-07-16)', () => {
  const song = [{ pitch: 'C4', length: '1/4' }];
  const MS_PER_BEAT = 500; // no musical clock in these unit tests -> 120 BPM
  const heard = (pitch, timestamp, gate) => ({
    pitch,
    length: '1/4',
    timestamp,
    sourcePosition: gate.position,
    sourceRange: 15,
  });

  beforeEach(() => {
    gameState.player.position = { x: 0, y: 1.8, z: 0 };
    gameState.player.elevation = 0;
  });

  /** A gate that just judged a wrong D4 (mismatch landed on this update). */
  function mismatchedGate() {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    const t0 = Date.now() - 2 * MS_PER_BEAT;
    gate.listeningStartTime = t0;
    gate.capturedNotes.push(heard('D4', t0, gate)); // wrong, conclusively past
    gate.update(0.016);
    return gate;
  }

  it('a mismatch voids the heard notes and engages the lockout', () => {
    const gate = mismatchedGate();
    expect(gate.capturedNotes).toHaveLength(0);
    expect(gate._lockoutUntilMs).toBeGreaterThan(Date.now());
    expect(gate.lockoutGlow).toBe(1); // red
  });

  it('the gate is DEAF during the lockout — even the correct note is not captured', () => {
    const gate = mismatchedGate();
    gate.onNoteCaptured(heard('C4', Date.now(), gate));
    expect(gate.capturedNotes).toHaveLength(0);
    gate.update(0.016);
    expect(gate.isOpen).toBe(false);
  });

  it('after the lockout passes, a fresh clean take opens the gate', () => {
    const gate = mismatchedGate();
    // 1.6s elapse: rewind the lockout/trim bookkeeping instead of sleeping
    gate._lockoutUntilMs -= 1600;
    gate._trimHorizonMs -= 1600;
    gate._mismatchFlashUntil = null;
    gate.onNoteCaptured(heard('C4', Date.now() - 600, gate)); // span elapsed
    gate.update(0.016);
    expect(gate.isOpen).toBe(true);
  });

  it('the red flash decays across the lockout window', () => {
    const gate = mismatchedGate();
    expect(gate.lockoutGlow).toBeCloseTo(1.0, 1);
    gate._mismatchFlashUntil = Date.now() + 200; // window nearly over
    gate._updateMismatchFlash();
    expect(gate.lockoutGlow).toBeLessThan(0.5);
  });

  it('close() clears the lockout (a fresh crossing starts clean)', () => {
    const gate = mismatchedGate();
    gate.close();
    expect(gate._lockoutUntilMs).toBe(0);
  });
});
