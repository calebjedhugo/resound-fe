/**
 * The player's per-frame move (motion.js). A frame in which the player
 * stands still skips the collision + floor pass, as a resting creature
 * does (Creature.updateMovement). The skip must be EXACT: a standing player
 * ends every frame bit for bit where a full pass would, anything that moves
 * or re-layers them is re-floored by the next frame, and their first step
 * is exactly the step a full pass makes.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import CollisionDetector from 'core/CollisionDetector';
import { WORLD_SCALE, ELEVATION_HEIGHT, PLAYER_COLLISION_RADIUS } from 'core/constants';
import { getFloorY } from 'core/ElevationMovement';
// The real module: its absolute path maps to a mock (import-time side effects)
import motion, { camera, syncCameraToPlayer } from './motion';

const EYE_HEIGHT = 1.8;
const WALK_STEP = 0.067; // motion.js baseSpeed, one frame's walk

const scene = new THREE.Scene();
const frame = () => motion(scene);

// Everything a frame's move writes. toEqual compares numbers with
// Object.is, so a -0 never passes for a +0.
const moveState = () => ({
  camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
  player: { ...gameState.player.position },
  elevation: gameState.player.elevation,
});

/** Stand the player at a spot (on its cell's top level), as a load does. */
const standAt = (position) => {
  ctx.setPlayerPosition(position);
  syncCameraToPlayer(gameState.player.position);
};

// elevation-basic: an E1 platform over x,z = [4,10]x[4,8] (walkable under
// it too) with a ramp up its south edge at grid (7,9)
const GROUND = { x: 2 * WORLD_SCALE, y: 0, z: 12 * WORLD_SCALE };
const PLATFORM = { x: 7 * WORLD_SCALE, y: 0, z: 6 * WORLD_SCALE };
const RAMP = { x: 7 * WORLD_SCALE, y: 0, z: 9 * WORLD_SCALE + 0.5 };

describe('A player standing still', () => {
  // (input outlives a test context)
  afterEach(() => {
    gameState.input.keys.forward = false;
    gameState.input.keys.latLeft = false;
  });

  it('ends every frame bit for bit where they stood: on the ground, a platform and a ramp', () => {
    ctx.loadPuzzle('elevation-basic');
    [GROUND, PLATFORM, RAMP].forEach((spot) => {
      standAt(spot);
      frame(); // the first frame floors them
      const settled = moveState();
      for (let i = 0; i < 30; i += 1) {
        frame();
        expect(moveState()).toEqual(settled);
      }
    });
    // (the ramp leaves a fractional layer)
    expect(gameState.player.elevation).toBeGreaterThan(0);
    expect(gameState.player.elevation).toBeLessThan(1);
  });

  it('costs no collision query', () => {
    ctx.loadPuzzle('elevation-basic');
    standAt(GROUND);
    frame();
    const queries = jest.spyOn(CollisionDetector, 'checkCollision');

    for (let i = 0; i < 10; i += 1) frame();
    expect(queries).not.toHaveBeenCalled();

    gameState.input.keys.forward = true;
    frame();
    expect(queries).toHaveBeenCalled();
    queries.mockRestore();
  });

  it('is re-floored by the next frame when anything moves or re-layers them', () => {
    ctx.loadPuzzle('elevation-basic');
    standAt(PLATFORM);
    frame();
    expect(camera.position.y).toBe(ELEVATION_HEIGHT + EYE_HEIGHT);

    // Dropped to the layer UNDER the platform (the cell is walkable at 0 and 1)
    gameState.player.elevation = 0;
    frame();
    expect(gameState.player.elevation).toBe(0);
    expect(camera.position.y).toBe(EYE_HEIGHT);

    // Lifted off the floor (a camera sync lands at eye height over 0)
    gameState.player.elevation = 1;
    frame();
    expect(camera.position.y).toBe(ELEVATION_HEIGHT + EYE_HEIGHT);
    syncCameraToPlayer({ ...gameState.player.position, y: 0 });
    frame();
    expect(camera.position.y).toBe(ELEVATION_HEIGHT + EYE_HEIGHT);

    // Carried south onto the ramp: the slope's height there
    syncCameraToPlayer({ ...gameState.player.position, z: RAMP.z });
    frame();
    const rampY = getFloorY(RAMP.x, RAMP.z, gameState.elevationGrid);
    expect(rampY).toBeGreaterThan(0);
    expect(camera.position.y).toBe(rampY + EYE_HEIGHT);
    expect(gameState.player.elevation).toBe(rampY / ELEVATION_HEIGHT);

    // Carried west off the ramp, onto the ground beside it
    syncCameraToPlayer({ ...gameState.player.position, x: 2 * WORLD_SCALE });
    frame();
    expect(gameState.player.elevation).toBe(0);
    expect(camera.position.y).toBe(EYE_HEIGHT);
  });

  it("is re-floored on another area's floor plan, even at the same spot and layer", () => {
    ctx.loadPuzzle('elevation-basic');
    standAt(PLATFORM);
    frame();
    expect(camera.position.y).toBe(ELEVATION_HEIGHT + EYE_HEIGHT);

    // A flat world under the same camera, the player still on layer 1
    ctx.loadPuzzle('creature-movement-basic');
    gameState.player.elevation = 1;
    frame();
    expect(gameState.player.elevation).toBe(0);
    expect(camera.position.y).toBe(EYE_HEIGHT);
  });

  it("takes as a first step exactly a full pass's step, ahead or aside", () => {
    ctx.loadPuzzle('elevation-basic');
    standAt(GROUND);
    for (let i = 0; i < 5; i += 1) frame();
    const { x, z } = camera.position;

    // The view looks down -z, so its left is -x
    gameState.input.keys.forward = true;
    frame();
    gameState.input.keys.forward = false;
    expect(camera.position.x).toBe(x);
    expect(camera.position.z).toBe(z - WALK_STEP);

    for (let i = 0; i < 5; i += 1) frame();
    gameState.input.keys.latLeft = true;
    frame();
    gameState.input.keys.latLeft = false;
    expect(camera.position.x).toBe(x - WALK_STEP);
    expect(camera.position.z).toBe(z - WALK_STEP);

    expect(camera.position.y).toBe(EYE_HEIGHT);
    expect(gameState.player.position).toEqual({ ...camera.position });
  });

  it('meets a wall on a first step, ahead or aside', () => {
    ctx.loadPuzzle('elevation-basic'); // walls at grid (4,4) and (5,4), up on the platform
    const clear = 1.5 + PLAYER_COLLISION_RADIUS + 0.03; // a hair from touching
    const blocked = (key, spot) => {
      standAt(spot);
      for (let i = 0; i < 5; i += 1) frame();
      gameState.input.keys[key] = true;
      frame();
      gameState.input.keys[key] = false;
      return { x: camera.position.x, z: camera.position.z };
    };

    // South of the (4,4) wall, stepping north into it
    const south = { x: 4 * WORLD_SCALE, y: 0, z: 4 * WORLD_SCALE + clear };
    expect(blocked('forward', south)).toEqual({ x: south.x, z: south.z });
    // East of the (5,4) wall, stepping west into it
    const east = { x: 5 * WORLD_SCALE + clear, y: 0, z: 4 * WORLD_SCALE };
    expect(blocked('latLeft', east)).toEqual({ x: east.x, z: east.z });
  });
});
