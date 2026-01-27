/**
 * Beam renderer.
 * Creates SVG beam paths connecting stems of grouped notes.
 */

import { createGroup, createPath } from 'notation/lib/svgHelpers';

const HEAD_RX = 6;
const STEM_LENGTH = 35;
const BEAM_THICKNESS = 4;
const BEAM_GAP = 4;

/**
 * Compute the stem end Y for a note.
 */
function stemEndY(noteY, stemDown) {
  return stemDown ? noteY + STEM_LENGTH : noteY - STEM_LENGTH;
}

/**
 * Compute the stem X for a note.
 */
function stemX(noteX, stemDown) {
  return stemDown ? noteX - HEAD_RX : noteX + HEAD_RX;
}

/**
 * Draw a beam path (filled trapezoid) between two stem endpoints at a given level.
 * @param {number} x1 - First stem X
 * @param {number} y1 - First stem end Y
 * @param {number} x2 - Last stem X
 * @param {number} y2 - Last stem end Y
 * @param {number} level - Beam level (0 = primary)
 * @param {boolean} stemDown
 */
function beamPath(x1, y1, x2, y2, level, stemDown) {
  const dir = stemDown ? 1 : -1;
  const offset = level * (BEAM_THICKNESS + BEAM_GAP) * dir;
  const topY1 = y1 + offset;
  const topY2 = y2 + offset;
  const botY1 = topY1 + BEAM_THICKNESS * dir;
  const botY2 = topY2 + BEAM_THICKNESS * dir;

  return `M ${x1} ${topY1} L ${x2} ${topY2} L ${x2} ${botY2} L ${x1} ${botY1} Z`;
}

/**
 * Create SVG beam elements for a group of notes.
 *
 * @param {Object} params
 * @param {Array<{x: number, y: number, beams: number}>} params.notes
 * @param {boolean} params.stemDown
 * @returns {SVGGElement} Group containing beam path elements
 */
export function createBeams({ notes, stemDown }) {
  const group = createGroup('beams');

  if (notes.length < 2) return group;

  const firstNote = notes[0];
  const lastNote = notes[notes.length - 1];
  const x1 = stemX(firstNote.x, stemDown);
  const y1 = stemEndY(firstNote.y, stemDown);
  const x2 = stemX(lastNote.x, stemDown);
  const y2 = stemEndY(lastNote.y, stemDown);

  // Determine how many full beam levels span all notes
  const minBeams = Math.min(...notes.map((n) => n.beams));

  // Draw full beams (levels 0 to minBeams-1)
  for (let level = 0; level < minBeams; level++) {
    group.appendChild(
      createPath(beamPath(x1, y1, x2, y2, level, stemDown), {
        class: 'beam',
        fill: 'currentColor',
      })
    );
  }

  // Draw partial beams for higher levels
  for (let level = minBeams; level < Math.max(...notes.map((n) => n.beams)); level++) {
    // Find consecutive runs of notes with beams > level
    let runStart = -1;
    for (let i = 0; i <= notes.length; i++) {
      const hasBeam = i < notes.length && notes[i].beams > level;
      if (hasBeam && runStart < 0) {
        runStart = i;
      } else if (!hasBeam && runStart >= 0) {
        // End of run
        if (i - runStart >= 2) {
          // Partial beam spanning the run
          const sx1 = stemX(notes[runStart].x, stemDown);
          const sy1 = stemEndY(notes[runStart].y, stemDown);
          const sx2 = stemX(notes[i - 1].x, stemDown);
          const sy2 = stemEndY(notes[i - 1].y, stemDown);
          group.appendChild(
            createPath(beamPath(sx1, sy1, sx2, sy2, level, stemDown), {
              class: 'beam',
              fill: 'currentColor',
            })
          );
        } else {
          // Single note with extra beam — draw a stub
          const noteIdx = runStart;
          const nx = stemX(notes[noteIdx].x, stemDown);
          const ny = stemEndY(notes[noteIdx].y, stemDown);
          // Stub extends toward the nearest neighbor
          const neighborIdx = noteIdx > 0 ? noteIdx - 1 : noteIdx + 1;
          const stubX = nx + (stemX(notes[neighborIdx].x, stemDown) - nx) * 0.4;
          const stubY = ny + (stemEndY(notes[neighborIdx].y, stemDown) - ny) * 0.4;
          group.appendChild(
            createPath(beamPath(nx, ny, stubX, stubY, level, stemDown), {
              class: 'beam',
              fill: 'currentColor',
            })
          );
        }
        runStart = -1;
      }
    }
  }

  return group;
}
