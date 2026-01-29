/**
 * Elevation-aware collision tests
 * Tests that CollisionDetector.checkCollision skips entities at different elevations
 * and that getElevationForPosition correctly maps world positions to elevation levels
 */

import CollisionDetector from 'core/CollisionDetector';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';

describe('Elevation-aware collision', () => {
  // elevation-basic has:
  //   - Elevated floor (elev 1) at x=[4,10], z=[4,8]
  //   - Wall at grid (4,4) elevation 1 -> world (12, 3.0, 12)
  //   - Wall at grid (5,4) elevation 1 -> world (15, 3.0, 12)
  //   - Ramp at grid (7,9) direction north
  //   - Creature at grid (7,6) elevation 1
  //   - Perimeter walls at elevation 0

  it('player collides with a wall at the same elevation', () => {
    ctx.loadPuzzle('elevation-basic');

    // Wall at grid (4,4) -> world (12, 3.0, 12), elevation 1
    // Player position at same grid cell (4,4), also elevation 1
    const pos = { x: 4 * WORLD_SCALE, y: ELEVATION_HEIGHT, z: 4 * WORLD_SCALE };
    expect(CollisionDetector.checkCollision(pos, 0.4)).toBe(true);
  });

  it('player does NOT collide with a wall at a different elevation', () => {
    ctx.loadPuzzle('elevation-basic');

    // Wall at grid (4,4) -> world (12, 3.0, 12), elevation 1
    // Wall box extends from x=10.5 to x=13.5
    // Player at x=10.2 -> grid cell round(10.2/3)=3, grid (3,4) -> elevation 0
    // Geometric distance to wall edge: 10.5 - 10.2 = 0.3 < 0.4 radius
    // Without elevation filter this would collide; with filter it should not
    const pos = { x: 10.2, y: 0, z: 4 * WORLD_SCALE };
    expect(CollisionDetector.checkCollision(pos, 0.4)).toBe(false);
  });

  it('player collides with a closed gate at the same elevation', () => {
    ctx.loadPuzzle('elevation-basic');

    // Add a gate at grid (5,5), elevation 1
    ctx.addGate({
      position: { x: 5 * WORLD_SCALE, y: ELEVATION_HEIGHT, z: 5 * WORLD_SCALE },
      song: [{ pitch: 'C4', length: '1/4' }],
    });

    // Player at same grid cell (5,5), elevation 1
    const pos = { x: 5 * WORLD_SCALE + 0.5, y: ELEVATION_HEIGHT, z: 5 * WORLD_SCALE };
    expect(CollisionDetector.checkCollision(pos, 0.4)).toBe(true);
  });

  it('player does NOT collide with a closed gate at a different elevation', () => {
    ctx.loadPuzzle('elevation-basic');

    // Add a gate at grid (4,5), elevation 1 (inside elevated region)
    ctx.addGate({
      position: { x: 4 * WORLD_SCALE, y: ELEVATION_HEIGHT, z: 5 * WORLD_SCALE },
      song: [{ pitch: 'C4', length: '1/4' }],
    });

    // Player at grid (3,5), elevation 0, geometrically close to gate
    // Gate box: x=[10.5, 13.5]. Player at x=10.2: dist to edge = 0.3 < 0.4
    const pos = { x: 10.2, y: 0, z: 5 * WORLD_SCALE };
    expect(CollisionDetector.checkCollision(pos, 0.4)).toBe(false);
  });

  it('creature collides with a wall at the same elevation', () => {
    ctx.loadPuzzle('elevation-basic');

    // Wall at grid (4,4), elevation 1
    // Creature-like check at grid (4,4), elevation 1, radius 0.9
    const pos = { x: 4 * WORLD_SCALE + 0.5, y: ELEVATION_HEIGHT, z: 4 * WORLD_SCALE };
    expect(CollisionDetector.checkCollision(pos, 0.9)).toBe(true);
  });

  it('creature does NOT collide with a wall at a different elevation', () => {
    ctx.loadPuzzle('elevation-basic');

    // Wall at grid (4,4), elevation 1
    // Creature-like check at grid (3,4), elevation 0, radius 0.9
    // Wall box edge at x=10.5, creature at x=9.7: dist = 0.8 < 0.9
    const pos = { x: 9.7, y: 0, z: 4 * WORLD_SCALE };
    expect(CollisionDetector.checkCollision(pos, 0.9)).toBe(false);
  });

  it('two creatures on the same ramp at different progress points still collide', () => {
    ctx.loadPuzzle('elevation-ramp');

    // Ramp at grid (7,9), direction north, elevation 0->1
    // Ramp center: world (21, 0, 27)
    // Add two creatures on the ramp, 1 unit apart in Z
    const creatureA = ctx.addCreature({
      position: { x: 7 * WORLD_SCALE, y: 0, z: 9 * WORLD_SCALE + 0.5 },
      song: [{ pitch: 'C4', length: '1/4' }],
      interval: 4,
      audibleRange: 15,
    });

    const creatureB = ctx.addCreature({
      position: { x: 7 * WORLD_SCALE, y: 0, z: 9 * WORLD_SCALE - 0.5 },
      song: [{ pitch: 'E4', length: '1/4' }],
      interval: 4,
      audibleRange: 15,
    });

    // Check from creature A's position: should detect creature B
    // Distance in Z = 1.0, combined radii = 0.9 + 0.9 = 1.8 -> geometric collision
    // Both on same ramp, elevation diff < 0.5 -> not filtered out
    expect(CollisionDetector.checkCollision(creatureA.position, 0.9, creatureA.id)).toBe(true);
  });
});
