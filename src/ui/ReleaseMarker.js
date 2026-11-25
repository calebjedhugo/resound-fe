import * as THREE from 'three';
import gameState from 'core/GameState';
import AbsorbManager from 'core/AbsorbManager';
import { onSlotFlash } from 'ui/slotFlash';

/**
 * ReleaseMarker — where Space would let the cursor slot's creature out,
 * marked on the floor while the slot holds one (wordless, always on: the
 * release HINT retires after the first release, this never does).
 *
 *  - Good spot: a ring the size of the creature's body, in its colour, with
 *    a dot at its centre — "it lands here".
 *  - No good spot (a wall, a cliff edge, off the floor, out of sight...): a
 *    dim red ring, no dot — "not here".
 *  - Space pressed there anyway: the ring flares red and swells, once (the
 *    slot's grey flash says the same in the strip).
 * Hidden while the slot is empty and while the pole is at work.
 *
 * The ring lies 2.5 ahead on the floor — at the bottom edge of the view at
 * the default pitch — so a RETICLE at the screen's centre says the same
 * wherever the player looks: a dot in the creature's colour (Space will let
 * it out), a hollow red ring (it won't), shaking red on a refused press.
 */

// Just over the floor's surface, under everything that stands on it
const LIFT = 0.05;
// The ring's width, a fraction of the body's radius
const RING_INNER = 0.84;
// The centre dot's radius (world units: the same at every body size)
const DOT_RADIUS = 0.16;

const VALID_OPACITY = 0.8;
const VALID_PULSE = 0.15;
const INVALID_COLOR = 0xff5544;
const INVALID_OPACITY = 0.4;

// A refused press: the flare's length (s) and how far the ring swells
export const REFUSE_S = 0.45;
const REFUSE_SWELL = 0.35;

// The reticle (CSS px)
const RETICLE_PX = 12;
const INVALID_CSS = '#ff5544';

const disc = (inner, outer, segments) => new THREE.RingGeometry(inner, outer, segments);

// Front side only (laid flat, it faces up): the program ShaderPrewarm's
// plain transparent stand-in already warms — never a hitch on first show
const flatMaterial = () =>
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });

class ReleaseMarker {
  /** @param {THREE.Scene} scene - the main scene the marker lies in */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    // Flat on the floor
    this.group.rotation.x = -Math.PI / 2;
    this.ring = new THREE.Mesh(disc(RING_INNER, 1, 48), flatMaterial());
    this.dot = new THREE.Mesh(disc(0, DOT_RADIUS, 20), flatMaterial());
    this.ring.renderOrder = 2;
    this.dot.renderOrder = 2;
    this.group.add(this.ring);
    this.group.add(this.dot);
    this.group.visible = false;
    if (scene) scene.add(this.group);
    this._phase = 0;
    this._refusedFor = 0; // seconds of refusal flare left
    this._stopListening = onSlotFlash((kind, detail) => {
      if (!detail || !detail.releaseRefused) return;
      this._refusedFor = REFUSE_S;
      this._shakeReticle();
    });
    this.reticle = document.createElement('div');
    this.reticle.id = 'release-reticle';
    this.reticle.style.cssText = `
      position: fixed;
      left: 50%;
      top: 50%;
      width: ${RETICLE_PX}px;
      height: ${RETICLE_PX}px;
      margin: ${-RETICLE_PX / 2}px 0 0 ${-RETICLE_PX / 2}px;
      box-sizing: border-box;
      border-radius: 50%;
      pointer-events: none;
      z-index: 900;
      display: none;
    `;
    this._reticleKey = 'hidden';
    document.body.appendChild(this.reticle);
  }

  /** What the reticle shows: 'hidden' | 'valid' | 'invalid' | 'refused' (tests). */
  get reticleState() {
    return this._reticleKey.split('|')[0];
  }

  /** Write the reticle's look only when it changes (this runs every frame). */
  _showReticle(state, css = '') {
    const key = `${state}|${css}`;
    if (key === this._reticleKey) return;
    this._reticleKey = key;
    const { style } = this.reticle;
    if (state === 'hidden') {
      style.display = 'none';
      return;
    }
    style.display = 'block';
    if (state === 'valid') {
      style.background = css;
      style.border = '2px solid rgba(255, 255, 255, 0.85)';
      style.boxShadow = `0 0 8px ${css}`;
      style.opacity = '0.9';
    } else {
      style.background = 'transparent';
      style.border = `2px solid ${INVALID_CSS}`;
      style.boxShadow = state === 'refused' ? `0 0 10px ${INVALID_CSS}` : 'none';
      style.opacity = state === 'refused' ? '1' : '0.6';
    }
  }

  _shakeReticle() {
    if (!this.reticle.animate) return;
    this.reticle.animate(
      [
        { transform: 'translateX(0) scale(1)' },
        { transform: 'translateX(-5px) scale(1.5)', offset: 0.2 },
        { transform: 'translateX(5px) scale(1.5)', offset: 0.45 },
        { transform: 'translateX(-3px) scale(1.2)', offset: 0.7 },
        { transform: 'translateX(0) scale(1)' },
      ],
      { duration: REFUSE_S * 1000 }
    );
  }

  /** Is the marker on screen, and is the spot it marks good? (tests, debugging) */
  get state() {
    if (!this.group.visible) return 'hidden';
    if (this._refusedFor > 0) return 'refused';
    return this.dot.visible ? 'valid' : 'invalid';
  }

  /** Per frame, while PLAYING. @param {number} deltaTime - seconds */
  update(deltaTime = 0) {
    const dt = Math.max(0, deltaTime);
    this._phase += dt;
    this._refusedFor = Math.max(0, this._refusedFor - dt);
    const held = gameState.player.inventory[gameState.player.activeSlot];
    if (gameState.mode !== 'PLAYING' || !held || !gameState.activeArea || AbsorbManager.busy) {
      this.group.visible = false;
      this._refusedFor = 0;
      this._showReticle('hidden');
      return;
    }
    const radius = held.spec.size;
    const spot = AbsorbManager.releaseSpot(radius);
    this.group.visible = true;
    this.group.position.set(spot.x, spot.y + LIFT, spot.z);

    const ringMaterial = this.ring.material;
    let scale = radius || 1;
    if (this._refusedFor > 0) {
      // Flare: bright red, swelling out and back
      const k = 1 - this._refusedFor / REFUSE_S;
      scale *= 1 + REFUSE_SWELL * Math.sin(Math.PI * k);
      ringMaterial.color.setHex(INVALID_COLOR);
      ringMaterial.opacity = 1;
      this.dot.visible = false;
      this._showReticle('refused');
    } else if (spot.valid) {
      const [r, g, b] = held.colour;
      ringMaterial.color.setRGB(r, g, b);
      ringMaterial.opacity = VALID_OPACITY + VALID_PULSE * Math.sin(this._phase * 4);
      this.dot.material.color.setRGB(r, g, b);
      this.dot.material.opacity = 0.95;
      this.dot.visible = true;
      this._showReticle('valid', held.css);
    } else {
      ringMaterial.color.setHex(INVALID_COLOR);
      ringMaterial.opacity = INVALID_OPACITY;
      this.dot.visible = false;
      this._showReticle('invalid');
    }
    this.ring.scale.set(scale, scale, 1);
  }

  /** Off screen (level change, the menu). */
  hideAll() {
    this.group.visible = false;
    this._refusedFor = 0;
    this._showReticle('hidden');
  }

  dispose() {
    this._stopListening();
    this.reticle.remove();
    if (this.scene) this.scene.remove(this.group);
    for (const mesh of [this.ring, this.dot]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

export default ReleaseMarker;
