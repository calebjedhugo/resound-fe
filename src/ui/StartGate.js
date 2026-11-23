/**
 * StartGate - wordless replacement for the old full-screen help overlay.
 *
 * The world sleeps behind a dark scrim with a slowly pulsing ring (an
 * invitation, not an instruction). Any key or click wakes it — once the world
 * behind it is built (it goes up while the world loads; see showLoading).
 * While the gate is up the game loop holds the world still — creatures don't sing and the
 * musical clock doesn't advance — so a self-solving layout can't complete
 * before the player sees it, and the waking gesture satisfies the browser's
 * user-interaction requirement before any audio plays. With nothing moving,
 * it is also when the world's audio is built ahead (core/AudioPrewarm).
 *
 * A controller button or Esc wakes it only into a world with sound
 * (_wakeIntoSound).
 *
 * In the editor's Play (core/playLink) the gate is VEILED while the world
 * loads: up (the world held still, input swallowed) but unseen, so the
 * game's first frame is the world at the spawn, as the editor's camera
 * landed on it. The editor's GO reveals it: gone at once if audio can run,
 * else the gate a level start always shows.
 */
import { audioContextManager } from 'resound-sound';
import AudioPrewarm from 'core/AudioPrewarm';

class StartGate {
  constructor() {
    this.element = null;
    this.visible = false;
    // False while the gate stands in front of a world still loading (see
    // showLoading): input is swallowed but nothing wakes it yet
    this.wakeable = false;
    this.dismissHandler = null;
    this.veiled = false;
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

    if (this.veiled) {
      this.element.style.transition = 'none';
      this.element.style.opacity = '0';
    }
    document.body.appendChild(this.element);
    this.visible = true;
    AudioPrewarm.hold(true);

    // Capture-phase so the waking keypress never reaches the game
    this.dismissHandler = (event) => {
      event.stopPropagation();
      // Veiled, nothing but the editor's GO lifts it (reveal)
      if (!this.wakeable || this.veiled) return;
      if (event.type !== 'keydown' && event.type !== 'click') return;
      if (event.fromGamepad || event.code === 'Escape') this._wakeIntoSound();
      else this.hide();
    };
    window.addEventListener('keydown', this.dismissHandler, true);
    window.addEventListener('keyup', this.dismissHandler, true);
    this.element.addEventListener('click', this.dismissHandler, true);
  }

  /**
   * A controller button (core/Gamepad) or Esc while the world can wake.
   * Browsers count neither as the user activation that lets audio start
   * (the HTML spec leaves Esc out), so a gate one dropped could leave the
   * world silent: it wakes the world only with audio running, already (an
   * earlier gate's gesture started it) or once the resume it asks for
   * starts it (a page already clicked or keyed may). Otherwise the gate
   * stays up for a key or a click, and says so.
   */
  _wakeIntoSound() {
    const context = audioContextManager.getContext();
    if (context.state === 'running') {
      this.hide();
      return;
    }
    const scrim = this.element;
    context.resume().then(
      () => {
        if (this.element === scrim && this.wakeable && context.state === 'running') this.hide();
      },
      () => {} // refused: still a key or a click to come
    );
    if (!this.element.querySelector('.start-gate-sound')) {
      const note = document.createElement('div');
      note.className = 'start-gate-sound';
      note.textContent = 'press a key or click to start sound';
      note.style.cssText = `
        position: absolute; top: calc(50% + 64px); left: 0; right: 0;
        text-align: center; font: 15px monospace; letter-spacing: 1px;
        color: rgba(255, 217, 122, 0.75);
      `;
      this.element.appendChild(note);
    }
  }

  /**
   * Keep the gate up but unseen (the editor's Play, while the world loads
   * and the editor fades over to it): this gate and any shown before reveal.
   */
  veil() {
    this.veiled = true;
    if (this.element) {
      this.element.style.transition = 'none';
      this.element.style.opacity = '0';
    }
  }

  /**
   * The veil lifts (the editor's GO): a world that can play with sound wakes
   * at once, with no gate seen; otherwise the gate fades in, as at any
   * level start, and wakes as it always does (a resume that starts the
   * audio after all wakes it too).
   */
  reveal() {
    this.veiled = false;
    if (!this.visible || !this.wakeable) {
      if (this.element) this.element.style.opacity = '1';
      return;
    }
    const context = audioContextManager.getContext();
    if (context.state === 'running') {
      this.hide();
      return;
    }
    const scrim = this.element;
    scrim.style.transition = 'opacity 0.6s';
    scrim.style.opacity = '1';
    context.resume().then(
      () => {
        if (this.element === scrim && this.wakeable && context.state === 'running') this.hide();
      },
      () => {} // refused: a key or a click to come
    );
  }

  hide() {
    if (!this.visible) return;
    window.removeEventListener('keydown', this.dismissHandler, true);
    window.removeEventListener('keyup', this.dismissHandler, true);
    this.dismissHandler = null;
    this.visible = false;
    AudioPrewarm.hold(false);
    const el = this.element;
    this.element = null;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 600);
  }
}

export default StartGate;
