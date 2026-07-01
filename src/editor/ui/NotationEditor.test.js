/**
 * @jest-environment jsdom
 */

/**
 * NotationEditor — interaction + boundary tests.
 *
 * Rendering is delegated to NotationRenderer (covered by its own suite), so
 * these tests focus on what the editor owns: the render/output JSON boundary,
 * dotted-duration normalization, the data-note-index hooks it relies on, and
 * keyboard-driven edits emitting onChange. Click-to-place needs SVG CTM math
 * that jsdom does not implement, so it is exercised via keyboard here.
 */

import NotationEditor from 'editor/ui/NotationEditor';

function makeEditor(opts = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const changes = [];
  const editor = new NotationEditor({
    container,
    onChange: (song) => changes.push(song),
    ...opts,
  });
  return { editor, container, changes };
}

function keydown(editor, key, extra = {}) {
  editor._staffEl.dispatchEvent(new KeyboardEvent('keydown', { key, ...extra }));
}

describe('NotationEditor', () => {
  it('renders the initial song and stamps data-note-index per note', () => {
    const { container } = makeEditor({
      song: [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ],
    });
    // The palette renders small note-icon SVGs too, so target the staff SVG.
    const svg = container.querySelector('.notation-staff svg');
    expect(svg).toBeTruthy();
    expect(svg.querySelector('[data-note-index="0"]')).toBeTruthy();
    expect(svg.querySelector('[data-note-index="1"]')).toBeTruthy();
  });

  it('inserts a note with a duration key and reports it through onChange', () => {
    const { editor, changes } = makeEditor({ song: [{ pitch: 'C4', length: '1/4' }] });
    keydown(editor, '5'); // eighth note
    expect(changes.length).toBe(1);
    const song = changes[changes.length - 1];
    expect(Array.isArray(song)).toBe(true);
    expect(song).toHaveLength(2);
    expect(song.some((n) => n.length === '1/8')).toBe(true);
  });

  it('normalizes dotted durations to the canonical { length, dotted } form on output', () => {
    const { editor, changes } = makeEditor({ song: [{ pitch: 'C4', length: '1/4' }] });
    keydown(editor, 'ArrowLeft'); // select index 0
    keydown(editor, '.'); // toggle dot
    const song = changes[changes.length - 1];
    expect(song[0]).toMatchObject({ pitch: 'C4', length: '1/4', dotted: true });
    // Model keeps the fraction form internally.
    expect(editor._activeModel().toSongArray()[0].length).toBe('3/8');
  });

  it('round-trips a stored dotted note back into the model as a fraction', () => {
    const { editor } = makeEditor({
      song: [{ pitch: 'C4', length: '1/4', dotted: true }],
    });
    expect(editor._activeModel().toSongArray()[0]).toMatchObject({ pitch: 'C4', length: '3/8' });
  });

  it('deletes the selected note', () => {
    const { editor, changes } = makeEditor({
      song: [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ],
    });
    keydown(editor, 'ArrowLeft'); // select index 0
    keydown(editor, 'Delete');
    const song = changes[changes.length - 1];
    expect(song).toHaveLength(1);
    expect(song[0].pitch).toBe('E4');
  });

  it('backspaces the last note when nothing is selected', () => {
    const { editor, changes } = makeEditor({
      song: [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ],
    });
    // Move the cursor to the end (deselecting), then backspace drops the last.
    keydown(editor, 'ArrowRight');
    keydown(editor, 'ArrowRight');
    keydown(editor, 'Backspace');
    const song = changes[changes.length - 1];
    expect(song).toHaveLength(1);
    expect(song[0].pitch).toBe('C4');
  });

  it('clears every note via the Clear button', () => {
    const { editor, container, changes } = makeEditor({
      song: [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ],
    });
    const clearBtn = [...container.querySelectorAll('.song-edit-controls button')].find(
      (b) => b.textContent === 'Clear'
    );
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    expect(changes[changes.length - 1]).toEqual([]);
  });

  it('builds two voices and a brace for grand-staff mode', () => {
    const { editor, container } = makeEditor({
      staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      song: {
        voices: [
          { id: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      },
    });
    const svg = container.querySelector('.notation-staff svg');
    expect(svg.querySelector('[data-voice-id="treble"]')).toBeTruthy();
    expect(svg.querySelector('[data-voice-id="bass"]')).toBeTruthy();

    const out = editor._buildOutputSong();
    expect(out.voices).toHaveLength(2);
    expect(out.staffGroups).toEqual([{ type: 'brace', voiceIds: ['treble', 'bass'] }]);
  });

  it('does not emit onChange for a selection-only change', () => {
    const { editor, changes } = makeEditor({ song: [{ pitch: 'C4', length: '1/4' }] });
    keydown(editor, 'ArrowLeft'); // selection move only
    expect(changes).toHaveLength(0);
  });

  it('renders Play and Stop transport controls', () => {
    const { container } = makeEditor({ song: [{ pitch: 'C4', length: '1/4' }] });
    const labels = [...container.querySelectorAll('.playback-controls button')].map(
      (b) => b.textContent
    );
    expect(labels).toEqual(['Play', 'Stop']);
  });

  it('plays through the injected player and stops it', () => {
    const calls = [];
    const player = {
      play: (opts) => calls.push(['play', opts]),
      stop: () => calls.push(['stop']),
    };
    const { editor } = makeEditor({
      player,
      tempo: 100,
      song: [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/8' },
      ],
    });
    editor.play();
    expect(calls[0][0]).toBe('play');
    expect(calls[0][1]).toMatchObject({ tempo: 100, basis: 4 });
    expect(calls[0][1].data).toHaveLength(2);
    editor.stop();
    expect(calls.some((c) => c[0] === 'stop')).toBe(true);
  });

  it('play/stop do not throw when no player is supplied', () => {
    const { editor } = makeEditor({ song: [{ pitch: 'C4', length: '1/4' }] });
    expect(() => {
      editor.play();
      editor.stop();
    }).not.toThrow();
  });
});
