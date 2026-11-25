import gameState from 'core/GameState';
import AbsorbManager from 'core/AbsorbManager';
import { onSlotFlash } from 'ui/slotFlash';

const SLOT_PX = 50;
const MARK_PX = 32;

/**
 * How many notes a held creature's song has, as heard: single notes and
 * chords, never rests, and never a note only tied on from the one before
 * (a tie's `continue` / `stop` — the same sound held).
 */
const strikes = (note) =>
  Boolean(note && note.pitch) && note.tie !== 'continue' && note.tie !== 'stop';
const isSounding = (entry) => (Array.isArray(entry) ? entry.some(strikes) : strikes(entry));
const noteCount = (spec) =>
  spec && Array.isArray(spec.song) ? spec.song.filter(isSounding).length : 0;

/**
 * InventoryUI - the slot strip in the bottom-right corner: one slot per tape
 * slot (core/Tape), each showing the creature it holds (a small glowing orb
 * in its colour, its song's note count) or nothing; the cursor slot raised.
 * Above the cursor slot, the REACH mark: up while a creature is in the
 * pole's reach (its ×N badge counts them), pulsing red while the pole
 * draws one in. Wordless feedback: a landing creature pops its slot; the
 * grey flash (ui/slotFlash) says nothing happened.
 */
class InventoryUI {
  constructor() {
    this.container = null;
    this.inventorySlots = [];
    this.reachMark = null;
    this.creatureCount = null;
    this._creatureCountShown = null;
    this.absorbIndicator = null;
    this.init();
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'inventory-ui';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      font-family: monospace;
    `;

    this.createInventoryUI();
    this.createReachMark();
    document.body.appendChild(this.container);

    // Wordless feedback channel (see ui/slotFlash.js): grey = nothing there
    onSlotFlash((kind) => this.flashActiveSlot(kind));
  }

  /** Pulse the cursor slot grey: R or Space found nothing to do. */
  flashActiveSlot() {
    const slot = this.inventorySlots[gameState.player.activeSlot];
    if (!slot || !slot.animate) return;
    slot.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.85)', boxShadow: '0 0 16px rgba(170,170,170,0.8)', offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration: 450 }
    );
  }

  createInventoryUI() {
    this.inventoryContainer = document.createElement('div');
    this.inventoryContainer.style.cssText = `
      display: flex;
      gap: 10px;
      position: relative;
    `;
    // The tape is dynamic: slots are created/removed to mirror the
    // inventory array each frame (see syncSlotCount)
    this._slotIds = [];
    this._markSlot = null; // Slot the reach mark was last positioned over
    this.container.appendChild(this.inventoryContainer);
    this.syncSlotCount();
  }

  /** Build one slot element: the held creature's orb, and its note count. */
  static createSlotElement(index) {
    const slot = document.createElement('div');
    slot.style.cssText = `
      width: ${SLOT_PX}px;
      height: ${SLOT_PX}px;
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      transition: border 0.2s, transform 0.2s, background 0.2s;
      position: relative;
    `;
    slot.dataset.index = index;

    const orb = document.createElement('div');
    orb.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 26px;
      height: 26px;
      margin: -15px 0 0 -13px;
      border-radius: 50%;
      display: none;
      pointer-events: none;
    `;
    slot.appendChild(orb);
    slot.orbEl = orb;

    const countEl = document.createElement('div');
    countEl.style.cssText = `
      position: absolute;
      bottom: 2px;
      right: 4px;
      font-size: 13px;
      font-weight: bold;
      color: rgba(255, 255, 255, 0.95);
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      pointer-events: none;
    `;
    slot.appendChild(countEl);
    slot.countEl = countEl;
    return slot;
  }

  /** Mirror the tape's length in the DOM: append elements as the tape grows. */
  syncSlotCount() {
    const want = gameState.player.inventory.length;
    while (this.inventorySlots.length < want) {
      const slot = InventoryUI.createSlotElement(this.inventorySlots.length);
      this.inventorySlots.push(slot);
      this.inventoryContainer.appendChild(slot);
      this._slotIds.push(null);
      this._markSlot = null; // geometry changed — reposition the reach mark
    }
    if (this.inventorySlots.length > want) {
      while (this.inventorySlots.length > want) {
        this.inventorySlots.pop().remove();
        this._markSlot = null;
      }
      // A new world's tape — resync ids WITHOUT popping every surviving slot
      this._slotIds = gameState.player.inventory.map((s) => (s ? s.id : null));
    }
  }

  createReachMark() {
    // Positioned absolutely over the cursor slot's upper-right corner
    this.reachMark = document.createElement('div');
    this.reachMark.style.cssText = `
      position: absolute;
      width: ${MARK_PX}px;
      height: ${MARK_PX}px;
      opacity: 0;
      transition: opacity 0.3s, left 0.2s, top 0.2s;
      pointer-events: none;
    `;

    // Red pulsing disc behind the mark: the pole drawing a creature in
    this.absorbIndicator = document.createElement('div');
    this.absorbIndicator.style.cssText = `
      position: absolute;
      inset: 0;
      background: #ff2a2a;
      border-radius: 50%;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 1;
    `;

    // The mark: a pale glowing ring round a bright dot — the pole's tip,
    // a creature within its reach
    const mark = document.createElement('div');
    mark.style.cssText = `
      position: absolute;
      inset: 5px;
      border-radius: 50%;
      border: 2px solid rgba(220, 232, 255, 0.95);
      background: radial-gradient(circle, rgba(240,246,255,1) 0 18%, rgba(160,190,255,0.25) 30%, rgba(0,0,0,0.55) 62%);
      box-shadow: 0 0 8px rgba(190, 210, 255, 0.85);
      z-index: 2;
    `;
    this.markEl = mark;

    // Creature count badge (upper-left)
    this.creatureCount = document.createElement('div');
    this.creatureCount.style.cssText = `
      position: absolute;
      top: -8px;
      left: -8px;
      background: rgba(255, 255, 255, 0.9);
      color: black;
      min-width: 20px;
      height: 20px;
      border-radius: 50%;
      font-size: 12px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      z-index: 3;
    `;
    this.creatureCount.textContent = '0';

    this.reachMark.appendChild(this.absorbIndicator);
    this.reachMark.appendChild(mark);
    this.reachMark.appendChild(this.creatureCount);
    this.container.appendChild(this.reachMark);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes absorb-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
  }

  /** Call every frame. */
  update() {
    this.syncSlotCount();
    this.updateInventory();
    this.updateReachMark();
  }

  updateInventory() {
    const { inventory, activeSlot } = gameState.player;

    this.inventorySlots.forEach((slot, index) => {
      const isActive = index === activeSlot;
      const held = inventory[index];
      const count = held ? noteCount(held.spec) : '';
      const css = held ? held.css : '';

      // This runs every frame; skip the DOM writes when the slot is unchanged
      const stateKey = `${isActive}|${css}|${count}`;
      if (slot._stateKey !== stateKey) {
        slot._stateKey = stateKey;
        slot.style.border = isActive
          ? '3px solid rgba(255, 255, 255, 0.9)'
          : '2px solid rgba(255, 255, 255, 0.3)';
        slot.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
        slot.style.background = held ? 'rgba(14, 18, 30, 0.88)' : 'rgba(0, 0, 0, 0.8)';
        if (held) {
          // The creature itself, glowing in its colour
          slot.orbEl.style.display = 'block';
          slot.orbEl.style.background = `radial-gradient(circle at 42% 38%, #fff 0 12%, ${css} 38%, transparent 72%)`;
          slot.orbEl.style.boxShadow = `0 0 10px ${css}`;
        } else {
          slot.orbEl.style.display = 'none';
        }
        slot.countEl.textContent = count;
      }

      // A creature landing in a slot pops it (wordless confirmation)
      const id = held ? held.id : null;
      if (id !== this._slotIds[index]) {
        if (id !== null && slot.animate) {
          slot.animate(
            [
              { transform: 'scale(1)' },
              { transform: 'scale(1.35)', boxShadow: `0 0 14px ${css}`, offset: 0.4 },
              { transform: isActive ? 'scale(1.1)' : 'scale(1)' },
            ],
            { duration: 500 }
          );
        }
        this._slotIds[index] = id;
      }
    });
  }

  updateReachMark() {
    const count = gameState.absorb.inRange.length;
    const absorbing = AbsorbManager.kind === 'absorb';
    const { activeSlot } = gameState.player;

    if (count > 0 || absorbing) {
      this.reachMark.style.opacity = '1';
      // "×N" = creatures in reach (a bare number reads as a slot label).
      // Guarded: this runs every frame and the count rarely changes.
      if (count !== this._creatureCountShown) {
        this.creatureCount.textContent = `×${count}`;
        this.creatureCount.style.visibility = count > 0 ? 'visible' : 'hidden';
        this._creatureCountShown = count;
      }
      // Half in, half out of the cursor slot's upper-right corner.
      // offsetLeft/offsetTop force a layout pass, so only re-read them when
      // the cursor slot changes (slot geometry is otherwise static).
      if (activeSlot !== this._markSlot && this.inventorySlots[activeSlot]) {
        const slotEl = this.inventorySlots[activeSlot];
        this.reachMark.style.left = `${slotEl.offsetLeft + SLOT_PX - MARK_PX / 2}px`;
        this.reachMark.style.top = `${slotEl.offsetTop - MARK_PX / 2}px`;
        this._markSlot = activeSlot;
      }
    } else {
      this.reachMark.style.opacity = '0';
    }

    if (absorbing !== this._absorbingShown) {
      this._absorbingShown = absorbing;
      this.absorbIndicator.style.opacity = absorbing ? '1' : '0';
      this.absorbIndicator.style.animation = absorbing ? 'absorb-pulse 0.5s infinite' : 'none';
    }
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export default InventoryUI;
