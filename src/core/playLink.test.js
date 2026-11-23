/** @jest-environment jsdom */
/**
 * The way between the editor and the game: the editor's Play opens the game
 * straight into its level (`?puzzle=<id>&from=editor`), and the game's pause
 * menu, launched that way, offers Back to Editor — which hands the level
 * back to the editor tab that opened it and closes, or else loads the editor
 * on the level in the same tab. Played with the keyboard and with a
 * controller, like the rest of the menu.
 */
import {
  playUrl,
  playRequest,
  editorUrl,
  editorRequest,
  backToEditor,
  BACK_TO_EDITOR_MESSAGE,
} from 'core/playLink';
import PauseMenu from 'ui/PauseMenu';
import Gamepad from 'core/Gamepad';

describe('The play link', () => {
  it("is the game's address with the puzzle and where it came from", () => {
    expect(playUrl('poc-two-keys')).toBe('/?puzzle=poc-two-keys&from=editor');
  });

  it('reads back as a request to play that puzzle, from the editor', () => {
    expect(playRequest('?puzzle=poc-two-keys&from=editor')).toEqual({
      puzzleId: 'poc-two-keys',
      fromEditor: true,
    });
  });

  it('a plain deep link plays the puzzle with no way back to the editor', () => {
    expect(playRequest('?puzzle=poc-duet')).toEqual({ puzzleId: 'poc-duet', fromEditor: false });
    expect(playRequest('')).toEqual({ puzzleId: null, fromEditor: false });
  });

  it("names the editor's level in its own address", () => {
    expect(editorUrl('poc-duet')).toBe('/editor.html?puzzle=poc-duet');
    expect(editorRequest('?puzzle=poc-duet')).toBe('poc-duet');
    expect(editorUrl()).toBe('/editor.html');
  });
});

describe('Back to Editor', () => {
  const { origin } = window.location;

  /** A game window: what it was opened by, whether it may close itself. */
  function gameWindow({ opener = null, closable = false } = {}) {
    const win = {
      opener,
      closed: false,
      location: { origin, assign: jest.fn() },
      close: jest.fn(() => {
        if (closable) win.closed = true;
      }),
    };
    return win;
  }

  const editorTab = () => ({
    closed: false,
    location: { origin },
    postMessage: jest.fn(),
    focus: jest.fn(),
  });

  it('a game tab the editor opened hands it the level and closes', () => {
    const editor = editorTab();
    const win = gameWindow({ opener: editor, closable: true });

    expect(backToEditor('poc-duet', win)).toBe('closed');
    expect(editor.postMessage).toHaveBeenCalledWith(
      { type: BACK_TO_EDITOR_MESSAGE, puzzleId: 'poc-duet' },
      origin
    );
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('a game in the editor’s own tab (Play from a controller) loads the editor on the level', () => {
    const win = gameWindow();

    expect(backToEditor('poc-duet', win)).toBe('navigated');
    expect(win.location.assign).toHaveBeenCalledWith('/editor.html?puzzle=poc-duet');
  });

  it('a tab that may not close itself loads the editor instead', () => {
    const win = gameWindow({ opener: editorTab(), closable: false });

    expect(backToEditor('poc-duet', win)).toBe('navigated');
    expect(win.location.assign).toHaveBeenCalledWith('/editor.html?puzzle=poc-duet');
  });

  it('never hands the level to a window of another site', () => {
    const stranger = {
      closed: false,
      location: { origin: 'https://example.com' },
      postMessage: jest.fn(),
    };
    const win = gameWindow({ opener: stranger, closable: true });

    expect(backToEditor('poc-duet', win)).toBe('navigated');
    expect(stranger.postMessage).not.toHaveBeenCalled();
  });
});

describe("The pause menu's Back to Editor entry", () => {
  let menu;
  let back;
  const entries = () => [...menu.element.querySelectorAll('button')].map((b) => b.textContent);
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));

  afterEach(() => menu.hide());

  it('is there only in a game the editor launched', () => {
    menu = new PauseMenu(jest.fn(), jest.fn(), jest.fn());
    menu.show();
    expect(entries()).not.toContain('Back to Editor');
    menu.hide();

    menu = new PauseMenu(jest.fn(), jest.fn(), jest.fn(), jest.fn());
    menu.show();
    expect(entries()[1]).toBe('Back to Editor'); // right under Resume
  });

  it('is chosen with the keyboard: down to it, Enter', () => {
    back = jest.fn();
    menu = new PauseMenu(jest.fn(), jest.fn(), jest.fn(), back);
    menu.show();

    key('ArrowDown');
    expect(document.activeElement.textContent).toBe('Back to Editor');
    key('Enter');
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('is chosen with a controller: d-pad down to it, Cross', () => {
    back = jest.fn();
    menu = new PauseMenu(jest.fn(), jest.fn(), jest.fn(), back);
    menu.show();
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false }));
    const pad = {
      id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
      mapping: 'standard',
      connected: true,
      buttons,
      axes: [0, 0, 0, 0],
    };
    navigator.getGamepads = () => [pad];
    Gamepad.initialize();
    const press = (index) => {
      buttons[index].pressed = true;
      Gamepad.poll(false, true);
      buttons[index].pressed = false;
      Gamepad.poll(false, true);
    };

    press(13); // d-pad down
    press(0); // Cross
    expect(back).toHaveBeenCalledTimes(1);
    delete navigator.getGamepads;
  });
});
