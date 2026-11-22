/** @jest-environment jsdom */
/**
 * StartGate: the scrim every world entry starts behind. It goes up BEFORE
 * the world loads (showLoading) so it is the first thing painted, but no
 * key or click can wake a world that isn't built yet; the show() after the
 * build makes any key/click wake it. Esc is no user activation (the HTML
 * spec leaves it out), so like a controller button it wakes the world only
 * into sound.
 */
import { audioContextManager } from 'resound-sound';
import StartGate from 'ui/StartGate';

describe('StartGate', () => {
  let gate;
  let gameKeys;
  const onGameKey = (event) => gameKeys.push(event.code);

  beforeEach(() => {
    gate = new StartGate();
    gameKeys = [];
    window.addEventListener('keydown', onGameKey);
  });

  afterEach(() => {
    gate.hide();
    jest.runAllTimers();
    window.removeEventListener('keydown', onGameKey);
  });

  const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  const scrim = () => document.getElementById('start-gate');

  it('goes up while the world loads, and no key or click wakes it yet', () => {
    gate.showLoading();
    expect(scrim()).not.toBeNull();

    press('KeyW');
    scrim().click();

    expect(gate.visible).toBe(true);
    expect(gameKeys).toEqual([]); // swallowed: the game never sees it
  });

  it('once the world is built, any key wakes it', () => {
    gate.showLoading();
    gate.show(); // the world exists now

    press('KeyW');

    expect(gate.visible).toBe(false);
    expect(gameKeys).toEqual([]); // the waking key never reaches the game
  });

  it('shown for a built world straight away, a click wakes it', () => {
    gate.show();

    scrim().click();

    expect(gate.visible).toBe(false);
  });

  it('a loading gate is the SAME scrim the world wakes from (no second overlay)', () => {
    gate.showLoading();
    const loading = scrim();

    gate.show();

    expect(document.querySelectorAll('#start-gate')).toHaveLength(1);
    expect(scrim()).toBe(loading);
  });

  describe('Esc', () => {
    const context = audioContextManager.getContext();
    let resume = null;

    afterEach(() => {
      context.state = 'running';
      if (resume) resume.mockRestore();
      resume = null;
    });

    it('wakes a world whose audio runs, and never reaches the game (no pause)', () => {
      gate.show();

      press('Escape');

      expect(gate.visible).toBe(false);
      expect(gameKeys).toEqual([]);
    });

    it('on a fresh page (audio locked) leaves the gate up for a key or a click, and says so', async () => {
      context.state = 'suspended';
      resume = jest.spyOn(context, 'resume').mockReturnValue(new Promise(() => {}));
      gate.show();

      press('Escape');
      await Promise.resolve();

      expect(gate.visible).toBe(true);
      expect(gameKeys).toEqual([]);
      expect(scrim().querySelector('.start-gate-sound').textContent).toBe(
        'press a key or click to start sound'
      );

      press('KeyW');
      expect(gate.visible).toBe(false);
    });
  });
});
