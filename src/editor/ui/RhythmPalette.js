/**
 * RhythmPalette
 *
 * Row of clickable duration buttons above the staff.
 * Allows selecting note duration via click or keyboard shortcut.
 */

const DURATIONS = [
  { key: '2', label: '\uD834\uDD5D\uD834\uDD5D', length: '2/1', name: 'Double Whole' },
  { key: '3', label: '\uD834\uDD5D', length: '1/1', name: 'Whole' },
  { key: '4', label: '\uD834\uDD5E', length: '1/2', name: 'Half' },
  { key: '5', label: '\u2669', length: '1/4', name: 'Quarter' },
  { key: '6', label: '\u266A', length: '1/8', name: 'Eighth' },
  { key: '7', label: '\uD834\uDD61', length: '1/16', name: '16th' },
  { key: '8', label: '\uD834\uDD62', length: '1/32', name: '32nd' },
  { key: '9', label: '\uD834\uDD63', length: '1/64', name: '64th' },
];

export { DURATIONS };

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
    DURATIONS.forEach(({ key, label, length, name }) => {
      const btn = document.createElement('button');
      btn.className = 'rhythm-btn';
      btn.textContent = label;
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
