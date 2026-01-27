/**
 * Articulation renderer.
 * Creates SVG elements for articulation marks (staccato, accent, fermata, etc.).
 */

import { createGroup, createSvgElement, createLine, createPath } from 'notation/lib/svgHelpers';

const NOTEHEAD_GAP = 4;
const STACK_GAP = 3;

const VALID_ARTICULATIONS = [
  'staccato',
  'staccatissimo',
  'accent',
  'marcato',
  'tenuto',
  'fermata',
  'portato',
];

// Stacking priority: lower number = closer to notehead
const STACK_PRIORITY = {
  staccato: 1,
  staccatissimo: 1,
  tenuto: 1,
  portato: 1,
  accent: 2,
  marcato: 2,
  fermata: 3,
};

/**
 * Create SVG elements for a single articulation symbol.
 * @param {string} type - Articulation type
 * @param {boolean} below - True if rendering below the notehead
 * @returns {{ element: SVGElement, height: number }}
 */
function createArticulationSymbol(type, below) {
  switch (type) {
    case 'staccato': {
      const el = createSvgElement('circle', {
        cx: 0,
        cy: 0,
        r: 1.5,
        fill: 'currentColor',
      });
      return { element: el, height: 3 };
    }
    case 'staccatissimo': {
      // Wedge pointing toward the notehead
      const d = below ? 'M -1.5 2.5 L 0 -2.5 L 1.5 2.5 Z' : 'M -1.5 -2.5 L 0 2.5 L 1.5 -2.5 Z';
      const el = createPath(d, { fill: 'currentColor' });
      return { element: el, height: 5 };
    }
    case 'accent': {
      const el = createPath('M -4 -3 L 4 0 L -4 3', {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.5',
      });
      return { element: el, height: 6 };
    }
    case 'marcato': {
      // Caret pointing away from notehead
      const d = below ? 'M -3 -3 L 0 3 L 3 -3' : 'M -3 3 L 0 -3 L 3 3';
      const el = createPath(d, {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.5',
      });
      return { element: el, height: 6 };
    }
    case 'tenuto': {
      const el = createLine(-6, 0, 6, 0, {
        stroke: 'currentColor',
        'stroke-width': '1.5',
      });
      return { element: el, height: 2 };
    }
    case 'fermata': {
      const g = createGroup('');
      // Arc (always opens downward)
      g.appendChild(
        createPath('M -5 0 Q 0 -8 5 0', {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.5',
        })
      );
      // Dot
      g.appendChild(
        createSvgElement('circle', {
          cx: 0,
          cy: -2,
          r: 1,
          fill: 'currentColor',
        })
      );
      return { element: g, height: 8 };
    }
    case 'portato': {
      const g = createGroup('');
      // Tenuto line
      g.appendChild(
        createLine(-6, 0, 6, 0, {
          stroke: 'currentColor',
          'stroke-width': '1.5',
        })
      );
      // Staccato dot stacked further from notehead
      const dotY = below ? STACK_GAP + 1.5 : -(STACK_GAP + 1.5);
      g.appendChild(
        createSvgElement('circle', {
          cx: 0,
          cy: dotY,
          r: 1.5,
          fill: 'currentColor',
        })
      );
      return { element: g, height: 5 + STACK_GAP };
    }
    default:
      return null;
  }
}

/**
 * Normalize articulation input to a sorted array.
 * @param {string|string[]} articulation
 * @returns {string[]}
 */
function normalizeArticulations(articulation) {
  const list = Array.isArray(articulation) ? [...articulation] : [articulation];
  return list
    .filter((a) => VALID_ARTICULATIONS.includes(a))
    .sort((a, b) => (STACK_PRIORITY[a] || 0) - (STACK_PRIORITY[b] || 0));
}

/**
 * Render articulation marks for a note.
 * @param {Object} params
 * @param {string|string[]} params.articulation - Articulation value(s)
 * @param {boolean} params.stemDown - Whether the stem points down
 * @param {boolean} [params.isRest] - Whether this is a rest
 * @returns {SVGGElement|null}
 */
export function renderArticulations({ articulation, stemDown, isRest }) {
  if (!articulation) return null;

  let list = normalizeArticulations(articulation);

  // For rests, only fermata is valid
  if (isRest) {
    list = list.filter((a) => a === 'fermata');
    if (list.length === 0) return null;
  }

  if (list.length === 0) return null;

  const group = createGroup('articulations');

  // Separate fermata (always above) from others (opposite of stem)
  const fermatas = list.filter((a) => a === 'fermata');
  const others = list.filter((a) => a !== 'fermata');

  // Place non-fermata articulations opposite the stem
  const below = !stemDown; // stem up -> below
  let offset = NOTEHEAD_GAP;

  for (const type of others) {
    const result = createArticulationSymbol(type, below);
    if (!result) continue;
    const { element, height } = result;

    const y = below ? offset + height / 2 : -(offset + height / 2);
    const artGroup = createGroup(`articulation articulation-${type}`, {
      transform: `translate(0, ${y})`,
    });
    artGroup.appendChild(element);
    group.appendChild(artGroup);
    offset += height + STACK_GAP;
  }

  // Fermata always above
  let fermataOffset = stemDown ? NOTEHEAD_GAP : offset;
  for (const type of fermatas) {
    const result = createArticulationSymbol(type, false);
    if (!result) continue;
    const { element, height } = result;

    const y = -(fermataOffset + height / 2);
    const artGroup = createGroup(`articulation articulation-${type}`, {
      transform: `translate(0, ${y})`,
    });
    artGroup.appendChild(element);
    group.appendChild(artGroup);
    fermataOffset += height + STACK_GAP;
  }

  return group;
}

export { VALID_ARTICULATIONS };
