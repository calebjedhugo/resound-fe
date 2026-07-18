import * as THREE from 'three';
import gameState from 'core/GameState';
import HintMemory from 'core/HintMemory';
import RecordingManager from 'core/RecordingManager';
import { getDistance } from 'core/utils';
import { CLAP_RANGE } from 'core/constants';

/**
 * KeyHints - wordless contextual key hints.
 *
 * Each hint is a bare keycap glyph (no sentences) that appears when the
 * situation calls for its action. WHICH hints are live comes from the
 * puzzle's `teaches` list (HintMemory); performing the action retires the
 * hint for the rest of the playthrough — each lesson happens once:
 *
 *   move     - W A S D cluster, bottom-center HUD; retires on first movement
 *   record   - "R" sprite floating over a creature in recording range;
 *              retires when a recording with notes lands in a slot
 *   playback - spacebar sprite over a gate/fountain in playback reach;
 *              retires on the first playback keypress
 *   slots    - (rendered by RecordingUI, not here) a ghost tape slot that
 *              blooms at the next position with a pulsing ► when recording
 *              over the filled LAST slot is imminent; retires on first cursor
 *              move. See RecordingUI.updateGrowHint.
 *   clap     - "C" sprite over the nearest clap-range creature while TWO OR
 *              MORE audible creatures sing at once (the chord a clap can fix);
 *              retires on the first C pressed at such a moment
 *   deploy   - "G" keycap, bottom-center HUD (above the move cluster): the
 *              deployable cleanser gate (core/DeployManager). Shows once an
 *              ACTIVE cleanser exists (the mechanic leads to it — before
 *              that the key is silent). It teaches the WHOLE g-cycle,
 *              "g again to cancel" included: retires only when a deployed
 *              pad is removed or walked through (DeployManager retires it).
 */

const MOVE_HINT_DELAY_S = 1.5;
// World units above the entity's base position. Low enough to stay in frame
// when the player stands right next to the entity (3.4 hovered out of view
// up close).
const SPRITE_HEIGHT = 2.6;
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

    // HUD: "G" keycap for the deployable cleanser gate, above the move cluster
    this.deployEl = document.createElement('div');
    this.deployEl.id = 'hint-deploy';
    this.deployEl.style.cssText = `
      position: fixed;
      bottom: 148px;
      left: 50%;
      transform: translateX(-50%);
      opacity: 0;
      transition: opacity 0.4s;
      pointer-events: none;
      z-index: 1000;
      animation: hint-breathe 1.6s ease-in-out infinite;
    `;
    this.deployEl.appendChild(makeKeycapEl('G'));
    document.body.appendChild(this.deployEl);

    // The "grow the tape" (slots) hint lives in the tape strip itself now —
    // RecordingUI blooms a ghost slot with a pulsing ► at the next position.

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
    this.clapSprite = makeKeycapSprite('C');
    this.scene.add(this.recordSprite);
    this.scene.add(this.playbackSprite);
    this.scene.add(this.clapSprite);

    this._bobPhase = 0;
    this._stillTime = 0;
    this._startPosition = null;

    // Playback is a discrete keypress with no polled state, so observe the
    // key directly. Non-capture: the start gate's capture-phase dismissal
    // stops propagation, so the waking keypress can't retire the hint.
    this._keyHandler = (event) => {
      if (gameState.mode !== 'PLAYING') return;
      if (event.code === 'Space') {
        if (gameState.player.inventory.some(Boolean)) HintMemory.retire('playback');
      } else if (event.code === 'KeyC' && this.clapSprite.visible) {
        // Clapping at the hinted moment (a clashing chorus in clap range)
        // is the lesson performed.
        HintMemory.retire('clap');
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /** Per-frame evaluation. Call only while PLAYING and the world is awake. */
  update(deltaTime) {
    this._bobPhase += deltaTime * 2.5;
    this._updateMove(deltaTime);
    this._updateRecord();
    this._updatePlayback();
    this._updateClap();
    this._updateDeploy();
  }

  _updateDeploy() {
    // Teachable the moment the mechanic can work: an active cleanser exists
    // for the gate to lead to (in a level that teaches "deploy", the player
    // steps on one on the way in).
    if (HintMemory.isRetired('deploy') || !gameState.activeCleanser) {
      this.deployEl.style.opacity = '0';
      return;
    }
    this.deployEl.style.opacity = '1';
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
    // The whole tape plays on Space; its performance carries as far as the
    // loudest take it contains
    const takes = gameState.player.inventory.filter(Boolean);
    if (takes.length === 0) {
      this.playbackSprite.visible = false;
      return;
    }
    const reach = Math.max(...takes.map((t) => t.sourceRange || 0));
    const target = gameState.entities.find(
      (e) =>
        ((e.type === 'gate' && !e.isOpen) || (e.type === 'fountain' && !e.isActivated)) &&
        getDistance(gameState.player.position, e.position) <= reach
    );
    if (!target) {
      this.playbackSprite.visible = false;
      return;
    }
    this._floatOver(this.playbackSprite, target.position);
  }

  _updateClap() {
    if (HintMemory.isRetired('clap')) {
      this.clapSprite.visible = false;
      return;
    }
    // The teachable moment: two or more audible creatures are singing AT THE
    // SAME TIME (the clash a clap untangles) and one is within clap range.
    const { position } = gameState.player;
    const singing = gameState.entities.filter(
      (e) =>
        e.type === 'creature' &&
        e.instrument?.playbackState?.isPlaying &&
        getDistance(position, e.position) <= e.audibleRange
    );
    if (singing.length < 2) {
      this.clapSprite.visible = false;
      return;
    }
    // 3D clap reach — the clap pair may sit on plinths (visible pens); a
    // creature within true clap range is a clap invitation regardless of
    // level. (Puzzles that DON'T teach clap never show this hint at all —
    // hints are gated by the puzzle's `teaches` list.)
    const inClapRange = singing
      .map((c) => ({ c, d: getDistance(position, c.position) }))
      .filter(({ d }) => d <= CLAP_RANGE)
      .sort((a, b) => a.d - b.d);
    if (inClapRange.length === 0) {
      this.clapSprite.visible = false;
      return;
    }
    this._floatOver(this.clapSprite, inClapRange[0].c.position);
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
    this.deployEl.style.opacity = '0';
    this.recordSprite.visible = false;
    this.playbackSprite.visible = false;
    this.clapSprite.visible = false;
    this._stillTime = 0;
    this._startPosition = null;
  }

  dispose() {
    window.removeEventListener('keydown', this._keyHandler);
    this.moveEl.remove();
    this.deployEl.remove();
    this.scene.remove(this.recordSprite);
    this.scene.remove(this.playbackSprite);
    this.scene.remove(this.clapSprite);
  }
}

export default KeyHints;
