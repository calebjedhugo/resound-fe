/** @jest-environment jsdom */
/**
 * Sound on/off (core/Sound): the pause menu's "Sound" entry, the P key and a
 * controller's Share button turn the game's sound off and on, in play and
 * while paused, with a brief toast for the key. Off fades resound-sound's
 * master output to silence; the audio context keeps running, so the game
 * (its clock, the creatures' songs, the pole) carries on exactly as with
 * sound on. Remembered across visits. A key pressed while the start gate is
 * up only wakes the gate, as any key does: it never toggles the sound.
 */
import { audioContextManager } from 'resound-sound';
import gameState from 'core/GameState';
import Gamepad from 'core/Gamepad';
import Sound from 'core/Sound';
import createEventListeners from 'createEventListeners';
import PauseMenu from 'ui/PauseMenu';
import StartGate from 'ui/StartGate';

const SHARE = 8;

let pads = [];
Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });

// A DualShock 4, as Chrome names it
const DUALSHOCK_4 = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';

function connectPad(id = DUALSHOCK_4) {
  const pad = {
    id,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  pads = [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  return pad;
}

/** A controller button pressed and let go, one frame each, as main.js polls. */
function tap(pad, button, { awake = true, menu = false } = {}) {
  pad.buttons[button].pressed = true;
  Gamepad.poll(awake, menu);
  pad.buttons[button].pressed = false;
  Gamepad.poll(awake, menu);
}

/** A keyboard key pressed and let go: it goes to the focused element, as a real key's does. */
function key(code) {
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

/** Where a gain ends up once its scheduled automation has run. */
function settledGain(param) {
  const events = [
    ...param.setValueAtTime.mock.calls.map(([value, time], i) => ({
      value,
      time,
      order: param.setValueAtTime.mock.invocationCallOrder[i],
    })),
    ...param.linearRampToValueAtTime.mock.calls.map(([value, time], i) => ({
      value,
      time,
      order: param.linearRampToValueAtTime.mock.invocationCallOrder[i],
    })),
  ];
  if (events.length === 0) return param.value;
  events.sort((a, b) => a.time - b.time || a.order - b.order);
  return events[events.length - 1].value;
}

/** The level every sound the game makes reaches the speakers at (0: silent). */
const master = (manager = audioContextManager) => settledGain(manager.getOutput().gain);

// Every pause menu a test opens, closed after it (pass or fail)
let openMenus = [];
function openPauseMenu() {
  gameState.mode = 'PAUSED';
  const menu = new PauseMenu();
  menu.show();
  openMenus.push(menu);
  return menu;
}

const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent);
const soundEntry = (menu) => menu.entries().find((e) => e.textContent.startsWith('Sound'));

beforeAll(() => {
  // The game page's listeners, once, as main.js installs them
  createEventListeners();
  Gamepad.initialize();
});

beforeEach(() => {
  gameState.mode = 'PLAYING';
  document.querySelectorAll('.toast').forEach((t) => t.remove());
});

afterEach(() => {
  openMenus.forEach((menu) => menu.hide());
  openMenus = [];
  // Back to sound on for the next test (the setting is the page's)
  if (!Sound.isOn()) Sound.toggle();
  pads = [];
  window.dispatchEvent(new Event('gamepaddisconnected'));
  gameState.mode = 'MENU';
});

describe('the P key', () => {
  it('in play, turns the sound off and back on, saying so', () => {
    expect(master()).toBe(1);

    key('KeyP');
    expect(audioContextManager.isMuted()).toBe(true);
    expect(master()).toBe(0);
    expect(toasts()).toEqual(['Sound off — P to turn it on']);

    key('KeyP');
    expect(audioContextManager.isMuted()).toBe(false);
    expect(master()).toBe(1);
    expect(toasts()).toEqual(['Sound off — P to turn it on', 'Sound on']);
  });

  it('works while paused, and the pause menu entry follows', () => {
    const menu = openPauseMenu();
    expect(soundEntry(menu).textContent).toBe('Sound: On');

    key('KeyP');

    expect(master()).toBe(0);
    expect(soundEntry(menu).textContent).toBe('Sound: Off');
  });

  it('held down, toggles once', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));

    expect(audioContextManager.isMuted()).toBe(true);
  });
});

describe("the controller's Share button", () => {
  it('in play, turns the sound off and back on', () => {
    const pad = connectPad();

    tap(pad, SHARE);
    expect(master()).toBe(0);
    expect(toasts()).toEqual(['Sound off — Share to turn it on']);

    tap(pad, SHARE);
    expect(master()).toBe(1);
  });

  it.each([
    [
      'a DualSense',
      'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      'Create',
    ],
    [
      'an Xbox pad',
      'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      'View',
    ],
    [
      'a Switch Pro Controller',
      'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
      'Minus',
    ],
    [
      'a pad of no known family',
      'USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0011)',
      'Select',
    ],
  ])("the toast names %s's own button", (_pad, id, name) => {
    const pad = connectPad(id);

    tap(pad, SHARE);

    expect(toasts()).toEqual([`Sound off — ${name} to turn it on`]);
  });

  it('the P key after a pad press names P', () => {
    const pad = connectPad();
    tap(pad, SHARE);

    key('KeyP');

    expect(toasts()).toEqual(['Sound off — Share to turn it on', 'Sound on']);
    key('KeyP');
    expect(toasts()[2]).toBe('Sound off — P to turn it on');
  });

  it('works while paused too', () => {
    const menu = openPauseMenu();
    const pad = connectPad();

    tap(pad, SHARE, { awake: false, menu: true });

    expect(master()).toBe(0);
    expect(soundEntry(menu).textContent).toBe('Sound: Off');
  });
});

describe("the pause menu's Sound entry", () => {
  let menu;

  beforeEach(() => {
    menu = openPauseMenu();
  });

  it('sits under Invert Look', () => {
    expect(menu.entries().map((e) => e.textContent)).toEqual([
      'Resume',
      'Invert Look: Off',
      'Sound: On',
      'Main Menu',
    ]);
  });

  it.each(['Enter', 'Space'])('chosen with %s, flips the sound and keeps the focus', (code) => {
    key('ArrowDown');
    key('ArrowDown');
    expect(document.activeElement).toBe(soundEntry(menu));

    key(code);
    expect(master()).toBe(0);
    expect(soundEntry(menu).textContent).toBe('Sound: Off');
    expect(document.activeElement).toBe(soundEntry(menu));

    key(code);
    expect(master()).toBe(1);
    expect(soundEntry(menu).textContent).toBe('Sound: On');
    expect(document.activeElement).toBe(soundEntry(menu));
  });

  it('clicked, flips it', () => {
    soundEntry(menu).click();

    expect(audioContextManager.isMuted()).toBe(true);
    expect(soundEntry(menu).textContent).toBe('Sound: Off');
  });
});

describe('behind the start gate', () => {
  let gate;

  beforeEach(() => {
    gate = new StartGate();
    gate.show(); // a built world, waiting for its gesture
  });

  afterEach(() => {
    gate.hide();
    jest.runAllTimers();
  });

  it('P only wakes the gate', () => {
    key('KeyP');

    expect(gate.visible).toBe(false);
    expect(audioContextManager.isMuted()).toBe(false);
    expect(toasts()).toEqual([]);
  });

  it('Share only wakes the gate', () => {
    const pad = connectPad();

    tap(pad, SHARE, { awake: false });

    expect(gate.visible).toBe(false);
    expect(audioContextManager.isMuted()).toBe(false);
  });

  it('a gate still loading swallows P without toggling', () => {
    gate.showLoading();

    key('KeyP');

    expect(gate.visible).toBe(true);
    expect(audioContextManager.isMuted()).toBe(false);
  });
});

describe('with the sound off, the game runs on', () => {
  it('never suspends the audio context', () => {
    const context = audioContextManager.getContext();
    const suspend = jest.spyOn(context, 'suspend');

    key('KeyP');
    key('KeyP');
    key('KeyP');

    expect(suspend).not.toHaveBeenCalled();
    expect(context.state).toBe('running');
    suspend.mockRestore();
  });

  it('a creature still sings, the clock counts, and the pole absorbs it', async () => {
    key('KeyP');
    ctx.loadPuzzle('recording-basic'); // creature 3 away, sings every 4 beats
    ctx.clearEmittedNotes();
    await ctx.advanceBeats(4);
    expect(ctx.getEmittedNotes().map((note) => note.pitch)).toContain('C4');

    ctx.pressKey('r');
    await ctx.finishPole();

    expect(ctx.getCurrentBeat()).toBeGreaterThanOrEqual(4);
    expect(ctx.getInventorySlot(0).song).toEqual([expect.objectContaining({ pitch: 'C4' })]);
    expect(master()).toBe(0);
  });
});

describe('remembered across visits', () => {
  it('a page loaded after sound was turned off starts silent, the menu saying so', async () => {
    key('KeyP');

    // The next page load: fresh modules (resound-sound's master included),
    // the same storage. The game page's listeners load as main.js loads them
    let fresh;
    await jest.isolateModulesAsync(async () => {
      const { audioContextManager: manager } = await import('resound-sound');
      await import('createEventListeners');
      const { default: FreshPauseMenu } = await import('ui/PauseMenu');
      fresh = { manager, menu: new FreshPauseMenu() };
      openMenus.push(fresh.menu);
    });

    expect(fresh.manager.isMuted()).toBe(true);
    expect(master(fresh.manager)).toBe(0);
    fresh.menu.show();
    expect(soundEntry(fresh.menu).textContent).toBe('Sound: Off');
  });

  it('a first visit has sound on', async () => {
    localStorage.clear();
    let fresh;
    await jest.isolateModulesAsync(async () => {
      const { audioContextManager: manager } = await import('resound-sound');
      await import('createEventListeners');
      fresh = manager;
    });

    expect(fresh.isMuted()).toBe(false);
    expect(master(fresh)).toBe(1);
  });
});
