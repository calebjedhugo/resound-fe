/**
 * RhythmPalette
 *
 * Row of clickable duration buttons above the staff. Each button shows a note
 * icon rendered by the notation system, so the palette stays visually in sync
 * with the engraving. Selection is available by click or keyboard shortcut.
 */

import { createNote } from 'resound-notation/components/Note';

const SVG_NS = 'http://www.w3.org/2000/svg';

const DURATIONS = [
  { key: '2', length: '1/1', name: 'Whole' },
  { key: '3', length: '1/2', name: 'Half' },
  { key: '4', length: '1/4', name: 'Quarter' },
  { key: '5', length: '1/8', name: 'Eighth' },
  { key: '6', length: '1/16', name: '16th' },
  { key: '7', length: '1/32', name: '32nd' },
];

export { DURATIONS };

/**
 * Create a small SVG element containing a single note icon at a fixed pitch,
 * so it inherits button text color via currentColor.
 * @param {string} length - Fraction string (e.g. "1/4")
 * @returns {SVGSVGElement}
 */
function createNoteIcon(length) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 100');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '40');

  const noteGroup = createNote({ pitch: 'B4', length, x: 16, clef: 'treble' });
  svg.appendChild(noteGroup);
  return svg;
}

export default class RhythmPalette {
  constructor(container, onDurationSelect) {
    this._container = container;
    this._onSelect = onDurationSelect;
    this._activeLength = '1/4'; // default quarter note
    this._render();
  }

  get activeLength() {
    return this._activeLength;
  }

  set activeLength(val) {
    this._activeLength = val;
    this._updateHighlight();
  }

  _render() {
    this._container.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'rhythm-palette';

    this._buttons = {};
    DURATIONS.forEach(({ key, length, name }) => {
      const btn = document.createElement('button');
      btn.className = 'rhythm-btn';
      btn.appendChild(createNoteIcon(length));
      btn.title = `${name} (${key})`;
      btn.dataset.length = length;
      if (length === this._activeLength) btn.classList.add('active');
      btn.onclick = () => {
        this._activeLength = length;
        this._updateHighlight();
        this._onSelect(length);
      };
      row.appendChild(btn);
      this._buttons[length] = btn;
    });

    this._container.appendChild(row);
  }

  _updateHighlight() {
    Object.values(this._buttons).forEach((b) => b.classList.remove('active'));
    if (this._buttons[this._activeLength]) {
      this._buttons[this._activeLength].classList.add('active');
    }
  }

  handleKeyPress(key) {
    const dur = DURATIONS.find((d) => d.key === key);
    if (dur) {
      this._activeLength = dur.length;
      this._updateHighlight();
      return dur.length;
    }
    return null;
  }
}
