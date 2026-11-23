/** @jest-environment jsdom */
/**
 * The menus (pause, main) with the keyboard and a controller (jsdom, fake
 * pads). The focus starts on the first entry whenever a menu opens; arrow
 * up/down move it (the d-pad's up/down, or the left stick, which repeats
 * while held), wrapping around at the ends; Enter or Space chooses the
 * focused entry (a controller's Cross); C backs out (its Circle), which
 * resumes from pause. The keys a menu takes act on the menu alone: nothing
 * in the world (the tape, a clap, the tape cursor) answers behind it.
 */
import gameState from 'core/GameState';
import Gamepad from 'core/Gamepad';
import ClapManager from 'core/ClapManager';
import Settings from 'core/Settings';
import createEventListeners from 'createEventListeners';
import PauseMenu from 'ui/PauseMenu';
import MainMenu from 'ui/MainMenu';

// Standard-layout buttons (a DualShock 4's)
const CROSS = 0;
const CIRCLE = 1;
const L1 = 4;
const R1 = 5;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

const FRAME_MS = 50;

let pads = [];
Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });

function connectPad() {
  const pad = {
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  pads = [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  return pad;
}

/** One frame's poll as main.js runs it with a menu open, a frame's time on. */
function frame() {
  Gamepad.poll(false, true);
  jest.advanceTimersByTime(FRAME_MS);
}

/** A button pressed and let go, a frame each. */
function tap(pad, button) {
  pad.buttons[button].pressed = true;
  frame();
  pad.buttons[button].pressed = false;
  frame();
}

/** A keyboard key pressed and let go: it goes to the focused element, as a real key's does. */
function key(code) {
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

const focused = () => document.activeElement.textContent;
const labels = (menu) => menu.entries().map((entry) => entry.textContent);

let menu;
let resumed;
let pad;

beforeAll(() => {
  // The game page's listeners, as main.js installs them
  createEventListeners();
  Gamepad.initialize();
});

beforeEach(() => {
  Settings.set('invertLookY', false);
  resumed = jest.fn();
  menu = new PauseMenu(resumed);
  gameState.mode = 'PAUSED';
  menu.show();
  pad = connectPad();
});

afterEach(() => {
  menu.hide();
  pads = [];
  window.dispatchEvent(new Event('gamepaddisconnected'));
  gameState.mode = 'MENU';
});

describe('The focus', () => {
  it('starts on the first entry whenever a menu opens', () => {
    expect(labels(menu)).toEqual(['Resume', 'Invert Look: Off', 'Sound: On', 'Main Menu']);
    expect(focused()).toBe('Resume');

    tap(pad, DPAD_DOWN);
    menu.hide();
    menu.show();

    expect(focused()).toBe('Resume');
  });

  it("moves with the d-pad's up and down, wrapping around at the ends", () => {
    tap(pad, DPAD_DOWN);
    expect(focused()).toBe('Invert Look: Off');
    tap(pad, DPAD_DOWN);
    expect(focused()).toBe('Sound: On');
    tap(pad, DPAD_DOWN);
    expect(focused()).toBe('Main Menu');
    tap(pad, DPAD_DOWN);
    expect(focused()).toBe('Resume');

    tap(pad, DPAD_UP);
    expect(focused()).toBe('Main Menu');
  });

  it("moves with the keyboard's arrows the same way", () => {
    key('ArrowUp');
    expect(focused()).toBe('Main Menu');
    key('ArrowDown');
    expect(focused()).toBe('Resume');
    key('ArrowDown');
    expect(focused()).toBe('Invert Look: Off');
  });

  it('follows the mouse', () => {
    const exit = menu.entries()[3];

    exit.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(focused()).toBe('Main Menu');
  });
});

describe('The left stick', () => {
  it('steps once per tilt', () => {
    pad.axes[1] = 1; // down
    frame();
    pad.axes[1] = 0;
    frame();
    pad.axes[1] = -1; // up
    frame();
    pad.axes[1] = 0;
    frame();
    pad.axes[1] = 1;
    frame();

    expect(focused()).toBe('Invert Look: Off');
  });

  it('held, steps again after 400 ms, then every 150 ms', () => {
    let steps = 0;
    const onStep = (event) => {
      if (event.code === 'ArrowDown') steps += 1;
    };
    window.addEventListener('keydown', onStep);
    const stepsBy = {};

    pad.axes[1] = 0.9;
    for (let ms = 0; ms <= 1000; ms += FRAME_MS) {
      frame();
      stepsBy[ms] = steps;
    }
    window.removeEventListener('keydown', onStep);

    expect(stepsBy[0]).toBe(1); // the tilt
    expect(stepsBy[350]).toBe(1);
    expect(stepsBy[400]).toBe(2); // the hold starts repeating
    expect(stepsBy[500]).toBe(2);
    expect(stepsBy[550]).toBe(3);
    expect(stepsBy[1000]).toBe(6); // 700, 850, 1000
  });

  it('wavering just under the tilt it took holds on, and lets go nearer the middle', () => {
    pad.axes[1] = 0.6;
    frame();
    pad.axes[1] = 0.4; // still held: no new step on the way back up
    frame();
    pad.axes[1] = 0.6;
    frame();
    expect(focused()).toBe('Invert Look: Off');

    pad.axes[1] = 0.2;
    frame();
    pad.axes[1] = 0.6;
    frame();
    expect(focused()).toBe('Sound: On');
  });

  it('steps nothing in play (it walks there)', () => {
    const heard = [];
    const listen = (event) => heard.push(event.code);
    window.addEventListener('keydown', listen);
    pad.axes[1] = 1;

    for (let i = 0; i < 20; i += 1) Gamepad.poll(true, false);
    window.removeEventListener('keydown', listen);

    expect(heard).toEqual([]);
  });
});

describe('Choosing and backing out', () => {
  it('Cross chooses the focused entry: Invert Look flips', () => {
    tap(pad, DPAD_DOWN);

    tap(pad, CROSS);

    expect(Settings.get('invertLookY')).toBe(true);
    expect(focused()).toBe('Invert Look: On'); // the focus stays put
    expect(resumed).not.toHaveBeenCalled();
  });

  it('Cross on Resume resumes', () => {
    tap(pad, CROSS);

    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('Circle backs out: it resumes', () => {
    tap(pad, CIRCLE);

    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it("the keyboard's Enter and Space choose, and C backs out", () => {
    key('ArrowDown');
    key('Enter');
    expect(Settings.get('invertLookY')).toBe(true);
    key('Space');
    expect(Settings.get('invertLookY')).toBe(false);

    key('KeyC');
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('a held Enter chooses once', () => {
    key('ArrowDown');
    const target = document.activeElement;

    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    for (let i = 0; i < 5; i += 1) {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Enter', repeat: true, bubbles: true })
      );
    }

    expect(Settings.get('invertLookY')).toBe(true);
  });
});

describe('Nothing in the world answers a menu', () => {
  it('Cross performs no tape, and Circle claps no clap', async () => {
    ctx.loadPuzzle('playback-basic');
    await ctx.tick(16);
    ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
    ctx.clearEmittedNotes();
    const claps = jest.fn();
    ClapManager.setVisualCallback(claps);
    tap(pad, DPAD_DOWN); // onto Invert Look: Cross only flips it

    tap(pad, CROSS);
    tap(pad, CIRCLE);
    await ctx.advanceBeats(2);
    ClapManager.setVisualCallback(null);

    expect(ctx.getEmittedNotes()).toEqual([]);
    expect(claps).not.toHaveBeenCalled();
  });

  it('the tape cursor stays where it was (L1/R1, the d-pad left/right)', () => {
    ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);

    [R1, DPAD_RIGHT, L1, DPAD_LEFT].forEach((button) => tap(pad, button));

    expect(gameState.player.inventory).toHaveLength(1);
    expect(gameState.player.activeSlot).toBe(0);
  });
});

describe('The main menu', () => {
  let mainMenu;
  const puzzles = [
    { id: 'first', name: 'First', difficulty: 1 },
    { id: 'second', name: 'Second', difficulty: 1 },
    { id: 'third', name: 'Third', difficulty: 2 },
  ];

  beforeEach(() => {
    menu.hide();
    gameState.mode = 'MENU';
  });

  afterEach(() => mainMenu.hide());

  it('opens on the first puzzle, and Cross starts the focused one', () => {
    const start = jest.fn();
    mainMenu = new MainMenu(puzzles, start, null);
    mainMenu.show();
    expect(focused()).toBe('First');

    tap(pad, DPAD_UP); // wraps to the last
    tap(pad, CROSS);

    expect(start).toHaveBeenCalledWith('third');
  });

  it('Circle backs out of nothing', () => {
    const start = jest.fn();
    mainMenu = new MainMenu(puzzles, start, null);
    mainMenu.show();

    tap(pad, CIRCLE);

    expect(mainMenu.visible).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });
});
