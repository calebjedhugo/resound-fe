import gameState from 'core/GameState';
import { getDistance } from 'core/utils';

/**
 * DebugUI - Simple visual indicators for testing
 * Shows inventory contents and nearby entity requirements
 */
class DebugUI {
  constructor() {
    this.container = null;
    this.enabled = false; // Hidden by default; toggled with F3
    this.init();
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
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
    if (!this.enabled || gameState.mode !== 'PLAYING') {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';

    let html = '<strong>DEBUG INFO</strong><br/><br/>';

    // Player position
    const p = gameState.player.position;
    html += `<strong>Player:</strong> (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) elev ${
      gameState.player.elevation
    }<br/><br/>`;

    // Creatures (distance + whether recordable from here)
    const creatures = gameState.entities.filter((e) => e.type === 'creature');
    if (creatures.length > 0) {
      html += '<strong>Creatures:</strong><br/>';
      creatures.forEach((c) => {
        const d = getDistance(gameState.player.position, c.position);
        const flag = c.isRecordable ? '[IN RECORDING RANGE]' : '';
        html += `${this.formatSong(c.song)} (${Math.round(d)}m, range ${c.audibleRange}, rec ≤ ${
          c.recordingRange
        }) ${flag}<br/>`;
      });
      html += '<br/>';
    }

    // Show harmony detections (recent only — stale lines read as "still sounding")
    const recentHarmonies = (gameState.harmonyLog || []).filter(
      (h) => Date.now() - h.timestamp < 4000
    );
    if (recentHarmonies.length > 0) {
      html += '<strong>Player-Creature Harmonies:</strong><br/>';
      recentHarmonies.forEach((h) => {
        let harmonyColor = '#ffff00'; // perfect (yellow)
        if (h.harmony === 'consonant') harmonyColor = '#00ff00'; // green
        if (h.harmony === 'dissonant') harmonyColor = '#ff0000'; // red
        html += `<span style="color: ${harmonyColor}">🎵 ${h.creature}: ${h.creaturePitch} + ${
          h.playerPitch
        } = ${h.harmony.toUpperCase()} (${h.interval})</span><br/>`;
      });
      html += '<br/>';
    }

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
          const status = entity.isOpen ? '[OPEN]' : '[LISTENING]';
          html += `Gate ${status} (${distance}m): ${songPreview}<br/>`;
        } else if (entity.type === 'fountain') {
          const status = entity.isActivated ? '[DONE]' : '[LISTENING]';
          html += `Fountain ${status} (${distance}m): ${songPreview}<br/>`;
        }

        // Last judged phrase (mirrors the in-world mismatch flash for
        // testers/automation that can't catch a 600ms animation)
        if (entity.lastPhraseResult && !(entity.type === 'fountain' && entity.isActivated)) {
          const r = entity.lastPhraseResult;
          const ago = ((Date.now() - r.at) / 1000).toFixed(0);
          html += `<span style="color: #ff6666">  ↳ heard ${r.noteCount}-note phrase — NO MATCH (${ago}s ago)</span><br/>`;
        }
      });
    }

    this.container.innerHTML = html;
  }

  /**
   * Format a song for display
   */
  formatSong(songData) {
    if (!songData) return 'empty';

    // Handle voices format (object with voices array)
    if (!Array.isArray(songData)) {
      if (songData.voices && Array.isArray(songData.voices)) {
        return songData.voices
          .map((v) => `${v.id || '?'}:[${(v.notes || []).map((n) => n.pitch).join(' ')}]`)
          .join(' | ');
      }
      return 'empty';
    }

    if (songData.length === 0) return 'empty';

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
