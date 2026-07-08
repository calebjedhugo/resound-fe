import Gate from 'entities/Gate';
import gameState from 'core/GameState';

// Gates are play-to-pass: they open AS the song is performed, hold while it
// keeps sounding, then close after a short grace. These guard the state
// machine, especially the material/flash bookkeeping.
describe('Gate play-to-pass state', () => {
  const song = [{ pitch: 'C4', length: '1/4' }];
  const CLOSED_EMISSIVE = 0x331100;
  const OPEN_EMISSIVE = 0x003300;
  const FLASH_EMISSIVE = 0xaa1111;

  it('opens green and closes back to orange when the grace expires', () => {
    // Away from the player's spawn: a gate never closes on an occupant
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    expect(gate.isOpen).toBe(false);

    gate.open();
    expect(gate.isOpen).toBe(true);
    expect(gate.mesh.material.emissive.getHex()).toBe(OPEN_EMISSIVE);

    gate._openUntil = Date.now() - 1; // force grace to have expired
    gate.update(16); // no notes to re-open it
    expect(gate.isOpen).toBe(false);
    expect(gate.mesh.material.emissive.getHex()).toBe(CLOSED_EMISSIVE);
  });

  it('the grace expiring with the PLAYER inside flips to occupied overtime instead', () => {
    const gate = new Gate({ x: 30, y: 0, z: 30 }, { song });
    gate.open();
    gameState.player.position = { x: 30, y: 1.8, z: 30 }; // standing in the cell
    gameState.player.elevation = 0;

    gate._openUntil = Date.now() - 1;
    gate.update(16);

    expect(gate.isOpen).toBe(true); // waits for the occupant
    expect(gate.occupiedOvertime).toBe(true);
    expect(gate.mesh.material.emissive.getHex()).toBe(CLOSED_EMISSIVE); // reads closed outside

    // Occupant steps out: the very next update closes it for real
    gameState.player.position = { x: 30, y: 1.8, z: 36 };
    gate.update(16);
    expect(gate.isOpen).toBe(false);
    expect(gate.occupiedOvertime).toBe(false);
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
