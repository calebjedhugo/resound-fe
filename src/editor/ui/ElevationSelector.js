/**
 * ElevationSelector
 *
 * Sidebar control for setting the active elevation level.
 * Displays +/- buttons and the current elevation value.
 * Updates EditorScene.activeElevation on change.
 */
export default class ElevationSelector {
  constructor(container, editorScene) {
    this._container = container;
    this._editorScene = editorScene;
    this._value = 0;
    this._render();
  }

  get value() {
    return this._value;
  }

  _render() {
    this._container.innerHTML = '';

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
    downBtn.onclick = () => this._change(-1);

    const display = document.createElement('span');
    display.className = 'elevation-display';
    display.textContent = this._value;
    this._display = display;

    const upBtn = document.createElement('button');
    upBtn.textContent = '+';
    upBtn.className = 'elevation-btn';
    upBtn.onclick = () => this._change(1);

    controls.appendChild(downBtn);
    controls.appendChild(display);
    controls.appendChild(upBtn);
    wrapper.appendChild(controls);
    this._container.appendChild(wrapper);
  }

  _change(delta) {
    const next = this._value + delta;
    if (next < 0) return;
    this._value = next;
    this._display.textContent = this._value;
    this._editorScene.activeElevation = this._value;
  }
}
