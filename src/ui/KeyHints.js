import * as THREE from 'three';
import gameState from 'core/GameState';
import HintMemory from 'core/HintMemory';
import RecordingManager from 'core/RecordingManager';
import DeployManager from 'core/DeployManager';
import InputDevice, { KEYBOARD } from 'core/InputDevice';
import { glyphFor } from 'core/inputGlyphs';
import { makeGlyphCanvas, makeGlyphElement } from 'ui/glyphCanvas';
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
 *   clap     - "C" sprite over the nearest creature within clap range,
 *              shown steadily whenever a clap could land (not gated on the
 *              fleeting moment two creatures sing at once — that was flaky);
 *              retires on the first C pressed while the hint is up
 *   deploy   - "G" keycap, bottom-center HUD (above the move cluster): the
 *              deployable cleanser gate (core/DeployManager). Shows once an
 *              ACTIVE cleanser exists (the mechanic leads to it — before
 *              that the key is silent). It teaches the WHOLE g-cycle,
 *              "g again to cancel" included: retires only when a deployed
 *              pad is removed or walked through (DeployManager retires it).
 *
 * The glyphs follow the device in hand (core/InputDevice): keycaps on the
 * keyboard, a controller's own buttons on a pad — its family's face-button
 * marks for R / Space / C / G, the left and right sticks for the move
 * cluster (core/inputGlyphs, drawn by ui/glyphCanvas). A hint on screen
 * swaps its glyph in place. Each glyph is drawn once per family and kept:
 * nothing is drawn or uploaded per frame.
 */

const MOVE_HINT_DELAY_S = 1.5;
// World units above the entity's base position. Low enough to stay in frame
// when the player stands right next to the entity (3.4 hovered out of view
// up close).
const SPRITE_HEIGHT = 2.6;
const BOB_AMPLITUDE = 0.25;

// Each hint sprite's glyph canvas height, and its width in the world by
// glyph kind (the spacebar is wide)
const SPRITE_CANVAS_PX = 128;
const SPRITE_WORLD_WIDTH = { space: 3.0 };
const SPRITE_WORLD_WIDTH_DEFAULT = 1.4;

// The HUD glyphs on a pad, in CSS pixels
const STICK_PX = 56;
const FACE_PX = 40;

/** A camera-facing sprite for an in-world hint; its glyph is set later. */
function makeHintSprite() {
  const material = new THREE.SpriteMaterial({
    map: null,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 999;
  return sprite;
}

/** A DOM keycap element (for HUD-anchored hints). */
function makeKeycapEl(label, sizePx = 34) {
  const el = document.createElement('div');
  el.textContent = label;
  el.dataset.glyph = label;
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

    // HUD: the move cluster (WASD, or a pad's two sticks), bottom-center
    this.moveEl = document.createElement('div');
    this.moveEl.id = 'hint-move';
    this.moveEl.style.cssText = `
      position: fixed;
      bottom: 48px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      opacity: 0;
      transition: opacity 0.4s;
      pointer-events: none;
      z-index: 1000;
      animation: hint-breathe 1.6s ease-in-out infinite;
    `;
    document.body.appendChild(this.moveEl);

    // HUD: "G" keycap (a pad: its Triangle / Y / X) for the deployable
    // cleanser gate, above the move cluster. While a gate is DEPLOYED, a 🚫
    // badge appears beside the keycap: G now means cancel.
    this.deployEl = document.createElement('div');
    this.deployEl.id = 'hint-deploy';
    this.deployEl.style.cssText = `
      position: fixed;
      bottom: 148px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0;
      transition: opacity 0.4s;
      pointer-events: none;
      z-index: 1000;
      animation: hint-breathe 1.6s ease-in-out infinite;
    `;
    this.deployCancelEl = document.createElement('div');
    this.deployCancelEl.textContent = '🚫';
    this.deployCancelEl.style.cssText = `
      font-size: 20px;
      line-height: 1;
      display: none;
    `;
    document.body.appendChild(this.deployEl);

    // The "grow the tape" (slots) hint lives in the tape strip itself now —
    // RecordingUI blooms a ghost slot with a pulsing ► (a pad: its right
    // shoulder) at the next position.

    const style = document.createElement('style');
    style.textContent = `
      @keyframes hint-breathe {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.45); }
      }
    `;
    document.head.appendChild(style);

    // In-world sprites, by the action each one hints
    this.recordSprite = makeHintSprite();
    this.playbackSprite = makeHintSprite();
    this.clapSprite = makeHintSprite();
    this._sprites = [
      ['record', this.recordSprite],
      ['play', this.playbackSprite],
      ['clap', this.clapSprite],
    ];
    this.scene.add(this.recordSprite);
    this.scene.add(this.playbackSprite);
    this.scene.add(this.clapSprite);

    // Every glyph drawn so far, by family: each hint's sprite texture (and
    // its world size), the move cluster and the deploy glyph. Drawn the
    // first time a family shows, kept for the next time it does.
    this._glyphs = {};
    this._applyFamily(InputDevice.family);
    this._stopFollowing = InputDevice.onChange((family) => this._applyFamily(family));

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

  /**
   * Show `family`'s glyphs in every hint, drawing them the first time:
   * each sprite takes its texture (the material keeps its program), the HUD
   * hints their elements. Hints on screen stay where they are.
   */
  _applyFamily(family) {
    if (!this._glyphs[family]) this._glyphs[family] = this._drawGlyphs(family);
    const glyphs = this._glyphs[family];
    this._sprites.forEach(([action, sprite]) => {
      const { texture, width, height } = glyphs.sprites[action];
      sprite.material.map = texture;
      sprite.scale.set(width, height, 1);
    });
    this.moveEl.replaceChildren(glyphs.move);
    this.deployEl.replaceChildren(glyphs.deploy, this.deployCancelEl);
  }

  /** Draw every hint's glyph for `family` (once per family). */
  _drawGlyphs(family) {
    const sprites = {};
    this._sprites.forEach(([action]) => {
      const glyph = glyphFor(action, family);
      const canvas = makeGlyphCanvas(glyph, SPRITE_CANVAS_PX);
      const width = SPRITE_WORLD_WIDTH[glyph.kind] || SPRITE_WORLD_WIDTH_DEFAULT;
      sprites[action] = {
        texture: new THREE.CanvasTexture(canvas),
        width,
        height: (width * canvas.height) / canvas.width,
      };
    });

    let move;
    let deploy;
    if (family === KEYBOARD) {
      // W over A S D
      const [up, ...row] = glyphFor('move', family).labels;
      move = document.createElement('div');
      move.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 4px;';
      const topRow = document.createElement('div');
      topRow.appendChild(makeKeycapEl(up));
      const bottomRow = document.createElement('div');
      bottomRow.style.cssText = 'display: flex; gap: 4px;';
      row.forEach((k) => bottomRow.appendChild(makeKeycapEl(k)));
      move.appendChild(topRow);
      move.appendChild(bottomRow);
      deploy = makeKeycapEl(glyphFor('deploy', family).label);
    } else {
      // The left stick walks, the right one looks
      move = document.createElement('div');
      move.style.cssText = 'display: flex; align-items: center; gap: 10px;';
      move.appendChild(makeGlyphElement(glyphFor('move', family), STICK_PX));
      move.appendChild(makeGlyphElement(glyphFor('look', family), STICK_PX));
      deploy = makeGlyphElement(glyphFor('deploy', family), FACE_PX);
    }
    return { sprites, move, deploy };
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
    // With a gate deployed, G means cancel — badge it.
    this.deployCancelEl.style.display = DeployManager.state === 'deployed' ? 'block' : 'none';
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
    // The clap invitation: ANY creature within clap reach — the hint stays up
    // steadily whenever a clap could land, not only during the fleeting moment
    // two creatures happen to sing at once (that timing-gated version was
    // flaky). 3D clap reach — the clap pair may sit on plinths (visible pens);
    // a creature within true clap range is a clap invitation regardless of
    // level. (Puzzles that DON'T teach clap never show this hint at all —
    // hints are gated by the puzzle's `teaches` list.)
    const { position } = gameState.player;
    const inClapRange = gameState.entities
      .filter((e) => e.type === 'creature')
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
    this._stopFollowing();
    Object.values(this._glyphs).forEach(({ sprites }) =>
      Object.values(sprites).forEach(({ texture }) => texture.dispose())
    );
    this.moveEl.remove();
    this.deployEl.remove();
    this.scene.remove(this.recordSprite);
    this.scene.remove(this.playbackSprite);
    this.scene.remove(this.clapSprite);
  }
}

export default KeyHints;
