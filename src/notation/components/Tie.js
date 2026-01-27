/**
 * Tie arc renderer.
 * Creates SVG path elements for tie arcs between noteheads.
 */

import { createPath } from 'notation/lib/svgHelpers';

const NOTEHEAD_OFFSET = 5;
const MIN_ARC_HEIGHT = 8;
const ARC_HEIGHT_RATIO = 0.2;

/**
 * Create an SVG path element for a tie arc.
 * @param {Object} params
 * @param {number} params.x1 - Start notehead X
 * @param {number} params.y1 - Start notehead Y
 * @param {number} params.x2 - End notehead X
 * @param {number} params.y2 - End notehead Y
 * @param {string} params.direction - "above" or "below"
 * @returns {SVGPathElement}
 */
export function createTieArc({ x1, y1, x2, y2, direction }) {
  const dir = direction === 'below' ? 1 : -1;
  const startY = y1 + NOTEHEAD_OFFSET * dir;
  const endY = y2 + NOTEHEAD_OFFSET * dir;

  const horizontalDistance = Math.abs(x2 - x1);
  const arcHeight = Math.max(MIN_ARC_HEIGHT, horizontalDistance * ARC_HEIGHT_RATIO);

  const midX1 = x1 + (x2 - x1) * 0.33;
  const midX2 = x1 + (x2 - x1) * 0.67;
  const cpY1 = startY + arcHeight * dir;
  const cpY2 = endY + arcHeight * dir;

  const d = `M ${x1} ${startY} C ${midX1} ${cpY1} ${midX2} ${cpY2} ${x2} ${endY}`;

  return createPath(d, {
    class: 'tie',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
  });
}
