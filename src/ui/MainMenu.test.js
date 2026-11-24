/** @jest-environment jsdom */
/**
 * The main menu's dev-build Editor entry (the dev app's mode switch): shown
 * only when given, and it leads to the editor. Focus moves to it like any
 * other entry (ui/Menu).
 */
import MainMenu from 'ui/MainMenu';

const puzzles = [{ id: 'a', name: 'A', difficulty: 1 }];
const progress = { isComplete: () => false };
const editorButton = (menu) =>
  [...menu.element.querySelectorAll('button')].find((b) => b.textContent === 'Editor');

afterEach(() => {
  document.body.innerHTML = '';
});

it('offers Editor when the build gives a way there', () => {
  const onEditor = jest.fn();
  const menu = new MainMenu(puzzles, jest.fn(), progress, onEditor);
  menu.show();
  editorButton(menu).click();
  expect(onEditor).toHaveBeenCalled();
});

it('has no Editor entry otherwise (the shipped game)', () => {
  const menu = new MainMenu(puzzles, jest.fn(), progress);
  menu.show();
  expect(editorButton(menu)).toBeUndefined();
});
