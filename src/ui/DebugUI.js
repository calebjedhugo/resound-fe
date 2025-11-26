import gameState from 'core/GameState';
import { getDistance } from 'core/utils';

/**
 * DebugUI - Simple visual indicators for testing
 * Shows inventory contents and nearby entity requirements
 */
class DebugUI {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Create debug container
    this.container = document.createElement('div');
    this.container.id = 'debug-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 4px;
      max-width: 400px;
      z-index: 999;
      line-height: 1.4;
    `;

    document.body.appendChild(this.container);
  }

  /**
   * Update debug UI - call every frame
   */
  update() {
    if (gameState.mode !== 'PLAYING') {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';

    let html = '<strong>DEBUG INFO</strong><br/><br/>';

    // Show inventory contents
    html += '<strong>Inventory:</strong><br/>';
    gameState.player.inventory.forEach((slot, index) => {
      const isActive = index === gameState.player.activeSlot;
      const prefix = isActive ? '&gt; ' : '  ';

      if (slot && slot.data) {
        const songPreview = this.formatSong(slot.data).substring(0, 40);
        html += `${prefix}Slot ${index + 1}: ${songPreview}...<br/>`;
      } else {
        html += `${prefix}Slot ${index + 1}: [empty]<br/>`;
      }
    });

    // Show nearby entities
    const nearbyEntities = this.getNearbyEntities();
    if (nearbyEntities.length > 0) {
      html += '<br/><strong>Nearby Entities:</strong><br/>';
      nearbyEntities.forEach((entity) => {
        const distance = Math.round(getDistance(gameState.player.position, entity.position));
        const songPreview = this.formatRequiredSong(entity);

        if (entity.type === 'gate') {
          const status = entity.isActivated ? '[OPEN]' : '[CLOSED]';
          html += `Gate ${status} (${distance}m): ${songPreview}<br/>`;
        } else if (entity.type === 'fountain') {
          const status = entity.isActivated ? '[COMPLETE]' : '[ACTIVE]';
          html += `Fountain ${status} (${distance}m): ${songPreview}<br/>`;
        }
      });
    }

    this.container.innerHTML = html;
  }

  /**
   * Format a song for display
   */
  formatSong(songData) {
    if (!songData || songData.length === 0) return 'empty';

    return songData
      .map((item) => {
        if (Array.isArray(item)) {
          // Chord
          return `[${item.map((n) => n.pitch).join('+')}]`;
        }
        // Single note
        return item.pitch;
      })
      .join(' ');
  }

  /**
   * Format required song for entity
   */
  formatRequiredSong(entity) {
    if (!entity.requiredSong) return 'N/A';
    return this.formatSong(entity.requiredSong);
  }

  /**
   * Get entities within 30 units of player
   */
  getNearbyEntities() {
    const maxDistance = 30;
    const entities = gameState.entities || [];

    return entities.filter((entity) => {
      if (entity.type !== 'gate' && entity.type !== 'fountain') return false;
      const distance = getDistance(gameState.player.position, entity.position);
      return distance <= maxDistance;
    });
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export default DebugUI;
