/**
 * Repeat barline renderer.
 * Creates SVG elements for repeat-start, repeat-end, repeat-both, and final barlines.
 */

import { createGroup, createLine, createSvgElement } from 'notation/lib/svgHelpers';

const TOP_LINE_Y = 10;
const BOTTOM_LINE_Y = 90;
const DOT_Y_UPPER = 40;
const DOT_Y_LOWER = 60;
const DOT_RADIUS = 2.5;
const LINE_GAP = 5;
const DOT_GAP = 5;
const THICK_WIDTH = 3;
const THIN_WIDTH = 1;

function createDot(cx, cy) {
  return createSvgElement('circle', {
    class: 'barline-dot',
    cx,
    cy,
    r: DOT_RADIUS,
    fill: 'currentColor',
  });
}

/**
 * Render a repeat barline.
 * @param {Object} params
 * @param {string} params.type - "repeat-start", "repeat-end", "repeat-both", or "final"
 * @param {number} params.x - Horizontal position
 * @returns {SVGGElement}
 */
export function renderRepeatBarline({ type, x }) {
  const group = createGroup(`barline barline-${type}`, {
    transform: `translate(${x}, 0)`,
  });

  if (type === 'repeat-start') {
    // thick-thin + dots on right
    group.appendChild(
      createLine(0, TOP_LINE_Y, 0, BOTTOM_LINE_Y, {
        class: 'barline-thick',
        stroke: 'currentColor',
        'stroke-width': THICK_WIDTH,
      })
    );
    group.appendChild(
      createLine(LINE_GAP, TOP_LINE_Y, LINE_GAP, BOTTOM_LINE_Y, {
        class: 'barline-thin',
        stroke: 'currentColor',
        'stroke-width': THIN_WIDTH,
      })
    );
    group.appendChild(createDot(LINE_GAP + DOT_GAP, DOT_Y_UPPER));
    group.appendChild(createDot(LINE_GAP + DOT_GAP, DOT_Y_LOWER));
  } else if (type === 'repeat-end') {
    // dots on left, thin-thick
    group.appendChild(createDot(-LINE_GAP - DOT_GAP, DOT_Y_UPPER));
    group.appendChild(createDot(-LINE_GAP - DOT_GAP, DOT_Y_LOWER));
    group.appendChild(
      createLine(-LINE_GAP, TOP_LINE_Y, -LINE_GAP, BOTTOM_LINE_Y, {
        class: 'barline-thin',
        stroke: 'currentColor',
        'stroke-width': THIN_WIDTH,
      })
    );
    group.appendChild(
      createLine(0, TOP_LINE_Y, 0, BOTTOM_LINE_Y, {
        class: 'barline-thick',
        stroke: 'currentColor',
        'stroke-width': THICK_WIDTH,
      })
    );
  } else if (type === 'repeat-both') {
    // dots-thin-thick-thin-dots
    group.appendChild(createDot(-LINE_GAP - DOT_GAP, DOT_Y_UPPER));
    group.appendChild(createDot(-LINE_GAP - DOT_GAP, DOT_Y_LOWER));
    group.appendChild(
      createLine(-LINE_GAP, TOP_LINE_Y, -LINE_GAP, BOTTOM_LINE_Y, {
        class: 'barline-thin',
        stroke: 'currentColor',
        'stroke-width': THIN_WIDTH,
      })
    );
    group.appendChild(
      createLine(0, TOP_LINE_Y, 0, BOTTOM_LINE_Y, {
        class: 'barline-thick',
        stroke: 'currentColor',
        'stroke-width': THICK_WIDTH,
      })
    );
    group.appendChild(
      createLine(LINE_GAP, TOP_LINE_Y, LINE_GAP, BOTTOM_LINE_Y, {
        class: 'barline-thin',
        stroke: 'currentColor',
        'stroke-width': THIN_WIDTH,
      })
    );
    group.appendChild(createDot(LINE_GAP + DOT_GAP, DOT_Y_UPPER));
    group.appendChild(createDot(LINE_GAP + DOT_GAP, DOT_Y_LOWER));
  } else if (type === 'final') {
    // thin-thick (no dots)
    group.appendChild(
      createLine(-LINE_GAP, TOP_LINE_Y, -LINE_GAP, BOTTOM_LINE_Y, {
        class: 'barline-thin',
        stroke: 'currentColor',
        'stroke-width': THIN_WIDTH,
      })
    );
    group.appendChild(
      createLine(0, TOP_LINE_Y, 0, BOTTOM_LINE_Y, {
        class: 'barline-thick',
        stroke: 'currentColor',
        'stroke-width': THICK_WIDTH,
      })
    );
  }

  return group;
}
