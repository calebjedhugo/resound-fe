/**
 * MetadataPanel
 *
 * Collapsible panel for puzzle-level metadata: name, difficulty, tempo,
 * grid size, clap displacement, key signature, time signature.
 *
 * The puzzle id is NOT hand-editable. It is derived from the name (slugified)
 * while the puzzle is still new/unsaved, then locked once it has been written
 * to disk, so renaming an existing puzzle never forks its file. The derived id
 * is shown read-only as the save target.
 */
import { isValidKeySignature } from 'resound-notation/lib/keySignatures';
import slugify from 'editor/util/slugify';

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
  /**
   * @param {HTMLElement} container - #metadata-panel
   * @param {UndoManager} undoManager
   * @param {object} editorScene
   * @param {() => boolean} [isIdLocked] - true when the id must not change
   *   (existing/saved puzzle). Defaults to "locked when an id already exists".
   */
  constructor(container, undoManager, editorScene, isIdLocked) {
    this._container = container;
    this._undoManager = undoManager;
    this._editorScene = editorScene;
    this._isIdLocked = isIdLocked || (() => Boolean(undoManager.getMetadata().id));
    this._collapsed = true;
    this._render();
  }

  /** Expand the panel (e.g. when a fresh puzzle needs naming). */
  expand() {
    this._collapsed = false;
    this._syncCollapsed();
  }

  _syncCollapsed() {
    if (!this._contentEl) return;
    this._contentEl.style.display = this._collapsed ? 'none' : 'block';
    if (this._toggleBtn) this._toggleBtn.textContent = this._collapsed ? '+' : '-';
  }

  _render() {
    this._container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const header = document.createElement('div');
    header.className = 'validation-header';
    const title = document.createElement('label');
    title.className = 'panel-label';
    title.textContent = 'Properties';
    header.appendChild(title);

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.className = 'collapse-btn';
    this._toggleBtn.onclick = () => {
      this._collapsed = !this._collapsed;
      this._syncCollapsed();
    };
    header.appendChild(this._toggleBtn);
    wrapper.appendChild(header);

    const content = document.createElement('div');
    this._contentEl = content;
    wrapper.appendChild(content);

    const meta = this._undoManager.getMetadata();

    // Name (drives the id for new puzzles)
    this._addField(content, 'text', 'Name', meta.name, (val) => {
      const fields = { name: val };
      if (!this._isIdLocked()) fields.id = slugify(val);
      this._undoManager.setMetadata(fields);
      this._renderIdCaption(this._undoManager.getMetadata().id);
    });

    // Derived id caption (read-only save target)
    this._idCaption = document.createElement('div');
    this._idCaption.className = 'id-caption';
    content.appendChild(this._idCaption);
    this._renderIdCaption(meta.id);

    // Difficulty
    this._addSelect(content, 'Difficulty', [1, 2, 3], meta.difficulty, (val) => {
      this._undoManager.setMetadata({ difficulty: Number(val) });
    });

    // Tempo
    this._addField(
      content,
      'number',
      'Tempo (BPM)',
      meta.tempo,
      (val) => {
        this._undoManager.setMetadata({ tempo: Number(val) });
      },
      { min: 20, max: 400, step: 1 }
    );

    // Grid Size
    this._addField(
      content,
      'number',
      'Grid Size',
      meta.gridSize,
      (val) => {
        this._undoManager.setMetadata({ gridSize: Number(val) });
      },
      { min: 1, max: 100, step: 1 }
    );

    // Clap Displacement
    this._addField(
      content,
      'number',
      'Clap Displacement',
      meta.clapDisplacement ?? '',
      (val) => {
        this._undoManager.setMetadata({ clapDisplacement: val === '' ? null : Number(val) });
      },
      { min: 0, max: 1, step: 0.05 }
    );

    // Key Signature
    this._addSelect(content, 'Key Signature', KEY_SIGNATURE_OPTIONS, meta.keySignature, (val) => {
      if (isValidKeySignature(val)) this._undoManager.setMetadata({ keySignature: val });
    });

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
      if (selected) this._undoManager.setMetadata({ timeSignature: selected.value });
    };
    timeRow.appendChild(timeSelect);
    content.appendChild(timeRow);

    this._container.appendChild(wrapper);
    this._syncCollapsed();
  }

  _renderIdCaption(id) {
    if (!this._idCaption) return;
    if (id) {
      this._idCaption.textContent = `Saves to: ${id}.json`;
      this._idCaption.classList.remove('id-caption-empty');
    } else {
      this._idCaption.textContent = 'Not yet saved — add a name';
      this._idCaption.classList.add('id-caption-empty');
    }
  }

  _addSelect(wrapper, labelText, options, current, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('label');
    label.textContent = `${labelText}: `;
    row.appendChild(label);
    const select = document.createElement('select');
    select.className = 'prop-select';
    options.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (current === o) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => onChange(select.value);
    row.appendChild(select);
    wrapper.appendChild(row);
  }

  _addField(wrapper, type, labelText, value, onChange, constraints) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('label');
    label.textContent = `${labelText}: `;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = type;
    input.className = 'prop-input';
    input.value = value;
    if (constraints) {
      if (constraints.min != null) input.min = constraints.min;
      if (constraints.max != null) input.max = constraints.max;
      if (constraints.step != null) input.step = constraints.step;
    }
    input.onchange = () => onChange(input.value);
    row.appendChild(input);

    wrapper.appendChild(row);
  }

  refresh() {
    this._render();
  }
}
