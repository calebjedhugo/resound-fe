/**
 * Accidental symbol renderer.
 * Creates SVG group for sharp, flat, or natural symbols.
 */

import { createGroup, createText } from 'notation/lib/svgHelpers';

// Unicode music symbols
const SYMBOLS = {
  sharp: '\u266F', // ♯
  flat: '\u266D', // ♭
  natural: '\u266E', // ♮
};

/**
 * Create an SVG group representing an accidental symbol.
 * @param {string} type - "sharp", "flat", or "natural"
 * @returns {SVGGElement}
 */
export function createAccidental(type) {
  const symbol = SYMBOLS[type];
  if (!symbol) {
    throw new Error(`Unknown accidental type: "${type}"`);
  }

  const group = createGroup(`accidental ${type}`);
  const textEl = createText(symbol, 0, 0, {
    'font-size': '18',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    fill: 'currentColor',
  });
  group.appendChild(textEl);

  return group;
}
