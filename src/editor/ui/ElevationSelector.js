/**
 * ElevationSelector
 *
 * Switches the active storey among the elevations that actually exist:
 * {0 (implicit ground)} plus every elevation that has a floor region.
 *
 * - Hidden entirely while the puzzle is single-storey (only ground), since
 *   there is nothing to switch between.
 * - The +/- buttons step through existing storeys only, so you can never
 *   select an elevation that does not exist. (Creating a new upper storey is
 *   done from the Floor Regions panel, which owns the new-region elevation.)
 */
import { availableElevations } from 'editor/util/elevations';

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

  /** Recompute available storeys, clamp the active one, and re-render. */
  refresh() {
    const available = availableElevations(this._undoManager.getFloors());

    // Clamp the active elevation to an existing storey.
    if (!available.includes(this._value)) {
      this._value = available.includes(0) ? 0 : available[0];
    }
    this._editorScene.activeElevation = this._value;

    this._container.innerHTML = '';

    // Single-storey puzzle: no control at all.
    if (available.length <= 1) return;

    this._available = available;
    this._render();
  }

  _render() {
    this._container.innerHTML = '';
    const available = this._available;
    const index = available.indexOf(this._value);

    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.textContent = 'Active Elevation';
    label.className = 'panel-label';
    wrapper.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'elevation-controls';

    const downBtn = document.createElement('button');
    downBtn.textContent = '-';
    downBtn.className = 'elevation-btn';
    downBtn.disabled = index <= 0;
    downBtn.onclick = () => this._step(-1);

    const display = document.createElement('span');
    display.className = 'elevation-display';
    display.textContent = this._value;

    const upBtn = document.createElement('button');
    upBtn.textContent = '+';
    upBtn.className = 'elevation-btn';
    upBtn.disabled = index >= available.length - 1;
    upBtn.onclick = () => this._step(1);

    controls.appendChild(downBtn);
    controls.appendChild(display);
    controls.appendChild(upBtn);
    wrapper.appendChild(controls);
    this._container.appendChild(wrapper);
  }

  _step(delta) {
    const available = this._available;
    const index = available.indexOf(this._value);
    const next = index + delta;
    if (next < 0 || next >= available.length) return;
    this._value = available[next];
    this._editorScene.activeElevation = this._value;
    this._render(); // re-render in place to update the display + button states
  }
}
