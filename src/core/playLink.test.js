/** @jest-environment jsdom */
/**
 * The way between the editor and the game: the editor's Play loads the game
 * straight into its level (`?puzzle=<id>&from=editor`) in an iframe over
 * itself, and the game, finding the editor around it, talks to it by
 * message; its pause menu, launched that way, offers Back to Editor — which
 * hands the editor the player's view, or (a game opened by itself) loads the
 * editor on the level in its tab. Played with the keyboard and with a
 * controller, like the rest of the menu.
 */
import {
  playUrl,
  playRequest,
  editorUrl,
  editorRequest,
  editorFrame,
  isFromEditor,
  backToEditor,
  BACK_TO_EDITOR,
  PREVIEW_GO,
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

describe('The editor around the game', () => {
  const { origin } = window.location;

  /** A game window inside `parent` (or a tab of its own: no parent given). */
  function gameWindow(parent = null) {
    const win = { location: { origin, assign: jest.fn() } };
    win.parent = parent || win;
    return win;
  }
  const editorPage = (pageOrigin = origin) => ({
    location: { origin: pageOrigin },
    postMessage: jest.fn(),
  });

  it('is the page of this site the game plays inside', () => {
    const editor = editorPage();
    expect(editorFrame(gameWindow(editor))).toBe(editor);
  });

  it('is none for a game in a tab of its own, or framed by another site', () => {
    expect(editorFrame(gameWindow())).toBeNull();
    expect(editorFrame(gameWindow(editorPage('https://example.com')))).toBeNull();
    const unreadable = {
      get location() {
        throw new Error('cross-origin');
      },
    };
    expect(editorFrame(gameWindow(unreadable))).toBeNull();
  });

  it('a message counts as the editor speaking only from that page, of this site', () => {
    const editor = editorPage();
    const win = gameWindow(editor);
    const go = { type: PREVIEW_GO };

    expect(isFromEditor({ source: editor, origin, data: go }, PREVIEW_GO, win)).toBe(true);
    expect(isFromEditor({ source: {}, origin, data: go }, PREVIEW_GO, win)).toBe(false);
    expect(
      isFromEditor({ source: editor, origin: 'https://example.com', data: go }, PREVIEW_GO, win)
    ).toBe(false);
    expect(isFromEditor({ source: editor, origin, data: go }, PREVIEW_GO, gameWindow())).toBe(
      false
    );
  });
});

describe('Back to Editor', () => {
  const { origin } = window.location;

  it("inside the editor's Play, hands the editor where the player stands, and stays put", () => {
    const editor = { location: { origin }, postMessage: jest.fn() };
    const win = { parent: editor, location: { origin, assign: jest.fn() } };
    const report = {
      areaId: 'poc-duet',
      pose: { position: [3, 1.8, 6], quaternion: [0, 0, 0, 1], fov: 75 },
    };

    expect(backToEditor('poc-duet', report, win)).toBe('handed');
    expect(editor.postMessage).toHaveBeenCalledWith(
      { type: BACK_TO_EDITOR, puzzleId: 'poc-duet', ...report },
      origin
    );
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('a game opened by itself loads the editor on the level', () => {
    const win = { location: { origin, assign: jest.fn() } };
    win.parent = win;

    expect(backToEditor('poc-duet', {}, win)).toBe('navigated');
    expect(win.location.assign).toHaveBeenCalledWith('/editor.html?puzzle=poc-duet');
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
