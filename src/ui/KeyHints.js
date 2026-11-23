import * as THREE from 'three';
import gameState from 'core/GameState';
import HintMemory from 'core/HintMemory';
import AbsorbManager from 'core/AbsorbManager';
import DeployManager from 'core/DeployManager';
import InputDevice, { KEYBOARD } from 'core/InputDevice';
import { glyphFor } from 'core/inputGlyphs';
import { makeGlyphCanvas, makeGlyphElement } from 'ui/glyphCanvas';

/**
 * KeyHints - wordless contextual key hints.
 *
 * Each hint is a bare keycap glyph (no sentences) that appears when the
 * situation calls for its action. WHICH hints are live comes from the
 * puzzle's `teaches` list (HintMemory); performing the action retires the
 * hint for the rest of the playthrough — each lesson happens once:
 *
 *   move     - W A S D cluster, bottom-center HUD; retires on first movement
 *   record   - the ABSORB hint (the lesson keeps its puzzle id): "R"
 *              floating over the creature R would absorb (core/AbsorbManager);
 *              retires on the first absorb
 *   playback - the RELEASE hint (likewise): the spacebar floating over the
 *              spot Space would release the cursor slot's creature onto,
 *              while it holds one and the spot is good; retires on the
 *              first release
 *   (slots   - the tape's grow hint, gone 2026-11-23: an absorb never
 *              overwrites a slot, so there is nothing to warn of)
 *   (clap    - the "C" over a creature in clap range, gone 2026-11-23
 *              with clapping: a released creature's first note lands on
 *              the beat it is let out instead)
 *   deploy   - "G" keycap, bottom-center HUD (above the move cluster): the
 *              deployable waystone gate (core/DeployManager). Shows once an
 *              ACTIVE waystone exists (the mechanic leads to it — before
 *              that the key is silent). It teaches the WHOLE g-cycle,
 *              "g again to cancel" included: retires only when a deployed
 *              pad is removed or walked through (DeployManager retires it).
 *
 * The glyphs follow the device in hand (core/InputDevice): keycaps on the
 * keyboard, a controller's own buttons on a pad — its family's face-button
 * marks for R / Space / G, the left and right sticks for the move
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
// The release hint marks a spot only RELEASE_DISTANCE ahead, low over the
// floor: drawn smaller, so it marks the spot instead of filling the view
const SPRITE_SCALE = { release: 0.4 };
const RELEASE_HINT_HEIGHT = 0.55;

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
    // waystone gate, above the move cluster. While a gate is DEPLOYED, a 🚫
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

    const style = document.createElement('style');
    style.textContent = `
      @keyframes hint-breathe {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.45); }
      }
    `;
    document.head.appendChild(style);

    // In-world sprites, by the action each one hints
    this.absorbSprite = makeHintSprite();
    this.releaseSprite = makeHintSprite();
    this._sprites = [
      ['absorb', this.absorbSprite],
      ['release', this.releaseSprite],
    ];
    this.scene.add(this.absorbSprite);
    this.scene.add(this.releaseSprite);

    // Every glyph drawn so far, by family: each hint's sprite texture (and
    // its world size), the move cluster and the deploy glyph. Drawn the
    // first time a family shows, kept for the next time it does.
    this._glyphs = {};
    this._applyFamily(InputDevice.family);
    this._stopFollowing = InputDevice.onChange((family) => this._applyFamily(family));

    this._bobPhase = 0;
    this._stillTime = 0;
    this._startPosition = null;
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
      const k = SPRITE_SCALE[action] || 1;
      sprite.material.map = texture;
      sprite.scale.set(width * k, height * k, 1);
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
    this._updateAbsorb();
    this._updateRelease();
    this._updateDeploy();
  }

  _updateDeploy() {
    // Teachable the moment the mechanic can work: an active waystone exists
    // for the gate to lead to (in a level that teaches "deploy", the player
    // steps on one on the way in).
    if (HintMemory.isRetired('deploy') || !gameState.activeWaystone) {
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

  _updateAbsorb() {
    // While the pole works, the pole carries the message
    const target =
      HintMemory.isRetired('record') || AbsorbManager.busy ? null : AbsorbManager.target();
    if (!target) {
      this.absorbSprite.visible = false;
      return;
    }
    this._floatOver(this.absorbSprite, target.position);
  }

  _updateRelease() {
    const held = gameState.player.inventory[gameState.player.activeSlot];
    if (HintMemory.isRetired('playback') || !held || AbsorbManager.busy) {
      this.releaseSprite.visible = false;
      return;
    }
    // Low over the spot it would come out onto, when there is one
    const spot = AbsorbManager.releaseSpot(held.spec.size);
    if (!spot.valid) {
      this.releaseSprite.visible = false;
      return;
    }
    this._floatOver(this.releaseSprite, spot, RELEASE_HINT_HEIGHT);
  }

  _floatOver(sprite, position, height = SPRITE_HEIGHT) {
    sprite.position.set(
      position.x,
      position.y + height + Math.sin(this._bobPhase) * BOB_AMPLITUDE,
      position.z
    );
    sprite.material.opacity = 0.75 + 0.25 * Math.sin(this._bobPhase * 1.3);
    sprite.visible = true;
  }

  /** Hide everything (level change / exit to menu). Retirement is untouched. */
  hideAll() {
    this.moveEl.style.opacity = '0';
    this.deployEl.style.opacity = '0';
    this.absorbSprite.visible = false;
    this.releaseSprite.visible = false;
    this._stillTime = 0;
    this._startPosition = null;
  }

  dispose() {
    this._stopFollowing();
    Object.values(this._glyphs).forEach(({ sprites }) =>
      Object.values(sprites).forEach(({ texture }) => texture.dispose())
    );
    this.moveEl.remove();
    this.deployEl.remove();
    this.scene.remove(this.absorbSprite);
    this.scene.remove(this.releaseSprite);
  }
}

export default KeyHints;
