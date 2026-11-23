/**
 * inputGlyphs - each game action's glyph, and its name in words, on the
 * keyboard and on each controller family (core/InputDevice). The key hints
 * draw the glyphs (ui/glyphCanvas); texts that name a key use the names.
 *
 * A controller's buttons are keys (core/Gamepad): the face button at the
 * bottom of the diamond is Space (release a creature), the left one R
 * (absorb), the top one G (the waystone gate) — the right one is C, which
 * only backs out of menus (no hint names it) — R1/RB moves the tape cursor
 * right, Share/View is P (sound). The Gamepad API's standard
 * layout numbers the face buttons by POSITION, so each family's glyph is the
 * label printed at that position: a Switch's bottom button is "B", its right
 * one "A" — the other way round from an Xbox pad. A pad of no known family
 * shows the diamond itself, the button's position lit.
 *
 * Every glyph is a constant: glyphFor returns the same object every call.
 */
import { KEYBOARD } from 'core/InputDevice';

// Which face button each action is, by its position in the diamond
const FACE_POSITIONS = { release: 'bottom', absorb: 'left', deploy: 'top' };

const key = (label, name = label) => ({ kind: 'key', label, name });

const KEYBOARD_GLYPHS = {
  move: { kind: 'keys', labels: ['W', 'A', 'S', 'D'], name: 'W/A/S/D' },
  look: { kind: 'keys', labels: ['I', 'J', 'K', 'L'], name: 'I/J/K/L' },
  release: { kind: 'space', name: 'Space' },
  absorb: key('R'),
  deploy: key('G'),
  tapeRight: key('►', 'Right arrow'),
  sound: key('P'),
};

// Each family's labels: the face buttons by position (null: draw the
// diamond), the stick names, the right shoulder (the tape cursor's right),
// and the button that toggles sound
const PAD_LABELS = {
  playstation: {
    face: { bottom: 'Cross', right: 'Circle', left: 'Square', top: 'Triangle' },
    sticks: ['L', 'R'],
    shoulder: 'R1',
    sound: 'Share',
  },
  xbox: {
    face: { bottom: 'A', right: 'B', left: 'X', top: 'Y' },
    sticks: ['LS', 'RS'],
    shoulder: 'RB',
    sound: 'View',
  },
  switch: {
    face: { bottom: 'B', right: 'A', left: 'Y', top: 'X' },
    sticks: ['L', 'R'],
    shoulder: 'R',
    sound: 'Minus',
  },
  generic: { face: null, sticks: ['L', 'R'], shoulder: 'RB', sound: 'Select' },
};

/** A family's glyph for every action, built once. */
const padGlyphs = ({ face, sticks, shoulder, sound }) => {
  const glyphs = {
    move: { kind: 'stick', side: 'left', label: sticks[0], name: 'the left stick' },
    look: { kind: 'stick', side: 'right', label: sticks[1], name: 'the right stick' },
    tapeRight: { kind: 'shoulder', label: shoulder, name: shoulder },
    sound: { kind: 'button', name: sound },
  };
  Object.entries(FACE_POSITIONS).forEach(([action, position]) => {
    glyphs[action] = face
      ? { kind: 'face', position, mark: face[position], name: face[position] }
      : { kind: 'face', position, mark: null, name: `the ${position} button` };
  });
  return glyphs;
};

const GLYPHS = { [KEYBOARD]: KEYBOARD_GLYPHS };
Object.entries(PAD_LABELS).forEach(([family, labels]) => {
  GLYPHS[family] = padGlyphs(labels);
});

// The DualSense (PS5) calls its Share button Create
const DUALSENSE = /dualsense|product:\s*0(ce6|df2)|-0?(ce6|df2)-/i;

/**
 * An action's glyph on a family.
 * @param {string} action - move, look, release, absorb, deploy, tapeRight
 * @param {string} family - core/InputDevice's KEYBOARD or a pad family
 */
export const glyphFor = (action, family) => (GLYPHS[family] || GLYPHS.generic)[action];

/**
 * An action's key or button in words ("P", "Share", "View").
 * @param {string} action - as glyphFor, or sound
 * @param {string} family
 * @param {string} [padId] - the pad's Gamepad API id (a DualSense's Create)
 */
export const nameFor = (action, family, padId = '') => {
  if (action === 'sound' && family === 'playstation' && DUALSENSE.test(padId)) return 'Create';
  return glyphFor(action, family).name;
};

// ---- Every button by name (the level editor's controller legend) ----------

// Each family's printed names for the buttons the editor maps (positions of
// the standard layout): shoulders, triggers, stick clicks, the two menu
// buttons and the PlayStation touchpad
const PAD_BUTTON_NAMES = {
  playstation: {
    l1: 'L1',
    r1: 'R1',
    l2: 'L2',
    r2: 'R2',
    l3: 'L3',
    r3: 'R3',
    options: 'OPTIONS',
    share: 'SHARE',
    touchpad: 'PAD',
  },
  xbox: {
    l1: 'LB',
    r1: 'RB',
    l2: 'LT',
    r2: 'RT',
    l3: 'LS',
    r3: 'RS',
    options: 'MENU',
    share: 'VIEW',
    touchpad: 'GUIDE',
  },
  switch: {
    l1: 'L',
    r1: 'R',
    l2: 'ZL',
    r2: 'ZR',
    l3: 'LS',
    r3: 'RS',
    options: '+',
    share: '−',
    touchpad: 'CAPTURE',
  },
  generic: {
    l1: 'LB',
    r1: 'RB',
    l2: 'LT',
    r2: 'RT',
    l3: 'L3',
    r3: 'R3',
    options: 'START',
    share: 'SELECT',
    touchpad: '17',
  },
};
const FACE_BUTTONS = { cross: 'bottom', circle: 'right', square: 'left', triangle: 'top' };
const DPAD_ARMS = {
  dpad: 'all',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  updown: 'vertical',
  leftright: 'horizontal',
};

const buttonGlyphs = {};
Object.entries(PAD_LABELS).forEach(([family, { face, sticks }]) => {
  const names = PAD_BUTTON_NAMES[family];
  const glyphs = {};
  Object.entries(FACE_BUTTONS).forEach(([button, position]) => {
    glyphs[button] = face
      ? { kind: 'face', position, mark: face[position], name: face[position] }
      : { kind: 'face', position, mark: null, name: `the ${position} button` };
  });
  ['l1', 'r1', 'l2', 'r2'].forEach((button) => {
    glyphs[button] = { kind: 'shoulder', label: names[button], name: names[button] };
  });
  glyphs.l3 = { kind: 'stick', side: 'left', label: names.l3, name: names.l3, click: true };
  glyphs.r3 = { kind: 'stick', side: 'right', label: names.r3, name: names.r3, click: true };
  glyphs.lstick = { kind: 'stick', side: 'left', label: sticks[0], name: 'the left stick' };
  glyphs.rstick = { kind: 'stick', side: 'right', label: sticks[1], name: 'the right stick' };
  ['options', 'share', 'touchpad'].forEach((button) => {
    glyphs[button] = { kind: 'pill', label: names[button], name: names[button] };
  });
  Object.entries(DPAD_ARMS).forEach(([button, arms]) => {
    glyphs[button] = { kind: 'dpad', arms, name: `d-pad ${arms === 'all' ? '' : arms}`.trim() };
  });
  buttonGlyphs[family] = glyphs;
});

/**
 * A controller button's glyph on a family, by the button's name: cross,
 * circle, square, triangle (by position), l1, r1, l2, r2, l3, r3, lstick,
 * rstick, options, share, touchpad, and the d-pad (dpad, up, down, left,
 * right, updown, leftright). The same object every call.
 * @param {string} button
 * @param {string} family - a pad family (anything else reads as generic)
 */
export const buttonGlyph = (button, family) =>
  (buttonGlyphs[family] || buttonGlyphs.generic)[button];
