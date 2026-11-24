/**
 * RhythmPalette
 *
 * Row of duration buttons above the staff — whole … 32nd, then the DOT and
 * the TIE — each note showing its note drawn by the notation system, so the
 * palette stays visually in sync with the engraving. A note value is the
 * duration a rest is entered at; the dot, chosen, makes ✕ step the dots of
 * the entry at the edit cursor (none → one → two → none); the tie, chosen,
 * makes ✕ tie / untie the note under the pitch cursor (the designer,
 * 2026-11-24: "toggling a tie is the same as a dot"). With either chosen
 * the last note value stays the entry duration, marked `kept`. Chosen by
 * click, by L1/R1 (`step`) or a duration key (2 = whole … 7 = 32nd).
 *
 * The icons are `components/Note` notes. Since resound-notation draws every
 * SMuFL glyph as a `<use>` of a per-SVG `<defs>` (which only the renderer's
 * `render()` writes), a lone component draws a bare stem: the palette takes
 * the glyph defs from one hidden render of the same notes and gives each
 * icon its own copy (`glyphDefs`).
 */

import { NotationRenderer } from 'resound-notation';
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

// Below the middle line, so stems go up (as a palette's notes do)
const ICON_PITCH = 'G4';
let cachedDefs; // undefined: not tried yet; null: none to be had

/**
 * The SMuFL glyph defs every icon references: one hidden render of the
 * palette's own notes (a dotted one for the dot, rests between so nothing
 * beams), its `<defs>` kept.
 * @returns {?SVGDefsElement}
 */
function glyphDefs() {
  if (cachedDefs !== undefined) return cachedDefs;
  cachedDefs = null;
  try {
    const notes = [];
    DURATIONS.forEach(({ length }) => {
      notes.push({ pitch: ICON_PITCH, length, dotted: length === '1/4' });
      notes.push({ length: '1/4' });
    });
    const host = document.createElement('div');
    const renderer = new NotationRenderer({
      container: host,
      width: 4000,
      observeContainer: false,
    });
    renderer.render({ timeSignature: null, voices: [{ id: 'icons', clef: 'treble', notes }] });
    const defs = renderer.getSvgElement() && renderer.getSvgElement().querySelector('defs');
    cachedDefs = defs ? defs.cloneNode(true) : null;
    renderer.clear();
  } catch {
    cachedDefs = null;
  }
  return cachedDefs;
}

/**
 * A small SVG of one note at a fixed pitch (inherits the button's colour).
 * @param {string} length - Fraction string (e.g. "1/4")
 * @returns {SVGSVGElement}
 */
function createNoteIcon(length) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  // G4's head sits at y 70, its stem up to ~0; a whole note (no stem) is
  // framed on its head
  svg.setAttribute('viewBox', length === '1/1' ? '-4 18 40 104' : '-4 -14 40 104');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '40');
  const defs = glyphDefs();
  if (defs) svg.appendChild(defs.cloneNode(true));
  svg.appendChild(createNote({ pitch: ICON_PITCH, length, x: 16, clef: 'treble' }));
  return svg;
}

/** The tie's icon: a tie arc over two noteheads' places, as the staff draws one. */
function createTieIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 104');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '40');
  const arc = document.createElementNS(SVG_NS, 'path');
  // A filled crescent (outer and inner curve), like the engraved tie
  arc.setAttribute('d', 'M2 60 C 10 40, 30 40, 38 60 C 30 46, 10 46, 2 60 Z');
  arc.setAttribute('fill', 'currentColor');
  arc.setAttribute('stroke', 'currentColor');
  arc.setAttribute('stroke-width', '1.5');
  arc.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(arc);
  return svg;
}

/** The dot's icon: an augmentation dot, as the staff draws one. */
function createDotIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 104');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '40');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '20');
  dot.setAttribute('cy', '52');
  dot.setAttribute('r', '6');
  dot.setAttribute('fill', 'currentColor');
  svg.appendChild(dot);
  return svg;
}

export default class RhythmPalette {
  /**
   * @param {HTMLElement} container
   * @param {(choice: {length: string, dot: boolean, tie: boolean}) => void} onSelect - a button clicked
   */
  constructor(container, onSelect = () => {}) {
    this._container = container;
    this._onSelect = onSelect;
    this._activeLength = '1/4'; // the entry duration (a quarter to start)
    this._mode = null; // 'dot' / 'tie' chosen (✕ dots / ties), else null
    this._render();
  }

  /** The duration a rest is entered at: the note value chosen last. */
  get activeLength() {
    return this._activeLength;
  }

  set activeLength(val) {
    this._activeLength = val;
    this._mode = null;
    this._updateHighlight();
  }

  /** Whether the dot is chosen (✕ steps the dots instead of entering pitches). */
  get dotSelected() {
    return this._mode === 'dot';
  }

  /** Whether the tie is chosen (✕ ties / unties instead of entering pitches). */
  get tieSelected() {
    return this._mode === 'tie';
  }

  /** Choose the dot or the tie ('dot' / 'tie'), the entry duration kept. */
  chooseMode(mode) {
    this._mode = mode === 'dot' || mode === 'tie' ? mode : null;
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
      btn.type = 'button';
      btn.appendChild(createNoteIcon(length));
      btn.title = `${name} (${key})`;
      btn.dataset.length = length;
      btn.onclick = () => {
        this.activeLength = length;
        this._onSelect({ length, dot: false });
      };
      row.appendChild(btn);
      this._buttons[length] = btn;
    });

    const dotBtn = document.createElement('button');
    dotBtn.className = 'rhythm-btn rhythm-dot';
    dotBtn.type = 'button';
    dotBtn.appendChild(createDotIcon());
    dotBtn.title = 'Dot (.) — again: double dot, again: none';
    dotBtn.dataset.dot = 'true';
    dotBtn.onclick = () => {
      this.chooseMode('dot');
      this._onSelect({ length: this._activeLength, dot: true, tie: false });
    };
    row.appendChild(dotBtn);
    this._dotButton = dotBtn;

    const tieBtn = document.createElement('button');
    tieBtn.className = 'rhythm-btn rhythm-tie';
    tieBtn.type = 'button';
    tieBtn.appendChild(createTieIcon());
    tieBtn.title = 'Tie (t) — the note at the pitch cursor to the same pitch next';
    tieBtn.dataset.tie = 'true';
    tieBtn.onclick = () => {
      this.chooseMode('tie');
      this._onSelect({ length: this._activeLength, dot: false, tie: true });
    };
    row.appendChild(tieBtn);
    this._tieButton = tieBtn;

    this._container.appendChild(row);
    this._updateHighlight();
  }

  _updateHighlight() {
    Object.entries(this._buttons).forEach(([length, b]) => {
      const chosen = length === this._activeLength;
      b.classList.toggle('active', chosen && !this._mode);
      b.classList.toggle('kept', chosen && !!this._mode);
    });
    this._dotButton.classList.toggle('active', this._mode === 'dot');
    this._tieButton.classList.toggle('active', this._mode === 'tie');
  }

  /**
   * L1 (-1) / R1 (+1): the next card along whole … 32nd, dot, tie.
   * @returns {boolean} whether the choice moved
   */
  step(dir) {
    const MODES = ['dot', 'tie'];
    const at = this._mode
      ? DURATIONS.length + MODES.indexOf(this._mode)
      : DURATIONS.findIndex((d) => d.length === this._activeLength);
    const next = at + dir;
    if (next < 0 || next >= DURATIONS.length + MODES.length) return false;
    if (next >= DURATIONS.length) this.chooseMode(MODES[next - DURATIONS.length]);
    else this.activeLength = DURATIONS[next].length;
    return true;
  }

  /** A duration key (2 … 7): choose it; returns its length, else null. */
  handleKeyPress(key) {
    const dur = DURATIONS.find((d) => d.key === key);
    if (!dur) return null;
    this.activeLength = dur.length;
    return dur.length;
  }
}
