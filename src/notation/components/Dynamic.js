/**
 * Point dynamic renderer.
 * Creates SVG group for a dynamic marking (pp, mf, ff, etc.).
 */

import { createGroup, createText } from 'notation/lib/svgHelpers';

/**
 * Render a point dynamic marking.
 * @param {Object} params
 * @param {string} params.dynamic - Dynamic value (e.g. "f", "mf", "pp")
 * @param {number} params.x - Horizontal position (centered on this x)
 * @param {number} params.y - Vertical position
 * @returns {SVGGElement}
 */
export function renderDynamic({ dynamic, x, y }) {
  const group = createGroup('dynamic', {
    'data-dynamic': dynamic,
    transform: `translate(${x}, ${y})`,
  });

  group.appendChild(
    createText(dynamic, 0, 0, {
      class: 'dynamic-text',
      'text-anchor': 'middle',
      'font-style': 'italic',
      'font-size': '14',
    })
  );

  return group;
}
