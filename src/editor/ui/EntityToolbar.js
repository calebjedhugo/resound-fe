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

    const tools = [
      { type: 'player', label: 'Player', color: '#ff4444' },
      { type: 'creature', label: 'Creature', color: '#ffaa00' },
      { type: 'gate', label: 'Gate', color: '#4488ff' },
      { type: 'fountain', label: 'Fountain', color: '#44ddff' },
      { type: 'wall', label: 'Wall', color: '#808080' },
      { type: 'ramp', label: 'Ramp', color: '#88ff88' },
      { type: 'cleanser', label: 'Cleanser', color: '#66ddff' },
    ];

    this._buttons = {};
    tools.forEach(({ type, label: lbl, color }) => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = lbl;
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
