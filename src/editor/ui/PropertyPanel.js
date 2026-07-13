/**
 * PropertyPanel
 *
 * Displays editable properties for the currently selected entity.
 * Shown when an entity is selected, hidden when deselected.
 * Fields vary by entity type (creature, gate, fountain, ramp, wall).
 */
import { addSelectRow, addInputRow } from 'editor/ui/fieldRows';
import {
  fetchLinkTargets,
  fetchTargetGates,
  localTargetGates,
  createLink,
  clearLink,
  renameGateId,
} from 'editor/io/portalLinks';

export default class PropertyPanel {
  constructor(container, undoManager, entityPlacer, onDelete, onEditSong, onToast) {
    this._container = container; // #property-panel
    this._undoManager = undoManager;
    this._entityPlacer = entityPlacer;
    this._onDelete = onDelete || null;
    this._onEditSong = onEditSong || null;
    this._onToast = onToast || null;
    this._selectedId = null;
  }

  _toast(message, kind = 'error') {
    if (this._onToast) this._onToast(message, kind);
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
        this._renderGateFields(wrapper, entity);
        this._renderSongEditor(wrapper, entity);
        this._renderPortalSection(wrapper, entity);
        break;
      case 'fountain':
        this._renderSongEditor(wrapper, entity);
        break;
      case 'ramp':
        this._renderRampFields(wrapper, entity);
        break;
      default:
        break; // wall, cleanser, and player: position only
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
    this._addTextField(
      wrapper,
      'Clap Displacement',
      data.clapDisplacement || '',
      (val) => {
        const newData = {
          ...this._undoManager.getEntity(this._selectedId).data,
          clapDisplacement: val || undefined,
        };
        this._undoManager.updateEntity(this._selectedId, { data: newData });
      },
      'Optional, 0–1: when the player claps, this creature restarts its song shifted by this fraction of a whole note (e.g. 0.0625 = one 16th). Empty = no shift.'
    );

    // Song editor button
    this._renderSongEditor(wrapper, entity);
  }

  _renderGateFields(wrapper, entity) {
    const data = entity.data || {};

    // Stable gate id (rename keeps a linked partner's back-link in sync)
    this._addTextField(
      wrapper,
      'Gate ID',
      data.gateId || '',
      (val) => {
        renameGateId(this._undoManager, this._selectedId, val)
          .then(() => this.show(this._selectedId))
          .catch((err) => {
            this._toast(err.message);
            this.show(this._selectedId); // restore the real value
          });
      },
      'Stable id other puzzles use to link to this gate. Unique within this puzzle.'
    );

    // Facing dropdown PARKED (2026-07-07): doors are omnidirectional by
    // default — every side of a gate can be walked through, and arrival
    // picks a clear side (PortalManager._arrivalDirection) — so the editor
    // no longer asks. `facing` still exists in the schema/model (defaulted
    // "north") and still orients the see-through render surface; Caleb may
    // bring the affordance back later. To restore, uncomment and re-import
    // GATE_FACINGS from 'editor/util/gateIds'.
    // addSelectRow(wrapper, 'Facing', GATE_FACINGS, data.facing || 'north', (facing) => {
    //   const newData = { ...this._undoManager.getEntity(this._selectedId).data, facing };
    //   this._undoManager.updateEntity(this._selectedId, { data: newData });
    // });
  }

  /**
   * Portal link controls: shows the current cross-puzzle link, or pickers to
   * create one (target puzzle → target gate). All link mutations go through
   * editor/io/portalLinks so the partner puzzle's file stays in sync.
   */
  _renderPortalSection(wrapper, entity) {
    const section = document.createElement('div');
    section.className = 'panel-section portal-section';
    section.style.marginTop = '12px';

    const label = document.createElement('label');
    label.className = 'panel-label';
    label.textContent = 'Portal Link';
    section.appendChild(label);

    const link = entity.data && entity.data.link;
    if (link) {
      this._renderExistingLink(section, link);
    } else {
      this._renderLinkPickers(section);
    }

    wrapper.appendChild(section);
  }

  _renderExistingLink(section, link) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.textContent = `→ ${link.puzzleId} / ${link.gateId}`;
    section.appendChild(row);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'editor-btn';
    clearBtn.textContent = 'Clear Link';
    clearBtn.style.width = '100%';
    clearBtn.onclick = () => {
      clearLink(this._undoManager, this._selectedId)
        .then(() => {
          this._entityPlacer.refreshLinkBadge(this._selectedId);
          this._toast('Link cleared (both sides)', 'success');
          this.show(this._selectedId);
        })
        .catch((err) => this._toast(err.message));
    };
    section.appendChild(clearBtn);
  }

  _renderLinkPickers(section) {
    const puzzleSelect = document.createElement('select');
    puzzleSelect.className = 'prop-select portal-puzzle-select';
    puzzleSelect.style.width = '100%';
    puzzleSelect.innerHTML = '<option value="">— link to puzzle —</option>';
    section.appendChild(puzzleSelect);

    const gateSelect = document.createElement('select');
    gateSelect.className = 'prop-select portal-gate-select';
    gateSelect.style.width = '100%';
    gateSelect.style.marginTop = '4px';
    gateSelect.disabled = true;
    gateSelect.innerHTML = '<option value="">— gate —</option>';
    section.appendChild(gateSelect);

    const linkBtn = document.createElement('button');
    linkBtn.className = 'editor-btn';
    linkBtn.textContent = 'Link Gates';
    linkBtn.style.width = '100%';
    linkBtn.style.marginTop = '4px';
    linkBtn.disabled = true;
    section.appendChild(linkBtn);

    const currentPuzzleId = this._undoManager.getMetadata().id;
    fetchLinkTargets()
      .then((puzzles) => {
        for (const p of puzzles) {
          const opt = document.createElement('option');
          opt.value = p.id;
          // Same-puzzle doors are in-level teleporters — label, don't hide
          opt.textContent =
            p.id === currentPuzzleId ? `${p.name || p.id} (this puzzle)` : p.name || p.id;
          puzzleSelect.appendChild(opt);
        }
      })
      .catch((err) => this._toast(`Couldn't list puzzles: ${err.message}`));

    puzzleSelect.onchange = () => {
      gateSelect.innerHTML = '<option value="">— gate —</option>';
      gateSelect.disabled = true;
      linkBtn.disabled = true;
      if (!puzzleSelect.value) return;
      // The open puzzle's gates come from the live model (fresh, and no
      // write-on-read); another puzzle's from its repo file.
      const gatesPromise =
        puzzleSelect.value === currentPuzzleId
          ? Promise.resolve(localTargetGates(this._undoManager, this._selectedId))
          : fetchTargetGates(puzzleSelect.value);
      gatesPromise
        .then((gates) => {
          if (gates.length === 0) {
            this._toast(`"${puzzleSelect.value}" has no linkable gates`);
            return;
          }
          for (const g of gates) {
            const opt = document.createElement('option');
            opt.value = g.gateId;
            const at = g.position ? ` (${g.position.x}, ${g.position.z})` : '';
            // A gate claimed by a third puzzle can't be linked to
            if (g.link) {
              opt.disabled = true;
              opt.textContent = `${g.gateId}${at} — linked to ${g.link.puzzleId}`;
            } else {
              opt.textContent = `${g.gateId}${at}`;
            }
            gateSelect.appendChild(opt);
          }
          gateSelect.disabled = false;
        })
        .catch((err) => this._toast(`Couldn't load gates: ${err.message}`));
    };

    gateSelect.onchange = () => {
      linkBtn.disabled = !gateSelect.value;
    };

    linkBtn.onclick = () => {
      linkBtn.disabled = true;
      createLink(this._undoManager, this._selectedId, puzzleSelect.value, gateSelect.value, {
        confirmSongReplace: () =>
          // eslint-disable-next-line no-alert -- dev-tool confirm before deleting an authored song
          window.confirm(
            `Both gates have songs. Linking replaces "${gateSelect.value}"'s song with this ` +
              "gate's (linked gates are one door and share one song). Continue?"
          ),
      })
        .then(({ warnings, cancelled }) => {
          if (cancelled) {
            this._toast('Link cancelled — kept both songs');
            linkBtn.disabled = false;
            return;
          }
          this._entityPlacer.refreshLinkBadge(this._selectedId);
          // One toast element: a mismatch warning outranks the success note
          if (warnings.length > 0) this._toast(warnings.join(' • '));
          else this._toast('Gates linked (both sides)', 'success');
          this.show(this._selectedId);
        })
        .catch((err) => {
          this._toast(err.message);
          linkBtn.disabled = false;
        });
    };
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

    addSelectRow(wrapper, 'Direction', directions, data.direction, (direction) => {
      const newData = {
        ...this._undoManager.getEntity(this._selectedId).data,
        direction,
      };
      this._undoManager.updateEntity(this._selectedId, { data: newData });
      // Update mesh rotation
      const mesh = this._entityPlacer.getMeshById(this._selectedId);
      if (mesh) {
        mesh.rotation.set(0, 0, 0);
        this._entityPlacer._applyRampRotation(mesh, direction);
      }
    });
  }

  _addNumberField(wrapper, labelText, value, onChange) {
    addInputRow(wrapper, {
      type: 'number',
      step: 'any',
      label: labelText,
      value,
      onChange: (val) => onChange(Number(val)),
    });
  }

  _addTextField(wrapper, labelText, value, onChange, tooltip) {
    addInputRow(wrapper, { type: 'text', label: labelText, value, onChange, tooltip });
  }
}
