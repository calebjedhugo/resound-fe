/**
 * Navigation marker renderer.
 * Creates SVG elements for segno, coda symbols, and text directives
 * (D.C., D.S., Fine, To Coda, etc.).
 */

import { createGroup, createPath, createText } from 'notation/lib/svgHelpers';

const SYMBOL_Y = -25;
const TEXT_Y = -20;

const TEXT_MAP = {
  dc: 'D.C.',
  ds: 'D.S.',
  'dc-al-fine': 'D.C. al Fine',
  'dc-al-coda': 'D.C. al Coda',
  'ds-al-fine': 'D.S. al Fine',
  'ds-al-coda': 'D.S. al Coda',
  fine: 'Fine',
  'to-coda': 'To Coda',
};

// Simplified segno glyph path (S-shape with diagonal and dots)
const SEGNO_PATH =
  'M-5,-12 C-5,-6 0,-4 0,0 C0,4 -5,6 -5,12 M5,-12 C5,-6 0,-4 0,0 C0,4 5,6 5,12 M-8,-8 L8,8 M-3,-3 A1.5,1.5 0 1,1 -3,-3.01 M3,3 A1.5,1.5 0 1,1 3,3.01';

// Simplified coda glyph path (circle with crosshairs)
const CODA_PATH = 'M0,-9 A9,9 0 1,1 0,9 A9,9 0 1,1 0,-9 M0,-12 L0,12 M-12,0 L12,0';

const SYMBOL_TYPES = new Set(['segno', 'coda']);

/**
 * Render a navigation marker.
 * @param {Object} params
 * @param {string} params.type - Navigation type (segno, coda, dc, ds, fine, etc.)
 * @param {number} params.x - Horizontal position
 * @returns {SVGGElement}
 */
export function renderNavigationMarker({ type, x }) {
  if (SYMBOL_TYPES.has(type)) {
    return renderSymbol(type, x);
  }
  return renderTextDirective(type, x);
}

function renderSymbol(type, x) {
  const group = createGroup(`navigation navigation-${type}`, {
    transform: `translate(${x}, ${SYMBOL_Y})`,
  });

  const pathD = type === 'segno' ? SEGNO_PATH : CODA_PATH;
  group.appendChild(
    createPath(pathD, {
      class: 'navigation-symbol',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
    })
  );

  return group;
}

function renderTextDirective(type, x) {
  const displayText = TEXT_MAP[type] || type;
  const group = createGroup(`navigation navigation-text navigation-${type}`, {
    transform: `translate(${x}, ${TEXT_Y})`,
  });

  group.appendChild(
    createText(displayText, 0, 0, {
      'font-style': 'italic',
      'text-anchor': 'end',
      fill: 'currentColor',
    })
  );

  return group;
}
