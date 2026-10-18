/**
 * The player's per-frame move (motion.js). A frame in which the player
 * stands still skips the collision + floor pass, as a resting creature
 * does (Creature.updateMovement). The skip must be EXACT: a standing player
 * ends every frame bit for bit where a full pass would, anything that moves
 * or re-layers them is re-floored by the next frame, and their first step
 * is exactly the step a full pass makes. A controller (core/Gamepad) walks
 * and looks by its sticks' tilt; a stick at rest is no move at all.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import CollisionDetector from 'core/CollisionDetector';
import { WORLD_SCALE, ELEVATION_HEIGHT, PLAYER_COLLISION_RADIUS } from 'core/constants';
import { getFloorY } from 'core/ElevationMovement';
import Gamepad from 'core/Gamepad';
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

describe('Walking and looking with a controller', () => {
  const STICK_LOOK_SPEED = 0.0375; // radians per frame at full tilt: 1.5x the keyboard's
  const QUARTER_TURN = Math.PI / 2;
  const L3 = 10;
  // A tilt halfway from the dead zone (0.15) to the rim
  const HALF_TILT = 0.15 + 0.85 / 2;

  let pads = [];
  let pad;
  let realWindow;

  /** One game frame: the poll (main.js update), then the move and look (render). */
  const padFrame = () => {
    Gamepad.poll(true);
    frame();
  };

  beforeAll(() => {
    // A window with real events, a browser's pad list, and its KeyboardEvent
    // (a pad's button presses go out as keys)
    const events = new EventTarget();
    realWindow = { ...window };
    Object.assign(window, {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    });
    global.KeyboardEvent = class KeyboardEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.code = init.code;
        this.repeat = !!init.repeat;
      }
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    Gamepad.initialize();
  });

  afterAll(() => {
    Object.assign(window, realWindow);
    delete window.dispatchEvent;
    delete global.KeyboardEvent;
    delete navigator.getGamepads;
  });

  beforeEach(() => {
    ctx.loadPuzzle('elevation-basic');
    standAt(GROUND);
    gameState.camera.viewCenter = [0, 0];
    pad = {
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    pads = [pad];
    window.dispatchEvent(new Event('gamepadconnected'));
    for (let i = 0; i < 5; i += 1) padFrame(); // settled
  });

  afterEach(() => {
    pads = [];
    window.dispatchEvent(new Event('gamepaddisconnected'));
    gameState.input.keys.forward = false;
  });

  it('a stick inside the dead zone leaves them bit for bit where they stood, at no collision query', () => {
    const settled = moveState();
    const view = [...gameState.camera.viewCenter];
    const queries = jest.spyOn(CollisionDetector, 'checkCollision');

    pad.axes = [0.1, -0.1, -0.06, 0.12]; // a worn pad at rest
    for (let i = 0; i < 30; i += 1) {
      padFrame();
      expect(moveState()).toEqual(settled);
      expect(gameState.camera.viewCenter).toEqual(view);
    }
    expect(queries).not.toHaveBeenCalled();
    queries.mockRestore();
  });

  it("walks at the left stick's tilt: full tilt is the keyboard's step, half tilt half of it", () => {
    const { x, z } = camera.position;

    pad.axes = [0, -1, 0, 0];
    padFrame();
    expect(camera.position.z).toBe(z - WALK_STEP);

    pad.axes = [0, -HALF_TILT, 0, 0];
    padFrame();
    expect(camera.position.z).toBeCloseTo(z - 1.5 * WALK_STEP, 12);

    // The view looks down -z, so its right is +x
    pad.axes = [1, 0, 0, 0];
    padFrame();
    expect(camera.position.x).toBe(x + WALK_STEP);
  });

  it('a held key moves exactly its own step: the stick adds nothing to its axis', () => {
    const { z } = camera.position;
    gameState.input.keys.forward = true;

    padFrame(); // the stick at rest
    expect(camera.position.z).toBe(z - WALK_STEP);

    pad.axes = [0, 1, 0, 0]; // the stick pulled back
    padFrame();
    expect(camera.position.z).toBe(z - 2 * WALK_STEP);
  });

  it('a click of L3 runs, at twice the step, until the stick comes back to rest', () => {
    pad.axes = [0, -1, 0, 0];
    pad.buttons[L3].pressed = true;
    padFrame();
    pad.buttons[L3].pressed = false;
    let { z } = camera.position;

    padFrame();
    expect(camera.position.z).toBe(z - 2 * WALK_STEP);

    pad.axes = [0, 0, 0, 0];
    padFrame();
    pad.axes = [0, -1, 0, 0];
    ({ z } = camera.position);
    padFrame();
    expect(camera.position.z).toBe(z - WALK_STEP);
  });

  it('a pad disconnected mid-walk leaves them standing where they are', () => {
    pad.axes = [0.6, -0.8, 0, 0];
    padFrame();
    const moved = moveState();
    expect(moved.camera).not.toEqual({ ...GROUND, y: EYE_HEIGHT });

    pads = [];
    window.dispatchEvent(new Event('gamepaddisconnected'));
    frame();
    const stopped = moveState();
    for (let i = 0; i < 10; i += 1) {
      padFrame();
      expect(moveState()).toEqual(stopped);
    }
  });

  it("turns at the right stick's tilt squared: full tilt 1.5x the keyboard's speed, half tilt a quarter of it", () => {
    pad.axes = [0, 0, 1, 0];
    padFrame();
    expect(gameState.camera.viewCenter[0]).toBeCloseTo(-STICK_LOOK_SPEED, 12);

    pad.axes = [0, 0, -HALF_TILT, 0];
    padFrame();
    expect(gameState.camera.viewCenter[0]).toBeCloseTo(-STICK_LOOK_SPEED * 0.75, 12);

    pad.axes = [0, 0, 0, -1]; // pushed up: look up
    padFrame();
    expect(gameState.camera.viewCenter[1]).toBeCloseTo(STICK_LOOK_SPEED, 12);
  });

  it('pitches no further than straight up however long the stick is held', () => {
    pad.axes = [0, 0, 0, -1];
    for (let i = 0; i < Math.ceil((2 * QUARTER_TURN) / STICK_LOOK_SPEED); i += 1) padFrame();

    expect(gameState.camera.viewCenter[1]).toBe(QUARTER_TURN);
  });
});
