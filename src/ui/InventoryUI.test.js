import gameState from 'core/GameState';
import InventoryUI from 'ui/InventoryUI';

const C4 = { pitch: 'C4', length: 1 };
const E4 = { pitch: 'E4', length: 1 };
const rest = { length: 1 };

describe('InventoryUI: a held creature shows its song note count', () => {
  let ui;

  beforeEach(() => {
    gameState.player.inventory = [null];
    gameState.player.activeSlot = 0;
    ui = new InventoryUI();
  });

  afterEach(() => ui.dispose());

  const shownCount = () => {
    ui.update();
    return String(ui.inventorySlots[0].countEl.textContent);
  };
  const hold = (song) => {
    gameState.player.inventory[0] = { id: 'c1', spec: { song }, colour: [1, 1, 1], css: '#fff' };
  };

  it('counts notes and chords but never rests', () => {
    hold([C4, rest, [C4, E4], rest, rest, E4]);
    expect(shownCount()).toBe('3');
  });

  it('a note tied on from the one before is the same note held', () => {
    hold([{ ...C4, tie: 'start' }, { ...C4, tie: 'continue' }, { ...C4, tie: 'stop' }, E4]);
    expect(shownCount()).toBe('2');
  });

  it('a chord with a fresh note over a held one is a new note', () => {
    hold([[{ ...C4, tie: 'start' }], [{ ...C4, tie: 'stop' }, E4]]);
    expect(shownCount()).toBe('2');
  });

  it('an all-rest song shows 0, an empty slot nothing', () => {
    hold([rest, rest]);
    expect(shownCount()).toBe('0');
    gameState.player.inventory[0] = null;
    expect(shownCount()).toBe('');
  });
});
