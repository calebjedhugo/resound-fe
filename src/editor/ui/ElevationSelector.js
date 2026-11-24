/**
 * ElevationSelector
 *
 * The active storey: the one the cursor, the grid and every placement are
 * on. Any storey from MIN_STOREY (subfloors, below the ground) to MAX_STOREY
 * can be chosen, built on or not — ✕ / Enter on a cell with no floor at the active storey builds
 * it (EditorApp). The sidebar shows it with − / +; Option+↑/↓ (the pad's
 * L2 + d-pad ↑/↓) steps it too.
 */

// Highest storey the editor goes to (guards a runaway Option+Up hold), and
// the deepest subfloor (storeys below the ground, ruled 2026-11-24)
export const MAX_STOREY = 9;
export const MIN_STOREY = -MAX_STOREY;

export default class ElevationSelector {
  constructor(container, editorScene, undoManager) {
    this._container = container;
    this._editorScene = editorScene;
    this._undoManager = undoManager;
    this._value = 0;
    this.refresh();
  }

  get value() {
    return this._value;
  }

  /** Make `elevation` the active storey (clamped) and re-render. */
  syncTo(elevation) {
    this._value = Math.max(MIN_STOREY, Math.min(MAX_STOREY, elevation));
    this.refresh();
  }

  /**
   * Step the active storey by `delta`, within MIN_STOREY and MAX_STOREY.
   * Returns true if the active storey actually changed.
   */
  step(delta) {
    const next = this._value + delta;
    if (next < MIN_STOREY || next > MAX_STOREY) return false;
    this.syncTo(next);
    return true;
  }

  /** Put the active storey on the scene and re-render. */
  refresh() {
    this._editorScene.activeElevation = this._value;
    this._render();
  }

  _render() {
    this._container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.textContent = 'Storey';
    label.className = 'panel-label';
    wrapper.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'elevation-controls';

    const downBtn = document.createElement('button');
    downBtn.textContent = '-';
    downBtn.className = 'elevation-btn';
    downBtn.disabled = this._value <= MIN_STOREY;
    downBtn.onclick = () => this.step(-1);

    const display = document.createElement('span');
    display.className = 'elevation-display';
    display.textContent = this._value;

    const upBtn = document.createElement('button');
    upBtn.textContent = '+';
    upBtn.className = 'elevation-btn';
    upBtn.disabled = this._value >= MAX_STOREY;
    upBtn.onclick = () => this.step(1);

    controls.appendChild(downBtn);
    controls.appendChild(display);
    controls.appendChild(upBtn);
    wrapper.appendChild(controls);
    this._container.appendChild(wrapper);
  }
}
