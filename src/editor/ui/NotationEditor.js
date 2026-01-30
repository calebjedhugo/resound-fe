/**
 * NotationEditor
 *
 * Main controller that brings together SongModel, StaffInteraction,
 * RhythmPalette, and renders an interactive SVG staff for song editing.
 */
import SongModel from 'editor/model/SongModel';
import RhythmPalette, { DURATIONS } from 'editor/ui/RhythmPalette';
import { yToPitch, createNoteFromClick, calculateBarlines } from 'editor/ui/StaffInteraction';

export default class NotationEditor {
  constructor(container, undoManager, entityId, options = {}) {
    this._container = container;
    this._undoManager = undoManager;
    this._entityId = entityId;
    this._polyphonic = options.polyphonic !== undefined ? options.polyphonic : true;
    this._songModel = new SongModel();
    this._palette = null;
    this._staffEl = null;

    this._loadSong();
    this._render();
  }

  _loadSong() {
    const entity = this._undoManager.getEntity(this._entityId);
    if (entity && entity.data && entity.data.song) {
      this._songModel.fromSongArray(JSON.parse(JSON.stringify(entity.data.song)));
    }
  }

  _saveSong() {
    const entity = this._undoManager.getEntity(this._entityId);
    if (!entity) return;
    const newData = {
      ...entity.data,
      song: JSON.parse(JSON.stringify(this._songModel.toSongArray())),
    };
    this._undoManager.updateEntity(this._entityId, { data: newData });
  }

  _render() {
    this._container.innerHTML = '';

    // Rhythm palette
    const paletteContainer = document.createElement('div');
    this._palette = new RhythmPalette(paletteContainer, () => {
      // Duration selected from palette — no additional action needed
    });
    this._container.appendChild(paletteContainer);

    // Staff SVG area
    this._staffEl = document.createElement('div');
    this._staffEl.className = 'notation-staff';
    this._staffEl.tabIndex = 0; // Make focusable for keyboard input
    this._container.appendChild(this._staffEl);

    // Render the notation
    this._renderStaff();

    // Staff click handler
    this._staffEl.addEventListener('click', (e) => this._handleStaffClick(e));
    this._staffEl.addEventListener('keydown', (e) => this._handleKeyDown(e));

    // Playback controls
    const controls = document.createElement('div');
    controls.className = 'playback-controls';
    const playBtn = document.createElement('button');
    playBtn.className = 'editor-btn';
    playBtn.textContent = 'Play';
    playBtn.onclick = () => this._play();
    const stopBtn = document.createElement('button');
    stopBtn.className = 'editor-btn';
    stopBtn.textContent = 'Stop';
    stopBtn.onclick = () => this._stop();
    controls.appendChild(playBtn);
    controls.appendChild(stopBtn);
    this._container.appendChild(controls);
  }

  _renderStaff() {
    const notes = this._songModel.toSongArray();

    // Build a simple visual representation
    this._staffEl.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '120');
    svg.setAttribute('viewBox', '0 0 500 120');
    svg.style.background = '#0a1628';

    // Draw staff lines
    for (let i = 0; i < 5; i++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '10');
      line.setAttribute('x2', '490');
      line.setAttribute('y1', 20 + i * 10);
      line.setAttribute('y2', 20 + i * 10);
      line.setAttribute('stroke', '#445566');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }

    // Draw notes
    let xPos = 40;
    notes.forEach((note, i) => {
      const noteObj = Array.isArray(note) ? note[0] : note;
      const noteEl = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      // Simple Y positioning based on pitch
      const pitchY = this._pitchToSimpleY(noteObj.pitch);
      noteEl.setAttribute('cx', xPos);
      noteEl.setAttribute('cy', pitchY);
      noteEl.setAttribute('rx', 6);
      noteEl.setAttribute('ry', 4);
      noteEl.setAttribute('fill', i === this._songModel._selectedIndex ? '#ffaa00' : '#e0e0e0');
      noteEl.setAttribute('data-index', i);
      noteEl.style.cursor = 'pointer';
      svg.appendChild(noteEl);

      // Note label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', xPos);
      label.setAttribute('y', pitchY + 16);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#8899aa');
      label.setAttribute('font-size', '8');
      label.textContent = noteObj.pitch;
      svg.appendChild(label);

      xPos += 40;
    });

    // Draw barlines
    const barlines = calculateBarlines(notes);
    barlines.forEach((pos) => {
      const barX = 40 + pos * 40 - 20;
      const barLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      barLine.setAttribute('x1', barX);
      barLine.setAttribute('x2', barX);
      barLine.setAttribute('y1', '20');
      barLine.setAttribute('y2', '60');
      barLine.setAttribute('stroke', '#667788');
      barLine.setAttribute('stroke-width', '1');
      svg.appendChild(barLine);
    });

    // Cursor indicator
    const cursorX = 40 + this._songModel._cursorPosition * 40;
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    cursor.setAttribute('x1', cursorX - 10);
    cursor.setAttribute('x2', cursorX - 10);
    cursor.setAttribute('y1', '18');
    cursor.setAttribute('y2', '62');
    cursor.setAttribute('stroke', '#44ff88');
    cursor.setAttribute('stroke-width', '2');
    cursor.setAttribute('opacity', '0.6');
    svg.appendChild(cursor);

    this._staffEl.appendChild(svg);
  }

  _pitchToSimpleY(pitch) {
    // Simple pitch to Y mapping for treble clef
    const pitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'];
    const index = pitches.indexOf(pitch);
    if (index === -1) return 40; // middle of staff
    // Bottom of staff (E4) = 60, top (F5) = 20
    return 60 - (index - 2) * 5; // E4 is index 2, maps to y=60
  }

  _handleStaffClick(e) {
    const svg = this._staffEl.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    const svgY = (e.clientY - rect.top) * scaleY;

    if (e.shiftKey && this._songModel._selectedIndex !== null && this._polyphonic) {
      // Chord building
      const note = createNoteFromClick(svgY, this._palette.activeLength);
      this._songModel.makeChord(this._songModel._selectedIndex, note.pitch, note.length);
    } else {
      // Normal note placement
      const note = createNoteFromClick(svgY, this._palette.activeLength);
      this._songModel.appendNote(note.pitch, note.length);
      this._songModel._selectedIndex = this._songModel._notes.length - 1;
    }

    this._saveSong();
    this._renderStaff();
  }

  _handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this._songModel.moveCursor('left');
        if (this._songModel._cursorPosition < this._songModel._notes.length) {
          this._songModel._selectedIndex = this._songModel._cursorPosition;
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._songModel.moveCursor('right');
        if (this._songModel._cursorPosition < this._songModel._notes.length) {
          this._songModel._selectedIndex = this._songModel._cursorPosition;
        } else {
          this._songModel._selectedIndex = null;
        }
        break;
      case '+':
      case '=':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.transposeUp(this._songModel._selectedIndex);
          this._saveSong();
        }
        break;
      case '-':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.transposeDown(this._songModel._selectedIndex);
          this._saveSong();
        }
        break;
      case '.':
        if (this._songModel._selectedIndex !== null) {
          this._songModel.toggleDot(this._songModel._selectedIndex);
          this._saveSong();
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (this._songModel._selectedIndex !== null) {
          this._songModel.removeNote(this._songModel._selectedIndex);
          // Adjust selection
          if (this._songModel._notes.length === 0) {
            this._songModel._selectedIndex = null;
          } else if (this._songModel._selectedIndex >= this._songModel._notes.length) {
            this._songModel._selectedIndex = this._songModel._notes.length - 1;
          }
          this._saveSong();
        }
        break;
      default: {
        // Number keys 2-9 for note insertion
        const dur = DURATIONS.find((d) => d.key === e.key);
        if (dur) {
          const pitch =
            this._songModel._selectedIndex !== null
              ? Array.isArray(this._songModel._notes[this._songModel._selectedIndex])
                ? this._songModel._notes[this._songModel._selectedIndex][0].pitch
                : this._songModel._notes[this._songModel._selectedIndex].pitch
              : 'C4';

          if (this._songModel._cursorPosition >= this._songModel._notes.length) {
            this._songModel.appendNote(pitch, dur.length);
            this._songModel._selectedIndex = this._songModel._notes.length - 1;
          } else {
            this._songModel.insertNote(pitch, dur.length);
            this._songModel._selectedIndex = this._songModel._cursorPosition;
          }
          this._saveSong();
        }
        break;
      }
    }

    this._renderStaff();
  }

  _play() {
    // Placeholder -- full audio playback would use existing Web Audio instruments
    console.warn('Playback not yet implemented in editor');
  }

  _stop() {
    console.warn('Stop not yet implemented in editor');
  }

  dispose() {
    this._container.innerHTML = '';
  }
}
