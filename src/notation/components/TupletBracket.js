/**
 * Tuplet bracket and number renderer.
 * Creates SVG elements for tuplet bracket (horizontal line with ticks) and number.
 */

import { createGroup, createLine, createText } from 'notation/lib/svgHelpers';

const TICK_HEIGHT = 4;
const NUMBER_OFFSET = 6;

/**
 * Render a tuplet bracket and number.
 * @param {Object} params
 * @param {number} params.actual - The actual count (displayed number)
 * @param {number} params.startX - Left edge x position
 * @param {number} params.endX - Right edge x position
 * @param {number} params.y - Y position (above or below notes)
 * @param {boolean} params.above - If true, render above; false, below
 * @param {boolean} params.showBracket - If true, show bracket lines
 * @returns {SVGGElement}
 */
export function renderTupletBracket({ actual, startX, endX, y, above, showBracket }) {
  const group = createGroup('tuplet-bracket-container');

  const midX = (startX + endX) / 2;
  const tickDir = above ? 1 : -1;
  const numberY = above ? y - NUMBER_OFFSET : y + NUMBER_OFFSET + 4;

  if (showBracket) {
    const bracketGroup = createGroup('tuplet-bracket');

    // Horizontal line
    bracketGroup.appendChild(
      createLine(startX, y, endX, y, {
        class: 'tuplet-bracket-line',
        stroke: 'currentColor',
        'stroke-width': '1',
      })
    );

    // Left tick
    bracketGroup.appendChild(
      createLine(startX, y, startX, y + TICK_HEIGHT * tickDir, {
        class: 'tuplet-bracket-tick-left',
        stroke: 'currentColor',
        'stroke-width': '1',
      })
    );

    // Right tick
    bracketGroup.appendChild(
      createLine(endX, y, endX, y + TICK_HEIGHT * tickDir, {
        class: 'tuplet-bracket-tick-right',
        stroke: 'currentColor',
        'stroke-width': '1',
      })
    );

    group.appendChild(bracketGroup);
  }

  // Number (always shown)
  group.appendChild(
    createText(String(actual), midX, numberY, {
      class: 'tuplet-number',
      'text-anchor': 'middle',
      'font-size': '12',
      fill: 'currentColor',
    })
  );

  return group;
}
