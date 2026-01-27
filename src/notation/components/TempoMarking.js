/**
 * Tempo marking renderer.
 * Creates SVG elements for tempo text, metronome markings, and gradual tempo changes.
 */

import { createGroup, createText, createLine } from 'notation/lib/svgHelpers';

const TEMPO_Y = -40;
const TEMPO_CHANGE_Y = -25;

const BEAT_SYMBOL_MAP = {
  '1/4': '\u2669', // quarter note
  '1/8': '\u266A', // eighth note
  '1/2': '\uD834\uDD5E', // half note (fallback to text)
};

const CHANGE_ABBREVIATION = {
  ritardando: 'rit.',
  accelerando: 'accel.',
  'a-tempo': 'a tempo',
};

const CHANGE_CLASS_MAP = {
  ritardando: 'rit',
  accelerando: 'accel',
  'a-tempo': 'a-tempo',
};

/**
 * Render a tempo marking (text and/or metronome).
 * @param {Object} params
 * @param {Object} params.tempo - Tempo data { bpm, beat, text }
 * @param {number} params.x - Horizontal position
 * @returns {SVGGElement}
 */
export function renderTempoMarking({ tempo, x }) {
  const group = createGroup('tempo-marking', {
    transform: `translate(${x}, ${TEMPO_Y})`,
  });

  let offsetX = 0;

  if (tempo.text) {
    group.appendChild(
      createText(tempo.text, 0, 0, {
        class: 'tempo-text',
        'font-weight': 'bold',
        'font-size': '14',
        fill: 'currentColor',
      })
    );
    offsetX = tempo.text.length * 8 + 5;
  }

  if (tempo.bpm) {
    const beat = tempo.beat || '1/4';
    const symbol = BEAT_SYMBOL_MAP[beat] || beat;
    const metText = tempo.text ? `(${symbol} = ${tempo.bpm})` : `${symbol} = ${tempo.bpm}`;

    group.appendChild(
      createText(metText, offsetX, 0, {
        class: 'tempo-metronome',
        'font-weight': 'bold',
        'font-size': '14',
        fill: 'currentColor',
      })
    );
  }

  return group;
}

/**
 * Render a gradual tempo change (rit., accel., a tempo).
 * @param {Object} params
 * @param {string} params.type - "ritardando", "accelerando", or "a-tempo"
 * @param {number} params.x - Horizontal position
 * @returns {SVGGElement}
 */
export function renderTempoChange({ type, x }) {
  const cssClass = CHANGE_CLASS_MAP[type] || type;
  const group = createGroup(`tempo-change tempo-change-${cssClass}`, {
    transform: `translate(${x}, ${TEMPO_CHANGE_Y})`,
  });

  const abbreviation = CHANGE_ABBREVIATION[type] || type;

  group.appendChild(
    createText(abbreviation, 0, 0, {
      'font-style': 'italic',
      'font-size': '12',
      fill: 'currentColor',
    })
  );

  // Dashes for rit. and accel. (not for a tempo)
  if (type !== 'a-tempo') {
    const dashStartX = abbreviation.length * 7 + 5;
    group.appendChild(
      createLine(dashStartX, 0, dashStartX + 70, 0, {
        class: 'tempo-change-dashes',
        stroke: 'currentColor',
        'stroke-dasharray': '5,5',
        'stroke-width': '1',
      })
    );
  }

  return group;
}
