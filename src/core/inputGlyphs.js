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
