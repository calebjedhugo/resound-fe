/**
 * Clef symbol renderer.
 * Creates SVG group for treble, bass, or percussion clef.
 */

import { createGroup, createPath, createSvgElement } from 'notation/lib/svgHelpers';

// Simple SVG path approximations for clef glyphs.
// These are functional shapes, not typographic perfection.

const TREBLE_CLEF_PATH =
  'M 10 70 C 10 50, 25 30, 15 10 C 5 -10, 25 -10, 20 10 ' +
  'C 15 30, 5 50, 10 70 C 15 85, 20 90, 15 95 C 10 100, 5 90, 10 80';

const BASS_CLEF_PATH =
  'M 5 20 C 5 10, 15 5, 20 15 C 25 25, 15 35, 5 30 ' +
  'L 5 20 M 25 12 A 2 2 0 1 1 25 16 M 25 22 A 2 2 0 1 1 25 26';

/**
 * Create an SVG group representing a clef symbol.
 * @param {string} type - "treble", "bass", or "percussion"
 * @returns {SVGGElement}
 */
export function createClef(type) {
  const group = createGroup(`clef clef-${type}`);

  switch (type) {
    case 'treble':
      group.appendChild(createPath(TREBLE_CLEF_PATH, { fill: 'currentColor' }));
      break;

    case 'bass':
      group.appendChild(createPath(BASS_CLEF_PATH, { fill: 'currentColor' }));
      break;

    case 'percussion': {
      // Two vertical rectangles side by side
      const rect1 = createSvgElement('rect', {
        x: 5,
        y: 0,
        width: 6,
        height: 80,
        fill: 'currentColor',
      });
      const rect2 = createSvgElement('rect', {
        x: 15,
        y: 0,
        width: 6,
        height: 80,
        fill: 'currentColor',
      });
      group.appendChild(rect1);
      group.appendChild(rect2);
      break;
    }

    default:
      throw new Error(`Unknown clef type: "${type}"`);
  }

  return group;
}
