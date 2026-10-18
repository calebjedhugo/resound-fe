import gameState from 'core/GameState';

/**
 * Gamepad - the game controller: a PS4 DualShock 4, or anything else the
 * browser maps to the Gamepad API's "standard" layout. Polled once a frame
 * by the game loop (main.js), before the frame's motion and look.
 *
 * The sticks are analog: `gameState.input.stick` holds each one's tilt past
 * a radial dead zone, exactly 0 at rest, which motion.js (left: walk and
 * strafe) and CameraController (right: look) read beside the key flags.
 * Clicking L3 runs until the left stick comes back to rest.
 *
 * The buttons stand in for keys: a press dispatches its key's keydown on
 * window and a release its keyup, so every listener (the actions, the key
 * hints, the ending card, pause) answers the controller without knowing it
 * exists. A button with no key of its own presses an unbound one, as any
 * other key would: it still wakes the StartGate and dismisses the ending
 * card. The events carry `fromGamepad`, for the StartGate: a pad press is no
 * user activation, so it can't be the gesture that lets audio start.
 *
 * Game only: the editor never polls it.
 */

// Standard-layout button index -> the key it presses
const BUTTON_KEYS = [];
BUTTON_KEYS[0] = 'Space'; // Cross: perform the tape
BUTTON_KEYS[1] = 'KeyC'; // Circle: clap
BUTTON_KEYS[2] = 'KeyR'; // Square: record (a tap toggles, a hold records while held)
BUTTON_KEYS[3] = 'KeyG'; // Triangle: the cleanser gate (aim -> deploy -> remove)
BUTTON_KEYS[4] = 'ArrowLeft'; // L1: tape cursor left
BUTTON_KEYS[5] = 'ArrowRight'; // R1: tape cursor right
BUTTON_KEYS[9] = 'Escape'; // Options: pause / resume
BUTTON_KEYS[14] = 'ArrowLeft'; // d-pad left
BUTTON_KEYS[15] = 'ArrowRight'; // d-pad right
const UNBOUND_KEY = 'Unidentified';
const L3 = 10;

// How far a stick tilts before it counts, as a share of its throw. A
// DualShock at rest reads a few hundredths off center (more as it wears);
// past this, the tilt ramps up from 0, so nothing jumps at the edge.
const DEAD_ZONE = 0.15;
// The right stick's response: its tilt squared, so a small tilt aims finely
const LOOK_CURVE = 2;

/** An axis's reading; 0 for one this pad doesn't have. */
const axis = (pad, index) => pad.axes[index] || 0;

/**
 * Write a stick's tilt into `out`: 0 inside the dead zone, ramping to 1 at
 * the rim (a DualShock's corners read past 1), raised to `curve`. Radial, so
 * a diagonal keeps its direction instead of snapping toward an axis. The
 * pad's y axis points down; `out.y` is up (or ahead).
 */
const readStick = (x, y, curve, out) => {
  const length = Math.hypot(x, y);
  if (length <= DEAD_ZONE) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const scale = Math.min(1, (length - DEAD_ZONE) / (1 - DEAD_ZONE)) ** curve / length;
  out.x = x * scale;
  out.y = -y * scale;
};

/** The pad to play with: the first connected one, standard layout first. */
const findPad = () => {
  const pads = navigator.getGamepads();
  let fallback = null;
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (pad && pad.connected) {
      if (pad.mapping === 'standard') return pad;
      if (!fallback) fallback = pad;
    }
  }
  return fallback;
};

const sendKey = (type, code) => {
  const event = new KeyboardEvent(type, { code, repeat: false });
  event.fromGamepad = true;
  window.dispatchEvent(event);
};

class Gamepad {
  // Whether a pad may be connected: no pad, no polling (connection events
  // keep it current)
  static _connected = false;

  // Which buttons are down, by index: each one's keydown went out, and its
  // keyup is owed
  static _down = [];

  /** Listen for pads coming and going (the game page only, once). */
  static initialize() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    window.addEventListener('gamepadconnected', () => {
      this._connected = true;
    });
    window.addEventListener('gamepaddisconnected', () => this._rescan());
    // A pad pressed before the game loaded is connected already
    this._rescan();
  }

  /**
   * Read the pad: its buttons' presses and releases go out as keys, and its
   * sticks drive the player while the world is `awake` (playing, start gate
   * down). Otherwise the sticks rest, as no key moves the player behind the
   * start gate either.
   * @param {boolean} awake
   */
  static poll(awake) {
    if (!this._connected) return;
    const pad = findPad();
    if (!pad) {
      this._rescan();
      return;
    }

    const { buttons } = pad;
    const count = Math.max(buttons.length, this._down.length);
    for (let i = 0; i < count; i += 1) {
      const pressed = i < buttons.length && buttons[i].pressed;
      if (pressed !== !!this._down[i]) {
        this._down[i] = pressed;
        sendKey(pressed ? 'keydown' : 'keyup', BUTTON_KEYS[i] || UNBOUND_KEY);
      }
    }

    const { stick } = gameState.input;
    if (!awake) {
      this._rest();
      return;
    }
    readStick(axis(pad, 0), axis(pad, 1), 1, stick.walk);
    readStick(axis(pad, 2), axis(pad, 3), LOOK_CURVE, stick.look);
    // L3 (clicked or held) runs until the left stick comes back to rest
    const walking = stick.walk.x !== 0 || stick.walk.y !== 0;
    stick.running = walking && (stick.running || !!this._down[L3]);
  }

  /** After a pad leaves: if none is left, let go of everything it held. */
  static _rescan() {
    this._connected = findPad() !== null;
    if (this._connected) return;
    for (let i = 0; i < this._down.length; i += 1) {
      if (this._down[i]) {
        this._down[i] = false;
        sendKey('keyup', BUTTON_KEYS[i] || UNBOUND_KEY);
      }
    }
    this._rest();
  }

  static _rest() {
    const { stick } = gameState.input;
    stick.walk.x = 0;
    stick.walk.y = 0;
    stick.look.x = 0;
    stick.look.y = 0;
    stick.running = false;
  }
}

export default Gamepad;
