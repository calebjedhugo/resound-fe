export default class EntityToolbar {
  constructor(container, onToolSelect) {
    this._container = container; // DOM element (#entity-toolbar)
    this._onToolSelect = onToolSelect; // callback(toolType) or callback(null) for deselect
    this._activeTool = null;
    this._render();
  }

  get activeTool() {
    return this._activeTool;
  }

  _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.textContent = 'Entity Tools';
    label.className = 'panel-label';
    wrapper.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'toolbar-grid';

    // `key` is the keyboard shortcut that places this entity at the cursor cell
    // (see PLACE_KEYS in EditorApp) — shown on the button as a legend.
    const tools = [
      { type: 'player', label: 'Player', key: 'p', color: '#ff4444' },
      { type: 'creature', label: 'Creature', key: 'c', color: '#ffaa00' },
      { type: 'gate', label: 'Gate', key: 'g', color: '#4488ff' },
      // Fountain PARKED: the entity no longer does anything in-game, so the
      // placement tool is hidden for now. Kept for possible revival (the
      // fountain entity/serialization is untouched).
      // { type: 'fountain', label: 'Fountain', color: '#44ddff' },
      { type: 'wall', label: 'Wall', key: 'w', color: '#808080' },
      { type: 'ramp', label: 'Ramp', key: 'r', color: '#88ff88' },
      { type: 'cleanser', label: 'Cleanser', key: 'l', color: '#66ddff' },
    ];

    this._buttons = {};
    tools.forEach(({ type, label: lbl, key, color }) => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = `${lbl} (${key})`;
      btn.style.borderColor = color;
      btn.onclick = () => this._selectTool(type);
      grid.appendChild(btn);
      this._buttons[type] = btn;
    });

    wrapper.appendChild(grid);
    this._container.appendChild(wrapper);
  }

  _selectTool(type) {
    if (this._activeTool === type) {
      this._activeTool = null;
      this._buttons[type].classList.remove('active');
      this._onToolSelect(null);
    } else {
      if (this._activeTool) this._buttons[this._activeTool].classList.remove('active');
      this._activeTool = type;
      this._buttons[type].classList.add('active');
      this._onToolSelect(type);
    }
  }

  deselect() {
    if (this._activeTool) {
      this._buttons[this._activeTool].classList.remove('active');
      this._activeTool = null;
      this._onToolSelect(null);
    }
  }
}
