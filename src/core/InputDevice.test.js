/** @jest-environment jsdom */
/**
 * The device in hand (core/InputDevice), as the key hints follow it (jsdom,
 * fake pads polled as main.js polls them): a controller's button or a stick
 * leaving its dead zone switches to the pad's glyphs; a real key, a mouse
 * button or the mouse travelling switches back. A pad merely connected, or
 * held with its sticks at rest, switches nothing, and nothing flickers while
 * both are in use. The pad's family comes from its Gamepad API id, in each
 * browser's form.
 */
import Gamepad from 'core/Gamepad';
import InputDevice, { KEYBOARD, padFamily } from 'core/InputDevice';
import { glyphFor, nameFor } from 'core/inputGlyphs';
import gameState from 'core/GameState';
import CameraModeBadge from 'ui/CameraModeBadge';

const CROSS = 0;
const L2 = 6;

const DUALSHOCK_4 = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const SWITCH_PRO = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';

let pads = [];
Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });

/** A pad as the browser reports it, at rest; connected (the event fires). */
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

/** One frame's poll, with the world awake (playing, start gate down). */
const frame = () => Gamepad.poll(true);

function tap(pad, button) {
  pad.buttons[button].pressed = true;
  frame();
  pad.buttons[button].pressed = false;
  frame();
}

/** A real key, to the focused element as a real key goes. */
function key(code) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

const mouse = (type, x = 0, y = 0) =>
  document.body.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));

// Every family change, as a hint hears it
let changes;
let stopListening;

beforeAll(() => {
  Gamepad.initialize();
  InputDevice.initialize();
});

beforeEach(() => {
  changes = [];
  stopListening = InputDevice.onChange((family) => changes.push(family));
});

afterEach(() => {
  stopListening();
  pads = [];
  window.dispatchEvent(new Event('gamepaddisconnected'));
});

describe('Which device the hints show', () => {
  it('the keyboard, before any controller is used', () => {
    expect(InputDevice.family).toBe(KEYBOARD);
  });

  it('a pad merely connected switches nothing, however long it sits', () => {
    connectPad();
    for (let i = 0; i < 120; i += 1) frame();

    expect(InputDevice.family).toBe(KEYBOARD);
    expect(changes).toEqual([]);
  });

  it('a stick resting off centre inside its dead zone switches nothing', () => {
    const pad = connectPad();
    pad.axes = [0.08, -0.1, -0.05, 0.12];
    for (let i = 0; i < 120; i += 1) frame();

    expect(InputDevice.family).toBe(KEYBOARD);
  });

  it("a pad's button switches to the pad", () => {
    const pad = connectPad();

    tap(pad, CROSS);

    expect(InputDevice.family).toBe('playstation');
    expect(changes).toEqual(['playstation']);
  });

  it('a button with no key of its own (L2, to run) switches too', () => {
    const pad = connectPad(XBOX);

    tap(pad, L2);

    expect(InputDevice.family).toBe('xbox');
  });

  it.each([
    ['left', [0.6, 0, 0, 0]],
    ['right', [0, 0, 0, -0.6]],
  ])('the %s stick leaving its dead zone switches to the pad', (_stick, axes) => {
    const pad = connectPad();

    pad.axes = axes;
    frame();

    expect(InputDevice.family).toBe('playstation');
  });

  it('the pad is already in hand when its button presses its key', () => {
    const pad = connectPad();
    let seen = null;
    const listen = () => {
      seen = InputDevice.family;
    };
    window.addEventListener('keydown', listen);

    tap(pad, CROSS);
    window.removeEventListener('keydown', listen);

    expect(seen).toBe('playstation');
  });

  it('a real key switches back to the keyboard', () => {
    const pad = connectPad();
    tap(pad, CROSS);

    key('KeyW');

    expect(InputDevice.family).toBe(KEYBOARD);
    expect(changes).toEqual(['playstation', KEYBOARD]);
  });

  it('a mouse button switches back to the keyboard', () => {
    const pad = connectPad();
    tap(pad, CROSS);

    mouse('mousedown');

    expect(InputDevice.family).toBe(KEYBOARD);
  });

  it('the mouse taken up again switches back; a nudge of a few pixels does not', () => {
    const pad = connectPad();
    tap(pad, CROSS);

    mouse('mousemove', 400, 300);
    mouse('mousemove', 406, 304);
    expect(InputDevice.family).toBe('playstation');

    mouse('mousemove', 460, 330);
    expect(InputDevice.family).toBe(KEYBOARD);
  });

  it('a stick held over while the mouse moves claims nothing back: no flicker', () => {
    const pad = connectPad();
    pad.axes = [0.8, 0, 0, 0];
    frame();
    mouse('mousedown');

    for (let i = 0; i < 60; i += 1) {
      mouse('mousemove', i * 30, 0);
      frame();
    }

    expect(changes).toEqual(['playstation', KEYBOARD]);
  });

  it('a held button switches once, not every frame it is held', () => {
    const pad = connectPad();
    pad.buttons[CROSS].pressed = true;
    for (let i = 0; i < 60; i += 1) frame();

    expect(changes).toEqual(['playstation']);
  });

  it('the pad leaving, none left, switches back to the keyboard', () => {
    const pad = connectPad();
    tap(pad, CROSS);

    pads = [];
    window.dispatchEvent(new Event('gamepaddisconnected'));

    expect(InputDevice.family).toBe(KEYBOARD);
  });

  it('another pad taking over shows its own family', () => {
    tap(connectPad(DUALSHOCK_4), CROSS);

    tap(connectPad(SWITCH_PRO), CROSS);

    expect(changes).toEqual(['playstation', 'switch']);
  });
});

describe('The keyboard-look badge', () => {
  it('stands down while a pad is in hand (the right stick looks in any mode)', () => {
    const badge = new CameraModeBadge();
    gameState.mode = 'PLAYING';
    gameState.input.mouseLookEnabled = false;
    badge.update(gameState);
    expect(badge.element.style.display).toBe('block');

    tap(connectPad(), CROSS);
    badge.update(gameState);
    expect(badge.element.style.display).toBe('none');

    key('KeyW');
    badge.update(gameState);
    expect(badge.element.style.display).toBe('block');

    badge.element.remove();
    gameState.input.mouseLookEnabled = true;
    gameState.mode = 'MENU';
  });
});

describe("A pad's family, from its id", () => {
  it.each([
    // Chrome / Edge: the name, then the vendor and product ids
    [DUALSHOCK_4, 'playstation'],
    ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'playstation'],
    [XBOX, 'xbox'],
    ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox'],
    [SWITCH_PRO, 'switch'],
    // Firefox: vendor-product-name, leading zeros dropped on some platforms
    ['54c-9cc-Wireless Controller', 'playstation'],
    ['045e-0b13-Xbox Wireless Controller', 'xbox'],
    ['57e-2009-Pro Controller', 'switch'],
    // Safari: the name alone
    ['DualShock 4 Wireless Controller', 'playstation'],
    ['Wireless Controller', 'playstation'],
    ['Xbox Wireless Controller', 'xbox'],
    ['Pro Controller', 'switch'],
    // Anything else
    ['USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0011)', 'generic'],
    ['8BitDo SN30 Pro (Vendor: 2dc8 Product: 6101)', 'generic'],
    ['2dc8-6101-8BitDo SN30 Pro', 'generic'],
    ['', 'generic'],
  ])('%j is %s', (id, family) => {
    expect(padFamily(id)).toBe(family);
  });

  it('a pad with no id at all is generic', () => {
    const pad = connectPad(undefined);
    delete pad.id;

    tap(pad, CROSS);

    expect(InputDevice.family).toBe('generic');
  });
});

describe("Each action's glyph", () => {
  it.each([
    // family, release (Space), absorb (R), deploy (G), tape cursor right
    [KEYBOARD, 'Space', 'R', 'G', 'Right arrow'],
    ['playstation', 'Cross', 'Square', 'Triangle', 'R1'],
    ['xbox', 'A', 'X', 'Y', 'RB'],
    ['switch', 'B', 'Y', 'X', 'R'],
    ['generic', 'the bottom button', 'the left button', 'the top button', 'RB'],
  ])('on %s: %s, %s, %s, %s', (family, release, absorb, deploy, tapeRight) => {
    expect(['release', 'absorb', 'deploy', 'tapeRight'].map((a) => nameFor(a, family))).toEqual([
      release,
      absorb,
      deploy,
      tapeRight,
    ]);
  });

  it("a pad's face buttons are its standard layout's positions (the right one names no action)", () => {
    expect(['release', 'absorb', 'deploy'].map((a) => glyphFor(a, 'generic').position)).toEqual([
      'bottom',
      'left',
      'top',
    ]);
    expect(glyphFor('clap', KEYBOARD)).toBeUndefined();
  });

  it('on a pad the sticks walk and look; on the keyboard W/A/S/D and I/J/K/L', () => {
    expect([glyphFor('move', 'xbox').side, glyphFor('look', 'xbox').side]).toEqual([
      'left',
      'right',
    ]);
    expect(glyphFor('move', KEYBOARD).labels).toEqual(['W', 'A', 'S', 'D']);
    expect(glyphFor('look', KEYBOARD).labels).toEqual(['I', 'J', 'K', 'L']);
  });

  it('a glyph is the same object every time it is asked for (nothing allocated per frame)', () => {
    expect(glyphFor('absorb', 'switch')).toBe(glyphFor('absorb', 'switch'));
  });
});
