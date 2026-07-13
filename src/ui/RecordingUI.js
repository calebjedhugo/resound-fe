import gameState from 'core/GameState';
import RecordingManager from 'core/RecordingManager';
import PlaybackManager from 'core/PlaybackManager';
import HintMemory from 'core/HintMemory';
import { onSlotFlash } from 'ui/slotFlash';

/**
 * RecordingUI - Manages inventory and recording UI in bottom-right corner
 */
class RecordingUI {
  constructor() {
    this.container = null;
    this.inventorySlots = [];
    this.microphoneIcon = null;
    this.creatureCount = null;
    this._creatureCountShown = null;
    this.recordingIndicator = null;
    this.init();
  }

  init() {
    // Create main container
    this.container = document.createElement('div');
    this.container.id = 'recording-ui';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      font-family: monospace;
    `;

    // Create inventory UI
    this.createInventoryUI();

    // Create recording UI (mic overlay)
    this.createRecordingUI();

    document.body.appendChild(this.container);

    // Wordless feedback channel (see ui/slotFlash.js): red = judged and
    // failed, grey = nothing heard you / nothing there.
    onSlotFlash((kind) => this.flashActiveSlot(kind));
    this._seenJudgmentAt = 0;
  }

  /**
   * Pulse the active slot: 'miss' (red — a performance was judged and
   * failed) or 'silent' (grey — out of range / empty take / empty slot).
   * Mirrors the green pop a landing recording gets.
   */
  flashActiveSlot(kind) {
    const slot = this.inventorySlots[gameState.player.activeSlot];
    if (!slot || !slot.animate) return;
    const glow = kind === 'miss' ? 'rgba(255,40,40,0.95)' : 'rgba(170,170,170,0.8)';
    slot.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.85)', boxShadow: `0 0 16px ${glow}`, offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration: 450 }
    );
  }

  /**
   * Red-flash the active slot when a listener judges a phrase as a MISMATCH
   * during (or just after) the player's own playback — visible feedback
   * that works while facing away from the target, fired at JUDGMENT time.
   * Ambient creature noise being judged does not flash the slot.
   */
  watchJudgments() {
    let newest = 0;
    gameState.entities.forEach((e) => {
      const r = e.lastPhraseResult;
      if (r && !r.matched && r.at > newest) newest = r.at;
    });
    if (newest <= this._seenJudgmentAt) return;
    this._seenJudgmentAt = newest;
    const { lastPlaybackStartMs, lastPlaybackEndMs } = PlaybackManager;
    if (newest >= lastPlaybackStartMs && newest <= lastPlaybackEndMs + 3000) {
      this.flashActiveSlot('miss');
    }
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
    this._micSlot = null; // Slot the mic overlay was last positioned over

    this.container.appendChild(this.inventoryContainer);
    this.syncSlotCount();

    // The "grow the tape" hint (formerly a detached ► keycap): a GHOST SLOT
    // that blooms at the next tape position with the ► (ArrowRight) glyph
    // pulsing inside it, so the hint reads as "a new slot goes HERE." It lives
    // in the tape strip itself; display toggles so it takes no space when idle.
    this.growHintSlot = document.createElement('div');
    this.growHintSlot.style.cssText = `
      width: 50px;
      height: 50px;
      background: rgba(0, 0, 0, 0.35);
      border: 2px dashed rgba(255, 255, 255, 0.6);
      border-radius: 4px;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    `;
    const growArrow = document.createElement('div');
    growArrow.textContent = '►';
    growArrow.style.cssText = `
      font-size: 26px;
      color: rgba(255, 255, 255, 0.95);
      animation: grow-hint-pulse 1.1s ease-in-out infinite;
    `;
    this.growHintSlot.appendChild(growArrow);
    this.inventoryContainer.appendChild(this.growHintSlot);
    this._prevActiveSlot = gameState.player.activeSlot;

    const growStyle = document.createElement('style');
    growStyle.textContent = `
      @keyframes grow-hint-pulse {
        0%, 100% { transform: scale(1); opacity: 0.55; }
        50% { transform: scale(1.35); opacity: 1; }
      }
    `;
    document.head.appendChild(growStyle);
  }

  /** Build one slot element. */
  static createSlotElement(index) {
    const slot = document.createElement('div');
    slot.style.cssText = `
      width: 50px;
      height: 50px;
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      transition: border 0.2s, transform 0.2s, background 0.2s;
      position: relative;
    `;
    slot.dataset.index = index;

    // Persistent note count for occupied slots (legible without toasts)
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

  /**
   * Mirror the tape's length in the DOM: append elements as the tape grows,
   * and collapse back down when a CleansingTile empties the tape to one slot.
   */
  syncSlotCount() {
    const want = gameState.player.inventory.length;
    while (this.inventorySlots.length < want) {
      const slot = RecordingUI.createSlotElement(this.inventorySlots.length);
      this.inventorySlots.push(slot);
      this.inventoryContainer.appendChild(slot);
      this._slotIds.push(null);
      this._micSlot = null; // geometry changed — reposition the mic overlay
    }
    if (this.inventorySlots.length > want) {
      while (this.inventorySlots.length > want) {
        const slot = this.inventorySlots.pop();
        slot.remove();
        this._micSlot = null;
      }
      // The tape shrank (a cleanse emptied it) — resync ids WITHOUT firing
      // the "new recording landed" pop on every surviving slot
      this._slotIds = gameState.player.inventory.map((s) => (s ? s.id : null));
    }
  }

  createRecordingUI() {
    // Mic overlay container - positioned absolutely over active slot
    this.micOverlay = document.createElement('div');
    this.micOverlay.style.cssText = `
      position: absolute;
      width: 32px;
      height: 32px;
      opacity: 0;
      transition: opacity 0.3s, left 0.2s, top 0.2s;
      pointer-events: none;
    `;

    // Red pulsing circle (background)
    this.recordingIndicator = document.createElement('div');
    this.recordingIndicator.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 32px;
      height: 32px;
      background: #ff0000;
      border-radius: 50%;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1;
    `;

    // Microphone icon
    this.microphoneIcon = document.createElement('div');
    this.microphoneIcon.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 32px;
      height: 32px;
      font-size: 28px;
      text-align: center;
      line-height: 32px;
      z-index: 2;
    `;
    this.microphoneIcon.innerHTML = '🎤';

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

    // Assemble overlay
    this.micOverlay.appendChild(this.recordingIndicator);
    this.micOverlay.appendChild(this.microphoneIcon);
    this.micOverlay.appendChild(this.creatureCount);

    this.container.appendChild(this.micOverlay);

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update UI based on game state
   * Call this every frame
   */
  update() {
    this.syncSlotCount();
    this.updateInventory();
    this.updateRecording();
    this.watchJudgments();
    this.updateGrowHint();
  }

  /**
   * The "grow the tape" hint. Teachable moment: the cursor sits on the FILLED
   * last slot with a creature in recording range, so recording now would
   * overwrite the take — ArrowRight grows the tape instead. Show the ghost
   * slot (kept as the strip's last child) with its ► pulsing; retire the hint
   * for this visit the moment the cursor moves.
   */
  updateGrowHint() {
    const { activeSlot, inventory } = gameState.player;
    if (activeSlot !== this._prevActiveSlot) {
      this._prevActiveSlot = activeSlot;
      HintMemory.retire('slots');
    }
    const onFilledLast = activeSlot === inventory.length - 1 && !!inventory[activeSlot];
    const show =
      !HintMemory.isRetired('slots') &&
      onFilledLast &&
      gameState.recording.creaturesInRange.length > 0;
    if (show && this.inventoryContainer.lastElementChild !== this.growHintSlot) {
      this.inventoryContainer.appendChild(this.growHintSlot); // keep it last
    }
    this.growHintSlot.style.display = show ? 'flex' : 'none';
  }

  updateInventory() {
    const { inventory, activeSlot } = gameState.player;

    this.inventorySlots.forEach((slot, index) => {
      if (slot.style.opacity !== '1') slot.style.opacity = '1';
      const isActive = index === activeSlot;
      const isOccupied = inventory[index] !== null;
      const isCapturing = isActive && RecordingManager.isRecording();
      let count = '';
      if (isCapturing) {
        // Live capture count in the slot being recorded into — wordless
        // replacement for the old "N notes captured" text hint. The timing
        // skill is the player's (never auto-trimmed); this just makes the
        // take legible as it happens.
        count = gameState.recording.capturedNotes.length;
      } else if (isOccupied) {
        count = inventory[index].data.length;
      }

      // This runs every frame; skip the DOM writes when the slot is unchanged
      const stateKey = `${isActive}|${isCapturing}|${isOccupied}|${count}`;
      if (slot._stateKey !== stateKey) {
        slot._stateKey = stateKey;

        if (isActive) {
          slot.style.border = '3px solid rgba(255, 255, 255, 0.9)';
          slot.style.transform = 'scale(1.1)';
        } else {
          slot.style.border = '2px solid rgba(255, 255, 255, 0.3)';
          slot.style.transform = 'scale(1)';
        }

        if (isCapturing) {
          slot.style.background = 'rgba(200, 40, 40, 0.8)';
        } else if (isOccupied) {
          // Occupied - colored background
          slot.style.background = 'rgba(0, 200, 100, 0.8)';
        } else {
          // Empty - black background
          slot.style.background = 'rgba(0, 0, 0, 0.8)';
        }
        if (slot.countEl) slot.countEl.textContent = count;
      }

      // A NEW recording landing in a slot pops it (wordless confirmation)
      const id = inventory[index] ? inventory[index].id : null;
      if (id !== this._slotIds[index]) {
        if (id !== null && slot.animate) {
          slot.animate(
            [
              { transform: 'scale(1)' },
              { transform: 'scale(1.35)', boxShadow: '0 0 14px rgba(0,255,140,0.9)', offset: 0.4 },
              { transform: 'scale(1)' },
            ],
            { duration: 500 }
          );
        }
        this._slotIds[index] = id;
      }
    });
  }

  updateRecording() {
    const count = RecordingManager.getCreaturesInRangeCount();
    const isRecording = RecordingManager.isRecording();
    const { activeSlot } = gameState.player;

    // Show/hide mic overlay based on creatures in range
    if (count > 0) {
      this.micOverlay.style.opacity = '1';
      // "×N" = creatures in earshot (a bare number reads as a slot label).
      // Guarded: this runs every frame and the count rarely changes.
      if (count !== this._creatureCountShown) {
        this.creatureCount.textContent = `×${count}`;
        this._creatureCountShown = count;
      }

      // Position mic overlay at upper-right corner of active slot.
      // offsetLeft/offsetTop force a layout pass, so only re-read them when
      // the active slot changes (slot geometry is otherwise static).
      if (activeSlot !== this._micSlot && this.inventorySlots[activeSlot]) {
        const activeSlotElement = this.inventorySlots[activeSlot];
        const slotWidth = 50; // px
        const micSize = 32; // px

        // Calculate position: half in, half out of upper-right corner
        const left = activeSlotElement.offsetLeft + slotWidth - micSize / 2;
        const top = activeSlotElement.offsetTop - micSize / 2;

        this.micOverlay.style.left = `${left}px`;
        this.micOverlay.style.top = `${top}px`;
        this._micSlot = activeSlot;
      }
    } else {
      this.micOverlay.style.opacity = '0';
    }

    // Show/hide recording indicator (red pulse)
    if (isRecording) {
      this.recordingIndicator.style.opacity = '1';
      this.recordingIndicator.style.animation = 'pulse 1s infinite';
    } else {
      this.recordingIndicator.style.opacity = '0';
      this.recordingIndicator.style.animation = 'none';
    }
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export default RecordingUI;
