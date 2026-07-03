/**
 * ControlsOverlay - full-screen help shown when a puzzle starts.
 * Explains the objective and every control. Dismissed by any key or click;
 * reopened with H.
 */
const CONTROLS = [
  ['W A S D', 'Move (hold Shift to run)'],
  ['Mouse', 'Look around (M toggles mouse-look off/on)'],
  ['I J K L', 'Look with the keyboard'],
  ['R', 'Record on/off — stand close to a creature and record while it sings'],
  ['Space', 'Play back the recording in the active slot'],
  ['← / → or 1–5', 'Choose an inventory slot'],
  ['C', 'Clap (nudges creatures on the beat)'],
  ['N', 'Metronome on/off'],
  ['F3', 'Debug info on/off'],
  ['Esc', 'Pause'],
  ['H', 'Show this help again'],
];

class ControlsOverlay {
  constructor() {
    this.element = null;
    this.visible = false;
    this.dismissHandler = null;
  }

  buildElement(puzzleName, resume) {
    const overlay = document.createElement('div');
    overlay.id = 'controls-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9000;
      background: rgba(10, 12, 18, 0.82);
      display: flex; align-items: center; justify-content: center;
      font-family: sans-serif; color: #fff; cursor: pointer;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = 'max-width: 560px; padding: 24px 36px; text-align: left;';

    const title = document.createElement('h2');
    title.textContent = puzzleName || 'How to play';
    title.style.cssText = 'margin: 0 0 6px; text-align: center;';
    panel.appendChild(title);

    const objective = document.createElement('p');
    objective.textContent =
      'Creatures sing melodies. Stand close and press R to record one, then play it back ' +
      '(Space) near a gate or fountain to match its target song and unlock it. ' +
      'Sound travels in all directions — you never need to aim, just be close enough.';
    objective.style.cssText = 'margin: 0 0 18px; line-height: 1.5; color: #cfe3ff;';
    panel.appendChild(objective);

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; margin: 0 auto;';
    CONTROLS.forEach(([key, desc]) => {
      const row = document.createElement('tr');
      const keyCell = document.createElement('td');
      keyCell.textContent = key;
      keyCell.style.cssText =
        'padding: 3px 14px 3px 0; font-family: monospace; white-space: nowrap; color: #ffd97a; text-align: right;';
      const descCell = document.createElement('td');
      descCell.textContent = desc;
      descCell.style.cssText = 'padding: 3px 0; line-height: 1.45;';
      row.appendChild(keyCell);
      row.appendChild(descCell);
      table.appendChild(row);
    });
    panel.appendChild(table);

    const footer = document.createElement('p');
    footer.textContent = resume
      ? 'Click or press any key to continue'
      : 'Click or press any key to start';
    footer.style.cssText =
      'margin: 22px 0 0; text-align: center; color: #9fb4d8; font-style: italic;';
    panel.appendChild(footer);

    overlay.appendChild(panel);
    return overlay;
  }

  show(puzzleName, { resume = false } = {}) {
    if (this.visible) return;
    this.element = this.buildElement(puzzleName, resume);
    document.body.appendChild(this.element);
    this.visible = true;

    // Capture-phase so the dismissing keypress never reaches the game
    this.dismissHandler = (event) => {
      event.stopPropagation();
      if (event.type === 'keydown' || event.type === 'click') this.hide();
    };
    window.addEventListener('keydown', this.dismissHandler, true);
    window.addEventListener('keyup', this.dismissHandler, true);
    this.element.addEventListener('click', this.dismissHandler, true);
  }

  hide() {
    if (!this.visible) return;
    window.removeEventListener('keydown', this.dismissHandler, true);
    window.removeEventListener('keyup', this.dismissHandler, true);
    this.dismissHandler = null;
    this.element.remove();
    this.element = null;
    this.visible = false;
  }

  toggle(puzzleName) {
    if (this.visible) this.hide();
    else this.show(puzzleName, { resume: true });
  }
}

export default ControlsOverlay;
