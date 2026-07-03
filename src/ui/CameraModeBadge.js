/**
 * CameraModeBadge - persistent indicator shown while mouse-look is disabled,
 * so the camera mode is never a mystery (the M keypress toast is transient
 * and easy to miss).
 */
class CameraModeBadge {
  constructor() {
    this.element = null;
    this.visible = false;
  }

  _ensureElement() {
    if (this.element) return;
    this.element = document.createElement('div');
    this.element.id = 'camera-mode-badge';
    this.element.textContent = 'Keyboard look (I/J/K/L) — M: mouse look';
    this.element.style.cssText = `
      position: fixed; top: 16px; right: 16px;
      background: rgba(20, 40, 70, 0.85); color: #cfe3ff;
      padding: 5px 12px; border-radius: 4px;
      font: 13px/1.4 sans-serif; pointer-events: none; z-index: 1000;
      display: none;
    `;
    document.body.appendChild(this.element);
  }

  update(gameState) {
    const shouldShow = gameState.mode === 'PLAYING' && !gameState.input.mouseLookEnabled;
    if (shouldShow === this.visible) return;
    this._ensureElement();
    this.element.style.display = shouldShow ? 'block' : 'none';
    this.visible = shouldShow;
  }
}

export default CameraModeBadge;
