import * as THREE from 'three';
import gameState from 'core/GameState';
import HintMemory from 'core/HintMemory';
import RecordingManager from 'core/RecordingManager';
import { getDistance } from 'core/utils';

/**
 * KeyHints - wordless contextual key hints.
 *
 * Each hint is a bare keycap glyph (no sentences) that appears the first time
 * the situation calls for its action and retires permanently (HintMemory)
 * once the player performs it:
 *
 *   move     - W A S D cluster, bottom-center HUD; retires on first movement
 *   record   - "R" sprite floating over a creature in recording range;
 *              retires when a recording with notes lands in a slot
 *   playback - spacebar sprite over a gate/fountain in playback reach;
 *              retires on the first playback keypress
 *   slots    - arrow keycaps by the inventory, shown when recording over an
 *              occupied slot is imminent; retires on first slot change
 */

const MOVE_HINT_DELAY_S = 1.5;
const SPRITE_HEIGHT = 3.4; // world units above the entity's base position
const BOB_AMPLITUDE = 0.25;

/** Draw a single keycap onto a canvas context. */
function drawKeycap(c, x, y, w, h, label) {
  const r = Math.min(w, h) * 0.18;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.fillStyle = 'rgba(16, 20, 32, 0.92)';
  c.fill();
  c.lineWidth = Math.max(3, h * 0.05);
  c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  c.stroke();
  if (label) {
    c.fillStyle = '#ffd97a';
    c.font = `bold ${Math.floor(h * 0.55)}px monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, x + w / 2, y + h / 2 + h * 0.03);
  }
}

/** Build a camera-facing sprite showing one keycap ("R") or a spacebar. */
function makeKeycapSprite(kind) {
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d');
  let worldW;
  if (kind === 'space') {
    canvas.width = 320;
    canvas.height = 112;
    drawKeycap(c, 8, 8, 304, 96, '');
    worldW = 3.0;
  } else {
    canvas.width = 128;
    canvas.height = 128;
    drawKeycap(c, 8, 8, 112, 112, kind);
    worldW = 1.4;
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(worldW, (worldW * canvas.height) / canvas.width, 1);
  sprite.visible = false;
  sprite.renderOrder = 999;
  return sprite;
}

/** A DOM keycap element (for HUD-anchored hints). */
function makeKeycapEl(label, sizePx = 34) {
  const el = document.createElement('div');
  el.textContent = label;
  el.style.cssText = `
    width: ${sizePx}px;
    height: ${sizePx}px;
    background: rgba(16, 20, 32, 0.92);
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 6px;
    color: #ffd97a;
    font: bold ${Math.floor(sizePx * 0.5)}px monospace;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  return el;
}

class KeyHints {
  constructor(scene) {
    this.scene = scene;

    // HUD: WASD cluster, bottom-center
    this.moveEl = document.createElement('div');
    this.moveEl.id = 'hint-move';
    this.moveEl.style.cssText = `
      position: fixed;
      bottom: 48px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.4s;
      pointer-events: none;
      z-index: 1000;
      animation: hint-breathe 1.6s ease-in-out infinite;
    `;
    const topRow = document.createElement('div');
    topRow.appendChild(makeKeycapEl('W'));
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display: flex; gap: 4px;';
    ['A', 'S', 'D'].forEach((k) => bottomRow.appendChild(makeKeycapEl(k)));
    this.moveEl.appendChild(topRow);
    this.moveEl.appendChild(bottomRow);
    document.body.appendChild(this.moveEl);

    // HUD: slot-cycling arrows, sitting just left of the inventory strip
    this.slotsEl = document.createElement('div');
    this.slotsEl.id = 'hint-slots';
    this.slotsEl.style.cssText = `
      position: fixed;
      bottom: 32px;
      right: 330px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.4s;
      pointer-events: none;
      z-index: 1000;
      animation: hint-breathe 1.6s ease-in-out infinite;
    `;
    this.slotsEl.appendChild(makeKeycapEl('◄', 28));
    this.slotsEl.appendChild(makeKeycapEl('►', 28));
    document.body.appendChild(this.slotsEl);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes hint-breathe {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.45); }
      }
    `;
    document.head.appendChild(style);

    // In-world sprites
    this.recordSprite = makeKeycapSprite('R');
    this.playbackSprite = makeKeycapSprite('space');
    this.scene.add(this.recordSprite);
    this.scene.add(this.playbackSprite);

    this._bobPhase = 0;
    this._stillTime = 0;
    this._startPosition = null;
    this._prevActiveSlot = gameState.player.activeSlot;

    // Playback is a discrete keypress with no polled state, so observe the
    // key directly. Non-capture: the start gate's capture-phase dismissal
    // stops propagation, so the waking keypress can't retire the hint.
    this._keyHandler = (event) => {
      if (event.code !== 'Space' || gameState.mode !== 'PLAYING') return;
      const { inventory, activeSlot } = gameState.player;
      if (inventory[activeSlot]) HintMemory.retire('playback');
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /** Per-frame evaluation. Call only while PLAYING and the world is awake. */
  update(deltaTime) {
    this._bobPhase += deltaTime * 2.5;
    this._updateMove(deltaTime);
    this._updateRecord();
    this._updatePlayback();
    this._updateSlots();
  }

  _updateMove(deltaTime) {
    if (HintMemory.isRetired('move')) {
      this.moveEl.style.opacity = '0';
      return;
    }
    const { position } = gameState.player;
    if (!this._startPosition) {
      this._startPosition = { x: position.x, z: position.z };
    }
    const moved =
      Math.abs(position.x - this._startPosition.x) > 0.05 ||
      Math.abs(position.z - this._startPosition.z) > 0.05;
    if (moved) {
      HintMemory.retire('move');
      this.moveEl.style.opacity = '0';
      return;
    }
    this._stillTime += deltaTime;
    if (this._stillTime > MOVE_HINT_DELAY_S) {
      this.moveEl.style.opacity = '1';
    }
  }

  _updateRecord() {
    // Retires on the first recording that actually captured notes, however it
    // was made — the slot pop confirms the deed.
    if (!HintMemory.isRetired('record')) {
      const landed = gameState.player.inventory.some((slot) => slot && slot.data.length > 0);
      if (landed) HintMemory.retire('record');
    }
    if (HintMemory.isRetired('record')) {
      this.recordSprite.visible = false;
      return;
    }
    const { creaturesInRange } = gameState.recording;
    // While recording, the red pulse carries the message; hide the keycap.
    if (creaturesInRange.length === 0 || RecordingManager.isRecording()) {
      this.recordSprite.visible = false;
      return;
    }
    this._floatOver(this.recordSprite, creaturesInRange[0].position);
  }

  _updatePlayback() {
    if (HintMemory.isRetired('playback')) {
      this.playbackSprite.visible = false;
      return;
    }
    const recording = gameState.player.inventory[gameState.player.activeSlot];
    if (!recording) {
      this.playbackSprite.visible = false;
      return;
    }
    const target = gameState.entities.find(
      (e) =>
        (e.type === 'gate' || e.type === 'fountain') &&
        !e.isActivated &&
        getDistance(gameState.player.position, e.position) <= recording.sourceRange
    );
    if (!target) {
      this.playbackSprite.visible = false;
      return;
    }
    this._floatOver(this.playbackSprite, target.position);
  }

  _updateSlots() {
    const { activeSlot } = gameState.player;
    if (activeSlot !== this._prevActiveSlot) {
      this._prevActiveSlot = activeSlot;
      HintMemory.retire('slots');
    }
    if (HintMemory.isRetired('slots')) {
      this.slotsEl.style.opacity = '0';
      return;
    }
    // The teachable moment: recording now would overwrite the active slot.
    const wouldOverwrite =
      gameState.recording.creaturesInRange.length > 0 && gameState.player.inventory[activeSlot];
    this.slotsEl.style.opacity = wouldOverwrite ? '1' : '0';
  }

  _floatOver(sprite, position) {
    sprite.position.set(
      position.x,
      position.y + SPRITE_HEIGHT + Math.sin(this._bobPhase) * BOB_AMPLITUDE,
      position.z
    );
    sprite.material.opacity = 0.75 + 0.25 * Math.sin(this._bobPhase * 1.3);
    sprite.visible = true;
  }

  /** Hide everything (level change / exit to menu). Retirement is untouched. */
  hideAll() {
    this.moveEl.style.opacity = '0';
    this.slotsEl.style.opacity = '0';
    this.recordSprite.visible = false;
    this.playbackSprite.visible = false;
    this._stillTime = 0;
    this._startPosition = null;
  }

  dispose() {
    window.removeEventListener('keydown', this._keyHandler);
    this.moveEl.remove();
    this.slotsEl.remove();
    this.scene.remove(this.recordSprite);
    this.scene.remove(this.playbackSprite);
  }
}

export default KeyHints;
