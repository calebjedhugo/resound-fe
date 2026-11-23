/** @jest-environment jsdom */
/**
 * The game controller (core/Gamepad), polled once a frame. Its buttons are
 * the keys they stand for: each press goes out once as its key's keydown and
 * each release as its keyup, so the game's own key listeners act on them
 * (the pole's absorb and release, the tape cursor, claps, the waystone
 * gate, the ending card; the
 * menus: see ui/Menu.test.js). Its
 * sticks are analog (walking and looking: see motion.test.js) and rest
 * outside play. A pad that leaves lets go of everything it held. The start
 * gate wakes on a pad press only into a world with sound: a pad press is no
 * user activation, so while audio is locked the gate stays up for a key or a
 * click, and says so.
 */
import { audioContextManager } from 'resound-sound';
import gameState from 'core/GameState';
import Gamepad from 'core/Gamepad';
import ClapManager from 'core/ClapManager';
import DeployManager from 'core/DeployManager';
import createEventListeners from 'createEventListeners';
import StartGate from 'ui/StartGate';
import EndingOverlay from 'ui/EndingOverlay';
import { WORLD_SCALE } from 'core/constants';

// Standard-layout buttons (a DualShock 4's)
const CROSS = 0;
const CIRCLE = 1;
const SQUARE = 2;
const TRIANGLE = 3;
const L1 = 4;
const R1 = 5;
const L2 = 6;
const R2 = 7;
const SHARE = 8;
const OPTIONS = 9;
const L3 = 10;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

let pads = [];
const getGamepads = jest.fn(() => pads);
Object.defineProperty(navigator, 'getGamepads', { value: getGamepads, configurable: true });

/** A pad as the browser reports it, at rest; connected (the event fires). */
function connectPad({ mapping = 'standard' } = {}) {
  const pad = {
    connected: true,
    mapping,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  pads = [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  return pad;
}

function disconnectPads() {
  pads = [];
  window.dispatchEvent(new Event('gamepaddisconnected'));
}

/** One frame's poll, with the world awake (playing, start gate down). */
const frame = () => Gamepad.poll(true);

function press(pad, button) {
  pad.buttons[button].pressed = true;
  frame();
}

function release(pad, button) {
  pad.buttons[button].pressed = false;
  frame();
}

// Every key event the game's window listeners hear
let heard;
const listen = (event) => heard.push(`${event.type} ${event.code}${event.repeat ? ' repeat' : ''}`);

beforeAll(() => {
  // The game page's listeners, once, as main.js installs them
  createEventListeners();
  Gamepad.initialize();
});

beforeEach(() => {
  heard = [];
  window.addEventListener('keydown', listen);
  window.addEventListener('keyup', listen);
  gameState.mode = 'PLAYING';
  getGamepads.mockClear();
});

afterEach(() => {
  disconnectPads();
  window.removeEventListener('keydown', listen);
  window.removeEventListener('keyup', listen);
  gameState.mode = 'MENU';
});

describe("A controller's buttons are the keys they stand for", () => {
  it.each([
    ['Cross', CROSS, 'Space'],
    ['Circle', CIRCLE, 'KeyC'],
    ['Square', SQUARE, 'KeyR'],
    ['Triangle', TRIANGLE, 'KeyG'],
    ['L1', L1, 'ArrowLeft'],
    ['R1', R1, 'ArrowRight'],
    ['the d-pad up', DPAD_UP, 'ArrowUp'],
    ['the d-pad down', DPAD_DOWN, 'ArrowDown'],
    ['the d-pad left', DPAD_LEFT, 'ArrowLeft'],
    ['the d-pad right', DPAD_RIGHT, 'ArrowRight'],
    ['Options', OPTIONS, 'Escape'],
    ['Share', SHARE, 'KeyP'],
  ])('%s presses %s', (_name, button, code) => {
    const pad = connectPad();

    press(pad, button);
    release(pad, button);

    expect(heard).toEqual([`keydown ${code}`, `keyup ${code}`]);
  });

  it('a held button presses its key once, however long it is held', () => {
    const pad = connectPad();

    press(pad, CROSS);
    for (let i = 0; i < 60; i += 1) frame();
    release(pad, CROSS);
    for (let i = 0; i < 60; i += 1) frame();

    expect(heard).toEqual(['keydown Space', 'keyup Space']);
  });

  it('a button with no key of its own presses an unbound key', () => {
    const pad = connectPad();

    press(pad, R2);
    release(pad, R2);

    expect(heard).toEqual(['keydown Unidentified', 'keyup Unidentified']);
  });

  it("Cross releases the cursor slot's creature", async () => {
    ctx.loadPuzzle('playback-basic'); // an empty room, the player in its middle
    await ctx.tick(16);
    ctx.setInventorySlot(0, { song: [{ pitch: 'C4', length: '1/4' }], interval: 4 });
    const pad = connectPad();

    press(pad, CROSS);
    release(pad, CROSS);
    await ctx.finishPole();

    expect(ctx.getCreatures().map((creature) => creature.song[0].pitch)).toEqual(['C4']);
    expect(ctx.getInventorySlot(0)).toBeNull();
  });

  it('Circle claps', async () => {
    ctx.loadPuzzle('clap-basic');
    await ctx.tick(16);
    const claps = jest.fn();
    ClapManager.setVisualCallback(claps);
    const pad = connectPad();

    press(pad, CIRCLE);
    release(pad, CIRCLE);
    await ctx.advanceBeats(1);
    ClapManager.setVisualCallback(null);

    expect(claps).toHaveBeenCalledTimes(1);
  });

  it('Triangle aims the waystone gate', async () => {
    ctx.loadPuzzle('deploy-basic');
    DeployManager.reset();
    // Step on the waystone: it becomes the gate's destination
    ctx.setPlayerPosition({ x: 7 * WORLD_SCALE, y: 0, z: 11 * WORLD_SCALE });
    await ctx.tick(20);
    const pad = connectPad();

    press(pad, TRIANGLE);
    release(pad, TRIANGLE);

    expect(DeployManager.state).toBe('aiming');
    DeployManager.reset();
  });

  it('L1 and R1 move the tape cursor (R1 on a filled last slot adds one)', () => {
    ctx.setInventorySlot(0, { song: [{ pitch: 'C4', length: '1/4' }] });
    const pad = connectPad();

    press(pad, R1);
    release(pad, R1);
    expect(gameState.player.inventory).toHaveLength(2);
    expect(gameState.player.activeSlot).toBe(1);

    press(pad, L1);
    release(pad, L1);
    expect(gameState.player.activeSlot).toBe(0);
  });

  it('Square absorbs like R', async () => {
    ctx.loadPuzzle('recording-basic'); // a creature in the pole's reach
    await ctx.tick(16);
    const pad = connectPad();

    press(pad, SQUARE);
    release(pad, SQUARE);
    await ctx.finishPole();

    expect(ctx.getInventorySlot(0).song[0].pitch).toBe('C4');
    expect(ctx.getCreatures()).toHaveLength(0);
  });

  it('any button dismisses the ending card, one with no key of its own too', () => {
    const ending = new EndingOverlay();
    const pad = connectPad();

    ending.show();
    press(pad, CROSS);
    expect(ending.visible).toBe(false);

    release(pad, CROSS);
    ending.show();
    press(pad, R2);
    expect(ending.visible).toBe(false);
    ending.dispose();
  });
});

describe('Which pad, and when', () => {
  it('with no pad connected, a frame does no work (the pads are never even read)', () => {
    for (let i = 0; i < 60; i += 1) frame();

    expect(getGamepads).not.toHaveBeenCalled();
  });

  it('plays with a standard-layout pad over one the browser could not map', () => {
    const odd = { connected: true, mapping: '', axes: [], buttons: [{ pressed: true }] };
    const pad = connectPad();
    pads = [odd, pad];

    frame();
    expect(heard).toEqual([]);

    press(pad, CROSS);
    expect(heard).toEqual(['keydown Space']);
  });

  it('a pad pressed before the game loaded is picked up when it does', async () => {
    const pad = connectPad();
    pad.buttons[CROSS].pressed = true;

    // A fresh page, its pad already connected (no event will come)
    await jest.isolateModulesAsync(async () => {
      const freshGamepad = (await import('core/Gamepad')).default;
      freshGamepad.initialize();
      freshGamepad.poll(true);
    });

    expect(heard).toEqual(['keydown Space']);
  });
});

describe('A pad that leaves lets go of everything it held', () => {
  beforeEach(async () => {
    ctx.loadPuzzle('recording-basic');
    await ctx.tick(16);
  });

  it('a disconnect mid-hold releases the keys', async () => {
    const pad = connectPad();
    press(pad, SQUARE);
    await ctx.tick(800);

    disconnectPads();

    expect(heard).toEqual(['keydown KeyR', 'keyup KeyR']);
  });

  it('a disconnect mid-walk rests the sticks and drops the run', () => {
    const pad = connectPad();
    pad.axes = [0.6, -0.8, 1, 0];
    press(pad, L3);
    const { stick } = gameState.input;
    expect(stick.walk.y).toBeGreaterThan(0);
    expect(stick.running).toBe(true);

    disconnectPads();

    expect(stick).toEqual({ walk: { x: 0, y: 0 }, look: { x: 0, y: 0 }, running: false });
  });

  it('a pad gone with no disconnect event is let go of on the next frame', async () => {
    const pad = connectPad();
    pad.axes = [0, -1, 0, 0];
    press(pad, SQUARE);
    await ctx.tick(800);

    pads = [];
    frame();

    expect(heard).toEqual(['keydown KeyR', 'keyup KeyR']);
    expect(gameState.input.stick.walk).toEqual({ x: 0, y: 0 });
  });
});

describe('The sticks', () => {
  it('read exactly zero inside the dead zone', () => {
    const pad = connectPad();
    pad.axes = [0.1, -0.1, -0.06, 0.12]; // a worn pad at rest

    frame();

    expect(gameState.input.stick.walk).toEqual({ x: 0, y: 0 });
    expect(gameState.input.stick.look).toEqual({ x: 0, y: 0 });
  });

  it('rest outside play (behind the start gate, paused, the menu), as no key moves you there', () => {
    const pad = connectPad();
    pad.axes = [0, -1, 1, 0];
    frame();
    expect(gameState.input.stick.walk.y).toBe(1);

    Gamepad.poll(false);

    expect(gameState.input.stick.walk).toEqual({ x: 0, y: 0 });
    expect(gameState.input.stick.look).toEqual({ x: 0, y: 0 });
  });

  it('a click of L3 runs until the left stick comes back to rest', () => {
    const pad = connectPad();
    const { stick } = gameState.input;
    pad.axes = [0, -1, 0, 0];
    frame();
    expect(stick.running).toBe(false);

    press(pad, L3);
    release(pad, L3);
    expect(stick.running).toBe(true);
    pad.axes = [0.5, -0.5, 0, 0]; // steering: still running
    frame();
    expect(stick.running).toBe(true);

    pad.axes = [0, 0, 0, 0];
    frame();
    pad.axes = [0, -1, 0, 0];
    frame();
    expect(stick.running).toBe(false);
  });

  it('L2 runs while held, and only while held', () => {
    const pad = connectPad();
    const { stick } = gameState.input;
    pad.axes = [0, -1, 0, 0];

    press(pad, L2);
    expect(stick.running).toBe(true);
    release(pad, L2);
    expect(stick.running).toBe(false); // walking on, but no latch

    press(pad, L2);
    pad.axes = [0, 0, 0, 0]; // at rest, held: the keyboard's walk runs too
    frame();
    expect(stick.running).toBe(true);
  });
});

describe('The start gate and a pad press', () => {
  let gate;
  let resume = null;
  const context = audioContextManager.getContext();

  beforeEach(() => {
    gate = new StartGate();
  });

  afterEach(() => {
    gate.hide();
    jest.runAllTimers();
    context.state = 'running';
    if (resume) resume.mockRestore();
    resume = null;
  });

  /** Audio as a fresh page has it: suspended, and resume() waits for a gesture. */
  function lockAudio() {
    context.state = 'suspended';
    resume = jest.spyOn(context, 'resume').mockReturnValue(new Promise(() => {}));
  }

  const note = () => document.querySelector('#start-gate .start-gate-sound');

  it('wakes a world whose audio runs, and the waking press never reaches the game', () => {
    const pad = connectPad();
    gate.show();

    press(pad, CROSS);

    expect(gate.visible).toBe(false);
    expect(heard).toEqual([]);
  });

  it('while the world loads, a pad press wakes nothing', () => {
    const pad = connectPad();
    gate.showLoading();

    press(pad, CROSS);

    expect(gate.visible).toBe(true);
    expect(heard).toEqual([]);
  });

  it('while audio is locked, a pad press leaves the gate up for a key or a click, and says so', async () => {
    lockAudio();
    const pad = connectPad();
    gate.show();

    press(pad, CROSS);
    await Promise.resolve();

    expect(gate.visible).toBe(true);
    expect(note().textContent).toBe('press a key or click to start sound');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(gate.visible).toBe(false);
  });

  it('on a page whose audio can resume, a pad press wakes the world once audio runs', async () => {
    context.state = 'suspended';
    resume = jest.spyOn(context, 'resume').mockImplementation(() => {
      context.state = 'running';
      return Promise.resolve();
    });
    const pad = connectPad();
    gate.show();

    press(pad, CROSS);
    expect(gate.visible).toBe(true); // not until audio is running
    await Promise.resolve();

    expect(gate.visible).toBe(false);
  });

  it('a resume that only starts after that gate is gone never drops the next one', async () => {
    let resumed;
    context.state = 'suspended';
    resume = jest.spyOn(context, 'resume').mockReturnValue(
      new Promise((resolve) => {
        resumed = resolve;
      })
    );
    const pad = connectPad();
    gate.show();
    press(pad, CROSS);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); // woken by a key
    gate.show(); // the next world's gate

    context.state = 'running';
    resumed();
    await Promise.resolve();

    expect(gate.visible).toBe(true);
  });
});
