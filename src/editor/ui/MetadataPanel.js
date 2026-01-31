/**
 * MetadataPanel
 *
 * Always-visible panel for editing puzzle-level metadata:
 * ID, name, difficulty, tempo, grid size, clap displacement,
 * key signature, time signature.
 */
import { isValidKeySignature } from 'notation/lib/keySignatures';

const KEY_SIGNATURE_OPTIONS = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
];

const TIME_SIGNATURE_PRESETS = [
  { label: '4/4', value: [4, 4] },
  { label: '3/4', value: [3, 4] },
  { label: '2/4', value: [2, 4] },
  { label: '6/8', value: [6, 8] },
  { label: '2/2', value: [2, 2] },
  { label: '3/8', value: [3, 8] },
  { label: 'None (unmetered)', value: null },
];

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

    // Key Signature
    const keyRow = document.createElement('div');
    keyRow.className = 'prop-row';
    const keyLabel = document.createElement('label');
    keyLabel.textContent = 'Key Signature: ';
    keyRow.appendChild(keyLabel);
    const keySelect = document.createElement('select');
    keySelect.className = 'prop-select';
    KEY_SIGNATURE_OPTIONS.forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      if (meta.keySignature === key) opt.selected = true;
      keySelect.appendChild(opt);
    });
    keySelect.onchange = () => {
      const value = keySelect.value;
      if (isValidKeySignature(value)) {
        this._undoManager.setMetadata({ keySignature: value });
      }
    };
    keyRow.appendChild(keySelect);
    wrapper.appendChild(keyRow);

    // Time Signature
    const timeRow = document.createElement('div');
    timeRow.className = 'prop-row';
    const timeLabel = document.createElement('label');
    timeLabel.textContent = 'Time Signature: ';
    timeRow.appendChild(timeLabel);
    const timeSelect = document.createElement('select');
    timeSelect.className = 'prop-select';
    TIME_SIGNATURE_PRESETS.forEach((preset) => {
      const opt = document.createElement('option');
      opt.value = preset.label;
      opt.textContent = preset.label;
      // Match current value
      if (meta.timeSignature === null && preset.value === null) {
        opt.selected = true;
      } else if (
        Array.isArray(meta.timeSignature) &&
        Array.isArray(preset.value) &&
        meta.timeSignature[0] === preset.value[0] &&
        meta.timeSignature[1] === preset.value[1]
      ) {
        opt.selected = true;
      }
      timeSelect.appendChild(opt);
    });
    timeSelect.onchange = () => {
      const selected = TIME_SIGNATURE_PRESETS.find((p) => p.label === timeSelect.value);
      if (selected) {
        this._undoManager.setMetadata({ timeSignature: selected.value });
      }
    };
    timeRow.appendChild(timeSelect);
    wrapper.appendChild(timeRow);

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
