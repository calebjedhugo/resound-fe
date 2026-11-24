/**
 * PadLegend — while a controller is the device in hand (core/InputDevice),
 * a compact legend of what its buttons do right now, in that pad's own
 * glyphs (core/inputGlyphs buttonGlyph, drawn by ui/glyphCanvas in the key
 * hints' style): the viewport's mapping, the layer a held L2 / R2 opens, the
 * sidebar's, a menu's, the world map's, the song editor's
 * (editor/input/EditorGamepad EDITOR_MAPPING). With the keyboard in hand it
 * hides (the keyboard's shortcuts are the toolbar's ? panel).
 *
 * Rebuilt only when the family, the context or the held modifiers change.
 */
import { buttonGlyph } from 'core/inputGlyphs';
import { makeGlyphElement } from 'ui/glyphCanvas';
import { EDITOR_MAPPING } from 'editor/input/EditorGamepad';

const TITLES = {
  viewport: 'Controller',
  'viewport+l2': 'L2 held',
  'viewport+r2': 'R2 held',
  panel: 'Sidebar',
  menu: 'Menu',
  map: 'World map',
  song: 'Song editor',
  'song+l2': 'Song editor · L2 held',
  'song+r2': 'Song editor · R2 held',
  'song-options': 'Song editor options',
};

const GLYPH_PX = 20;

export default class PadLegend {
  /** @param {HTMLElement} parent - where the legend sits (the page) */
  constructor(parent) {
    this.element = document.createElement('div');
    this.element.className = 'pad-legend';
    this.element.hidden = true;
    parent.appendChild(this.element);
    this._key = null;
  }

  /** The mapping shown now ('viewport+l2' etc.), or null while hidden. */
  get shown() {
    return this.element.hidden ? null : this._mapping;
  }

  /**
   * Show the legend for `family` in `context` (or hide it: family
   * 'keyboard').
   * @param {string} family - core/InputDevice's family
   * @param {string} context - viewport, panel, menu, map, song
   * @param {{l2?: boolean, r2?: boolean}} [mods]
   */
  update(family, context, mods = {}) {
    if (family === 'keyboard') {
      this.element.hidden = true;
      this._key = null;
      return;
    }
    let mapping = context;
    if (context === 'viewport' && mods.l2) mapping = 'viewport+l2';
    else if (context === 'viewport' && mods.r2) mapping = 'viewport+r2';
    else if (context === 'song' && mods.l2) mapping = 'song+l2';
    else if (context === 'song' && mods.r2) mapping = 'song+r2';
    const key = `${family}|${mapping}`;
    this.element.hidden = false;
    if (key === this._key) return;
    this._key = key;
    this._mapping = mapping;
    this._render(family, mapping);
  }

  dispose() {
    this.element.remove();
  }

  _render(family, mapping) {
    this.element.innerHTML = '';
    this.element.dataset.mapping = mapping;
    const title = document.createElement('div');
    title.className = 'pad-legend-title';
    title.textContent = TITLES[mapping] || mapping;
    this.element.appendChild(title);
    for (const [buttons, text] of EDITOR_MAPPING[mapping] || []) {
      const row = document.createElement('div');
      row.className = 'pad-legend-row';
      const glyphs = document.createElement('span');
      glyphs.className = 'pad-legend-glyphs';
      for (const button of buttons.split('/')) {
        const glyph = buttonGlyph(button, family);
        if (glyph) glyphs.appendChild(makeGlyphElement(glyph, GLYPH_PX));
      }
      const label = document.createElement('span');
      label.className = 'pad-legend-text';
      label.textContent = text;
      row.appendChild(glyphs);
      row.appendChild(label);
      this.element.appendChild(row);
    }
  }
}
