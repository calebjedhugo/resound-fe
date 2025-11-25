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
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 15px;
      z-index: 1000;
      font-family: monospace;
    `;

    // Create inventory UI
    this.createInventoryUI();

    // Create recording UI
    this.createRecordingUI();

    document.body.appendChild(this.container);
  }

  createInventoryUI() {
    const inventoryContainer = document.createElement('div');
    inventoryContainer.style.cssText = `
      display: flex;
      gap: 10px;
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
      `;
      slot.dataset.index = i;
      this.inventorySlots.push(slot);
      inventoryContainer.appendChild(slot);
    }

    this.container.appendChild(inventoryContainer);
  }

  createRecordingUI() {
    const recordingContainer = document.createElement('div');
    recordingContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      opacity: 0;
      transition: opacity 0.3s;
    `;

    // Microphone icon (SVG)
    this.microphoneIcon = document.createElement('div');
    this.microphoneIcon.style.cssText = `
      position: relative;
      width: 50px;
      height: 50px;
      font-size: 40px;
      text-align: center;
      line-height: 50px;
    `;
    this.microphoneIcon.innerHTML = '🎤';

    // Creature count overlay
    this.creatureCount = document.createElement('div');
    this.creatureCount.style.cssText = `
      position: absolute;
      top: -5px;
      right: -5px;
      background: rgba(255, 255, 255, 0.9);
      color: black;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      font-size: 14px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    this.creatureCount.textContent = '0';
    this.microphoneIcon.appendChild(this.creatureCount);

    // Recording indicator (red dot)
    this.recordingIndicator = document.createElement('div');
    this.recordingIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      background: #ff0000;
      border-radius: 50%;
      opacity: 0;
      transition: opacity 0.3s;
      animation: pulse 1s infinite;
    `;

    recordingContainer.appendChild(this.microphoneIcon);
    recordingContainer.appendChild(this.recordingIndicator);

    this.container.appendChild(recordingContainer);

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);

    this.recordingContainer = recordingContainer;
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

    // Show/hide recording UI based on creatures in range
    if (count > 0) {
      this.recordingContainer.style.opacity = '1';
      this.creatureCount.textContent = count;
    } else {
      this.recordingContainer.style.opacity = '0';
    }

    // Show/hide recording indicator
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
