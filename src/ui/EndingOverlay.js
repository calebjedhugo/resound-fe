/**
 * EndingOverlay - the demo's closing card (ruled 2026-07-11).
 *
 * Shown when the player crosses INTO a gate flagged `ending: true` (the
 * finale portal that loops the world back to area I). This is the one
 * sanctioned use of words outside menus: the game is over, and credits are
 * credits. Dismissible with any fresh key press or a click anywhere outside
 * the link; the world keeps running behind it, and it shows again on every
 * finale crossing (replaying the loop re-earns the bow).
 */
class EndingOverlay {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'ending-overlay';
    this.el.style.cssText = `
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      background: rgba(4, 6, 14, 0);
      z-index: 2000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 1.2s ease, background 1.2s ease;
      font-family: monospace;
      text-align: center;
    `;

    const title = document.createElement('div');
    title.textContent = 'Thanks for playing';
    title.style.cssText = `
      color: #ffd97a;
      font-size: 34px;
      letter-spacing: 2px;
      text-shadow: 0 2px 12px rgba(0,0,0,0.9);
    `;

    this.link = document.createElement('a');
    this.link.href = 'https://calebhugo.com';
    this.link.target = '_blank';
    this.link.rel = 'noopener';
    this.link.textContent = 'calebhugo.com';
    this.link.style.cssText = `
      color: rgba(255, 255, 255, 0.92);
      font-size: 20px;
      text-decoration: underline;
      text-underline-offset: 4px;
    `;

    const dismissNote = document.createElement('div');
    dismissNote.textContent = '· · ·';
    dismissNote.style.cssText = 'color: rgba(255,255,255,0.4); font-size: 16px; margin-top: 24px;';

    this.el.appendChild(title);
    this.el.appendChild(this.link);
    this.el.appendChild(dismissNote);
    document.body.appendChild(this.el);

    this.visible = false;
    this._onKeyDown = (event) => {
      // Held movement keys repeat while the player walks through the portal
      // — only a FRESH press dismisses
      if (!event.repeat) this.hide();
    };
    this._onClick = (event) => {
      if (event.target !== this.link) this.hide();
    };
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.el.style.pointerEvents = 'auto';
    this.el.style.opacity = '1';
    this.el.style.background = 'rgba(4, 6, 14, 0.72)';
    window.addEventListener('keydown', this._onKeyDown);
    this.el.addEventListener('click', this._onClick);
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.style.pointerEvents = 'none';
    this.el.style.opacity = '0';
    this.el.style.background = 'rgba(4, 6, 14, 0)';
    window.removeEventListener('keydown', this._onKeyDown);
    this.el.removeEventListener('click', this._onClick);
  }

  dispose() {
    this.hide();
    this.el.remove();
  }
}

export default EndingOverlay;
