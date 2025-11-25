import gameState from 'core/GameState';
import RecordingManager from 'core/RecordingManager';

/**
 * RecordingUI - Manages inventory and recording UI in bottom-right corner
 */
class RecordingUI {
  constructor() {
    this.container = null;
    this.inventorySlots = [];
    this.microphoneIcon = null;
    this.creatureCount = null;
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
  }

  createInventoryUI() {
    this.inventoryContainer = document.createElement('div');
    this.inventoryContainer.style.cssText = `
      display: flex;
      gap: 10px;
      position: relative;
    `;

    // Create 5 inventory slots
    for (let i = 0; i < 5; i += 1) {
      const slot = document.createElement('div');
      slot.style.cssText = `
        width: 50px;
        height: 50px;
        background: rgba(0, 0, 0, 0.8);
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        transition: all 0.2s;
        position: relative;
      `;
      slot.dataset.index = i;
      this.inventorySlots.push(slot);
      this.inventoryContainer.appendChild(slot);
    }

    this.container.appendChild(this.inventoryContainer);
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
      animation: pulse 1s infinite;
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
    this.updateInventory();
    this.updateRecording();
  }

  updateInventory() {
    const { inventory, activeSlot } = gameState.player;

    this.inventorySlots.forEach((slot, index) => {
      const isActive = index === activeSlot;
      const isOccupied = inventory[index] !== null;

      // Update styles
      if (isActive) {
        slot.style.border = '3px solid rgba(255, 255, 255, 0.9)';
        slot.style.transform = 'scale(1.1)';
      } else {
        slot.style.border = '2px solid rgba(255, 255, 255, 0.3)';
        slot.style.transform = 'scale(1)';
      }

      if (isOccupied) {
        // Occupied - colored background
        slot.style.background = 'rgba(0, 200, 100, 0.8)';
      } else {
        // Empty - black background
        slot.style.background = 'rgba(0, 0, 0, 0.8)';
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
      this.creatureCount.textContent = count;

      // Position mic overlay at upper-right corner of active slot
      const activeSlotElement = this.inventorySlots[activeSlot];
      const slotWidth = 50; // px
      const slotHeight = 50; // px
      const micSize = 32; // px

      // Calculate position: half in, half out of upper-right corner
      const left = activeSlotElement.offsetLeft + slotWidth - micSize / 2;
      const top = activeSlotElement.offsetTop - micSize / 2;

      this.micOverlay.style.left = `${left}px`;
      this.micOverlay.style.top = `${top}px`;
    } else {
      this.micOverlay.style.opacity = '0';
    }

    // Show/hide recording indicator (red pulse)
    if (isRecording) {
      this.recordingIndicator.style.opacity = '1';
    } else {
      this.recordingIndicator.style.opacity = '0';
    }
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export default RecordingUI;
