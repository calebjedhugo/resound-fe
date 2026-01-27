/**
 * Time signature renderer.
 * Creates SVG group with stacked numerator and denominator.
 */

import { createGroup, createText } from 'notation/lib/svgHelpers';

// Vertical centers of upper and lower staff halves (staff-group coords)
const NUMERATOR_Y = 30;
const DENOMINATOR_Y = 70;

// Horizontal center within the 25px time signature width
const CENTER_X = 12;

/**
 * Create an SVG group representing a time signature.
 * @param {[number, number]} timeSignature - [beats, beatValue]
 * @returns {SVGGElement}
 */
export function createTimeSignature(timeSignature) {
  const [beats, beatValue] = timeSignature;
  const group = createGroup('time-signature');

  const numText = createText(String(beats), CENTER_X, NUMERATOR_Y, {
    class: 'time-numerator',
    'font-size': '24',
    'font-weight': 'bold',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    fill: 'currentColor',
  });
  group.appendChild(numText);

  const denomText = createText(String(beatValue), CENTER_X, DENOMINATOR_Y, {
    class: 'time-denominator',
    'font-size': '24',
    'font-weight': 'bold',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    fill: 'currentColor',
  });
  group.appendChild(denomText);

  return group;
}
