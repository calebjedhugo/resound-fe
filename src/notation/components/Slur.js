/**
 * Slur arc renderer.
 * Creates SVG path elements for slur arcs between note groups.
 */

import { createPath } from 'notation/lib/svgHelpers';

const NOTEHEAD_OFFSET = 6;
const BASE_HEIGHT = 15;
const SPAN_FACTOR = 0.15;
const MAX_ARC_HEIGHT = 40;

/**
 * Create an SVG path element for a slur arc.
 * @param {Object} params
 * @param {number} params.x1 - Start note X
 * @param {number} params.y1 - Start note Y
 * @param {number} params.x2 - End note X
 * @param {number} params.y2 - End note Y
 * @param {string} params.direction - "above" or "below"
 * @param {number} [params.depth] - Nesting depth (0 = outer, 1 = inner)
 * @returns {SVGPathElement}
 */
export function createSlurArc({ x1, y1, x2, y2, direction, depth = 0 }) {
  const dir = direction === 'below' ? 1 : -1;
  const startY = y1 + NOTEHEAD_OFFSET * dir;
  const endY = y2 + NOTEHEAD_OFFSET * dir;

  const horizontalDistance = Math.abs(x2 - x1);
  let arcHeight = Math.min(BASE_HEIGHT + horizontalDistance * SPAN_FACTOR, MAX_ARC_HEIGHT);

  // Inner slurs get a tighter curve
  if (depth > 0) {
    arcHeight *= 0.6;
  }

  const cp1x = x1 + (x2 - x1) * 0.33;
  const cp2x = x1 + (x2 - x1) * 0.67;
  const cpY1 = startY + arcHeight * dir;
  const cpY2 = endY + arcHeight * dir;

  const d = `M ${x1} ${startY} C ${cp1x} ${cpY1} ${cp2x} ${cpY2} ${x2} ${endY}`;

  const classes = ['slur'];
  if (depth === 0 && depth !== undefined) classes.push('slur-outer');
  if (depth > 0) classes.push('slur-inner');

  return createPath(d, {
    class: classes.join(' '),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
  });
}
