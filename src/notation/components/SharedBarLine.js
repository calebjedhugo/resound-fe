/**
 * Shared bar line renderer.
 * Creates a vertical line spanning across multiple staves in a staff group.
 */

import { createGroup, createLine } from 'notation/lib/svgHelpers';

/**
 * Create an SVG group representing a shared bar line spanning multiple staves.
 * @param {Object} options
 * @param {number} options.x - Horizontal position
 * @param {number} options.topY - Top Y coordinate (top line of first staff)
 * @param {number} options.bottomY - Bottom Y coordinate (bottom line of last staff)
 * @returns {SVGGElement}
 */
export function createSharedBarLine({ x, topY, bottomY }) {
  const group = createGroup('shared-bar-line');
  group.appendChild(
    createLine(x, topY, x, bottomY, {
      stroke: 'currentColor',
      'stroke-width': '1',
    })
  );
  return group;
}
