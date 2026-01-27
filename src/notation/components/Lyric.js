/**
 * Lyric renderer.
 * Creates SVG elements for per-note lyrics, including melisma underscores.
 */

import { createGroup, createText, createLine } from 'notation/lib/svgHelpers';

const LYRIC_Y = 115;
const MELISMA_Y = 120;

/**
 * Render a single lyric syllable below a note.
 * @param {Object} params
 * @param {string} params.text - Lyric text
 * @param {number} params.x - Horizontal position (note center)
 * @returns {SVGGElement}
 */
export function renderLyric({ text, x }) {
  const group = createGroup('lyric', {
    transform: `translate(${x}, ${LYRIC_Y})`,
  });

  group.appendChild(
    createText(text, 0, 0, {
      'text-anchor': 'middle',
      'font-size': '11',
      fill: 'currentColor',
    })
  );

  return group;
}

/**
 * Render a melisma underscore line spanning multiple notes.
 * @param {Object} params
 * @param {number} params.startX - Start X position
 * @param {number} params.endX - End X position
 * @returns {SVGLineElement}
 */
export function renderMelisma({ startX, endX }) {
  return createLine(startX, MELISMA_Y, endX, MELISMA_Y, {
    class: 'lyric-melisma',
    stroke: 'currentColor',
    'stroke-width': '1',
  });
}
