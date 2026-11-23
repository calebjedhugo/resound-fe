import gameState from 'core/GameState';

/**
 * Gamepad - the game controller: a PS4 DualShock 4, or anything else the
 * browser maps to the Gamepad API's "standard" layout. Polled once a frame
 * by the game loop (main.js), before the frame's motion and look.
 *
 * The sticks are analog: `gameState.input.stick` holds each one's tilt past
 * a radial dead zone, exactly 0 at rest, which motion.js (left: walk and
 * strafe) and CameraController (right: look) read beside the key flags.
 * Holding L2 runs; so does clicking L3, until the left stick comes back to
 * rest. Outside play the sticks rest, but while a menu is open the left
 * stick steps through it, pressing the d-pad's up/down keys (_step).
 *
 * The buttons stand in for keys: a press dispatches its key's keydown on
 * window and a release its keyup, so every listener (the actions, the key
 * hints, the ending card, pause, the menus) answers the controller without
 * knowing it exists. A button with no key of its own presses an unbound one, as any
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
BUTTON_KEYS[8] = 'KeyP'; // Share: sound on/off
BUTTON_KEYS[9] = 'Escape'; // Options: pause / resume
BUTTON_KEYS[12] = 'ArrowUp'; // d-pad up: the menus' focus up
BUTTON_KEYS[13] = 'ArrowDown'; // d-pad down: the menus' focus down
BUTTON_KEYS[14] = 'ArrowLeft'; // d-pad left
BUTTON_KEYS[15] = 'ArrowRight'; // d-pad right
const UNBOUND_KEY = 'Unidentified';
const L2 = 6;
const L3 = 10;

// How far a stick tilts before it counts, as a share of its throw. A
// DualShock at rest reads a few hundredths off center (more as it wears);
// past this, the tilt ramps up from 0, so nothing jumps at the edge.
const DEAD_ZONE = 0.15;
// The right stick's response: its tilt squared, so a small tilt aims finely
const LOOK_CURVE = 2;

// The left stick in a menu: tilted up or down past STEP_TILT it presses that
// arrow, and held there presses it again after STEP_DELAY_MS, then every
// STEP_REPEAT_MS, as a held key repeats. It lets go only below
// STEP_RELEASE_TILT, so a stick wavering at the edge doesn't chatter.
const STEP_TILT = 0.5;
const STEP_RELEASE_TILT = 0.3;
const STEP_DELAY_MS = 400;
const STEP_REPEAT_MS = 150;

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

const sendKey = (type, code, repeat = false) => {
  const event = new KeyboardEvent(type, { code, repeat });
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

  // L3 was clicked and the left stick hasn't come back to rest since
  static _runLatched = false;

  // The arrow the left stick holds down in a menu (null: none), and when it
  // presses it again
  static _stepKey = null;

  static _stepAt = 0;

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
   * start gate either; in a `menu` the left stick steps through it instead.
   * @param {boolean} awake
   * @param {boolean} [menu] - a menu is open (and nothing in front of it)
   */
  static poll(awake, menu = false) {
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

    this._step(menu ? axis(pad, 1) : 0);
    const { stick } = gameState.input;
    if (!awake) {
      this._rest();
      return;
    }
    readStick(axis(pad, 0), axis(pad, 1), 1, stick.walk);
    readStick(axis(pad, 2), axis(pad, 3), LOOK_CURVE, stick.look);
    // L2 runs while held; L3 (clicked or held) until the left stick comes
    // back to rest
    const walking = stick.walk.x !== 0 || stick.walk.y !== 0;
    this._runLatched = walking && (this._runLatched || !!this._down[L3]);
    stick.running = this._runLatched || !!this._down[L2];
  }

  /**
   * Step through a menu with the left stick: `y` is its vertical tilt
   * (positive down, as the pad reports it; 0 lets go).
   */
  static _step(y) {
    const held = this._stepKey;
    let code = null;
    if (y <= -STEP_TILT || (held === 'ArrowUp' && y < -STEP_RELEASE_TILT)) code = 'ArrowUp';
    else if (y >= STEP_TILT || (held === 'ArrowDown' && y > STEP_RELEASE_TILT)) code = 'ArrowDown';

    const now = performance.now();
    if (code === held) {
      if (code && now >= this._stepAt) {
        sendKey('keydown', code, true);
        this._stepAt = now + STEP_REPEAT_MS;
      }
      return;
    }
    if (held) sendKey('keyup', held);
    this._stepKey = code;
    if (code) {
      sendKey('keydown', code);
      this._stepAt = now + STEP_DELAY_MS;
    }
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
    this._step(0);
    this._rest();
  }

  static _rest() {
    const { stick } = gameState.input;
    stick.walk.x = 0;
    stick.walk.y = 0;
    stick.look.x = 0;
    stick.look.y = 0;
    stick.running = false;
    this._runLatched = false;
  }
}

export default Gamepad;
