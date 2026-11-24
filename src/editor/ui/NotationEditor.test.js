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
    const { container, changes } = makeEditor({
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

describe('NotationEditor keyboard rendering', () => {
  const C4 = { pitch: 'C4', length: '1/4' };
  const E4 = { pitch: 'E4', length: '1/4' };
  const G4 = { pitch: 'G4', length: '1/4' };
  const nextFrame = () => jest.advanceTimersByTime(16);
  const staffSvg = (editor) => editor._staffEl.querySelector('svg');

  /** The staff exactly as an immediate full render of the current state draws it. */
  function fullRenderOf(editor) {
    editor._renderStaff();
    return editor._staffEl.innerHTML;
  }

  it('draws nothing for keys that change nothing', () => {
    const { editor } = makeEditor({ song: [C4, E4] });
    const svg = staffSvg(editor);
    const html = editor._staffEl.innerHTML;

    keydown(editor, 'Shift');
    keydown(editor, 'q');
    keydown(editor, '+'); // transpose, but nothing is selected
    nextFrame();

    expect(staffSvg(editor)).toBe(svg);
    expect(editor._staffEl.innerHTML).toBe(html);
  });

  it('engraves a burst of edits once, on the next frame, showing the last', () => {
    const { editor, changes } = makeEditor({ song: [C4, E4] });
    const render = jest.spyOn(editor._renderer, 'render');

    keydown(editor, 'ArrowLeft'); // select E4
    keydown(editor, '+');
    keydown(editor, '+');
    keydown(editor, '+');
    expect(changes).toHaveLength(3); // every edit still reported at once
    expect(render).not.toHaveBeenCalled();

    nextFrame();
    expect(render).toHaveBeenCalledTimes(1);
    const drawn = editor._staffEl.innerHTML;
    expect(staffSvg(editor).querySelector('.note-selected')).toBeTruthy();
    expect(drawn).toBe(fullRenderOf(editor));
  });

  it('moves the selection and cursor without re-engraving, drawn as a full render would', () => {
    const { editor } = makeEditor({ song: [C4, E4, G4] });
    const render = jest.spyOn(editor._renderer, 'render');

    ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowRight'].forEach((key) => {
      keydown(editor, key);
      nextFrame();
    });

    expect(render).not.toHaveBeenCalled();
    expect(editor._staffEl.innerHTML).toBe(fullRenderOf(editor));
  });

  it('switches voices on the overlay alone (grand staff)', () => {
    const { editor } = makeEditor({
      staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      song: {
        voices: [
          { id: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      },
    });
    const render = jest.spyOn(editor._renderer, 'render');

    // Both voices start alike (cursor at the end, nothing selected), so only
    // the voice itself tells the first switch apart.
    [['Enter'], ['ArrowLeft'], ['Enter', { shiftKey: true }]].forEach(([key, extra]) => {
      const engraved = render.mock.calls.length;
      keydown(editor, key, extra);
      nextFrame();
      expect(render.mock.calls.length).toBe(engraved);
      expect(editor._staffEl.innerHTML).toBe(fullRenderOf(editor));
    });
  });

  describe('when the staff is resized', () => {
    let staffWidth;
    let observers;

    // A browser that lays the staff out `staffWidth` px wide and tells every
    // ResizeObserver watching it when that changes.
    beforeEach(() => {
      staffWidth = 800;
      observers = [];
      jest.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function width() {
        return this.classList.contains('notation-staff') ? staffWidth : 0;
      });
      global.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
          this.targets = new Set();
          observers.push(this);
        }

        observe(el) {
          this.targets.add(el);
        }

        disconnect() {
          this.targets.clear();
        }
      };
    });

    afterEach(() => {
      delete global.ResizeObserver;
      jest.restoreAllMocks();
    });

    function resizeStaff(editor, width) {
      staffWidth = width;
      observers
        .filter((observer) => observer.targets.has(editor._staffEl))
        .forEach((observer) => observer.callback([{ target: editor._staffEl }], observer));
    }

    it('re-engraves for the new width on the next frame, overlay and all', () => {
      const { editor } = makeEditor({ song: [C4, E4, G4] });
      keydown(editor, 'ArrowLeft'); // select G4: a highlight and a cursor to keep
      nextFrame();
      const before = staffSvg(editor);

      resizeStaff(editor, 500);
      nextFrame();

      expect(staffSvg(editor)).not.toBe(before);
      expect(Number(staffSvg(editor).getAttribute('width'))).toBeCloseTo(500);
      expect(staffSvg(editor).querySelector('.note-selected')).toBeTruthy();
      expect(editor._staffEl.innerHTML).toBe(fullRenderOf(editor));
    });

    it('selects a note clicked after a resize, rather than adding one', () => {
      const { editor, changes } = makeEditor({ song: [C4, E4, G4] });
      resizeStaff(editor, 500);
      nextFrame();

      const first = staffSvg(editor).querySelector('[data-voice-id="v0"] .note');
      first.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(changes).toHaveLength(0);
      expect(first.classList.contains('note-selected')).toBe(true);
    });

    it('engraves once a frame, however many resizes and keys arrive in it', () => {
      const { editor } = makeEditor({ song: [C4, E4] });
      const render = jest.spyOn(editor._renderer, 'render');

      resizeStaff(editor, 600);
      keydown(editor, 'ArrowLeft');
      resizeStaff(editor, 500);
      keydown(editor, '+');
      nextFrame();

      expect(render).toHaveBeenCalledTimes(1);
    });

    it('leaves the staff alone at the width it was engraved for, or under 2 px from it', () => {
      const { editor } = makeEditor({ song: [C4, E4] });
      const render = jest.spyOn(editor._renderer, 'render');

      resizeStaff(editor, 800); // observing starts at the width it was engraved for
      resizeStaff(editor, 801);
      nextFrame();

      expect(render).not.toHaveBeenCalled();
    });

    it('stops watching once disposed', () => {
      const { editor } = makeEditor({ song: [C4, E4] });
      const render = jest.spyOn(editor._renderer, 'render');

      editor.dispose();
      resizeStaff(editor, 500);
      nextFrame();

      expect(render).not.toHaveBeenCalled();
    });
  });

  it('keeps the playing note lit through an edit', () => {
    const { editor } = makeEditor({ song: [C4, E4, G4], tempo: 60 });
    editor.play();
    jest.advanceTimersByTime(100); // a few frames into the first beat
    expect(staffSvg(editor).querySelector('.note-active')).toBeTruthy();

    keydown(editor, 'ArrowLeft');
    keydown(editor, '+'); // re-engraves on the next frame, after playback's own
    nextFrame();

    expect(staffSvg(editor).querySelector('.note-active')).toBeTruthy();
    editor.stop();
  });
});

describe('NotationEditor note entry', () => {
  const C4 = { pitch: 'C4', length: '1/4' };
  const E4 = { pitch: 'E4', length: '1/4' };
  const G4 = { pitch: 'G4', length: '1/4' };
  const nextFrame = () => jest.advanceTimersByTime(16);
  const pitches = (song) => song.map((n) => n.pitch || 'rest');

  it('entering notes mid-song puts each after the one before, as at the end', () => {
    const { editor, changes } = makeEditor({ song: [C4, E4, G4] });
    keydown(editor, 'ArrowRight'); // on E4
    keydown(editor, '4'); // a quarter at the cursor (E4's pitch) ...
    keydown(editor, '+'); // ... raised: F4
    keydown(editor, '4'); // the next one goes after it, not before
    keydown(editor, '+');
    keydown(editor, '+'); // F#4 -> G4
    keydown(editor, 'r'); // and a rest after that
    expect(pitches(changes.at(-1))).toEqual(['C4', 'F4', 'G4', 'rest', 'E4', 'G4']);
  });

  it('right from a note just entered selects the next note, without skipping it', () => {
    const { editor } = makeEditor({ song: [C4, E4, G4] });
    keydown(editor, 'ArrowRight'); // on E4
    keydown(editor, '4'); // entered before E4; E4 is next
    keydown(editor, 'ArrowRight');
    expect(editor.selectedNote).toMatchObject({ pitch: 'E4' });
  });

  it('Delete on a note just entered takes it back, as a backspace', () => {
    const { editor, changes } = makeEditor({ song: [C4, E4, G4] });
    keydown(editor, 'ArrowRight');
    keydown(editor, '4');
    keydown(editor, '+'); // F4, entered between C4 and E4
    keydown(editor, 'Delete');
    expect(pitches(changes.at(-1))).toEqual(['C4', 'E4', 'G4']);
    expect(editor.selectedNote).toMatchObject({ pitch: 'C4' }); // back after C4 ...
    keydown(editor, '4'); // ... so the next entry goes where F4 was
    expect(pitches(changes.at(-1))).toEqual(['C4', 'C4', 'E4', 'G4']);
  });

  it('a duration key also makes that the chosen duration, for rests and the palette', () => {
    const { editor, container, changes } = makeEditor({ song: [C4] });
    keydown(editor, 'ArrowRight'); // past C4
    keydown(editor, '5'); // an eighth note
    keydown(editor, 'r'); // so an eighth rest too
    expect(changes.at(-1).slice(1)).toEqual([{ pitch: 'C4', length: '1/8' }, { length: '1/8' }]);
    expect(container.querySelector('.rhythm-btn.active').dataset.length).toBe('1/8');
  });

  it('a new note with nothing (or a rest) selected takes the pitch of the note before', () => {
    const { editor, changes } = makeEditor({ song: [C4, E4, G4] });
    ['ArrowRight', 'ArrowRight', 'ArrowRight'].forEach((k) => keydown(editor, k)); // at the end
    keydown(editor, 'r'); // a rest, selected
    keydown(editor, '4');
    expect(changes.at(-1).at(-1)).toEqual({ pitch: 'G4', length: '1/4' });
  });

  it('leaves Cmd / Ctrl / Alt shortcuts to the browser and the modal', () => {
    const { editor, changes } = makeEditor({ song: [C4] });
    keydown(editor, 'ArrowLeft'); // C4 selected
    keydown(editor, 'r', { metaKey: true }); // Cmd+R reloads; no rest
    keydown(editor, 'b', { ctrlKey: true });
    keydown(editor, '4', { altKey: true });
    expect(changes).toHaveLength(0);
  });

  it('Space plays and stops', () => {
    const player = { play: jest.fn(), stop: jest.fn() };
    const { editor } = makeEditor({ song: [C4], player });
    keydown(editor, ' ');
    expect(editor.isPlaying).toBe(true);
    expect(player.play).toHaveBeenCalled();
    keydown(editor, ' ');
    expect(editor.isPlaying).toBe(false);
  });

  it('a palette, transport or Clear button hands the keyboard back to the staff', () => {
    const { editor, container } = makeEditor({ song: [C4] });
    const buttons = [
      container.querySelectorAll('.rhythm-btn')[4],
      ...container.querySelectorAll('.playback-controls button, .song-edit-controls button'),
    ];
    buttons.forEach((button) => {
      button.focus();
      button.click();
      expect(document.activeElement).toBe(editor._staffEl);
    });
  });

  it('the hint lists the duration keys, and the grand staff its staff switch', () => {
    const single = makeEditor({ song: [C4] }).container.querySelector('.song-edit-hint');
    expect(single.textContent).toContain('2–7');
    expect(single.textContent).not.toContain('other staff');
    const grand = makeEditor({
      staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
    }).container.querySelector('.song-edit-hint');
    expect(grand.textContent).toContain('other staff');
  });

  it('setSong shows a restored song, keeping the cursor where the notes still reach', () => {
    const { editor } = makeEditor({ song: [C4, E4, G4] });
    keydown(editor, 'ArrowRight'); // on E4
    editor.setSong([C4, { pitch: 'F4', length: '1/4' }]);
    expect(editor.selectedNote).toMatchObject({ pitch: 'F4' });
    expect(editor._staffEl.querySelectorAll('[data-voice-id="v0"] .note')).toHaveLength(2);
    editor.setSong([]);
    expect(editor.selectedNote).toBeNull();
  });

  describe('a song long enough to wrap onto several systems', () => {
    const song = Array.from({ length: 40 }, () => ({ ...C4 }));

    beforeEach(() => {
      jest.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function width() {
        return this.classList.contains('notation-staff') ? 800 : 0;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      delete Element.prototype.scrollIntoView;
    });

    const systems = (editor) => [...editor._staffEl.querySelectorAll('svg [data-voice-id="v0"]')];

    it('draws the edit cursor on the system of the note it is at', () => {
      const { editor } = makeEditor({ song });
      expect(systems(editor).length).toBeGreaterThan(2);
      for (let i = 0; i < 30; i += 1) keydown(editor, 'ArrowRight');
      nextFrame();
      const svg = editor._staffEl.querySelector('svg');
      const selectedSystem = svg.querySelector('.note-selected').closest('[data-voice-id]');
      expect(selectedSystem).not.toBe(systems(editor)[0]);
      expect(svg.querySelector('.cursor-line').parentNode).toBe(selectedSystem);
    });

    it('scrolls the edit cursor (its whole staff) into sight after a move', () => {
      const scrolled = [];
      Element.prototype.scrollIntoView = function scrollIntoView() {
        scrolled.push(this);
      };
      const { editor } = makeEditor({ song });
      for (let i = 0; i < 30; i += 1) keydown(editor, 'ArrowRight');
      nextFrame();
      const cursor = editor._staffEl.querySelector('.cursor-line');
      expect(scrolled.at(-1)).toBe(cursor);
      expect(cursor.parentNode).toBe(
        editor._staffEl.querySelector('.note-selected').closest('[data-voice-id]')
      );
    });

    it('places a click by the system clicked, not the first one', () => {
      const { editor, changes } = makeEditor({ song });
      const svg = editor._staffEl.querySelector('svg');
      const height = 2000;
      svg.getBoundingClientRect = () => ({ top: 0, left: 0, width: 800, height });
      Object.defineProperty(svg, 'viewBox', {
        value: { baseVal: { x: 0, y: 0, width: 800, height } },
        configurable: true,
      });
      const second = systems(editor)[1];
      const [, offsetY] = second.getAttribute('transform').match(/,\s*([-\d.]+)/);
      // The middle line of the second system (staff-local 50): B4 in treble
      svg.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 400, clientY: Number(offsetY) + 50 })
      );
      expect(changes.at(-1).at(-1)).toEqual({ pitch: 'B4', length: '1/4' });
    });
  });
});
