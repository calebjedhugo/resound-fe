/**
 * Note renderer.
 * Creates SVG group for a single note with head, stem, and flags.
 */

import { createGroup, createEllipse, createLine, createPath } from 'notation/lib/svgHelpers';
import { pitchToStaffY } from 'notation/lib/notePositions';
import { getDurationInfo } from 'notation/lib/durationSymbols';

const MIDDLE_LINE_Y = 50;
const HEAD_RX = 6;
const HEAD_RY = 5;
const STEM_LENGTH = 35;

/**
 * Create an SVG group representing a single note.
 * @param {Object} params
 * @param {string} params.pitch - Scientific pitch notation (e.g. "C4")
 * @param {string} params.length - Fraction string (e.g. "1/4")
 * @param {number} params.x - Horizontal position
 * @param {string} params.clef - Clef for Y positioning
 * @param {boolean} [params.beamed] - If true, suppress flags (note is beamed)
 * @param {boolean} [params.stemDown] - Override auto stem direction
 * @returns {SVGGElement}
 */
export function createNote({ pitch, length, x, clef, beamed, stemDown: stemDownOverride }) {
  const y = pitchToStaffY(pitch, clef);
  const info = getDurationInfo(length);

  const group = createGroup(`note ${info.cssClass}`, {
    transform: `translate(${x}, ${y})`,
  });

  // Note head
  const fill = info.filledHead ? 'currentColor' : 'none';
  const head = createEllipse(0, 0, HEAD_RX, HEAD_RY, {
    class: 'note-head',
    fill,
    stroke: 'currentColor',
  });
  group.appendChild(head);

  // Stem
  if (info.hasStem) {
    const stemDown = stemDownOverride !== undefined ? stemDownOverride : y <= MIDDLE_LINE_Y;
    const stemX = stemDown ? -HEAD_RX : HEAD_RX;
    const stemY1 = 0;
    const stemY2 = stemDown ? STEM_LENGTH : -STEM_LENGTH;

    group.appendChild(
      createLine(stemX, stemY1, stemX, stemY2, { class: 'note-stem', stroke: 'currentColor' })
    );

    // Flags (suppressed when beamed — beams replace flags)
    if (beamed) return group;
    for (let i = 0; i < info.flags; i++) {
      const flagOffset = i * 8;
      const flagPath = stemDown
        ? `M ${stemX} ${stemY2 - flagOffset} c 8 4 12 12 8 20`
        : `M ${stemX} ${stemY2 + flagOffset} c 8 -4 12 -12 8 -20`;

      group.appendChild(createPath(flagPath, { class: 'note-flag', fill: 'currentColor' }));
    }
  }

  return group;
}
