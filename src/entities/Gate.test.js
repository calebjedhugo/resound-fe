import Gate from 'entities/Gate';
import gameState from 'core/GameState';

// Gates latch (ruled 2026-07-10): they open when their song is performed to
// COMPLETION, stay open with no timer, and close only when the player walks
// through — unless a performance is actively holding them. These guard the
// state machine, especially the material/flash bookkeeping.
describe('Gate latch state (open on completion, close on walk-through)', () => {
  const song = [{ pitch: 'C4', length: '1/4' }];
  const CLOSED_EMISSIVE = 0x331100;
  const OPEN_EMISSIVE = 0x003300;
  const FLASH_EMISSIVE = 0xaa1111;

  it('opens green, LATCHES with no timer, and closes when the player walks through', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    expect(gate.isOpen).toBe(false);

    gate.open();
    expect(gate.isOpen).toBe(true);
    expect(gate.mesh.material.emissive.getHex()).toBe(OPEN_EMISSIVE);

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
    expect(gate.mesh.material.emissive.getHex()).toBe(CLOSED_EMISSIVE);
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

  it('a mismatch flash restores the emissive of the CURRENT open/closed state', () => {
    // Regression: the flash used to snapshot whatever emissive was current and
    // restore it later — so a flash raised while OPEN could repaint a green
    // (passable-looking) glow onto a gate that had since CLOSED. Restore must
    // track the live state instead.
    const gate = new Gate({ x: 0, y: 0, z: 0 }, { song });

    // Flash while OPEN -> restores green.
    gate.open();
    gate._flashMismatch();
    expect(gate.mesh.material.emissive.getHex()).toBe(FLASH_EMISSIVE);
    gate._mismatchFlashUntil = Date.now() - 1;
    gate._updateMismatchFlash();
    expect(gate.mesh.material.emissive.getHex()).toBe(OPEN_EMISSIVE);

    // Flash raised while open but resolved after CLOSE -> restores orange.
    gate._flashMismatch();
    gate.close();
    expect(gate.isOpen).toBe(false);
    gate._mismatchFlashUntil = Date.now() - 1;
    gate._updateMismatchFlash();
    expect(gate.mesh.material.emissive.getHex()).toBe(CLOSED_EMISSIVE);
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
