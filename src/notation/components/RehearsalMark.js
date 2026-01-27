/**
 * Rehearsal mark renderer.
 * Creates SVG elements for boxed rehearsal letters/numbers.
 */

import { createGroup, createText, createSvgElement } from 'notation/lib/svgHelpers';

const REHEARSAL_Y = -60;
const BOX_PADDING = 4;
const FONT_SIZE = 18;
const BOX_HEIGHT = 22;

/**
 * Render a rehearsal mark with a box around it.
 * @param {Object} params
 * @param {string} params.label - Rehearsal mark text (letter or number)
 * @param {number} params.x - Horizontal position
 * @returns {SVGGElement}
 */
export function renderRehearsalMark({ label, x }) {
  const group = createGroup('rehearsal-mark', {
    transform: `translate(${x}, ${REHEARSAL_Y})`,
  });

  const boxWidth = label.length * 12 + BOX_PADDING * 2;

  group.appendChild(
    createSvgElement('rect', {
      class: 'rehearsal-box',
      x: -BOX_PADDING,
      y: -FONT_SIZE + 2,
      width: boxWidth,
      height: BOX_HEIGHT,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
    })
  );

  group.appendChild(
    createText(label, 0, 0, {
      'font-weight': 'bold',
      'font-size': String(FONT_SIZE),
      fill: 'currentColor',
    })
  );

  return group;
}
