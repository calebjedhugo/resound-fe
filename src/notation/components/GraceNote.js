/**
 * Grace note renderer.
 * Creates SVG elements for grace notes (acciaccatura and appoggiatura).
 */

import { createGroup, createEllipse, createLine, createPath } from 'notation/lib/svgHelpers';
import { pitchToStaffY, parsePitch } from 'notation/lib/notePositions';
import { createAccidental } from 'notation/components/Accidental';

const GRACE_SCALE = 0.6;
const GRACE_SPACING = 15;
const HEAD_RX = 6;
const HEAD_RY = 5;
const STEM_LENGTH = 30;
const MIDDLE_LINE_Y = 50;
const ACCIDENTAL_OFFSET = 14;

const ACCIDENTAL_TYPE_MAP = {
  '#': 'sharp',
  b: 'flat',
};

/**
 * Normalize grace input to an array.
 * @param {Object|Array} grace
 * @returns {Array}
 */
function normalizeGrace(grace) {
  if (Array.isArray(grace)) return grace;
  return [grace];
}

/**
 * Render grace notes before a main note.
 * @param {Object} params
 * @param {Object|Array} params.grace - Grace note(s)
 * @param {number} params.mainX - Main note x position
 * @param {number} params.mainY - Main note y position
 * @param {string} params.clef - Clef for Y positioning
 * @returns {{ element: SVGGElement, width: number }}
 */
export function renderGraceNotes({ grace, mainX, mainY, clef }) {
  const notes = normalizeGrace(grace);
  const isRun = notes.length > 1;

  const containerClass = isRun ? 'grace-note-group' : 'grace-notes';
  const container = createGroup(containerClass);

  const graceNoteData = [];

  for (let i = 0; i < notes.length; i += 1) {
    const gn = notes[i];
    const type = gn.type || 'acciaccatura';
    const noteY = pitchToStaffY(gn.pitch, clef);
    const noteX = mainX - (notes.length - i) * GRACE_SPACING;

    const graceGroup = createGroup(`grace-note grace-note-${type}`, {
      transform: `translate(${noteX}, ${noteY}) scale(${GRACE_SCALE})`,
    });

    // Note head (always filled)
    graceGroup.appendChild(
      createEllipse(0, 0, HEAD_RX, HEAD_RY, {
        class: 'note-head',
        fill: 'currentColor',
        stroke: 'currentColor',
      })
    );

    // Stem
    const stemDown = noteY <= MIDDLE_LINE_Y;
    const stemX = stemDown ? -HEAD_RX : HEAD_RX;
    const stemY2 = stemDown ? STEM_LENGTH : -STEM_LENGTH;
    graceGroup.appendChild(
      createLine(stemX, 0, stemX, stemY2, {
        class: 'note-stem',
        stroke: 'currentColor',
      })
    );

    // Slash for acciaccatura
    if (type === 'acciaccatura') {
      const slashY1 = stemDown ? STEM_LENGTH * 0.3 : -STEM_LENGTH * 0.3;
      const slashY2 = stemDown ? STEM_LENGTH * 0.7 : -STEM_LENGTH * 0.7;
      graceGroup.appendChild(
        createLine(stemX - 4, slashY1, stemX + 4, slashY2, {
          class: 'grace-slash',
          stroke: 'currentColor',
          'stroke-width': '1.5',
        })
      );
    }

    // Accidental
    const { accidental } = parsePitch(gn.pitch);
    const accType = ACCIDENTAL_TYPE_MAP[accidental];
    if (accType) {
      const accGroup = createAccidental(accType);
      accGroup.setAttribute('transform', `translate(${-ACCIDENTAL_OFFSET}, 0)`);
      graceGroup.appendChild(accGroup);
    }

    container.appendChild(graceGroup);
    graceNoteData.push({ x: noteX, y: noteY });
  }

  // Slur from last grace note to main note
  const lastGrace = graceNoteData[graceNoteData.length - 1];
  const dir = lastGrace.y <= MIDDLE_LINE_Y ? -1 : 1;
  const slurStartX = lastGrace.x + HEAD_RX * GRACE_SCALE;
  const slurStartY = lastGrace.y + HEAD_RY * dir;
  const slurEndY = mainY + HEAD_RY * dir;
  const cpY = Math.min(slurStartY, slurEndY) + dir * -8;
  const cpX = (slurStartX + mainX) / 2;

  container.appendChild(
    createPath(`M ${slurStartX} ${slurStartY} Q ${cpX} ${cpY} ${mainX} ${slurEndY}`, {
      class: 'grace-slur',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1',
    })
  );

  return {
    element: container,
    width: notes.length * GRACE_SPACING,
  };
}
