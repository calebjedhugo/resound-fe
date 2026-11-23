/**
 * InputDevice - what the player is playing with right now, for the key
 * hints and the texts that name a key: the keyboard (and mouse), or a game
 * controller of some family.
 *
 * The last MEANINGFUL input decides. A controller counts once one of its
 * buttons goes down or a stick leaves its dead zone (core/Gamepad tells
 * this module, before the button's key goes out, so whoever hears that key
 * already sees the pad); a pad merely connected, or a stick at rest, is no
 * input. A real key press (one core/Gamepad didn't send: no `fromGamepad`),
 * a mouse button, or the mouse travelling MOUSE_TRAVEL_PX switches back. A
 * pad's leaving with none left switches back too.
 *
 * The family comes from the Gamepad API's `id`: its vendor id where the
 * browser gives one (Chrome "... Vendor: 054c Product: 09cc)", Firefox
 * "54c-9cc-Name"), else its name (Safari gives the name alone). PlayStation
 * (Sony), Xbox (Microsoft), Nintendo Switch (Nintendo), or generic for
 * anything else. core/inputGlyphs maps each game action to its glyph in
 * each family.
 */

export const KEYBOARD = 'keyboard';

const VENDOR_FAMILIES = {
  '054c': 'playstation', // Sony
  '045e': 'xbox', // Microsoft
  '057e': 'switch', // Nintendo
};

// By name, where no vendor id says (Safari), in this order: an "Xbox
// Wireless Controller" is no PlayStation's "Wireless Controller"
const NAME_FAMILIES = [
  [/xbox|xinput|microsoft/, 'xbox'],
  [/dualsense|dualshock|playstation|sony|^wireless controller/, 'playstation'],
  [/nintendo|pro controller|joy-con|switch/, 'switch'],
];

// How far the mouse travels before it counts as the player taking it up
// again: further than a nudged desk or a settling sensor moves it
const MOUSE_TRAVEL_PX = 24;

/**
 * A pad's family from its Gamepad API `id`.
 * @param {string} [id]
 * @returns {'playstation'|'xbox'|'switch'|'generic'}
 */
export const padFamily = (id = '') => {
  const lower = id.toLowerCase();
  // Chrome: "Name (STANDARD GAMEPAD Vendor: 054c Product: 09cc)";
  // Firefox: "054c-09cc-Name" (leading zeros dropped on some platforms)
  const chrome = lower.match(/vendor:\s*([0-9a-f]{1,4})/);
  const firefox = lower.match(/^([0-9a-f]{1,4})-[0-9a-f]{1,4}-(.*)$/);
  const vendor = (chrome || firefox || [])[1];
  if (vendor && VENDOR_FAMILIES[vendor.padStart(4, '0')]) {
    return VENDOR_FAMILIES[vendor.padStart(4, '0')];
  }
  const name = firefox ? firefox[2] : lower;
  const named = NAME_FAMILIES.find(([pattern]) => pattern.test(name));
  return named ? named[1] : 'generic';
};

class InputDevice {
  // What the hints show: KEYBOARD or the last pad's family
  static family = KEYBOARD;

  // The pad that last counted: its id and family (for a key it pressed)
  static padId = '';

  static padFamily = 'generic';

  static _listeners = [];

  // Where the mouse was when it was last seen since a pad took over (null:
  // not seen since)
  static _mouseFrom = null;

  static _listening = false;

  /** Listen for the keyboard and the mouse (the game page only, once). */
  static initialize() {
    if (this._listening) return;
    this._listening = true;
    // Capture phase: the start gate's capture listener stops a waking key
    // from going further, and that key is still the keyboard's
    window.addEventListener(
      'keydown',
      (event) => {
        if (!event.fromGamepad) this.useKeyboard();
      },
      true
    );
    window.addEventListener('mousedown', () => this.useKeyboard(), true);
    window.addEventListener(
      'mousemove',
      (event) => {
        if (this.family === KEYBOARD) return;
        if (!this._mouseFrom) {
          this._mouseFrom = { x: event.clientX, y: event.clientY };
          return;
        }
        const travel = Math.hypot(
          event.clientX - this._mouseFrom.x,
          event.clientY - this._mouseFrom.y
        );
        if (travel >= MOUSE_TRAVEL_PX) this.useKeyboard();
      },
      true
    );
  }

  /**
   * A pad's button went down or a stick left its dead zone (core/Gamepad).
   * @param {{id?: string}} pad
   */
  static usePad(pad) {
    const id = pad.id || '';
    if (id !== this.padId) {
      this.padId = id;
      this.padFamily = padFamily(id);
    }
    this._mouseFrom = null;
    this._set(this.padFamily);
  }

  /** A real key, a mouse button or a mouse move: back to keyboard glyphs. */
  static useKeyboard() {
    this._set(KEYBOARD);
  }

  /** Whether the hints show a controller's glyphs. */
  static isPad() {
    return this.family !== KEYBOARD;
  }

  /**
   * The family of the device a key event came from: the pad's for one
   * core/Gamepad sent, else the keyboard.
   */
  static familyOf(event) {
    return event.fromGamepad ? this.padFamily : KEYBOARD;
  }

  /**
   * Call `fn(family)` whenever the family changes (never per frame).
   * @returns {Function} unsubscribe
   */
  static onChange(fn) {
    this._listeners.push(fn);
    return () => {
      const i = this._listeners.indexOf(fn);
      if (i !== -1) this._listeners.splice(i, 1);
    };
  }

  static _set(family) {
    if (family === this.family) return;
    this.family = family;
    this._listeners.forEach((fn) => fn(family));
  }
}

export default InputDevice;
