/**
 * Expression text renderer.
 * Creates SVG elements for expression markings (dolce, cantabile, etc.).
 */

import { createGroup, createText } from 'notation/lib/svgHelpers';

const EXPRESSION_Y = -12;

/**
 * Render an expression text marking.
 * @param {Object} params
 * @param {string} params.text - Expression text
 * @param {number} params.x - Horizontal position
 * @returns {SVGGElement}
 */
export function renderExpressionText({ text, x }) {
  const group = createGroup('expression', {
    transform: `translate(${x}, ${EXPRESSION_Y})`,
  });

  group.appendChild(
    createText(text, 0, 0, {
      'font-style': 'italic',
      'font-size': '11',
      fill: 'currentColor',
    })
  );

  return group;
}
