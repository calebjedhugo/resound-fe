/**
 * Brace renderer.
 * Creates a curly brace SVG path for grouping staves (e.g., grand staff).
 */

import { createGroup, createPath } from 'notation/lib/svgHelpers';

const DEFAULT_HEIGHT = 200;

// Brace path designed for a unit height of 1, scaled to match requested height.
// This is a classic curly brace shape: two symmetric curves meeting at a center point.
const BRACE_PATH = 'M 0,0 C 4,0 8,2 8,8 C 8,14 4,18 0,24 C 4,18 8,22 8,28 C 8,34 4,36 0,36';

// The path above has a natural height of 36 units
const PATH_HEIGHT = 36;

/**
 * Create an SVG group representing a curly brace.
 * @param {Object} options
 * @param {number} [options.height=200] - Total height the brace should span
 * @returns {SVGGElement}
 */
export function createBrace({ height = DEFAULT_HEIGHT } = {}) {
  const group = createGroup('brace');

  const scaleY = height / PATH_HEIGHT;
  const scaleX = Math.max(1, scaleY * 0.3);

  const path = createPath(BRACE_PATH, {
    fill: 'currentColor',
    stroke: 'none',
  });

  path.setAttribute('transform', `scale(${scaleX}, ${scaleY})`);

  group.appendChild(path);
  return group;
}
