/**
 * SVG element creation utilities.
 * All functions use document.createElementNS with the SVG namespace.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Set attributes on an SVG element from a plain object.
 */
function setAttributes(el, attrs) {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
}

/**
 * Create an SVG element with the given tag name and optional attributes.
 * @param {string} tag
 * @param {Object} [attrs]
 * @returns {SVGElement}
 */
export function createSvgElement(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  setAttributes(el, attrs);
  return el;
}

/**
 * Create an SVG <g> group element.
 * @param {string} [className]
 * @param {Object} [attrs]
 * @returns {SVGGElement}
 */
export function createGroup(className, attrs) {
  const g = createSvgElement('g', attrs);
  if (className) {
    g.setAttribute('class', className);
  }
  return g;
}

/**
 * Create an SVG <line> element.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {Object} [attrs]
 * @returns {SVGLineElement}
 */
export function createLine(x1, y1, x2, y2, attrs) {
  return createSvgElement('line', { x1, y1, x2, y2, ...attrs });
}

/**
 * Create an SVG <ellipse> element.
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {Object} [attrs]
 * @returns {SVGEllipseElement}
 */
export function createEllipse(cx, cy, rx, ry, attrs) {
  return createSvgElement('ellipse', { cx, cy, rx, ry, ...attrs });
}

/**
 * Create an SVG <text> element with content.
 * @param {string} content
 * @param {number} x
 * @param {number} y
 * @param {Object} [attrs]
 * @returns {SVGTextElement}
 */
export function createText(content, x, y, attrs) {
  const el = createSvgElement('text', { x, y, ...attrs });
  el.textContent = content;
  return el;
}

/**
 * Create an SVG <path> element.
 * @param {string} d - Path data string
 * @param {Object} [attrs]
 * @returns {SVGPathElement}
 */
export function createPath(d, attrs) {
  return createSvgElement('path', { d, ...attrs });
}
