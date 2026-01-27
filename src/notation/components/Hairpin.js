/**
 * Hairpin (crescendo/decrescendo) renderer.
 * Creates SVG group with two angled lines forming a wedge shape.
 */

import { createGroup, createPath } from 'notation/lib/svgHelpers';

const HAIRPIN_HEIGHT = 12;
const HALF_HEIGHT = HAIRPIN_HEIGHT / 2;

/**
 * Render a hairpin wedge.
 * @param {Object} params
 * @param {string} params.type - "crescendo" or "decrescendo"
 * @param {number} params.startX - Start horizontal position
 * @param {number} params.endX - End horizontal position
 * @param {number} params.y - Vertical center position
 * @returns {SVGGElement}
 */
export function renderHairpin({ type, startX, endX, y }) {
  const width = endX - startX;
  const group = createGroup(`hairpin hairpin-${type}`, {
    transform: `translate(${startX}, ${y})`,
  });

  let d1;
  let d2;

  if (type === 'crescendo') {
    // < shape: vertex on left, opens to right
    d1 = `M 0,${HALF_HEIGHT} L ${width},0`;
    d2 = `M 0,${HALF_HEIGHT} L ${width},${HAIRPIN_HEIGHT}`;
  } else {
    // > shape: opens on left, vertex on right
    d1 = `M 0,0 L ${width},${HALF_HEIGHT}`;
    d2 = `M 0,${HAIRPIN_HEIGHT} L ${width},${HALF_HEIGHT}`;
  }

  group.appendChild(
    createPath(d1, {
      class: 'hairpin-line',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
    })
  );

  group.appendChild(
    createPath(d2, {
      class: 'hairpin-line',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
    })
  );

  return group;
}
