/**
 * EditorGamepad — the level editor played from the couch with a controller
 * (a DualShock 4, or any pad the browser maps to the standard layout). The
 * pad is read the game's way (core/Gamepad's findPad, readStick, DEAD_ZONE;
 * core/InputDevice told the pad is in hand, so the legend shows its glyphs),
 * but the mapping is the editor's own, by what has the focus:
 *
 *   viewport  — build the level (the default)
 *   panel     — the sidebar's controls (PadFocus), entered with the touchpad
 *   menu      — an open entity / editor menu (ContextMenu's own keys)
 *   map       — the world map (PadFocus over its puzzles)
 *   song      — the song editor (SongEditorModal.padAction; song-options
 *               while its Options popover / staff dialog is open)
 *
 * Most buttons press the editor's own keys (synthetic keydowns marked
 * `fromGamepad`, as the game's Gamepad does), so the controller and the
 * keyboard can't drift apart: the d-pad is the arrows, R2 held is Shift
 * (carry the entity), L2 held reaches the Option layer (storeys) and undo /
 * redo. Cross is held as well as pressed: on a cell with no floor it builds
 * floor, a range from where it went down to where it is let go. The full
 * mapping is EDITOR_MAPPING below, the legend (editor/ui/PadLegend) and
 * src/editor/CLAUDE.md.
 *
 * Polled once an animation frame while a pad is connected (no pad, no
 * frames). The keyboard and mouse are untouched.
 */
import { findPad, readStick, DEAD_ZONE } from 'core/Gamepad';
import InputDevice from 'core/InputDevice';

// Standard-layout button indices
export const BUTTONS = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  share: 8,
  options: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  touchpad: 17,
};
const NAMES = Object.fromEntries(Object.entries(BUTTONS).map(([name, i]) => [i, name]));
const DPAD = ['up', 'down', 'left', 'right'];
const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

// A trigger counts as held past this much of its travel
const TRIGGER_HELD = 0.35;

// A held d-pad direction repeats, as a held key does
const REPEAT_DELAY_MS = 300;
const REPEAT_EVERY_MS = 100;

// In a menu or panel the left stick steps the focus as the game's menus do:
// past STEP_TILT at once, then repeating; it lets go under STEP_RELEASE_TILT
const STEP_TILT = 0.5;
const STEP_RELEASE_TILT = 0.3;
const MENU_DELAY_MS = 400;
const MENU_REPEAT_MS = 150;

// Camera speeds at full tilt
const ORBIT_RADIANS_PER_S = 2.2;
const TILT_RADIANS_PER_S = 1.3;
const ZOOM_PER_S = 1.6; // e-folds of distance a second, R3 / L3 held
const ZOOM_CLICK = 0.8; // a click of R3 nearer by this much (L3: further)
const PAN_SHARE_PER_S = 0.9; // of the camera's distance, a second

/**
 * What each button does, by context and held modifier — the one table the
 * code and the legend read. [button, what it does] per row; '+l2' rows
 * apply while L2 is held, '+r2' while R2 is.
 */
export const EDITOR_MAPPING = {
  viewport: [
    ['dpad', 'Move the cursor (hold to repeat)'],
    ['lstick', 'Pan the camera (the cursor rides at its centre)'],
    ['rstick', 'Orbit the camera'],
    ['r3', 'Zoom in (hold: keep going)'],
    ['l3', 'Zoom out (hold: keep going)'],
    [
      'cross',
      'Empty: place the chosen type with its floor (Wall held: a hollow box; floor only: floor, held a range) · select · menu',
    ],
    ['square', 'Delete the entity under the cursor, else its floor'],
    ['triangle', "Edit the creature's / gate's song"],
    ['circle', 'Back: cancel, deselect'],
    ['l1/r1', 'Choose what to place (… floor only between the ends)'],
    ['l2', 'Hold: storeys, undo, song, camera'],
    ['r2', 'Hold: carry the entity'],
    ['options', 'Menu: Play, puzzles, undo, look, sharp…'],
    ['share', 'Game look / schematic look'],
    ['touchpad', 'The sidebar panels'],
  ],
  'viewport+l2': [
    ['updown', 'Storey up / down (✕ held on a wall box: its storeys)'],
    ['leftright', 'Undo / redo'],
    ['r3', 'Centre the camera on the cursor'],
    ['l3', 'Reset the camera'],
    ['triangle', 'Play / stop the song (it lights)'],
    ['r2', '+ R2 and d-pad up/down: carry a storey'],
  ],
  'viewport+r2': [
    ['dpad', 'Move the entity (the cursor follows)'],
    ['l1/r1', 'Carry it down / up a storey'],
  ],
  panel: [
    ['updown', 'Move between controls'],
    ['leftright', 'Change a value / option'],
    ['cross', 'Choose (a dropdown: open the one shown)'],
    ['circle', 'Back to the level'],
    ['touchpad', 'Back to the level'],
  ],
  menu: [
    ['updown', 'Move'],
    ['cross', 'Choose'],
    ['circle', 'Close'],
  ],
  map: [
    ['dpad', 'Move between puzzles'],
    ['cross', 'Open it'],
    ['circle', 'Close the map'],
  ],
  song: [
    ['leftright', 'Move the edit cursor (← onto a note; → back to the end)'],
    ['updown', 'Move the pitch cursor (lines and spaces)'],
    [
      'cross',
      'A new note at the pitch cursor (on a note, after ←: pitch on / off it; dot chosen: dot, double, none; tie chosen: tie / untie)',
    ],
    ['square', 'Note → rest; rest → gone'],
    ['l1/r1', 'Palette: shorter / longer (32nd … whole, dot, tie)'],
    ['triangle', 'Play / stop (the creature lights)'],
    ['l2', 'Hold: insert a note, accidental, note duration'],
    ['r2', 'Hold: a rest, note duration'],
    ['l3/r3', 'Undo / redo'],
    ['options', 'Clef, copy another song (gate / creature), Clear… (the popover)'],
    ['share', 'Other staff (grand staff)'],
    ['circle', 'Close'],
  ],
  'song+l2': [
    ['updown', 'Accidental of the note there: ♯ / ♭'],
    ['cross', 'A new note before the one the cursor is on (at the end: after it)'],
    ['l1/r1', 'The note: shorter / longer'],
  ],
  'song+r2': [
    ['cross', 'A rest of the chosen duration (if it fits)'],
    ['l1/r1', 'The note: shorter / longer'],
  ],
  'song-options': [
    ['updown', 'Move between controls'],
    ['leftright', 'Change the value shown (clef, the gate to copy from)'],
    ['cross', 'Choose'],
    ['circle', 'Back to the staff'],
    ['options', 'Back to the staff'],
  ],
};

// The song editor's actions (SongEditorModal.padAction) by button; while L2
// or R2 is held, its own row first (an unlisted button keeps its plain job).
// L2 / R2 alone do nothing: they only change other buttons.
const SONG_ACTIONS = {
  left: 'left',
  right: 'right',
  up: 'pitchUp',
  down: 'pitchDown',
  cross: 'cross',
  square: 'erase',
  l1: 'palettePrev',
  r1: 'paletteNext',
  triangle: 'play',
  l3: 'undo',
  r3: 'redo',
  options: 'options',
  share: 'voice',
  circle: 'close',
};
const SONG_ACTIONS_L2 = {
  up: 'sharpen',
  down: 'flatten',
  cross: 'insertNote',
  l1: 'noteShorter',
  r1: 'noteLonger',
};
const SONG_ACTIONS_R2 = { cross: 'rest', l1: 'noteShorter', r1: 'noteLonger' };

const dominant = (x, y) => {
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'up' : 'down'; // readStick's y is up
};

export default class EditorGamepad {
  /**
   * @param {object} app - the EditorApp: padContext(), pressKey(), the
   *   pad actions (padConfirm, cyclePalette, ...), panelFocus, mapFocus,
   *   songEditorModal, the camera moves, onPadChange()
   * @param {{now?: () => number}} [options]
   */
  constructor(app, { now = () => performance.now() } = {}) {
    this._app = app;
    this._now = now;
    this._down = [];
    this._repeatAt = [];
    this._stickDir = null;
    this._stickNext = 0;
    this._pressedTime = [];
    this._sticksOut = [false, false];
    this._lastPoll = null;
    this._frame = null;
    this._connected = false;
    this._walk = { x: 0, y: 0 };
    this._look = { x: 0, y: 0 };
  }

  /**
   * Listen for pads; poll every frame while one is connected. A button
   * already held is no press (back from Play, the one that chose Back to
   * Editor may still be down): it acts only once let go and pressed again.
   */
  start() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    this._onConnect = () => {
      this._connected = true;
      this._schedule();
    };
    this._onDisconnect = () => this._rescan();
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
    this._release();
    this._latchHeld();
    this._rescan();
  }

  /** What is held now counts as already down (and a held d-pad never repeats). */
  _latchHeld() {
    const pad = findPad();
    if (!pad) return;
    this._pad = pad;
    pad.buttons.forEach((button, i) => {
      if (this._pressedAt(i)) {
        this._down[i] = true;
        this._repeatAt[i] = Infinity;
      }
    });
    this._pad = null;
  }

  stop() {
    if (this._onConnect) window.removeEventListener('gamepadconnected', this._onConnect);
    if (this._onDisconnect) window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
    this._connected = false;
  }

  /** Whether L2 / R2 are held now (the legend shows their layer). */
  get modifiers() {
    return { l2: this._held(BUTTONS.l2), r2: this._held(BUTTONS.r2) };
  }

  /** Read the pad once: its presses, repeats and sticks. */
  poll() {
    const pad = navigator.getGamepads ? findPad() : null;
    if (!pad) {
      this._release();
      return;
    }
    const now = this._now();
    const dt = this._lastPoll === null ? 0 : Math.min(0.1, (now - this._lastPoll) / 1000);
    this._lastPoll = now;
    this._pad = pad;

    const { buttons } = pad;
    for (let i = 0; i < buttons.length; i += 1) {
      const pressed = this._pressedAt(i);
      if (pressed && !this._down[i]) {
        this._down[i] = true;
        InputDevice.usePad(pad);
        this._repeatAt[i] = now + REPEAT_DELAY_MS;
        this._pressedTime[i] = now;
        this._press(NAMES[i]);
      } else if (!pressed && this._down[i]) {
        this._down[i] = false;
        this._letGo(NAMES[i]);
      } else if (pressed && DPAD.includes(NAMES[i]) && now >= this._repeatAt[i]) {
        this._repeatAt[i] = now + REPEAT_EVERY_MS;
        this._press(NAMES[i]);
      }
    }

    this._noticeSticks(pad);
    readStick(pad.axes[0] || 0, pad.axes[1] || 0, 1, this._walk);
    readStick(pad.axes[2] || 0, pad.axes[3] || 0, 2, this._look);
    this._sticks(now, dt);

    // The legend follows the context and the held modifiers (it rebuilds
    // only when they change)
    if (this._app.onPadChange) this._app.onPadChange();
  }

  _schedule() {
    if (this._frame !== null || typeof requestAnimationFrame !== 'function') return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      if (!this._connected) return;
      this.poll();
      this._schedule();
    });
  }

  _rescan() {
    this._connected = navigator.getGamepads ? findPad() !== null : false;
    if (this._connected) this._schedule();
    else this._release();
  }

  _release() {
    // A Cross held as the pad goes: the floor range it was building is off
    if (this._down[BUTTONS.cross] && this._app.cancelFloorRange) this._app.cancelFloorRange();
    this._down = [];
    this._stickDir = null;
    this._lastPoll = null;
    this._sticksOut = [false, false];
    this._pad = null;
  }

  _pressedAt(index) {
    const button = this._pad && this._pad.buttons[index];
    if (!button) return false;
    if (index === BUTTONS.l2 || index === BUTTONS.r2) {
      return button.pressed || button.value > TRIGGER_HELD;
    }
    return button.pressed;
  }

  _held(index) {
    return Boolean(this._down[index]);
  }

  _noticeSticks(pad) {
    for (let s = 0; s < 2; s += 1) {
      const out = Math.hypot(pad.axes[s * 2] || 0, pad.axes[s * 2 + 1] || 0) > DEAD_ZONE;
      if (out && !this._sticksOut[s]) InputDevice.usePad(pad);
      this._sticksOut[s] = out;
    }
  }

  // ---- Buttons ------------------------------------------------------------

  /** A button let go: Cross ends the floor range it was building. */
  _letGo(button) {
    if (button === 'cross' && this._app.padConfirmEnd) this._app.padConfirmEnd();
  }

  _press(button) {
    if (!button) return;
    const app = this._app;
    const context = app.padContext();
    if (context === 'song' || context === 'song-options') {
      const { l2, r2 } = this.modifiers;
      const action =
        (l2 && SONG_ACTIONS_L2[button]) || (r2 && SONG_ACTIONS_R2[button]) || SONG_ACTIONS[button];
      if (action) app.songEditorModal.padAction(action);
      return;
    }
    if (context === 'menu') {
      if (button === 'up' || button === 'down') app.pressKey(ARROWS[button]);
      else if (button === 'cross') app.pressKey('Enter');
      else if (button === 'circle') app.pressKey('Escape');
      return;
    }
    if (context === 'map') {
      if (button === 'up' || button === 'left') app.mapFocus.move(-1);
      else if (button === 'down' || button === 'right') app.mapFocus.move(1);
      else if (button === 'cross') app.mapFocus.activate();
      else if (button === 'circle') app.pressKey('Escape');
      return;
    }
    if (context === 'panel') {
      this._pressInPanel(button);
      return;
    }
    this._pressInViewport(button);
  }

  _pressInPanel(button) {
    const app = this._app;
    const focus = app.panelFocus;
    switch (button) {
      case 'up':
      case 'down':
        focus.move(button === 'up' ? -1 : 1);
        break;
      case 'left':
      case 'right':
        focus.adjust(button === 'left' ? -1 : 1);
        break;
      case 'cross':
        focus.activate();
        break;
      case 'circle':
      case 'touchpad':
        app.togglePanelFocus(false);
        break;
      case 'options':
        app.openEditorMenu();
        break;
      default:
        break;
    }
  }

  _pressInViewport(button) {
    const app = this._app;
    const { l2, r2 } = this.modifiers;
    if (DPAD.includes(button)) {
      const vertical = button === 'up' || button === 'down';
      if (l2 && r2 && vertical) app.pressKey(ARROWS[button], { shiftKey: true, altKey: true });
      else if (l2 && vertical) app.pressKey(ARROWS[button], { altKey: true });
      else if (l2) app.pressKey('z', { ctrlKey: true, shiftKey: button === 'right' });
      else if (r2) app.pressKey(ARROWS[button], { shiftKey: true });
      else app.pressKey(ARROWS[button]);
      app.followCursor();
      return;
    }
    switch (button) {
      case 'cross':
        if (!l2) app.padConfirm();
        break;
      case 'square':
        if (!l2) app.pressKey('Delete');
        break;
      case 'triangle':
        if (l2) app.padAudition();
        else app.padSongEditor();
        break;
      case 'circle':
        app.pressKey('Escape');
        break;
      case 'l1':
      case 'r1':
        if (r2) {
          app.pressKey(button === 'l1' ? 'ArrowDown' : 'ArrowUp', { shiftKey: true, altKey: true });
        } else {
          app.cyclePalette(button === 'l1' ? -1 : 1);
        }
        break;
      case 'options':
        app.openEditorMenu();
        break;
      case 'share':
        app.toggleLook();
        break;
      case 'touchpad':
        app.togglePanelFocus(true);
        break;
      case 'r3':
      case 'l3':
        if (l2 && button === 'r3') app.centerCameraOnCursor();
        else if (l2) app.resetCamera();
        else app.zoomCamera(button === 'r3' ? ZOOM_CLICK : 1 / ZOOM_CLICK);
        break;
      default:
        break;
    }
  }

  // ---- Sticks -------------------------------------------------------------

  _sticks(now, dt) {
    const app = this._app;
    const context = app.padContext();
    const walk = this._walk;
    const look = this._look;

    if (context !== 'viewport') {
      // The left stick steps through whatever has the focus, as the d-pad
      this._stickSteps(walk, now, (dir) => this._press(dir));
      return;
    }
    this._stickDir = null;
    // The left stick pans; the right stick orbits, inverted on both axes
    // (the designer's ruling, 2026-11-23)
    if (walk.x || walk.y) {
      app.panCamera(walk.x * PAN_SHARE_PER_S * dt, walk.y * PAN_SHARE_PER_S * dt);
    }
    if (look.x || look.y) {
      app.orbitCamera(-look.x * ORBIT_RADIANS_PER_S * dt, -look.y * TILT_RADIANS_PER_S * dt);
    }
    // R3 / L3 held past a click keep zooming (not under L2: those are the
    // camera's centre / reset)
    if (this.modifiers.l2) return;
    const zoomHeld = (index) =>
      this._held(index) && now - (this._pressedTime[index] ?? Infinity) >= REPEAT_DELAY_MS;
    const zoomIn = zoomHeld(BUTTONS.r3);
    const zoomOut = zoomHeld(BUTTONS.l3);
    if (zoomIn !== zoomOut) app.zoomCamera(Math.exp((zoomIn ? -1 : 1) * ZOOM_PER_S * dt));
  }

  /**
   * Step `onStep(direction)` while the stick is tilted: at once, then
   * repeating at the menus' pace.
   */
  _stickSteps(stick, now, onStep) {
    const tilt = Math.hypot(stick.x, stick.y);
    const held = this._stickDir;
    let dir = null;
    if (tilt >= STEP_TILT || (held && tilt > STEP_RELEASE_TILT)) dir = dominant(stick.x, stick.y);
    if (!dir) {
      this._stickDir = null;
      return;
    }
    if (dir !== held) {
      this._stickDir = dir;
      this._stickNext = now + MENU_DELAY_MS;
      onStep(dir);
      return;
    }
    if (now < this._stickNext) return;
    this._stickNext = now + MENU_REPEAT_MS;
    onStep(dir);
  }
}
