/**
 * MetadataPanel
 *
 * Always-visible panel for editing puzzle-level metadata:
 * ID, name, difficulty, tempo, grid size, clap displacement.
 */
export default class MetadataPanel {
  constructor(container, undoManager, editorScene) {
    this._container = container; // #metadata-panel
    this._undoManager = undoManager;
    this._editorScene = editorScene;
    this._render();
  }

  _render() {
    this._container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const title = document.createElement('label');
    title.className = 'panel-label';
    title.textContent = 'Puzzle Metadata';
    wrapper.appendChild(title);

    const meta = this._undoManager.getMetadata();

    // ID
    this._addField(wrapper, 'text', 'ID', meta.id, (val) => {
      this._undoManager.setMetadata({ id: val });
    });

    // Name
    this._addField(wrapper, 'text', 'Name', meta.name, (val) => {
      this._undoManager.setMetadata({ name: val });
    });

    // Difficulty
    const diffRow = document.createElement('div');
    diffRow.className = 'prop-row';
    const diffLabel = document.createElement('label');
    diffLabel.textContent = 'Difficulty: ';
    diffRow.appendChild(diffLabel);
    const diffSelect = document.createElement('select');
    diffSelect.className = 'prop-select';
    [1, 2, 3].forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (meta.difficulty === d) opt.selected = true;
      diffSelect.appendChild(opt);
    });
    diffSelect.onchange = () => {
      this._undoManager.setMetadata({ difficulty: Number(diffSelect.value) });
    };
    diffRow.appendChild(diffSelect);
    wrapper.appendChild(diffRow);

    // Tempo
    this._addField(wrapper, 'number', 'Tempo (BPM)', meta.tempo, (val) => {
      this._undoManager.setMetadata({ tempo: Number(val) });
    });

    // Grid Size
    this._addField(wrapper, 'number', 'Grid Size', meta.gridSize, (val) => {
      this._undoManager.setMetadata({ gridSize: Number(val) });
      // NOTE: Resizing the grid floor would need EditorScene rebuild
      // For now, just update the model
    });

    // Clap Displacement
    this._addField(wrapper, 'text', 'Clap Displacement', meta.clapDisplacement || '', (val) => {
      this._undoManager.setMetadata({ clapDisplacement: val || null });
    });

    this._container.appendChild(wrapper);
  }

  _addField(wrapper, type, labelText, value, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('label');
    label.textContent = `${labelText}: `;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = type;
    input.className = 'prop-input';
    input.value = value;
    input.onchange = () => onChange(input.value);
    row.appendChild(input);

    wrapper.appendChild(row);
  }

  refresh() {
    this._render();
  }
}
