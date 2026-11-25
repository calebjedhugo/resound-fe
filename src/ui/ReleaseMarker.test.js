/**
 * The release marker (ui/ReleaseMarker): where Space would let the cursor
 * slot's creature out, on the floor, while the slot holds one — good (in
 * its colour, a dot at its centre), not good (dim red, no dot), and a
 * refused press (a red flare). Driven by the real pole (core/AbsorbManager).
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import AbsorbManager from 'core/AbsorbManager';
import ReleaseMarker, { REFUSE_S } from 'ui/ReleaseMarker';

const SPEC = {
  song: [{ pitch: 'C4', length: '1/4' }],
  interval: 4,
  audibleRange: 10,
  size: 0.9,
  maxSpeed: 8,
};

let marker;
beforeEach(() => {
  gameState.mode = 'PLAYING';
  gameState.camera.viewCenter = [0, 0]; // facing north (-z)
  marker = new ReleaseMarker(new THREE.Scene());
});
afterEach(() => {
  marker.dispose();
  gameState.mode = 'MENU';
});

const frame = async (seconds = 1 / 60) => {
  await ctx.tick(seconds * 1000);
  marker.update(seconds);
};

describe('The release marker', () => {
  it("lies where the creature would land, its body's size, in its colour, with a dot", async () => {
    ctx.loadPuzzle('playback-basic'); // an empty room, the player at (15, 15)
    ctx.setInventorySlot(0, SPEC);
    gameState.player.inventory[0].colour = [0.2, 0.6, 1];
    await frame();

    expect(marker.state).toBe('valid');
    expect(marker.group.position.x).toBeCloseTo(15);
    expect(marker.group.position.z).toBeCloseTo(12.5);
    expect(marker.ring.scale.x).toBeCloseTo(0.9);
    expect(marker.ring.material.color.b).toBeCloseTo(1);
    expect(marker.dot.visible).toBe(true);
    expect(marker.reticleState).toBe('valid'); // at the screen's centre, wherever the eye looks
    expect(marker.reticle.style.display).toBe('block');

    // ...and Space lets it out exactly there
    ctx.pressKey('space');
    await ctx.finishPole();
    const [creature] = ctx.getCreatures();
    expect(creature.position.x).toBeCloseTo(marker.group.position.x);
    expect(creature.position.z).toBeCloseTo(marker.group.position.z);
  });

  it('is hidden with an empty slot, and while the pole is at work', async () => {
    ctx.loadPuzzle('playback-basic');
    await frame();
    expect(marker.state).toBe('hidden');
    expect(marker.reticleState).toBe('hidden');
    expect(marker.reticle.style.display).toBe('none');

    ctx.setInventorySlot(0, SPEC);
    ctx.pressKey('space');
    await frame();
    expect(AbsorbManager.busy).toBe(true);
    expect(marker.state).toBe('hidden');
    await ctx.finishPole();
    await frame();
    expect(marker.state).toBe('hidden'); // the slot is empty now
  });

  it('turns dim red with no dot where it cannot land, and flares on a refused press', async () => {
    ctx.loadPuzzle('playback-basic');
    ctx.setPlayerPosition({ x: 15, z: 1.5 }); // the spot ahead is off the grid
    ctx.setInventorySlot(0, SPEC);
    await frame();
    expect(marker.state).toBe('invalid');
    expect(marker.dot.visible).toBe(false);
    expect(marker.ring.material.color.getHex()).toBe(0xff5544);
    expect(marker.reticleState).toBe('invalid');

    ctx.pressKey('space');
    await frame(REFUSE_S / 2);
    expect(marker.state).toBe('refused');
    expect(marker.ring.scale.x).toBeGreaterThan(0.9); // swollen
    expect(marker.ring.material.opacity).toBe(1);
    expect(marker.reticleState).toBe('refused');
    expect(ctx.getInventorySlot(0)).not.toBeNull();

    await frame(REFUSE_S);
    expect(marker.state).toBe('invalid');
    expect(marker.reticleState).toBe('invalid');
  });

  it('an empty slot refused does not flare it (there is nothing to mark)', async () => {
    ctx.loadPuzzle('playback-basic');
    ctx.pressKey('space');
    await frame();
    expect(marker.state).toBe('hidden');
    ctx.setInventorySlot(0, SPEC);
    await frame();
    expect(marker.state).toBe('valid');
  });
});
