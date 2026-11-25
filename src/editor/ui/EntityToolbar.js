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
      { type: 'waystone', label: 'Waystone', key: 'l', color: '#66ddff' },
    ];

    this._buttons = {};
    this._order = tools.map((t) => t.type);
    // No entity chosen = FLOOR ONLY: ✕ / Enter / a click on empty space
    // builds floor (held: a range) instead of placing an entity with its
    // floor. Its own button, and a stop on the L1 / R1 ring.
    const floorBtn = document.createElement('button');
    floorBtn.className = 'tool-btn tool-floor active';
    floorBtn.textContent = 'Floor only';
    floorBtn.title = 'No entity: ✕ / Enter / a click on empty space builds floor';
    floorBtn.onclick = () => this.deselect();
    grid.appendChild(floorBtn);
    this._floorBtn = floorBtn;
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
      this.deselect();
    } else {
      if (this._activeTool) this._buttons[this._activeTool].classList.remove('active');
      this._activeTool = type;
      this._buttons[type].classList.add('active');
      if (this._floorBtn) this._floorBtn.classList.remove('active');
      this._onToolSelect(type);
    }
  }

  /**
   * Step to the previous (-1) or next (+1) tool round a ring that has
   * "floor only" (no entity: null) between the last tool and the first —
   * a controller's L1 / R1.
   * @returns {?string} the tool now chosen (null: floor only)
   */
  cycle(step) {
    const ring = [null, ...this._order];
    const at = ring.indexOf(this._activeTool);
    const next = ring[(at + step + ring.length) % ring.length];
    if (next === null) this.deselect();
    else if (next !== this._activeTool) this._selectTool(next);
    return this._activeTool;
  }

  /** No entity chosen: floor only. */
  deselect() {
    if (this._activeTool) {
      this._buttons[this._activeTool].classList.remove('active');
      this._activeTool = null;
      if (this._floorBtn) this._floorBtn.classList.add('active');
      this._onToolSelect(null);
    }
  }
}
