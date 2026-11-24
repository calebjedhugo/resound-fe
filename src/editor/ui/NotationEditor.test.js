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

  it('a duration key enters a REST of it at the end and reports it through onChange', () => {
    const { editor, changes } = makeEditor({ song: [{ pitch: 'C4', length: '1/4' }] });
    keydown(editor, '5'); // eighth
    expect(changes.length).toBe(1);
    expect(changes[0]).toEqual([{ pitch: 'C4', length: '1/4' }, { length: '1/8' }]);
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

  it('Delete turns the note at the cursor into a rest, and the rest it leaves goes next', () => {
    const { editor, changes } = makeEditor({
      song: [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/2', dotted: true },
      ],
    });
    keydown(editor, 'ArrowLeft');
    keydown(editor, 'ArrowLeft'); // on C4
    keydown(editor, 'Delete');
    expect(changes.at(-1)).toEqual([
      { length: '1/4' },
      { pitch: 'E4', length: '1/2', dotted: true },
    ]);
    keydown(editor, 'Delete');
    expect(changes.at(-1)).toEqual([{ pitch: 'E4', length: '1/2', dotted: true }]);
    keydown(editor, 'ArrowRight');
    keydown(editor, 'Backspace'); // the dotted half keeps its value as a rest
    expect(changes.at(-1)).toEqual([{ length: '1/2', dotted: true }]);
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
    keydown(editor, 'ArrowRight'); // already at the end
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

    // Both voices start alike (cursor at the end), so only the voice itself
    // tells the first switch apart.
    [['Tab'], ['ArrowLeft'], ['Tab', { shiftKey: true }]].forEach(([key, extra]) => {
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

  it('opens with the edit cursor at the END, on the last entry', () => {
    const { editor } = makeEditor({ song: [C4, E4, G4] });
    expect(editor.cursorPosition).toBe(3);
    expect(editor.selectedNote).toMatchObject({ pitch: 'G4' });
    expect(makeEditor().editor.cursorPosition).toBe(0);
  });

  it('entering rests mid-song puts each after the one before, as at the end', () => {
    const { editor, changes } = makeEditor({ song: [C4, E4, G4], timeSignature: null });
    keydown(editor, 'ArrowLeft');
    keydown(editor, 'ArrowLeft'); // on E4: entries go in before it
    keydown(editor, '4');
    keydown(editor, '5'); // the next one goes after the first, not before
    expect(changes.at(-1)).toEqual([C4, { length: '1/4' }, { length: '1/8' }, E4, G4]);
  });

  it('right from an entry just entered selects the next one, without skipping it', () => {
    const { editor } = makeEditor({ song: [C4, E4, G4], timeSignature: null });
    keydown(editor, 'ArrowLeft');
    keydown(editor, 'ArrowLeft'); // on E4
    keydown(editor, 'r'); // entered before E4; E4 is next
    keydown(editor, 'ArrowRight');
    expect(editor.selectedNote).toMatchObject({ pitch: 'E4' });
  });

  it('Delete on a rest just entered takes it back, as a backspace', () => {
    const { editor, changes } = makeEditor({ song: [C4, E4, G4], timeSignature: null });
    keydown(editor, 'ArrowLeft');
    keydown(editor, 'ArrowLeft'); // on E4
    keydown(editor, 'r'); // a rest between C4 and E4
    keydown(editor, 'Delete');
    expect(changes.at(-1)).toEqual([C4, E4, G4]);
    expect(editor.selectedNote).toMatchObject({ pitch: 'C4' }); // back after C4 ...
    keydown(editor, '5'); // ... so the next entry goes where the rest was
    expect(changes.at(-1)).toEqual([C4, { length: '1/8' }, E4, G4]);
  });

  it('a duration key also makes that the chosen duration, for r and the palette', () => {
    const { editor, container, changes } = makeEditor({ song: [C4] });
    keydown(editor, '5'); // an eighth rest
    keydown(editor, 'r'); // so an eighth rest again
    expect(changes.at(-1).slice(1)).toEqual([{ length: '1/8' }, { length: '1/8' }]);
    expect(container.querySelector('.rhythm-btn.active').dataset.length).toBe('1/8');
  });

  it('never puts a pitch in on its own: entry is always a rest first', () => {
    const { editor, changes } = makeEditor({ song: [C4, E4, G4], timeSignature: null });
    ['2', '3', '4', '5', '6', '7', 'r'].forEach((k) => keydown(editor, k));
    expect(changes.at(-1)).toHaveLength(10);
    expect(
      changes
        .at(-1)
        .slice(3)
        .every((entry) => !entry.pitch)
    ).toBe(true);
    const empty = makeEditor();
    keydown(empty.editor, 'Enter'); // nothing at the cursor: ✕ enters the rest
    expect(empty.changes.at(-1)).toHaveLength(1);
    expect(empty.changes.at(-1)[0].pitch).toBeUndefined();
    keydown(empty.editor, 'Enter'); // and ✕ again puts the pitch on it
    expect(empty.changes.at(-1)[0].pitch).toBeTruthy();
  });

  it('leaves Cmd / Ctrl / Alt shortcuts to the browser and the modal', () => {
    const { editor, changes } = makeEditor({ song: [C4] });
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
      for (let i = 0; i < 10; i += 1) keydown(editor, 'ArrowLeft');
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
      for (let i = 0; i < 30; i += 1) keydown(editor, 'ArrowLeft');
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

describe('NotationEditor rest-first entry (the designer, 2026-11-24)', () => {
  const C4 = { pitch: 'C4', length: '1/4' };
  const nextFrame = () => jest.advanceTimersByTime(16);
  const last = (changes) => changes.at(-1);

  it('a rest goes in first; Enter puts the pitch cursor’s pitch on it, again takes it off', () => {
    const { editor, changes } = makeEditor({ song: [] });
    expect(editor.pitchCursor).toBe('B4'); // the treble staff's middle line, nothing written
    editor.insertRest();
    expect(last(changes)).toEqual([{ length: '1/4' }]);
    keydown(editor, 'ArrowUp');
    keydown(editor, 'ArrowUp'); // D5
    keydown(editor, 'Enter');
    expect(last(changes)).toEqual([{ pitch: 'D5', length: '1/4' }]);
    keydown(editor, 'Enter'); // D5 again: off, leaving the rest
    expect(last(changes)).toEqual([{ length: '1/4' }]);
  });

  it('builds chords at the pitch cursor — no pitch twice — and the last pitch off leaves a rest', () => {
    const { editor, changes } = makeEditor({ song: [{ length: '1/2' }] });
    editor.cross(); // B4
    editor.movePitchCursor(-2);
    editor.cross(); // G4 joins: low to high
    expect(last(changes)).toEqual([
      [
        { pitch: 'G4', length: '1/2' },
        { pitch: 'B4', length: '1/2' },
      ],
    ]);
    editor.movePitchCursor(2);
    editor.cross(); // B4 off
    expect(last(changes)).toEqual([{ pitch: 'G4', length: '1/2' }]);
    editor.movePitchCursor(-2);
    editor.cross(); // G4 off: the rest is back
    expect(last(changes)).toEqual([{ length: '1/2' }]);
  });

  it('a chord holds a pitch once, however it is spelled', () => {
    const { editor, changes } = makeEditor({ song: [[{ pitch: 'E#4', length: '1/4' }]] });
    editor.movePitchCursor(1); // F4: sounds as E#4
    expect(editor.pitchCursor).toBe('F4');
    expect(editor.cross()).toBe(false);
    expect(changes).toHaveLength(0);
    expect(editor.status).toMatch(/already in the chord/);
  });

  it('a creature’s song holds one note: a pitch elsewhere moves it there', () => {
    const { editor, changes } = makeEditor({
      song: [{ pitch: 'C5', length: '1/4' }],
      polyphonic: false,
    });
    expect(editor.pitchCursor).toBe('C5'); // the cursor starts on the last pitch written
    editor.movePitchCursor(-1);
    editor.cross();
    expect(last(changes)).toEqual([{ pitch: 'B4', length: '1/4' }]);
  });

  it('a pitch goes on in the key: the F line in D major is F sharp', () => {
    const { editor, changes } = makeEditor({ song: [{ length: '1/4' }], keySignature: 'D' });
    editor.movePitchCursor(-3); // F4
    editor.cross();
    expect(last(changes)).toEqual([{ pitch: 'F#4', length: '1/4' }]);
  });

  it('refuses a rest that will not fit in what is left of the measure, saying why', () => {
    const { editor, changes } = makeEditor({ song: [C4, C4, C4] }); // 4/4: one beat left
    keydown(editor, '3'); // a half
    expect(changes).toHaveLength(0);
    expect(editor.status).toBe('No room: that rest needs 2 beats; 1 beat left in this measure');
    keydown(editor, '4'); // a quarter fits ...
    keydown(editor, '3'); // ... and a full measure starts a new one with room
    expect(last(changes).slice(3)).toEqual([{ length: '1/4' }, { length: '1/2' }]);
    expect(editor.status).toBe('');
  });

  it('measures the room mid-song too, before the cursor', () => {
    const { editor, changes } = makeEditor({ song: [{ pitch: 'C4', length: '1/2' }, C4, C4] });
    keydown(editor, 'ArrowLeft');
    keydown(editor, 'ArrowLeft'); // before the second note: 2 beats used
    keydown(editor, '2');
    expect(changes).toHaveLength(0);
    keydown(editor, '3');
    expect(last(changes)).toHaveLength(4);
  });

  it('the palette’s dot makes Enter (✕) step the dots: one, two (a double dot), none — each must fit', () => {
    const { editor, container, changes } = makeEditor({
      song: [C4, C4, { pitch: 'E4', length: '1/2' }],
    });
    container.querySelector('.rhythm-dot').click();
    expect(editor.palette.dotSelected).toBe(true);
    keydown(editor, 'Enter'); // a dotted half needs 3 beats; 2 left
    expect(changes).toHaveLength(0);
    expect(editor.status).toMatch(/No room: the dotted value needs 3 beats; 2 beats left/);
    keydown(editor, 'ArrowLeft');
    keydown(editor, 'ArrowLeft'); // on the second C4
    keydown(editor, 'Enter');
    expect(last(changes)[1]).toEqual({ pitch: 'C4', length: '1/4', dotted: true });
    keydown(editor, 'Enter'); // the designer: "two ✕ button pushes is two dots"
    expect(last(changes)[1]).toEqual({ pitch: 'C4', length: '1/4', dotted: 2 });
    keydown(editor, 'Enter'); // "three is back to none"
    expect(last(changes)[1]).toEqual(C4);
    // A rest is still entered at the last note value chosen (shown kept)
    expect(container.querySelector('.rhythm-btn.kept').dataset.length).toBe('1/4');
  });

  it('a second dot that will not fit takes the dot off instead, saying why', () => {
    const { editor, changes } = makeEditor({
      // 2.5 beats used: 1.5 left — a dotted quarter fits, a double-dotted one does not
      song: [{ pitch: 'C4', length: '1/2' }, { pitch: 'D4', length: '1/8' }, C4],
    });
    editor.palette.chooseMode('dot');
    editor.cross();
    expect(last(changes)[2]).toEqual({ pitch: 'C4', length: '1/4', dotted: true });
    editor.cross();
    expect(last(changes)[2]).toEqual(C4);
    expect(editor.status).toMatch(/No room: a second dot needs 1\.75 beats; 1\.5 beats left/);
    expect(editor.status).toMatch(/the dot comes off/);
  });

  it('a double-dotted note loads, measures and changes value as its 1.75 shares', () => {
    const { editor, changes } = makeEditor({
      song: [{ pitch: 'C4', length: '1/2', dotted: 2 }],
    });
    // 3.5 of 4 beats used: an eighth fits after it, a quarter starts a new measure
    keydown(editor, '5');
    expect(last(changes)).toEqual([{ pitch: 'C4', length: '1/2', dotted: 2 }, { length: '1/8' }]);
    keydown(editor, 'ArrowLeft');
    keydown(editor, 'ArrowLeft'); // on the note (the first press only moves the cursor before the rest)
    editor.stepNoteDuration(1); // a double-dotted quarter
    expect(last(changes)[0]).toEqual({ pitch: 'C4', length: '1/4', dotted: 2 });
    nextFrame();
    expect(editor._staffEl.querySelectorAll('.augmentation-dot')).toHaveLength(2);
  });

  it('L1 / R1 step the palette through the note values to the dot and the tie, and change nothing else', () => {
    const { editor, changes } = makeEditor({ song: [C4] });
    expect(editor.palette.step(1)).toBe(true); // 8th
    editor.palette.step(1);
    editor.palette.step(1); // 32nd
    expect(editor.palette.activeLength).toBe('1/32');
    editor.palette.step(1);
    expect(editor.palette.dotSelected).toBe(true);
    editor.palette.step(1);
    expect(editor.palette.tieSelected).toBe(true);
    expect(editor.palette.dotSelected).toBe(false);
    expect(editor.palette.step(1)).toBe(false);
    editor.palette.step(-1);
    expect(editor.palette.dotSelected).toBe(true);
    editor.palette.step(-1);
    expect(editor.palette.dotSelected).toBe(false);
    expect(editor.palette.activeLength).toBe('1/32');
    expect(changes).toHaveLength(0);
  });

  describe('the tie card (the designer: “toggling a tie is the same as a dot”)', () => {
    const chord = (...pitches) => pitches.map((pitch) => ({ pitch, length: '1/4' }));

    it('sits next to the dot; chosen, ✕ ties the note under the pitch cursor to the same pitch next', () => {
      const { editor, container, changes } = makeEditor({ song: [C4, C4] });
      const cards = [...container.querySelectorAll('.rhythm-btn')];
      expect(cards.indexOf(container.querySelector('.rhythm-tie'))).toBe(
        cards.indexOf(container.querySelector('.rhythm-dot')) + 1
      );
      container.querySelector('.rhythm-tie').click();
      expect(editor.palette.tieSelected).toBe(true);
      keydown(editor, 'ArrowLeft');
      keydown(editor, 'ArrowLeft'); // the first C4
      expect(editor.pitchCursor).toBe('C4');
      keydown(editor, 'Enter');
      expect(last(changes)).toEqual([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      nextFrame();
      expect(editor._staffEl.querySelectorAll('.tie')).toHaveLength(1);
      keydown(editor, 'Enter'); // again: untied
      expect(last(changes)).toEqual([C4, C4]);
    });

    it('ties per note: in a chord only the note under the pitch cursor ties', () => {
      const { editor, changes } = makeEditor({
        song: [chord('C4', 'E4', 'G4'), chord('C4', 'F4', 'A4')],
      });
      editor.moveCursor(-1);
      editor.moveCursor(-1); // the first chord
      editor.movePitchCursor(-5); // A4 (the last pitch written, where it opened) -> C4
      expect(editor.pitchCursor).toBe('C4');
      editor.palette.chooseMode('tie');
      editor.cross();
      const [first, second] = last(changes);
      expect(first).toEqual([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);
      expect(second).toEqual([
        { pitch: 'C4', length: '1/4', tie: 'stop' },
        { pitch: 'F4', length: '1/4' },
        { pitch: 'A4', length: '1/4' },
      ]);
      nextFrame();
      expect(editor._staffEl.querySelectorAll('.tie')).toHaveLength(1);
    });

    it('refuses a tie the next entry has no pitch for (or no note under the pitch cursor), saying why', () => {
      const { editor, changes } = makeEditor({
        song: [chord('C4', 'E4'), chord('D4', 'F4'), { length: '1/4' }],
      });
      editor.moveCursor(-1);
      editor.moveCursor(-1);
      editor.moveCursor(-1); // the first chord
      editor.palette.chooseMode('tie');
      while (editor.pitchCursor !== 'E4')
        editor.movePitchCursor(editor.pitchCursor > 'E4' ? -1 : 1);
      expect(editor.cross()).toBe(false);
      expect(editor.status).toBe('Nothing to tie to: the next entry has no E4 after it');
      editor.movePitchCursor(1); // F4: not in this chord
      expect(editor.cross()).toBe(false);
      expect(editor.status).toBe('No note under the pitch cursor to tie');
      editor.moveCursor(1); // the second chord, a rest after it
      expect(editor.cross()).toBe(false);
      expect(editor.status).toMatch(/Nothing to tie to: the next entry has no F4/);
      expect(changes).toHaveLength(0);
    });

    it('t ties from the keyboard; an edit that breaks a tie’s end takes the tie away', () => {
      const { editor, changes } = makeEditor({ song: [C4, C4] });
      keydown(editor, 'ArrowLeft');
      keydown(editor, 'ArrowLeft');
      keydown(editor, 't');
      expect(last(changes)[0]).toEqual({ pitch: 'C4', length: '1/4', tie: 'start' });
      keydown(editor, 'ArrowRight');
      keydown(editor, 'ArrowUp', { shiftKey: true }); // C#4: no longer the same pitch
      expect(last(changes)).toEqual([C4, { pitch: 'C#4', length: '1/4' }]);
    });

    it('a tie keeps through a dot and a value change on either note', () => {
      const { editor, changes } = makeEditor({ song: [C4, C4] });
      editor.moveCursor(-1);
      editor.moveCursor(-1);
      editor.toggleTie();
      editor.toggleDot();
      editor.stepNoteDuration(1);
      expect(last(changes)).toEqual([
        { pitch: 'C4', length: '1/8', dotted: true, tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
    });
  });

  it('the note at the cursor takes a longer / shorter value, keeping its dot; longer must fit', () => {
    const { editor, changes } = makeEditor({
      song: [{ pitch: 'C4', length: '1/4', dotted: true }],
    });
    editor.stepNoteDuration(1);
    expect(last(changes)).toEqual([{ pitch: 'C4', length: '1/8', dotted: true }]);
    editor.stepNoteDuration(-1);
    editor.stepNoteDuration(-1); // a dotted half: fits
    expect(last(changes)).toEqual([{ pitch: 'C4', length: '1/2', dotted: true }]);
    expect(editor.stepNoteDuration(-1)).toBe(false); // a dotted whole: no
    expect(editor.status).toMatch(/No room/);
  });

  it('the accidental of the note under the pitch cursor steps flat, natural, sharp — never a doubled pitch', () => {
    const { editor, changes } = makeEditor({
      song: [
        [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
      ],
    });
    expect(editor.pitchCursor).toBe('G4');
    keydown(editor, 'ArrowUp', { shiftKey: true });
    expect(last(changes)[0][1].pitch).toBe('G#4');
    expect(editor.stepAccidental(1)).toBe(false);
    expect(editor.status).toBe('Already sharp');
    editor.movePitchCursor(-2); // E4
    editor.stepAccidental(1); // E#4 is F, not in the chord: fine
    expect(last(changes)[0][0].pitch).toBe('E#4');
    editor.movePitchCursor(1); // F4: no note there
    expect(editor.stepAccidental(-1)).toBe(false);
    expect(editor.status).toMatch(/No note under the pitch cursor/);
  });

  it('refuses an accidental that would sound a chord tone again', () => {
    const { editor } = makeEditor({
      song: [
        [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
        ],
      ],
    });
    editor.movePitchCursor(-1); // E4
    expect(editor.stepAccidental(1)).toBe(false);
    expect(editor.status).toMatch(/E♯4 would sound F4 again/);
  });

  it('draws the pitch cursor at the edit cursor, ringing a note there, naming the pitch', () => {
    const { editor } = makeEditor({ song: [C4] });
    let cursor = editor._staffEl.querySelector('.pitch-cursor');
    expect(cursor.classList.contains('on-note')).toBe(true); // on C4, below the staff
    expect(cursor.querySelector('.pitch-cursor-label').textContent).toBe('C4');
    expect(cursor.querySelectorAll('.pitch-cursor-ledger')).toHaveLength(1); // C4's ledger line
    keydown(editor, 'ArrowUp');
    nextFrame();
    cursor = editor._staffEl.querySelector('.pitch-cursor');
    expect(cursor.classList.contains('on-note')).toBe(false);
    expect(cursor.querySelector('.pitch-cursor-label').textContent).toBe('D4');
    expect(cursor.closest('[data-voice-id]').dataset.voiceId).toBe('v0');
  });

  it('a grand staff plays both staves: the player gets both voices', () => {
    const player = { play: jest.fn(), stop: jest.fn() };
    const { editor } = makeEditor({
      player,
      staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      song: {
        voices: [
          { id: 'treble', notes: [{ pitch: 'E5', length: '1/2' }] },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/4', dotted: true }] },
        ],
      },
    });
    editor.play();
    expect(player.play).toHaveBeenCalledWith({
      voices: [
        { id: 'treble', notes: [{ pitch: 'E5', length: '1/2' }] },
        { id: 'bass', notes: [{ pitch: 'C3', length: '1/4', dotted: true }] },
      ],
      tempo: 120,
      basis: 4,
    });
  });

  it('Play, Stop, Clear, the hint and the status go in the controls container given', () => {
    const footer = document.createElement('div');
    document.body.appendChild(footer);
    const { editor, container } = makeEditor({ song: [C4], controlsContainer: footer });
    expect(container.querySelector('.playback-controls')).toBeNull();
    expect(footer.querySelector('.song-play-btn')).toBeTruthy();
    expect(footer.querySelector('.song-clear-btn')).toBeTruthy();
    expect(footer.querySelector('.song-edit-hint').textContent).toContain('pitch cursor');
    expect(footer.querySelector('.song-edit-status')).toBeTruthy();
    editor.dispose();
    expect(footer.children).toHaveLength(0);
  });
});

describe('RhythmPalette icons', () => {
  it('each note value shows its notehead (the glyph defs travel with every icon)', () => {
    const { container } = makeEditor();
    const buttons = [...container.querySelectorAll('.rhythm-btn[data-length]')];
    expect(buttons.map((b) => b.dataset.length)).toEqual([
      '1/1',
      '1/2',
      '1/4',
      '1/8',
      '1/16',
      '1/32',
    ]);
    buttons.forEach((button) => {
      const svg = button.querySelector('svg');
      const head = svg.querySelector('use.note-head');
      expect(head).toBeTruthy();
      const id = head.getAttribute('href').slice(1);
      expect(svg.querySelector(`defs [id="${id}"]`)).toBeTruthy(); // resolves in its own svg
    });
    const flags = buttons.map((b) => b.querySelector('use.note-flag'));
    expect(flags.slice(0, 3).every((f) => f === null)).toBe(true);
    flags.slice(3).forEach((flag, i) => {
      const svg = buttons[i + 3].querySelector('svg');
      expect(svg.querySelector(`defs [id="${flag.getAttribute('href').slice(1)}"]`)).toBeTruthy();
    });
    expect(container.querySelector('.rhythm-dot')).toBeTruthy();
  });
});
