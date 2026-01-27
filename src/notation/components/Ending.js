/**
 * Volta ending (bracket) renderer.
 * Creates SVG elements for volta brackets with ending numbers.
 */

import { createGroup, createPath, createText } from 'notation/lib/svgHelpers';

const BRACKET_Y = -15;
const TICK_HEIGHT = 10;
const TEXT_OFFSET_X = 5;
const TEXT_Y = -18;

/**
 * Render a volta ending bracket.
 * @param {Object} params
 * @param {number} params.number - Ending number (1, 2, etc.)
 * @param {number} params.startX - Start X position
 * @param {number} params.endX - End X position
 * @param {boolean} params.open - True for open bracket (no end tick)
 * @returns {SVGGElement}
 */
export function renderEnding({ number, startX, endX, open }) {
  const group = createGroup(`ending ending-${number}`, {
    'data-ending-number': String(number),
  });

  const tickBottom = BRACKET_Y + TICK_HEIGHT;
  let d;

  if (open) {
    // Open bracket: tick at start, horizontal line, no end tick
    d = `M${startX},${tickBottom} L${startX},${BRACKET_Y} L${endX},${BRACKET_Y}`;
  } else {
    // Closed bracket: tick at start, horizontal line, tick at end
    d = `M${startX},${tickBottom} L${startX},${BRACKET_Y} L${endX},${BRACKET_Y} L${endX},${tickBottom}`;
  }

  const bracketClass = open ? 'ending-bracket ending-bracket-open' : 'ending-bracket';
  group.appendChild(
    createPath(d, {
      class: bracketClass,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
    })
  );

  group.appendChild(
    createText(`${number}.`, startX + TEXT_OFFSET_X, TEXT_Y, {
      class: 'ending-number',
      'font-size': '12',
      'font-style': 'italic',
      fill: 'currentColor',
    })
  );

  return group;
}
