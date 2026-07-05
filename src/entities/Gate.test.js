import Gate from 'entities/Gate';

// Gates are play-to-pass: open() holds them open for a grace, then close().
// These guard the state machine, especially the material/flash bookkeeping
// that regressed when gates stopped latching.
describe('Gate play-to-pass state', () => {
  const song = [{ pitch: 'C4', length: '1/4' }];
  const CLOSED_EMISSIVE = 0x331100;
  const OPEN_EMISSIVE = 0x003300;
  const heard = (pitch, pos) => ({
    pitch,
    length: '1/4',
    timestamp: Date.now(),
    sourcePosition: pos,
  });

  it('opens green and closes back to orange when the grace expires', () => {
    const gate = new Gate({ x: 0, y: 0, z: 0 }, { song });
    expect(gate.isOpen).toBe(false);

    gate.open();
    expect(gate.isOpen).toBe(true);
    expect(gate.mesh.material.emissive.getHex()).toBe(OPEN_EMISSIVE);

    gate._openUntil = Date.now() - 1; // force grace to have expired
    gate.update(16);
    expect(gate.isOpen).toBe(false);
    expect(gate.mesh.material.emissive.getHex()).toBe(CLOSED_EMISSIVE);
  });

  it('a wrong phrase heard during the open grace never repaints the closed gate green', () => {
    const gate = new Gate({ x: 0, y: 0, z: 0 }, { song });
    gate.open();

    // Wrong notes arrive while the gate is open. update() must NOT evaluate or
    // flash while open, or the flash would snapshot the OPEN green material and
    // restore it onto the gate after it closes (green + solid = reads passable
    // but collision still blocks it).
    gate.capturedNotes.push(heard('E4', gate.position), heard('F4', gate.position));
    gate.update(16);
    expect(gate._mismatchFlashUntil == null).toBe(true);

    gate._openUntil = Date.now() - 1;
    gate.update(16); // closes
    expect(gate.isOpen).toBe(false);
    expect(gate.mesh.material.emissive.getHex()).toBe(CLOSED_EMISSIVE);
  });

  it('closing drops notes heard during the open window (fresh performance to re-cross)', () => {
    const gate = new Gate({ x: 0, y: 0, z: 0 }, { song });
    gate.open();
    gate.capturedNotes.push(heard('C4', gate.position));
    gate._openUntil = Date.now() - 1;
    gate.update(16);
    expect(gate.isOpen).toBe(false);
    expect(gate.capturedNotes).toHaveLength(0);
  });
});
