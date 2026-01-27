/**
 * Rest symbol renderer.
 * Creates SVG group for rest symbols of various durations.
 */

import { createGroup, createSvgElement, createPath } from 'notation/lib/svgHelpers';
import { getDurationInfo } from 'notation/lib/durationSymbols';

// Staff line Y positions in the staff group coordinate system
// (staff-lines group is offset by STAFF_TOP_OFFSET=10).
// Lines: y = 10, 30, 50, 70, 90
const LINE_2_Y = 30;
const LINE_3_Y = 50;

// Rest shape dimensions
const REST_RECT_WIDTH = 12;
const REST_RECT_HEIGHT = 10;

/**
 * Create an SVG group representing a rest symbol.
 * @param {Object} params
 * @param {string} params.length - Fraction string (e.g. "1/4")
 * @param {number} params.x - Horizontal position
 * @returns {SVGGElement}
 */
export function createRest({ length, x }) {
  const info = getDurationInfo(length);

  const group = createGroup(`rest rest-${info.name}`, {
    transform: `translate(${x}, 0)`,
  });

  switch (info.name) {
    case 'whole':
      // Filled rectangle hanging from line 2
      group.appendChild(
        createSvgElement('rect', {
          class: 'rest-symbol',
          x: -REST_RECT_WIDTH / 2,
          y: LINE_2_Y,
          width: REST_RECT_WIDTH,
          height: REST_RECT_HEIGHT,
          fill: 'currentColor',
        })
      );
      break;

    case 'half':
      // Filled rectangle sitting on line 3
      group.appendChild(
        createSvgElement('rect', {
          class: 'rest-symbol',
          x: -REST_RECT_WIDTH / 2,
          y: LINE_3_Y - REST_RECT_HEIGHT,
          width: REST_RECT_WIDTH,
          height: REST_RECT_HEIGHT,
          fill: 'currentColor',
        })
      );
      break;

    case 'quarter':
      // Zigzag path centered on staff
      group.appendChild(
        createPath('M -3 25 L 5 35 L -3 45 L 5 55 L -3 65 C -3 70 5 72 3 68', {
          class: 'rest-symbol',
          fill: 'currentColor',
        })
      );
      break;

    case 'eighth':
      // Dot with angled stroke
      group.appendChild(
        createPath('M 0 35 C 4 35 6 37 6 40 C 6 43 4 45 0 45 L 6 65', {
          class: 'rest-symbol',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
        })
      );
      break;

    case '16th':
      // Two dots with angled stroke
      group.appendChild(
        createPath(
          'M 0 30 C 4 30 6 32 6 35 C 6 38 4 40 0 40 ' +
            'M 0 40 C 4 40 6 42 6 45 C 6 48 4 50 0 50 L 6 70',
          { class: 'rest-symbol', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }
        )
      );
      break;

    default:
      // For 32nd and other durations, use a simple placeholder
      group.appendChild(
        createPath('M -3 35 L 3 35 L 0 55 Z', { class: 'rest-symbol', fill: 'currentColor' })
      );
      break;
  }

  return group;
}
