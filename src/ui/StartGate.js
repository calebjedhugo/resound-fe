/**
 * StartGate - wordless replacement for the old full-screen help overlay.
 *
 * The world sleeps behind a dark scrim with a slowly pulsing ring (an
 * invitation, not an instruction). Any key or click wakes it — once the world
 * behind it is built (it goes up while the world loads; see showLoading).
 * While the gate is up the game loop holds the world still — creatures don't sing and the
 * musical clock doesn't advance — so a self-solving layout can't complete
 * before the player sees it, and the waking gesture satisfies the browser's
 * user-interaction requirement before any audio plays.
 */
class StartGate {
  constructor() {
    this.element = null;
    this.visible = false;
    // False while the gate stands in front of a world still loading (see
    // showLoading): input is swallowed but nothing wakes it yet
    this.wakeable = false;
    this.dismissHandler = null;
  }

  /**
   * Put the gate up BEFORE the world exists (every world entry), so the
   * scrim is the first thing painted instead of a blank page while the
   * puzzle fetches and the first area builds and draws. No key or click
   * can wake a world that isn't there yet: the show() that follows the
   * build makes the gate wakeable.
   */
  showLoading() {
    this.show();
    this.wakeable = false;
  }

  show() {
    this.wakeable = true;
    if (this.visible) return;
    this.element = document.createElement('div');
    this.element.id = 'start-gate';
    this.element.style.cssText = `
      position: fixed; inset: 0; z-index: 9000;
      background: rgba(6, 8, 14, 0.88);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: opacity 0.6s;
    `;

    const ring = document.createElement('div');
    ring.style.cssText = `
      width: 72px; height: 72px;
      border: 3px solid rgba(255, 217, 122, 0.9);
      border-radius: 50%;
      animation: start-gate-pulse 2.2s ease-in-out infinite;
    `;
    this.element.appendChild(ring);

    if (!document.getElementById('start-gate-style')) {
      const style = document.createElement('style');
      style.id = 'start-gate-style';
      style.textContent = `
        @keyframes start-gate-pulse {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.18); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.element);
    this.visible = true;

    // Capture-phase so the waking keypress never reaches the game
    this.dismissHandler = (event) => {
      event.stopPropagation();
      if (this.wakeable && (event.type === 'keydown' || event.type === 'click')) this.hide();
    };
    window.addEventListener('keydown', this.dismissHandler, true);
    window.addEventListener('keyup', this.dismissHandler, true);
    this.element.addEventListener('click', this.dismissHandler, true);
  }

  hide() {
    if (!this.visible) return;
    window.removeEventListener('keydown', this.dismissHandler, true);
    window.removeEventListener('keyup', this.dismissHandler, true);
    this.dismissHandler = null;
    this.visible = false;
    const el = this.element;
    this.element = null;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 600);
  }
}

export default StartGate;
