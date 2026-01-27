/**
 * Staff line renderer.
 * Creates 5 horizontal staff lines with 20px spacing (80px total height).
 */

import { createGroup, createLine } from 'notation/lib/svgHelpers';

const LINE_COUNT = 5;
const LINE_SPACING = 20;

/**
 * Create a group of 5 staff lines.
 * Lines are at y = 0, 20, 40, 60, 80 within the group.
 * @param {number} width - Width of staff lines in pixels
 * @returns {SVGGElement}
 */
export function createStaffLines(width) {
  const group = createGroup('staff-lines');

  for (let i = 0; i < LINE_COUNT; i++) {
    const y = i * LINE_SPACING;
    group.appendChild(createLine(0, y, width, y, { class: 'staff-line' }));
  }

  return group;
}
