/**
 * @jest-environment jsdom
 */

/**
 * EditorGamepad in the song editor: a standard-layout pad's buttons reach
 * the song editor's actions (SongEditorModal.padAction), held L2 / R2
 * choosing their own row. Driven through poll() with a pad as the browser
 * reports one; the app is a stand-in that records what reached it.
 */
import EditorGamepad, { BUTTONS, EDITOR_MAPPING } from 'editor/input/EditorGamepad';

describe('EditorGamepad in the song editor', () => {
  let pad;
  let actions;
  let gamepad;

  beforeEach(() => {
    pad = {
      id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    actions = [];
    const app = {
      padContext: () => 'song',
      songEditorModal: { padAction: (action) => actions.push(action) },
    };
    gamepad = new EditorGamepad(app, { now: () => 0 });
  });

  afterEach(() => {
    delete navigator.getGamepads;
  });

  const set = (button, down) => {
    pad.buttons[BUTTONS[button]] = { pressed: down, value: down ? 1 : 0 };
    gamepad.poll();
  };
  const tap = (button) => {
    set(button, true);
    set(button, false);
  };

  it('✕ writes (cross); L2+✕ inserts a note before; R2+✕ a rest', () => {
    tap('cross');
    set('l2', true);
    tap('cross');
    set('l2', false);
    set('r2', true);
    tap('cross');
    set('r2', false);
    expect(actions).toEqual(['cross', 'insertNote', 'rest']);
  });

  it('L1 / R1 walk the palette; under L2 or R2 the note goes shorter / longer', () => {
    tap('l1');
    tap('r1');
    set('l2', true);
    tap('l1');
    tap('r1');
    set('l2', false);
    expect(actions).toEqual(['palettePrev', 'paletteNext', 'noteShorter', 'noteLonger']);
  });

  it('the legend says what L2+✕ does', () => {
    const row = EDITOR_MAPPING['song+l2'].find(([button]) => button === 'cross');
    expect(row[1]).toMatch(/new note before/);
  });
});
