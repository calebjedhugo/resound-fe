/**
 * PropertyPanel
 *
 * Displays editable properties for the currently selected entity.
 * Shown when an entity is selected, hidden when deselected.
 * Fields vary by entity type (creature, gate, fountain, ramp, wall).
 */

export default class PropertyPanel {
  constructor(container, undoManager, entityPlacer, onDelete, onEditSong) {
    this._container = container; // #property-panel
    this._undoManager = undoManager;
    this._entityPlacer = entityPlacer;
    this._onDelete = onDelete || null;
    this._onEditSong = onEditSong || null;
    this._selectedId = null;
  }

  show(entityId) {
    this._selectedId = entityId;
    const entity = this._undoManager.getEntity(entityId);
    if (!entity) {
      this.hide();
      return;
    }
    this._render(entity);
  }

  hide() {
    this._selectedId = null;
    this._container.innerHTML = '';
  }

  _render(entity) {
    this._container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const title = document.createElement('label');
    title.className = 'panel-label';
    title.textContent = `${entity.type.charAt(0).toUpperCase() + entity.type.slice(1)} Properties`;
    wrapper.appendChild(title);

    // Position: X/Z are editable so you can nudge without delete+replace;
    // elevation (y) is set via the Active Elevation control, shown read-only.
    const elevInfo = document.createElement('div');
    elevInfo.className = 'prop-row';
    elevInfo.textContent = `Elevation: ${entity.y}`;
    wrapper.appendChild(elevInfo);

    this._addNumberField(wrapper, 'X', entity.x, (val) => {
      const e = this._undoManager.getEntity(this._selectedId);
      this._entityPlacer.setEntityPosition(this._selectedId, val, e.z, e.y);
    });
    this._addNumberField(wrapper, 'Z', entity.z, (val) => {
      const e = this._undoManager.getEntity(this._selectedId);
      this._entityPlacer.setEntityPosition(this._selectedId, e.x, val, e.y);
    });

    // Type-specific fields
    switch (entity.type) {
      case 'creature':
        this._renderCreatureFields(wrapper, entity);
        break;
      case 'gate':
      case 'fountain':
        this._renderSongEditor(wrapper, entity);
        break;
      case 'ramp':
        this._renderRampFields(wrapper, entity);
        break;
      // wall and player: position only
    }

    // Delete button
    if (this._onDelete) {
      const deleteRow = document.createElement('div');
      deleteRow.style.marginTop = '12px';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Delete Entity';
      deleteBtn.style.width = '100%';
      deleteBtn.style.padding = '6px';
      deleteBtn.onclick = () => this._onDelete();
      deleteRow.appendChild(deleteBtn);
      wrapper.appendChild(deleteRow);
    }

    this._container.appendChild(wrapper);
  }

  _renderCreatureFields(wrapper, entity) {
    const data = entity.data || {};

    // Interval
    this._addNumberField(wrapper, 'Interval (beats)', data.interval || 8, (val) => {
      const newData = { ...this._undoManager.getEntity(this._selectedId).data, interval: val };
      this._undoManager.updateEntity(this._selectedId, { data: newData });
    });

    // Audible Range
    this._addNumberField(wrapper, 'Audible Range', data.audibleRange || 15, (val) => {
      const newData = { ...this._undoManager.getEntity(this._selectedId).data, audibleRange: val };
      this._undoManager.updateEntity(this._selectedId, { data: newData });
    });

    // Clap Displacement (optional)
    this._addTextField(wrapper, 'Clap Displacement', data.clapDisplacement || '', (val) => {
      const newData = {
        ...this._undoManager.getEntity(this._selectedId).data,
        clapDisplacement: val || undefined,
      };
      this._undoManager.updateEntity(this._selectedId, { data: newData });
    });

    // Song editor button
    this._renderSongEditor(wrapper, entity);
  }

  _renderSongEditor(wrapper, entity) {
    if (!this._onEditSong) return;

    const songContainer = document.createElement('div');
    songContainer.className = 'song-editor-container';

    const editBtn = document.createElement('button');
    editBtn.className = 'editor-btn edit-song-btn';
    editBtn.textContent = 'Edit Song...';
    editBtn.onclick = () => this._onEditSong(entity.id);

    songContainer.appendChild(editBtn);
    wrapper.appendChild(songContainer);
  }

  _renderRampFields(wrapper, entity) {
    const data = entity.data || {};
    const directions = ['north', 'south', 'east', 'west'];

    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('label');
    label.textContent = 'Direction: ';
    row.appendChild(label);

    const select = document.createElement('select');
    select.className = 'prop-select';
    directions.forEach((dir) => {
      const opt = document.createElement('option');
      opt.value = dir;
      opt.textContent = dir;
      if (data.direction === dir) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => {
      const newData = {
        ...this._undoManager.getEntity(this._selectedId).data,
        direction: select.value,
      };
      this._undoManager.updateEntity(this._selectedId, { data: newData });
      // Update mesh rotation
      const mesh = this._entityPlacer.getMeshById(this._selectedId);
      if (mesh) {
        mesh.rotation.set(0, 0, 0);
        this._entityPlacer._applyRampRotation(mesh, select.value);
      }
    };
    row.appendChild(select);
    wrapper.appendChild(row);
  }

  _addNumberField(wrapper, labelText, value, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('label');
    label.textContent = `${labelText}: `;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'prop-input';
    input.value = value;
    input.onchange = () => onChange(Number(input.value));
    row.appendChild(input);

    wrapper.appendChild(row);
  }

  _addTextField(wrapper, labelText, value, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('label');
    label.textContent = `${labelText}: `;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.value = value;
    input.onchange = () => onChange(input.value);
    row.appendChild(input);

    wrapper.appendChild(row);
  }
}
